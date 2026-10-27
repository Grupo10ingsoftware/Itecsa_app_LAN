import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createAuthApi } from '../api/authApi'
import { useIdentity } from '../../../app/providers/identityContext.js'

export function useAuthApi() {
  const client = useApiClient()
  const { getRecoveryRefreshToken } = useIdentity()
  return useMemo(() => createAuthApi(client, { getRecoveryRefreshToken }), [client, getRecoveryRefreshToken])
}
