import { buildCreateOrderPayload } from '../modules/orders/utils/createOrderPayload.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOrdersApi } from '../modules/orders/hooks/useOrdersApi'
import { canContinueFromSalesNote, validateSalesNoteStep } from '../modules/orders/utils/orderCreateValidation'
import { normalizeSalesNoteCode } from '../modules/orders/utils/orderCreateFormatters'
import { useToast } from '../shared/notifications/useToast'
import { publicOperationMessage } from '../shared/notifications/operationFeedback'

function createInitialDraft() {
  return {
    salesNoteCode: '', comments: '', managerRecord: null, priority: null,
  }
}

function getErrorMessage(error, fallback) {
  return publicOperationMessage(error, fallback)
}

function toDisplayRecord(salesNote) {
  const items = Array.isArray(salesNote.items) ? salesNote.items : []
  const productTypes = [...new Set(items.map((item) => item.tipoProducto).filter(Boolean))]

  return {
    ...salesNote,
    client: salesNote.cliente?.nombre ?? '-',
    rut: salesNote.cliente?.rut ?? '-',
    dueDate: salesNote.fechaEntregaTentativaOrigen ?? '-',
    productType: productTypes.length > 1 ? 'Mixto' : productTypes[0] ?? '-',
  }
}

export function useOrderCreateFlow({ navigate }) {
  const notify = useToast()
  const ordersApi = useOrdersApi()
  const [draft, setDraft] = useState(createInitialDraft)
  const [errors, setErrors] = useState({})
  const [showPinModal, setShowPinModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const requestVersion = useRef(0)
  const submitting = useRef(false)
  const confirmedPayload = useRef(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestVersion.current += 1
    }
  }, [])

  const salesNoteIsValid = useMemo(
    () => canContinueFromSalesNote({
      managerRecord: draft.managerRecord,
      salesNoteCode: draft.salesNoteCode,
      comments: draft.comments,
    }),
    [draft.managerRecord, draft.salesNoteCode, draft.comments],
  )

  function updateDraftField(field, value) {
    if (submitting.current) return
    confirmedPayload.current = null
    setShowConfirmModal(false)
    if (field === 'salesNoteCode') {
      requestVersion.current += 1
      setIsSearching(false)
    }
    setDraft((previous) => {
      const nextValue = field === 'salesNoteCode' ? normalizeSalesNoteCode(value) : value
      const nextDraft = { ...previous, [field]: nextValue }

      if (field === 'salesNoteCode') {
        nextDraft.managerRecord = null
      }

      return nextDraft
    })
    setErrors((previous) => {
      if (!previous[field]) return previous

      return { ...previous, [field]: null }
    })
  }

  async function handleSearchSalesNote() {
    if (submitting.current) return
    const code = normalizeSalesNoteCode(draft.salesNoteCode)


    if (!code) {
      setErrors((previous) => ({ ...previous, salesNoteCode: 'Debe ingresar el codigo de Nota de Venta.' }))
      return
    }

    if (draft.managerRecord) return

    setErrors((previous) => ({ ...previous, salesNoteCode: null }))
    const version = ++requestVersion.current
    setIsSearching(true)

    try {
      const salesNote = await ordersApi.getSalesNote(code)
      if (!mounted.current || version !== requestVersion.current) return
      const managerRecord = toDisplayRecord(salesNote)

      setDraft((previous) => ({ ...previous, salesNoteCode: code, managerRecord }))
      setErrors((previous) => ({ ...previous, salesNoteCode: null }))
    } catch (error) {
      if (!mounted.current || version !== requestVersion.current) return
      const message = getErrorMessage(error, `No se encontro informacion para ${code}.`)
      setDraft((previous) => ({ ...previous, salesNoteCode: code, managerRecord: null }))
      setErrors((previous) => ({
        ...previous,
        salesNoteCode: message,
      }))
    } finally {
      if (mounted.current && version === requestVersion.current) setIsSearching(false)
    }
  }

  function updatePriority(priority) {
    if (submitting.current) return
    confirmedPayload.current = null
    setShowConfirmModal(false)
    setDraft((previous) => ({
      ...previous,
      priority: previous.priority === priority ? null : priority,
    }))
  }

  function handleOpenConfirmModal() {
    if (submitting.current) return
    const salesNoteErrors = validateSalesNoteStep(draft)

    if (Object.keys(salesNoteErrors).length > 0) {
      setErrors(salesNoteErrors)
      return
    }

    confirmedPayload.current = Object.freeze(buildCreateOrderPayload(draft))
    setShowConfirmModal(true)
  }

  function handleConfirmRegister() {
    if (submitting.current || !confirmedPayload.current) return
    setShowConfirmModal(false)
    setShowPinModal(true)
  }

  async function authorizeRegister({ pin }) {
    if (submitting.current || !confirmedPayload.current) return
    submitting.current = true
    const payload = confirmedPayload.current
    setIsRegistering(true)
    try {
      await ordersApi.createOrder({ ...payload, pin })
      if (!mounted.current) return

      setShowConfirmModal(false)
      setShowPinModal(false)
      confirmedPayload.current = null
      setDraft(createInitialDraft())
      setErrors({})
      notify.success('Pedido registrado correctamente.', {
        action: { label: 'Ver pedidos', onClick: () => navigate('/pagos') },
      })
    } catch (error) {
      if (!mounted.current) return
      throw error
    } finally {
      submitting.current = false
      if (mounted.current) setIsRegistering(false)
    }
  }

  function closeConfirmModal() {
    if (submitting.current) return
    confirmedPayload.current = null
    setShowConfirmModal(false)
    setShowPinModal(false)
  }

  function resetFlow() {
    if (submitting.current) return
    requestVersion.current += 1
    confirmedPayload.current = null
    setIsSearching(false)
    setShowConfirmModal(false)
    setShowPinModal(false)
    setDraft(createInitialDraft())
    setErrors({})
  }

  return {
    draft,
    errors,
    isRegistering,
    isSearching,
    salesNoteIsValid,
    showConfirmModal,
    showPinModal,
    actions: {
      handleConfirmRegister,
      authorizeRegister,
      handleOpenConfirmModal,
      handleSearchSalesNote,
      resetFlow,
      closeConfirmModal,
      updateDraftField,
      updatePriority,
    },
  }
}
