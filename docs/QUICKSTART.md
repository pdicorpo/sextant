# Sextant quick start

Full guide: see the README on the project page.

1. Copy `Sextant.amxd` and `Sextant Out.amxd` into your Live User Library.
2. **Nord Drum 2** (Shift + MIDI to step through settings): global channel `L.10`, per-drum channels `Ch.1`…`Ch.6`,
   `PC.Sr`, `CC.Sr`.
3. **Live** *Settings → Link, Tempo & MIDI*: the Nord's port output **Track** on; input **Track + Remote** on.
4. **Main MIDI track**: Sextant. MIDI To = Nord port, **Ch. 10**. MIDI From = Nord port, all channels, Monitor **In**.
5. **Six MIDI tracks**: Sextant Out, Drum = 1…6. MIDI To = Nord port, **same channel** 1…6. MIDI From = No Input.
   Shortcut: drag in `Sextant Out tracks.als` and just pick your Nord's port on each track.
6. Optional: record an `ALL` SysEx dump from the Nord (Shift + MIDI → `ALL` → Program) and load it with **Kits…**.
7. Press play. Turn on **Edit locks**, click a hit, turn a knob to lock it.

Level and Pan can't be locked (the Nord glides them); use Velocity locks for accents.
