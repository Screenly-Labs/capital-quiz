# Capital Quiz App

A clean, full-screen capital-city quiz for digital signage. On each load it picks
one of the 193 UN member states, asks **"What is the capital of {Country}?"**, and
after about five seconds reveals the capital with both its **city population** and
the **country population** — each labelled with its census/estimate year and
source. Set in the "Atlas" style: a Fraunces serif over deep midnight navy with a
faint meridian grid, the answer in brass.

![The Capital Quiz answer screen: "What is the capital of Japan" with Tokyo revealed in brass, its city and country population, each with a census year and source, and a note explaining Tokyo's 23 special wards versus the wider metropolis.](docs/screenshot.png)

Live: **https://capitals.srly.io**

Part of the Screenly signage family alongside the [quotes](../quotes) app. Like
quotes it's a fully **static** site hosted on **GitHub Pages** — the country is
chosen in the browser, so there's no server.

## Stack

- **Bun** — package manager, bundler, and test runner (no npm/npx)
- **TypeScript** — all app JS, strict mode
- **Tailwind CSS v4** — CSS-first config (`@theme`), compiled by the Tailwind CLI
- **Biome** — lint + format
- Self-hosted variable fonts (Fraunces, Hanken Grotesk), vendored from `@fontsource`

## Develop

```sh
bun install        # install deps (fonts get vendored during build)
bun run dev        # build, then serve dist/ locally
bun run build      # build the static site into dist/
bun test           # run unit + dataset tests
bun run typecheck  # tsc --noEmit
bun run lint       # Biome (lint:fix / format to auto-fix)
```

`bun run build` is non-destructive: it assembles everything into `dist/`
(gitignored) — copies `index.html` + static assets, compiles Tailwind, bundles
the TypeScript, stamps a content-hash `?v=` onto asset URLs for cache-busting,
and writes the `CNAME`.

## Countries data

`assets/static/data/countries.json` holds the 193 UN member states, each with its
capital and two population figures:

```json
{
  "country": "Japan",
  "capital": "Tokyo",
  "capitalPopulation": { "value": 14264798, "year": 2022, "source": "..." },
  "countryPopulation": { "value": 123975371, "year": 2024, "source": "World Bank (SP.POP.TOTL)" }
}
```

The data is treated as **untrusted until verified**. It's seeded from authoritative
APIs (World Bank for country population; Wikidata for capitals and city
population) by `bun run build-countries`, then every field is independently
re-checked against official sources before it ships. Each figure carries its
`year` and `source`, and `test/quiz.test.ts` validates the shipped file. See
`CLAUDE.md` and `scripts/verification-report.md` for the full pipeline and audit
trail.

## Supported resolutions

The layout is fluid (one `clamp()`-driven root size, orientation-neutral). Verified
landscape **and** portrait across:

| Resolution | Notes |
| --- | --- |
| 4096×2160 · 3840×2160 (+ portrait) | 4K |
| 1920×1080 (+ portrait) | 1080p |
| 1280×720 (+ portrait) | 720p |
| 800×480 (+ portrait) | Raspberry Pi Touch Display |

## Deploy

Push to `master` runs `.github/workflows/deploy-pages.yml`, which builds and
publishes `dist/` to GitHub Pages. CI (`ci.yml`) typechecks, lints, tests, and
builds on every PR.

One-time setup (outside this repo):

1. **DNS:** `CNAME` record `capitals.srly.io → screenly-labs.github.io`.
2. **Repo → Settings → Pages:** Source = "GitHub Actions"; set the custom domain
   to `capitals.srly.io` and enable "Enforce HTTPS" once the certificate provisions.

## License

AGPL-3.0-only (see `LICENSE`). Country population data from the World Bank;
capitals and city population seeded from Wikidata. See `scripts/verification-report.md`.
