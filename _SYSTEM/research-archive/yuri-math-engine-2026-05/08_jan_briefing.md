# Jan Briefing: YURI Mathematical Operating Substrate

Date: 2026-05-24

## What Changed

We are not adding "a math feature." We are giving YURI a mathematical operating substrate.

The idea is to let YURI use mathematics to route, measure, prove, optimize, compare, learn, and evolve.

## Why Dijkstra and A* First

Dijkstra is the baseline: it searches by known cost and has no direction signal.

A* is the intelligent step: it searches by `f(n)=g(n)+h(n)`, combining known cost with an estimated remaining cost. With an admissible heuristic, A* keeps optimality while often expanding fewer nodes.

This makes it the perfect first teaching proof: YURI can see why heuristic structure matters.

## What We Built First

- Research archive for the 86-reference math corpus.
- Deterministic Node math core for entropy, KL divergence, cross-entropy, confidence decay, Dijkstra, A*, and topological sort.
- Python visual proof lab boundary for graph demonstrations.
- Formula-bank fixtures for information theory, graph search, and business/LKR-style models.
- Adapter contract so external tools like NetworkX/SymPy can participate without becoming unchecked runtime truth.

## Important Boundary

We are not locking YURI into internal-only math. Python, SymPy, NetworkX, theorem provers, WASM kernels, and EML experiments are welcome.

The rule is: external engines can explore and compute; YURI promotes only verified outputs.

## EML Status

EML is promising as a future symbolic substrate, but it is sandboxed for now because the claim scope and numerical behavior need careful verification.

## Next Engineering Step

Run the visual proof lab, inspect Dijkstra vs A* traces, then connect entropy/KL scoring to controlled YURI reports before touching live memory or routing behavior.
