# Pocket Sitcom

A sitcom soundboard for the browser — laugh tracks, applause, rimshots, sad trombones and more. A web rebuild of the old *Pocket Sitcom* iPhone app.

Every sound is **synthesized live with the Web Audio API** (`sounds.js`): there are no audio files, so there's nothing to license, and every press sounds a little different — the crowd is randomized each time.

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

The `level` on each sound in `app.js` evens out loudness; re-run `npm run loudness` after changing a sound and adjust it.

## Deploy

Hosted on Vercel as a static site (framework preset: Other, no build command). Pushes to `main` deploy to production.
