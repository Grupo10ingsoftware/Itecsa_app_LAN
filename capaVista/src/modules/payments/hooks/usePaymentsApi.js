import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createPaymentsApi } from '../api/paymentsApi'

export function usePaymentsApi() {
  const client = useApiClient()
  return useMemo(() => createPaymentsApi(client), [client])
}
