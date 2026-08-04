# Analytics scanner fixture graph — synthetic, deterministic, rev-pinned

## Nodes (15)
code: file:a.py, file:b.py, file:c.py, file:d.py, file:reader.py, test_suite:t.py
non-code: port:8080, process:p1, launchd_agent:la1, database:memory.db,
env_file:.env, protected_path:secret.pem, mcp_server:m1,
harness_config:.mcp.json, governance_organ:o1

## Edges (12)
tests: t->a, a->b, b->c, d->a
launchd_to_script: la1->b (local)      [b exec-capable via launchd]
network_conn: p1->port:8080 (lan)
file_write: d->memory.db
file_read: a->.env, c->secret.pem
mcp_registration: harness->m1 (local)
file_read: memory.db->reader            [M1.5 bidirectional: memory node as FROM]
network_conn: d->port:8080 (lan)        [M1.5: boundary edge ON reachable path]
d props.exec_capable = true

## Expected (hand-computed)
### connected_components (union-find over all nodes/edges)
d->port merges network into the big component:
- C1 {a,b,c,d,t,reader,la1,memory.db,.env,secret.pem,port:8080,p1} size 12
- C2 {harness,m1} size 2 ; C3 {o1} size 1  => 3 components, 1 singleton
- C1 mixes SECRET (.env, secret.pem) + NETWORK (port, p1) => CC medium finding
### articulation (code kinds only: file/script/service/test_suite)
code edges: t-a, a-b, b-c, d-a (reader isolated; port/launchd not code)
- articulation points {a, b} ; bridges {t-a, a-b, b-c, d-a} = 4
- b is launchd exec target => ART-file:b.py medium finding
### cross_layer_links
- files->files:tests 4 ; launchd->files:launchd_to_script 1 ; ports->ports 1 ;
  files->memory:file_write 1 ; files->secrets:file_read 1 ; files->protected 1 ;
  harness->servers:mcp_registration 1 ; memory->files:file_read 1 (bidir) ;
  files->ports:network_conn 1 (d->port)
- query:memory_bus touchers [file:d.py, file:reader.py] (BOTH sides)
- query:writers writers [file:d.py], targets [memory.db], incident [memory.db, file:d.py]
- findings: file_write->database medium (d->memory.db) ; memory-bus file_read info
  (memory.db->reader) ; no high
### exec_centrality (REACH_EDGE_KINDS; file_read NOT reachable)
sources: b (launchd), d (exec_capable), m1 (mcp target)
- d: reach {a,b,c,memory.db,port:8080}=5 ; crossings=1 (d->port lan ON path) ;
  port_reach=1 => HIGH finding
- b: reach {c}=1 ; crossings=0 (launchd edge incident-only, not on path) => info
- m1: reach 0, crossings 0
- ranking [d (7), b (1), m1 (0)]
