#!/usr/bin/env python3
"""Generate inspectable visual proof artifacts for YURI math labs.

This is a fixture-only lab runner. It writes JSON/SVG/PNG/HTML artifacts under
an operator-selected output directory and never writes trusted runtime truth.
"""

from __future__ import annotations

import argparse
import heapq
import html
import json
import math
import struct
import zlib
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FIXTURE = REPO_ROOT / "_SYSTEM/labs/math/fixtures/pathfinding-demo.json"
DEFAULT_OUT_DIR = REPO_ROOT / "_SYSTEM/labs/math/outputs"


def build_adjacency(graph: dict) -> dict[str, list[tuple[str, float]]]:
    adjacency = {node: [] for node in graph["nodes"]}
    for edge in graph["edges"]:
        adjacency[edge["from"]].append((edge["to"], edge["weight"]))
        if graph.get("directed") is False:
            adjacency[edge["to"]].append((edge["from"], edge["weight"]))
    return adjacency


def shortest_path(graph: dict, source: str, target: str, heuristic: dict[str, float] | None = None) -> dict:
    adjacency = build_adjacency(graph)
    frontier = [(0, source)]
    cost = {source: 0.0}
    previous: dict[str, str] = {}
    expanded: list[str] = []
    closed: set[str] = set()
    heuristic = heuristic or {}

    while frontier:
        _, current = heapq.heappop(frontier)
        if current in closed:
            continue
        closed.add(current)
        expanded.append(current)
        if current == target:
            break
        for neighbor, weight in adjacency[current]:
            next_cost = cost[current] + weight
            if next_cost < cost.get(neighbor, float("inf")):
                cost[neighbor] = next_cost
                previous[neighbor] = current
                heapq.heappush(frontier, (next_cost + heuristic.get(neighbor, 0), neighbor))

    path = []
    current = target
    if current in cost:
        while current != source:
            path.append(current)
            current = previous[current]
        path.append(source)
        path.reverse()

    return {
        "path": path,
        "cost": cost.get(target),
        "expanded": expanded,
        "expandedCount": len(expanded),
    }


def bayes_update(prior: float, likelihood_if_true: float, likelihood_if_false: float) -> float:
    positive = prior * likelihood_if_true
    negative = (1 - prior) * likelihood_if_false
    mass = positive + negative
    if mass <= 0:
        raise ValueError("Bayes update requires positive evidence mass")
    return positive / mass


def confidence_decay(base: float, age: float, half_life: float) -> float:
    if half_life <= 0:
        raise ValueError("half_life must be positive")
    return base * math.pow(0.5, age / half_life)


def build_pathfinding_report(fixture: dict) -> dict:
    graph = fixture["graph"]
    source = fixture["source"]
    target = fixture["target"]
    dijkstra = shortest_path(graph, source, target)
    astar = shortest_path(graph, source, target, fixture.get("heuristic", {}))
    return {
        "schema": "yuri.math.visual-proof-report.v0",
        "proof": "pathfinding",
        "fixture": fixture["name"],
        "source": source,
        "target": target,
        "dijkstra": dijkstra,
        "astar": astar,
        "assertions": {
            "samePath": dijkstra["path"] == astar["path"],
            "sameCost": dijkstra["cost"] == astar["cost"],
            "astarExpandedNoMore": astar["expandedCount"] <= dijkstra["expandedCount"],
        },
        "teachingPoint": "Dijkstra expands by known cost only; A* adds an admissible estimate of remaining cost.",
        "writesRuntimeTruth": False,
    }


def build_bayes_report() -> dict:
    prior = 0.5
    likelihood_if_true = 0.8
    likelihood_if_false = 0.2
    posterior = bayes_update(prior, likelihood_if_true, likelihood_if_false)
    decay = [
        {"age": age, "confidence": round(confidence_decay(posterior, age, 10), 6)}
        for age in [0, 5, 10, 15, 20, 25, 30]
    ]
    return {
        "schema": "yuri.math.visual-proof-report.v0",
        "proof": "bayes-confidence-decay",
        "prior": prior,
        "likelihoodIfTrue": likelihood_if_true,
        "likelihoodIfFalse": likelihood_if_false,
        "posterior": round(posterior, 12),
        "confidenceDecay": decay,
        "teachingPoint": "Evidence can raise confidence; age decay prevents old confidence from staying dominant.",
        "writesRuntimeTruth": False,
    }


