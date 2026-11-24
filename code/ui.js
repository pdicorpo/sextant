// ---- Max [v8ui] glue: engine + step grid + dials/menus + lock editing (appended after engine.js) ----
// Outlets: 0 raw MIDI for this track (channel 10)   1 "slot value" -> dials (via [prepend set], no feedback)
//          2 (unused)
//          4 "slot menu-message..." -> the 12 parameter menus
//          5 note messages for this track -> [pipe] -> [midiout]: held back 3 ms so each drum's CCs (sent from
//            the Out tracks) always reach the Nord before its note; Live doesn't order MIDI across tracks.
//          6 "bank n" / "prog n" -> the program boxes (via [prepend set], no feedback)
//          7 "<key><drum> value" (e.g. hits3 5) -> a row's number boxes, when the engine corrects or drags a value
//          8 "knob attribute..." (knob = drum*12 + slot) -> one knob: hidden (only the selected drum's set shows),
//            unit style (note names for Pitch)
//          9 0 / 1 -> the 16th-note [metro]: restart it when Live's loop (or a jump) leaves it waiting
autowatch = 1;
inlets = 1;
outlets = 10;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

// Live rewrites everything leaving a MIDI track to that track's output channel, so this track (Ch. 10)
// only sends channel-10 messages; channels 1-6 go to the Sextant Out devices on their own tracks.
const MAIN_CH = 10;
function emit(bytes) {
  const ch = (bytes[0] & 15) + 1;
  if (bytes[0] >= 0xF0 || ch === MAIN_CH) outlet(0, bytes);
  else outlet(3, [ch].concat(bytes));
}
emit.local = 1;

const eng = new Engine();
[[16, 4, 0, 110], [16, 2, 4, 100], [16, 7, 0, 80], [12, 5, 0, 90], [16, 3, 2, 90], [16, 0, 0, 90]]
  .forEach(([st, h, r, vel], v) => { eng.set(v, 'steps', st); eng.set(v, 'hits', h); eng.set(v, 'rotation', r); eng.set(v, 'velocity', vel); });

let selVoice = 0;   // drum the dials talk to
let selStep = -1;   // step being edited (lock edit only)
let lockEdit = 0;   // dials only write locks while Lock edit is on (so automation never writes locks)

// ---------- messages from the patch ----------
function param(v, key, val) {
  val = Math.round(val);                    // controls are continuous for Live's automation lanes
  if (key === 'steps' || key === 'hits' || key === 'rotation') setPattern(v, key, val);
  else eng.set(v, key, (key === 'mute' || key === 'solo') ? !!val : val);
  // Touching a row selects that drum, but only when it's a hand (mouse down). Automation of a row (e.g. a Mute lane)
  // must not move the selection: the knobs' automation follows the selected drum.
  if (ready && mouseDown && v !== selVoice) { selectVoice(v); selStep = -1; sendDials(); }
  if (selVoice === v && selStep >= eng.voices[v].steps) selStep = -1;
  mgraphics.redraw();
}

// Steps / hits / rotation with sensible limits: hits 0..steps, rotation wraps around the steps.
// Any value the engine had to correct is written back to the row's boxes (so what you see is what plays).
function setPattern(v, key, val) {
  const x = eng.voices[v];
  let steps = x.steps, hits = x.hits, rot = x.rotation;
  if (key === 'steps') steps = Math.max(1, Math.min(64, val | 0));
  if (key === 'hits') hits = val | 0;
  if (key === 'rotation') rot = val | 0;
  hits = Math.max(0, Math.min(steps, hits));
  rot = ((rot % steps) + steps) % steps;
  if (hits !== x.hits) eng.set(v, 'hits', hits);
  if (rot !== x.rotation) eng.set(v, 'rotation', rot);
  if (steps !== x.steps) eng.set(v, 'steps', steps);
  const shown = { steps: steps, hits: hits, rotation: rot };
  for (const k in shown) if (k !== key || shown[k] !== val) outlet(7, [k + v, shown[k]]);
}
setPattern.local = 1;

