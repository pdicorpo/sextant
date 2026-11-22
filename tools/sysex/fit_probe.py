import math, json
CCS=[7,10,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,30,31,46,47,48,49,50,51,52,53,54,55,56,57,58]
NAMES=['Level','Pan','NzFreq','NzFltTyp','NzFltEnv','NzRes','NzAtk','NzAtkMd','NzDecTyp','NzDec','NzDecLo','Dist','DistTyp','EQFreq','EQGain','EchoFb','EchoAmt','Spectra','Pitch','Wave','TmbDec','Punch','DecTyp','Decay','DecLo','Timbre','TmbEnv','BendAmt','BendTm','Click','ClkTyp','Bal']
def val(s,i):
    if s==1: return (i*4+3)&127
    if s==2: return 127-((i*4+3)&127)
    return (i*37+11)%128
def bits(f): m=open(f,'rb').read(); return ''.join(format(b,'07b') for b in m[10:-5])
B={s:bits(f'probe{s}.syx') for s in (1,2,3)}
changed=set(i for i in range(len(B[1])) if len({B[s][i] for s in (1,2,3)})>1)
maps={'round127':lambda c,M:round(c*M/127),'floor128':lambda c,M:(c*M)//128,'floor127':lambda c,M:(c*M)//127,
      'ceil':lambda c,M:math.ceil(c*M/128)}
cands={}
for i,n in enumerate(NAMES):
    cc=[val(s,i) for s in (1,2,3)]
    out=[]
    for w in range(1,10):
        for st in range(30,265-w):
            v=[int(B[s][st:st+w],2) for s in (1,2,3)]
            if len(set(v))==1: continue
            # field must touch only bits that are either changed or consistent; require its changed bits all inside
            for mn,f in maps.items():
                for M in range(1,2**w):
                    if [f(c,M) for c in cc]==v:
                        out.append((st,w,M,mn)); break
                else: continue
                break
    cands[n]=out
    print(f'{n:9s} {cc} {len(out):4d}', out[:8])
json.dump(cands,open('/tmp/cands.json','w'))
