import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createOrdersCalendarApi } from '../api/ordersCalendarApi'

export function useOrdersCalendarApi() {
  const client = useApiClient()
  return useMemo(() => createOrdersCalendarApi(client), [client])
}
