# Amore Mio (Roland Kaiser) — Reggae Remix

Output: `Amore_Mio_Reggae_Remix.mp3` (320 kbps, 4:10, −14 LUFS integrated, −1.4 dBFS peak).

## What was done

1. **Stem separation.** The original was split into a vocal stem and an instrumental stem
   with `audio-separator` (MDX-Net `UVR-MDX-NET-Voc_FT`, CPU/onnxruntime).
2. **Analysis on the instrumental stem** (`reggae_remix.py `):
   - Beat grid from librosa beat tracking (hop 512). The band drifts from ~117 BPM in the
     intro to ~126 BPM late in the song, so the tracked grid is used as-is; smoothed and
     constant grids locked worse to the backing's onsets.
   - Downbeat from the snare backbeat (strongest on beats 2 and 4) plus chord-change density.
   - Key/chords from instrumental chroma **plus the pitch-tracked vocal melody** (fundamental
     only, no harmonic smear). The melody sings C natural / G# and never C# / G natural, so
     the song is A harmonic minor with an E major dominant. Vocal chord-tone fit: 81.6 %.
     Detected progression is the classic Am · Dm · G · C · F · E cycle.
3. **Vocal** time-stretched 0.8× with Rubber Band (R3 engine, formant-preserving):
   123 → 98.4 BPM. High-passed at 95 Hz, light compression.
4. **Synthesized rhythm section**, locked to the tracked beat grid:
   - One-drop drums (kick + rimshot on beat 3), offbeat-accented hats, shaker 16ths;
     "rockers" variant with kick on 1 and full snare in high-energy bars; snare fills at
     section changes.
   - Skank guitar (Karplus–Strong plucks, muted) on beats 2 and 4, doubled on offbeat 8ths in
     choruses.
   - Organ bubble on every "and".
   - Reggae bass (sine + decaying harmonics, low-passed) with four root/3rd/5th patterns that
     leave rests, root in E1–D#2.
   - 2-bar intro (skank + hats, bass enters bar 2, fill into the vocal entry).
5. **Dub treatment.** Dotted-8th tempo-synced feedback delay with filtered feedback; delay
   throws automated on vocal phrase endings; spring-style synthetic reverb on drums/skank/organ.
   The original's instrumental solo (148.9–163.4 s) becomes a dub break: stretched backing,
   band-passed 350–5000 Hz, delay-soaked, over the continuing drums and bass.
6. Bus glue compression, soft clip, two-pass EBU R128 loudness normalisation to −14 LUFS.

## Regenerate

```bash
# deps (ephemeral): ffmpeg, rubberband-cli, python venv with numpy scipy soundfile librosa audio-separator[cpu]
ffmpeg -i "Amore mio.mp3" -ac 2 -ar 44100 source.wav
audio-separator source.wav --model_filename UVR-MDX-NET-Voc_FT.onnx --output_dir stems --output_format WAV
rubberband -3 -t 1.25 "stems/source_(Instrumental)_UVR-MDX-NET-Voc_FT.wav" instrumental_stretched.wav
python reggae_remix.py --vocals "stems/source_(Vocals)_UVR-MDX-NET-Voc_FT.wav" \
  --instrumental "stems/source_(Instrumental)_UVR-MDX-NET-Voc_FT.wav" \
  --instrumental-stretched instrumental_stretched.wav --out amore_mio_reggae.wav --stems
ffmpeg -i amore_mio_reggae.wav -af loudnorm=I=-14:TP=-1:LRA=11 -b:a 320k Amore_Mio_Reggae_Remix.mp3
```

Knobs: `--speed` (0.8 default; 1.0 keeps 123 BPM), `--intro-bars`, `--key "A min"`,
`--downbeat-phase N` to override detection. `--stems` also writes per-instrument stems.

## Not verified by ear

This was produced and checked in a headless container: beat lock, downbeat phase, chord
fit against the melody, per-stem loudness and spectrogram/waveform excerpts were verified
numerically. Nobody has listened to it yet. Most likely things to adjust after a listen:
skank/organ balance, vocal delay-throw amount, and the bass pattern choice in choruses.

## Rights

Derivative of a copyrighted recording (Roland Kaiser, "Amore Mio"). Private/personal use
from the owner's own upload; do not publish or distribute without the rights holders' licence.

---

## v2 — upbeat, built from the record's own instruments

Owner feedback on v1: too slow, dull, too electronic. v2 (`Amore_Mio_Reggae_Remix_v2.mp3`,
3:20, −12 LUFS) changes the approach rather than the knobs:

- **Original tempo kept (123 BPM).** No vocal stretch at all. Skank on every offbeat 8th
  gives an upbeat/ska-leaning reggae pulse instead of a half-time crawl.
- **Real drums.** The instrumental was split further with kuielab MDX-Net into drums / bass /
  other. The record's own kick, snare and hi-hat were sampled from the drum stem (positions
  known from the beat grid) and re-sequenced: one-drop in low-energy bars, rockers (kick on
  1 and 3) in mid, steppers (four-on-the-floor kick, 16th hats) in the loudest sections,
  snare fills every 8 bars and at section changes.
- **Real bass tone.** The bass stem is nearly silent in the intro and verses, so instead of
  gating it, one clean A2 note was sampled from it (attack + period-synced loop) and repitched
  per chord into reggae bass lines with rests. Measured pitches of generated notes match
  their targets exactly.
- **Real skank.** The "other" stem (guitars/strings/keys) chopped on every offbeat 8th, plus
  a lighter 16th-offbeat chop in the steppers sections; sidechain-ducked pad from the same
  stem for lift in the choruses; the original solo (119–131 s) as a delay-soaked dub break.
- Vocal untouched in tempo; dub delay throws on phrase endings; mastered hotter (−12 LUFS).

```bash
for m in kuielab_b_drums kuielab_b_bass kuielab_b_other; do
  audio-separator "stems/source_(Instrumental)_UVR-MDX-NET-Voc_FT.wav" --model_filename $m.onnx --output_dir stems4 --output_format WAV
done
python reggae_remix_v2.py --vocals vocals.wav --instrumental instrumental.wav \
  --drums "stems4/instrumental_(Drums)_kuielab_b_drums.wav" --bass "stems4/instrumental_(Bass)_kuielab_b_bass.wav" \
  --other "stems4/instrumental_(Other)_kuielab_b_other.wav" --out amore_mio_reggae_v2.wav --stems
ffmpeg -i amore_mio_reggae_v2.wav -af loudnorm=I=-12:TP=-1:LRA=9 -b:a 320k Amore_Mio_Reggae_Remix_v2.mp3
```
