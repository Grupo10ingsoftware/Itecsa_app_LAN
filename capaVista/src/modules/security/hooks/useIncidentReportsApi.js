import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createIncidentReportsApi } from '../api/incidentReportsApi'

export function useIncidentReportsApi() {
  const client = useApiClient()
  return useMemo(() => createIncidentReportsApi(client), [client])
}
