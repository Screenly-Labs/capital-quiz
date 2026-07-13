#!/usr/bin/env bun
/* global Bun */
// Builds the static site into ./dist for GitHub Pages. Like the sibling quotes
// app this is a plain static bundle — no server. Steps:
//   1. vendor fonts from @fontsource (sync-fonts.js)
//   2. assemble dist/ (index.html + static assets, copied not mutated)
//   3. compile Tailwind v4 CSS (minified)
//   4. bundle TypeScript → browser JS (minified, ./quiz inlined)
//   5. stamp a content hash into asset URLs (?v=) for cache-busting
//   6. write CNAME for the custom domain
// dist/ is gitignored; CI uploads it as the Pages artifact.

import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { bundleJs, injectGate, processCss } from '@screenly-labs/signage-kit/build'
import { run as syncFonts } from './sync-fonts.js'

const DIST = 'dist'
const DOMAIN = 'capitals.srly.io'

// 1. Vendor the Bun-managed webfonts into ./assets before copying.
await syncFonts()

// 2. Fresh dist/, then copy the web root (everything served at /static/...) and
// the page shell. Sources are never minified in place.
await rm(DIST, { recursive: true, force: true })
await mkdir(`${DIST}/static`, { recursive: true })
// Create the output subdirs up front so Tailwind/esbuild never race an absent dir.
await mkdir(`${DIST}/static/styles`, { recursive: true })
await mkdir(`${DIST}/static/js`, { recursive: true })
await cp('assets/static/fonts', `${DIST}/static/fonts`, { recursive: true })
await cp('assets/static/images', `${DIST}/static/images`, { recursive: true })
await cp('assets/static/data', `${DIST}/static/data`, { recursive: true })
// Copy the page shell with the shared degraded-mode gate injected before the
// stylesheet, so html.legacy is set on the first paint.
await writeFile(`${DIST}/index.html`, injectGate(await readFile('index.html', 'utf8')))
// The signage-app manifest is served verbatim from /.well-known/ at the site
// root (GitHub Pages serves it as application/json with `Access-Control-Allow-
// Origin: *`). See docs/app-manifest.md in the app-store repo.
await cp('.well-known', `${DIST}/.well-known`, { recursive: true })

// 3. Tailwind -> the kit's CSS pipeline (flatten @layer, down-level to the floor).
const cssOut = `${DIST}/static/styles/main.css`
const tailwind = Bun.spawn(
  [
    'node_modules/.bin/tailwindcss',
    '--input',
    'assets/static/styles/tailwind.css',
    '--output',
    cssOut
  ],
  { stdout: 'inherit', stderr: 'inherit' }
)
if ((await tailwind.exited) !== 0) {
  console.error('✗ Tailwind build failed')
  process.exit(1)
}
await writeFile(cssOut, await processCss(await readFile(cssOut, 'utf8'), { flattenLayers: true, filename: cssOut }))
console.log(`✓ CSS: ${cssOut}`)

// 4. Client TS -> the kit's bundler (self-contained IIFE at the floor's syntax level).
await bundleJs('assets/static/js/main.ts', `${DIST}/static/js/main.js`)
console.log(`✓ JS: ${DIST}/static/js/main.js`)

// 5. Cache-busting: hash the built JS + CSS + data so the token changes exactly
// when shipped content changes, then stamp it into the page's asset URLs.
const fingerprint = await Promise.all([
  readFile(`${DIST}/static/js/main.js`),
  readFile(`${DIST}/static/styles/main.css`),
  readFile(`${DIST}/static/data/countries.json`)
])
const hasher = new Bun.CryptoHasher('sha256')
for (const buf of fingerprint) hasher.update(buf)
const version = hasher.digest('hex').slice(0, 10)

const html = await readFile(`${DIST}/index.html`, 'utf8')
await writeFile(`${DIST}/index.html`, html.replaceAll('__ASSET_VERSION__', version))
console.log(`✓ Stamped asset version ${version}`)

// 6. Custom domain for GitHub Pages.
await writeFile(`${DIST}/CNAME`, `${DOMAIN}\n`)
console.log(`✓ CNAME: ${DOMAIN}`)

console.log('Build complete → dist/')
