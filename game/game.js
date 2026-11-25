// Sizzle & Serve — Rush Hour Kitchen.
// A fast, original burger-rush game: orders land on the board with a patience
// timer, patties cook on the grill (pull them before they burn), and you stack
// each ticket's dish on the plate in order, then serve before patience runs out.
// One 3-minute shift, 3 hearts, escalating orders. Keyboard + mouse, offline,
// no network, deterministic under ?seed= and frozen scenes under ?shot=.
'use strict';

const $ = (id) => document.getElementById(id);

// ---------- seeded random (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- data ----------
const INGREDIENTS = [
  { id: 'bun_bot', name: 'Bun Bottom', glyph: '🍞', key: '1' },
  { id: 'patty', name: 'Patty', glyph: '🥩', key: '2' },
  { id: 'cheese', name: 'Cheese', glyph: '🧀', key: '3' },
  { id: 'lettuce', name: 'Lettuce', glyph: '🥬', key: '4' },
  { id: 'tomato', name: 'Tomato', glyph: '🍅', key: '5' },
  { id: 'bun_top', name: 'Bun Top', glyph: '🥯', key: '6' },
];
const GLYPH = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i.glyph]));
const NAME = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i.name]));

const RECIPES = [
  { name: 'Classic', need: ['bun_bot', 'patty', 'lettuce', 'bun_top'], pay: 100 },
  { name: 'Cheeseburger', need: ['bun_bot', 'patty', 'cheese', 'bun_top'], pay: 120 },
  { name: 'Garden Stack', need: ['bun_bot', 'lettuce', 'tomato', 'cheese', 'bun_top'], pay: 130 },
  { name: 'Double Trouble', need: ['bun_bot', 'patty', 'cheese', 'patty', 'tomato', 'bun_top'], pay: 170 },
  { name: 'Deluxe Melt', need: ['bun_bot', 'patty', 'cheese', 'lettuce', 'tomato', 'bun_top'], pay: 180 },
];

const SHIFT_SECONDS = 180;
const COOK_SECONDS = 6;
const BURN_SECONDS = 12;
const GRILL_SLOTS = 4;
const MAX_TICKETS = 3;
const START_HEARTS = 3;

// ---------- state ----------
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // start | play | serve | end | null
const rng = mulberry32(Number(params.get('seed')) || (Date.now() % 2147483647));

const state = {
  screen: 'title', // title | playing | over
  timeLeft: SHIFT_SECONDS,
  hearts: START_HEARTS,
  score: 0,
  combo: 0,
  bestCombo: 0,
  served: 0,
  missed: 0,
  tickets: [], // {id, recipe, patience, maxPatience}
  plate: [], // ingredient ids, bottom to top
  grill: Array.from({ length: GRILL_SLOTS }, () => null), // {startedAt} | null
  activeTicket: null,
  nextTicketIn: 6,
  ticketSeq: 0,
  now: 0, // ms since shift start (simulated clock)
  lastTick: 0,
};

// ---------- audio (tiny WebAudio synth, no files) ----------
let audioCtx = null;
function beep(freq, dur, type = 'sine', vol = 0.12) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch { /* audio is garnish; never break the game */ }
}
const sfx = {
  add: () => beep(520, 0.08, 'triangle'),
  grill: () => { beep(180, 0.25, 'sawtooth', 0.05); beep(240, 0.2, 'sawtooth', 0.04); },
  serve: () => { beep(660, 0.1); setTimeout(() => beep(880, 0.14), 90); },
  wrong: () => beep(140, 0.25, 'square', 0.08),
  burn: () => { beep(110, 0.3, 'sawtooth', 0.08); },
  tick: () => beep(980, 0.05, 'square', 0.04),
};

// ---------- helpers ----------
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
function pickRecipe() {
  // Early shift: simple dishes; later: the long ones join the pool.
  const pool = state.served < 3 ? RECIPES.slice(0, 2)
    : state.served < 7 ? RECIPES.slice(0, 4) : RECIPES;
  return pool[Math.floor(rng() * pool.length)];
}
function patienceFor() {
  return Math.max(30, 48 - state.served * 1.5);
}
function toast(msg, good) {
  const t = $('toast');
  t.textContent = msg;
  t.className = good ? 'good' : 'bad';
  clearTimeout(toast._h);
  toast._h = setTimeout(() => { t.textContent = ''; t.className = ''; }, 2200);
}

