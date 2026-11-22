"""Sextant — Euclidean sequencer for Nord Drum 2: 6 voices, per-step parameter locks."""
import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
from amxd import Patch, write_amxd, write_maxpat
VERSION = open(os.path.join(os.path.dirname(__file__), '..', 'VERSION')).read().strip()

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'devices')

engine = re.sub(r"^if \(typeof module.*$", '', open(os.path.join(ROOT, 'code', 'engine.js')).read(), flags=re.M)
jscode = engine + '\n' + open(os.path.join(ROOT, 'code', 'ui.js')).read()
open(os.path.join(OUT, 'sextant.js'), 'w').write(jscode)   # reference copy; the device embeds it

DEFAULTS = [(16, 4, 0, 110), (16, 2, 4, 100), (16, 7, 0, 80), (12, 5, 0, 90), (16, 3, 2, 90), (16, 0, 0, 90)]
COLS = [('steps', 'Steps', 1, 64), ('hits', 'Hits', 0, 64), ('rotation', 'Rot', 0, 63), ('velocity', 'Vel', 1, 127)]
ROWKEYS = [f'{k}{v}' for k in ('steps', 'hits', 'rotation', 'velocity') for v in range(6)]
SLOTS = ['Pitch', 'Decay', 'NzFreq', 'NzDec', 'Click', 'Bal']

p = Patch()
min_ = p.box('midiin', x=20, y=20, outs=1, outtypes=['int'])
mout = p.box('midiout', x=20, y=1000, outs=0)

# Engine + step grid in one embedded v8ui. It is also a hidden Live parameter so locks save with the Set.
GRID = [284, 4, 330, 160]
ui = p.box(maxclass='v8ui', x=20, y=900, w=330, h=160, ins=1, outs=8, outtypes=[''] * 8,
           present=GRID, filename='none', parameter_enable=1, varname='NE Locks',
           textfile={'text': jscode, 'filename': 'none', 'flags': 0, 'embed': 1, 'autowatch': 1},
           saved_attribute_attributes={'valueof': {
               'parameter_longname': 'NE Locks', 'parameter_shortname': 'Locks',
               'parameter_type': 3, 'parameter_invisible': 1}})
p.wire(ui, mout, 0, 0)
snd = p.box('send nordeuclid_out', x=200, y=1000, w=130, ins=1, outs=0)   # to the NordEuclid Out tracks
p.wire(ui, snd, 3, 0)
npipe = p.box('pipe 0 0 0 3', x=350, y=1000, w=90, ins=4, outs=3, outtypes=['int', 'int', 'int'])   # notes 3 ms late
npack = p.box('pack 0 0 0', x=350, y=1030, w=80, ins=3, outs=1)
p.wire(ui, npipe, 5, 0)
for k in range(3): p.wire(npipe, npack, k, k)
p.wire(npack, mout)
pre_in = p.box('prepend midibyte', x=20, y=50, w=100, ins=1, outs=1)   # incoming MIDI goes through the engine
p.wire(min_, pre_in); p.wire(pre_in, ui)

# Clock: 16th-note metro running only while Live plays; step index from transport ticks (480 ppq)
metro = p.box('metro 16n @autostart 1 @autostarttime 0 @quantize 16n', x=600, y=20, w=300, ins=2, outs=1, outtypes=['bang'])
tr = p.box('transport', x=600, y=60, w=80, ins=2, outs=9, outtypes=['int'] * 9)
ex = p.box('expr int($f1/120.+0.5)', x=600, y=100, w=160, ins=1, outs=1)
pre_step = p.box('prepend step', x=600, y=140, ins=1, outs=1)
p.wire(metro, tr); p.wire(tr, ex, 7, 0); p.wire(ex, pre_step); p.wire(pre_step, ui)

