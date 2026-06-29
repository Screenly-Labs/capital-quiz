# CLAUDE.md

Guidance for working in this repo.

## What this is

A **static** full-screen capital-city quiz for digital signage, hosted on
**GitHub Pages**. On each page load it picks one random UN member country, shows
**"What is the capital of {Country}?"**, and after ~5 seconds reveals the capital
with both its **city population** and the **country population** (each with a
census/estimate year and source). Sibling to the `quotes` app and built the same
way — **no server**, no DB: curated JSON shipped in-repo, selected client-side.

**One quiz per load.** There is no in-app rotation loop; the signage player
reloads the page on its own schedule, and each load draws the next country. The
only in-page timer is the 5s question→reveal (`REVEAL_DELAY_MS` in `main.ts`).

## Stack & conventions

- **Bun** for everything (package manager, bundler, test runner). Use `bun` /
  `bunx` — never npm/npx.
- **TypeScript**, strict. All browser JS is authored as `.ts` and bundled by Bun.
- **Tailwind CSS v4**, CSS-first: tokens live in `@theme` in
  `assets/static/styles/tailwind.css`; compiled by `@tailwindcss/cli` at build.
- **Biome** for lint/format: single quotes, no semicolons, 2-space, 100 cols.
  CSS is intentionally excluded from Biome (it doesn't parse Tailwind at-rules).

## Commands

```sh
bun install         # deps; vendored fonts come from @fontsource via sync-fonts
bun run dev         # build + serve dist/ locally
bun run build       # assemble dist/ (see below)
bun test            # bun:test — helpers + dataset validation
bun run typecheck   # tsc --noEmit
bun run lint        # biome lint --error-on-warnings
bun run build-countries  # regenerate the candidate dataset (one-off, see Data)
```

## Layout & build

Web root is served from the site root (custom domain), so assets are referenced
absolutely as `/static/...`.

- `index.html` — the page shell. Ships a fallback country (France/Paris) inline so
  the screen is never blank pre-JS. Asset URLs carry `?v=__ASSET_VERSION__`,
  replaced at build.
- `assets/static/js/quiz.ts` — **pure, exported, unit-tested** helpers and types
  (`Country`, `Population`, `isCountry`, `isPopulation`, `pickRandomIndex`,
  `formatPopulation`).
- `assets/static/js/main.ts` — the browser **entry**. Fetches `countries.json`,
  picks one, renders the question, then reveals the answer after `REVEAL_DELAY_MS`.
  Falls back gracefully. Keep it **export-free** and free of top-level `await`.
- `assets/static/data/countries.json` — the 193 verified country records.

`build.js` builds into `dist/` **without mutating sources**: vendor fonts → copy
`index.html` + static assets → compile+minify Tailwind → bundle+minify the TS →
stamp a sha256 content hash into `?v=` URLs → write `CNAME` (`capitals.srly.io`).
`dist/` is gitignored and is the artifact GitHub Pages publishes.

## Data — sourcing & verification

The dataset is treated as **untrusted until proven correct**. It's built in two
stages:

1. **Candidate** (`bun run build-countries`) — `scripts/build-countries.ts` pulls
   real, sourced figures: country population from the **World Bank**
   (`SP.POP.TOTL`), and capital + capital-city population from **Wikidata**
   (`P36` / `P1082`). Seed capitals live in `scripts/un-members.ts` and are
   cross-checked against Wikidata. Output: `scripts/countries.candidate.json`
   (gitignored — never shipped).
2. **Verification** — every field is independently re-checked against
   authoritative sources (national statistics offices, UN, World Bank, Wikipedia
   cross-check). The reconciled result is written to
   `assets/static/data/countries.json`; see `scripts/verification-report.md` for
   the per-country audit trail. Capital-city populations use the **city-proper**
   figure for consistency; enclave capitals (e.g. New Delhi within Delhi) carry a
   `note` with the larger-city figure.

Each population carries `{ value, year, source }` so nothing is shown on screen
without saying where it came from. `test/quiz.test.ts` validates the shipped file
(count, ranges, provenance, no duplicates).

## Design — "Atlas"

Fraunces serif over a deep midnight-navy ground with a faint meridian grid; the
capital is revealed in brass with the two population figures below. One fluid root
font-size (`clamp(vw+vh)`) drives the whole scale and is orientation-neutral;
children size in `rem`, so it works from the 800×480 Pi display to 4K, portrait
and landscape, with no breakpoints. Motion (load entrance, question-mark pulse,
reveal) is gated behind `prefers-reduced-motion`.

## Quality bars

- **Accessibility:** target a 100 Lighthouse/PageSpeed accessibility score —
  semantic `h1`/`h2`/`dl`, AA contrast, `lang`, named links, zoomable viewport,
  reduced-motion respected.
- **Resolutions:** must look correct at every entry in the README table, both
  orientations.
- Run `typecheck`, `lint`, and `test` before pushing (CI enforces them).

## Deploy

Push to **`master`** → `.github/workflows/deploy-pages.yml` builds and publishes
to Pages. PRs run `ci.yml` (typecheck + lint + test + build). Action versions are
SHA-pinned.
