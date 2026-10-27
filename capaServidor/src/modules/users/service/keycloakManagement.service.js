import { resolveKeycloakAdministration } from '../../../config/keycloakAdministration.js';
import { ASSIGNABLE_ROLES } from '../../../../../shared/keycloakAuthorization.js';

export class KeycloakServiceError extends Error {
  constructor(code, { category = 'invalid_response', status = 503, ambiguous = false } = {}) {
    super('La operacion administrativa Keycloak no pudo confirmarse.');
    this.name = 'KeycloakServiceError';
    Object.assign(this, { code, category, status, ambiguous });
  }
}
const invalid = () => { throw new KeycloakServiceError('KEYCLOAK_INVALID_INPUT', { category: 'validation', status: 400 }); };
const segment = value => {
  if (typeof value !== 'string' || !value || value.length > 255 || /[\\/?#%\s\u0000-\u001f]/u.test(value) || ['.', '..'].includes(value)) invalid();
  return encodeURIComponent(value);
};
const ordinary = role => { if (!ASSIGNABLE_ROLES.includes(role)) throw new KeycloakServiceError('KEYCLOAK_ROLE_FORBIDDEN', { category: 'authorization', status: 403 }); };
const validText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u001f]/u.test(value);

// Mutations are not retried; credentials never appear in errors.
export class KeycloakManagementService {
  constructor({ env = process.env, fetcher = fetch, clock = Date.now } = {}) {
    this.config = resolveKeycloakAdministration(env);
    this.fetcher = fetcher;
    this.clock = clock;
  }

  async transport(url, { method = 'GET', token, body, form = false, expected = [200] } = {}) {
    const mutation = method !== 'GET' && !form;
    try {
      const response = await this.fetcher(url, { method, redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: { accept: 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}),
          ...(body === undefined ? {} : { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }) },
        ...(body === undefined ? {} : { body: form ? new URLSearchParams(body) : JSON.stringify(body) }) });
      if (!expected.includes(response.status)) {
        await response.body?.cancel();
        const category = response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found'
          : [401, 403].includes(response.status) ? 'authorization' : response.status === 400 ? 'validation' : 'upstream';
        const code = { conflict: 'KEYCLOAK_USER_EXISTS', not_found: 'KEYCLOAK_USER_NOT_FOUND',
          authorization: 'KEYCLOAK_INSUFFICIENT_SCOPE', validation: 'KEYCLOAK_REQUEST_REJECTED', upstream: 'KEYCLOAK_UPSTREAM_ERROR' }[category];
        if (response.status === 401) this.cachedToken = undefined;
        throw new KeycloakServiceError(code, { category, status: category === 'conflict' ? 409 : category === 'not_found' ? 404 : 503,
          ambiguous: mutation && response.status >= 500 });
      }
      if (response.status === 204) return { response };
      let raw = '';
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder(); let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 262144) { await reader.cancel(); throw new KeycloakServiceError('KEYCLOAK_INVALID_RESPONSE', { ambiguous: mutation }); }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      }
      let data;
      try { data = raw ? JSON.parse(raw) : undefined; } catch { throw new KeycloakServiceError('KEYCLOAK_INVALID_RESPONSE', { ambiguous: mutation }); }
      return { response, data };
    } catch (error) {
      if (error instanceof KeycloakServiceError) throw error;
      throw new KeycloakServiceError(['TimeoutError', 'AbortError'].includes(error?.name) ? 'KEYCLOAK_TIMEOUT' : 'KEYCLOAK_NETWORK_ERROR',
        { category: ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network', ambiguous: mutation });
    }
  }

  async token() {
    if (this.cachedToken?.expires > this.clock()) return this.cachedToken.value;
    if (!this.tokenFlight) this.tokenFlight = (async () => {
      const { data } = await this.transport(this.config.tokenUrl, { method: 'POST', form: true,
        body: { grant_type: 'client_credentials', client_id: this.config.clientId, client_secret: this.config.clientSecret } });
      if (typeof data?.access_token !== 'string' || !data.access_token || data.token_type?.toLowerCase() !== 'bearer'
        || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new KeycloakServiceError('KEYCLOAK_INVALID_TOKEN_RESPONSE');
      this.cachedToken = { value: data.access_token, expires: this.clock() + Math.max(0, Math.min(data.expires_in, 3600) - 5) * 1000 };
      return data.access_token;
    })().finally(() => { this.tokenFlight = undefined; });
    return this.tokenFlight;
  }

  async request(path, options) {
    return this.transport(this.config.adminUrl + path, { ...options, token: await this.token() });
  }

  async listUsers({ username, first = 0, max = 50 } = {}) {
    if (!Number.isInteger(first) || first < 0 || !Number.isInteger(max) || max < 1 || max > 100
      || (username !== undefined && !validText(username, 255))) invalid();
    const query = new URLSearchParams({ first, max, briefRepresentation: false,
      ...(username === undefined ? {} : { username, exact: true }) });
    const { data } = await this.request('/users?' + query);
    if (!Array.isArray(data) || data.length > max || data.some(user => !validText(user?.id, 128) || !validText(user?.username, 255))) {
      throw new KeycloakServiceError('KEYCLOAK_INVALID_RESPONSE');
    }
    return data;
  }

  async findByUsername(username) {
    const matches = (await this.listUsers({ username, max: 2 })).filter(user => user.username.toLowerCase() === username.toLowerCase());
    if (matches.length > 1) throw new KeycloakServiceError('KEYCLOAK_IDENTITY_CONFLICT', { status: 409 });
    return matches[0] ?? null;
  }

  async getUser(subject) {
    const { data } = await this.request('/users/' + segment(subject));
    if (data?.id !== subject || !validText(data.username, 255) || typeof data.enabled !== 'boolean') throw new KeycloakServiceError('KEYCLOAK_INVALID_RESPONSE');
    return data;
  }

  async createDisabled({ username, email = null, firstName, lastName, operationId }) {
    if (!validText(username, 255) || (email !== null && (!validText(email, 255) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
      || !validText(firstName, 100) || !validText(lastName, 100) || !/^[0-9a-f-]{36}$/i.test(operationId ?? '')) invalid();
    const { response } = await this.request('/users', { method: 'POST', expected: [201], body: {
      username, ...(email === null ? {} : { email }), firstName, lastName, enabled: false, emailVerified: false,
      attributes: { itecsa_provision_id: [operationId] },
    } });
    const location = response.headers.get('location');
    if (!location || !location.startsWith(this.config.adminUrl + '/users/')) throw new KeycloakServiceError('KEYCLOAK_INVALID_LOCATION', { ambiguous: true });
    const subject = location.slice((this.config.adminUrl + '/users/').length);
    try { segment(subject); } catch { throw new KeycloakServiceError('KEYCLOAK_INVALID_LOCATION', { ambiguous: true }); }
    return subject;
  }

  async updateAttributes(subject, values) {
    if (!values || Object.keys(values).some(key => !['firstName', 'lastName', 'email'].includes(key)) || !Object.keys(values).length) invalid();
    for (const key of ['firstName', 'lastName']) if (key in values && !validText(values[key], 100)) invalid();
    if ('email' in values && values.email !== null && (!validText(values.email, 255) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))) invalid();
    await this.request('/users/' + segment(subject), { method: 'PUT', expected: [204],
      body: { ...values, ...('email' in values ? { email: values.email ?? '', emailVerified: false } : {}) } });
  }

  async setEnabled(subject, enabled) {
    if (typeof enabled !== 'boolean') invalid();
    await this.request('/users/' + segment(subject), { method: 'PUT', body: { enabled }, expected: [204] });
  }

  async setTemporaryPassword(subject, password) {
    if (!validText(password, 255)) invalid();
    await this.request('/users/' + segment(subject) + '/reset-password', {
      method: 'PUT', expected: [204], body: { type: 'password', value: password, temporary: true },
    });
  }

  async hasTemporaryPassword(subject) {
    const user = await this.getUser(subject);
    const { data } = await this.request('/users/' + segment(subject) + '/credentials');
    return Array.isArray(data) && data.some(credential => credential.type === 'password')
      && user.requiredActions?.includes('UPDATE_PASSWORD') === true;
  }

  async logout(subject) {
    await this.request('/users/' + segment(subject) + '/logout', { method: 'POST', expected: [204] });
  }

  async roleClient() {
    if (this.clientUuid) return this.clientUuid;
    const { data } = await this.request('/clients?' + new URLSearchParams({ clientId: this.config.roleClientId }));
    const clients = Array.isArray(data) ? data.filter(client => client.clientId === this.config.roleClientId) : [];
    if (clients.length !== 1 || !validText(clients[0].id, 128)) throw new KeycloakServiceError('KEYCLOAK_ROLE_CLIENT_INVALID');
    this.clientUuid = segment(clients[0].id);
    return this.clientUuid;
  }

  async roles(subject, { effective = true } = {}) {
    const client = await this.roleClient();
    const { data } = await this.request('/users/' + segment(subject) + '/role-mappings/clients/' + client + (effective ? '/composite' : ''));
    if (!Array.isArray(data) || data.some(role => !validText(role?.name, 255) || !validText(role?.id, 128))) throw new KeycloakServiceError('KEYCLOAK_INVALID_RESPONSE');
    return data;
  }

  async roleRepresentation(role) {
    ordinary(role);
    const { data } = await this.request('/clients/' + await this.roleClient() + '/roles/' + encodeURIComponent(role));
    if (data?.name !== role || !validText(data.id, 128)) throw new KeycloakServiceError('KEYCLOAK_ROLE_INVALID');
    return { id: data.id, name: data.name };
  }

  async replaceRole(subject, role) {
    ordinary(role);
    if ((await this.getUser(subject)).enabled) throw new KeycloakServiceError('KEYCLOAK_ROLE_CHANGE_REQUIRES_DISABLED', { status: 409 });
    const effective = await this.roles(subject);
    if (effective.length > 1 || effective.some(value => !ASSIGNABLE_ROLES.includes(value.name))) throw new KeycloakServiceError('KEYCLOAK_TARGET_FORBIDDEN', { status: 403 });
    const direct = await this.roles(subject, { effective: false });
    if (direct.some(value => !ASSIGNABLE_ROLES.includes(value.name))) throw new KeycloakServiceError('KEYCLOAK_TARGET_FORBIDDEN', { status: 403 });
    const path = '/users/' + segment(subject) + '/role-mappings/clients/' + await this.roleClient();
    const target = await this.roleRepresentation(role);
    if (direct.length) await this.request(path, { method: 'DELETE', expected: [204], body: direct.map(value => ({ id: value.id, name: value.name })) });
    await this.request(path, { method: 'POST', expected: [204], body: [target] });
    const verified = await this.roles(subject);
    if (verified.length !== 1 || verified[0].name !== role) throw new KeycloakServiceError('KEYCLOAK_ROLE_NOT_CONFIRMED', { ambiguous: true });
  }

  async removeRole(subject, role) {
    ordinary(role);
    if ((await this.getUser(subject)).enabled) throw new KeycloakServiceError('KEYCLOAK_ROLE_CHANGE_REQUIRES_DISABLED', { status: 409 });
    if ((await this.roles(subject)).some(value => !ASSIGNABLE_ROLES.includes(value.name))) throw new KeycloakServiceError('KEYCLOAK_TARGET_FORBIDDEN', { status: 403 });
    await this.request('/users/' + segment(subject) + '/role-mappings/clients/' + await this.roleClient(),
      { method: 'DELETE', expected: [204], body: [await this.roleRepresentation(role)] });
    if ((await this.roles(subject)).some(value => value.name === role)) throw new KeycloakServiceError('KEYCLOAK_ROLE_NOT_CONFIRMED', { ambiguous: true });
  }
}
