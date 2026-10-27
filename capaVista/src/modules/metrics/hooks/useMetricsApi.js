import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createMetricsApi } from '../api/metricsApi'

export function useMetricsApi() {
  const client = useApiClient()
  return useMemo(() => createMetricsApi(client), [client])
}
