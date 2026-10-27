import { useMemo } from 'react'
import { useApiClient } from '../../../hooks/useApiClient.js'
import { createPrivacyApi } from '../api/privacyApi'

export function usePrivacyApi() {
  const client = useApiClient()
  return useMemo(() => createPrivacyApi(client), [client])
}
