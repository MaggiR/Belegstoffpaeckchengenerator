const SEARCH_LOCALE = 'de-DE'

/** Unicode-Collation für akzent- und case-insensitive Suche (UAX #10). */
const searchCollator = new Intl.Collator(SEARCH_LOCALE, {
  usage: 'search',
  sensitivity: 'base',
})

/** Kanonische Unicode-Form vor jedem Vergleich (NFKC). */
function normalizeUnicode(text: string): string {
  return text.normalize('NFKC')
}

/**
 * Varianten für deutschsprachige Schreibweisen, die Unicode-Äquivalenz
 * nicht abdeckt (ß/ss, ae/oe/ue als Umlaut-Ersatz).
 */
function germanSearchVariants(text: string): string[] {
  const base = normalizeUnicode(text)
  const variants = new Set([base])

  if (base.includes('ß')) {
    variants.add(base.replace(/ß/g, 'ss'))
  }

  const expanded = base
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')

  variants.add(expanded)

  return [...variants]
}

/**
 * Teilstring-Suche codepoint-basiert via Intl.Collator – nicht String.includes(),
 * das nur UTF-16-Codeunits vergleicht und Akzente nicht ignoriert.
 */
function collatorIncludes(haystack: string, needle: string): boolean {
  const hayChars = Array.from(haystack)
  const needleChars = Array.from(needle)

  if (needleChars.length === 0) return true
  if (needleChars.length > hayChars.length) return false

  outer: for (let i = 0; i <= hayChars.length - needleChars.length; i++) {
    for (let j = 0; j < needleChars.length; j++) {
      if (searchCollator.compare(hayChars[i + j]!, needleChars[j]!) !== 0) {
        continue outer
      }
    }
    return true
  }

  return false
}

/** Prüft, ob der Suchbegriff im Text vorkommt (Unicode-locale-aware, deutsch-tolerant). */
export function textMatchesSearch(text: string, query: string): boolean {
  const q = query.trim()
  if (!q) return true

  const hayVariants = germanSearchVariants(text)
  const queryVariants = germanSearchVariants(q)

  return hayVariants.some(hay =>
    queryVariants.some(needle => collatorIncludes(hay, needle)),
  )
}

export function fieldsMatchSearch(
  fields: Array<string | null | undefined>,
  query: string,
): boolean {
  const q = query.trim()
  if (!q) return true
  return fields.some(field => field && textMatchesSearch(field, q))
}
