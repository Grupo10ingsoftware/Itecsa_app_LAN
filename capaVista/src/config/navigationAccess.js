import { matchPath } from 'react-router-dom'
import { authorizationForProvider } from '../../../shared/identityAuthorization.js'
import { APP_ROUTES, MAIN_NAVIGATION_ROUTES, HEADER_NAVIGATION_ROUTES } from './routes'
import { PERMISSIONS as P } from './permissions'

// One access registry for menu destinations, details and aliases. The API remains authoritative.
export const ROUTE_ACCESS = Object.freeze([
  ...MAIN_NAVIGATION_ROUTES,
  ...HEADER_NAVIGATION_ROUTES,
  { path: '/admin', permission: P.MANAGE_USERS },
  { path: APP_ROUTES.ADMIN_USERS_CREATE, permission: P.MANAGE_USERS },
  { path: APP_ROUTES.ORDER_HISTORY_DETAIL, permission: P.READ_ORDERS },
  { path: APP_ROUTES.MESSAGE_DETAIL, permission: P.READ_MESSAGES },
  ...[APP_ROUTES.DOCUMENTS, APP_ROUTES.DATA_REQUESTS, APP_ROUTES.INCIDENT_REPORT].map(path => ({ path })),
])

export function homeForIdentity(provider, user) {
  const policy = authorizationForProvider(provider)
  const allowed = permission => policy?.can(user?.rolUsuario, user?.permissions, permission) === true
  if (provider === 'keycloak' && allowed(P.MANAGE_USERS) && !allowed(P.READ_ORDERS)) return APP_ROUTES.ADMIN_USERS
  if (allowed(P.READ_ORDERS)) return APP_ROUTES.KANBAN
  if (allowed(P.READ_PROFILE)) return APP_ROUTES.PROFILE
  if (allowed(P.READ_MESSAGES)) return APP_ROUTES.MESSAGES
  return APP_ROUTES.ACCESS_DENIED
}

export function resolvePostLoginPath(candidate, provider, user) {
  const home = homeForIdentity(provider, user)
  const policy = authorizationForProvider(provider)
  if (!policy?.RECOGNIZED_ROLES.includes(user?.rolUsuario) || !Array.isArray(user?.permissions)) return home
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || [...candidate].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return home
  const pathname = candidate.split(/[?#]/, 1)[0]
  const rule = ROUTE_ACCESS.find(route => matchPath({ path: route.path, end: true }, pathname))
  return rule && (!rule.permission || policy.can(user.rolUsuario, user.permissions, rule.permission)) ? candidate : home
}
