import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createOrderHistoryApi } from '../api/orderHistoryApi'

export function useOrderHistoryApi() {
  const client = useApiClient()
  return useMemo(() => createOrderHistoryApi(client), [client])
}
