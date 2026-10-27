import { createContext, useContext, useEffect, useMemo, useRef } from 'react'

export const ToastContext = createContext(null)

export function useToast() {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast requiere ToastProvider.')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  return useMemo(() => Object.fromEntries(Object.entries(api).map(([name, action]) =>
    [name, (...args) => active.current ? action(...args) : null])), [api])
}
