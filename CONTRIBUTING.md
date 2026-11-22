# Contributing

## Layout

| Path | What |
|---|---|
| `code/engine.js` | Sequencer, locks, base values, SysEx decoding. Pure JavaScript, no Max APIs, tested in Node. |
| `code/ui.js` | Max `[v8ui]` glue: grid drawing, mouse, knobs/menus, MIDI in/out, program changes, kits file, saving. |
| `tools/amxd.py` | Tiny Max patcher builder and `.amxd` writer. |
| `tools/build_sequencer.py`, `tools/build_out.py` | Generate the two devices (engine + glue are embedded in the device). |
| `tools/build.py`, `tools/package.py` | Build / install / make the release zip. |
| `tools/sysex/` | The probe device and scripts used to decode the Nord's SysEx format. |
| `test/engine.test.js` | Engine tests: `npm test`. |
| `docs/` | SysEx format, screenshots, quick start. |

Edit the source, not the generated `.maxpat`/`.amxd`: they are rebuilt from `code/` and `tools/` every time.
To try a change: `npm test`, then `python3 tools/build.py --install "<your User Library>"`, then re-drag the device in
Live (Live caches a loaded device).

## Things worth knowing

- Live rewrites a track's outgoing MIDI channel, hence the Sextant Out tracks (Max send/receive name `nordeuclid_out`,
  kept for compatibility).
- `live.text` in button mode sends a *bang*, not 1. Banging a `live.toggle` flips it. Controls without a Live parameter
  don't keep toggle state.
- Values come from Live as floats (so automation lanes aren't drawn as tall stepped lanes); the engine rounds them.
- Don't commit the Nord manual or SysEx dumps (Clavia's copyright and personal sounds); `.gitignore` covers them.

## Releasing

1. Bump `VERSION` **and** `package.json`, add a `## [x.y.z]` section to `CHANGELOG.md`.
2. `npm run package` (checks the three agree, runs tests, builds, zips to `dist/`).
3. Commit, `git tag vX.Y.Z`, push with tags, and attach `dist/Sextant-X.Y.Z.zip` to the GitHub release.
