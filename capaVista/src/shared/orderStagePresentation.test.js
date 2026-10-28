import { describe, expect, it } from 'vitest'
import { getOrderStagePresentation, getOrderStageAccent } from './orderStagePresentation'
import { normalizeStatus } from '../modules/kanban/utils/kanbanOrderMapping'

describe('shared stage presentation', () => {
  it.each([
    [0, 'Confirmación de Pago', 'payment'],
    [1, 'Listo para Producción', 'ready'],
    [2, 'En Producción', 'production'],
    [3, 'Listo para Entrega', 'delivery'],
    [6, 'En Revisión', 'review'],
  ])('matches calendar and API Kanban stage %s', (step, name, token) => {
    expect(getOrderStagePresentation(name).token).toBe(token)
    expect(getOrderStagePresentation(name.toLowerCase()).token).toBe(token)
    expect(normalizeStatus({ orden_kanban: step, nombre_etapa: name }).accent).toBe(getOrderStageAccent(step))
    expect(getOrderStageAccent(step)).toBe(`var(--stage-${token}-accent)`)
  })

  it('does not reassign unknown stages', () => {
    expect(getOrderStagePresentation('Terminado')).toEqual({ token: 'unknown', short: 'Terminado' })
  })
})
