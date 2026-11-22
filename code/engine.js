// Sextant engine (Euclidean sequencer for Nord Drum 2): Euclidean sequencing + per-step parameter locks for the Nord Drum 2's 6 voices.
// Pure logic, no Max APIs, so it can be tested in Node and loaded by Max's [v8ui] glue script.

const NUM_VOICES = 6;
const DEFAULT_NOTES = [60, 62, 64, 65, 67, 69]; // Nord Drum 2 factory note map (global channel 10)
const NUM_SLOTS = 12;                           // dials; each drum chooses which parameter each dial shows

// Every parameter the Nord accepts by CC, from the Nord Drum 2 manual (OS v3.0x), "MIDI CC Numbers".
// lsb = paired fine CC the Nord needs sent first (value 0) for the change to take effect.
const NORD_CC = [
  { name: 'Level', cc: 7, long: 'Level (volume)' }, { name: 'Pan', cc: 10, long: 'Pan' },
  { name: 'NzFreq', cc: 14, long: 'Noise Filter Frequency' }, { name: 'NzFltTyp', cc: 15, long: 'Noise Filter Type' },
  { name: 'NzFltEnv', cc: 16, long: 'Noise Filter Envelope' }, { name: 'NzRes', cc: 17, long: 'Noise Filter Resonance' },
  { name: 'NzAtk', cc: 18, long: 'Noise Attack/Rate' }, { name: 'NzAtkMd', cc: 19, long: 'Noise Atk Mode' },
  { name: 'NzDecTyp', cc: 20, long: 'Noise Decay Type' }, { name: 'NzDec', cc: 21, long: 'Noise Decay' },
  { name: 'NzDecLo', cc: 22, long: 'Noise Decay Lo' }, { name: 'Dist', cc: 23, long: 'Dist Amount' },
  { name: 'DistTyp', cc: 24, long: 'Dist Type' }, { name: 'EQFreq', cc: 25, long: 'EQ Frequency' },
  { name: 'EQGain', cc: 26, long: 'EQ Gain' }, { name: 'EchoFb', cc: 27, long: 'Echo Feedback' },
  { name: 'EchoAmt', cc: 28, long: 'Echo Amount' }, { name: 'Spectra', cc: 30, long: 'Tone Spectra' },
  { name: 'Pitch', cc: 31, lsb: 63, long: 'Tone Pitch' }, { name: 'Wave', cc: 46, long: 'Tone Wave' },
  { name: 'TmbDec', cc: 47, long: 'Tone Timbre Decay' }, { name: 'Punch', cc: 48, long: 'Tone Punch' },
  { name: 'DecTyp', cc: 49, long: 'Tone Decay Type' }, { name: 'Decay', cc: 50, long: 'Tone Decay' },
  { name: 'DecLo', cc: 51, long: 'Tone Dec Lo' }, { name: 'Timbre', cc: 52, long: 'Tone Timbre' },
  { name: 'TmbEnv', cc: 53, long: 'Tone Timb Envelope' }, { name: 'BendAmt', cc: 54, long: 'Tone Bend Amount' },
  { name: 'BendTm', cc: 55, long: 'Tone Bend Time' }, { name: 'Click', cc: 56, long: 'Click Level' },
  { name: 'ClkTyp', cc: 57, long: 'Click Type' }, { name: 'Bal', cc: 58, long: 'Mix Balance' },
  // Not a CC: the note's own velocity. Lockable per step (accents), and sample-accurate because it travels in the note.
  { name: 'Velocity', cc: null, long: 'Note velocity' },
];
// Level and Pan glide on the Nord instead of jumping, so a per-step change can't be timed reliably:
// they're base/automation only. Use Velocity locks for accents.
const NO_LOCK = new Set(['Level', 'Pan']);
const PARAM = {};  NORD_CC.forEach((p, i) => { PARAM[p.name] = Object.assign({ idx: i }, p); });
const PARAM_NAMES = NORD_CC.map(p => p.name);
// Default dial layout (2 rows of 6): sound shaping on top, levels/space and extras below. Level next to Pan.
const DEFAULT_DIALS = ['Pitch', 'Decay', 'NzFreq', 'NzDec', 'Click', 'Bal',
                       'Level', 'Pan', 'Timbre', 'Punch', 'NzRes', 'Dist'];

