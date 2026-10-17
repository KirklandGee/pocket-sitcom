// Renders every sound offline in Chromium and reports peak / loudness so the
// per-sound `level` values in app.js can be balanced.
// Usage: node scripts/loudness.mjs   (needs playwright)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };
const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__pocketSitcom);

const results = await page.evaluate(async () => {
  const { SOUNDS, kit, samplesReady } = await import("/sounds.js");
  await samplesReady;
  const { SCREENS } = window.__pocketSitcom;
  const out = [];
  for (const s of SCREENS.flatMap((x) => x.sounds)) {
    const sr = 44100;
    const ac = new OfflineAudioContext(2, sr * 8, sr);
    const bus = ac.createGain();
    bus.gain.value = s.level;
    bus.connect(ac.destination);
    let dur, error;
    try {
      dur = SOUNDS[s.id](kit(ac, bus, 0.01));
    } catch (e) {
      error = e.message;
    }
    if (error) { out.push({ id: s.id, error }); continue; }
    const buf = await ac.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    // Loudness = loudest 300ms block RMS; "audible" = last sample above -40 dBFS.
    let peak = 0, nan = false, lastSound = 0, maxRms = 0;
    const win = Math.floor(sr * 0.3);
    for (let b = 0; b + win <= L.length; b += win) {
      let acc = 0;
      for (let i = b; i < b + win; i++) {
        const v = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        if (Number.isNaN(v)) nan = true;
        peak = Math.max(peak, v);
        if (v > 0.01) lastSound = i / sr;
        acc += (L[i] * L[i] + R[i] * R[i]) / 2;
      }
      maxRms = Math.max(maxRms, Math.sqrt(acc / win));
    }
    out.push({ id: s.id, dur: +dur.toFixed(2), audibleUntil: +lastSound.toFixed(2), peak: +peak.toFixed(3), loudDb: +(20 * Math.log10(maxRms)).toFixed(1), nan });
  }
  return out;
});
console.table(results);
if (errors.length) console.log("Page errors:", errors);
await browser.close();
server.close();
