"""Minimal binary-STL reader with vertex welding -- bpy-free, so the align math can be exercised on
real scans from plain python. Used by verify_keyed_light.py."""
import numpy as np


def read_stl(path, weld_decimals=4):
    with open(path, "rb") as fh:
        head = fh.read(84)
        n = int(np.frombuffer(head[80:84], dtype="<u4")[0])
        raw = np.frombuffer(fh.read(n * 50), dtype=np.uint8)
    if raw.size != n * 50:
        raise ValueError(f"{path}: truncated ({raw.size} of {n*50} bytes)")
    rec = raw.reshape(n, 50)
    tri = rec[:, 12:48].copy().view("<f4").reshape(n, 3, 3).astype(np.float64)
    flat = tri.reshape(-1, 3)
    key = np.round(flat, weld_decimals)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    P = flat[first]
    F = inv.reshape(n, 3).astype(np.int64)
    good = (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
    return P, F[good]