def render_pathfinding_svg(fixture: dict, report: dict) -> str:
    graph = fixture["graph"]
    layout = {
        "A": (80, 160),
        "B": (210, 70),
        "C": (220, 240),
        "E": (380, 240),
        "D": (500, 120),
        "F": (660, 160),
    }
    path_edges = set(zip(report["astar"]["path"], report["astar"]["path"][1:]))
    path_edges |= {(b, a) for a, b in path_edges}
    expanded = set(report["astar"]["expanded"])
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="330" viewBox="0 0 760 330">',
        '<rect width="760" height="330" fill="#fbfaf7"/>',
        '<text x="30" y="34" font-family="Arial" font-size="20" fill="#1f2933">Dijkstra vs A* pathfinding proof</text>',
        '<text x="30" y="58" font-family="Arial" font-size="13" fill="#52616b">Optimal path is highlighted; filled nodes were expanded by A*.</text>',
    ]
    for edge in graph["edges"]:
        x1, y1 = layout[edge["from"]]
        x2, y2 = layout[edge["to"]]
        on_path = (edge["from"], edge["to"]) in path_edges
        color = "#d64545" if on_path else "#a8b2bd"
        width = 5 if on_path else 2
        parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>')
        parts.append(f'<text x="{(x1 + x2) / 2}" y="{(y1 + y2) / 2 - 8}" font-family="Arial" font-size="12" fill="#38434f">{edge["weight"]}</text>')
    for node, (x, y) in layout.items():
        fill = "#f8d66d" if node in expanded else "#ffffff"
        stroke = "#d64545" if node in report["astar"]["path"] else "#52616b"
        parts.append(f'<circle cx="{x}" cy="{y}" r="24" fill="{fill}" stroke="{stroke}" stroke-width="3"/>')
        parts.append(f'<text x="{x}" y="{y + 5}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#1f2933">{html.escape(node)}</text>')
    parts.append(f'<text x="30" y="305" font-family="Arial" font-size="14" fill="#1f2933">A*: cost {report["astar"]["cost"]}, expanded {report["astar"]["expandedCount"]}; Dijkstra expanded {report["dijkstra"]["expandedCount"]}</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def render_bayes_svg(report: dict) -> str:
    bars = [
        ("prior", report["prior"], "#6c7a89"),
        ("posterior", report["posterior"], "#2f8f83"),
    ]
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="330" viewBox="0 0 760 330">',
        '<rect width="760" height="330" fill="#fbfaf7"/>',
        '<text x="30" y="34" font-family="Arial" font-size="20" fill="#1f2933">Bayes update and confidence decay proof</text>',
        '<text x="30" y="58" font-family="Arial" font-size="13" fill="#52616b">Posterior confidence rises after evidence, then decays by half-life.</text>',
    ]
    for index, (label, value, color) in enumerate(bars):
        x = 70 + index * 130
        height = value * 190
        y = 260 - height
        parts.append(f'<rect x="{x}" y="{y}" width="72" height="{height}" fill="{color}" rx="4"/>')
        parts.append(f'<text x="{x + 36}" y="284" text-anchor="middle" font-family="Arial" font-size="13" fill="#1f2933">{label}</text>')
        parts.append(f'<text x="{x + 36}" y="{y - 8}" text-anchor="middle" font-family="Arial" font-size="13" fill="#1f2933">{value:.2f}</text>')
    points = []
    for item in report["confidenceDecay"]:
        x = 360 + item["age"] * 10
        y = 260 - item["confidence"] * 190
        points.append((x, y))
    polyline = " ".join(f"{x},{y}" for x, y in points)
    parts.append(f'<polyline points="{polyline}" fill="none" stroke="#d64545" stroke-width="4"/>')
    for x, y in points:
        parts.append(f'<circle cx="{x}" cy="{y}" r="5" fill="#d64545"/>')
    parts.append('<text x="360" y="284" font-family="Arial" font-size="13" fill="#1f2933">age 0</text>')
    parts.append('<text x="640" y="284" font-family="Arial" font-size="13" fill="#1f2933">age 30</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def write_png(path: Path, width: int, height: int, draw) -> None:
    pixels = bytearray([250, 249, 246] * width * height)

    def set_pixel(x: int, y: int, color: tuple[int, int, int]) -> None:
        if 0 <= x < width and 0 <= y < height:
            offset = (y * width + x) * 3
            pixels[offset:offset + 3] = bytes(color)

    def line(x1: int, y1: int, x2: int, y2: int, color: tuple[int, int, int]) -> None:
        dx = abs(x2 - x1)
        dy = -abs(y2 - y1)
        sx = 1 if x1 < x2 else -1
        sy = 1 if y1 < y2 else -1
        err = dx + dy
        x, y = x1, y1
        while True:
            for ox in range(-1, 2):
                for oy in range(-1, 2):
                    set_pixel(x + ox, y + oy, color)
            if x == x2 and y == y2:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x += sx
            if e2 <= dx:
                err += dx
                y += sy

    def rect(x: int, y: int, w: int, h: int, color: tuple[int, int, int]) -> None:
        for yy in range(max(0, y), min(height, y + h)):
            for xx in range(max(0, x), min(width, x + w)):
                set_pixel(xx, yy, color)

    draw(line, rect)
    raw = b"".join(b"\x00" + bytes(pixels[y * width * 3:(y + 1) * width * 3]) for y in range(height))
    compressed = zlib.compress(raw)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def write_pathfinding_png(path: Path, report: dict) -> None:
    def draw(line, rect) -> None:
        layout = {"A": (45, 120), "B": (135, 55), "C": (145, 185), "E": (255, 185), "D": (340, 90), "F": (455, 120)}
        path_pairs = list(zip(report["astar"]["path"], report["astar"]["path"][1:]))
        for left, right in path_pairs:
            x1, y1 = layout[left]
            x2, y2 = layout[right]
            line(x1, y1, x2, y2, (214, 69, 69))
        for node, (x, y) in layout.items():
            color = (248, 214, 109) if node in report["astar"]["expanded"] else (82, 97, 107)
            rect(x - 8, y - 8, 16, 16, color)
    write_png(path, 500, 250, draw)


def write_bayes_png(path: Path, report: dict) -> None:
    def draw(line, rect) -> None:
        rect(55, int(220 - report["prior"] * 160), 45, int(report["prior"] * 160), (108, 122, 137))
        rect(125, int(220 - report["posterior"] * 160), 45, int(report["posterior"] * 160), (47, 143, 131))
        points = [(230 + item["age"] * 8, int(220 - item["confidence"] * 160)) for item in report["confidenceDecay"]]
        for left, right in zip(points, points[1:]):
            line(left[0], left[1], right[0], right[1], (214, 69, 69))
    write_png(path, 500, 250, draw)


def write_html(out_dir: Path, path_report: dict, bayes_report: dict) -> None:
    body = f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>YURI Math Visual Proof Lab</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 28px; color: #1f2933; background: #fbfaf7; }}
section {{ margin-bottom: 32px; }}
img {{ max-width: 100%; border: 1px solid #d9dee4; background: white; }}
code {{ background: #eef2f5; padding: 2px 4px; }}
</style>
<h1>YURI Math Visual Proof Lab</h1>
<p>Fixture-only artifacts. These reports are advisory lab evidence and write no runtime truth.</p>
<section>
  <h2>Pathfinding Proof</h2>
  <p>A*: cost {path_report["astar"]["cost"]}, expanded {path_report["astar"]["expandedCount"]}; Dijkstra expanded {path_report["dijkstra"]["expandedCount"]}.</p>
  <img src="pathfinding-proof.svg" alt="Pathfinding SVG proof">
  <p>Machine report: <code>pathfinding-proof.json</code>, quick image: <code>pathfinding-proof.png</code></p>
</section>
<section>
  <h2>Bayes Confidence Proof</h2>
  <p>Prior {bayes_report["prior"]:.2f}, posterior {bayes_report["posterior"]:.2f}. Confidence then decays by half-life.</p>
  <img src="bayes-confidence-proof.svg" alt="Bayes confidence SVG proof">
  <p>Machine report: <code>bayes-confidence-proof.json</code>, quick image: <code>bayes-confidence-proof.png</code></p>
</section>
</html>
"""
    (out_dir / "index.html").write_text(body, encoding="utf-8")


def write_artifacts(fixture: dict, out_dir: Path) -> dict:
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    path_report = build_pathfinding_report(fixture)
    bayes_report = build_bayes_report()

    (out_dir / "pathfinding-proof.json").write_text(json.dumps(path_report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (out_dir / "bayes-confidence-proof.json").write_text(json.dumps(bayes_report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (out_dir / "pathfinding-proof.svg").write_text(render_pathfinding_svg(fixture, path_report) + "\n", encoding="utf-8")
    (out_dir / "bayes-confidence-proof.svg").write_text(render_bayes_svg(bayes_report) + "\n", encoding="utf-8")
    write_pathfinding_png(out_dir / "pathfinding-proof.png", path_report)
    write_bayes_png(out_dir / "bayes-confidence-proof.png", bayes_report)
    write_html(out_dir, path_report, bayes_report)

    return {
        "schema": "yuri.math.visual-proof-run.v0",
        "outDir": display_path(out_dir),
        "artifacts": [
            "pathfinding-proof.json",
            "pathfinding-proof.svg",
            "pathfinding-proof.png",
            "bayes-confidence-proof.json",
            "bayes-confidence-proof.svg",
            "bayes-confidence-proof.png",
            "index.html",
        ],
        "writesRuntimeTruth": False,
    }


def display_path(file_path: Path) -> str:
    try:
        return str(file_path.relative_to(REPO_ROOT))
    except ValueError:
        return str(file_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--json", action="store_true", help="Print the run manifest as JSON.")
    args = parser.parse_args()

    fixture_path = Path(args.fixture)
    out_dir = Path(args.out_dir)
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    manifest = write_artifacts(fixture, out_dir)
    if args.json:
        print(json.dumps(manifest, indent=2, sort_keys=True))
    else:
        print(f"visual proof artifacts written to {manifest['outDir']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
