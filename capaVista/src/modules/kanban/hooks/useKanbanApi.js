import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createKanbanApi } from '../api/kanbanApi.js'

export function useKanbanApi() {
  const client = useApiClient()
  return useMemo(() => createKanbanApi(client), [client])
}
