export const SESSION_REVALIDATION_INTERVAL_MS = 30 * 60 * 1000

// Token timestamps/IDs change on renewal. Authorization changes must still
// invalidate the verified view immediately, even within the 30-minute period.
export function authorizationVersion(claims) {
  const ordered = value => Array.isArray(value) ? [...value].sort() : value ?? null
  return JSON.stringify({
    sub: claims.sub, sid: claims.sid, iss: claims.iss, aud: ordered(claims.aud), azp: claims.azp,
    permissions: ordered(claims.permissions), realmRoles: ordered(claims.realm_access?.roles),
    clientRoles: Object.entries(claims.resource_access ?? {}).sort(([a], [b]) => a.localeCompare(b))
      .map(([client, access]) => [client, ordered(access?.roles)]),
    scope: typeof claims.scope === 'string' ? claims.scope.split(/\s+/).filter(Boolean).sort() : claims.scope,
  })
}

export function scheduleSessionRevalidation(session, browser) {
  let active = true, timer
  const schedule = () => {
    timer = browser.setTimeout(async () => {
      try { await session.revalidate() }
      finally { if (active) schedule() }
    }, session.getRevalidationDelay())
  }
  schedule()
  return () => { active = false; browser.clearTimeout(timer) }
}
