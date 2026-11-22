"""Build both devices into devices/. Optionally copy them into an Ableton User Library:
    python3 tools/build.py
    python3 tools/build.py --install "~/Music/Ableton/User Library"
"""
import os, sys, shutil, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for script in ('build_sequencer.py', 'build_out.py'):
    subprocess.run([sys.executable, os.path.join(HERE, script)], check=True)
if '--install' in sys.argv:
    lib = os.path.expanduser(sys.argv[sys.argv.index('--install') + 1])
    dest = os.path.join(lib, 'Presets', 'MIDI Effects', 'Max MIDI Effect', 'Sextant')
    os.makedirs(dest, exist_ok=True)
    for f in ('Sextant.amxd', 'Sextant Out.amxd'):
        shutil.copy2(os.path.join(ROOT, 'devices', f), dest)
    print('installed to', dest)