// ---- clock watchdog ----
// The 16th-note metro is locked to Live's transport and schedules its next tick at a future position. When Live
// loops (or you jump) back before that position, the tick never comes and the sequencer stops. watch() gets Live's
// tempo and position ~25x a second: if the position went backwards, or no step arrived for 2.5 sixteenths while
// the transport is moving, restart the metro (it re-locks to the next 16th).
let lastStepIdx = -1, lastStepAt = 0, prevTicks = -1, lastRestart = 0;
function watch(tempo, ticks) {
  const now = Date.now();
  const moving = prevTicks >= 0 && ticks !== prevTicks;
  const jumpedBack = moving && ticks < prevTicks;
  prevTicks = ticks;
  if (!moving || now - lastRestart < 150) return;
  const sixteenth = 60000 / Math.max(20, tempo || 120) / 4;
  if (jumpedBack || now - lastStepAt > sixteenth * 2.5) {
    lastRestart = now;
    lastStepAt = now;                          // give the restarted metro a moment before checking again
    outlet(9, 0); outlet(9, 1);
  }
}

function step(s) {
  lastStepIdx = s; lastStepAt = Date.now();
  const ev = eng.tick(s);
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === 'cc') emit([0xB0 + e.channel - 1, e.cc, e.value]);
    else { emitNote([0x90 + e.channel - 1, e.note, e.velocity]); emitNote([0x80 + e.channel - 1, e.note, 0]); }
  }
  mgraphics.redraw();
}

function emitNote(bytes) {
  if (((bytes[0] & 15) + 1) === MAIN_CH) outlet(5, bytes);   // delayed: after the CCs
  else emit(bytes);
}
emitNote.local = 1;

// dial <slot> <value>: lock on the selected step (lock edit) or set the drum's base and send it now
let ready = false;
// dial <slot> <value>. With Edit locks on and a step selected, a knob turned by hand writes a lock on that step;
// anything else (Edit locks off, or automation moving the knob) sets the drum's base sound and sends it now.
// "By hand" = the mouse button is down ([mousestate] in the patch). It's polled, so a fresh click can arrive
// a moment after the first knob value: when the mouse isn't down yet, decide 40 ms later.
let mouseDown = false;
function mouse(b) { mouseDown = !!b; }
// dial <drum> <slot> <value>: each drum has its own 12 knobs (only the selected drum's are visible), so
// knob automation always moves its own drum. Locks: only the visible (selected) drum's knobs, by hand.
function dial(v, slot, val) {
  if (!ready) return;                     // dials report their stored values on load: not a user move
  val = Math.max(0, Math.min(127, Math.round(val)));
  const st = v === selVoice ? selStep : -1, name = eng.voices[v].dials[slot];
  if (lockEdit && st >= 0 && eng.canLock(name)) {
    if (mouseDown) { lockIt(v, st, name, val); return; }
    const t = new Task(() => {
      if (mouseDown && lockEdit && selVoice === v && selStep === st) lockIt(v, st, name, val);
      else setBaseNow(v, name, val);
    });
    t.schedule(40);
    return;
  }
  setBaseNow(v, name, val);
}
function lockIt(v, st, name, val) { eng.setLock(v, st, name, val); notifyclients(); mgraphics.redraw(); }
lockIt.local = 1;
function setBaseNow(v, name, val) {
  if (name === 'Velocity') {                  // the drum's Vel: update the row box too (it's the saved value)
    eng.set(v, 'velocity', Math.max(1, val)); outlet(7, ['velocity' + v, Math.max(1, val)]);
    mgraphics.redraw(); return;
  }
  eng.setBase(v, name, val);
  const ch = eng.voices[v].ccChannel;
  for (const [cc, x] of eng.paramMessages(name, val)) emit([0xB0 + ch - 1, cc, x]);
  eng.lastCC[ch + ':' + PARAM[name].cc] = val;
  notifyclients(); mgraphics.redraw();
}
setBaseNow.local = 1;