// ---------- tickets ----------
function spawnTicket() {
  const recipe = pickRecipe();
  const patience = patienceFor();
  const ticket = {
    id: ++state.ticketSeq,
    recipe, patience, maxPatience: patience,
  };
  state.tickets.push(ticket);
  if (!state.activeTicket) state.activeTicket = ticket;
  renderTickets();
}
function removeTicket(ticket, missed) {
  state.tickets = state.tickets.filter((t) => t !== ticket);
  if (missed) {
    state.missed++;
    state.hearts--;
    state.combo = 0;
    sfx.burn();
    toast(`Order #${ticket.id} walked out! −1 ❤`, false);
    if (state.hearts <= 0) endShift(false);
  }
  if (state.activeTicket === ticket) {
    state.activeTicket = state.tickets[0] || null;
  }
  renderTickets();
  renderHud();
}

// ---------- grill ----------
function grillPatty() {
  const free = state.grill.findIndex((s) => s === null);
  if (free === -1) { toast('Grill is full!', false); sfx.wrong(); return; }
  state.grill[free] = { startedAt: state.now };
  sfx.grill();
  renderGrill();
}
function grillState(slot) {
  if (!slot) return 'empty';
  const age = (state.now - slot.startedAt) / 1000;
  if (age >= BURN_SECONDS) return 'burnt';
  if (age >= COOK_SECONDS) return 'cooked';
  return 'cooking';
}
function clickGrill(i) {
  const slot = state.grill[i];
  if (!slot) return;
  const st = grillState(slot);
  if (st === 'burnt') {
    state.grill[i] = null;
    sfx.burn();
    toast('Burnt patty trashed.', false);
  } else if (st === 'cooked') {
    state.grill[i] = null;
    addToPlate('patty');
  } else {
    toast('Still cooking…', false);
  }
  renderGrill();
}

// ---------- plate ----------
function addToPlate(id) {
  if (state.screen !== 'playing') return;
  if (id === 'patty') {
    // Patties always go through the grill first.
    grillPatty();
    return;
  }
  state.plate.push(id);
  sfx.add();
  renderPlate();
}
function clearPlate() {
  state.plate = [];
  renderPlate();
}
function plateMatches(ticket) {
  const need = ticket.recipe.need;
  if (state.plate.length !== need.length) return false;
  return need.every((ing, i) => state.plate[i] === ing);
}
function serve() {
  if (state.screen !== 'playing') return;
  const ticket = state.activeTicket;
  if (!ticket) { toast('No order to serve!', false); return; }
  if (state.plate.length === 0) { toast('Plate is empty!', false); sfx.wrong(); return; }
  if (!plateMatches(ticket)) {
    state.combo = 0;
    clearPlate();
    sfx.wrong();
    toast('Wrong dish — the customer sent it back!', false);
    renderHud();
    return;
  }
  const tip = Math.round((ticket.patience / ticket.maxPatience) * 50);
  const mult = 1 + Math.min(state.combo, 8) * 0.25;
  const earned = Math.round((ticket.recipe.pay + tip) * mult);
  state.score += earned;
  state.combo++;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.served++;
  clearPlate();
  state.tickets = state.tickets.filter((t) => t !== ticket);
  state.activeTicket = state.tickets[0] || null;
  sfx.serve();
  toast(`Served ${ticket.recipe.name}! +${earned} pts${tip > 0 ? ` (tip $${tip})` : ''} 🎉`, true);
  renderTickets();
  renderHud();
}

// ---------- flow ----------
function startShift() {
  Object.assign(state, {
    screen: 'playing', timeLeft: SHIFT_SECONDS, hearts: START_HEARTS,
    score: 0, combo: 0, bestCombo: 0, served: 0, missed: 0,
    tickets: [], plate: [], activeTicket: null, nextTicketIn: 2, ticketSeq: 0,
    now: 0, lastTick: performance.now(),
  });
  state.grill = Array.from({ length: GRILL_SLOTS }, () => null);
  $('overlay').classList.add('hidden');
  spawnTicket();
  renderAll();
}
function endShift(won) {
  state.screen = 'over';
  const rank = state.score >= 1200 ? 'S — Head Chef!' : state.score >= 800 ? 'A — Sous Chef'
    : state.score >= 450 ? 'B — Line Cook' : 'C — Still Learning';
  $('overlay-card').innerHTML = `
    <h1>${won || state.hearts > 0 ? '🎉 Shift Complete!' : '💥 Kitchen Closed'}</h1>
    <h2>${rank}</h2>
    <p class="big">${state.score} pts</p>
    <p>Served: <b>${state.served}</b> · Missed: <b>${state.missed}</b> · Best combo: <b>×${state.bestCombo}</b></p>
    <p>${state.served >= 8 ? 'The dinner rush fears you. Come back tomorrow?' : 'The rush got the better of you — one more shift?'}</p>
    <button type="button" onclick="startShift()">PLAY AGAIN (R)</button>`;
  $('overlay').classList.remove('hidden');
  renderHud();
}
function showTitle() {
  state.screen = 'title';
  $('overlay-card').innerHTML = `
    <h1>🍳 Sizzle &amp; Serve</h1>
    <h2>Rush Hour Kitchen</h2>
    <p>Orders fly in. Patties sizzle. Customers wait for no one.</p>
    <ul class="rules">
      <li>Click a ticket to pick it, then stack its dish on the plate — bottom to top.</li>
      <li>Patties cook on the grill (~6s). Grab them cooked; burnt ones get trashed.</li>
      <li>Serve fast for tips. Miss an order and you lose a heart. 3 hearts, 3 minutes.</li>
    </ul>
    <button type="button" onclick="startShift()">START SHIFT ▶</button>`;
  $('overlay').classList.remove('hidden');
}

