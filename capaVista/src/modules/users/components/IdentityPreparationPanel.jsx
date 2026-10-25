import { useState } from 'react'
import { useApiClient } from '../../../hooks/useApiClient'
import { ASSIGNABLE_ROLES } from '../../../../../shared/keycloakAuthorization.js'

// Uses the same preparation service mounted in the normal application server.
export default function IdentityPreparationPanel() {
  const api = useApiClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  async function prepare(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await api.post('/admin/identity/identities/prepare', {
        pin: data.get('pin'), identity: { username: data.get('username'), firstName: data.get('firstName'),
          lastName: data.get('lastName'), role: data.get('role'), email: null },
      })
      setResult(response)
    } catch (failure) {
      setError(failure?.payload?.message || 'No fue posible preparar la cuenta. Revisa tu autorización y PIN.')
    } finally {
      form.elements.pin.value = ''
      setBusy(false)
    }
  }
  return (
    <section className="card p-3 my-3" aria-labelledby="preparation-title">
      <h2 id="preparation-title" className="h4">Preparar una cuenta</h2>
      <p>La cuenta quedará deshabilitada y pendiente. La activación y entrega de credenciales corresponden a la siguiente fase.</p>
      <form onSubmit={prepare} className="row g-3">
        {[["username", "Nombre de acceso"], ["firstName", "Nombre"], ["lastName", "Apellido"]].map(([name, label]) => (
          <div className="col-md-4" key={name}>
            <label htmlFor={`prepare-${name}`} className="form-label">{label}</label>
            <input id={`prepare-${name}`} name={name} className="form-control" required maxLength={name === 'username' ? 255 : 100} autoComplete="off" disabled={busy} />
          </div>
        ))}
        <div className="col-md-6">
          <label htmlFor="prepare-role" className="form-label">Rol</label>
          <select id="prepare-role" name="role" className="form-select" disabled={busy}>
            {ASSIGNABLE_ROLES.map(role => <option key={role}>{role}</option>)}
          </select>
        </div>
        <div className="col-md-6">
          <label htmlFor="prepare-pin" className="form-label">Tu PIN</label>
          <input id="prepare-pin" name="pin" type="password" inputMode="numeric" autoComplete="off" className="form-control" required disabled={busy} />
        </div>
        <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Preparando…' : 'Preparar cuenta pendiente'}</button></div>
      </form>
      {error && <p className="alert alert-danger mt-3" role="alert">{error}</p>}
      {result && <p className="alert alert-info mt-3" role="status">
        {result.outcome === 'identity_prepared' ? 'Cuenta preparada. Permanece pendiente y deshabilitada.'
          : result.recoverable ? 'La operación requiere conciliación. No repitas el alta con otro nombre.' : 'La preparación no pudo completarse.'}
      </p>}
    </section>
  )
}
