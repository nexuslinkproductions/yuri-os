#!/usr/bin/env python3
"""Reggae remix v2 — upbeat, built from the record's own instruments.

Inputs: vocal stem, instrumental stem, and drums / bass / other stems of the
instrumental (kuielab MDX-Net). Tempo is kept at the original (no stretch).

- Drums: the original kick, snare and hats are sampled from the drum stem
  (positions known from the beat grid) and re-sequenced into one-drop,
  rockers or steppers patterns depending on section energy.
- Bass: the original bass stem, levelled, then gated into reggae bass lines
  (rests, root on the one) — real tone, reggae rhythm.
- Skank: the "other" stem (guitars/strings/keys) chopped on every offbeat 8th.
- Pad: sidechain-ducked "other" stem for lift in the high-energy sections.
- Vocal untouched in tempo; dub delay throws on phrase ends.
- Dub break over the original instrumental solo.

Usage:
  reggae_remix_v2.py --vocals V.wav --instrumental I.wav --drums D.wav --bass B.wav
                     --other O.wav --out OUT.wav [--intro-bars 2] [--stems]
"""
import argparse
import json
import os
import sys

import numpy as np
import scipy.signal as sps
import soundfile as sf
import librosa

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reggae_remix import (  # noqa: E402
    SR, NOTE_NAMES, db, load_stereo, butter, pan, place, analyze, vocal_activity,
    dub_delay, reverb_ir, reverb, compressor, shaker, cached, midi_to_hz,
)


# ----------------------------------------------------------------------------
# sampled bass: one clean note from the record's bass stem, repitched per chord
# ----------------------------------------------------------------------------
class BassSampler:
    def __init__(self, bass_path, t_note, midi_note):
        y = load_stereo(bass_path).mean(axis=1)
        y = butter(y, 30, "high", 2)
        start = refine_onset(y, t_note, 40, 300, win=0.08)
        self.f0 = midi_to_hz(midi_note)
        P = SR / self.f0
        self.attack = y[start : start + int(0.12 * SR)].copy()
        L = int(round(8 * P))
        ls = start + int(0.14 * SR)
        loop = y[ls : ls + L].copy()
        # make the loop seamless: crossfade its tail into its head
        xf = int(P)
        w = np.linspace(0, 1, xf)
        loop[-xf:] = loop[-xf:] * (1 - w) + loop[:xf] * w
        self.loop = loop
        self.attack /= (np.abs(self.attack).max() + 1e-9)
        self.loop /= (np.abs(self.attack).max() + 1e-9) * 1.0
        self.loop *= 0.9 * np.abs(self.attack[-int(0.03 * SR):]).max() / (np.abs(self.loop).max() + 1e-9) * 1.8
        self._cache = {}

    def note(self, midi, dur):
        key = (midi, round(dur, 3))
        if key in self._cache:
            return self._cache[key]
        ratio = midi_to_hz(midi) / self.f0
        need = int(dur / ratio * SR) + len(self.loop)
        reps = int(np.ceil(max(0, need - len(self.attack)) / len(self.loop))) + 1
        body = np.concatenate([self.attack, np.tile(self.loop, reps)])[:need]
        # crossfade attack -> loop seam
        xf = int(0.004 * SR); a = len(self.attack)
        w = np.linspace(0, 1, xf)
        body[a - xf : a] = body[a - xf : a] * (1 - w) + body[a : a + xf] * w
        out = np.interp(np.arange(0, len(body), ratio), np.arange(len(body)), body).astype(np.float32)
        n = int(dur * SR)
        out = out[:n]
        t = np.arange(len(out)) / SR
        env = 0.55 + 0.45 * np.exp(-t * 4.0)
        r = int(0.04 * SR)
        env[-r:] *= np.linspace(1, 0, r)
        out = out * env
        out = butter(out, 380, "low", 2)
        out = np.tanh(out * 1.4) * 0.8
        self._cache[key] = out.astype(np.float32)
        return self._cache[key]