// ---------- render ----------
function renderHud() {
  $('timer').textContent = fmtTime(Math.max(0, state.timeLeft));
  $('timer').classList.toggle('low', state.timeLeft <= 30 && state.screen === 'playing');
  $('hearts').textContent = '❤'.repeat(Math.max(0, state.hearts)) + '🤍'.repeat(Math.max(0, START_HEARTS - state.hearts));
  $('score').textContent = state.score;
  $('combo').textContent = '×' + (1 + Math.min(state.combo, 8) * 0.25).toFixed(2).replace(/\.?0+$/, '');
  $('served').textContent = state.served;
}
function renderTickets() {
  const box = $('tickets');
  box.innerHTML = '';
  for (let i = 0; i < MAX_TICKETS; i++) {
    const t = state.tickets[i];
    if (!t) {
      const d = document.createElement('div');
      d.className = 'ticket empty';
      d.textContent = '— waiting for orders —';
      box.appendChild(d);
      continue;
    }
    const frac = Math.max(0, t.patience / t.maxPatience);
    const d = document.createElement('div');
    d.className = 'ticket' + (state.activeTicket === t ? ' active' : '');
    d.innerHTML = `
      <div class="t-name">#${t.id} · ${t.recipe.name} — $${t.recipe.pay}</div>
      <div class="t-need">${t.recipe.need.map((ing, idx) => {
        const done = state.activeTicket === t && idx < state.plate.length
          && state.plate[idx] === ing;
        return `<span class="${done ? 'done' : ''}">${GLYPH[ing]}</span>`;
      }).join(' ')}</div>
      <div class="t-pay">Tap the ticket, then build it below</div>
      <div class="t-bar"><div class="t-fill ${frac < 0.25 ? 'crit' : frac < 0.5 ? 'warn' : ''}" style="width:${Math.round(frac * 100)}%"></div></div>`;
    d.addEventListener('click', () => {
      state.activeTicket = t;
      renderTickets(); renderPlate();
    });
    box.appendChild(d);
  }
}
function renderGrill() {
  const box = $('grill');
  box.innerHTML = '';
  state.grill.forEach((slot, i) => {
    const d = document.createElement('div');
    const st = grillState(slot);
    d.className = 'grill-slot' + (st === 'burnt' ? ' burnt' : '');
    if (!slot) {
      d.innerHTML = '<span style="font-size:16px;color:#888">empty</span>';
    } else if (st === 'cooking') {
      const pct = Math.min(100, ((state.now - slot.startedAt) / 1000 / COOK_SECONDS) * 100);
      d.innerHTML = `<span>🥩</span><span class="sizzle">♨️</span><div class="cook"><i style="width:${pct}%"></i></div>`;
    } else if (st === 'cooked') {
      d.innerHTML = '<span>🍖</span><span class="sizzle">✨</span>';
    } else {
      d.innerHTML = '<span>⬛</span>';
    }
    d.addEventListener('click', () => clickGrill(i));
    box.appendChild(d);
  });
}
function renderPlate() {
  const box = $('plate');
  box.innerHTML = '';
  if (state.plate.length === 0) {
    box.classList.add('empty-msg');
    box.innerHTML = '<span>Your plate is empty.<br>Add ingredients from the counter.</span>';
  } else {
    box.classList.remove('empty-msg');
    state.plate.forEach((ing) => {
      const s = document.createElement('span');
      s.className = 'layer';
      s.textContent = GLYPH[ing];
      s.title = NAME[ing];
      box.appendChild(s);
    });
  }
  const ticket = state.activeTicket;
  const ready = ticket && plateMatches(ticket);
  const btn = $('serve-btn');
  btn.disabled = state.plate.length === 0;
  btn.classList.toggle('ready', !!ready);
  btn.textContent = ready ? 'SERVE 🍽️ — READY!' : 'SERVE 🍽️';
}
function renderBins() {
  const box = $('bins');
  box.innerHTML = '';
  INGREDIENTS.forEach((ing) => {
    const d = document.createElement('div');
    d.className = 'bin';
    d.innerHTML = `<div class="glyph">${ing.glyph}</div><div class="name">${ing.name}</div><span class="key">${ing.key}</span>`;
    d.addEventListener('click', () => addToPlate(ing.id));
    box.appendChild(d);
  });
}
function renderAll() {
  renderHud(); renderTickets(); renderGrill(); renderPlate(); renderBins();
}