// ---- telling automation from a hand on the knob ----
// Live keeps an automation state per parameter: 0 none, 1 playing, 2 overridden (someone grabbed the knob).
let knobParams = null;
function findKnobParams() {
  try {
    const dev = new LiveAPI('this_device');
    const n = dev.getcount('parameters');
    knobParams = [];
    for (let i = 0; i < n; i++) {
      const prm = new LiveAPI('this_device parameters ' + i);
      const m = /^(\d) Knob (\d+)$/.exec([].concat(prm.get('name')).join(' '));
      if (m) knobParams[(+m[1] - 1) * NUM_SLOTS + (+m[2] - 1)] = prm;
    }
  } catch (e) { knobParams = null; post('Sextant: could not read automation state: ' + e.message + '\n'); }
}
function automationPlaying(v, slot) {
  const prm = knobParams && knobParams[v * NUM_SLOTS + slot];
  if (!prm) return false;
  try { return +[].concat(prm.get('automation_state'))[0] === 1; } catch (e) { return false; }
}
automationPlaying.local = 1;

function pick(slot, name) {
  if (eng.setDial(selVoice, slot, String(name))) notifyclients();
  sendMenus(); sendDials(selVoice); mgraphics.redraw();
}

function lockedit(on) {
  lockEdit = on ? 1 : 0;
  if (!lockEdit) selStep = -1;
  sendDials(); mgraphics.redraw();
}

function clearstep() { if (selStep >= 0) { eng.clearStep(selVoice, selStep); notifyclients(); sendDials(); mgraphics.redraw(); } }
// Clear drum: remove all its locks and put it back to the program's sound right away. With a kits file
// loaded that means the stored program values (undoing knob tweaks too); without one, the drum's base values.
function cleardrum() {
  eng.clearLocks(selVoice);
  const voice = eng.voices[selVoice], ch = voice.ccChannel;
  const k = currentKit();
  if (k) { voice.base = {}; for (const n in k[selVoice]) if (PARAM[n]) eng.setBase(selVoice, n, k[selVoice][n]); }
  for (const n in voice.base) {
    for (const [cc, v] of eng.paramMessages(n, voice.base[n])) emit([0xB0 + ch - 1, cc, v]);
    eng.lastCC[ch + ':' + PARAM[n].cc] = voice.base[n];
  }
  selStep = -1;
  notifyclients(); sendDials(); mgraphics.redraw();
}
function resetcc() { eng.resetCCCache(); }
function bang() {
  sendMenus(); sendDials(); mgraphics.redraw();
  if (!ready) { const t = new Task(() => { ready = true; findKnobParams(); if (kits) kitChanged(); }); t.schedule(500); }
}

// ---------- saving with the Live Set (this object is a hidden Live parameter) ----------
function getvalueof() {
  const p = Array.from(kitsPath, ch => ch.charCodeAt(0) & 0xFFFF);
  return [4, p.length].concat(p, eng.stateFlat());
}
function setvalueof(...a) {
  if (a[0] === 4) {
    const n = a[1], path = String.fromCharCode(...a.slice(2, 2 + n));
    eng.setStateFlat(a.slice(2 + n));
    if (path) loadsyx(path, true);
  } else eng.setStateFlat(a);
  sendMenus(); sendDials(); mgraphics.redraw();
}

