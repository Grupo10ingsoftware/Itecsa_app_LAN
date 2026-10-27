// Public business messages are rendered as text, never as HTML. Technical
// failures and unexpected payloads use the operation's safe, specific fallback.
export function publicOperationMessage(error, fallback) {
  const message = error?.payload?.message
  if (typeof message !== 'string' || !message.trim() || message.length > 800 || /<[^>]*>|Bearer\s|eyJ[A-Za-z0-9_-]+\.|\b(?:SELECT|INSERT INTO|UPDATE .* SET|PrismaClient|TypeError|ReferenceError|stack trace)\b/i.test(message)) return fallback
  return message
}

export function requiresContext(error) {
  const code = error?.payload?.code ?? ''
  return code.startsWith('PIN_') || (!code && /\bPIN\b/i.test(error?.payload?.message ?? ''))
    || [400, 401, 422].includes(error?.status) || /RECONCILIATION|REQUIRES_REVIEW|REVIEW_DELIVERY/.test(code)
}

export function uncertainOperation(error) {
  return !Number.isInteger(error?.status) || error.status >= 500
}

export function operationFailureMessage(error, fallback) {
  const message = publicOperationMessage(error, fallback)
  return uncertainOperation(error) && !requiresContext(error) ? `${message} Comprueba el resultado antes de repetir la operación.` : message
}

// A handled general error is not an authorization success. This marker lets a
// modal retain its inputs without emitting a second, generic error.
export const FEEDBACK_HANDLED = Object.freeze({ feedbackHandled: true })
