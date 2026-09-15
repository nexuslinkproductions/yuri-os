#!/usr/bin/env python3
"""Reggae remix engine.

Takes a separated vocal stem + instrumental stem of a pop song, extracts the beat
grid / downbeats / chord progression from the instrumental, time-stretches the
vocal to a laid-back reggae tempo, and renders a synthesized rhythm section
underneath it: one-drop drums, offbeat skank guitar, organ bubble, melodic
reggae bass, plus dub-style tempo-synced delay throws and spring-ish reverb.

Usage:
    reggae_remix.py --vocals V.wav --instrumental I.wav --out OUT.wav
                    [--speed 0.8] [--downbeat-phase N] [--key "A min"] [--intro-bars 2]
                    [--instrumental-stretched I_stretched.wav] [--stems]
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import scipy.signal as sps
import soundfile as sf
import librosa

SR = 44100
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def db(x):
    return 10 ** (x / 20.0)


def load_stereo(path):
    y, sr = sf.read(path, always_2d=True, dtype="float32")
    if sr != SR:
        y = librosa.resample(y.T, orig_sr=sr, target_sr=SR).T
    if y.shape[1] == 1:
        y = np.repeat(y, 2, axis=1)
    return y[:, :2].astype(np.float32)


def butter(x, cutoff, kind, order=2):
    sos = sps.butter(order, cutoff, btype=kind, fs=SR, output="sos")
    return sps.sosfilt(sos, x, axis=0).astype(np.float32)


def pan(mono, p):
    """Equal-power pan. p in [-1, 1]."""
    th = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(th), mono * np.sin(th)], axis=1).astype(np.float32)


def place(buf, clip, start, gain=1.0):
    n = len(buf)
    s = int(start)
    if s >= n or s + len(clip) <= 0:
        return
    e = min(n, s + len(clip))
    cs = 0
    if s < 0:
        cs = -s
        s = 0
    seg = clip[cs : cs + (e - s)]
    if seg.ndim == 1:
        buf[s:e, 0] += seg * gain
        buf[s:e, 1] += seg * gain
    else:
        buf[s:e] += seg * gain


def env_ad(n, attack_s, decay_rate):
    t = np.arange(n) / SR
    a = int(attack_s * SR)
    env = np.exp(-t * decay_rate)
    if a > 0:
        env[:a] *= np.linspace(0, 1, a)
    return env.astype(np.float32)


def release_tail(env, rel_s):
    r = int(rel_s * SR)
    if r > 0 and r < len(env):
        env[-r:] *= np.linspace(1, 0, r)
    return env


# ----------------------------------------------------------------------------
# analysis
# ----------------------------------------------------------------------------
def analyze(instr_path, voc_path, downbeat_override=None, key_override=None, voc_weight=0.6, prior=0.04):
    y, sr = librosa.load(instr_path, sr=22050, mono=True)
    v, _ = librosa.load(voc_path, sr=22050, mono=True)
    hop = 512  # hop 256 inserts a spurious beat mid-song and flips the bar phase; 512 stays phase-consistent
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time", trim=False, hop_length=hop)
    tempo = float(np.atleast_1d(tempo)[0])
    beats = np.asarray(beats, dtype=float)
    period = float(np.median(np.diff(beats)))
    dur = len(y) / sr
    pre = []
    t = beats[0] - period
    while t > -period * 0.5:
        pre.append(t)
        t -= period
    post = []
    t = beats[-1] + period
    while t < dur + period:
        post.append(t)
        t += period
    beats = np.concatenate([np.array(pre[::-1]), beats, np.array(post)])
    beats = beats[beats >= -0.05]

    chroma_i = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    chroma_v = librosa.feature.chroma_cqt(y=v, sr=sr, hop_length=hop)
    nfr = min(chroma_i.shape[1], chroma_v.shape[1])
    chroma_i, chroma_v = chroma_i[:, :nfr], chroma_v[:, :nfr]
    f0, vf, vp = librosa.pyin(v, fmin=80, fmax=600, sr=sr, frame_length=2048, hop_length=hop)
    f0, vf, vp = f0[:nfr], vf[:nfr], vp[:nfr]
    mel_sel = vf & (vp > 0.5)
    mel_pc = np.round(librosa.hz_to_midi(np.where(mel_sel, f0, 440.0))).astype(int) % 12
    mel_chroma = np.zeros((12, nfr))
    mel_chroma[mel_pc[mel_sel], np.where(mel_sel)[0]] = 1.0
    # chroma_cqt smears the 5th harmonic (major 3rd) into sung notes; melody one-hot is harmonic-free
    chroma = chroma_i + voc_weight * mel_chroma
    frames = np.clip(librosa.time_to_frames(beats, sr=sr, hop_length=hop), 0, nfr - 1)
    beat_chroma = []
    for i in range(len(beats)):
        a = frames[i]
        b = frames[i + 1] if i + 1 < len(frames) else nfr
        b = max(b, a + 1)
        beat_chroma.append(chroma[:, a:b].mean(axis=1))
    beat_chroma = np.array(beat_chroma)

    def band_onset(lo, hi):
        sos = sps.butter(2, [lo, hi], btype="band", fs=sr, output="sos")
        o = librosa.onset.onset_strength(y=sps.sosfilt(sos, y), sr=sr, hop_length=hop)
        return np.array([o[max(0, f - 1) : f + 2].max() for f in frames])
    snare_beat = band_onset(1500, 6000)
    kick_beat = band_onset(35, 130)

    change = np.zeros(len(beats))
    for i in range(1, len(beats)):
        a, b = beat_chroma[i - 1], beat_chroma[i]
        change[i] = 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)

    snare_ph = np.array([snare_beat[np.arange(p, len(beats), 4)].mean() for p in range(4)])
    kick_ph = np.array([kick_beat[np.arange(p, len(beats), 4)].mean() for p in range(4)])
    change_ph = np.array([change[np.arange(p, len(beats), 4)].mean() for p in range(4)])
    snare_ph /= snare_ph.mean(); kick_ph /= kick_ph.mean(); change_ph /= change_ph.mean()
    # backbeat = the two phases with strongest snare; downbeat is one of the other two,
    # chosen by chord-change density (harmony moves on the 1).
    backbeat = set(np.argsort(snare_ph)[-2:].tolist())
    cands = [p for p in range(4) if p not in backbeat]
    phase = max(cands, key=lambda p: change_ph[p] + 0.3 * kick_ph[p])
    if downbeat_override is not None:
        phase = int(downbeat_override)
    phase_report = dict(snare=np.round(snare_ph, 3).tolist(), kick=np.round(kick_ph, 3).tolist(), change=np.round(change_ph, 3).tolist(), candidates=cands)

    mel_hist = np.bincount(mel_pc[mel_sel], minlength=12).astype(float)
    prof = mel_hist / (mel_hist.sum() + 1e-9) if mel_hist.sum() > 200 else beat_chroma.mean(axis=0)
    maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    kc = []
    for i in range(12):
        kc.append((np.corrcoef(prof, np.roll(maj, i))[0, 1], i, "maj"))
        kc.append((np.corrcoef(prof, np.roll(mnr, i))[0, 1], i, "min"))
    kc.sort(reverse=True)
    key_root, key_mode = kc[0][1], kc[0][2]
    if key_override:
        r, m = key_override.split()
        key_root, key_mode = NOTE_NAMES.index(r), m
    if key_mode == "maj":
        diatonic = {(key_root + s) % 12: q for s, q in [(0, "maj"), (2, "min"), (4, "min"), (5, "maj"), (7, "maj"), (9, "min")]}
    else:
        # harmonic-minor aware: V is major
        diatonic = {(key_root + s) % 12: q for s, q in [(0, "min"), (3, "maj"), (5, "min"), (7, "maj"), (8, "maj"), (10, "maj")]}

    bars = []
    if phase > 0:
        bars.append(list(range(0, phase)))
    for i in range(phase, len(beats), 4):
        bars.append(list(range(i, min(i + 4, len(beats)))))

    templates = {}
    for r in range(12):
        tm = np.zeros(12); tm[r] = 1.0; tm[(r + 4) % 12] = 0.8; tm[(r + 7) % 12] = 0.9
        templates[(r, "maj")] = tm / np.linalg.norm(tm)
        tn = np.zeros(12); tn[r] = 1.0; tn[(r + 3) % 12] = 0.8; tn[(r + 7) % 12] = 0.9
        templates[(r, "min")] = tn / np.linalg.norm(tn)

    def best_chord(c, prev):
        c = c / (np.linalg.norm(c) + 1e-9)
        best, bs = None, -9
        for k, tm in templates.items():
            s = float(np.dot(c, tm))
            if diatonic.get(k[0]) == k[1]:
                s += prior
            elif k[0] in diatonic:
                s -= prior * 0.5
            if prev is not None and k == prev:
                s += 0.03
            if s > bs:
                bs, best = s, k
        return best

    chords = []
    prev = None
    flips = 0
    for bar in bars:
        halves = [bar[:2], bar[2:]] if len(bar) >= 3 else [bar]
        for h in halves:
            if not h:
                continue
            c = beat_chroma[h].mean(axis=0)
            ch = best_chord(c, prev)
            # third rule: if the melody clearly sings one third of this root, that decides quality
            a = frames[h[0]]; b = frames[h[-1] + 1] if h[-1] + 1 < len(frames) else nfr
            span = mel_pc[a:b][mel_sel[a:b]]
            r = ch[0]
            n_min = int((span == (r + 3) % 12).sum()); n_maj = int((span == (r + 4) % 12).sum())
            if n_min >= 3 and n_maj == 0 and ch[1] == "maj":
                ch = (r, "min"); flips += 1
            elif n_maj >= 3 and n_min == 0 and ch[1] == "min":
                ch = (r, "maj"); flips += 1
            chords.append((h[0], len(h), ch))
            prev = ch
    # smooth: an isolated non-diatonic half-bar is almost always a detection glitch
    for i in range(1, len(chords) - 1):
        r, q = chords[i][2]
        if diatonic.get(r) != q and chords[i - 1][2] != chords[i][2] and chords[i + 1][2] != chords[i][2]:
            chords[i] = (chords[i][0], chords[i][1], chords[i - 1][2]); flips += 1
    print(f"[chords] melody third-rule + isolated-glitch smoothing changed {flips} half-bars")

    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    bar_energy = []
    for bar in bars:
        a = frames[bar[0]]
        b = frames[bar[-1] + 1] if bar[-1] + 1 < len(frames) else len(rms)
        bar_energy.append(float(rms[a : max(b, a + 1)].mean()))
    bar_energy = np.array(bar_energy)

    # vocal chord-tone fit (objective sanity metric)
    ft = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop)
    tone = tot = 0
    for (b0, n, (r, q)) in chords:
        a = beats[b0]; e = beats[b0 + n] if b0 + n < len(beats) else a + period * n
        tones = {r, (r + (4 if q == "maj" else 3)) % 12, (r + 7) % 12}
        sel = (ft >= a) & (ft < e) & vf & (vp > 0.7)
        pcs = np.round(librosa.hz_to_midi(f0[sel])).astype(int) % 12
        tot += len(pcs); tone += int(np.isin(pcs, list(tones)).sum())
    fit = tone / max(tot, 1)

    return dict(
        tempo=tempo, period=period, beats=beats, phase=phase, phase_report=phase_report,
        key=(key_root, key_mode), key_cands=kc[:3], bars=bars, chords=chords, bar_energy=bar_energy,
        duration=dur, chord_fit=fit,
    )


def vocal_activity(voc_path):
    y, sr = librosa.load(voc_path, sr=22050, mono=True)
    hop = 220  # 10 ms
    rms = librosa.feature.rms(y=y, hop_length=hop, frame_length=1024)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    return t, rms


# ----------------------------------------------------------------------------
# instruments
# ----------------------------------------------------------------------------
_cache = {}


def cached(name, fn):
    if name not in _cache:
        _cache[name] = fn().astype(np.float32)
    return _cache[name]


def kick():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 32)
    ph = np.cumsum(2 * np.pi * f / SR)
    s = np.sin(ph) * np.exp(-t * 8.5)
    click = np.random.default_rng(1).standard_normal(n) * np.exp(-t * 400) * 0.25
    s = s + click
    return np.tanh(s * 1.6) * 0.9


def rim():
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(2)
    noise = rng.standard_normal(n)
    sos = sps.butter(2, [1100, 4200], btype="band", fs=SR, output="sos")
    noise = sps.sosfilt(sos, noise)
    tone = np.sin(2 * np.pi * 820 * t) * np.exp(-t * 90)
    s = noise * np.exp(-t * 140) * 0.9 + tone * 0.7
    return s / (np.abs(s).max() + 1e-9) * 0.8


def snare():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    noise = rng.standard_normal(n)
    sos = sps.butter(2, 1400, btype="high", fs=SR, output="sos")
    noise = sps.sosfilt(sos, noise) * np.exp(-t * 20)
    body = np.sin(2 * np.pi * (185 + 60 * np.exp(-t * 40)) * t) * np.exp(-t * 28)
    s = noise * 0.8 + body * 0.9
    return np.tanh(s * 1.3) / 1.2


def hat(open_=False):
    n = int((0.38 if open_ else 0.055) * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(4 if open_ else 5)
    noise = rng.standard_normal(n)
    sos = sps.butter(3, 7500, btype="high", fs=SR, output="sos")
    noise = sps.sosfilt(sos, noise)
    env = np.exp(-t * (7 if open_ else 95))
    return noise * env * 0.6


def shaker():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(6)
    noise = rng.standard_normal(n)
    sos = sps.butter(2, [4500, 11000], btype="band", fs=SR, output="sos")
    noise = sps.sosfilt(sos, noise)
    env = env_ad(n, 0.006, 45)
    return noise * env * 0.5


def pluck(freq, dur, bright=0.5, damp=0.996):
    """Karplus-Strong string."""
    N = int(SR / freq)
    n = int(dur * SR)
    rng = np.random.default_rng(int(freq * 10) % 1000)
    buf = rng.uniform(-1, 1, N)
    buf = sps.lfilter([bright, 1 - bright], [1], buf)
    out = np.zeros(n)
    out[:N] = buf
    # block-wise KS: y[n] = damp * 0.5 * (y[n-N] + y[n-N-1])
    for k in range(N, n, N):
        prev = out[k - N : k]
        prev_shift = np.concatenate([[out[k - N - 1]], prev[:-1]])
        blk = damp * 0.5 * (prev + prev_shift)
        e = min(k + N, n)
        out[k:e] = blk[: e - k]
    return out


def midi_to_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def chord_midis(root, quality, base_octave_midi):
    """Voicing: root, 3rd, 5th, root+12 starting at or above base_octave_midi."""
    r = base_octave_midi + ((root - base_octave_midi) % 12)
    third = r + (4 if quality == "maj" else 3)
    return [r, third, r + 7, r + 12]


def skank(root, quality):
    def make():
        notes = chord_midis(root, quality, 57)  # A3 region
        dur = 0.16
        s = np.zeros(int(dur * SR))
        for i, m in enumerate(notes):
            s += pluck(midi_to_hz(m), dur, bright=0.35, damp=0.985) * (0.9 if i < 3 else 0.6)
        env = np.ones(len(s))
        env = release_tail(env, 0.07)
        s = s * env
        s = butter(s, 3200, "low", 2)
        s = butter(s, 180, "high", 2)
        s = np.tanh(s * 1.4)
        return s / (np.abs(s).max() + 1e-9) * 0.8
    return cached(("skank", root, quality), make)


def organ(root, quality):
    def make():
        notes = chord_midis(root, quality, 64)  # E4 region
        dur = 0.11
        n = int(dur * SR)
        t = np.arange(n) / SR
        s = np.zeros(n)
        harm = [(1, 1.0), (2, 0.55), (3, 0.35), (4, 0.25), (6, 0.12)]
        for m in notes[:3]:
            f = midi_to_hz(m)
            for h, a in harm:
                s += a * np.sin(2 * np.pi * f * h * t) + a * 0.5 * np.sin(2 * np.pi * f * h * 1.003 * t)
        env = np.ones(n)
        a = int(0.004 * SR)
        env[:a] = np.linspace(0, 1, a)
        env = release_tail(env, 0.035)
        s = s * env
        s = butter(s, 4500, "low", 2)
        return s / (np.abs(s).max() + 1e-9) * 0.7
    return cached(("organ", root, quality), make)


def bass_note(midi, dur):
    def make():
        f = midi_to_hz(midi)
        n = int(dur * SR)
        t = np.arange(n) / SR
        s = np.sin(2 * np.pi * f * t)
        s += 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 5)
        s += 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 9)
        sus = 0.55
        env = sus + (1 - sus) * np.exp(-t * 6)
        a = int(0.007 * SR)
        env[:a] *= np.linspace(0, 1, a)
        env = release_tail(env, 0.04)
        s = s * env
        s = butter(s, 320, "low", 2)
        return np.tanh(s * 1.5) * 0.8
    return cached(("bass", midi, round(dur, 3)), make)


# ----------------------------------------------------------------------------
# effects
# ----------------------------------------------------------------------------
def dub_delay(x, delay_s, feedback, lp_hz=3200, hp_hz=250):
    """Feedback delay with filtered feedback path. x: (n,2)."""
    D = int(delay_s * SR)
    n = len(x)
    out = np.zeros_like(x)
    sos_lp = sps.butter(1, lp_hz, btype="low", fs=SR, output="sos")
    sos_hp = sps.butter(1, hp_hz, btype="high", fs=SR, output="sos")
    zl = [sps.sosfilt_zi(sos_lp) * 0 for _ in range(2)]
    zh = [sps.sosfilt_zi(sos_hp) * 0 for _ in range(2)]
    y = np.zeros_like(x)
    for i in range(0, n, D):
        e = min(i + D, n)
        fb = np.zeros((e - i, 2), dtype=np.float32)
        if i - D >= 0:
            src = y[i - D : i - D + (e - i)]
            for c in range(2):
                f, zl[c] = sps.sosfilt(sos_lp, src[:, c], zi=zl[c])
                f, zh[c] = sps.sosfilt(sos_hp, f, zi=zh[c])
                fb[:, c] = f
        y[i:e] = x[i:e] + feedback * np.tanh(fb * 1.2)
    # wet = delayed copy of y
    out[D:] = y[:-D]
    return out.astype(np.float32)


def reverb_ir(seconds=1.6, decay=0.55, seed=7):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    ir = np.zeros((n, 2), dtype=np.float32)
    for c in range(2):
        noise = rng.standard_normal(n) * np.exp(-t / decay)
        # early reflections
        for k in range(6):
            p = int((0.008 + 0.011 * k + rng.uniform(0, 0.004)) * SR)
            noise[p] += 1.8 * (0.8 ** k)
        sos = sps.butter(2, 4500, btype="low", fs=SR, output="sos")
        noise = sps.sosfilt(sos, noise)
        # spring-ish resonance shimmer
        sos2 = sps.butter(2, [900, 2600], btype="band", fs=SR, output="sos")
        noise = noise + 0.35 * sps.sosfilt(sos2, noise)
        ir[:, c] = noise
    ir /= np.abs(ir).sum(axis=0).max() / 6.0
    return ir


def reverb(x, ir):
    out = np.zeros((len(x) + len(ir) - 1, 2), dtype=np.float32)
    for c in range(2):
        out[:, c] = sps.fftconvolve(x[:, c], ir[:, c])
    return out[: len(x)]


def compressor(x, thresh_db=-14, ratio=3.0, attack=0.01, release=0.15, makeup_db=0.0):
    mono = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    # envelope follower
    a_a = np.exp(-1 / (attack * SR))
    a_r = np.exp(-1 / (release * SR))
    env = np.zeros(len(mono), dtype=np.float32)
    # vectorised approx: use lfilter with release, then max with attack-smoothed
    # (cheap approximation good enough for a mix bus)
    rel = sps.lfilter([1 - a_r], [1, -a_r], mono).astype(np.float32)
    env = np.maximum(mono, rel)
    env = sps.lfilter([1 - a_a], [1, -a_a], env).astype(np.float32)
    env_db = 20 * np.log10(env + 1e-7)
    over = np.maximum(0, env_db - thresh_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    g = (10 ** (gain_db / 20)).astype(np.float32)
    return x * g[:, None] if x.ndim == 2 else x * g


# ----------------------------------------------------------------------------
# arrangement
# ----------------------------------------------------------------------------
BASS_PATTERNS = [
    [(0, "R", 2), (3, "R", 1), (4, "5", 2), (6, "R", 1)],
    [(0, "R", 3), (4, "R", 1), (5, "3", 1), (6, "5", 1)],
    [(0, "R", 2), (2, "5L", 1), (4, "R", 2), (6, "3", 1), (7, "5", 1)],
    [(0, "R", 1), (2, "R", 1), (3, "5", 1), (4, "R", 2), (7, "5L", 1)],
]


def bass_midi_for(root, quality, degree):
    # root placed in E1..D#2 (40..51)
    r = 40 + ((root - 40) % 12)
    if degree == "R":
        return r
    if degree == "3":
        return r + (4 if quality == "maj" else 3)
    if degree == "5":
        return r + 7
    if degree == "5L":
        return r - 5
    if degree == "R8":
        return r + 12
    return r


def render(args):
    an = analyze(args.instrumental, args.vocals, args.downbeat_phase, args.key)
    speed = args.speed
    scale = 1.0 / speed
    base = an["beats"] * scale
    period = an["period"] * scale
    key = an["key"]
    phase = an["phase"]
    nb = args.intro_bars * 4
    # real intro bars: extend the grid backwards from the first downbeat, drop pickup beats
    pre = base[phase] - period * np.arange(nb, 0, -1)
    intro_off = 0.1 - pre[0]  # shift so the intro starts at 0.1 s; vocal shifts by the same amount
    beats = np.concatenate([pre, base[phase:]]) + intro_off
    remap = lambda i: i - phase + nb
    print(f"[analysis] tempo={an['tempo']:.2f} -> {an['tempo']*speed:.2f} BPM, downbeat phase={an['phase']} {an['phase_report']}")
    print(f"[analysis] key={NOTE_NAMES[key[0]]} {key[1]} (cands {[(round(float(c),3), NOTE_NAMES[r]+' '+m) for c,r,m in an['key_cands']]}) vocal chord-tone fit={an['chord_fit']*100:.1f}%")
    chord_str = " | ".join(f"{NOTE_NAMES[c[2][0]]}{'m' if c[2][1]=='min' else ''}" for c in an["chords"])
    print(f"[analysis] chords (half-bars): {chord_str}")

    # --- vocal stretch (rubberband) ---
    if speed != 1.0:
        stretched = os.path.join(os.path.dirname(args.out), "vocals_stretched.wav")
        if not os.path.exists(stretched) or args.force:
            subprocess.run(["rubberband", "-3", "-F", "-t", f"{scale:.6f}", args.vocals, stretched], check=True)
        voc = load_stereo(stretched)
    else:
        voc = load_stereo(args.vocals)
    voc = np.concatenate([np.zeros((int(intro_off * SR), 2), dtype=np.float32), voc])
    voc = butter(voc, 95, "high", 2)
    voc = compressor(voc, thresh_db=-18, ratio=2.5, attack=0.008, release=0.12)
    voc /= (np.abs(voc).max() + 1e-9)
    voc *= 0.85

    # vocal activity (on stretched timeline)
    vt, vr = vocal_activity(args.vocals)
    vt = vt * scale + intro_off
    thr = vr.max() * 0.08
    active = vr > thr
    # smooth
    act = np.convolve(active.astype(float), np.ones(15) / 15, mode="same") > 0.3
    idx = np.where(act)[0]
    voc_start = float(vt[idx[0]]) if len(idx) else 0.0
    voc_end = float(vt[idx[-1]]) if len(idx) else vt[-1]
    print(f"[vocal] active {voc_start:.2f}s .. {voc_end:.2f}s")

    total_len = int((max(voc_end + 8.0, beats[-1] + 1.0)) * SR)
    total_len = min(total_len, len(voc) + int(8 * SR))
    if len(voc) < total_len:
        voc = np.concatenate([voc, np.zeros((total_len - len(voc), 2), dtype=np.float32)])
    voc = voc[:total_len]

    # --- bars / sections ---
    bars = [list(range(k * 4, k * 4 + 4)) for k in range(args.intro_bars)]
    energy = [0.0] * args.intro_bars
    for bar, en in zip(an["bars"], an["bar_energy"]):
        if bar[0] >= phase:
            bars.append([remap(i) for i in bar]); energy.append(en)
    energy = np.array(energy)
    e_norm = (energy - energy.min()) / (energy.max() - energy.min() + 1e-9)
    e_smooth = np.convolve(e_norm, np.ones(3) / 3, mode="same")
    hot_thr = np.percentile(e_smooth, 62)
    hot = e_smooth >= hot_thr
    # chord lookup by beat index
    chord_at_beat = {}
    for (b, n, ch) in an["chords"]:
        if b < phase:
            continue
        for k in range(remap(b), remap(b) + n):
            chord_at_beat[k] = ch
    first_chord = chord_at_beat.get(nb, (key[0], key[1]))
    for k in range(nb):
        chord_at_beat[k] = first_chord

    def beat_time(i):
        if i < len(beats):
            return beats[i]
        return beats[-1] + period * (i - len(beats) + 1)

    def slot_time(bar, slot):
        """8th-note slot (0..7) within bar of 4 beats."""
        bi = bar[0] + slot // 2
        t0 = beat_time(bi)
        t1 = beat_time(bi + 1)
        return t0 + (t1 - t0) * (0.5 if slot % 2 else 0.0)

    last_bar_with_vocal = 0
    for bi, bar in enumerate(bars):
        if beat_time(bar[0]) <= voc_end:
            last_bar_with_vocal = bi
    first_bar_with_vocal = 0
    for bi, bar in enumerate(bars):
        if beat_time(bar[-1] + 1) > voc_start:
            first_bar_with_vocal = bi
            break
    band_end_bar = min(len(bars) - 1, last_bar_with_vocal + 2)
    intro_bars = set(range(0, args.intro_bars))
    print(f"[arr] bars={len(bars)} vocal bars {first_bar_with_vocal}..{last_bar_with_vocal}, band ends bar {band_end_bar}, hot bars={int(hot.sum())}")

    # buses
    drums = np.zeros((total_len, 2), dtype=np.float32)
    bassb = np.zeros((total_len, 2), dtype=np.float32)
    skankb = np.zeros((total_len, 2), dtype=np.float32)
    organb = np.zeros((total_len, 2), dtype=np.float32)
    perc = np.zeros((total_len, 2), dtype=np.float32)
    rng = np.random.default_rng(11)

    K = cached("kick", kick); RM = cached("rim", rim); SN = cached("snare", snare)
    HC = cached("hc", lambda: hat(False)); HO = cached("ho", lambda: hat(True)); SH = cached("sh", shaker)

    def s(t):
        return int(t * SR)

    for bi, bar in enumerate(bars):
        if bi > band_end_bar or len(bar) < 4:
            continue
        is_hot = bool(hot[bi]) and bi not in intro_bars
        is_intro = bi in intro_bars
        no_bass = bi == 0 and is_intro
        next_change = (bi + 1 < len(bars)) and (bool(hot[min(bi + 1, len(hot) - 1)]) != bool(hot[bi]))
        fill = (next_change and not is_intro) or (bi == args.intro_bars - 1)
        ch = chord_at_beat.get(bar[0], (key[0], key[1]))
        ch2 = chord_at_beat.get(bar[2], ch)
        hum = lambda: rng.uniform(0.9, 1.0)
        jit = lambda: rng.uniform(-0.004, 0.004)

        # ---- drums ----
        # hats: 8ths, offbeat accent
        for slot in range(8):
            t = slot_time(bar, slot) + jit()
            g = (0.55 if slot % 2 == 0 else 1.0) * hum()
            if slot == 7 and bi % 2 == 1 and not fill:
                place(drums, pan(HO, 0.15), s(t), 0.7 * g)
            else:
                place(drums, pan(HC, 0.15), s(t), g)
        # shaker 16ths (light)
        if not no_bass:
            for slot in range(8):
                t0 = slot_time(bar, slot)
                t1 = slot_time(bar, slot + 1) if slot < 7 else t0 + (t0 - slot_time(bar, slot - 1))
                for q in (0, 1):
                    t = t0 + (t1 - t0) * 0.5 * q + jit()
                    place(perc, pan(SH, -0.35), s(t), (0.5 if q == 0 else 0.9) * hum())
        # one drop: kick + rim/snare on beat 3 (slot 4)
        t3 = slot_time(bar, 4) + jit() * 0.5
        if not no_bass:
            place(drums, pan(K, 0), s(t3), 1.0)
            if is_hot:
                place(drums, pan(K, 0), s(slot_time(bar, 0)), 0.85)  # rockers: kick on 1 too
                place(drums, pan(SN, 0.05), s(t3), 0.9)
                place(drums, pan(RM, 0.05), s(t3), 0.5)
            else:
                place(drums, pan(RM, 0.05), s(t3), 1.0)
        else:
            place(drums, pan(RM, 0.05), s(t3), 0.8)
        # occasional rim ghost on "and of 4" in verses
        if not is_hot and not is_intro and bi % 4 == 3:
            place(drums, pan(RM, 0.05), s(slot_time(bar, 7)), 0.45)
        # fill: snare 16ths on last beat, rising
        if fill:
            t0 = slot_time(bar, 6)
            t1 = slot_time(bar, 7)
            step = (t1 - t0) / 2
            for k in range(4):
                place(drums, pan(SN, 0.05), s(t0 + step * k), 0.35 + 0.18 * k)
            # crash-ish open hat on next downbeat
            if bi + 1 < len(bars):
                place(drums, pan(HO, -0.1), s(slot_time(bars[bi + 1], 0)), 1.1)

        # ---- skank guitar on 2 & 4 ----
        for slot in (2, 6):
            c = ch if slot < 4 else ch2
            t = slot_time(bar, slot) + jit()
            place(skankb, pan(skank(*c), -0.28), s(t), 1.0 * hum())
        if is_hot:  # double skank: softer stabs on offbeat 8ths
            for slot in (1, 3, 5, 7):
                c = ch if slot < 4 else ch2
                t = slot_time(bar, slot) + jit()
                place(skankb, pan(skank(*c), -0.28), s(t), 0.45 * hum())

        # ---- organ bubble on the "and"s ----
        if True:
            for slot in (1, 3, 5, 7):
                c = ch if slot < 4 else ch2
                t = slot_time(bar, slot) + jit()
                place(organb, pan(organ(*c), 0.32), s(t), (0.9 if is_hot else 0.65) * hum())

        # ---- bass ----
        if not no_bass:
            pat = BASS_PATTERNS[(bi // 2) % len(BASS_PATTERNS)] if not is_hot else BASS_PATTERNS[(bi % 2) * 3]
            for (slot, deg, ln) in pat:
                c = ch if slot < 4 else ch2
                m = bass_midi_for(c[0], c[1], deg)
                t0 = slot_time(bar, slot)
                t1 = slot_time(bar, slot + ln) if slot + ln <= 7 else slot_time(bar, 7) + (slot_time(bar, 7) - slot_time(bar, 6)) * (slot + ln - 7)
                dur = max(0.08, (t1 - t0) * 0.82)
                place(bassb, pan(bass_note(m, dur), 0), s(t0), 1.0)

    # --- dub throws on vocal: send ramps up before phrase gaps ---
    send = np.full(total_len, 0.10, dtype=np.float32)
    gap_min = 0.55
    hop_s = float(vt[1] - vt[0]) if len(vt) > 1 else 0.01
    i = 0
    while i < len(act):
        if act[i]:
            j = i
            while j < len(act) and act[j]:
                j += 1
            # phrase i..j ; gap length
            k = j
            while k < len(act) and not act[k]:
                k += 1
            gap = (k - j) * hop_s
            if gap >= gap_min and (j - i) * hop_s > 0.8:
                t_end = vt[min(j, len(vt) - 1)]
                a0, a1 = s(t_end - 0.45), s(t_end + 0.05)
                a0 = max(0, a0); a1 = min(total_len, a1)
                if a1 > a0:
                    send[a0:a1] = np.maximum(send[a0:a1], np.linspace(0.2, 1.0, a1 - a0))
            i = k
        else:
            i += 1
    delay_time = period * 0.75  # dotted eighth

    # --- dub break: the original's instrumental solo (stretched, band-passed, delay-soaked)
    # fills vocal gaps >= 5 s that sit inside the song ---
    solo_bus = np.zeros((total_len, 2), dtype=np.float32)
    if args.instrumental_stretched:
        solo = load_stereo(args.instrumental_stretched)
        solo = np.concatenate([np.zeros((int(intro_off * SR), 2), dtype=np.float32), solo])
        if len(solo) < total_len:
            solo = np.concatenate([solo, np.zeros((total_len - len(solo), 2), dtype=np.float32)])
        solo = solo[:total_len]
        solo = butter(butter(solo, 350, "high", 2), 5000, "low", 2)
        solo /= (np.abs(solo).max() + 1e-9)
        genv = np.zeros(total_len, dtype=np.float32)
        i = 0; breaks = []
        while i < len(act):
            if not act[i]:
                j = i
                while j < len(act) and not act[j]:
                    j += 1
                g0, g1 = vt[i], vt[min(j, len(vt) - 1)]
                if (g1 - g0) >= 5.0 and g0 > voc_start + 2 and g1 < voc_end - 2:
                    a0, a1 = s(g0 + 0.3), s(g1 - 0.6)
                    r = int(0.6 * SR)
                    genv[a0:a1] = 1.0
                    genv[a0:a0 + r] = np.linspace(0, 1, r)
                    genv[a1 - r:a1] = np.linspace(1, 0, r)
                    breaks.append((round(g0, 1), round(g1, 1)))
                i = j
            else:
                i += 1
        print(f"[dub] solo breaks at {breaks}")
        solo_g = solo * genv[:, None]
        solo_wet = dub_delay(solo_g, delay_time, 0.62, lp_hz=2600, hp_hz=400)
        solo_bus = solo_g * 0.30 + solo_wet * 0.45
    voc_wet = dub_delay(voc * send[:, None], delay_time, 0.5, lp_hz=2800, hp_hz=350)
    skank_wet = dub_delay(skankb * 0.5, delay_time, 0.42, lp_hz=2500, hp_hz=400)

    ir = reverb_ir()
    rev_in = drums * 0.22 + skankb * 0.14 + organb * 0.10 + voc * 0.14
    rev = reverb(rev_in, ir)

    # --- mix ---
    mix = (
        voc * 1.0
        + voc_wet * db(-9)
        + drums * 0.55
        + perc * 0.30
        + bassb * 0.38
        + skankb * 0.60
        + skank_wet * db(-8)
        + organb * 0.60
        + rev * 0.9
        + solo_bus * 0.55
    )
    # gentle bus glue + soft clip
    mix = compressor(mix, thresh_db=-12, ratio=2.0, attack=0.02, release=0.25)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    peak = np.abs(mix).max()
    mix = mix / peak * db(-1.0)
    # fade out tail
    tail = int(4.0 * SR)
    mix[-tail:] *= np.linspace(1, 0, tail)[:, None]

    sf.write(args.out, mix, SR, subtype="PCM_24")
    stems_dir = os.path.join(os.path.dirname(args.out), "remix_stems")
    if args.stems:
        os.makedirs(stems_dir, exist_ok=True)
        for name, b in [("drums", drums * 0.55 + perc * 0.30), ("bass", bassb * 0.38), ("skank", skankb * 0.60 + skank_wet * db(-8)), ("organ", organb * 0.60), ("vocals", voc + voc_wet * db(-9))]:
            sf.write(os.path.join(stems_dir, f"{name}.wav"), b / peak * db(-1.0), SR, subtype="PCM_24")
    meta = dict(
        tempo_original=an["tempo"], tempo_remix=an["tempo"] * speed, speed=speed,
        key=f"{NOTE_NAMES[key[0]]} {key[1]}", downbeat_phase=an["phase"], chord_fit=an["chord_fit"], intro_bars=args.intro_bars,
        chords_halfbars=[f"{NOTE_NAMES[c[2][0]]}{'m' if c[2][1]=='min' else ''}" for c in an["chords"]],
        hot_bars=[int(i) for i in np.where(hot)[0]], duration_s=total_len / SR,
    )
    with open(os.path.splitext(args.out)[0] + ".json", "w") as f:
        json.dump(meta, f, indent=1)
    print(f"[done] wrote {args.out} ({total_len/SR:.1f}s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocals", required=True)
    ap.add_argument("--instrumental", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--speed", type=float, default=0.8)
    ap.add_argument("--downbeat-phase", type=int, default=None)
    ap.add_argument("--key", type=str, default=None, help='e.g. "A min"')
    ap.add_argument("--intro-bars", type=int, default=2)
    ap.add_argument("--instrumental-stretched", type=str, default=None, help="rubberband-stretched instrumental (same ratio) for the dub break")
    ap.add_argument("--stems", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    render(args)


if __name__ == "__main__":
    main()
