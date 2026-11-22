"""Make the release zip: dist/Sextant-<version>.zip with both devices, the quick start and the licence."""
import os, sys, zipfile, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VERSION = open(os.path.join(ROOT, 'VERSION')).read().strip()
import json
pkg = json.load(open(os.path.join(ROOT, 'package.json')))['version']
if pkg != VERSION: sys.exit(f'VERSION ({VERSION}) and package.json ({pkg}) disagree: bump both')
if f'## [{VERSION}]' not in open(os.path.join(ROOT, 'CHANGELOG.md')).read(): sys.exit(f'CHANGELOG.md has no [{VERSION}] entry')
subprocess.run([sys.executable, os.path.join(HERE, 'build.py')], check=True)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist', f'Sextant-{VERSION}.zip')
files = [('devices/Sextant.amxd', 'Sextant.amxd'), ('devices/Sextant Out.amxd', 'Sextant Out.amxd'),
         ('docs/QUICKSTART.md', 'QUICKSTART.md'), ('templates/Sextant Out tracks.als', 'Sextant Out tracks.als'), ('LICENSE', 'LICENSE'), ('CHANGELOG.md', 'CHANGELOG.md')]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for src, name in files:
        z.write(os.path.join(ROOT, src), f'Sextant-{VERSION}/{name}')
print('wrote', out)
