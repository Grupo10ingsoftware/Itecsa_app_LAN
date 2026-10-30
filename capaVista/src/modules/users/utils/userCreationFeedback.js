const duplicates = {
  IDENTITY_EMAIL_EXISTS: 'El correo electrónico ingresado ya está registrado en el sistema. Utiliza uno diferente',
  IDENTITY_USERNAME_EXISTS: 'El nombre de usuario ya está en uso. Debes utilizar uno diferente',
  IDENTITY_RUT_EXISTS: 'El RUT ingresado ya está registrado en el sistema. Verifica los datos de la persona.',
}

export function userCreationFeedback(result) {
  if (result?.outcome === 'user_created') return {
    type: 'success', text: 'Usuario creado. Deberá cambiar su contraseña temporal al iniciar sesión.', blocked: true,
  }
  if (result?.outcome === 'failed' && !result.externalSubject && !result.localUserId && duplicates[result.code]) {
    return { type: 'error', text: duplicates[result.code], blocked: false }
  }
  const messages = {
    needs_reconciliation: 'La preparación del usuario quedó incompleta. Verifica su estado y concilia la operación antes de reintentar el alta.',
    identity_prepared: 'La identidad está preparada, pero la cuenta no está completamente habilitada. Solicita revisión administrativa antes de reintentar.',
    running: 'La creación del usuario sigue en curso. Verifica su estado antes de iniciar otra alta.',
    pending: 'La preparación del usuario está pendiente. Verifica su estado antes de iniciar otra alta.',
    identity_conflict: 'Existe un conflicto de identidad en Keycloak o con una preparación anterior. Verifica su estado antes de reintentar.',
    unknown: 'No se pudo confirmar el resultado de la creación. Verifica su estado antes de reintentar; la cuenta podría haberse creado.',
  }
  const conflict = ['KEYCLOAK_IDENTITY_CONFLICT', 'KEYCLOAK_USER_EXISTS', 'IDENTITY_OPERATION_PAYLOAD_CONFLICT'].includes(result?.code)
  const text = messages[conflict ? 'identity_conflict' : result?.outcome] ?? messages.unknown
  return { type: 'warning', blocked: true, text: text + (result?.operationId ? ` Referencia: ${result.operationId}.` : '') }
}
