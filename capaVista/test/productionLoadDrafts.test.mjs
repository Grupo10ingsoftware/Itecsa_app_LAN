import assert from 'node:assert/strict'
import test from 'node:test'
import { updateLoadDraft, loadDraftConflicts, loadDraftEntries } from '../src/modules/kanban/utils/productionLoadDrafts.js'

const detail = { detailId: 7, salesNoteNumber: 'TEST-7', dailyQuantity: 20, remainingQuantity: 80 }
const load = { date: '2026-11-10', details: [detail] }
const draft = () => updateLoadDraft({}, detail, 35, load.date)

test('only edited quantities become writes; newly entered orders with zero load do not', () => {
  const nextLoad = { ...load, details: [detail, { detailId: 8, dailyQuantity: 0, remainingQuantity: 50 }] }
  assert.deepEqual(loadDraftEntries(draft(), nextLoad), [{ detailId: 7, quantity: 35 }])
  assert.deepEqual(loadDraftEntries({}, nextLoad), [])
})
test('an unchanged server refresh preserves a draft and its original baseline', () => {
  const pending = draft()
  assert.deepEqual(loadDraftConflicts(pending, structuredClone(load)), [])
  assert.equal(pending[7].quantity, 35)
  const editedAgain = updateLoadDraft(pending, detail, 40, load.date)
  assert.equal(editedAgain[7].baseline, 20)
})
test('returning an input to the current server quantity removes the draft', () => {
  assert.deepEqual(updateLoadDraft(draft(), detail, 20, load.date), {})
})
test('a removed production detail is not silently discarded or written', () => {
  const pending = draft()
  assert.match(loadDraftConflicts(pending, { ...load, details: [] })[0], /ya no está en producción/)
  assert.throws(() => loadDraftEntries(pending, { ...load, details: [] }), /ya no está en producción/)
  assert.equal(pending[7].quantity, 35)
})
test('a server-side quantity change requires reviewing the draft', () => {
  const updated = { ...load, details: [{ ...detail, dailyQuantity: 25 }] }
  assert.throws(() => loadDraftEntries(draft(), updated), /cambió mientras lo editabas/)
  assert.deepEqual(updateLoadDraft(draft(), updated.details[0], 25, load.date), {})
})
test('drafts cannot cross operational days', () => {
  assert.throws(() => loadDraftEntries(draft(), { ...load, date: '2026-11-11' }), /otra jornada/)
})
test('a new remaining quantity cannot silently clamp a pending edit', () => {
  const updated = { ...load, details: [{ ...detail, remainingQuantity: 10 }] }
  assert.throws(() => loadDraftEntries(draft(), updated), /supera lo pendiente/)
})
