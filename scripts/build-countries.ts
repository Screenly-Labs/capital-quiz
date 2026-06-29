#!/usr/bin/env bun
// Stage 1 of the data pipeline: assemble a *candidate* dataset for the 193 UN
// member states by pulling real, sourced figures from two authoritative APIs,
// then cross-checking the seed capitals. It writes scripts/countries.candidate.json
// (gitignored, untrusted) — NOT the shipped file. Stage 2 (multi-agent
// verification) independently re-checks every field before anything is shipped.
//
// Sources:
//   - Country population: World Bank, indicator SP.POP.TOTL, most recent value.
//   - Capital + city population: Wikidata (P36 capital, P1082 population with the
//     P585 point-in-time qualifier), latest available year per capital.
//
// Run: bun run build-countries
//
// Capital mismatches (seed vs Wikidata P36) and missing populations are printed
// at the end so they can be steered into the verification pass.

import { UN_MEMBERS } from './un-members'

const DEST = 'scripts/countries.candidate.json'
const UA = 'capital-quiz-build/0.1 (https://github.com/Screenly-Labs/capital-quiz)'

type Figure = { value: number; year: number; source: string }
type Candidate = {
  country: string
  iso3: string
  capital: string
  capitalPopulation: Figure | null
  countryPopulation: Figure | null
  note?: string
  wikidataCapitals: string[]
}

// Loose match so "São Tomé" ≈ "Sao Tome", "Washington, D.C." ≈ "Washington DC".
const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// --- World Bank: most recent total population per country -------------------
const fetchCountryPopulations = async (): Promise<Map<string, Figure>> => {
  const url =
    'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`World Bank HTTP ${res.status}`)
  const body = (await res.json()) as [unknown, Array<Record<string, unknown>> | null]
  const rows = Array.isArray(body[1]) ? body[1] : []
  const out = new Map<string, Figure>()
  for (const row of rows) {
    const iso3 = String(row.countryiso3code ?? '')
    const value = row.value
    const year = Number.parseInt(String(row.date ?? ''), 10)
    if (iso3 && typeof value === 'number' && Number.isFinite(year)) {
      out.set(iso3, { value, year, source: 'World Bank (SP.POP.TOTL)' })
    }
  }
  return out
}

// --- Wikidata: capital(s) + latest capital-city population per country ------
type WdRow = { iso3: string; capital: string; pop?: number; year?: number }

const fetchWikidata = async (iso3s: string[]): Promise<WdRow[]> => {
  const values = iso3s.map((c) => `"${c}"`).join(' ')
  const query = `
    SELECT ?iso3 ?capitalLabel ?pop ?date WHERE {
      VALUES ?iso3 { ${values} }
      ?country wdt:P298 ?iso3 .
      ?country wdt:P36 ?capital .
      OPTIONAL {
        ?capital p:P1082 ?ps .
        ?ps ps:P1082 ?pop .
        OPTIONAL { ?ps pq:P585 ?date . }
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ query })
  })
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`)
  const json = (await res.json()) as {
    results: { bindings: Array<Record<string, { value: string }>> }
  }
  return json.results.bindings.map((b) => ({
    iso3: b.iso3?.value ?? '',
    capital: b.capitalLabel?.value ?? '',
    pop: b.pop ? Number.parseInt(b.pop.value, 10) : undefined,
    year: b.date ? Number.parseInt(b.date.value.slice(0, 4), 10) : undefined
  }))
}

// Pick the latest-year population for the Wikidata capital that best matches the
// seed capital (falling back to whichever capital has population data).
const bestCapitalPop = (
  rows: WdRow[],
  seedCapital: string
): { figure: Figure | null; capitals: string[] } => {
  const capitals = [...new Set(rows.map((r) => r.capital).filter(Boolean))]
  const matched = rows.filter((r) => normalize(r.capital) === normalize(seedCapital))
  const pool = (matched.length ? matched : rows).filter(
    (r) => typeof r.pop === 'number' && typeof r.year === 'number'
  )
  if (!pool.length) return { figure: null, capitals }
  pool.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const top = pool[0]
  return {
    figure: { value: top.pop as number, year: top.year as number, source: 'Wikidata (P1082)' },
    capitals
  }
}

console.log('Fetching World Bank country populations…')
const wbPops = await fetchCountryPopulations()
console.log(`  got ${wbPops.size} country populations`)

console.log('Fetching Wikidata capitals + city populations…')
const wdRows = await fetchWikidata(UN_MEMBERS.map((c) => c.iso3))
const wdByIso = new Map<string, WdRow[]>()
for (const r of wdRows) {
  if (!wdByIso.has(r.iso3)) wdByIso.set(r.iso3, [])
  wdByIso.get(r.iso3)?.push(r)
}
console.log(`  got ${wdRows.length} rows across ${wdByIso.size} countries`)

const candidates: Candidate[] = []
const capitalFlags: string[] = []
const missingCapitalPop: string[] = []
const missingCountryPop: string[] = []

for (const seed of UN_MEMBERS) {
  const rows = wdByIso.get(seed.iso3) ?? []
  const { figure: capitalPopulation, capitals } = bestCapitalPop(rows, seed.capital)
  const countryPopulation = wbPops.get(seed.iso3) ?? null

  if (capitals.length && !capitals.some((c) => normalize(c) === normalize(seed.capital))) {
    capitalFlags.push(`${seed.country}: seed "${seed.capital}" vs Wikidata [${capitals.join(', ')}]`)
  }
  if (!capitalPopulation) missingCapitalPop.push(`${seed.country} (${seed.capital})`)
  if (!countryPopulation) missingCountryPop.push(seed.country)

  candidates.push({
    country: seed.country,
    iso3: seed.iso3,
    capital: seed.capital,
    capitalPopulation,
    countryPopulation,
    ...(seed.note ? { note: seed.note } : {}),
    wikidataCapitals: capitals
  })
}

await Bun.write(DEST, `${JSON.stringify(candidates, null, 2)}\n`)

console.log(`\n✓ Wrote ${candidates.length} candidates to ${DEST}`)
console.log(`\n⚑ Capital mismatches vs Wikidata (${capitalFlags.length}):`)
for (const f of capitalFlags) console.log(`   - ${f}`)
console.log(`\n⚑ Missing capital-city population (${missingCapitalPop.length}):`)
console.log(`   ${missingCapitalPop.join(', ') || '(none)'}`)
console.log(`\n⚑ Missing country population (${missingCountryPop.length}):`)
console.log(`   ${missingCountryPop.join(', ') || '(none)'}`)
