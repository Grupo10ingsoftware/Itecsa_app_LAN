import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import UserCreateForm from './UserCreateForm.jsx'
import PaymentCredentialsModal from '../../payments/components/PaymentCredentialsModal.jsx'
import { PAYMENT_STATUS } from '../../../config/status.js'
import UserCreateModal from './UserCreateModal.jsx'
import { useState } from 'react'

const api = vi.hoisted(() => ({ createUser: vi.fn(), reconcile: vi.fn() }))
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
    expect(await screen.findByText(/Creación incompleta/)).toBeTruthy()
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
