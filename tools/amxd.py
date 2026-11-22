"""Minimal Max patcher builder + .amxd writer (Max for Live device container)."""
import json, struct

class Patch:
    def __init__(self):
        self.boxes, self.lines, self.n = [], [], 0
    def box(self, text=None, maxclass='newobj', x=0, y=0, w=80, h=22, ins=1, outs=1,
            outtypes=None, present=None, **extra):
        self.n += 1
        oid = f'obj-{self.n}'
        b = {'id': oid, 'maxclass': maxclass, 'numinlets': ins, 'numoutlets': outs,
             'patching_rect': [x, y, w, h]}
        if outs: b['outlettype'] = outtypes or [''] * outs
        if text is not None: b['text'] = text
        if present: b['presentation'] = 1; b['presentation_rect'] = present
        b.update(extra)
        self.boxes.append({'box': b})
        return oid
    def wire(self, a, b, outlet=0, inlet=0):
        self.lines.append({'patchline': {'source': [a, outlet], 'destination': [b, inlet]}})
    def parameters(self):
        out = {}
        for b in self.boxes:
            bx = b['box']
            v = bx.get('saved_attribute_attributes', {}).get('valueof')
            if bx.get('parameter_enable') and v:
                out[bx['id']] = [v['parameter_longname'], v['parameter_shortname'], 0]
        out['inherited_shortname'] = 1
        return out
    def to_dict(self, width=300, height=169):
        return {'patcher': {
            'fileversion': 1,
            'appversion': {'major': 9, 'minor': 0, 'revision': 0, 'architecture': 'x64', 'modernui': 1},
            'classnamespace': 'box', 'rect': [100, 100, 900, 700],
            'openinpresentation': 1, 'default_fontsize': 10.0, 'default_fontname': 'Arial',
            'gridsize': [15, 15], 'boxes': self.boxes, 'lines': self.lines,
            'parameters': self.parameters(),
            'devicewidth': width}}

def write_amxd(path, patch_dict, kind='midi'):
    tag = {'midi': b'mmmm', 'audio': b'aaaa', 'instrument': b'iiii'}[kind]
    body = json.dumps(patch_dict, indent=1).encode() + b'\n\x00'
    with open(path, 'wb') as f:
        f.write(b'ampf' + struct.pack('<I', 4) + tag)
        f.write(b'meta' + struct.pack('<I', 4) + b'\x00\x00\x00\x00')
        f.write(b'ptch' + struct.pack('<I', len(body)) + body)

def write_maxpat(path, patch_dict):
    with open(path, 'w') as f: json.dump(patch_dict, f, indent=1)
