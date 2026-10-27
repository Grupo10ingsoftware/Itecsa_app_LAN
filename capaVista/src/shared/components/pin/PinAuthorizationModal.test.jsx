import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { afterEach, expect, it, vi } from 'vitest'
import PinAuthorizationModal from './PinAuthorizationModal'
import { AuthContext } from '../../../app/providers/authContext'
import { PaymentDeconfirmationModal } from '../../../modules/kanban/components/PaymentDeconfirmationModal'

afterEach(cleanup)
const enter = value => fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value } })
const submit = () => fireEvent.submit(screen.getByRole('dialog'))
it('sanitizes six digits and clears every attempt, including invalid format', async () => {
  const confirm = vi.fn()
  render(<PinAuthorizationModal onConfirm={confirm} onCancel={vi.fn()} />)
  enter('a12x'); submit()
  expect(confirm).not.toHaveBeenCalled()
  expect(screen.getByLabelText('PIN personal').value).toBe('')
  expect(screen.getByRole('alert')).toBeTruthy()
  enter('a123456789'); submit()
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ pin: '123456', comment: '' }))
  expect(screen.getByLabelText('PIN personal').value).toBe('')
})
it('blocks duplicate submissions and closing while pending; reports errors without the PIN', async () => {
  let reject
  const confirm = vi.fn(() => new Promise((_, no) => { reject = no })), cancel = vi.fn()
  render(<PinAuthorizationModal onConfirm={confirm} onCancel={cancel} />)
  enter('123456'); submit(); submit()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(confirm).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled()
  expect(screen.getByLabelText('PIN personal').disabled).toBe(true)
  await act(async () => reject({ payload: { message: 'PIN bloqueado' } }))
  expect(screen.getByRole('alert').textContent).toBe('PIN bloqueado')
  expect(screen.getByLabelText('PIN personal').value).toBe('')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(cancel).toHaveBeenCalledOnce()
})
it('requires configured observation and preserves its real limit', async () => {
  const confirm = vi.fn()
  render(<PinAuthorizationModal observation={{ required: true, maxLength: 2000 }} onConfirm={confirm} />)
  enter('123456'); submit()
  expect(confirm).not.toHaveBeenCalled()
  expect(screen.getByLabelText('PIN personal').value).toBe('')
  const comment = screen.getByRole('textbox')
  expect(comment.maxLength).toBe(2000)
  fireEvent.change(comment, { target: { value: ' Motivo ' } }); enter('123456'); submit()
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ pin: '123456', comment: 'Motivo' }))
})
it('resets context and ignores a late rejection from a previous operation', async () => {
  let reject
  const confirm = vi.fn(() => new Promise((_, no) => { reject = no }))
  const view = render(<PinAuthorizationModal contextKey="order-1" onConfirm={confirm} />)
  enter('123456'); submit()
  view.rerender(<PinAuthorizationModal contextKey="order-2" onConfirm={confirm} />)
  enter('654321')
  await act(async () => reject(Error('old')))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('PIN personal').value).toBe('654321')
})
it('clears on actor changes and on cancel even if the consumer leaves it mounted', () => {
  const view = render(<AuthContext.Provider value={{ user: { sub: 'one' } }}><PinAuthorizationModal /></AuthContext.Provider>)
  enter('123456')
  view.rerender(<AuthContext.Provider value={{ user: { sub: 'two' } }}><PinAuthorizationModal /></AuthContext.Provider>)
  expect(screen.getByLabelText('PIN personal').value).toBe('')
  enter('123456'); fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByLabelText('PIN personal').value).toBe('')
})
it('P4 preserves its PIN-only callback', async () => {
  const confirm = vi.fn()
  render(<PaymentDeconfirmationModal order={{ id: 1, salesNoteNumber: 'NV-1' }} approvePaymentDeconfirmation={confirm} closeDeconfirmationAuthModal={vi.fn()} />)
  enter('123456'); submit()
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ pin: '123456' }))
})
it('general business failures emit one global toast and do not invalidate the PIN field', async () => {
  render(<PinAuthorizationModal onConfirm={vi.fn().mockRejectedValue({ status: 409, payload: { message: 'El pedido no cumple las condiciones para avanzar.' } })} />)
  enter('123456'); submit()
  const message = await screen.findByText('El pedido no cumple las condiciones para avanzar.')
  expect(message.closest('[data-toast-viewport]')).toBeTruthy()
  expect(screen.getAllByText('El pedido no cumple las condiciones para avanzar.')).toHaveLength(1)
  expect(screen.getByLabelText('PIN personal').getAttribute('aria-invalid')).toBe('false')
})
it('an uncertain write keeps a persistent form instruction without calling the PIN invalid', async () => {
  render(<PinAuthorizationModal onConfirm={vi.fn().mockRejectedValue({ code: 'NETWORK_ERROR' })} />)
  enter('123456'); submit()
  const message = await screen.findByText(/Comprueba el resultado antes de repetir/)
  expect(message.closest('[role="dialog"]')).toBeTruthy()
  expect(document.querySelector('[data-toast-viewport] article')).toBeNull()
  expect(screen.getByLabelText('PIN personal').getAttribute('aria-invalid')).toBe('false')
})