// ---------- MIDI from the Nord (its MIDI Out -> this track's input), one byte at a time ----------
// CCs from the Nord's channels become each drum's base and are not passed on (no echo). Program change
// = new kit: forget all bases. Nord notes are dropped (they'd double-trigger). Anything else passes through.
let rxStatus = 0, rx = [], nordFocus = 0, lastIn = '';
function midibyte(b) {
  if (b >= 0xF8) { outlet(0, b); return; }
  if (b >= 0xF0) { rxStatus = b === 0xF7 ? 0 : b; rx = []; outlet(0, b); return; }
  if (b >= 0x80) { rxStatus = b; rx = [b]; return; }
  if (!rxStatus) return;
  if (rxStatus >= 0xF0) { outlet(0, b); return; }
  if (!rx.length) rx = [rxStatus];
  rx.push(b);
  const type = rxStatus & 0xF0;
  if (rx.length < ((type === 0xC0 || type === 0xD0) ? 2 : 3)) return;
  const m = rx; rx = [];
  handleIn(m);
}

// ---------- Nord program (8 banks x 50) ----------
// Bank select arrives/leaves as CC 32 (LSB) then CC 0 (MSB), then Program Change. Until we've seen how the
// Nord numbers its banks, assume MSB 0, LSB = bank-1; the values it actually sends are remembered and reused.
let curBank = 1, curProg = 1, inBankLsb = 0, inBankMsb = 0, bankSeen = false;
const bankCodes = {};                      // bank number -> [msb, lsb] as the Nord sent them
function program(bank, prog) {
  curBank = Math.max(1, Math.min(8, bank | 0)); curProg = Math.max(1, Math.min(50, prog | 0));
  if (!ready) return;                      // the boxes report their stored values on load: remember, don't send
  const [msb, lsb] = bankCodes[curBank] || [0, curBank - 1];
  const ch = MAIN_CH;
  emit([0xB0 + ch - 1, 32, lsb]); emit([0xB0 + ch - 1, 0, msb]); emit([0xC0 + ch - 1, curProg - 1]);
  kitChanged();
}
function setbank(n) { program(n, curProg); }
function setprog(n) { program(curBank, n); }
// ◀ ▶ buttons: step through programs, rolling over into the next/previous bank (8 banks x 50)
function stepprog(d) {
  let i = (curBank - 1) * 50 + (curProg - 1) + (d < 0 ? -1 : 1);
  i = (i + 400) % 400;
  program(Math.floor(i / 50) + 1, (i % 50) + 1);
  outlet(6, ['bank', curBank]); outlet(6, ['prog', curProg]);
}
// With a Nord SysEx file loaded, a program change sets every drum's base to that program's stored values
// (the Nord already has them, so nothing is sent). Without one, bases are forgotten and relearned on touch.
let kits = null, kitsPath = '', kitsName = '';
function currentKit() { return kits && kits[(curBank - 1) + ':' + (curProg - 1)]; }
function kitChanged() {
  const k = currentKit();
  eng.forgetBases();
  if (k) k.forEach((vals, v) => {
    for (const n in vals) if (PARAM[n]) {
      eng.setBase(v, n, vals[n]);
      eng.lastCC[eng.voices[v].ccChannel + ':' + PARAM[n].cc] = vals[n];
    }
  });
  notifyclients(); sendDials(); mgraphics.redraw();
}

// loadsyx <path>: read a Nord Drum 2 SysEx file (e.g. an ALL dump saved with SysEx Librarian)
function loadsyx(path, quiet) {
  path = String(path);
  try {
    const f = new File(path, 'read');
    if (!f.isopen) throw new Error('cannot open');
    const bytes = [];
    while (f.position < f.eof) {
      const chunk = f.readbytes(Math.min(4096, f.eof - f.position));
      if (!chunk || !chunk.length) break;
      for (let i = 0; i < chunk.length; i++) bytes.push(chunk[i] & 255);
    }
    f.close();
    const k = decodeSyx(bytes);
    const n = Object.keys(k).length;
    if (!n) throw new Error('no Nord Drum 2 programs in file');
    kits = k; kitsPath = path; kitsName = path.split('/').pop() + ` (${n})`;
    if (!quiet) notifyclients();
    kitChanged();
  } catch (e) {
    kitsName = 'could not read kits file';
    post('Sextant: ' + e.message + ': ' + path + '\n');
    mgraphics.redraw();
  }
}
kitChanged.local = 1;

