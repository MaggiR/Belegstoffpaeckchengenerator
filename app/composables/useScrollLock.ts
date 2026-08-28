let lockCount = 0

function lockScroll() {
  if (lockCount === 0) {
    document.documentElement.classList.add('overflow-hidden')
    document.body.classList.add('overflow-hidden')
  }
  lockCount++
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }
}

/** Verhindert Scrollen im Hintergrund, solange ein Modal geöffnet ist. */
export function useScrollLock(isLocked: MaybeRefOrGetter<boolean>) {
  watch(
    () => toValue(isLocked),
    (locked, _old, onCleanup) => {
      if (!locked) return
      lockScroll()
      onCleanup(unlockScroll)
    },
    { immediate: true },
  )
}