// ---- Nord Drum 2 program SysEx (reverse-engineered from dumps, OS 3.0x) ----
// Message: F0 33 7F 19 08 03 <type 8=stored, 6=edit buffer> <bank 0-7> <program 0-49> 03 <payload 197 bytes> <4-byte checksum> F7.
// The payload is a bitstream of 7-bit bytes (MSB first). Drum 1's fields start at the offsets below; each next drum is
// 224 bits further on. Values are stored in the Nord's own ranges, e.g. 0-50; 'f' = floor(cc*N/128), 'r' = round(cc*(N-1)/127).
const SYX_FIELDS = {
  NzFltTyp: [42, 3, 'f', 7],   NzFreq: [45, 6, 'r', 51],  NzRes: [51, 5, 'f', 21],     NzAtk: [62, 6, 'r', 51],
  NzAtkMd: [70, 4, 'r', 13],   NzDecTyp: [74, 2, 'f', 3], NzDec: [76, 6, 'r', 51],     NzDecLo: [82, 6, 'r', 52],
  Dist: [88, 6, 'r', 51],      DistTyp: [97, 2, 'f', 3],  EQGain: [99, 6, 'r', 49],    EQFreq: [105, 6, 'f', 51],
  EchoFb: [121, 5, 'r', 30],   EchoAmt: [126, 5, 'r', 21], Level: [131, 6, 'r', 51],   Wave: [142, 6, 'r', 40],
  Spectra: [148, 7, 'r', 100], TmbEnv: [155, 6, 'f', 51], Timbre: [161, 6, 'f', 51],   TmbDec: [167, 7, 'f', 101],
  Punch: [174, 5, 'f', 6],     DecTyp: [179, 2, 'f', 2],  Decay: [181, 6, 'f', 51],    DecLo: [187, 6, 'r', 52],
  Pitch: [193, 8, 'r', 256],   BendAmt: [201, 7, 'r', 101], BendTm: [208, 6, 'f', 51], Click: [214, 6, 'f', 51],
  ClkTyp: [220, 6, 'r', 36],   Bal: [226, 6, 'f', 41],    NzFltEnv: [233, 7, 'f', 101], Pan: [240, 6, 'r', 41],
};
const DRUM_BITS = 224;

// CC value the Nord would show for a stored value: the middle of the CC values that map onto it
function storedToCC(kind, N, v) {
  const fwd = kind === 'f' ? cc => Math.floor(cc * N / 128) : cc => Math.round(cc * (N - 1) / 127);
  const hits = [];
  for (let cc = 0; cc < 128; cc++) if (fwd(cc) === v) hits.push(cc);
  if (!hits.length) return Math.max(0, Math.min(127, Math.round(v * 127 / Math.max(1, N - 1))));
  return hits[Math.floor((hits.length - 1) / 2)];
}
// One program message -> { bank, prog, type, drums: [ {param: cc}, x6 ] }, or null if it isn't a Nord Drum 2 program
function decodeProgram(m) {
  if (m.length < 212 || m[0] !== 0xF0 || m[1] !== 0x33 || m[3] !== 0x19) return null;
  let bits = '';
  for (let i = 10; i < m.length - 5; i++) bits += (m[i] & 127).toString(2).padStart(7, '0');
  const drums = [];
  for (let d = 0; d < 6; d++) {
    const vals = {};
    for (const n in SYX_FIELDS) {
      const [st, w, kind, N] = SYX_FIELDS[n];
      const v = parseInt(bits.substr(st + d * DRUM_BITS, w), 2);
      vals[n] = n === 'Pitch' ? Math.min(127, v >> 1) : storedToCC(kind, N, Math.min(v, N - 1));
    }
    drums.push(vals);
  }
  return { type: m[6], bank: m[7], prog: m[8], drums };
}
// A whole .syx file (array of bytes) -> { 'bank:prog': drums } for the stored programs in it
function decodeSyx(bytes) {
  const kits = {};
  let i = 0;
  while (i < bytes.length) {
    const a = bytes.indexOf(0xF0, i); if (a < 0) break;
    const b = bytes.indexOf(0xF7, a); if (b < 0) break;
    const p = decodeProgram(bytes.slice(a, b + 1));
    if (p && p.type === 8) kits[p.bank + ':' + p.prog] = p.drums;
    i = b + 1;
  }
  return kits;
}

