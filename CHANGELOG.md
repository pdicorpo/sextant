# Changelog

All notable changes to Sextant. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-11-24

### Fixed
- Automating a drum's row (e.g. Mute) changed the selected drum, so knob automation suddenly moved a different
  drum. Only mouse edits change the selection now.
- Sextant stopped when Live's loop jumped back (the transport-locked clock was left waiting for a position past the
  loop end). A watchdog now restarts the clock after loop jumps or position changes.

### Removed
- The per-drum **Pitch** switch (pitched notes on the drum's own channel). It only retuned the drum to a fixed note;
  use **Pitch** locks for melodies instead.

### Changed
- The Pitch knob shows note names (Live's convention: 60 = C3, so the Nord's 69 = A440 is A3), and the lock list in
  the grid header shows each locked value.
- Lock markers on the grid now contrast by brightness instead of colour (dark dot on hits, light dot on empty steps)
  and are slightly larger, so they're readable with colour blindness.

## [0.1.0] — 2026-11-22

First public version.

### Added
- Six-voice Euclidean sequencer for the Nord Drum 2: steps (1–64), hits, rotation and velocity per drum, each drum
  looping on its own length (polymeter). Synced to Live's transport in 16th notes.
- Step grid: click a row to select a drum; drag ↔ to rotate, ↕ to add or remove hits.
- Per-step parameter locks on 12 knobs per drum. Each knob's menu chooses any of the Nord's 32 CC parameters, or
  note Velocity. Locks are edited with **Edit locks** on; a hand on the knob writes a lock, automation never does.
- Base sound per drum, restored on unlocked hits. Loaded from a Nord Drum 2 SysEx program dump (**Kits…**),
  learned from the Nord's own knobs, or set from Sextant's knobs.
- Reverse-engineered Nord Drum 2 program SysEx format (`docs/nord_drum2_sysex_format.md`).
- Bank/Prog display and control with ◀ ▶, following program changes made on the Nord.
- Mute and solo per drum; Clr step / Clr drum (back to the stored program sound).
- Sextant Out companion device for per-drum MIDI channels.

### Known limitations
- Level and Pan can't be locked: the Nord glides them, so per-step changes land on the wrong hit. Use Velocity locks
  for accents.
- The Nord doesn't send a bank number with program changes, so a bank change on its panel isn't seen.
- Knob automation follows the selected drum.
