"""Sextant Probe (temporary, for decoding the Nord's SysEx format). Put it on the NE Out 1 track (Ch. 1).
Setting 'Set' to 1, 2 or 3 sends one known value to every Nord Drum 2 parameter on drum 1; a program dump
after each set shows where each parameter is stored. 0 = do nothing."""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from amxd import Patch, write_amxd, write_maxpat

CCS = [7, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58]
JS = """autowatch = 1; inlets = 1; outlets = 1;
const CCS = %s;
function valueFor(set, i) {
  if (set === 1) return (i * 4 + 3) & 127;
  if (set === 2) return 127 - ((i * 4 + 3) & 127);
  return (i * 37 + 11) %% 128;
}
let ready = false;
function bang() { const t = new Task(() => { ready = true; }); t.schedule(800); }
function probe(set) {
  if (!ready || set < 1 || set > 3) return;
  let i = 0;
  const t = new Task(() => {
    if (i >= CCS.length) { t.cancel(); post('probe set ' + set + ' sent\\n'); return; }
    const cc = CCS[i], v = valueFor(set, i);
    if (cc === 31) outlet(0, [0xB0, 63, 0]);           // Tone Pitch: LSB first
    outlet(0, [0xB0, cc, v]);
    i++;
  });
  t.interval = 15; t.repeat(CCS.length + 1);
}
""" % json.dumps(CCS)

p = Patch()
min_ = p.box('midiin', x=20, y=20, outs=1, outtypes=['int'])
mout = p.box('midiout', x=20, y=300, outs=0)
p.wire(min_, mout)
js = p.box('v8 @embed 1', x=200, y=200, w=100, ins=1, outs=1, outtypes=[''], filename='none',
           saved_object_attributes={'parameter_enable': 0},
           textfile={'text': JS, 'filename': 'none', 'flags': 1, 'embed': 1, 'autowatch': 1})
p.wire(js, mout)
td = p.box('live.thisdevice', x=200, y=20, w=100, ins=1, outs=3, outtypes=['bang', 'int', 'int'])
p.wire(td, js)
p.box(maxclass='comment', text='Sextant Probe', x=20, y=80, w=100, h=18, ins=1, outs=0, present=[4, 2, 100, 18], fontface=1)
nb = p.box(maxclass='live.numbox', x=60, y=100, w=40, h=15, ins=1, outs=2, outtypes=['', 'float'],
           present=[44, 28, 36, 15], parameter_enable=1, varname='Set',
           saved_attribute_attributes={'valueof': {
               'parameter_longname': 'Set', 'parameter_shortname': 'Set', 'parameter_type': 1,
               'parameter_unitstyle': 0, 'parameter_mmin': 0, 'parameter_mmax': 3,
               'parameter_initial_enable': 1, 'parameter_initial': [0]}})
p.box(maxclass='comment', text='Set', x=20, y=100, w=40, h=18, ins=1, outs=0, present=[4, 26, 40, 18])
pre = p.box('prepend probe', x=60, y=150, w=90, ins=1, outs=1)
p.wire(nb, pre); p.wire(pre, js)
d = p.to_dict(width=110)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'devices')
write_amxd(os.path.join(out, 'Sextant Probe.amxd'), d)
print('ok probe')