// Euclidean rhythm: spread `hits` as evenly as possible across `steps`, shifted by `rotation`.
// Equivalent to Bjorklund's algorithm up to rotation; the first hit lands on step 0 when rotation = 0.
function euclid(steps, hits, rotation) {
  steps = Math.max(1, Math.min(64, steps | 0));
  hits = Math.max(0, Math.min(steps, hits | 0));
  rotation = ((rotation | 0) % steps + steps) % steps;
  const out = new Array(steps);
  for (let i = 0; i < steps; i++) {
    const j = (i - rotation + steps) % steps;
    out[i] = hits > 0 && (j * hits) % steps < hits ? 1 : 0;
  }
  return out;
}

function makeVoice(i) {
  return {
    steps: 16, hits: 0, rotation: 0,
    note: DEFAULT_NOTES[i],
    velocity: 100,
    noteChannel: 10,   // global mode by default
    ccChannel: i + 1,  // this drum's own channel, for its parameter CCs
    mute: false,
    solo: false,
    dials: DEFAULT_DIALS.slice(),  // which parameter each of the 12 dials shows for this drum
    locks: {},         // step -> { paramName: value }
    base: {},          // paramName -> value on hits without a lock (learned from the Nord or set by a dial)
    pos: -1,           // last step played (for the playhead)
    pattern: null,
  };
}

class Engine {
  constructor() {
    this.voices = [];
    for (let i = 0; i < NUM_VOICES; i++) { this.voices.push(makeVoice(i)); this.rebuild(i); }
    this.lastCC = {}; // "ch:cc" -> last value sent, to avoid resending (5-pin MIDI is slow)
  }

  rebuild(v) { const x = this.voices[v]; x.pattern = euclid(x.steps, x.hits, x.rotation); }

  set(v, key, value) {
    const voice = this.voices[v];
    if (!voice || !(key in voice)) throw new Error('bad voice/key: ' + v + ' ' + key);
    voice[key] = value;
    if (key === 'steps' || key === 'hits' || key === 'rotation') this.rebuild(v);
  }

  // ---- dial assignment (per drum) ----
  // Parameters a dial's menu may offer: its own plus any not shown on another dial of this drum
  availableFor(v, slot) {
    const used = this.voices[v].dials;
    return PARAM_NAMES.filter(n => n === used[slot] || used.indexOf(n) < 0);
  }
  setDial(v, slot, name) {
    if (!PARAM[name] || this.availableFor(v, slot).indexOf(name) < 0) return false;
    this.voices[v].dials[slot] = name;
    return true;
  }

  // ---- locks and base values (keyed by parameter name) ----
  canLock(name) { return !!PARAM[name] && !NO_LOCK.has(name); }

  setLock(v, step, name, value) {
    const locks = this.voices[v].locks;
    if (value !== null && value !== undefined && !this.canLock(name)) return;
    if (value === null || value === undefined) {
      if (locks[step]) { delete locks[step][name]; if (!Object.keys(locks[step]).length) delete locks[step]; }
      return;
    }
    (locks[step] = locks[step] || {})[name] = Math.max(0, Math.min(127, value | 0));
  }
  clearStep(v, step) { delete this.voices[v].locks[step]; }
  clearLocks(v) { this.voices[v].locks = {}; }
  setBase(v, name, value) { this.voices[v].base[name] = Math.max(0, Math.min(127, value | 0)); }

  // The Nord switched programs: learned values belong to the old kit, so forget them all
  forgetBases() { this.voices.forEach(voice => { voice.base = {}; }); this.resetCCCache(); }

  // False if a locked step has a parameter with no base, i.e. the drum can't be returned afterwards
  missingBase(v, step) {
    const voice = this.voices[v], L = voice.locks[step] || {};
    return Object.keys(L).filter(n => n !== 'Velocity' && !(n in voice.base));
  }
  stepCanReturn(v, step) { return this.missingBase(v, step).length === 0; }

  // What the 12 dials show: the step's lock, else the drum's base, else 64 (centre)
  dialValues(v, step) {
    const voice = this.voices[v], L = (step >= 0 && voice.locks[step]) || {};
    return voice.dials.map(n => (n in L ? L[n] : n === 'Velocity' ? voice.velocity : (n in voice.base ? voice.base[n] : 64)));
  }

  // CC messages for one parameter value; paired parameters get their fine CC (value 0) first
  paramMessages(name, value) {
    const p = PARAM[name];
    if (!p || p.cc === null) return [];
    return p.lsb ? [[p.lsb, 0], [p.cc, value]] : [[p.cc, value]];
  }

