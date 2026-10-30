import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import PaymentCredentialsModal from './PaymentCredentialsModal'
import PaymentActionConfirmModal from './PaymentActionConfirmModal'
import { mergePaymentPreview, normalizePaymentOrder } from '../utils/paymentOrders'

afterEach(cleanup)
const order = { id: 1, nvNumber: 'SYNTH-001', paymentStatus: 'Confirmado', companyName: 'Synthetic', rut: 'Synthetic',
  trackedProducts: [{ id: 1, product: 'Synthetic product', code: 'TEST', quantity: 0, productType: 'Tarjeta' }] }
it('revision PIN dialog requires a reason, clears PIN after submitting and preserves server errors', async () => {
  const onConfirm = vi.fn().mockResolvedValue(false)
  const props = { order, targetStatus: 'Rechazado', onConfirm, onCancel: vi.fn() }
  const view = render(<PaymentCredentialsModal {...props} />)
  const pin = screen.getByLabelText('PIN personal')
  await waitFor(() => expect(document.activeElement).toBe(pin))
  fireEvent.change(pin, { target: { value: '123456' } })
  const reason = screen.getByLabelText('Motivo del cambio')
  expect(reason.required).toBe(true); expect(reason.maxLength).toBe(2000)
  fireEvent.change(reason, { target: { value: ' Synthetic reason ' } })
  fireEvent.submit(screen.getByRole('dialog'))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ pin: '123456', comment: 'Synthetic reason' }))
  expect(pin.value).toBe('')
  view.rerender(<PaymentCredentialsModal {...props} errorMessage="PIN bloqueado." />)
  expect(screen.getByText('PIN bloqueado.').getAttribute('role')).toBe('alert')
})
it('action dialog keeps full product information and prevents PIN progression while loading or errored', () => {
  const props = { order, targetStatus: 'Rechazado', onCancel: vi.fn(), onValidate: vi.fn() }
  const view = render(<PaymentActionConfirmModal {...props} isLoadingDetails />)
  const dialog = screen.getByRole('dialog')
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  const action = dialog.querySelector('footer button:last-child')
  expect(action.disabled).toBe(true)
  view.rerender(<PaymentActionConfirmModal {...props} detailsError="Lectura no disponible" />)
  expect(action.disabled).toBe(true)
  view.rerender(<PaymentActionConfirmModal {...props} />)
  expect(screen.getByText('Synthetic product')).toBeTruthy(); expect(screen.getByText('0')).toBeTruthy()
  expect(action.disabled).toBe(false)
  fireEvent.click(action); expect(props.onValidate).toHaveBeenCalledTimes(1)
})

it('displays the actual preview seller name and keeps the legacy email fallback', () => {
  const merged = mergePaymentPreview(normalizePaymentOrder({ id: 1 }), { sellerName: ' Vendedor Ficticio ' })
  const view = render(<PaymentActionConfirmModal mode="detail" order={merged} onCancel={vi.fn()} />)
  expect(screen.getByText('Vendedor Ficticio')).toBeTruthy()
  view.rerender(<PaymentActionConfirmModal mode="detail" order={{ ...merged, sellerName: null, sellerEmail: 'ficticio@example.invalid' }} onCancel={vi.fn()} />)
  expect(screen.getByText('ficticio@example.invalid')).toBeTruthy()
})
