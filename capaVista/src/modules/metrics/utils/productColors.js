/**
 * Visual color palette and consistent color assignment for product categories
 * in the ITECSA metrics module.
 */

// Corporate-aligned palette prioritizing high contrast (>= 3.0:1 on white),
// vibrancy, and clear distinction between categories.
export const PRODUCTION_PALETTE = Object.freeze([
  '#fe5a00', // 0: ITECSA Brand Orange (--page-brand-orange)
  '#2563eb', // 1: Production Blue (--stage-production-accent)
  '#248f55', // 2: Delivery Green (--itexsa-green)
  '#7c3aed', // 3: Vivid Purple
  '#0891b2', // 4: Teal / Dark Cyan
  '#b45309', // 5: Warm Amber / Gold (--stage-payment-accent tone)
  '#dc2626', // 6: Review Red (--stage-review-accent)
  '#475569', // 7: Slate / Graphite
  '#4f46e5', // 8: Indigo
  '#059669', // 9: Emerald
  '#c026d3', // 10: Fuchsia / Orchid
  '#0284c7', // 11: Sky Blue
  '#c2410c', // 12: Rust / Deep Orange
  '#9333ea', // 13: Deep Violet
  '#0d9488', // 14: Dark Cyan
  '#854d0e', // 15: Ochre
])

// Fixed mappings for known catalog products, common accessories, and test fixtures.
// This guarantees that each category retains the exact same color regardless of the
// period queried, its position in the list, or the presence of other products.
const CANONICAL_PRODUCT_INDEXES = Object.freeze({
  // Core ITECSA catalog products
  lanyard: 0,
  tarjeta: 1,
  yoyo: 2,

  // Common merchandise and promotional products
  pulsera: 3,
  credencial: 4,
  credenciales: 4,
  pellon: 5,
  cinta: 6,
  bolsa: 7,
  bolsas: 7,
  llavero: 8,
  llaveros: 8,
  sticker: 9,
  stickers: 9,

  // Test fixtures & special categories
  'nuevo producto': 10,
  otro: 11,
  cero: 12,
  mixto: 13,
})

export function normalizeProductType(productType) {
  return String(productType ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function hashString(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function hslToHex(h, s, l) {
  const lightness = l / 100
  const a = (s * Math.min(lightness, 1 - lightness)) / 100
  const f = (n) => {
    const k = (n + h / 30) % 12
    const color = lightness - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Returns a color for the given palette index.
 * If the index exceeds the predefined palette length, expands the palette
 * in a controlled procedural way using the golden ratio hue distribution
 * with lightness adjusted for accessible contrast on white.
 */
export function getColorForIndex(index) {
  if (index >= 0 && index < PRODUCTION_PALETTE.length) {
    return PRODUCTION_PALETTE[index]
  }

  const offset = Math.max(0, index - PRODUCTION_PALETTE.length)
  const hue = Math.round((offset * 137.508 + 18) % 360)
  // Yellow/green hues (50-185°) have higher human luminance; adjust lightness to keep contrast >= 3.0
  const lightness = hue >= 50 && hue <= 185 ? 33 : 42
  return hslToHex(hue, 65, lightness)
}

/**
 * Consistently returns a distinct, accessible color for any product type.
 * Deterministic: the same product type will always receive the same color across
 * all periods, renders, and orderings.
 */
export function getProductTypeColor(productType) {
  const normalized = normalizeProductType(productType)
  if (!normalized) return PRODUCTION_PALETTE[0]

  if (Object.prototype.hasOwnProperty.call(CANONICAL_PRODUCT_INDEXES, normalized)) {
    return getColorForIndex(CANONICAL_PRODUCT_INDEXES[normalized])
  }

  // Deterministic fallback for dynamic or unforeseen products
  const dynamicIndex = PRODUCTION_PALETTE.length + (hashString(normalized) % 120)
  return getColorForIndex(dynamicIndex)
}
