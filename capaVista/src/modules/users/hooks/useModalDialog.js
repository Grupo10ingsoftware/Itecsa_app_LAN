import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container) {
  if (!container) return []

  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true' && !element.hidden,
  )
}

export function nextModalFocusTarget({ activeElement, focusableElements, shiftKey }) {
  if (focusableElements.length === 0) return null

  const first = focusableElements[0]
  const last = focusableElements.at(-1)
  const activeIndex = focusableElements.indexOf(activeElement)

  if (shiftKey && activeIndex <= 0) return last
  if (!shiftKey && (activeIndex === -1 || activeIndex === focusableElements.length - 1)) return first
  return null
}

// Only the top dialog owns keyboard/focus. Recompute isolation when layers are
// replaced so an outgoing modal cannot expose the background of its successor.
const dialogs = []
let restoreBackground = () => {}
let originalOverflow = ''

function updateIsolation() {
  restoreBackground()
  const previous = []
  const top = dialogs.at(-1)?.container
  let branch = top
  while (branch && branch !== document.body) {
    for (const element of branch.parentElement?.children ?? []) {
      if (element === branch) continue
      previous.push({ element, hidden: element.getAttribute('aria-hidden'), inert: element.inert })
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    }
    branch = branch.parentElement
  }
  restoreBackground = () => {
    for (const { element, hidden, inert } of previous) {
      element.inert = inert
      if (hidden === null) element.removeAttribute('aria-hidden')
      else element.setAttribute('aria-hidden', hidden)
    }
  }
}

export function useModalDialog({
  canClose = true,
  containerRef,
  initialFocusRef,
  isOpen,
  onClose,
}) {
  const canCloseRef = useRef(canClose)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    canCloseRef.current = canClose
    onCloseRef.current = onClose
  }, [canClose, onClose])

  useEffect(() => {
    if (!isOpen) return undefined

    const container = containerRef.current
    const previousFocus = document.activeElement
    const entry = { container }
    if (!dialogs.length) originalOverflow = document.body.style.overflow
    dialogs.push(entry)
    updateIsolation()
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => {
      if (dialogs.at(-1) !== entry) return
      const target = initialFocusRef?.current ?? getFocusableElements(container)[0] ?? container
      target?.focus()
    }, 0)

    function handleKeyDown(event) {
      if (dialogs.at(-1) !== entry) return
      if (event.key === 'Escape' && canCloseRef.current) {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(container)
      const target = nextModalFocusTarget({
        activeElement: document.activeElement,
        focusableElements,
        shiftKey: event.shiftKey,
      })

      if (target) {
        event.preventDefault()
        target.focus()
      } else if (focusableElements.length === 0) {
        event.preventDefault()
        container?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      const wasTop = dialogs.at(-1) === entry
      dialogs.splice(dialogs.indexOf(entry), 1)
      updateIsolation()
      if (!dialogs.length) document.body.style.overflow = originalOverflow
      if (wasTop && previousFocus?.isConnected && !previousFocus.closest('[aria-hidden="true"], [inert]')) previousFocus.focus()
    }
  }, [containerRef, initialFocusRef, isOpen])
}
