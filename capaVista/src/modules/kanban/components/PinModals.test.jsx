import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import { afterEach, expect, it, vi } from 'vitest'
import { SubprocessAuthModal } from './SubprocessAuthModal'
import { MoveToProductionModal } from './MoveToProductionModal'
import { CancelProductionModal } from './CancelProductionModal'

afterEach(cleanup)
it('P3 requires a cancellation reason and preserves the payload', async () => {
  const confirm = vi.fn()
  render(<CancelProductionModal submitCancellation={confirm} setIsCancelModalOpen={vi.fn()} />)
  const pin = screen.getByLabelText('PIN personal'), comment = screen.getByRole('textbox')
  expect(comment.maxLength).toBe(2000)
  fireEvent.change(pin, { target: { value: '123456' } }); fireEvent.submit(screen.getByRole('dialog'))
  expect(confirm).not.toHaveBeenCalled()
  expect(pin.value).toBe('')
  fireEvent.change(comment, { target: { value: ' Cancelar pedido ' } })
  fireEvent.change(pin, { target: { value: '123456' } }); fireEvent.submit(screen.getByRole('dialog'))
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ pin: '123456', comment: 'Cancelar pedido' }))
})
it('P2 keeps optional comment and clears PIN when hidden and reopened', async () => {
  const confirm = vi.fn()
  const props = { order: { id: 1, salesNoteNumber: 'NV-1' }, onConfirm: confirm, onClose: vi.fn() }
  const view = render(<MoveToProductionModal {...props} isOpen />)
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  fireEvent.submit(screen.getByRole('dialog'))
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ pin: '123456', comment: '' }))
  fireEvent.change(screen.getByLabelText('PIN personal'), { target: { value: '123456' } })
  view.rerender(<MoveToProductionModal {...props} isOpen={false} />)
  view.rerender(<MoveToProductionModal {...props} isOpen />)
  expect(screen.getByLabelText('PIN personal').value).toBe('')
})
it.each(['complete', 'rollback'])('P1 preserves %s observation requirements and callback', async action => {
  const confirm = vi.fn()
  render(<SubprocessAuthModal authModal={{ action, item: { id: 1 }, process: { id: 2, name: 'Corte' } }} completeSubProcess={confirm} closeAuthModal={vi.fn()} />)
  const pin = screen.getByLabelText('PIN personal'), comment = screen.getByRole('textbox')
  fireEvent.change(pin, { target: { value: '123456' } })
  fireEvent.submit(screen.getByRole('dialog'))
  if (action === 'rollback') {
    expect(confirm).not.toHaveBeenCalled()
    expect(comment.maxLength).toBe(2000)
    expect(pin.value).toBe('')
    fireEvent.change(comment, { target: { value: ' Motivo ' } })
    fireEvent.change(pin, { target: { value: '123456' } })
    fireEvent.submit(screen.getByRole('dialog'))
  }
  await waitFor(() => expect(confirm).toHaveBeenCalledWith({ pin: '123456', comment: action === 'rollback' ? 'Motivo' : '' }))
})
