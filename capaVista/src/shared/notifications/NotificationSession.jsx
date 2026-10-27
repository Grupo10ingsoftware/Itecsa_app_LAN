import { useIdentity } from '../../app/providers/identityContext'
import ToastProvider from './ToastProvider'

// Token renewal keeps the queue; a different account or signed-out session does not.
export default function NotificationSession({ children }) {
  const { provider, isAuthenticated, user } = useIdentity()
  return <ToastProvider key={`${provider}:${isAuthenticated ? user?.sub : 'signed-out'}`}>{children}</ToastProvider>
}
