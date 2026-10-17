// Downloads the source recordings and renders the trimmed, loudness-normalized
// clips in audio/. Usage: node scripts/build-sounds.mjs   (needs curl + ffmpeg)
// Every source is CC0 from BigSoundBank (https://bigsoundbank.com).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const cache = join(root, "node_modules", ".sound-cache");
mkdirSync(cache, { recursive: true });

// [output name, BigSoundBank id, start (s), length (s, null = to the end), fade-out (s), trim (dB)]
// The trim evens out variants of the same sound; loudnorm alone misjudges very short clips.
const CLIPS = [
  ["applause-1", "0020", 0.3, 6, 2],
  ["applause-2", "0019", 0.3, 6, 2],
  ["whoo-1", "0237", 0, 4.5, 1],
  ["whoo-2", "0236", 0, 3.6, 0.8],
  ["crickets-1", "1020", 2, 4.5, 1],
  ["crickets-2", "1020", 15, 4.5, 1],
  ["rimshot-1", "2410", 0, 2.6, 1],
  ["rimshot-2", "2411", 0, 2.6, 1],
  ["rimshot-3", "2413", 0, 2.6, 1],
  ["drumroll-1", "2402", 0, null, 0],
  ["drumroll-2", "2405", 0, null, 0],
  ["doorbell-1", "0161", 0, null, 0, -1.75],
  ["doorbell-2", "1605", 0, 3.5, 1.5, 1.75],
  ["scratch-1", "2861", 0, null, 0],
  ["scratch-2", "2868", 0, null, 0],
  ["scratch-3", "2862", 0, null, 0],
  ["boing-1", "2278", 0, null, 0, 1],
  ["boing-2", "2284", 0, null, 0, -1],
];

for (const [name, id, start, len, fade, trimDb = 0] of CLIPS) {
  const src = join(cache, `${id}.mp3`);
  if (!existsSync(src)) execFileSync("curl", ["-sSfL", "-o", src, `https://bigsoundbank.com/UPLOAD/mp3/${id}.mp3`]);
  const filters = ["afade=t=in:d=0.005"];
  if (fade) filters.push(`afade=t=out:st=${len - fade}:d=${fade}`);
  filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  if (trimDb) filters.push(`volume=${trimDb}dB`);
  const trim = len ? ["-t", String(len)] : [];
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(start), ...trim, "-i", src, "-af", filters.join(","), "-ar", "44100", "-b:a", "128k", join(root, "audio", `${name}.mp3`)]);
  console.log(`audio/${name}.mp3  ←  bigsoundbank #${id}`);
}
