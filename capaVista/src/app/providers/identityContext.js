import { createContext, useContext } from 'react'

export const IdentityContext = createContext(null)
export function useIdentity() {
  const context = useContext(IdentityContext)
  if (!context) throw Error('Se requiere un proveedor de identidad.')
  return context
}
