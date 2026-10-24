import { authorizationForProvider } from '../../../../shared/identityAuthorization.js'
import { useIdentity } from './identityContext.js'
import { isValidVerifiedIdentity, isCurrentVerification } from './verifiedIdentity.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthApi } from '../../modules/auth/hooks/useAuthApi'
import { API_ERROR_CODES } from '../../services/api/apiClient'
import { AuthContext } from './authContext'

const AUTH_STATUS = Object.freeze({
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  SESSION_INVALID: 'session-invalid',
  ACCESS_DENIED: 'access-denied',
  ERROR: 'error',
})

const VERIFY_SESSION_TIMEOUT_MS = 10000
const defaultVerificationKey = () => 0

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('La verificacion de sesion excedio el tiempo maximo.'))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

export function AuthProvider({ children }) {
  const {
    error,
    provider, sessionKey, getSessionKey, verificationKey = 0,
    getVerificationKey = defaultVerificationKey,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout: identityLogout,
    user,
  } = useIdentity()
  const subject = user?.sub
  const policy = authorizationForProvider(provider)
  const authApi = useAuthApi()
  const [verifiedSession, setVerifiedSession] = useState({
    status: null,
    subject: null,
    provider: null,
    sessionKey: null,
    user: null,
    error: null,
  })

  const verifySession = useCallback(
    async () => {
      const verified = await withTimeout(authApi.verify(), VERIFY_SESSION_TIMEOUT_MS)
      if (getSessionKey() !== sessionKey || getVerificationKey() !== verificationKey ||
        !isValidVerifiedIdentity(verified, { provider, subject })) {
        throw Object.assign(Error('La identidad verificada no coincide con la sesion.'), { status: 401 })
      }
      return verified
    },
    [authApi, getSessionKey, sessionKey, subject, getVerificationKey, verificationKey, provider],
  )

  const refreshSession = useCallback(async () => {
    try {
      const verifiedUser = await verifySession()
      setVerifiedSession({
        status: AUTH_STATUS.AUTHENTICATED,
        subject,
        provider,
        sessionKey,
        verificationKey,
        user: verifiedUser,
        error: null,
      })
      return verifiedUser
    } catch (verifyError) {
      if (getSessionKey() === sessionKey && getVerificationKey() === verificationKey) setVerifiedSession({ subject, provider, sessionKey, verificationKey,
        user: null, error: verifyError, status: verifyError?.status === 401 ? AUTH_STATUS.SESSION_INVALID
          : verifyError?.status === 403 ? AUTH_STATUS.ACCESS_DENIED : AUTH_STATUS.ERROR })
      throw verifyError
    }
  }, [subject, provider, sessionKey, getSessionKey, getVerificationKey, verificationKey, verifySession])

  useEffect(() => {
    let isCurrent = true

    if (isLoading || !isAuthenticated) {
      return () => {
        isCurrent = false
      }
    }

    verifySession()
      .then((verifiedUser) => {
        if (!isCurrent) {
          return
        }

        setVerifiedSession({
          status: AUTH_STATUS.AUTHENTICATED,
          subject,
          provider,
          sessionKey,
          verificationKey,
          user: verifiedUser,
          error: null,
        })
      })
      .catch((verifyError) => {
        if (!isCurrent) {
          return
        }

        const status =
          verifyError?.code === API_ERROR_CODES.SESSION_INVALID || verifyError?.status === 401
            ? AUTH_STATUS.SESSION_INVALID
            : verifyError?.status === 403
              ? AUTH_STATUS.ACCESS_DENIED
              : AUTH_STATUS.ERROR

        setVerifiedSession({
          status,
          subject: subject ?? null,
          provider,
          sessionKey,
          verificationKey,
          user: null,
          error: verifyError,
        })
      })

    return () => {
      isCurrent = false
    }
  }, [isAuthenticated, isLoading, subject, provider, sessionKey, verificationKey, verifySession])

  const logout = useCallback(() => {
    identityLogout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    })
  }, [identityLogout])

  const hasCurrentVerification = isCurrentVerification(verifiedSession, { subject, provider, sessionKey, verificationKey })
  const verifiedUser = isAuthenticated && hasCurrentVerification ? verifiedSession.user : null
  const verificationError =
    isAuthenticated && hasCurrentVerification ? verifiedSession.error : null

  const hasRole = useCallback(
    (role) => {
      return verifiedUser?.rolUsuario === role
    },
    [verifiedUser],
  )

  const hasPermission = useCallback(
    (permission) => {
      // Control visual de experiencia: la autorizacion efectiva siempre la valida el backend.
      const permissions = verifiedUser?.permissions

      return policy?.can(verifiedUser?.rolUsuario, permissions, permission) === true
    },
    [verifiedUser, policy],
  )

  const authStatus = error
    ? error?.status === 401 ? AUTH_STATUS.SESSION_INVALID : AUTH_STATUS.ERROR
    : isLoading
      ? AUTH_STATUS.LOADING
      : !isAuthenticated
        ? AUTH_STATUS.UNAUTHENTICATED
        : hasCurrentVerification && verifiedSession.status
          ? verifiedSession.status
          : AUTH_STATUS.LOADING
  const isVerifyingSession = authStatus === AUTH_STATUS.LOADING
  const sessionError = error ?? verificationError

  const value = useMemo(
    () => ({
      user: verifiedUser,
      identityUser: user,
      auth0User: user, // Transitional alias; consumers use identityUser.
      provider,
      isAuthenticated: isAuthenticated && authStatus === AUTH_STATUS.AUTHENTICATED,
      isLoading: isLoading || isVerifyingSession,
      isVerifyingSession,
      authStatus,
      error: sessionError,
      loginWithRedirect,
      logout,
      hasRole,
      hasPermission,
      pinStatus: verifiedUser?.pinStatus ?? null,
      refreshSession,
    }),
    [
      verifiedUser,
      provider,
      user,
      isAuthenticated,
      authStatus,
      isLoading,
      isVerifyingSession,
      sessionError,
      loginWithRedirect,
      logout,
      hasRole,
      hasPermission,
      refreshSession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