// ---------- game loop ----------
function tick(now) {
  if (state.screen !== 'playing') return;
  const dt = Math.min(500, now - state.lastTick);
  state.lastTick = now;
  state.now += dt;
  state.timeLeft -= dt / 1000;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    renderHud();
    endShift(true);
    return;
  }
  if (Math.floor(state.timeLeft) !== Math.floor(state.timeLeft + dt / 1000) && state.timeLeft <= 10) sfx.tick();
  // patience drains
  let changed = false;
  [...state.tickets].forEach((t) => {
    t.patience -= dt / 1000;
    if (t.patience <= 0) removeTicket(t, true);
    else changed = true;
  });
  if (changed) renderTickets();
  // new orders arrive
  state.nextTicketIn -= dt / 1000;
  if (state.nextTicketIn <= 0 && state.tickets.length < MAX_TICKETS) {
    spawnTicket();
    state.nextTicketIn = Math.max(7, 14 - state.served * 0.6);
  }
  renderGrill();
  renderHud();
  requestAnimationFrame(tick);
}

// ---------- deterministic screenshot scenes (?shot=) ----------
function applyShot() {
  if (!SHOT) return;
  const frozen = { now: 30000, lastTick: 0 };
  if (SHOT === 'start') {
    state.screen = 'title';
    showTitle();
    renderAll();
  } else if (SHOT === 'play') {
    state.screen = 'playing';
    Object.assign(state, frozen, {
      timeLeft: 134, hearts: 3, score: 320, combo: 2, served: 4, missed: 0,
      plate: ['bun_bot', 'patty', 'lettuce'],
    });
    state.tickets = [
      { id: 7, recipe: RECIPES[1], patience: 22, maxPatience: 42 },
      { id: 8, recipe: RECIPES[3], patience: 38, maxPatience: 45 },
      { id: 9, recipe: RECIPES[0], patience: 12, maxPatience: 40 },
    ];
    state.activeTicket = state.tickets[0];
    state.grill = [{ startedAt: 26000 }, { startedAt: 24000 }, null, null];
    $('overlay').classList.add('hidden');
    renderAll();
  } else if (SHOT === 'serve') {
    state.screen = 'playing';
    Object.assign(state, frozen, {
      timeLeft: 118, hearts: 3, score: 470, combo: 3, served: 5, missed: 0,
      plate: ['bun_bot', 'patty', 'cheese', 'bun_top'],
    });
    state.tickets = [
      { id: 10, recipe: RECIPES[1], patience: 31, maxPatience: 42 },
      { id: 11, recipe: RECIPES[0], patience: 18, maxPatience: 40 },
    ];
    state.activeTicket = state.tickets[0];
    state.grill = [{ startedAt: 24000 }, null, null, null];
    $('overlay').classList.add('hidden');
    renderAll();
    toast('Served Cheeseburger! +158 pts (tip $38) 🎉', true);
  } else if (SHOT === 'end') {
    state.screen = 'over';
    Object.assign(state, {
      timeLeft: 0, hearts: 2, score: 1240, combo: 0, bestCombo: 5, served: 11, missed: 1,
    });
    $('overlay-card').innerHTML = `
      <h1>🎉 Shift Complete!</h1>
      <h2>S — Head Chef!</h2>
      <p class="big">1240 pts</p>
      <p>Served: <b>11</b> · Missed: <b>1</b> · Best combo: <b>×5</b></p>
      <p>The dinner rush fears you. Come back tomorrow?</p>
      <button type="button" onclick="startShift()">PLAY AGAIN (R)</button>`;
    $('overlay').classList.remove('hidden');
    renderAll();
  }
}

// ---------- input ----------
document.addEventListener('keydown', (e) => {
  if (state.screen === 'playing') {
    const ing = INGREDIENTS.find((i) => i.key === e.key);
    if (ing) { addToPlate(ing.id); return; }
    if (e.key === 's' || e.key === 'S') { serve(); return; }
    if (e.key === 't' || e.key === 'T') { clearPlate(); toast('Plate cleared.', false); return; }
  }
  if ((e.key === 'r' || e.key === 'R') && state.screen !== 'title') startShift();
  if (e.key === 'Enter' && state.screen === 'title') startShift();
});
$('serve-btn').addEventListener('click', serve);
$('trash-btn').addEventListener('click', () => {
  if (state.screen !== 'playing') return;
  clearPlate();
  toast('Plate cleared.', false);
});

// ---------- boot ----------
if (SHOT) {
  applyShot();
} else {
  showTitle();
  renderAll();
  state.lastTick = performance.now();
  requestAnimationFrame(tick);
}
