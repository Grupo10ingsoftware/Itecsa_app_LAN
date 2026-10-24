import assert from 'node:assert/strict'
import { validateUserCreateForm, hasValidationErrors } from '../src/modules/users/utils/userValidation.js'
import { createAdminUsersApi } from '../src/modules/users/api/adminUsersApi.js'
import { canRequestPasswordSetupEmail, isCompletedUserCreation } from '../src/modules/users/utils/userCreationOutcome.js'

export async function run() {
  const user = { nombreUsuario: 'Ana', apellidoUsuario: 'Perez', rutUsuario: '12.345.678-5', correoUsuario: '', rolUsuario: 'Operario Ventas' }
  assert.equal(hasValidationErrors(validateUserCreateForm(user, { optionalEmail: true })), false)
  assert.equal(hasValidationErrors(validateUserCreateForm(user)), true)
  assert.equal(hasValidationErrors(validateUserCreateForm({ ...user, correoUsuario: 'invalid' }, { optionalEmail: true })), true)
  const pending = { outcome: 'pending_credentials', internalUserPersisted: true, roleAssignmentCompleted: true, pinProvisioned: true, passwordSetupEmailRequested: false }
  assert.equal(isCompletedUserCreation(pending), false)
  assert.equal(canRequestPasswordSetupEmail(pending), false)
  const calls = []
  const api = createAdminUsersApi({ async post(path, body) { calls.push({ path, body }) } })
  await api.setTemporaryPassword({ userId: 'kc-user', pin: '123456', identityVerified: true })
  assert.deepEqual(calls, [{ path: '/admin/users/kc-user/temporary-password', body: { pin: '123456', identityVerified: true } }])
  console.log('6 verificaciones etapa 4: correo opcional, pending_credentials y contrato PIN de credenciales OK')
}
