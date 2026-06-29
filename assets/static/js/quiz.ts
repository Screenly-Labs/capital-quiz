// Pure, framework-free helpers for the capital quiz. Kept separate from main.ts
// so they can be unit-tested with `bun:test`; main.ts is the (untestable,
// no-exports) browser entry that wires these into the DOM.

// A population figure always travels with its provenance: the `year` it is for
// and a human-readable `source` (e.g. "Census, Statistics Bureau of Japan"), so
// nothing is shown on screen without saying where it came from.
export type Population = { value: number; year: number; source: string }

export type Country = {
  country: string
  capital: string
  capitalPopulation: Population
  countryPopulation: Population
  // Optional footnote for non-obvious cases (e.g. a country with split capitals).
  note?: string
}

// Returns an integer in [0, length). `rng` is injectable so tests are
// deterministic. Guards against empty/invalid input and an rng that returns 1.
export const pickRandomIndex = (length: number, rng: () => number = Math.random): number => {
  if (!Number.isFinite(length) || length <= 0) return 0
  return Math.min(length - 1, Math.floor(rng() * length))
}

// A plausible census/estimate year — guards against typos like 215 or 20155 and
// against figures attributed to the future.
const isReasonableYear = (year: unknown): year is number =>
  typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= 2100

// Runtime type guard for one population figure — fetched JSON is untrusted.
export const isPopulation = (value: unknown): value is Population => {
  if (typeof value !== 'object' || value === null) return false
  const pop = value as Record<string, unknown>
  return (
    typeof pop.value === 'number' &&
    Number.isFinite(pop.value) &&
    pop.value > 0 &&
    isReasonableYear(pop.year) &&
    typeof pop.source === 'string' &&
    pop.source.length > 0
  )
}

// Picks an index in [0, length) that avoids `avoid` when possible, re-rolling a
// few times. Each signage page load is independent, so without this the same
// country can come up twice in a row; this makes consecutive reloads always
// differ (given more than one option). `avoid < 0` means "no constraint".
export const pickIndexAvoiding = (
  length: number,
  avoid: number,
  rng: () => number = Math.random
): number => {
  let i = pickRandomIndex(length, rng)
  for (let tries = 0; tries < 8 && length > 1 && i === avoid; tries++) {
    i = pickRandomIndex(length, rng)
  }
  return i
}

// Runtime type guard — the fetched JSON is untrusted `unknown` until validated.
export const isCountry = (value: unknown): value is Country => {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.country === 'string' &&
    c.country.length > 0 &&
    typeof c.capital === 'string' &&
    c.capital.length > 0 &&
    isPopulation(c.capitalPopulation) &&
    isPopulation(c.countryPopulation) &&
    (c.note === undefined || typeof c.note === 'string')
  )
}

// Renders a population two ways for the reveal: a friendly rounded headline
// ("13.5 million") and the exact grouped figure ("13,515,271"). `abbreviated`
// equals `exact` for small figures (< 1000), where rounding adds nothing.
export const formatPopulation = (value: number): { abbreviated: string; exact: string } => {
  const exact = Math.round(value).toLocaleString('en-US')
  const round1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-US')

  let abbreviated: string
  if (value >= 1_000_000_000) abbreviated = `${round1(value / 1_000_000_000)} billion`
  else if (value >= 1_000_000) abbreviated = `${round1(value / 1_000_000)} million`
  else if (value >= 1_000) abbreviated = `${Math.round(value / 1_000).toLocaleString('en-US')} thousand`
  else abbreviated = exact

  return { abbreviated, exact }
}
