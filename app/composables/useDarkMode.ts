const isDark = ref(false)

export function useDarkMode() {
  function init() {
    const stored = localStorage.getItem('bsp-dark-mode')
    if (stored !== null) {
      isDark.value = stored === 'true'
    } else {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    apply()

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('bsp-dark-mode') === null) {
        isDark.value = e.matches
        apply()
      }
    })
  }

  function toggle() {
    isDark.value = !isDark.value
    localStorage.setItem('bsp-dark-mode', String(isDark.value))
    apply()
  }

  function apply() {
    document.documentElement.classList.toggle('dark', isDark.value)
  }

  return { isDark: readonly(isDark), toggle, init }
}
