import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createAdminUsersApi } from '../api/adminUsersApi'
import { useAuth } from '../../../hooks/useAuth'

export function useAdminUsersApi() {
  const client = useApiClient()
  const { provider } = useAuth()
  return useMemo(() => createAdminUsersApi(client, { provider }), [client, provider])
}
