import { render as renderReact } from '@testing-library/react'
import ToastProvider from '../shared/notifications/ToastProvider'

export function render(ui, options = {}) {
  return renderReact(ui, { wrapper: ToastProvider, ...options })
}
