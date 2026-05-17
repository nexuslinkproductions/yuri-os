#!/usr/bin/env python3
"""Run graphify pipeline on SymbiOS trademark research data."""
import json
import sys
from pathlib import Path

INPUT_PATH = Path("/Users/marcelspatz/NUDIMMUD/_SYSTEM/symbios-graph-input")
OUT_DIR = INPUT_PATH / "graphify-out"
OUT_DIR.mkdir(exist_ok=True)

# Write interpreter path
(OUT_DIR / ".graphify_python").write_text(sys.executable)

# ── Step 1: Detect ──
from graphify.detect import detect
result = detect(INPUT_PATH)
(OUT_DIR / ".graphify_detect.json").write_text(json.dumps(result, indent=2))
files = result.get("files", {})
total = result.get("total_files", 0)
words = result.get("total_words", 0)
print(f"Corpus: {total} files · ~{words:,} words")
for ftype, flist in files.items():
    if flist:
        print(f"  {ftype}: {len(flist)} files")

# ── Step 2: AST extraction (code files) ──
from graphify.extract import collect_files, extract
code_files = []
for f in files.get("code", []):
    p = Path(f)
    if p.is_dir():
        code_files.extend(collect_files(p))
    else:
        code_files.append(p)

if code_files:
    ast_result = extract(code_files, cache_root=INPUT_PATH)
else:
    ast_result = {"nodes": [], "edges": [], "input_tokens": 0, "output_tokens": 0}
(OUT_DIR / ".graphify_ast.json").write_text(json.dumps(ast_result, indent=2))
print(f"AST: {len(ast_result['nodes'])} nodes, {len(ast_result['edges'])} edges")

# ── Step 3: Semantic extraction via cache check ──
from graphify.cache import check_semantic_cache
all_files = [f for flist in files.values() for f in flist]
cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(all_files)
print(f"Cache: {len(all_files)-len(uncached)} hit, {len(uncached)} need extraction")

# Write cached results
cached_data = {"nodes": cached_nodes, "edges": cached_edges, "hyperedges": cached_hyperedges}
(OUT_DIR / ".graphify_cached.json").write_text(json.dumps(cached_data, indent=2))
(OUT_DIR / ".graphify_uncached.txt").write_text("\n".join(uncached))

# Manual semantic extraction for uncached docs (no subagent — inline)
sem_nodes = list(cached_nodes)
sem_edges = list(cached_edges)
sem_hyperedges = list(cached_hyperedges)

