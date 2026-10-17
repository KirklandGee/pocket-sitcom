# Pocket Sitcom

A sitcom soundboard for the browser — laugh tracks, applause, rimshots, sad trombones and more. A web rebuild of the old *Pocket Sitcom* iPhone app.

Applause, Whoo!, Crickets, Rimshot, Drumroll, Doorbell, Record Scratch and Boing are **real recordings** (`audio/`), with a few variants each so repeat presses differ. Everything else is **synthesized live with the Web Audio API** (`sounds.js`), and the crowd is randomized on every press. A sampled pad falls back to its synth version until the recordings have loaded.

All recordings are CC0 from [BigSoundBank](https://bigsoundbank.com) (no attribution required). `scripts/build-sounds.mjs` lists each clip's source sound number and how it is trimmed.

## Screens

| Laughs | Reactions | Stage |
|---|---|---|
| Chuckle, Big Laugh, Roaring Laugh, Laugh + Applause, Applause, Whoo! | Awww, Oooh, Gasp, Boo, Crickets, Sad Trombone | Rimshot, Drumroll, Ta-da!, Theme Song, Doorbell, Record Scratch, Boing |

Keys `1`–`7` play the current screen, `←`/`→` switch screens, `Esc` stops everything. Installable as a home-screen app (PWA) and works offline.

## Develop

Plain static files, no build step.

```bash
npm run dev          # serve on http://localhost:3000
npm i && npm run loudness   # render every sound offline in Chromium, report peak/loudness
```

```bash
node scripts/build-sounds.mjs   # download sources, render the trimmed, normalized clips into audio/ (needs curl + ffmpeg)
```

The `level` on each sound in `app.js` evens out loudness; re-run `npm run loudness` after changing a sound and adjust it. Each recorded sound also has a `gain` in `SAMPLES` (`sounds.js`) matching it to its synth version, so the one `level` holds for both.

## Deploy

Hosted on Vercel as a static site (framework preset: Other, no build command). Pushes to `main` deploy to production.
