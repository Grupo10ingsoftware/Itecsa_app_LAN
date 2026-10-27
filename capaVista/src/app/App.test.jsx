import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from './App.jsx'

const mocks = vi.hoisted(() => ({ session: { token: 'original', refreshToken: 'original-refresh' }, calls: [], fail: false }))
vi.mock('./providers/AppProviders', () => ({ default: ({ children, recoverySession }) => {
  mocks.calls.push(recoverySession); return children
} }))
vi.mock('../modules/auth/pages/PinRecoveryCallbackPage.jsx', async () => {
  const { useEffect } = await import('react')
  return { default: function MockRecoveryCallback({ onComplete }) {
    useEffect(() => { onComplete(mocks.fail ? { error: 'Original session unavailable' } : { session: mocks.session }) }, [onComplete])
    return null
  } }
})
vi.mock('./router', () => ({ default: () => <div>Existing application routes</div> }))
function Location() { const location = useLocation(); return <div data-testid="location">{location.pathname}</div> }
afterEach(() => { cleanup(); mocks.calls = []; mocks.fail = false; window.history.replaceState(null, '', '/') })
it('callback returns to existing profile and seeds providers only with original session', async () => {
  window.history.replaceState(null, '', '/auth/pin-recovery/callback?state=s&code=c')
  render(<MemoryRouter initialEntries={['/auth/pin-recovery/callback']}><App /><Location /></MemoryRouter>)
  await screen.findByText('Existing application routes')
  expect(screen.getByTestId('location').textContent).toBe('/perfil')
  expect(mocks.calls.every(session => session === mocks.session)).toBe(true)
})
it('failed restoration returns to profile without initiating ordinary SSO or publishing another account', async () => {
  mocks.fail = true
  window.history.replaceState(null, '', '/auth/pin-recovery/callback')
  render(<MemoryRouter><App /><Location /></MemoryRouter>)
  await screen.findByText('Original session unavailable')
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/perfil'))
  expect(mocks.calls.length).toBe(0)
})
