import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeAuthForms, satisfiesRule } from './themes/itecsa/login/resources/js/itecsa.js';

function element(initial = {}) {
  const attributes = new Map();
  const handlers = new Map();
  return {
    dataset: {}, ...initial,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
    addEventListener(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    dispatch(name, detail = {}) {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...detail };
      for (const handler of handlers.get(name) ?? []) handler(event);
      return event;
    },
    focus() { this.focused = true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}
function formFixture({ passwordUpdate = false, valid = true } = {}) {
  const button = element({ innerHTML: passwordUpdate ? 'Actualizar contraseña' : 'Iniciar sesión', name: 'login', value: 'continuar', disabled: false });
  const window = element();
  const username = element({ id: 'username', name: 'username', type: 'text', value: 'usuario.fixture', dataset: { requiredMessage: 'Ingresa tu nombre' } });
  const password = element({ id: passwordUpdate ? 'password-new' : 'password', type: 'password', value: valid ? 'Password1!' : '', dataset: { requiredMessage: 'Ingresa contraseña' } });
  const confirmation = element({ id: 'password-confirm', type: 'password', value: password.value, dataset: { requiredMessage: 'Confirma contraseña' } });
  const inputs = passwordUpdate ? [password, confirmation] : [username, password];
  const errors = new Map(inputs.map(input => [input.id + '-error', element()]));
  const ruleNames = ['length', 'upperCase', 'lowerCase', 'digits', 'specialChars'];
  const rules = ruleNames.map(rule => element({ dataset: { passwordRule: rule, count: rule === 'length' ? '8' : '1' } }));
  const form = element({ dataset: { mismatch: 'Las contraseñas no coinciden' } });
  form.querySelectorAll = selector => selector === '[type=submit]' ? [button] : selector === 'input[required]' ? inputs : [];
  form.querySelector = selector => selector === '#password-new' ? (passwordUpdate ? password : null)
    : selector === '#password-confirm' ? (passwordUpdate ? confirmation : null) : errors.get(selector.slice(1)) ?? null;
  const root = { defaultView: window,
    querySelectorAll: selector => selector === 'form[data-auth-form]' ? [form] : selector === '[data-password-rule]' ? rules : [],
    querySelector: () => null,
  };
  initializeAuthForms(root);
  return { root, form, button, window, password, confirmation, username, errors };
}

test('successful submission retains native POST and named successful controls, rejects duplicates and restores BFCache', () => {
  const { root, form, button, window } = formFixture();
  const original = button.innerHTML;
  initializeAuthForms(root); // Binding twice must not create a second submit handler.
  assert.equal(form.dispatch('submit', { submitter: button }).defaultPrevented, false);
  assert.equal(form.getAttribute('aria-busy'), 'true');
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  assert.equal(button.disabled, false, 'native successful controls must remain enabled');
  assert.equal(button.name, 'login');
  assert.equal(button.value, 'continuar');
  assert.match(button.innerHTML, /class="itecsa-loading__ring" width="16" height="16"/);
  assert.equal(form.dispatch('submit', { submitter: button }).defaultPrevented, true);
  window.dispatch('pageshow', { persisted: true });
  assert.equal(form.getAttribute('aria-busy'), null);
  assert.equal(button.getAttribute('aria-disabled'), null);
  assert.equal(button.innerHTML, original);
  assert.equal(form.dispatch('submit', { submitter: button }).defaultPrevented, false);
});

test('missing credentials remain editable and do not start the progress indicator', () => {
  const { form, password, button } = formFixture({ valid: false });
  assert.equal(form.dispatch('submit', { submitter: button }).defaultPrevented, true);
  assert.equal(password.focused, true);
  assert.equal(form.getAttribute('aria-busy'), null);
  assert.equal(button.innerHTML, 'Iniciar sesión');
});

test('password mismatch blocks the POST, then valid confirmation permits native server validation', () => {
  const { form, password, confirmation, button, errors } = formFixture({ passwordUpdate: true });
  confirmation.value = 'OtraPassword1!';
  assert.equal(form.dispatch('submit', { submitter: button }).defaultPrevented, true);
  assert.equal(errors.get('password-confirm-error').textContent, 'Las contraseñas no coinciden');
  assert.equal(form.getAttribute('aria-busy'), null);
  confirmation.value = password.value;
  assert.equal(form.dispatch('submit', { submitter: button }).defaultPrevented, false);
  assert.equal(form.getAttribute('aria-busy'), 'true');
});

test('application initiated action cancellation remains a native submission', () => {
  const { form } = formFixture({ passwordUpdate: true, valid: false });
  assert.equal(form.dispatch('submit', { submitter: { name: 'cancel-aia' } }).defaultPrevented, false);
  assert.equal(form.getAttribute('aria-busy'), null);
});

for (const [rule, passing, failing, count] of [
  ['length', '12345678', '1234567', 8], ['maxLength', '12345678', '123456789', 8],
  ['upperCase', 'ÁB', 'Ab', 2], ['lowerCase', 'áb', 'Áb', 2],
  ['digits', '12', '1x', 2], ['specialChars', '!@', '!x', 2],
]) {
  test(`${rule} tracks the declared count without changing the server password policy`, () => {
    assert.equal(satisfiesRule(passing, rule, count), true);
    assert.equal(satisfiesRule(failing, rule, count), false);
    assert.equal(satisfiesRule('', rule, count), false);
    assert.equal(satisfiesRule(passing, rule, 0), false);
  });
}
