import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createAdminUsersApi } from '../api/adminUsersApi'

export function useAdminUsersApi() {
  const client = useApiClient()
  return useMemo(() => createAdminUsersApi(client), [client])
}
