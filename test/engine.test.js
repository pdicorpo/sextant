const assert = require('assert');
const { euclid, Engine } = require('../code/engine.js');
const str = a => a.map(x => (x ? 'x' : '.')).join('');
const rotEq = (a, t) => (t + t).includes(str(a)) && str(a).length === t.length;
assert(rotEq(euclid(8, 3, 0), 'x..x..x.'), 'tresillo');
assert(rotEq(euclid(8, 5, 0), 'x.xx.xx.'), 'cinquillo');
assert(rotEq(euclid(16, 4, 0), 'x...x...x...x...'));
assert(rotEq(euclid(12, 7, 0), 'x.xx.x.xx.x.'));
assert.strictEqual(str(euclid(8, 3, 1)), '.' + str(euclid(8, 3, 0)).slice(0, 7), 'rotation');
assert.strictEqual(str(euclid(4, 9, 0)), 'xxxx');
const ccs = (ev, v) => ev.filter(x => x.type === 'cc' && (v === undefined || x.voice === v)).map(x => [x.channel, x.cc, x.value]);

// Locks are per step: base, lock, back to base, then nothing resent
let e = new Engine(); e.set(0, 'hits', 16); e.setBase(0, 'Decay', 30); e.setLock(0, 1, 'Decay', 100);   // instant param
assert.deepStrictEqual([0, 1, 2, 3].map(s => ccs(e.tick(s)).map(x => x[2])), [[30], [100], [30], []]);
// Level/Pan can't be locked (the Nord glides them); Velocity locks go in the note itself
e = new Engine(); e.set(1, 'hits', 16); e.setBase(1, 'Level', 126);
e.setLock(1, 2, 'Level', 10); assert.deepStrictEqual(e.voices[1].locks, {}, 'Level lock refused');
e.setLock(1, 2, 'Velocity', 30);
const nv = st => e.tick(st).filter(x => x.type === 'note').map(x => x.velocity);
assert.deepStrictEqual([nv(1), nv(2), nv(3)], [[100], [30], [100]], 'velocity lock only on its step');
assert.deepStrictEqual(e.dialValues(1, 2).length, 12);
// Pitch: LSB 63 then MSB 31, on the drum's own channel
e = new Engine(); e.set(2, 'hits', 16); e.setLock(2, 0, 'Pitch', 72);
assert.deepStrictEqual(ccs(e.tick(0), 2), [[3, 63, 0], [3, 31, 72]]);
// No base: lock sent once and holds; flagged as missing
assert.deepStrictEqual(e.missingBase(2, 0), ['Pitch']);
// Dials: 12 per drum, menus exclude parameters already on another dial of THIS drum
assert.strictEqual(e.voices[0].dials.length, 12);
assert.strictEqual(e.availableFor(0, 0).indexOf('Decay'), -1, 'Decay is on dial 2');
assert(e.availableFor(0, 0).indexOf('Pitch') >= 0 && e.availableFor(0, 0).indexOf('EchoAmt') >= 0);
assert.strictEqual(e.availableFor(0, 0).length, 33 - 11);   // 32 Nord params + Velocity
assert.strictEqual(e.setDial(0, 0, 'Decay'), false, 'cannot duplicate');
assert.strictEqual(e.setDial(1, 0, 'EchoAmt'), true);
assert.strictEqual(e.voices[0].dials[0], 'Pitch', 'other drums unaffected');
assert.deepStrictEqual(e.voices[0].dials.slice(6, 8), ['Level', 'Pan'], 'Level next to Pan');
// A lock on a parameter not shown on any dial still plays
e = new Engine(); e.set(0, 'hits', 16); e.setDial(0, 0, 'EchoAmt'); e.setLock(0, 0, 'Pitch', 50);
assert.deepStrictEqual(ccs(e.tick(0)), [[1, 63, 0], [1, 31, 50]]);
// Capture from the Nord: any parameter, not echoed back
e = new Engine(); e.set(1, 'hits', 16);
assert.strictEqual(e.captureCC(1, 28, 77), 'EchoAmt'); assert.strictEqual(e.captureCC(1, 63, 0), ''); assert.strictEqual(e.captureCC(1, 99, 1), null);
assert.strictEqual(ccs(e.tick(0)).length, 0);
// Kit change forgets bases
e.forgetBases(); assert.deepStrictEqual(e.voices[1].base, {});
// Save/restore v3 round-trip, including per-drum dial layout
e = new Engine(); e.setDial(4, 3, 'Wave'); e.setBase(4, 'Wave', 9); e.setLock(4, 7, 'Pan', 100); e.setLock(0, 2, 'Level', 1);
const r = new Engine(); r.setStateFlat(e.stateFlat());
assert.deepStrictEqual(r.voices.map(v => [v.dials, v.base, v.locks]), e.voices.map(v => [v.dials, v.base, v.locks]), 'v3 round-trip');
// v2 saves still load (slot 1 = Decay)
const o = new Engine(); o.setStateFlat([2, 1, 0, 1, 30, 0, 5, 1, 99]);
assert.deepStrictEqual([o.voices[0].base, o.voices[0].locks], [{ Decay: 30 }, { 5: { Decay: 99 } }]);
// Solo/mute like Live: solo isolates; a muted drum stays silent even if soloed
const so = new Engine(); [0, 1, 2].forEach(v => so.set(v, 'hits', 16));
so.set(1, 'solo', true); so.set(2, 'solo', true); so.set(2, 'mute', true);
assert.deepStrictEqual(so.tick(0).filter(x => x.type === 'note').map(x => x.voice), [1]);
console.log('all engine tests passed');
