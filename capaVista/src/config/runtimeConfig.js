export function resolveRuntimeConfig(runtime = {}, vite = {}) {
  const config = {
    authProvider: runtime.authProvider ?? vite.VITE_AUTH_PROVIDER ?? 'keycloak',
    keycloakUrl: runtime.keycloakUrl ?? vite.VITE_KEYCLOAK_URL,
    keycloakRealm: runtime.keycloakRealm ?? vite.VITE_KEYCLOAK_REALM,
    keycloakClientId: runtime.keycloakClientId ?? vite.VITE_KEYCLOAK_CLIENT_ID,
    keycloakAudience: runtime.keycloakAudience ?? vite.VITE_KEYCLOAK_AUDIENCE,
    kanbanRefreshMs: runtime.kanbanRefreshMs ?? vite.VITE_KANBAN_REFRESH_MS ?? '30000',
    apiBaseUrl: runtime.apiBaseUrl ?? vite.VITE_API_BASE_URL,
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : '']),
  ))
}

export function validateIdentityConfig(config) {
  if (config.authProvider !== 'keycloak') throw Error('Proveedor de autenticacion no valido.')
  const required = ['keycloakUrl', 'keycloakRealm', 'keycloakClientId', 'keycloakAudience']
  if (required.some(key => !config[key])) throw Error('La configuracion de autenticacion esta incompleta.')
  const url = new URL(config.keycloakUrl)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !/^[A-Za-z0-9_-]+$/.test(config.keycloakRealm) || config.keycloakAudience === config.keycloakClientId) {
    throw Error('La configuracion Keycloak no es valida.')
  }
  return config
}

export function validateBrowserIdentityConfig(config, browser) {
  validateIdentityConfig(config)
  if (!browser.isSecureContext || !browser.crypto?.subtle) throw Error('Keycloak con PKCE requiere HTTPS o localhost. HTTP desde una IP LAN no es un contexto seguro.')
  if (browser.location.protocol === 'https:' && (new URL(config.keycloakUrl).protocol !== 'https:'
    || (config.apiBaseUrl && new URL(config.apiBaseUrl).protocol !== 'https:'))) {
    throw Error('La aplicacion HTTPS requiere Keycloak y API HTTPS para evitar contenido mixto.')
  }
  return config
}

export const runtimeConfig = resolveRuntimeConfig(
  typeof window === 'undefined' ? {} : window.__ITECSA_CONFIG__,
  import.meta.env ?? {},
)
