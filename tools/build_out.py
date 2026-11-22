"""Sextant Out: tiny MIDI effect for each per-drum track. Receives the main device's messages for one
channel and sends them out of this track (whose output channel Live then applies)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from amxd import Patch, write_amxd, write_maxpat
VERSION = open(os.path.join(os.path.dirname(__file__), '..', 'VERSION')).read().strip()

JS = """autowatch = 1; inlets = 1; outlets = 1;
let drum = 1;
function drumsel(n) { drum = n; }
// from [receive nordeuclid_out]: <channel> <status> <data...>
function list(ch, ...bytes) { if (ch === drum) outlet(0, bytes); }
"""
p = Patch()
min_ = p.box('midiin', x=20, y=20, outs=1, outtypes=['int'])
mout = p.box('midiout', x=20, y=300, outs=0)
p.wire(min_, mout)
rcv = p.box('receive nordeuclid_out', x=200, y=20, w=140, ins=0, outs=1)
js = p.box('v8 @embed 1', x=200, y=200, w=100, ins=1, outs=1, outtypes=[''], filename='none',
           saved_object_attributes={'parameter_enable': 0},
           textfile={'text': JS, 'filename': 'none', 'flags': 1, 'embed': 1, 'autowatch': 1})
p.wire(rcv, js); p.wire(js, mout)

p.box(maxclass='comment', text='Sextant Out', x=20, y=80, w=100, h=18, ins=1, outs=0, present=[4, 2, 100, 18], fontface=1)
p.box(maxclass='comment', text='Drum', x=20, y=100, w=40, h=18, ins=1, outs=0, present=[4, 26, 40, 18])
nb = p.box(maxclass='live.numbox', x=60, y=100, w=40, h=15, ins=1, outs=2, outtypes=['', 'float'],
           present=[44, 28, 36, 15], parameter_enable=1, varname='Drum',
           saved_attribute_attributes={'valueof': {
               'parameter_longname': 'Drum', 'parameter_shortname': 'Drum', 'parameter_type': 1,
               'parameter_unitstyle': 0, 'parameter_mmin': 1, 'parameter_mmax': 6,
               'parameter_initial_enable': 1, 'parameter_initial': [1]}})
p.box(maxclass='comment', text='Set this track output to the same Ch.', x=20, y=130, w=150, h=30, ins=1, outs=0,
      present=[4, 50, 110, 30], fontsize=8.0, linecount=2)
hold = p.box('int', x=60, y=130, w=40, ins=2, outs=1, outtypes=['int'])
pre = p.box('prepend drumsel', x=60, y=160, w=100, ins=1, outs=1)
td = p.box('live.thisdevice', x=200, y=100, w=100, ins=1, outs=3, outtypes=['bang', 'int', 'int'])
p.wire(nb, hold); p.wire(hold, pre); p.wire(pre, js); p.wire(td, hold)

d = p.to_dict(width=120)
out = os.path.join(os.path.dirname(__file__), '..', 'devices')
d['patcher']['description'] = (f'Sextant Out {VERSION} — carries one Nord Drum 2 channel for Sextant. Set Drum to 1-6 and this '
    "track's MIDI output to the Nord on the same channel.")
write_amxd(os.path.join(out, 'Sextant Out.amxd'), d)
write_maxpat(os.path.join(out, 'Sextant Out.maxpat'), d)
print('ok out')
