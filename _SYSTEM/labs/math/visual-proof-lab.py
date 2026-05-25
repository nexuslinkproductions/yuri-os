#!/usr/bin/env python3
"""Fixture-only visual proof helper for YURI math labs.

The runtime substrate remains Node-governed. This lab script is intentionally
side-effect limited: it reads an owned fixture and writes an optional report path
only when the operator supplies one.
"""

from __future__ import annotations

import argparse
import heapq
import json
from pathlib import Path


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
    cost = {source: 0}
    previous = {}
    expanded = []
    closed = set()
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
                priority = next_cost + heuristic.get(neighbor, 0)
                heapq.heappush(frontier, (priority, neighbor))

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


def build_report(fixture: dict) -> dict:
    graph = fixture["graph"]
    source = fixture["source"]
    target = fixture["target"]
    dijkstra = shortest_path(graph, source, target)
    astar = shortest_path(graph, source, target, fixture.get("heuristic", {}))
    return {
        "schema": "yuri.math.visual-proof-report.v0",
        "fixture": fixture["name"],
        "source": source,
        "target": target,
        "dijkstra": dijkstra,
        "astar": astar,
        "teachingPoint": "Dijkstra expands by known cost only; A* adds an admissible estimate of remaining cost.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", default="_SYSTEM/labs/math/fixtures/pathfinding-demo.json")
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    report = build_report(fixture)
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
