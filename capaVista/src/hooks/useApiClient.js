import { useMemo } from 'react'
import { useIdentity } from '../app/providers/identityContext.js'
import { createApiClient } from '../services/api/apiClient.js'

export function useApiClient() {
  const { getAccessToken, getSessionKey, sessionKey } = useIdentity()
  return useMemo(() => createApiClient({ getAccessToken,
    isSessionCurrent: () => getSessionKey() === sessionKey,
  }), [getAccessToken, getSessionKey, sessionKey])
}
