// Frozen baseline 51a4d89, used only for equivalence and benchmarks.
export function buildProductionChart(production, colors) {
  const parsedTotal = Number(production?.total ?? 0)
  const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 0
  const products = Array.isArray(production?.products) ? production.products : []
  const palette = Array.isArray(colors) && colors.length > 0 ? colors : ['#64748b']
  const result = products.reduce((accumulator, product, index) => {
    const parsedQuantity = Number(product.quantity)
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0
    const percentage = total ? (quantity / total) * 100 : 0
    const segment = {
      ...product,
      percentage,
      start: accumulator.end,
      end: accumulator.end + percentage,
      color: palette[index % palette.length],
    }

    return {
      end: segment.end,
      segments: [...accumulator.segments, segment],
    }
  }, { end: 0, segments: [] })

  return { total, segments: result.segments }
}
