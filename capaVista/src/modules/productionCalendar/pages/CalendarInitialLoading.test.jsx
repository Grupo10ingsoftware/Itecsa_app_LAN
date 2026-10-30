import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../../../test/renderWithToast'
import ProductionCalendarPage from './ProductionCalendarPage'

const mocks = vi.hoisted(() => ({ api: null }))
vi.mock('../hooks/useOrdersCalendarApi', () => ({ useOrdersCalendarApi: () => mocks.api }))
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }))

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const fakeOrder = (id, date) => ({
  id,
  salesNoteNumber: `NV-${id}`,
  clientName: `Cliente ${id}`,
  dueDate: date,
  items: [{ product: 'Lanyard', quantity: 10, dueDate: date }],
  status: 'En producción',
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Estado de carga inicial del Calendario ITECSA', () => {
  it('al ingresar muestra únicamente un spinner centrado y no expone controles ni esqueleto', async () => {
    const monthQuery = deferred()
    const unscheduledQuery = deferred()

    mocks.api = {
      getOrders: vi.fn().mockImplementation((query) => (
        query.unscheduled ? unscheduledQuery.promise : monthQuery.promise
      )),
    }

    render(<ProductionCalendarPage />)

    // Spinner centrado en el área principal
    const status = screen.getByRole('status')
    expect(status).toBeTruthy()
    expect(status.getAttribute('data-scope')).toBe('page')
    expect(status.textContent).toContain('Cargando...')
    expect(status.textContent).toContain('Calendario de producción')

    // No se expone el encabezado de página ni controles internos
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByText('Calendario')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Controles del calendario' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hoy' })).toBeNull()
    expect(screen.queryByTitle('Mes anterior')).toBeNull()
    expect(screen.queryByTitle('Mes siguiente')).toBeNull()
    expect(screen.queryByRole('button', { name: /filtros/i })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Calendario mensual de produccion' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Pedidos pendientes de programar' })).toBeNull()
    expect(screen.queryByLabelText('Bandeja temporal para mover pedidos de mes')).toBeNull()

    // Solo cuando ambas consultas finalizan se renderiza la interfaz completa simultáneamente
    await act(async () => {
      monthQuery.resolve({ items: [fakeOrder(1, '2026-10-20')], pageInfo: {} })
    })

    // Sigue en carga mientras falte la bandeja de pendientes
    expect(screen.getByRole('status').getAttribute('data-scope')).toBe('page')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()

    await act(async () => {
      unscheduledQuery.resolve({ items: [fakeOrder(2, null)], pageInfo: {} })
    })

    // Carga finalizada: aparece el calendario completo
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Controles del calendario' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeTruthy()
    expect(screen.getByTitle('Mes anterior')).toBeTruthy()
    expect(screen.getByTitle('Mes siguiente')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expandir filtros de calendario' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Calendario mensual de produccion' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Pedidos pendientes de programar' })).toBeTruthy()
    expect(screen.getByLabelText('Bandeja temporal para mover pedidos de mes')).toBeTruthy()
    expect(screen.getByText('NV-1')).toBeTruthy()
    expect(screen.getByText('NV-2')).toBeTruthy()
  })

  it('no confunde un calendario sin pedidos con un estado de carga', async () => {
    mocks.api = {
      getOrders: vi.fn().mockResolvedValue({ items: [], pageInfo: {} }),
    }

    render(<ProductionCalendarPage />)
    await act(async () => {})

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeTruthy()
    expect(screen.getByText('No hay pedidos pendientes de fecha.')).toBeTruthy()
    expect(screen.getByText(/Arrastra aquí los pedidos que quieras mover a otro mes/)).toBeTruthy()
  })

  it('los cambios de mes posteriores conservan la interfaz visible sin desmontar el calendario', async () => {
    mocks.api = {
      getOrders: vi.fn().mockResolvedValue({ items: [fakeOrder(1, '2026-10-20')], pageInfo: {} }),
    }

    render(<ProductionCalendarPage />)
    await act(async () => {})

    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Calendario mensual de produccion' })).toBeTruthy()

    // Preparar cambio de mes diferido
    const nextMonthQuery = deferred()
    mocks.api.getOrders.mockImplementation((query) => (
      query.unscheduled ? Promise.resolve({ items: [], pageInfo: {} }) : nextMonthQuery.promise
    ))

    fireEvent.click(screen.getByTitle('Mes siguiente'))
    await act(async () => {})

    // La interfaz NO se desmonta
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Controles del calendario' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Calendario mensual de produccion' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Pedidos pendientes de programar' })).toBeTruthy()
    expect(screen.getByLabelText('Bandeja temporal para mover pedidos de mes')).toBeTruthy()

    // Solo el indicador interno del scroll de días está en proceso
    const gridStack = screen.getByRole('region', { name: 'Calendario mensual de produccion' }).closest('[aria-busy]')
    expect(gridStack.getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      nextMonthQuery.resolve({ items: [fakeOrder(3, '2026-11-05')], pageInfo: {} })
    })

    expect(gridStack.getAttribute('aria-busy')).toBe('false')
    expect(screen.getByText('NV-3')).toBeTruthy()
  })

  it('gestiona errores de carga inicial con Toast y deja el calendario en estado recuperable', async () => {
    mocks.api = {
      getOrders: vi.fn().mockRejectedValue(new Error('Fallo de red')),
    }

    render(<ProductionCalendarPage />)
    await act(async () => {})

    // Error presentado mediante Toast
    await waitFor(() => {
      expect(screen.getByText('No fue posible cargar los pedidos compartidos del calendario.')).toBeTruthy()
    })

    // El spinner de pantalla completa se retira y se ofrece interfaz recuperable
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeTruthy()
    expect(screen.getByTitle('Mes siguiente')).toBeTruthy()
  })
})

