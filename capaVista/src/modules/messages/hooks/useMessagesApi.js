import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createMessagesApi } from '../api/messagesApi'

export function useMessagesApi() {
  const client = useApiClient()
  return useMemo(() => createMessagesApi(client), [client])
}