thisdev = p.box('live.thisdevice', x=300, y=20, w=100, ins=1, outs=3, outtypes=['bang', 'int', 'int'])
rc = p.box('resetcc', maxclass='message', x=300, y=60, w=60, ins=2, outs=1)
p.wire(thisdev, rc); p.wire(rc, ui)
# Mouse button state (polled): lets the engine tell a hand on a knob from automation moving it
mpoll = p.box('poll', maxclass='message', x=460, y=60, w=40, ins=2, outs=1)
ms = p.box('mousestate', x=460, y=90, w=80, ins=1, outs=5, outtypes=['int', 'int', 'int', 'int', 'int'])
mch = p.box('change', x=460, y=120, w=50, ins=1, outs=3, outtypes=['', 'int', 'int'])
mpre = p.box('prepend mouse', x=460, y=150, w=90, ins=1, outs=1)
p.wire(thisdev, mpoll); p.wire(mpoll, ms); p.wire(ms, mch); p.wire(mch, mpre); p.wire(mpre, ui)
dl = p.box('deferlow', x=380, y=60, ins=1, outs=1)
p.wire(thisdev, dl); p.wire(dl, ui)        # bang -> sendDials() once the device is ready

# ---- Program (top left): Nord bank 1-8, program 1-50. Shows what the Nord reports; changing sends it. ----
route_prog = p.box('route bank prog', x=1200, y=20, w=100, ins=1, outs=3, outtypes=['', '', ''])
p.wire(ui, route_prog, 6, 0)
PROG_LAYOUT = [('Bank', 'bank', 8, 80, 106, 26), ('Prog', 'prog', 50, 138, 180, 26)]   # label x, box x, box w
for i, (lab, key, hi, lx, bx_, bw) in enumerate(PROG_LAYOUT):
    p.box(maxclass='comment', text=lab, x=1200 + i * 100, y=50, w=40, h=18, ins=1, outs=0, present=[lx, 2, 30, 16])
    nb = p.box(maxclass='live.numbox', x=1200 + i * 100, y=80, w=40, h=15, ins=1, outs=2, outtypes=['', 'float'],
               present=[bx_, 3, bw, 15], parameter_enable=1, varname=f'Nord {lab}',
               saved_attribute_attributes={'valueof': {
                   'parameter_longname': f'Nord {lab}', 'parameter_shortname': lab, 'parameter_type': 1,
                   'parameter_unitstyle': 0, 'parameter_mmin': 1, 'parameter_mmax': hi,
                   'parameter_initial_enable': 1, 'parameter_initial': [1]}})
    sp = p.box('prepend set', x=1200 + i * 100, y=110, w=70, ins=1, outs=1)      # Nord -> box, no output
    p.wire(route_prog, sp, i, 0); p.wire(sp, nb)
    pre = p.box(f'prepend set{key}', x=1200 + i * 100, y=140, w=90, ins=1, outs=1)  # box -> engine -> Nord
    p.wire(nb, pre); p.wire(pre, ui)

# ---- Pattern table (left) ----
p.box(maxclass='comment', text='Sextant', x=20, y=60, w=100, h=20, ins=1, outs=0, present=[4, 2, 50, 18], fontface=1)
p.box(maxclass='comment', text=f'v{VERSION}', x=130, y=60, w=60, h=16, ins=1, outs=0, present=[50, 4, 34, 14], fontsize=8.0,
      textcolor=[0.6, 0.6, 0.6, 1.0])
xs = [24, 66, 108, 150, 190]
for label, x in zip(['Steps', 'Hits', 'Rot', 'Vel', 'Pitch'], xs):
    p.box(maxclass='comment', text=label, x=20, y=60, w=40, h=18, ins=1, outs=0, present=[x, 18, 40, 16])
MX, SX = 228, 250                                    # M and S columns

def param_attrs(name, ptype, lo=0, hi=1, init=0, extra=None):
    d = {'parameter_longname': name, 'parameter_shortname': name.split()[-1], 'parameter_type': ptype,
         'parameter_mmin': lo, 'parameter_mmax': hi, 'parameter_initial_enable': 1, 'parameter_initial': [init]}
    if ptype == 1: d['parameter_unitstyle'] = 0
    d.update(extra or {})
    return {'valueof': d}