function nordVoice(ch) { return ch >= 1 && ch <= 6 ? ch - 1 : ch === 10 ? nordFocus : -1; }
nordVoice.local = 1;

function handleIn(m) {
  const type = m[0] & 0xF0, ch = (m[0] & 15) + 1, v = nordVoice(ch);
  if (v < 0) { emit(m); return; }
  if (type === 0xC0) {                                           // the Nord changed program
    curProg = m[1] + 1;
    // The Nord sends no bank select when you change program on its panel, so keep the current bank
    // unless a bank select actually arrived just before this program change.
    if (bankSeen) {
      const guess = inBankMsb === 0 ? inBankLsb + 1 : curBank;
      if (guess >= 1 && guess <= 8) { curBank = guess; bankCodes[curBank] = [inBankMsb, inBankLsb]; }
      bankSeen = false;
    }
    lastIn = `in ch${ch} bank ${curBank} prog ${curProg}`;
    outlet(6, ['bank', curBank]); outlet(6, ['prog', curProg]);
    kitChanged();
    return;
  }
  if (type === 0xB0) {
    if (m[1] >= 120) return;                                     // Live's all-notes-off etc.
    if (m[1] === 32) { inBankLsb = m[2]; bankSeen = true; lastIn = `in ch${ch} bank lsb ${m[2]}`; mgraphics.redraw(); return; }
    if (m[1] === 0)  { inBankMsb = m[2]; bankSeen = true; lastIn = `in ch${ch} bank msb ${m[2]}`; mgraphics.redraw(); return; }
    lastIn = `in ch${ch} cc${m[1]}=${m[2]}`;
    if (m[1] === 70 && ch === 10) { if (m[2] >= 68 && m[2] <= 73) nordFocus = m[2] - 68; }
    else {
      const name = eng.captureCC(v, m[1], m[2]);
      if (name) {
        notifyclients();
        const slot = eng.voices[v].dials.indexOf(name);
        if (slot >= 0 && !(v === selVoice && lockEdit && selStep >= 0) && !automationPlaying(v, slot)) outlet(1, [v * NUM_SLOTS + slot, m[2]]);
      }
    }
    mgraphics.redraw();
  }
}
handleIn.local = 1;

// ---------- dials and menus ----------
// Note name in Live's convention (60 = C3; the Nord's 69 = A440 shows as A3)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(n) { return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 2); }
function fmtValue(name, val) { return name === 'Pitch' ? noteName(val) : String(val); }
const UNIT_INT = 0, UNIT_MIDI = 8;          // live.dial unit styles: plain integer / MIDI note name
const DRUM_COLORS = [0xff6b5b, 0xffb03b, 0xe8e04a, 0x5fd36b, 0x4fb8ff, 0xc07bff].map(h => rgb(h));
// Put each drum's knobs on its base values (the selected drum's on the selected step's locks in Edit locks).
// Don't move a knob that automation is driving: Live would take that as a hand on the knob and override
// (switch off) its automation. Those knobs keep showing the automated value.
function sendDials(only) {
  for (let v = 0; v < NUM_VOICES; v++) {
    if (only !== undefined && v !== only) continue;
    const vals = eng.dialValues(v, v === selVoice && lockEdit ? selStep : -1);
    for (let sl = 0; sl < vals.length; sl++) if (!automationPlaying(v, sl)) outlet(1, [v * NUM_SLOTS + sl, vals[sl]]);
  }
}
sendDials.local = 1;

