import { getRoleLabel, isOfficialRole } from '../../../config/roles'

export default function RoleBadge({ role, provider = 'auth0' }) {
  const displayRole = isOfficialRole(role, provider) ? getRoleLabel(role) : 'Rol no reconocido'
  const badgeClass = isOfficialRole(role, provider) ? 'text-bg-light' : 'text-bg-secondary'

  return (
    <span className={`badge ${badgeClass}`}>
      {/* Identidad verificada; la autorización efectiva corresponde al backend. */}
      {displayRole}
    </span>
  )
}
