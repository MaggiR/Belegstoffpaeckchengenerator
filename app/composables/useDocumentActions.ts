/**
 * Belegaktionen, die in der Titelzeile ausgelöst, aber im Zuordnungsschritt
 * ausgeführt werden. Der Zähler dient als Signal an die Seitenleiste, die als
 * Einzige den Dateidialog besitzt.
 */
const uploadRequest = ref(0)
const showUnassignAllConfirm = ref(false)

export function useDocumentActions() {
  const {
    bookings,
    unassignedDocuments,
    assignDocument,
    unassignAllDocuments,
    beginAssignmentBatch,
    endAssignmentBatch,
  } = useAppState()
  const { autoMatch } = useMatching()

  function requestUpload(): void {
    uploadRequest.value++
  }

  function runAutoMatch(): void {
    const bookingsWithoutDoc = bookings.value.filter(b => b.documentIds.length === 0)
    const assignments = autoMatch(bookingsWithoutDoc, unassignedDocuments.value)
    if (assignments.size === 0) return

    beginAssignmentBatch()
    try {
      for (const [bookingId, docId] of assignments) {
        assignDocument(bookingId, docId)
      }
    } finally {
      endAssignmentBatch()
    }
  }

  function confirmUnassignAll(): void {
    unassignAllDocuments()
    showUnassignAllConfirm.value = false
  }

  return {
    uploadRequest,
    requestUpload,
    runAutoMatch,
    showUnassignAllConfirm,
    confirmUnassignAll,
  }
}