def numbox(name, lo, hi, init, x, y, pres):
    # parameter_type 0 (float): Live draws a normal automation lane instead of a tall stepped one;
    # unitstyle 0 keeps whole-number display, and the engine rounds what it receives.
    return p.box(maxclass='live.numbox', x=x, y=y, w=40, h=15, ins=1, outs=2, outtypes=['', 'float'], present=pres,
                 parameter_enable=1, varname=name,
                 saved_attribute_attributes=param_attrs(name, 0, lo, hi, init, {'parameter_unitstyle': 0}))

def toggle(name, x, y, pres):
    return p.box(maxclass='live.toggle', x=x, y=y, w=15, h=15, ins=1, outs=1, outtypes=[''], present=pres,
                 parameter_enable=1, varname=name,
                 saved_attribute_attributes=param_attrs(name, 2, 0, 1, 0, {'parameter_enum': ['off', 'on']}))

LIVE_SOLO_BLUE = [0.33, 0.66, 0.93, 1.0]
def textbtn(name, label, x, y, pres, toggle=True, oncolor=None, hidden=False):
    attrs = {'parameter_longname': name, 'parameter_shortname': label, 'parameter_type': 2,
             'parameter_enum': ['off', 'on'], 'parameter_mmax': 1,
             'parameter_initial_enable': 1, 'parameter_initial': [0]}
    if hidden: attrs['parameter_invisible'] = 2
    extra = {} if toggle else {'mode': 0}
    if oncolor: extra.update(activebgoncolor=oncolor, bgoncolor=oncolor)
    return p.box(maxclass='live.text', text=label, texton=label, x=x, y=y, w=20, h=15, ins=1, outs=2,
                 outtypes=['', ''], present=pres, parameter_enable=1, varname=name,
                 saved_attribute_attributes={'valueof': attrs}, **extra)

def held(obj, msg, x, y):
    """control -> [int] -> [prepend msg] -> ui; on load bang the [int] (never the control: banging a toggle flips it)."""
    hold = p.box('f', x=x, y=y, w=40, ins=2, outs=1, outtypes=['float'])
    pre = p.box(f'prepend {msg}', x=x, y=y + 25, w=110, ins=1, outs=1)
    p.wire(obj, hold); p.wire(hold, pre); p.wire(pre, ui); p.wire(thisdev, hold)

# Kits...: choose the Nord SysEx file (an ALL dump). The path is saved with the Set.
kb = textbtn('Load kits', 'Kits…', 1500, 20, [230, 2, 44, 16], toggle=False, hidden=True)
# ◀ ▶ either side of the Prog box: step through programs (rolling over between banks)
for j, (lab, d, px_) in enumerate([('◀', -1, 165), ('▶', 1, 207)]):
    ab = textbtn(f'Prog {"down" if d < 0 else "up"}', lab, 1600 + j * 60, 20, [px_, 3, 14, 15], toggle=False, hidden=True)
    at = p.box('t b', x=1600 + j * 60, y=50, ins=1, outs=1, outtypes=['bang'])
    am = p.box(f'stepprog {d}', maxclass='message', x=1600 + j * 60, y=80, w=70, ins=2, outs=1)
    p.wire(ab, at); p.wire(at, am); p.wire(am, ui)
kbs = p.box('t b', x=1500, y=50, ins=1, outs=1, outtypes=['bang'])   # button mode sends a bang
od = p.box('opendialog', x=1500, y=80, w=80, ins=1, outs=2, outtypes=['', 'bang'])
odp = p.box('prepend loadsyx', x=1500, y=110, w=100, ins=1, outs=1)
p.wire(kb, kbs); p.wire(kbs, od); p.wire(od, odp); p.wire(odp, ui)

route_row = p.box('route ' + ' '.join(ROWKEYS), x=1400, y=20, w=400, ins=1, outs=len(ROWKEYS) + 1,
                  outtypes=[''] * (len(ROWKEYS) + 1))
