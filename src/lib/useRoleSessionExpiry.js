import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function useRoleSessionExpiry(session, loginPath, storageKey) {
  const navigate = useNavigate()
  const sessionToken = session?.session_token
  const sessionExpiresAt = session?.session_expires_at
  const expiresAt = typeof sessionExpiresAt === 'string'
    ? Date.parse(sessionExpiresAt)
    : Number.NaN
  const hasSession = Boolean(sessionToken && Number.isFinite(expiresAt))

  useEffect(() => {
    const redirectToLogin = () => {
      if (storageKey) {
        try {
          window.sessionStorage.removeItem(storageKey)
        } catch (error) {
          console.error('Unable to clear the expired role session.', error)
        }
      }
      navigate(loginPath, { replace: true })
    }

    if (!hasSession || expiresAt <= Date.now()) {
      redirectToLogin()
      return undefined
    }

    const checkExpiration = () => {
      if (Date.now() >= expiresAt) {
        redirectToLogin()
      }
    }
    const timeoutId = window.setTimeout(redirectToLogin, expiresAt - Date.now())

    document.addEventListener('visibilitychange', checkExpiration)
    window.addEventListener('focus', checkExpiration)
    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', checkExpiration)
      window.removeEventListener('focus', checkExpiration)
    }
  }, [expiresAt, hasSession, loginPath, navigate, storageKey])

  return hasSession
}