if uncached:
    # Build nodes and edges directly from the structured markdown
    doc_path = INPUT_PATH / "symbios-trademark-research.md"
    text = doc_path.read_text()

    # Define nodes from the research data
    manual_nodes = [
        {"id": "symbios_target", "label": "SymbiOS (Target)", "file_type": "document", "source_file": str(doc_path), "source_location": None, "source_url": None, "captured_at": None, "author": "Mike", "contributor": None},
        {"id": "ipmed_symbio", "label": "SYMBIO — IPMED S.à.r.l.", "file_type": "document", "source_file": str(doc_path), "source_location": "Class 42, Oct 2022", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "finland_symbio", "label": "SYMBIO — Symbio Finland Oy", "file_type": "document", "source_file": str(doc_path), "source_location": "TM 008771461, Class 42, 2009", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "wte_symbio", "label": "SymBio — WTE Wassertechnik", "file_type": "document", "source_file": str(doc_path), "source_location": "TM 000291328, Class 42, 1996", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "celonis_symbioworld", "label": "Symbioworld (Celonis)", "file_type": "document", "source_file": str(doc_path), "source_location": "Germany, AI BPM software", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "symbios_workspaces", "label": "SYMBIOS Workspaces GmbH", "file_type": "document", "source_file": str(doc_path), "source_location": "Austria, Linz, INSOLVENT", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "mars_symbioscience", "label": "SYMBIOSCIENCE — Mars Inc.", "file_type": "document", "source_file": str(doc_path), "source_location": "TM 004741526, Class 35+42, 2005", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "sony_symbiotic", "label": "SYMBIOTIC DIGITAL FLORA — Sony", "file_type": "document", "source_file": str(doc_path), "source_location": "Class 35+42, IR accepted", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "sabel_v_puma", "label": "Sabel v Puma (CJEU C-251/95)", "file_type": "document", "source_file": str(doc_path), "source_location": "Global Appreciation Test", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "nizza_class_42", "label": "Nizza Class 42 — IT/Software/AI", "file_type": "document", "source_file": str(doc_path), "source_location": "EU Trademark Classification", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "nizza_class_35", "label": "Nizza Class 35 — Business Consulting", "file_type": "document", "source_file": str(doc_path), "source_location": "EU Trademark Classification", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "euipo", "label": "EUIPO — EU Trademark Registry", "file_type": "document", "source_file": str(doc_path), "source_location": "Alicante, Spain", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "oesterreich_patentamt", "label": "Österreichisches Patentamt", "file_type": "document", "source_file": str(doc_path), "source_location": "Austria national authority", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "wipo", "label": "WIPO — International TM", "file_type": "document", "source_file": str(doc_path), "source_location": "Madrid Protocol", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "canon_doctrine", "label": "Canon Doctrine — Goods/Services Similarity", "file_type": "document", "source_file": str(doc_path), "source_location": "EU trademark law", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "eutmr_art19", "label": "EUTMR Art.19 — Marks Survive Insolvency", "file_type": "document", "source_file": str(doc_path), "source_location": "Austrian IO + EUTMR", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "alt_cogniflos", "label": "CogniFlow OS (Alternative)", "file_type": "document", "source_file": str(doc_path), "source_location": "Phonetic divergence strategy", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "alt_synaptiq", "label": "SynaptiQ (Alternative)", "file_type": "document", "source_file": str(doc_path), "source_location": "Phonetic divergence strategy", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "alt_nexelos", "label": "NexelOS (Alternative)", "file_type": "document", "source_file": str(doc_path), "source_location": "Phonetic divergence strategy", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "alt_velosync", "label": "Velosync (Alternative)", "file_type": "document", "source_file": str(doc_path), "source_location": "Neologism strategy", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "alt_clerqai", "label": "Clerq AI (Alternative)", "file_type": "document", "source_file": str(doc_path), "source_location": "Descriptive+fanciful strategy", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "mike_founder", "label": "Mike — Austrian Startup Founder", "file_type": "document", "source_file": str(doc_path), "source_location": "Austria, early stage", "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": "euipo_filing_cost", "label": "EUIPO Filing Cost €900 (Cl.35+42)", "file_type": "document", "source_file": str(doc_path), "source_location": "€850 base + €50 second class", "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ]

    manual_edges = [
        # SymbiOS vs conflicts
        {"source": "symbios_target", "target": "ipmed_symbio", "relation": "conflicts_with", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 0.95},
        {"source": "symbios_target", "target": "finland_symbio", "relation": "conflicts_with", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 0.75},
        {"source": "symbios_target", "target": "wte_symbio", "relation": "conflicts_with", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 0.60},
        {"source": "symbios_target", "target": "celonis_symbioworld", "relation": "market_conflict_with", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.47},
        {"source": "symbios_target", "target": "symbios_workspaces", "relation": "name_conflict_with", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.20},
        {"source": "symbios_target", "target": "mars_symbioscience", "relation": "secondary_conflict_with", "confidence": "EXTRACTED", "confidence_score": 0.8, "source_file": str(doc_path), "source_location": None, "weight": 0.25},
        {"source": "symbios_target", "target": "sony_symbiotic", "relation": "secondary_conflict_with", "confidence": "EXTRACTED", "confidence_score": 0.7, "source_file": str(doc_path), "source_location": None, "weight": 0.12},
        # Classes
        {"source": "symbios_target", "target": "nizza_class_42", "relation": "targets_class", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "symbios_target", "target": "nizza_class_35", "relation": "targets_class", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "ipmed_symbio", "target": "nizza_class_42", "relation": "registered_in", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "finland_symbio", "target": "nizza_class_42", "relation": "registered_in", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "wte_symbio", "target": "nizza_class_42", "relation": "registered_in", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "mars_symbioscience", "target": "nizza_class_35", "relation": "registered_in", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "mars_symbioscience", "target": "nizza_class_42", "relation": "registered_in", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        # Legal framework
        {"source": "ipmed_symbio", "target": "sabel_v_puma", "relation": "evaluated_by", "confidence": "INFERRED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "finland_symbio", "target": "sabel_v_puma", "relation": "evaluated_by", "confidence": "INFERRED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "sabel_v_puma", "target": "canon_doctrine", "relation": "supplements", "confidence": "EXTRACTED", "confidence_score": 0.95, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "symbios_workspaces", "target": "eutmr_art19", "relation": "governed_by", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        # Registry bodies
        {"source": "euipo", "target": "ipmed_symbio", "relation": "administers", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "euipo", "target": "finland_symbio", "relation": "administers", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "euipo", "target": "wte_symbio", "relation": "administers", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "oesterreich_patentamt", "target": "symbios_target", "relation": "can_advise", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "wipo", "target": "symbios_target", "relation": "international_option_for", "confidence": "INFERRED", "confidence_score": 0.8, "source_file": str(doc_path), "source_location": None, "weight": 0.8},
        # Founder & cost
        {"source": "mike_founder", "target": "symbios_target", "relation": "founded_by", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        {"source": "symbios_target", "target": "euipo_filing_cost", "relation": "faces_cost", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": str(doc_path), "source_location": None, "weight": 1.0},
        # Alternatives
        {"source": "symbios_target", "target": "alt_cogniflos", "relation": "safer_alternative", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "symbios_target", "target": "alt_synaptiq", "relation": "safer_alternative", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "symbios_target", "target": "alt_nexelos", "relation": "safer_alternative", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path), "source_location": None, "weight": 0.9},
        {"source": "symbios_target", "target": "alt_velosync", "relation": "safer_alternative", "confidence": "EXTRACTED", "confidence_score": 0.85, "source_file": str(doc_path), "source_location": None, "weight": 0.85},
        {"source": "symbios_target", "target": "alt_clerqai", "relation": "safer_alternative", "confidence": "EXTRACTED", "confidence_score": 0.85, "source_file": str(doc_path), "source_location": None, "weight": 0.85},
        # Semantic similarity edges
        {"source": "ipmed_symbio", "target": "finland_symbio", "relation": "semantically_similar_to", "confidence": "INFERRED", "confidence_score": 0.92, "source_file": str(doc_path), "source_location": None, "weight": 0.92},
        {"source": "alt_cogniflos", "target": "alt_synaptiq", "relation": "semantically_similar_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": str(doc_path), "source_location": None, "weight": 0.85},
    ]

    manual_hyperedges = [
        {"id": "class42_conflict_cluster", "label": "Class 42 Conflict Cluster", "nodes": ["ipmed_symbio", "finland_symbio", "wte_symbio"], "relation": "block_registration_in", "confidence": "EXTRACTED", "confidence_score": 0.95, "source_file": str(doc_path)},
        {"id": "safe_alternatives_cluster", "label": "Safe Alternative Names", "nodes": ["alt_cogniflos", "alt_synaptiq", "alt_nexelos", "alt_velosync", "alt_clerqai"], "relation": "form", "confidence": "EXTRACTED", "confidence_score": 0.9, "source_file": str(doc_path)},
        {"id": "eu_legal_framework", "label": "EU Trademark Legal Framework", "nodes": ["sabel_v_puma", "canon_doctrine", "eutmr_art19", "nizza_class_42", "nizza_class_35"], "relation": "participate_in", "confidence": "EXTRACTED", "confidence_score": 0.95, "source_file": str(doc_path)},
    ]

    sem_nodes.extend(manual_nodes)
    sem_edges.extend(manual_edges)
    sem_hyperedges.extend(manual_hyperedges)

semantic_data = {"nodes": sem_nodes, "edges": sem_edges, "hyperedges": sem_hyperedges, "input_tokens": 0, "output_tokens": 0}
(OUT_DIR / ".graphify_semantic.json").write_text(json.dumps(semantic_data, indent=2))
print(f"Semantic: {len(sem_nodes)} nodes, {len(sem_edges)} edges, {len(sem_hyperedges)} hyperedges")

# ── Step 3C: Merge AST + semantic ──
seen = {n["id"] for n in ast_result["nodes"]}
merged_nodes = list(ast_result["nodes"])
for n in sem_nodes:
    if n["id"] not in seen:
        merged_nodes.append(n)
        seen.add(n["id"])

merged_edges = ast_result["edges"] + sem_edges
merged_hyperedges = sem_hyperedges

merged = {"nodes": merged_nodes, "edges": merged_edges, "hyperedges": merged_hyperedges, "input_tokens": 0, "output_tokens": 0}
(OUT_DIR / ".graphify_extract.json").write_text(json.dumps(merged, indent=2))
print(f"Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges")

# ── Step 4: Build graph, cluster, analyze ──
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html

G = build_from_json(merged)
if G.number_of_nodes() == 0:
    print("ERROR: Graph is empty")
    sys.exit(1)

communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {"input": 0, "output": 0}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
placeholder_labels = {cid: f"Community {cid}" for cid in communities}
questions = suggest_questions(G, communities, placeholder_labels)

print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")
for cid, members in communities.items():
    print(f"  Community {cid}: {len(members)} nodes — {[G.nodes[m].get('label', m)[:30] for m in list(members)[:3]]}")

# ── Step 5: Label communities ──
# Inspect communities and assign meaningful labels
community_sample = {}
for cid, members in communities.items():
    labels_list = [G.nodes[m].get("label", m) for m in list(members)[:5]]
    community_sample[cid] = labels_list

print("\nCommunity samples for labeling:")
for cid, sample in community_sample.items():
    print(f"  {cid}: {sample}")

# Assign labels based on node content
labels = {}
for cid, members in communities.items():
    node_labels = [G.nodes[m].get("label", "").lower() for m in members]
    combined = " ".join(node_labels)
    if "alternative" in combined or "cogniflos" in combined or "synaptiq" in combined:
        labels[cid] = "Safe Name Alternatives"
    elif "sabel" in combined or "canon" in combined or "eutmr" in combined or "nizza" in combined:
        labels[cid] = "EU Legal Framework"
    elif "euipo" in combined or "patentamt" in combined or "wipo" in combined:
        labels[cid] = "Trademark Authorities"
    elif "ipmed" in combined or "finland" in combined or "wte" in combined:
        labels[cid] = "Class 42 Conflicts"
    elif "celonis" in combined or "workspaces" in combined or "mars" in combined:
        labels[cid] = "Market & Secondary Conflicts"
    elif "symbios" in combined and "target" in combined:
        labels[cid] = "SymbiOS Target Entity"
    elif "cost" in combined or "filing" in combined or "mike" in combined:
        labels[cid] = "Business & Cost Context"
    else:
        labels[cid] = f"Trademark Cluster {cid}"

print("\nAssigned labels:", labels)

# Regenerate questions with real labels
questions = suggest_questions(G, communities, labels)

# Generate report
report = generate(G, communities, cohesion, labels, gods, surprises, result, tokens, str(INPUT_PATH), suggested_questions=questions)
(OUT_DIR / "GRAPH_REPORT.md").write_text(report)
to_json(G, communities, str(OUT_DIR / "graph.json"))
print("graph.json + GRAPH_REPORT.md written")

# ── Step 6: HTML visualization ──
(OUT_DIR / ".graphify_labels.json").write_text(json.dumps({str(k): v for k, v in labels.items()}))
to_html(G, communities, str(OUT_DIR / "graph.html"), community_labels=labels or None)
print("graph.html written")

# ── Step 7: Save analysis ──
analysis = {
    "communities": {str(k): v for k, v in communities.items()},
    "cohesion": {str(k): v for k, v in cohesion.items()},
    "gods": gods,
    "surprises": surprises,
    "questions": questions,
}
(OUT_DIR / ".graphify_analysis.json").write_text(json.dumps(analysis, indent=2))

# ── Copy HTML to target path ──
import shutil
target = Path("/Users/marcelspatz/NUDIMMUD/_SYSTEM/SymbiOS-Trademark-Graph.html")
shutil.copy(OUT_DIR / "graph.html", target)
print(f"\nGraph saved to: {target}")
print(f"Report: {OUT_DIR}/GRAPH_REPORT.md")

# ── Print key sections ──
print("\n" + "="*60)
print("GOD NODES (highest connectivity):")
for g in gods[:5]:
    print(f"  {g}")

print("\nSURPRISING CONNECTIONS:")
for s in surprises[:3]:
    print(f"  {s}")

print("\nSUGGESTED QUESTIONS:")
for q in questions[:4]:
    print(f"  • {q}")