p.wire(ui, route_row, 7, 0)
for v in range(6):
    row_y = 36 + v * 21
    py = 160 + v * 100
    p.box(maxclass='comment', text=str(v + 1), x=20, y=py, w=20, h=18, ins=1, outs=0, present=[6, row_y, 16, 16])
    ctrls = []
    for c, ((key, label, lo, hi), x) in enumerate(zip(COLS, xs)):
        nb = numbox(f'V{v+1} {label}', lo, hi, DEFAULTS[v][c], 40 + c * 120, py, [x, row_y, 38, 15])
        ctrls.append((nb, key))
        if key in ('steps', 'hits', 'rotation', 'velocity'):   # engine corrections / drags / Velocity knob -> box
            sp = p.box('prepend set', x=40 + c * 120, y=py + 75, w=70, ins=1, outs=1)
            p.wire(route_row, sp, ROWKEYS.index(f'{key}{v}'), 0); p.wire(sp, nb)
    ctrls.append((toggle(f'V{v+1} Pitch', 520, py, [xs[4] + 10, row_y, 15, 15]), 'pitched'))
    ctrls.append((textbtn(f'V{v+1} Mute', 'M', 600, py, [MX, row_y, 18, 15]), 'mute'))
    ctrls.append((textbtn(f'V{v+1} Solo', 'S', 680, py, [SX, row_y, 18, 15], oncolor=LIVE_SOLO_BLUE), 'solo'))
    for i, (obj, key) in enumerate(ctrls):
        held(obj, f'param {v} {key}', 40 + i * 120, py + 25)

# ---- 12 dials (right), 2 rows of 6; each has a parameter menu above it ----
# The menu (a plain umenu, not a Live parameter) is the dial's label; its items come from the engine:
# the dial's own parameter plus any not already on another dial of the selected drum.
NUM_DIALS = 12
DX, DY, CW, RH = 620, 2, 47, 56          # left, top, column width, row height
route_val = p.box('route ' + ' '.join(map(str, range(NUM_DIALS))), x=400, y=1000, w=260, ins=1, outs=NUM_DIALS + 1,
                  outtypes=[''] * (NUM_DIALS + 1))
route_menu = p.box('route ' + ' '.join(map(str, range(NUM_DIALS))), x=400, y=1040, w=260, ins=1, outs=NUM_DIALS + 1,
                   outtypes=[''] * (NUM_DIALS + 1))
p.wire(ui, route_val, 1, 0)
p.wire(ui, route_menu, 4, 0)
for i in range(NUM_DIALS):
    col, row = i % 6, i // 6
    px, py = DX + col * CW, DY + row * RH
    bx, by = 400 + i * 110, 700
    menu = p.box(maxclass='umenu', x=bx, y=by, w=46, h=15, ins=1, outs=3, outtypes=['int', '', ''],
                 present=[px, py, 45, 15], fontsize=8.0, items=[], parameter_enable=0, arrow=0)
    d = p.box(maxclass='live.dial', x=bx, y=by + 30, w=44, h=36, ins=1, outs=2, outtypes=['', 'float'],
              present=[px + 3, py + 16, 40, 36], parameter_enable=1, varname=f'Dial {i+1}', showname=0,
              saved_attribute_attributes=param_attrs(f'Dial {i+1}', 0, 0, 127, 64,
                                                     {'parameter_shortname': f'D{i+1}', 'parameter_unitstyle': 0}))
    pre = p.box(f'prepend dial {i}', x=bx, y=by + 80, w=80, ins=1, outs=1)
    p.wire(d, pre); p.wire(pre, ui)
    setp = p.box('prepend set', x=bx, y=by + 110, w=70, ins=1, outs=1)       # engine -> dial, no output
    p.wire(route_val, setp, i, 0); p.wire(setp, d)
    p.wire(ui, d, 2, 0)                                                      # dial colour = selected drum
    p.wire(route_menu, menu, i, 0)                                           # engine fills the menu
    pk = p.box(f'prepend pick {i}', x=bx, y=by + 140, w=80, ins=1, outs=1)
    p.wire(menu, pk, 1, 0); p.wire(pk, ui)                                   # chosen item text -> engine

