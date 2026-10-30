import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from '../../../test/renderWithToast'
import PendingPinModal from './PendingPinModal'

afterEach(cleanup)
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const fixture = () => ({ api: { revealPin: vi.fn().mockResolvedValue({ pin: '314159' }), acknowledgePin: vi.fn().mockResolvedValue(null) },
  refreshSession: vi.fn().mockResolvedValue({ pinStatus: 'active' }), onAcknowledged: vi.fn() })

it('StrictMode sends one reveal and keeps secret out of browser storage', async () => {
  const f = fixture(), local = vi.spyOn(Storage.prototype, 'setItem')
  const view = render(<StrictMode><PendingPinModal {...f} /></StrictMode>)
  await screen.findByText('314159'); expect(f.api.revealPin).toHaveBeenCalledOnce()
  expect(local).not.toHaveBeenCalled(); view.unmount(); expect(screen.queryByText('314159')).toBeNull(); local.mockRestore()
})
it('double acknowledgement is single-flight, clears the secret only after persistence, and still verifies', async () => {
  const f = fixture(), receipt = deferred(); f.api.acknowledgePin.mockReturnValue(receipt.promise)
  render(<PendingPinModal {...f} />); await screen.findByText('314159')
  const button = screen.getByRole('button', { name: 'Aceptar', exact: true }); fireEvent.click(button); fireEvent.click(button)
  expect(f.api.acknowledgePin).toHaveBeenCalledOnce(); expect(f.refreshSession).not.toHaveBeenCalled()
  expect(screen.getByText('314159')).toBeTruthy()
  await act(async () => receipt.resolve(null))
  expect(screen.queryByText('314159')).toBeNull(); expect(f.onAcknowledged).toHaveBeenCalledOnce(); expect(f.refreshSession).toHaveBeenCalledOnce()
})
it('failed verification retries the read without repeating the durable write', async () => {
  const f = fixture(); f.refreshSession.mockRejectedValueOnce(Error('offline'))
  render(<PendingPinModal {...f} />); await screen.findByText('314159')
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar', exact: true })); await screen.findByText('PIN aceptado')
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); await act(async () => {})
  expect(f.api.acknowledgePin).toHaveBeenCalledOnce(); expect(f.refreshSession).toHaveBeenCalledTimes(2)
})
it('uncertain acknowledgement never updates authorization or retries automatically', async () => {
  const f = fixture(); f.api.acknowledgePin.mockRejectedValue(Error('timeout'))
  render(<PendingPinModal {...f} />); await screen.findByText('314159')
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar', exact: true })); await screen.findByText('No fue posible confirmar la recepcion del PIN.')
  expect(f.onAcknowledged).not.toHaveBeenCalled(); expect(f.refreshSession).not.toHaveBeenCalled(); expect(f.api.acknowledgePin).toHaveBeenCalledOnce()
})
it('reveal failure has an explicit retry; no credential is reused', async () => {
  const f = fixture(); f.api.revealPin.mockRejectedValueOnce(Error('SQL failure'))
  render(<PendingPinModal {...f} />); await screen.findByText('PIN no disponible')
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await screen.findByText('314159')
  expect(f.api.revealPin).toHaveBeenCalledTimes(2)
})
it('unmounted receipt cannot refresh another session; late secret cannot appear after remount', async () => {
  const f = fixture(), receipt = deferred(); f.api.acknowledgePin.mockReturnValue(receipt.promise)
  const view = render(<PendingPinModal {...f} />); await screen.findByText('314159')
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar', exact: true })); view.unmount()
  await act(async () => receipt.resolve(null)); expect(f.refreshSession).not.toHaveBeenCalled(); expect(f.onAcknowledged).not.toHaveBeenCalled()
  const other = fixture(), late = deferred(); other.api.revealPin.mockReturnValue(late.promise)
  const next = render(<PendingPinModal {...other} />); await act(async () => {}); next.unmount()
  render(<PendingPinModal {...fixture()} />); await act(async () => late.resolve({ pin: '999999' }))
  expect(screen.queryByText('999999')).toBeNull()
})