// Each menu lists its own parameter plus those not on another dial of the selected drum
function sendMenus() {
  const voice = eng.voices[selVoice];
  for (let v = 0; v < NUM_VOICES; v++) for (let sl = 0; sl < NUM_SLOTS; sl++) {
    const k = v * NUM_SLOTS + sl;
    outlet(8, [k, 'hidden', v === selVoice ? 0 : 1]);
    outlet(8, [k, '_parameter_unitstyle', eng.voices[v].dials[sl] === 'Pitch' ? UNIT_MIDI : UNIT_INT]);
  }
  for (let sl = 0; sl < NUM_SLOTS; sl++) {
    outlet(4, [sl, 'clear']);
    for (const n of eng.availableFor(selVoice, sl)) outlet(4, [sl, 'append', n]);
    outlet(4, [sl, 'setsymbol', voice.dials[sl]]);
  }
}
sendMenus.local = 1;

function selectVoice(r) {
  const changed = r !== selVoice;
  selVoice = r;
  if (changed) sendMenus();
}
selectVoice.local = 1;

// ---------- drawing ----------
const LABEL_W = 14, HEAD_H = 25, PAD = 2;
function geom() { const [w, h] = mgraphics.size; return { w, h, gx: LABEL_W, gw: w - LABEL_W - PAD, rowH: (h - HEAD_H) / 6 }; }
function rgb(hex, a) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, a === undefined ? 1 : a]; }
const C = { bg: rgb(0x1e1e1e), off: rgb(0x3a3a3a), hit: rgb(0xff9b2f), play: rgb(0xffffff, 0.35), sel: rgb(0xffffff),
            lock: rgb(0x4fd1ff), text: rgb(0xcfcfcf), mute: rgb(0x6a6a6a), dim: rgb(0x8a8a8a), warn: rgb(0xff5a4a),
            edit: rgb(0xe8453c), markDark: rgb(0x141414), markLight: rgb(0xe8e8e8) };

function paint() {
  const g = geom(), m = mgraphics;
  const v = eng.voices[selVoice], dc = DRUM_COLORS[selVoice];
  m.set_source_rgba(C.bg); m.rectangle(0, 0, g.w, g.h); m.fill();
  m.select_font_face('Arial');

  // line 1: drum (in its colour) + mode; LOCK EDIT shown as a red badge
  m.set_source_rgba(dc); m.rectangle(2, 3, 8, 8); m.fill();
  m.set_font_size(10); m.move_to(13, 10); m.show_text(`DRUM ${selVoice + 1}`);
  m.set_font_size(9);
  m.set_source_rgba(C.text); m.move_to(62, 10);
  m.show_text(!lockEdit ? 'dials set base sound' : selStep >= 0 ? `editing locks · step ${selStep + 1}` : 'editing locks · click a step');
  if (lastIn) { m.set_source_rgba(C.lock); m.move_to(g.w - 88, 10); m.show_text(lastIn); }
  m.set_source_rgba(kits ? C.dim : C.warn); m.move_to(g.w - 88, 21); m.show_text(kits ? 'kits: ' + kitsName : 'no kits file');

  // line 2: what's locked here (all parameters, shown on a dial or not), or what's missing a base
  let line2 = '', warn = false;
  if (lockEdit && selStep >= 0) {
    const missing = eng.missingBase(selVoice, selStep);
    const L = Object.keys(v.locks[selStep] || {});
    if (missing.length) { line2 = `no base for ${missing.join(', ')}: nudge it on the Nord`; warn = true; }
    else line2 = L.length ? 'locked: ' + L.map(n => n + ' ' + fmtValue(n, v.locks[selStep][n])).join(' · ')
                          : 'turn a dial to lock it (Level/Pan: not lockable, use Velocity)';
  } else if (lockEdit) line2 = 'click a step to edit its locks · shift-click clears';
  else line2 = 'click a row to pick the drum · drag ↔ rotate, ↕ hits';
  m.set_source_rgba(warn ? C.warn : C.dim); m.move_to(13, 21); m.show_text(line2);

  for (let r = 0; r < 6; r++) {
    const voice = eng.voices[r], y = HEAD_H + r * g.rowH;
    if (r === selVoice) {
      m.set_source_rgba(dc[0], dc[1], dc[2], 0.18); m.rectangle(0, y, g.w, g.rowH); m.fill();
      m.set_source_rgba(dc); m.set_line_width(1); m.rectangle(0.5, y + 0.5, g.w - 1, g.rowH - 1); m.stroke();
    }
    const rc = DRUM_COLORS[r];
    m.set_source_rgba(rc[0], rc[1], rc[2], r === selVoice ? 1 : 0.6); m.move_to(3, y + g.rowH * 0.7); m.show_text(String(r + 1));
    const cw = g.gw / voice.steps;
    for (let s = 0; s < voice.steps; s++) {
      const x = g.gx + s * cw, isHit = voice.pattern[s];
      m.set_source_rgba(voice.mute ? (isHit ? C.mute : C.off) : (isHit ? C.hit : C.off));
      m.rectangle(x + 1, y + 2, Math.max(1, cw - 2), g.rowH - 4); m.fill();
      if (s === voice.pos) { m.set_source_rgba(C.play); m.rectangle(x + 1, y + 2, Math.max(1, cw - 2), g.rowH - 4); m.fill(); }
      if (voice.locks[s]) {
        // Lock marker: contrast by brightness, not hue (readable with colour blindness): a near-black dot on
        // bright cells (hits, playhead), a light dot on dark ones. Hollow = no base value to return to.
        const bright = isHit || s === voice.pos;
        const d = Math.max(3, Math.min(6, cw - 4));
        m.set_source_rgba(bright ? C.markDark : C.markLight);
        m.ellipse(x + cw / 2 - d / 2, y + g.rowH - d - 4, d, d);
        if (eng.stepCanReturn(r, s)) m.fill(); else { m.set_line_width(1.5); m.stroke(); }
      }
      if (lockEdit && r === selVoice && s === selStep) {
        m.set_source_rgba(C.sel); m.set_line_width(1.5); m.rectangle(x + 0.5, y + 1, cw - 1, g.rowH - 2); m.stroke();
      }
    }
  }
}

