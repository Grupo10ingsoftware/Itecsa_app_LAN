import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createAuthApi } from '../api/authApi'

export function useAuthApi() {
  const client = useApiClient()
  return useMemo(() => createAuthApi(client), [client])
}
