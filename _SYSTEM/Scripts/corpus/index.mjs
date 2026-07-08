// corpus/ barrel — import surface for the corpus matching + security library.
//
// NOTE: corpus is barreled-only, NOT moved. corpus-match.mjs is load-bearing
// infrastructure (10 external consumers: circuitry-auto-register, memory-match,
// gpd-confirm-matcher, the yuri-match-* family, self-improvement/cross-reference,
// nexus-rs conformance). Relocating it would rewire the match subsystem — same
// call the refactor made for `fleet`. This barrel re-exports in place, zero moves.
//
// Only modules with a real export surface are barreled. The corpus-* CLI tools
// (absorb, categorize, merge-candidates, mine) and the collapse demo have no
// exports; discover them via `ls _SYSTEM/Scripts/corpus-*.mjs`.
export * as match from '../corpus-match.mjs';
export * as securityScan from '../corpus-security-scan.mjs';
export * as threatTaxonomy from '../corpus-threat-taxonomy.mjs';
