import { SOUNDS, kit } from "./sounds.js";

// `level` evens out loudness across sounds (tuned with scripts/loudness.mjs).
const SCREENS = [
  {
    id: "laughs",
    label: "Laughs",
    sounds: [
      { id: "chuckle", label: "Chuckle", sub: "A polite titter", tags: ["laugh"], level: 0.73 },
      { id: "bigLaugh", label: "Big Laugh", sub: "The joke landed", tags: ["laugh"], level: 0.44 },
      { id: "roar", label: "Roaring Laugh", sub: "Brought the house down", tags: ["laugh"], level: 0.43 },
      { id: "laughApplause", label: "Laugh + Applause", sub: "Catchphrase moment", tags: ["laugh", "applause"], level: 0.6 },
      { id: "applause", label: "Applause", sub: "Take a bow", tags: ["applause"], level: 2.3 },
      { id: "whoo", label: "Whoo!", sub: "Fan favorite enters", tags: ["applause"], level: 0.22 },
    ],
  },
  {
    id: "reactions",
    label: "Reactions",
    sounds: [
      { id: "aww", label: "Awww", sub: "Heartwarming beat", tags: [], level: 0.19 },
      { id: "ooh", label: "Oooh", sub: "Somebody's in trouble", tags: [], level: 0.14 },
      { id: "gasp", label: "Gasp", sub: "Shocking twist", tags: [], level: 1.05 },
      { id: "boo", label: "Boo", sub: "Terrible pun", tags: [], level: 0.2 },
      { id: "crickets", label: "Crickets", sub: "...anyone?", tags: [], level: 2.3 },
      { id: "sadTrombone", label: "Sad Trombone", sub: "Wah wah wah waaah", tags: [], level: 0.81 },
    ],
  },
  {
    id: "stage",
    label: "Stage",
    sounds: [
      { id: "rimshot", label: "Rimshot", sub: "Ba-dum tss", tags: [], level: 0.8 },
      { id: "drumroll", label: "Drumroll", sub: "And the winner is…", tags: [], level: 0.72 },
      { id: "tada", label: "Ta-da!", sub: "Big reveal", tags: [], level: 0.92 },
      { id: "theme", label: "Theme Song", sub: "Scene transition", tags: [], level: 0.56 },
      { id: "doorbell", label: "Doorbell", sub: "Guess who's here", tags: [], level: 0.94 },
      { id: "scratch", label: "Record Scratch", sub: "Wait, what?", tags: [], level: 1.07 },
      { id: "boing", label: "Boing", sub: "Physical comedy", tags: [], level: 0.88 },
    ],
  },
];

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

let ctx;
let master;
const active = new Set(); // { bus, tags, button, timer }

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume();
  return ctx;
}

// Let iOS play through the silent switch, like a media app.
try {
  if (navigator.audioSession) navigator.audioSession.type = "playback";
} catch {}

function play(sound, button) {
  const ac = audio();
  const bus = ac.createGain();
  bus.gain.value = sound.level;
  bus.connect(master);
  const dur = SOUNDS[sound.id](kit(ac, bus, ac.currentTime + 0.03));

  const entry = { bus, tags: sound.tags, button };
  entry.timer = setTimeout(() => finish(entry), dur * 1000 + 100);
  active.add(entry);

  button.style.setProperty("--dur", `${dur}s`);
  button.classList.remove("playing");
  void button.offsetWidth; // restart the progress animation on rapid re-taps
  button.classList.add("playing");
  updateSigns();
}

function finish(entry) {
  clearTimeout(entry.timer);
  entry.bus.disconnect();
  active.delete(entry);
  if (![...active].some((e) => e.button === entry.button)) entry.button.classList.remove("playing");
  updateSigns();
}

function stopAll() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const entry of active) {
    entry.bus.gain.cancelScheduledValues(t);
    entry.bus.gain.setValueAtTime(entry.bus.gain.value, t);
    entry.bus.gain.linearRampToValueAtTime(0, t + 0.08);
    setTimeout(() => finish(entry), 120);
  }
}

function updateSigns() {
  const tags = new Set([...active].flatMap((e) => e.tags));
  document.getElementById("sign-air").classList.toggle("lit", active.size > 0);
  document.getElementById("sign-laugh").classList.toggle("lit", tags.has("laugh"));
  document.getElementById("sign-applause").classList.toggle("lit", tags.has("applause"));
}

// ---------- UI ----------

const board = document.getElementById("board");
const tabs = document.getElementById("tabs");
let current = 0;

function render() {
  board.innerHTML = "";
  SCREENS.forEach((screen, si) => {
    const panel = document.createElement("section");
    panel.className = "screen";
    panel.id = `screen-${screen.id}`;
    panel.dataset.screen = screen.id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `tab-${screen.id}`);
    screen.sounds.forEach((sound, i) => {
      const b = document.createElement("button");
      b.className = "pad";
      b.type = "button";
      b.innerHTML = `<span class="pad-label"></span><span class="pad-sub"></span><kbd>${KEYS[i]}</kbd><span class="pad-progress"></span>`;
      b.querySelector(".pad-label").textContent = sound.label;
      b.querySelector(".pad-sub").textContent = sound.sub;
      b.setAttribute("aria-label", `${sound.label}: ${sound.sub}`);
      // pointerdown fires instantly on touch, so taps feel like a real button.
      b.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        play(sound, b);
      });
      b.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.stopPropagation();
          play(sound, b);
        }
      });
      panel.appendChild(b);
    });
    board.appendChild(panel);

    const tab = document.createElement("button");
    tab.className = "tab";
    tab.type = "button";
    tab.id = `tab-${screen.id}`;
    tab.textContent = screen.label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => show(si));
    tabs.appendChild(tab);
  });
}

function show(i) {
  current = (i + SCREENS.length) % SCREENS.length;
  document.querySelectorAll(".screen").forEach((el, si) => (el.hidden = si !== current));
  document.querySelectorAll(".tab").forEach((el, si) => {
    el.setAttribute("aria-selected", String(si === current));
    el.tabIndex = si === current ? 0 : -1;
  });
  try {
    localStorage.setItem("pocket-sitcom:screen", String(current));
  } catch {}
}

document.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const n = KEYS.indexOf(ev.key);
  if (n >= 0) {
    const pads = document.querySelectorAll(`#screen-${SCREENS[current].id} .pad`);
    if (pads[n]) play(SCREENS[current].sounds[n], pads[n]);
  } else if (ev.key === "ArrowRight") {
    show(current + 1);
  } else if (ev.key === "ArrowLeft") {
    show(current - 1);
  } else if (ev.key === "Escape") {
    stopAll();
  }
});

document.getElementById("stop").addEventListener("click", stopAll);

render();
let saved = 0;
try {
  saved = Number(localStorage.getItem("pocket-sitcom:screen")) || 0;
} catch {}
show(saved);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Exposed for scripts/loudness.mjs.
window.__pocketSitcom = { SCREENS };
