export function updateLoadDraft(drafts, detail, quantity, date) {
  const next = { ...drafts }
  if (quantity === Number(detail.dailyQuantity ?? 0)) {
    delete next[detail.detailId]
  } else {
    next[detail.detailId] = {
      ...drafts[detail.detailId],
      baseline: drafts[detail.detailId]?.baseline ?? Number(detail.dailyQuantity ?? 0),
      date: drafts[detail.detailId]?.date ?? date,
      label: detail.salesNoteNumber ?? detail.detailId,
      quantity,
    }
  }
  return next
}

export function loadDraftConflicts(drafts, load) {
  const details = new Map(load.details.map(detail => [String(detail.detailId), detail]))
  return Object.entries(drafts).flatMap(([id, draft]) => {
    const detail = details.get(id)
    const label = `El pedido ${draft.label}`
    if (draft.date !== load.date) return [`${label} tiene cambios pendientes de otra jornada. Descártalos y revisa la carga actual.`]
    if (!detail) return [`${label} ya no está en producción. Sus cambios pendientes no se pueden guardar.`]
    if (draft.baseline !== Number(detail.dailyQuantity ?? 0)) {
      return [`La carga diaria del pedido ${draft.label} cambió mientras lo editabas. Descarta el borrador y revisa el valor actual.`]
    }
    if (draft.quantity > Number(detail.remainingQuantity ?? 0) + Number(detail.dailyQuantity ?? 0)) {
      return [`La carga del pedido ${draft.label} supera lo pendiente. Revisa la cantidad antes de guardar.`]
    }
    return []
  })
}

export function loadDraftEntries(drafts, load) {
  const conflicts = loadDraftConflicts(drafts, load)
  if (conflicts.length) throw new Error(conflicts[0])
  return Object.entries(drafts).map(([id, draft]) => ({ detailId: Number(id), quantity: draft.quantity }))
}
