import sys
CCS=[7,10,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,30,31,46,47,48,49,50,51,52,53,54,55,56,57,58]
NAMES=['Level','Pan','NzFreq','NzFltTyp','NzFltEnv','NzRes','NzAtk','NzAtkMd','NzDecTyp','NzDec','NzDecLo','Dist','DistTyp','EQFreq','EQGain','EchoFb','EchoAmt','Spectra','Pitch','Wave','TmbDec','Punch','DecTyp','Decay','DecLo','Timbre','TmbEnv','BendAmt','BendTm','Click','ClkTyp','Bal']
def val(set,i):
    if set==1: return (i*4+3)&127
    if set==2: return 127-((i*4+3)&127)
    return (i*37+11)%128
def bits(f): m=open(f,'rb').read(); return ''.join(format(b,'07b') for b in m[10:-5])
sets=[int(a) for a in sys.argv[1:]]
B={s:bits(f'probe{s}.syx') for s in sets}
L=len(B[sets[0]])
changed=[i for i in range(L) if len({B[s][i] for s in sets})>1]
print('changed bits', len(changed), 'range', changed[0], changed[-1])
for i,n in enumerate(NAMES):
    found=[]
    for w in range(7,9):
        for st in range(0, L-w+1):
            vals=[int(B[s][st:st+w],2) for s in sets]
            exp=[val(s,i) for s in sets]
            if w==7 and vals==exp: found.append((st,w,'raw'))
            if w==8 and vals==[e*2 for e in exp]: found.append((st,w,'x2'))
            if w==8 and vals==[e*2+1 for e in exp]: found.append((st,w,'x2+1'))
    print(f'{n:9s} cc{CCS[i]:<3d} {[val(s,i) for s in sets]} ->', found[:6])
