"""Analytics scanner fixture graph — synthetic, deterministic, rev-pinned.

Structure (hand-computable expected values):
  code nodes: file:a.py, file:b.py, file:c.py, file:d.py, test_suite:t.py
  code edges (tests wiring): t.py -> a.py, a.py -> b.py, b.py -> c.py, d.py -> a.py
    => code graph is a tree rooted at d: d - a - b - c, plus t attached to a.
       articulation points: {a} (removing a splits d|t from b-c? no: d->a, t->a,
       a->b, b->c => removing a isolates d,t,b,c into 3 pieces => a is a cut),
       actually every internal node: a (d,t | b,c), b (a,d,t | c) => {a, b}
       bridges: d-a, t-a, a-b, b-c => 4 bridges
  non-code nodes: port:8080, process:p1, launchd_agent:la1, database:memory.db,
       env_file:.env, protected_path:secret.pem, mcp_server:m1,
       harness_config:.mcp.json, governance_organ:o1
  edges:
    launchd_to_script: la1 -> file:b.py (boundary local)  [b exec-capable via launchd]
    network_conn: p1 -> port:8080 (boundary lan)          [port reached? p1 is process]
    file_write: file:d.py -> database:memory.db (none)    [writer d.py -> memory.db]
    file_read: file:a.py -> env_file:.env (none)          [secrets touch: file a reads env]
    file_read: file:c.py -> protected_path:secret.pem (none) [protected touch]
    mcp_registration: harness_config:.mcp.json -> mcp_server:m1 (boundary local)
  exec sources: file:b.py (launchd target, exec_capable via edge),
                file:d.py (props.exec_capable: true),
                mcp_server:m1 (mcp_registration target)
  reach:
    b.py: outgoing tests b->c, spawns none => {c} ; file_read c->secret? c has no
          outgoing edges from b (b->c only) => reach {c} = 1
    d.py: outgoing file_write d->memory.db => {memory.db} = 1
    m1: no outgoing => 0
  trust crossings: b: launchd edge (local) = 1 ; d: 0 ; m1: mcp edge (local) = 1
Expected component counts (union-find over all nodes):
    comp A: {file:a.py, file:b.py, file:c.py, file:d.py, test_suite:t.py,
             launchd_agent:la1, database:memory.db, env_file:.env,
             protected_path:secret.pem}   (9 members; la1-b, d-memory, a-env, c-secret)
    comp B: {process:p1, port:8080}       (2)
    comp C: {harness_config:.mcp.json, mcp_server:m1} (2)
    comp D: {governance_organ:o1}         (1, isolated)
  => 4 components; largest = 9 (files+launchd+memory+secrets)
Cross-layer queries:
    writers: {file:d.py}; write_targets {database:memory.db}
    memory_bus: memory.db touched by file:d.py
    secrets: env_file touched by file:a.py (files surface), protected touched by file:c.py
Findings expected: file_write into database (sev medium, d.py->memory.db);
    file_read into protected_path (sev medium? file_read kind, target protected surface:
    our rule fires for file_write only => protected touch found via high rule only if
    network involved. c.py->secret.pem is files->protected with kind file_read:
    no high (no network), no medium (not file_write) => no finding; query:secrets
    still lists it. To exercise the high rule we add network edge: none in fixture =>
    high findings = 0. file_read into env is files->secrets, no finding.
    exec findings: EXEC-file:b.py medium (1 local crossing), EXEC-mcp_server:m1 medium
    (1 local crossing) — wait m1 has crossing local => medium. d.py no crossing => none.
    ART findings: exec-capable articulation? b is articulation AND exec-capable via
    launchd => medium finding ART-file:b.py. a is articulation, not exec => degree>=10?
    no. no finding. bridges: 4.
"""
