const scopes = new WeakMap()
let nextScope = 0
export function calendarScope(api) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)
}

export function mergeCalendarCollections(month, pending) {
  const ids = new Set(month.map(item => String(item.id)))
  return [...month, ...pending.filter(item => !ids.has(String(item.id)))]
}

// Overrides belong only to a read already pending at commit time, never a cache
// used to replace future authorized server reads.
export function reconcileCalendarRead(rows, overrides, range) {
  const result = new Map(rows.map(item => [String(item.id), item]))
  for (const [id, item] of overrides) {
    const date = item.dueDate
    const belongs = range.unscheduled ? !date : Boolean(date && date >= range.from && date <= range.to)
    if (belongs) result.set(id, item)
    else result.delete(id)
  }
  return [...result.values()]
}
