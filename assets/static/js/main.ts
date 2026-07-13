// Browser entry. esbuild bundles this (inlining ./quiz) into a self-contained
// classic script with no exports, so it loads from a plain <script>. Keep it
// export-free and free of top-level await.
//
// One quiz per page load: pick a random country, show the question, and after a
// short delay reveal the capital with both population figures. Rotation is the
// signage player's job — it reloads the page, which draws the next country.

// Side-effect import: installs the replaceChildren shim for the older-browser
// degraded mode. Must stay first so the shim is in place before any render.
import '@screenly-labs/signage-kit/polyfills'
import { type Country, formatPopulation, isCountry, pickIndexAvoiding, type Population } from './quiz'

// How long the question stays up before the answer is revealed.
const REVEAL_DELAY_MS = 5000

const DATA_URL = '/static/data/countries.json'

// Remembers the last country shown so a signage reload doesn't repeat it.
// Wrapped because storage can be unavailable (private mode / locked-down player).
const LAST_KEY = 'capital-quiz:last-country'
const readLast = (): string | null => {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}
const writeLast = (country: string): void => {
  try {
    localStorage.setItem(LAST_KEY, country)
  } catch {
    // Storage unavailable — repeats just aren't suppressed; not worth failing over.
  }
}

// Shown if the data file can't be fetched or is empty, so the screen is never
// blank on signage with flaky connectivity. Mirrors the inline markup in index.html.
const FALLBACK: Country = {
  country: 'France',
  capital: 'Paris',
  capitalPopulation: { value: 2102650, year: 2021, source: 'Census, INSEE' },
  countryPopulation: { value: 67394000, year: 2020, source: 'Census, INSEE' }
}

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// "13.5 million (13,515,271)" — but just "842" for tiny capitals where the
// rounded and exact forms are identical.
const formatValue = (pop: Population): string => {
  const { abbreviated, exact } = formatPopulation(pop.value)
  return abbreviated === exact ? exact : `${abbreviated} (${exact})`
}

// "2014 census, INE Angola" — the source usually already names the year, so only
// prepend it (e.g. for "World Bank (SP.POP.TOTL)") when it's missing, to avoid
// reading back "2014 · 2014 census, …".
const formatMeta = (pop: Population): string => {
  const year = String(pop.year)
  return pop.source.includes(year) ? pop.source : `${pop.year} · ${pop.source}`
}

const renderQuestion = (country: Country): void => {
  setText('country-name', country.country)
  document.documentElement.dataset.state = 'question'
}

const renderReveal = (country: Country): void => {
  setText('capital-name', country.capital)
  setText('capital-pop', formatValue(country.capitalPopulation))
  setText('capital-pop-meta', formatMeta(country.capitalPopulation))
  setText('country-pop', formatValue(country.countryPopulation))
  setText('country-pop-meta', formatMeta(country.countryPopulation))

  const noteEl = document.getElementById('reveal-note')
  if (noteEl) noteEl.textContent = country.note ?? ''

  document.documentElement.dataset.state = 'reveal'
}

const loadCountry = async (): Promise<Country> => {
  try {
    // no-cache: revalidate so a redeploy's new data isn't masked by a stale
    // cached copy, while still working offline from cache when unreachable.
    const res = await fetch(DATA_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    const countries = Array.isArray(data) ? data.filter(isCountry) : []
    if (countries.length === 0) throw new Error('no valid countries in payload')
    const avoid = countries.findIndex((c) => c.country === readLast())
    const country = countries[pickIndexAvoiding(countries.length, avoid)]
    writeLast(country.country)
    return country
  } catch (error) {
    console.error('Capital quiz: using fallback —', error)
    return FALLBACK
  }
}

// On a Screenly player the viewer is already a Screenly customer, so the
// promotional Screenly badge is removed. The 'screenly-viewer' token in the
// user agent marks these devices; every other browser keeps the badge.
const removeScreenlyBranding = (): void => {
  if (navigator.userAgent.includes('screenly-viewer')) {
    document.querySelector('.brand')?.remove()
  }
}

const init = (): void => {
  removeScreenlyBranding()
  loadCountry().then((country) => {
    renderQuestion(country)
    setTimeout(() => renderReveal(country), REVEAL_DELAY_MS)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
