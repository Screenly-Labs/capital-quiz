import { describe, expect, test } from 'bun:test'
import countries from '../assets/static/data/countries.json'
import {
  type Country,
  formatPopulation,
  isCountry,
  isPopulation,
  pickIndexAvoiding,
  pickRandomIndex
} from '../assets/static/js/quiz'

// Plausibility bounds for the shipped dataset. Generous on purpose — they exist
// to catch gross data corruption (a city pop in the billions, a country pop of
// zero), not to second-guess individual census figures.
const EXPECTED_COUNT = 193
const MIN_CITY_POP = 100 // Ngerulmud, Palau is the smallest capital
const MAX_CITY_POP = 40_000_000 // generous ceiling above any single city proper
const MIN_COUNTRY_POP = 9_000 // Tuvalu / Nauru are the smallest
const MAX_COUNTRY_POP = 1_600_000_000 // India / China
const MIN_YEAR = 1990
const MAX_YEAR = 2100

describe('pickRandomIndex', () => {
  test('returns an in-range integer for every rng value', () => {
    const length = 193
    for (const r of [0, 0.001, 0.25, 0.5, 0.999999, 1]) {
      const i = pickRandomIndex(length, () => r)
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(length)
    }
  })

  test('maps the rng range across the full index range', () => {
    expect(pickRandomIndex(10, () => 0)).toBe(0)
    expect(pickRandomIndex(10, () => 0.99)).toBe(9)
    expect(pickRandomIndex(10, () => 1)).toBe(9) // clamped, never out of range
  })

  test('guards against empty or invalid lengths', () => {
    expect(pickRandomIndex(0)).toBe(0)
    expect(pickRandomIndex(-5)).toBe(0)
    expect(pickRandomIndex(Number.NaN)).toBe(0)
  })
})

describe('pickIndexAvoiding', () => {
  test('re-rolls off the avoided index when another option exists', () => {
    // rng yields 0.5 → index 1 (avoided), then 0.0 → index 0
    const seq = [0.5, 0.0]
    let i = 0
    const rng = () => seq[i++]
    expect(pickIndexAvoiding(3, 1, rng)).toBe(0)
  })

  test('returns the avoided index when it is the only option', () => {
    expect(pickIndexAvoiding(1, 0, () => 0)).toBe(0)
  })

  test('avoid < 0 imposes no constraint', () => {
    expect(pickIndexAvoiding(5, -1, () => 0)).toBe(0)
  })

  test('gives up after the retry budget rather than looping forever', () => {
    // An rng that always lands on the avoided index must still terminate.
    expect(pickIndexAvoiding(2, 1, () => 0.99)).toBe(1)
  })
})

describe('isPopulation', () => {
  test('accepts a well-formed figure', () => {
    expect(isPopulation({ value: 1000, year: 2020, source: 'Census' })).toBe(true)
  })

  test('rejects malformed figures', () => {
    expect(isPopulation(null)).toBe(false)
    expect(isPopulation({ value: 0, year: 2020, source: 'x' })).toBe(false)
    expect(isPopulation({ value: -5, year: 2020, source: 'x' })).toBe(false)
    expect(isPopulation({ value: 100, year: 1700, source: 'x' })).toBe(false)
    expect(isPopulation({ value: 100, year: 2020, source: '' })).toBe(false)
    expect(isPopulation({ value: 100, year: 2020.5, source: 'x' })).toBe(false)
  })
})

describe('isCountry', () => {
  const valid: Country = {
    country: 'Japan',
    capital: 'Tokyo',
    capitalPopulation: { value: 13515271, year: 2015, source: 'Census' },
    countryPopulation: { value: 123975371, year: 2024, source: 'World Bank' }
  }

  test('accepts a well-formed country (with and without a note)', () => {
    expect(isCountry(valid)).toBe(true)
    expect(isCountry({ ...valid, note: 'Administrative capital' })).toBe(true)
  })

  test('rejects malformed values', () => {
    expect(isCountry(null)).toBe(false)
    expect(isCountry('nope')).toBe(false)
    expect(isCountry({ ...valid, country: '' })).toBe(false)
    expect(isCountry({ ...valid, capital: '' })).toBe(false)
    expect(isCountry({ ...valid, capitalPopulation: { value: 1 } })).toBe(false)
    expect(isCountry({ ...valid, note: 42 })).toBe(false)
  })
})

describe('formatPopulation', () => {
  test('abbreviates millions and billions, keeps the exact grouped figure', () => {
    expect(formatPopulation(13515271)).toEqual({ abbreviated: '13.5 million', exact: '13,515,271' })
    expect(formatPopulation(1408975000)).toEqual({ abbreviated: '1.4 billion', exact: '1,408,975,000' })
    expect(formatPopulation(689545)).toEqual({ abbreviated: '690 thousand', exact: '689,545' })
  })

  test('leaves tiny figures unabbreviated (abbreviated === exact)', () => {
    const { abbreviated, exact } = formatPopulation(271)
    expect(abbreviated).toBe('271')
    expect(exact).toBe('271')
  })
})

describe('countries.json dataset', () => {
  const data = countries as Country[]

  test(`ships exactly ${EXPECTED_COUNT} countries`, () => {
    expect(data.length).toBe(EXPECTED_COUNT)
  })

  test('every entry is a valid country', () => {
    for (const c of data) expect(isCountry(c)).toBe(true)
  })

  test('has no duplicate countries or capitals it should not', () => {
    const names = new Set(data.map((c) => c.country.toLowerCase()))
    expect(names.size).toBe(data.length)
  })

  test('every population is an integer in a plausible range with provenance', () => {
    for (const c of data) {
      for (const pop of [c.capitalPopulation, c.countryPopulation]) {
        expect(Number.isInteger(pop.value)).toBe(true)
        expect(pop.year).toBeGreaterThanOrEqual(MIN_YEAR)
        expect(pop.year).toBeLessThanOrEqual(MAX_YEAR)
        expect(pop.source.length).toBeGreaterThan(0)
      }
      expect(c.capitalPopulation.value).toBeGreaterThanOrEqual(MIN_CITY_POP)
      expect(c.capitalPopulation.value).toBeLessThanOrEqual(MAX_CITY_POP)
      expect(c.countryPopulation.value).toBeGreaterThanOrEqual(MIN_COUNTRY_POP)
      expect(c.countryPopulation.value).toBeLessThanOrEqual(MAX_COUNTRY_POP)
    }
  })

  test('every country can be selected', () => {
    expect(isCountry(data[pickRandomIndex(data.length, () => 0)])).toBe(true)
    expect(isCountry(data[pickRandomIndex(data.length, () => 0.999999)])).toBe(true)
  })
})