// ---------- mouse ----------
// Normal mode: click a row to select the drum; drag on it left/right to rotate the pattern,
// up/down to add or remove hits. Edit locks mode: click steps to edit their locks.
let drag = null;
function onclick(x, y, but, cmd, shift) {
  const g = geom();
  if (y < HEAD_H) return;
  const row = Math.min(5, Math.floor((y - HEAD_H) / g.rowH));
  drag = !lockEdit && !shift && x >= g.gx ? { row, x, y, rot: eng.voices[row].rotation, hits: eng.voices[row].hits } : null;
  const r = Math.min(5, Math.floor((y - HEAD_H) / g.rowH));
  if (x < g.gx) { selectVoice(r); selStep = -1; }
  else {
    const s = Math.min(eng.voices[r].steps - 1, Math.floor((x - g.gx) / (g.gw / eng.voices[r].steps)));
    if (shift) { eng.clearStep(r, s); notifyclients(); }
    else if (!lockEdit) { selectVoice(r); selStep = -1; }
    else if (r === selVoice && s === selStep) selStep = -1;
    else { selectVoice(r); selStep = s; }
  }
  sendDials(); mgraphics.redraw();
}
onclick.local = 1;

function ondrag(x, y, but) {
  if (!drag) return;
  if (!but) { drag = null; return; }                              // mouse released
  const g = geom(), v = drag.row, x0 = eng.voices[v];
  const cw = g.gw / x0.steps;
  const dRot = Math.round((x - drag.x) / cw);                    // one step per cell dragged
  const dHits = Math.round((drag.y - y) / 6);                     // one hit per 6 px up
  if (drag.rot + dRot !== x0.rotation) setPattern(v, 'rotation', drag.rot + dRot), outlet(7, ['rotation' + v, x0.rotation]);
  if (drag.hits + dHits !== x0.hits) setPattern(v, 'hits', drag.hits + dHits), outlet(7, ['hits' + v, x0.hits]);
  mgraphics.redraw();
}
ondrag.local = 1;