def bass_midi_for(root, quality, degree):
    r = 33 + ((root - 33) % 12)  # A1..G#2
    return {"R": r, "3": r + (4 if quality == "maj" else 3), "5": r + 7, "5L": r - 5, "R8": r + 12}[degree]


BASS_DEG = [
    [(0, "R", 2), (3, "R", 1), (4, "5", 2), (6, "R", 1)],
    [(0, "R", 3), (4, "R", 1), (5, "3", 1), (6, "5", 1)],
    [(0, "R", 2), (2, "5L", 1), (4, "R", 2), (6, "3", 1), (7, "5", 1)],
    [(0, "R", 1), (2, "R", 1), (3, "5", 1), (4, "R", 2), (7, "5L", 1)],
]
BASS_DEG_HOT = [
    [(0, "R", 2), (2, "R", 1), (3, "5", 1), (4, "R", 2), (6, "3", 1), (7, "5", 1)],
    [(0, "R", 3), (3, "5L", 1), (4, "R", 1), (5, "R", 1), (6, "5", 2)],
]


# ----------------------------------------------------------------------------
# sampling one-shots from the drum stem
# ----------------------------------------------------------------------------
def band_energy(x, lo, hi):
    sos = sps.butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    return float(np.mean(sps.sosfilt(sos, x) ** 2))


def refine_onset(x, t, lo, hi, win=0.06):
    """Return sample index of the strongest band onset within +-win of t."""
    sos = sps.butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    a, b = max(0, int((t - win) * SR)), min(len(x), int((t + win) * SR))
    seg = sps.sosfilt(sos, x[a - int(0.02 * SR) if a > int(0.02 * SR) else 0 : b])
    env = np.abs(seg)
    env = np.convolve(env, np.ones(64) / 64, mode="same")
    d = np.diff(env, prepend=env[0])
    off = a - (int(0.02 * SR) if a > int(0.02 * SR) else 0)
    i = int(np.argmax(d)) + off
    # step back to the local minimum just before the transient
    j = i
    while j > max(0, i - int(0.005 * SR)) and env[j - off - 1] < env[j - off]:
        j -= 1
    return j


