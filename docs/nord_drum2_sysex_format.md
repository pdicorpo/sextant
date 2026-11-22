# Nord Drum 2 program SysEx format (reverse-engineered, OS 3.0x)

Worked out from dumps of a real unit and probe values sent by CC (scripts in `tools/sysex/`). Not official; checked against 200 programs. Dumps themselves are not included (they contain Clavia factory programs).

## Message (212 bytes)
`F0 33 7F 19 08 03 <type> <bank> <program> 03 <payload: 197 bytes> <4 bytes, change on every edit: checksum> F7`
- type: 8 = stored program (in an ALL dump), 6 = current edit buffer (PRo dump)
- bank 0–7, program 0–49. An ALL dump only contains banks that hold programs (here banks 1–4 = 200 messages).

## Payload
A bitstream: each payload byte contributes 7 bits, most significant first. Six 224-bit drum blocks; drum 1's
fields start at the bit offsets below, drum *n* at offset + 224·(n−1). Values are in the Nord's own ranges.

| Param (CC) | bit | width | values |
|---|---|---|---|
| Noise Filter Type (15) | 42 | 3 | 7 |
| Noise Filter Freq (14) | 45 | 6 | 0–50 |
| Noise Filter Res (17) | 51 | 5 | 0–20 |
| Noise Attack/Rate (18) | 62 | 6 | 0–50 |
| Noise Atk Mode (19) | 70 | 4 | 13 |
| Noise Decay Type (20) | 74 | 2 | 3 |
| Noise Decay (21) | 76 | 6 | 0–50 |
| Noise Decay Lo (22) | 82 | 6 | OFF,0–50 |
| Dist Amount (23) | 88 | 6 | 0–50 |
| Dist Type (24) | 97 | 2 | 3 |
| EQ Gain (26) | 99 | 6 | −24..24 |
| EQ Freq (25) | 105 | 6 | 51 |
| Echo BPM | 111 | 10 | (not mapped) |
| Echo (27) | 121 | 5 | 30 |
| Echo (28) | 126 | 5 | 0–20 |
| Level (7) | 131 | 6 | 0–50 |
| Tone Wave (46) | 142 | 6 | 40 |
| Tone Spectra (30) | 148 | 7 | 0–99 |
| Tone Timb Envelope (53) | 155 | 6 | 51 |
| Tone Timbre (52) | 161 | 6 | 0–50 |
| Tone Timbre Decay (47) | 167 | 7 | 101 |
| Tone Punch (48) | 174 | 5 | ~6 |
| Tone Decay Type (49) | 179 | 2 | 2 |
| Tone Decay (50) | 181 | 6 | 0–50 |
| Tone Dec Lo (51) | 187 | 6 | OFF,0–50 |
| Tone Pitch (31/63) | 193 | 8 | 0.0–127.5 (value/2 = CC 31; low bit = half step) |
| Bend Amount (54) | 201 | 7 | −50..50 |
| Bend Time (55) | 208 | 6 | 0–50 |
| Click Level (56) | 214 | 6 | 0–50 |
| Click Type (57) | 220 | 6 | 36 |
| Mix Balance (58) | 226 | 6 | 41 |
| Noise Filter Env (16) | 233 | 7 | −50..50 |
| Pan (10) | 240 | 6 | 41 |

CC → stored: either floor(cc·N/128) or round(cc·(N−1)/127) depending on the parameter (see `SYX_FIELDS` in
`code/engine.js`). Checked against all 200 programs: every field's maximum matches the manual's range.
Unmapped: Echo BPM (10 bits at 111), 1 bit at 232, plus the 4-byte checksum (needed only for *sending* programs).
