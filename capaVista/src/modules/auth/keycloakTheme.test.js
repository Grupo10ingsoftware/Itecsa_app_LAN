import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { initializeAuthForms, satisfiesRule } from '../../../../deploy/keycloak/themes/itecsa/login/resources/js/itecsa.js'
import { readFileSync } from 'node:fs'

afterEach(() => { document.body.innerHTML = '' })

function formFixture() {
  document.body.innerHTML = `<form data-auth-form data-password-update data-mismatch="Las contraseñas no coinciden" novalidate>
    <input id="password-new" name="password-new" type="password" required data-required-message="Ingresa tu nueva contraseña">
    <span id="password-new-error" hidden></span>
    <input id="password-confirm" name="password-confirm" type="password" required data-required-message="Confirma tu nueva contraseña">
    <span id="password-confirm-error" hidden></span>
    <button type="button" data-toggle-password aria-controls="password-new" data-label-show="Mostrar contraseña" data-label-hide="Ocultar contraseña"></button>
    <button name="login" type="submit" data-loading-label="Actualizando…">Actualizar contraseña</button>
    <button name="cancel-aia" type="submit" formnovalidate>Cancelar</button>
  </form><aside id="password-requirements">
    ${[['length', 8], ['upperCase', 1], ['lowerCase', 1], ['digits', 1], ['specialChars', 1]].map(([rule, count]) => `<li data-password-rule="${rule}" data-count="${count}"><span class="rule-status" data-satisfied="Cumplido" data-pending="Pendiente"></span></li>`).join('')}
    <p data-rules-summary data-summary-label="Requisitos cumplidos"></p>
  </aside>`
  initializeAuthForms()
  return { form: document.querySelector('form'), password: document.querySelector('#password-new'), confirmation: document.querySelector('#password-confirm') }
}

const submit = (form, submitter) => form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }))

describe('native Keycloak theme interactions', () => {
  it('comparte exactamente el CSS de React y ralentiza el giro con movimiento reducido', () => {
    const source = readFileSync('../shared/loading/indicator.css', 'utf8')
    const native = readFileSync('../deploy/keycloak/themes/itecsa/login/resources/css/loading.css', 'utf8')
    expect(native).toBe(source)
    expect(source).toContain('prefers-reduced-motion: reduce')
    expect(source).toContain('animation-duration: 3.2s')
    expect(source).not.toContain('animation: none')
  })
  it('restaura el submit nativo al regresar desde BFCache sin perder los controles POST', () => {
    const { form, password, confirmation } = formFixture()
    fireEvent.input(password, { target: { value: 'Abcdef1!' } })
    fireEvent.input(confirmation, { target: { value: 'Abcdef1!' } })
    const button = form.querySelector('[name=login]')
    expect(submit(form, button)).toBe(true)
    expect(form.querySelector('[role=status]').textContent).toBe('Cargando...')
    expect(submit(form, button)).toBe(false)
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(button.textContent).toBe('Actualizar contraseña')
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(form.hasAttribute('aria-busy')).toBe(false)
    expect(submit(form, button)).toBe(true)
    expect(new FormData(form, button).has('login')).toBe(true)
  })
  it.each([
    ['Abcdef1!', 'length', 8, true], ['Abc1!', 'length', 8, false],
    ['Á', 'upperCase', 1, true], ['ñ', 'lowerCase', 1, true], ['١', 'digits', 1, true],
    [' ', 'specialChars', 1, true], ['ñ', 'specialChars', 1, false],
    ['A', 'upperCase', 2, false], ['AA', 'upperCase', 2, true],
    ['', 'maxLength', 20, false], ['ab', 'maxLength', 1, false],
  ])('matches server character rules for %j, %s(%i)', (value, rule, count, expected) => {
    expect(satisfiesRule(value, rule, count)).toBe(expected)
  })

  it('updates and reverses indicators using only the new password', () => {
    const { password, confirmation } = formFixture()
    expect(document.querySelectorAll('[data-satisfied=true]').length).toBe(0)
    fireEvent.input(password, { target: { value: 'Abcdef1!' } })
    expect(document.querySelectorAll('[data-satisfied=true]').length).toBe(5)
    fireEvent.input(confirmation, { target: { value: 'x' } })
    expect(document.querySelectorAll('[data-satisfied=true]').length).toBe(5)
    expect(document.querySelector('#password-confirm-error').textContent).toBe('Las contraseñas no coinciden')
    fireEvent.input(password, { target: { value: '' } })
    expect(document.querySelectorAll('[data-satisfied=true]').length).toBe(0)
    expect(document.querySelector('#password-requirements').textContent).not.toContain('Abcdef1!')
  })

  it('blocks empty, weak and mismatched values while preserving native POST controls', () => {
    const { form, password, confirmation } = formFixture()
    const submitter = form.querySelector('[name=login]')
    expect(submit(form, submitter)).toBe(false)
    expect(document.activeElement).toBe(password)
    fireEvent.input(password, { target: { value: 'weak' } })
    fireEvent.input(confirmation, { target: { value: 'weak' } })
    expect(submit(form, submitter)).toBe(false)
    fireEvent.input(password, { target: { value: 'Abcdef1!' } })
    expect(submit(form, submitter)).toBe(false)
    fireEvent.input(confirmation, { target: { value: 'Abcdef1!' } })
    expect(submit(form, submitter)).toBe(true)
    expect(submitter.disabled).toBe(false)
    expect(form.getAttribute('aria-busy')).toBe('true')
    expect(new FormData(form).get('password-new')).toBe('Abcdef1!')
    expect(submit(form, submitter)).toBe(false)
  })

  it('lets Keycloak process application-initiated cancellation without local password validation', () => {
    const { form } = formFixture()
    expect(submit(form, form.querySelector('[name=cancel-aia]'))).toBe(true)
  })

  it('toggles visibility and accessible labels without submitting or changing the password', () => {
    const { password } = formFixture()
    initializeAuthForms() // Initialization must remain idempotent.
    const button = document.querySelector('[data-toggle-password]')
    fireEvent.click(button)
    expect(password.type).toBe('text')
    expect(button.getAttribute('aria-label')).toBe('Ocultar contraseña')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(password.type).toBe('password')
    expect(button.getAttribute('aria-label')).toBe('Mostrar contraseña')
  })
})
