// Independent acceptance fixture; no imports from the executable authorization policy.
export const EXPECTED_NAVIGATION = Object.freeze({
  'Administrador Produccion': ['/kanban', '/historial-pedidos', '/calendario-produccion', '/metricas'],
  'Administrador Ventas': ['/kanban', '/ordenes/nuevo', '/historial-pedidos', '/calendario-produccion'],
  'Administrador Cobranzas': ['/kanban', '/pagos', '/historial-pedidos'],
  'Operario Produccion': ['/kanban', '/historial-pedidos'],
  'Operario Ventas': ['/kanban', '/ordenes/nuevo', '/historial-pedidos', '/calendario-produccion'],
  'Operario Cobranzas': ['/kanban', '/pagos', '/historial-pedidos'],
  Gerencia: ['/kanban', '/historial-pedidos', '/metricas'],
  Desarrollador: ['/kanban', '/pagos', '/ordenes/nuevo', '/historial-pedidos', '/calendario-produccion', '/metricas'],
  Soporte: ['/admin/usuarios'],
})