# Edit locks: toggle in Live's standard 'on' colour. A hidden Live parameter (live.text only keeps toggle
# state as a parameter); "hidden" means it can't be automated or mapped, and it starts off on load.
BY = DY + 2 * RH + 2
le = p.box(maxclass='live.text', text='Edit locks', texton='Edit locks', x=800, y=600, w=60, h=15, ins=1, outs=2,
           outtypes=['', ''], present=[DX, BY + 2, 100, 18], parameter_enable=1, varname='Edit locks',
           fontsize=10.0, fontface=1,     # no colour overrides: Live's own theme colour, like the Mute toggles
           saved_attribute_attributes={'valueof': {
               'parameter_longname': 'Edit locks', 'parameter_shortname': 'Edit locks', 'parameter_type': 2,
               'parameter_enum': ['off', 'on'], 'parameter_mmax': 1, 'parameter_invisible': 2,
               'parameter_initial_enable': 1, 'parameter_initial': [0]}})
le_pre = p.box('prepend lockedit', x=800, y=630, w=100, ins=1, outs=1)
p.wire(le, le_pre); p.wire(le_pre, ui)
for i, (label, msg) in enumerate([('Clr step', 'clearstep'), ('Clr drum', 'cleardrum')]):
    b = textbtn(f'{label}', label, 800 + i * 100, 700, [DX + 106 + i * 68, BY + 3, 64, 16], toggle=False, hidden=True)
    sel = p.box('t b', x=800 + i * 100, y=730, ins=1, outs=1, outtypes=['bang'])   # button mode sends a bang
    m = p.box(msg, maxclass='message', x=800 + i * 100, y=760, w=70, ins=2, outs=1)
    p.wire(b, sel); p.wire(sel, m); p.wire(m, ui)

# ---- Automation list: short, grouped by drum, knobs last ----
# Live's automation chooser lists every visible parameter, in parameter order. Rename to "1 Steps" ... "6 Solo",
# "Knob 1-12", and make the ones nobody automates "stored only" (saved with the Set, not in the automation list).
import re as _re
HIDE = {'Vel', 'Pitch'}
COL_ORDER = ['Steps', 'Hits', 'Rot', 'Vel', 'Pitch', 'Mute', 'Solo']
for b in p.boxes:
    v = b['box'].get('saved_attribute_attributes', {}).get('valueof')
    if not v: continue
    name = v['parameter_longname']
    m = _re.match(r'V(\d) (\w+)$', name)
    if m:
        drum, col = int(m.group(1)), m.group(2)
        v['parameter_longname'] = f'{drum} {col}'
        v['parameter_order'] = drum * 10 + COL_ORDER.index(col)
        if col in HIDE: v['parameter_invisible'] = 1
        continue
    m = _re.match(r'Dial (\d+)$', name)
    if m:
        v['parameter_longname'] = f'Knob {m.group(1)}'; v['parameter_shortname'] = f'Knob {m.group(1)}'
        v['parameter_order'] = 100 + int(m.group(1))
        continue
    if name in ('Nord Bank', 'Nord Prog'):
        v['parameter_invisible'] = 1; v['parameter_order'] = 200 + (name == 'Nord Prog')
    elif v.get('parameter_invisible') != 2:
        v.setdefault('parameter_order', 300)

d = p.to_dict(width=DX + 6 * CW + 6)
d['patcher']['description'] = (f'Sextant {VERSION} — Euclidean sequencer for Nord Drum 2. Six drums with steps, hits and rotation, '
    'plus per-step parameter locks on 12 assignable dials. Put this on a track sending to the Nord on Ch. 10, '
    'and a Sextant Out device on six tracks sending on Ch. 1-6.')
write_amxd(os.path.join(OUT, 'Sextant.amxd'), d)
write_maxpat(os.path.join(OUT, 'Sextant.maxpat'), d)
print('ok', len(p.boxes), 'boxes')
