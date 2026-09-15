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
