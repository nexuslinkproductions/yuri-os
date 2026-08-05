# Atilla call, clean transcription setup (2026-07-07, 14:00)

Same proven pipeline as last time: own mic + BlackHole (remote side) + whisper.cpp, German.
Reference: `~/.claude/memory/ref-call-transcription-pipeline-2026-06-16.md`.

## Verified on this machine now (smoke-tested 2026-07-07 ~13:35)
- Capture pipeline WORKS: MacBook mic test returned real audio (-28 dB); ffmpeg + whisper.cpp model present; terminal HAS mic permission.
- **HyperX SoloCast is currently MUTED** (reads -91 dB pure silence). Tap the top of the mic to unmute (LED off = live). `record.sh` refuses to record a muted mic.
- DJI "Wireless Microphone RX" is NOT plugged in. `record.sh` auto-picks DJI first, else HyperX, else MacBook mic.
- Remote capture: BlackHole 2ch present (index 1) + a Multi-Output Device exists. Silent until the call app output is routed to it (normal).
- **OBS is NOT installed** on this machine. Install it, or use the macOS built-in recorder (Cmd+Shift+5).

## Before the call (2 minutes)
1. **Unmute the HyperX** (tap the top; LED off). Or plug in the DJI receiver. (MacBook mic works as a lower-quality fallback.)
2. In **Zoom**, Settings, Audio:
   - **Speaker = "Multi-Output Device"** (so you hear Atilla AND BlackHole captures him).
   - **Microphone = HyperX SoloCast** (or the DJI if plugged).
   - Use **Zoom**, not WhatsApp: WhatsApp desktop has no device picker and BlackHole stays silent.
3. Do NOT add the DJI (an input) to the Multi-Output Device. Do NOT `killall coreaudiod` while recording (it severs the capture).

## During the call
```
cd 02_RESOURCES/calls/atilla-2026-07-07
./record.sh
```
It preflights the mic (refuses if silent), then records both channels to `recordings/mic-<stamp>.wav` and `recordings/remote-<stamp>.wav`. Leave the terminal open. Press **Ctrl-C** to stop when the call ends.

## After the call
```
./transcribe.sh          # uses the last recording automatically
```
Outputs `recordings/mic-<stamp>.txt` (you) and `recordings/remote-<stamp>.txt` (Atilla), German.
It prints a level check first: mean around **-91 dB means silence / routing not connected**;
**-20 to -40 dB is real audio**. If the remote channel is -91, the Zoom speaker is not set to Multi-Output.

## Sanity check the remote channel before the call
Play any audio, set its output to the Multi-Output Device, then:
```
ffmpeg -f avfoundation -i ":1" -t 2 -af volumedetect -f null - 2>&1 | grep mean_volume
```
Non-silence (> -60 dB) means BlackHole is capturing system audio correctly.
