import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createOrdersApi } from '../api/ordersApi'

export function useOrdersApi() {
  const client = useApiClient()
  return useMemo(() => createOrdersApi(client), [client])
}