  // A CC that came FROM the Nord (its own knob was turned) becomes that drum's base value.
  // Returns the parameter name, '' for a paired fine CC, or null if it isn't a Nord parameter.
  captureCC(v, cc, value) {
    const p = NORD_CC.find(x => x.cc === cc && cc !== null);
    if (!p) return NORD_CC.some(x => x.lsb === cc) ? '' : null;
    this.setBase(v, p.name, value);
    this.lastCC[this.voices[v].ccChannel + ':' + cc] = value;   // the Nord already has it: don't resend
    return p.name;
  }

  resetCCCache() { this.lastCC = {}; }

  // Called once per global 16th. Each voice loops over its own length (polymeter). On a hit, every
  // parameter with a lock or base gets lock-or-base (only if it changed), then the note.
  tick(globalStep) {
    const events = [];
    for (let v = 0; v < NUM_VOICES; v++) {
      const voice = this.voices[v];
      const s = globalStep % voice.steps;
      voice.pos = s;
      if (!this.audible(v) || !voice.pattern[s]) continue;
      const L = voice.locks[s] || {};
      const names = new Set(Object.keys(voice.base).concat(Object.keys(L)));
      for (const n of names) {
        if (PARAM[n].cc === null) continue;                  // Velocity: goes in the note below
        const val = (n in L && !NO_LOCK.has(n)) ? L[n] : voice.base[n];
        if (val === undefined) continue;
        const key = voice.ccChannel + ':' + PARAM[n].cc;
        if (this.lastCC[key] === val) continue;
        this.lastCC[key] = val;
        for (const [cc, x] of this.paramMessages(n, val)) events.push({ type: 'cc', channel: voice.ccChannel, cc, value: x, voice: v });
      }
      const vel = 'Velocity' in L ? Math.max(1, L.Velocity) : voice.velocity;
      events.push({ type: 'note', channel: voice.noteChannel, note: voice.note, velocity: vel, voice: v });
    }
    return events;
  }

  // Like Live's tracks: muted drums are silent; if any drum is soloed, only soloed (unmuted) drums play
  audible(v) {
    const x = this.voices[v];
    return !x.mute && (x.solo || !this.voices.some(o => o.solo));
  }

  // ---- saving with the Live Set: flat int list ----
  // v3: [3, dials (6 x 12 param indexes), nBase, (voice, param, value) x nBase, (voice, step, param, value) ...]
  stateFlat() {
    const out = [3];
    this.voices.forEach(voice => voice.dials.forEach(n => out.push(PARAM[n].idx)));
    const base = [], locks = [];
    this.voices.forEach((voice, v) => {
      for (const n in voice.base) if (PARAM[n].cc !== null) base.push(v, PARAM[n].idx, voice.base[n]);
      for (const st in voice.locks) for (const n in voice.locks[st]) locks.push(v, +st, PARAM[n].idx, voice.locks[st][n]);
    });
    return out.concat([base.length / 3], base, locks);
  }

  setStateFlat(a) {
    this.voices.forEach(voice => { voice.base = {}; voice.locks = {}; });
    if (a[0] === 3) {
      let i = 1;
      this.voices.forEach(voice => { voice.dials = a.slice(i, i + NUM_SLOTS).map(k => PARAM_NAMES[k] || 'Level'); i += NUM_SLOTS; });
      const nb = a[i++];
      for (let k = 0; k < nb; k++, i += 3) if (a[i] < NUM_VOICES) this.setBase(a[i], PARAM_NAMES[a[i + 1]], a[i + 2]);
      for (; i + 3 < a.length; i += 4) if (a[i] < NUM_VOICES) this.setLock(a[i], a[i + 1], PARAM_NAMES[a[i + 2]], a[i + 3]);
    } else if (a[0] === 2 || a[0] === 1) {    // older saves: slots 0-5 were Pitch, Decay, NzFreq, NzDec, Click, Bal
      const old = DEFAULT_DIALS.slice(0, 6);
      let i = 1;
      if (a[0] === 2) { const nb = a[i++]; for (let k = 0; k < nb; k++, i += 3) this.setBase(a[i], old[a[i + 1]], a[i + 2]); }
      for (; i + 3 < a.length; i += 4) this.setLock(a[i], a[i + 1], old[a[i + 2]], a[i + 3]);
    }
    this.resetCCCache();
  }
}

if (typeof module !== 'undefined') module.exports = { euclid, Engine, NUM_VOICES, NUM_SLOTS, DEFAULT_NOTES, NORD_CC, DEFAULT_DIALS, decodeSyx, decodeProgram };
