import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import UserCreateForm from './UserCreateForm.jsx'
import PaymentCredentialsModal from '../../payments/components/PaymentCredentialsModal.jsx'
import { PAYMENT_STATUS } from '../../../config/status.js'
import UserCreateModal from './UserCreateModal.jsx'
import UserManagementPage from '../pages/UserManagementPage.jsx'
import { useState } from 'react'

const api = vi.hoisted(() => ({ createUser: vi.fn(), reconcile: vi.fn(), creationStatus: vi.fn(), listUsers: vi.fn() }))
vi.mock('../hooks/useAdminUsersApi', () => ({ useAdminUsersApi: () => api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { rolUsuario: 'Soporte' } }) }))

function fillForm() {
  for (const [label, value] of [['Nombre *', 'Jose'], ['Apellido *', 'Perez'],
    ['Correo electronico *', 'jose@example.com'], ['RUT *', '12.345.678-5'], ['Rol *', 'Operario Ventas']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
}

async function confirmPin() {
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar', exact: true }))
}

beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const toasts = () => document.querySelectorAll('[data-toast-viewport] article')

describe('creation outcomes and recovery', () => {
  for (const [code, text] of [
    ['IDENTITY_EMAIL_EXISTS', 'El correo electrónico ingresado ya está registrado en el sistema. Utiliza uno diferente'],
    ['IDENTITY_USERNAME_EXISTS', 'El nombre de usuario ya está en uso. Debes utilizar uno diferente'],
    ['IDENTITY_RUT_EXISTS', 'El RUT ingresado ya está registrado en el sistema. Verifica los datos de la persona.'],
  ]) {
    it(`shows one descriptive Toast and allows correction for ${code}`, async () => {
      api.createUser.mockRejectedValue({ status: 409, payload: { outcome: 'failed', code, operationId: 'reference', externalSubject: null, localUserId: null } })
      const onCreated = vi.fn()
      render(<UserCreateForm onCreated={onCreated} />)
      fillForm(); await confirmPin()
      expect((await screen.findByText(text)).closest('[data-toast-viewport]')).toBeTruthy()
      expect(screen.getAllByText(text)).toHaveLength(1)
      expect(toasts()).toHaveLength(1)
      expect(onCreated).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('PIN personal')).toBeNull()
      expect(screen.getByRole('button', { name: 'Crear usuario' }).disabled).toBe(false)
      fireEvent.change(screen.getByLabelText('Nombre de acceso *'), { target: { value: 'jose.perez2' } })
      expect(screen.getByLabelText('Nombre de acceso *').value).toBe('jose.perez2')
    })
  }

  it('retains reconciliation when a duplicate appears after identity creation', async () => {
    api.createUser.mockResolvedValue({ outcome: 'needs_reconciliation', code: 'IDENTITY_EMAIL_EXISTS', operationId: 'reference', externalSubject: 'partial' })
    api.reconcile.mockResolvedValue({ outcome: 'user_created', operationId: 'reference' })
    render(<UserCreateForm />)
    fillForm(); await confirmPin()
    const warning = await screen.findByText(/La preparación del usuario quedó incompleta/)
    expect(warning.closest('[data-toast-viewport]')).toBeTruthy()
    expect(toasts()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Crear usuario' }).disabled).toBe(true)
    expect(screen.getByText('Referencia de operación: reference')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Conciliar preparacion' }))
    await confirmPin()
    await waitFor(() => expect(api.reconcile).toHaveBeenCalledExactlyOnceWith({ operationId: 'reference', pin: '123456' }))
    expect(api.createUser).toHaveBeenCalledOnce()
  })

  it('blocks unknown network outcomes across modal reopening and checks status without repeating the write', async () => {
    api.createUser.mockRejectedValue({ code: 'NETWORK_ERROR' })
    api.creationStatus.mockResolvedValue({ outcome: 'needs_reconciliation', operationId: 'recovered-reference' })
    const view = render(<UserCreateModal isOpen onClose={vi.fn()} />)
    fillForm(); await confirmPin()
    expect((await screen.findByText(/No se pudo confirmar el resultado de la creación/)).closest('[data-toast-viewport]')).toBeTruthy()
    expect(toasts()).toHaveLength(1)
    view.rerender(<UserCreateModal isOpen={false} onClose={vi.fn()} />)
    view.rerender(<UserCreateModal isOpen onClose={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Crear usuario' })
    expect(submit.disabled).toBe(true)
    fireEvent.submit(submit.closest('form'))
    expect(api.createUser).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Verificar estado' }))
    await screen.findByText('Referencia de operación: recovered-reference')
    expect(api.creationStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ username: 'jo.perez', correoUsuario: 'jose@example.com' }))
    expect(screen.getByRole('button', { name: 'Conciliar preparacion' })).toBeTruthy()
    expect(api.createUser).toHaveBeenCalledOnce()
  })

  it.each(['running', 'pending', 'identity_prepared', 'unexpected'])('does not treat %s as successful or permit a second creation', async outcome => {
    api.createUser.mockResolvedValue({ outcome, operationId: 'reference' })
    render(<UserCreateForm />)
    fillForm(); await confirmPin()
    await screen.findByText('Referencia de operación: reference')
    expect(toasts()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Crear usuario' }).disabled).toBe(true)
    expect(screen.queryByLabelText('Contraseña inicial')).toBeNull()
  })

  it.each(['user_created', 'needs_reconciliation', 'failed'])('page and form emit one Toast with no duplicate general panels for %s', async outcome => {
    api.listUsers.mockResolvedValue({ usuarios: [], total: 0 })
    const result = { outcome, operationId: 'reference', code: outcome === 'failed' ? 'IDENTITY_EMAIL_EXISTS' : null }
    if (outcome === 'failed') api.createUser.mockRejectedValue({ status: 409, payload: result })
    else api.createUser.mockResolvedValue(result)
    render(<UserManagementPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Crear usuario' }))
    for (const [label, value] of [['Nombre *', 'Jose'], ['Apellido *', 'Perez'], ['Correo electronico *', 'jose@example.com'], ['RUT *', '12.345.678-5'], ['Rol *', 'Operario Ventas']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    const form = screen.getByLabelText('Nombre *').closest('form')
    fireEvent.submit(form); await confirmPin()
    await waitFor(() => expect(toasts()).toHaveLength(1))
    expect(document.querySelectorAll('[class*="messageBox"]')).toHaveLength(0)
    if (outcome === 'user_created') expect(screen.queryByRole('dialog')).toBeNull()
    else expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('user creation credentials', () => {
  it('validates fields before opening PIN modal or calling the API', () => {
    render(<UserCreateForm />)
    expect(screen.queryByLabelText('PIN personal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(screen.getByText('El RUT es obligatorio.')).toBeTruthy()
    expect(screen.getByText('El correo electronico es obligatorio.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.createUser).not.toHaveBeenCalled()
  })

  it('shows credential once, copies it, and removes it on acceptance without passing it to callbacks', async () => {
    const temporaryPassword = 'ExamplePassword1!'
    api.createUser.mockResolvedValue({ outcome: 'user_created', operationId: 'operation', temporaryPassword, mustChangePassword: true })
    const onCreated = vi.fn()
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const view = render(<UserCreateForm onCreated={onCreated} />)
    fillForm()
    expect(screen.getByLabelText('Nombre de acceso *').value).toBe('jo.perez')
    expect(api.createUser).not.toHaveBeenCalled()
    await confirmPin()
    const password = await screen.findByLabelText('Contraseña inicial')
    expect(password.type).toBe('password')
    expect(password.value).toBe(temporaryPassword)
    expect(onCreated).not.toHaveBeenCalled()
    expect(api.createUser).toHaveBeenCalledWith(expect.objectContaining({ pin: '123456', rutUsuario: '12.345.678-5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }))
    expect(password.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(temporaryPassword))
    expect(screen.getByText('En caso de olvidar la contraseña, se debe crear una credencial temporal a través de Keycloak')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    expect(screen.queryByLabelText('Contraseña inicial')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onCreated).toHaveBeenCalledWith({ outcome: 'user_created', operationId: 'operation', mustChangePassword: true })
    expect(storage).not.toHaveBeenCalled()
    view.unmount()
    render(<UserCreateForm />)
    expect(screen.queryByDisplayValue(temporaryPassword)).toBeNull()
  })

  for (const [code, message] of [['PIN_INVALID', 'El PIN ingresado no es valido.'], ['PIN_LOCKED', 'El PIN esta temporalmente bloqueado.']]) {
    it(`keeps the PIN modal open and clears the PIN for ${code}`, async () => {
      api.createUser.mockRejectedValue({ status: code === 'PIN_LOCKED' ? 423 : 403, payload: { code, message } })
      render(<UserCreateForm />)
      fillForm()
      await confirmPin()
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', message)
      expect(screen.getByLabelText('PIN personal').value).toBe('')
      expect(screen.queryByLabelText('Contraseña inicial')).toBeNull()
    })
  }

  it('does not show credentials for incomplete creation', async () => {
    api.createUser.mockResolvedValue({ outcome: 'needs_reconciliation', operationId: 'operation' })
    render(<UserCreateForm />)
    fillForm()
    await confirmPin()
    expect((await screen.findByText(/La preparación del usuario quedó incompleta/)).closest('[data-toast-viewport]')).toBeTruthy()
    expect(screen.queryByLabelText('Contraseña inicial')).toBeNull()
    expect(screen.getByRole('button', { name: 'Conciliar preparacion' })).toBeTruthy()
  })

  it('keeps the enclosing modal locked until the credential is accepted', async () => {
    api.createUser.mockResolvedValue({ outcome: 'user_created', temporaryPassword: 'ExamplePassword1!', mustChangePassword: true })
    function Harness() {
      const [open, setOpen] = useState(true)
      return <UserCreateModal isOpen={open} onClose={() => setOpen(false)} onCreated={() => setOpen(false)} />
    }
    render(<Harness />)
    fillForm()
    expect(screen.getByRole('button', { name: 'Cerrar modal de creacion', hidden: true }).disabled).toBe(true)
    await confirmPin()
    await screen.findByLabelText('Contraseña inicial')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByLabelText('Contraseña inicial')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByDisplayValue('ExamplePassword1!')).toBeNull()
  })
})

describe('existing payments PIN behavior', () => {
  it('requires a reason for changing an already confirmed payment and sends the same payload', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<PaymentCredentialsModal order={{ nvNumber: 'NV-1', paymentStatus: PAYMENT_STATUS.CONFIRMADO }}
      targetStatus={PAYMENT_STATUS.RECHAZADO} onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
    expect(screen.getByRole('button', { name: 'Confirmar' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Motivo del cambio'), { target: { value: ' Corregir pago ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ pin: '123456', comment: 'Corregir pago' }))
    expect(screen.getByLabelText('PIN personal').value).toBe('')
  })

  it('does not require a reason for the first payment confirmation', () => {
    render(<PaymentCredentialsModal order={{ nvNumber: 'NV-2', paymentStatus: PAYMENT_STATUS.PENDIENTE }}
      targetStatus={PAYMENT_STATUS.CONFIRMADO} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByLabelText('Motivo del cambio')).toBeNull()
    fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
    expect(screen.getByRole('button', { name: 'Confirmar' }).disabled).toBe(false)
  })
})
