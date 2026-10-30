import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import PinRecoveryFailure from './PinRecoveryFailure'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('uses Toast and waits before a single explicit retry', async () => {
  vi.useFakeTimers()
  let resolve
  const retry = vi.fn(() => new Promise(done => { resolve = done }))
  const onComplete = vi.fn()
  render(<PinRecoveryFailure result={{ error: 'Espera para continuar.', retryAt: Date.now() + 2000, retry }} onComplete={onComplete} />)
  expect(document.querySelector('[data-toast-viewport]').textContent).toContain('Espera para continuar.')
  expect(document.querySelector('main [role="alert"]')).toBeNull()
  const button = screen.getByRole('button', { name: 'Reintentar restauración de sesión' })
  expect(button.disabled).toBe(true)
  await act(async () => { vi.advanceTimersByTime(2100) })
  fireEvent.click(button); fireEvent.click(button)
  expect(retry).toHaveBeenCalledOnce()
  await act(async () => { resolve({ session: { subject: 'original' } }) })
  expect(onComplete).toHaveBeenCalledWith({ session: { subject: 'original' } })
})
