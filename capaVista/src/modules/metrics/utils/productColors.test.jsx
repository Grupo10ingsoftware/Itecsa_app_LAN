import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import MetricsBarChart from '../components/MetricsBarChart'
import {
  getProductTypeColor,
  getColorForIndex,
  normalizeProductType,
  PRODUCTION_PALETTE,
} from './productColors'

function getLuminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

function contrast(hex1, hex2 = '#ffffff') {
  const l1 = getLuminance(hex1)
  const l2 = getLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('productColors', () => {
  it('assigns different colors to core product types', () => {
    const lanyard = getProductTypeColor('Lanyard')
    const tarjeta = getProductTypeColor('Tarjeta')
    const yoyo = getProductTypeColor('Yoyo')

    expect(lanyard).not.toBe(tarjeta)
    expect(tarjeta).not.toBe(yoyo)
    expect(lanyard).not.toBe(yoyo)
    expect(lanyard).toBe('#fe5a00') // Corporate orange
    expect(tarjeta).toBe('#2563eb') // Corporate blue
    expect(yoyo).toBe('#248f55')    // Corporate green
  })

  it('guarantees consistent color assignment regardless of order, period, case, and accents', () => {
    expect(getProductTypeColor('lanyard')).toBe(getProductTypeColor('LANYARD'))
    expect(getProductTypeColor('  Lanyard  ')).toBe(getProductTypeColor('Lanyard'))
    expect(getProductTypeColor('Pellón')).toBe(getProductTypeColor('pellon'))
    expect(getProductTypeColor('Tarjetas')).toBe(getProductTypeColor('tarjetas'))

    // The color of a product never changes based on surrounding products
    const colorPeriod1 = getProductTypeColor('Lanyard')
    const otherProduct = getProductTypeColor('Tarjeta')
    const colorPeriod2 = getProductTypeColor('Lanyard')

    expect(colorPeriod1).toBe(colorPeriod2)
    expect(colorPeriod1).not.toBe(otherProduct)
  })

  it('maintains accessible contrast (>= 3.0:1) on white for the entire base palette', () => {
    PRODUCTION_PALETTE.forEach((hex) => {
      const cr = contrast(hex, '#ffffff')
      expect(cr).toBeGreaterThanOrEqual(3.0)
    })
  })

  it('expands the palette procedurally and controlled when index exceeds palette size', () => {
    const expandedColors = new Set()
    for (let i = PRODUCTION_PALETTE.length; i < PRODUCTION_PALETTE.length + 20; i++) {
      const color = getColorForIndex(i)
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(3.0)
      expandedColors.add(color)
    }
    // Generated colors should be diverse
    expect(expandedColors.size).toBe(20)
  })

  it('renders multicolor bars in MetricsBarChart when colors are provided', () => {
    const items = [
      { label: 'Lanyard', value: 100, color: getProductTypeColor('Lanyard') },
      { label: 'Tarjeta', value: 50, color: getProductTypeColor('Tarjeta') },
      { label: 'Yoyo', value: 25, color: getProductTypeColor('Yoyo') },
    ]

    const { container } = render(
      <MetricsBarChart items={items} label="Unidades producidas por producto" unit="unidades" />
    )

    const bars = container.querySelectorAll('[style*="background-color"]')
    expect(bars).toHaveLength(3)
    expect(bars[0].style.backgroundColor).toBe('rgb(254, 90, 0)') // #fe5a00
    expect(bars[1].style.backgroundColor).toBe('rgb(37, 99, 235)')  // #2563eb
    expect(bars[2].style.backgroundColor).toBe('rgb(36, 143, 85)')  // #248f55
  })

  it('preserves existing tone styling when no color is passed (e.g. ProductionPerformance)', () => {
    const items = [
      { label: 'A tiempo', value: 10, tone: 'onTime' },
      { label: 'Fuera de plazo', value: 2 },
      { label: 'sin fecha definida', value: 1, tone: 'noDeadline' },
    ]

    const { container } = render(
      <MetricsBarChart items={items} label="Pedidos por cumplimiento del plazo" unit="pedidos" />
    )

    const bars = container.querySelectorAll('[style*="background-color"]')
    // No inline background-color override should be set when item.color is absent
    expect(bars).toHaveLength(0)
  })
})