def cut(x, i, dur, fade_after=None, fade_rate=25.0):
    n = int(dur * SR)
    seg = np.zeros(n, dtype=np.float32)
    s = x[i : i + n]
    seg[: len(s)] = s
    t = np.arange(n) / SR
    env = np.ones(n)
    if fade_after is not None:
        m = t > fade_after
        env[m] = np.exp(-(t[m] - fade_after) * fade_rate)
    a = int(0.001 * SR)
    env[:a] *= np.linspace(0, 1, a)
    env[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    return (seg * env).astype(np.float32)


def sample_drums(drum_path, beats, phase):
    d = load_stereo(drum_path).mean(axis=1)
    n = len(d)
    ones = [i for i in range(phase, len(beats), 4) if beats[i] * SR + SR < n]
    backs = [i for i in range(len(beats)) if (i - phase) % 4 in (1, 3) and beats[i] * SR + SR < n]
    rng = np.random.default_rng(3)
    # kick: from beat-1 positions, prefer strong low band with little 2-8 kHz bleed
    cands = []
    for i in rng.choice(ones, size=min(60, len(ones)), replace=False):
        k = refine_onset(d, beats[i], 40, 150)
        seg = d[k : k + int(0.25 * SR)]
        if len(seg) < int(0.25 * SR):
            continue
        lo, hi = band_energy(seg, 40, 150), band_energy(seg, 2000, 8000)
        cands.append((lo / (hi + 1e-9), lo, k))
    cands.sort(reverse=True)
    top = [c for c in cands[:12] if c[1] > np.median([c[1] for c in cands])]
    kick_idx = (top or cands)[0][2]
    kick = cut(d, kick_idx, 0.32, fade_after=0.10, fade_rate=22)
    kick = butter(kick, 5000, "low", 2)

    # snare: from backbeat positions, strongest 1-6 kHz + 150-400 body
    cands = []
    for i in rng.choice(backs, size=min(80, len(backs)), replace=False):
        k = refine_onset(d, beats[i], 800, 6000)
        seg = d[k : k + int(0.2 * SR)]
        if len(seg) < int(0.2 * SR):
            continue
        cands.append((band_energy(seg, 1000, 6000) + 0.5 * band_energy(seg, 150, 400), k))
    cands.sort(reverse=True)
    snare_idx = cands[len(cands) // 6][1]  # strong but not the single loudest outlier
    snare = cut(d, snare_idx, 0.26, fade_after=0.12, fade_rate=20)
    snare = butter(snare, 110, "high", 2)
    rim = butter(cut(d, snare_idx, 0.06, fade_after=0.02, fade_rate=90), 700, "high", 2)

    # hats: offbeat 8th positions, high-passed
    mids = [(beats[i] + beats[i + 1]) / 2 for i in range(len(beats) - 1) if beats[i] * SR + SR < n]
    cands = []
    for t in rng.choice(mids, size=min(80, len(mids)), replace=False):
        k = refine_onset(d, t, 5000, 14000, win=0.04)
        seg = d[k : k + int(0.08 * SR)]
        if len(seg) < int(0.08 * SR):
            continue
        cands.append((band_energy(seg, 6000, 14000) / (band_energy(seg, 40, 400) + 1e-9), band_energy(seg, 6000, 14000), k))
    cands.sort(reverse=True)
    hat_idx = cands[2][2]
    hat = butter(cut(d, hat_idx, 0.07, fade_after=0.02, fade_rate=80), 5500, "high", 3)
    ohat = butter(cut(d, hat_idx, 0.30, fade_after=0.03, fade_rate=9), 5500, "high", 3)

    def norm(x, p=0.9):
        return (x / (np.abs(x).max() + 1e-9) * p).astype(np.float32)
    return dict(kick=norm(kick), snare=norm(snare), rim=norm(rim, 0.7), hat=norm(hat, 0.6), ohat=norm(ohat, 0.6),
                idx=dict(kick=kick_idx / SR, snare=snare_idx / SR, hat=hat_idx / SR))


# ----------------------------------------------------------------------------
# gating helpers
# ----------------------------------------------------------------------------
def gate_env(total_len, events, attack=0.004, release=0.05):
    """events: list of (start_s, length_s, gain). Returns envelope (n,)."""
    env = np.zeros(total_len, dtype=np.float32)
    a = int(attack * SR); r = int(release * SR)
    for (t0, ln, g) in events:
        s = int(t0 * SR); e = min(total_len, s + int(ln * SR))
        if s >= total_len or e <= s:
            continue
        seg = np.full(e - s, g, dtype=np.float32)
        aa = min(a, len(seg)); seg[:aa] *= np.linspace(0, 1, aa)
        rr = min(r, len(seg)); seg[-rr:] *= np.linspace(1, 0, rr)
        env[s:e] = np.maximum(env[s:e], seg)
    return env


def level(x, target=0.25, win_s=0.05):
    """Fast RMS leveller so gated notes come out even."""
    mono = np.abs(x).mean(axis=1) if x.ndim == 2 else np.abs(x)
    w = int(win_s * SR)
    rms = np.sqrt(np.convolve(mono ** 2, np.ones(w) / w, mode="same") + 1e-9)
    g = np.minimum(target / (rms + 1e-6), 8.0).astype(np.float32)
    g = sps.lfilter([1 - 0.999], [1, -0.999], g).astype(np.float32)
    return x * g[:, None] if x.ndim == 2 else x * g


BASS_PATTERNS = [
    [(0, 2), (3, 1), (4, 2), (6, 1)],
    [(0, 3), (4, 1), (5, 1), (6, 1)],
    [(0, 2), (2, 1), (4, 2), (6, 1), (7, 1)],
    [(0, 1), (2, 1), (3, 1), (4, 2), (7, 1)],
]
BASS_HOT = [
    [(0, 2), (2, 1), (3, 1), (4, 2), (6, 1), (7, 1)],
    [(0, 3), (3, 1), (4, 1), (5, 1), (6, 2)],
]


def render(args):
    an = analyze(args.instrumental, args.vocals, args.downbeat_phase, args.key)
    base = an["beats"]
    period = an["period"]
    key = an["key"]
    phase = an["phase"]
    nb = args.intro_bars * 4
    pre = base[phase] - period * np.arange(nb, 0, -1)
    off = 0.1 - pre[0]
    beats = np.concatenate([pre, base[phase:]]) + off
    remap = lambda i: i - phase + nb
    print(f"[analysis] tempo={an['tempo']:.2f} BPM (kept), downbeat phase={phase}, key={NOTE_NAMES[key[0]]} {key[1]}, chord fit={an['chord_fit']*100:.1f}%")

    def shifted(path):
        x = load_stereo(path)
        return np.concatenate([np.zeros((int(off * SR), 2), dtype=np.float32), x])

    voc = shifted(args.vocals)
    drums_src = shifted(args.drums)
    bass_src = shifted(args.bass)
    other_src = shifted(args.other)

    vt, vr = vocal_activity(args.vocals)
    vt = vt + off
    act = np.convolve((vr > vr.max() * 0.08).astype(float), np.ones(15) / 15, mode="same") > 0.3
    idx = np.where(act)[0]
    voc_start, voc_end = float(vt[idx[0]]), float(vt[idx[-1]])
    total_len = int(min(voc_end + 8.0, beats[-1] + 1.0) * SR)
    total_len = min(total_len, len(voc) + int(8 * SR))

    def fit(x):
        if len(x) < total_len:
            x = np.concatenate([x, np.zeros((total_len - len(x), 2), dtype=np.float32)])
        return x[:total_len]
    voc, drums_src, bass_src, other_src = map(fit, (voc, drums_src, bass_src, other_src))
    print(f"[vocal] active {voc_start:.2f}s .. {voc_end:.2f}s, total {total_len/SR:.1f}s")

    # --- one-shots from the record ---
    kit = sample_drums(args.drums, base, phase)
    print(f"[drums] sampled kick@{kit['idx']['kick']:.2f}s snare@{kit['idx']['snare']:.2f}s hat@{kit['idx']['hat']:.2f}s (original timeline)")

    sampler = BassSampler(args.bass, args.bass_note_t, args.bass_note_midi)
    chord_at_beat = {}
    for (b, n, ch) in an["chords"]:
        if b >= phase:
            for k in range(remap(b), remap(b) + n):
                chord_at_beat[k] = ch
    for k in range(nb):
        chord_at_beat[k] = chord_at_beat.get(nb, (key[0], key[1]))

    # --- bars / sections ---
    bars = [list(range(k * 4, k * 4 + 4)) for k in range(args.intro_bars)]
    energy = [0.0] * args.intro_bars
    for bar, en in zip(an["bars"], an["bar_energy"]):
        if bar[0] >= phase:
            bars.append([remap(i) for i in bar]); energy.append(en)
    energy = np.array(energy)
    e = (energy - energy.min()) / (energy.max() - energy.min() + 1e-9)
    e = np.convolve(e, np.ones(3) / 3, mode="same")
    lvl = np.zeros(len(bars), dtype=int)  # 0 one-drop, 1 rockers, 2 steppers
    lvl[e >= np.percentile(e, 40)] = 1
    lvl[e >= np.percentile(e, 68)] = 2
    lvl[: args.intro_bars] = 1

    def beat_time(i):
        return beats[i] if i < len(beats) else beats[-1] + period * (i - len(beats) + 1)

    def slot_time(bar, slot, sub=0):
        """slot: 8th index 0..7; sub: 0 or 1 for the 16th after it."""
        bi = bar[0] + slot // 2
        t0, t1 = beat_time(bi), beat_time(bi + 1)
        t = t0 + (t1 - t0) * (0.5 if slot % 2 else 0.0)
        if sub:
            t += (t1 - t0) * 0.25 * 1.08  # touch of 16th swing
        return t

    last_v = max(bi for bi, bar in enumerate(bars) if beat_time(bar[0]) <= voc_end)
    band_end = min(len(bars) - 1, last_v + 2)
    first_v = next(bi for bi, bar in enumerate(bars) if beat_time(bar[-1] + 1) > voc_start)
    print(f"[arr] bars={len(bars)} vocal bars {first_v}..{last_v}; sections one-drop={int((lvl==0).sum())} rockers={int((lvl==1).sum())} steppers={int((lvl==2).sum())}")

    drums = np.zeros((total_len, 2), dtype=np.float32)
    perc = np.zeros((total_len, 2), dtype=np.float32)
    bass = np.zeros((total_len, 2), dtype=np.float32)
    rng = np.random.default_rng(5)
    hum = lambda: rng.uniform(0.88, 1.0)
    jit = lambda: rng.uniform(-0.003, 0.003)
    s = lambda t: int(t * SR)
    K, SN, RM, H, OH = kit["kick"], kit["snare"], kit["rim"], kit["hat"], kit["ohat"]
    SH = cached("sh", shaker)
    kick_times = []
    bass_events, skank_events, chop16_events = [], [], []

    for bi, bar in enumerate(bars):
        if bi > band_end or len(bar) < 4:
            continue
        L = int(lvl[bi])
        intro = bi < args.intro_bars
        change = bi + 1 < len(bars) and lvl[min(bi + 1, len(lvl) - 1)] != L
        fill = (change and not intro) or bi == args.intro_bars - 1
        phrase_end = (bi - args.intro_bars) % 8 == 7

        # hats
        for slot in range(8):
            t = slot_time(bar, slot) + jit()
            g = (0.6 if slot % 2 == 0 else 1.0) * hum()
            if slot == 7 and (bi % 2 == 1) and not fill:
                place(drums, pan(OH, 0.2), s(t), 0.9 * g)
            else:
                place(drums, pan(H, 0.2), s(t), g)
            if L == 2:  # 16ths in steppers sections
                place(drums, pan(H, 0.2), s(slot_time(bar, slot, 1) + jit()), 0.45 * hum())
        # shaker 16ths
        if not intro or bi > 0:
            for slot in range(8):
                for sub in (0, 1):
                    place(perc, pan(SH, -0.4), s(slot_time(bar, slot, sub) + jit()), (0.5 if sub == 0 else 0.9) * hum())
        # kicks
        kslots = {0: [4], 1: [0, 4], 2: [0, 2, 4, 6]}[L]
        if intro and bi == 0:
            kslots = [4]
        for slot in kslots:
            t = slot_time(bar, slot) + jit() * 0.5
            place(drums, pan(K, 0), s(t), (1.0 if slot in (0, 4) else 0.85))
            kick_times.append(t)
        # snare on 3 (+ rim ghost)
        t3 = slot_time(bar, 4) + jit() * 0.5
        place(drums, pan(SN, 0.05), s(t3), 1.0 if L > 0 else 0.9)
        if L == 0 and bi % 2 == 1:
            place(drums, pan(RM, 0.05), s(slot_time(bar, 7)), 0.5)
        if L == 2 and bi % 4 == 3:
            place(drums, pan(SN, 0.05), s(slot_time(bar, 7, 1)), 0.45)
        # fills
        if fill or (phrase_end and L > 0):
            t0, t1 = slot_time(bar, 6), slot_time(bar, 7)
            step = (t1 - t0) / 2
            for k in range(4):
                place(drums, pan(SN, 0.05), s(t0 + step * k), 0.35 + 0.2 * k)
            if bi + 1 < len(bars):
                place(drums, pan(OH, -0.2), s(slot_time(bars[bi + 1], 0)), 1.2)

        # sampled bass following the chords
        if not (intro and bi == 0):
            ch, ch2 = chord_at_beat.get(bar[0], (key[0], key[1])), chord_at_beat.get(bar[2], chord_at_beat.get(bar[0], (key[0], key[1])))
            pat = BASS_DEG_HOT[bi % 2] if L == 2 else BASS_DEG[(bi // 2) % 4]
            for (slot, deg, ln) in pat:
                c = ch if slot < 4 else ch2
                t0 = slot_time(bar, slot)
                t1 = slot_time(bar, slot + ln) if slot + ln <= 7 else slot_time(bar, 7) + (slot_time(bar, 7) - slot_time(bar, 6)) * (slot + ln - 7)
                place(bass, pan(sampler.note(bass_midi_for(c[0], c[1], deg), max(0.1, (t1 - t0) * 0.88)), 0), s(t0), 1.0)
        # skank chop on offbeat 8ths, double chop (16th offbeats) in steppers
        for slot in (1, 3, 5, 7):
            skank_events.append((slot_time(bar, slot) - 0.006, 0.13, 1.0 if L > 0 else 0.85))
        if L == 2:
            for slot in range(8):
                chop16_events.append((slot_time(bar, slot, 1) - 0.004, 0.06, 0.55))

    # --- bass: sampled from the record, low weight added ---
    sub = butter(bass, 100, "low", 2)
    bass = np.tanh((bass + sub * 0.5) * 1.3) * 0.8

    # --- skank: "other" stem chopped ---
    other = butter(other_src, 280, "high", 2)
    other = level(other, target=0.2)
    skank = other * gate_env(total_len, skank_events, attack=0.003, release=0.06)[:, None]
    skank = butter(skank, 6500, "low", 2)
    skank = np.tanh(skank * 2.2) * 0.6
    chop16 = other * gate_env(total_len, chop16_events, attack=0.002, release=0.03)[:, None]
    chop16 = butter(chop16, 5000, "low", 2) * 0.5

    # --- pad: ducked other stem in steppers bars + full in the dub break ---
    pad_env = np.zeros(total_len, dtype=np.float32)
    for bi, bar in enumerate(bars):
        if bi <= band_end and len(bar) == 4 and lvl[bi] == 2:
            a0, a1 = s(beat_time(bar[0])), s(beat_time(bar[-1] + 1))
            pad_env[a0:a1] = 1.0
    pad_env = np.convolve(pad_env, np.ones(int(0.4 * SR)) / int(0.4 * SR), mode="same")
    duck = np.ones(total_len, dtype=np.float32)
    for t in kick_times:
        a0 = s(t); a1 = min(total_len, a0 + int(0.28 * SR))
        if a0 < total_len:
            duck[a0:a1] = np.minimum(duck[a0:a1], np.linspace(0.25, 1.0, a1 - a0))
    pad = butter(butter(other_src, 200, "high", 2), 3500, "low", 2) * (pad_env * duck)[:, None]

    # dub break: full "other" stem through delay during long vocal gaps
    genv = np.zeros(total_len, dtype=np.float32)
    hop_s = float(vt[1] - vt[0])
    i = 0; breaks = []
    while i < len(act):
        if not act[i]:
            j = i
            while j < len(act) and not act[j]:
                j += 1
            g0, g1 = vt[i], vt[min(j, len(vt) - 1)]
            if (g1 - g0) >= 5.0 and g0 > voc_start + 2 and g1 < voc_end - 2:
                a0, a1 = s(g0 + 0.3), s(g1 - 0.6); r = int(0.6 * SR)
                genv[a0:a1] = 1.0; genv[a0:a0 + r] = np.linspace(0, 1, r); genv[a1 - r:a1] = np.linspace(1, 0, r)
                breaks.append((round(float(g0), 1), round(float(g1), 1)))
            i = j
        else:
            i += 1
    print(f"[dub] breaks {breaks}")
    delay_time = period * 0.75
    solo = butter(butter(other_src, 300, "high", 2), 5000, "low", 2) * (genv * duck)[:, None]
    solo_wet = dub_delay(solo, delay_time, 0.6, lp_hz=2600, hp_hz=400)
    solo_bus = solo * 0.5 + solo_wet * 0.5

    # --- vocal ---
    voc = butter(voc, 95, "high", 2)
    voc = compressor(voc, thresh_db=-18, ratio=2.5, attack=0.008, release=0.12)
    voc /= (np.abs(voc).max() + 1e-9)
    send = np.full(total_len, 0.08, dtype=np.float32)
    i = 0
    while i < len(act):
        if act[i]:
            j = i
            while j < len(act) and act[j]:
                j += 1
            k = j
            while k < len(act) and not act[k]:
                k += 1
            if (k - j) * hop_s >= 0.5 and (j - i) * hop_s > 0.8:
                t_end = vt[min(j, len(vt) - 1)]
                a0, a1 = max(0, s(t_end - 0.4)), min(total_len, s(t_end + 0.05))
                if a1 > a0:
                    send[a0:a1] = np.maximum(send[a0:a1], np.linspace(0.2, 1.0, a1 - a0))
            i = k
        else:
            i += 1
    voc_wet = dub_delay(voc * send[:, None], delay_time, 0.5, lp_hz=2800, hp_hz=350)
    skank_wet = dub_delay(skank * 0.4, delay_time, 0.4, lp_hz=2500, hp_hz=400)

    ir = reverb_ir(seconds=1.3, decay=0.45)
    rev = reverb(drums * 0.18 + skank * 0.12 + voc * 0.10, ir)

    # --- mix ---
    g = dict(voc=0.85, drums=1.1, perc=0.25, bass=0.55, skank=1.05, chop16=0.8, pad=0.6, solo=0.7, voc_wet=db(-10), skank_wet=db(-10), rev=0.8)
    mix = (voc * g["voc"] + voc_wet * g["voc_wet"] + drums * g["drums"] + perc * g["perc"] + bass * g["bass"]
           + skank * g["skank"] + chop16 * g["chop16"] + pad * g["pad"] + solo_bus * g["solo"] + skank_wet * g["skank_wet"] + rev * g["rev"])
    mix = compressor(mix, thresh_db=-10, ratio=2.5, attack=0.015, release=0.2)
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    peak = np.abs(mix).max()
    mix = mix / peak * db(-0.8)
    tail = int(3.0 * SR)
    mix[-tail:] *= np.linspace(1, 0, tail)[:, None]
    sf.write(args.out, mix, SR, subtype="PCM_24")
    if args.stems:
        d = os.path.join(os.path.dirname(args.out), "remix2_stems"); os.makedirs(d, exist_ok=True)
        for name, b in [("drums", drums * g["drums"] + perc * g["perc"]), ("bass", bass * g["bass"]), ("skank", skank * g["skank"] + chop16 * g["chop16"]), ("pad", pad * g["pad"] + solo_bus * g["solo"]), ("vocals", voc * g["voc"] + voc_wet * g["voc_wet"])]:
            sf.write(os.path.join(d, f"{name}.wav"), b / peak * db(-0.8), SR, subtype="PCM_24")
    meta = dict(tempo=an["tempo"], key=f"{NOTE_NAMES[key[0]]} {key[1]}", downbeat_phase=phase, chord_fit=an["chord_fit"],
                sections=lvl.tolist(), breaks=breaks, samples=kit["idx"], duration_s=total_len / SR)
    json.dump(meta, open(os.path.splitext(args.out)[0] + ".json", "w"), indent=1)
    print(f"[done] wrote {args.out} ({total_len/SR:.1f}s)")


def main():
    ap = argparse.ArgumentParser()
    for k in ("vocals", "instrumental", "drums", "bass", "other", "out"):
        ap.add_argument(f"--{k}", required=True)
    ap.add_argument("--downbeat-phase", type=int, default=None)
    ap.add_argument("--key", type=str, default=None)
    ap.add_argument("--intro-bars", type=int, default=2)
    ap.add_argument("--bass-note-t", type=float, default=74.85, help="time (s) of a clean sustained note in the bass stem")
    ap.add_argument("--bass-note-midi", type=int, default=45, help="MIDI pitch of that note")
    ap.add_argument("--stems", action="store_true")
    render(ap.parse_args())


if __name__ == "__main__":
    main()
