import type { SkillEntry } from './types';

const NOW = Date.now();

export const MOCK_SKILLS: SkillEntry[] = [
  { id: 'deepseek-workhorse', name: 'deepseek-workhorse', description: 'General-purpose heavy-lift reasoning', invocationCount: 187, category: 'reasoning', triggers: ['/deepseek-workhorse'] },
  { id: 'swarm-coordination', name: 'swarm-coordination', description: 'Orchestrate multi-agent swarms', invocationCount: 94, category: 'orchestration', triggers: ['/swarm-coordination'] },
  { id: 'design-master', name: 'design-master', description: 'End-to-end design system generation', invocationCount: 63, category: 'design', triggers: ['/design-master'] },
  { id: 'frontend-design', name: 'frontend-design', description: 'UI component scaffolding', invocationCount: 142, category: 'design', triggers: ['/frontend-design'] },
  { id: 'design-critique', name: 'design-critique', description: 'Heuristic evaluation against 10 usability principles', invocationCount: 51, category: 'design', triggers: ['/design-critique'] },
  { id: 'accessibility-review', name: 'accessibility-review', description: 'WCAG 2.2 AA audit', invocationCount: 38, category: 'quality', triggers: ['/accessibility-review'] },
  { id: 'end-of-transmission', name: 'end-of-transmission', description: 'Graceful session teardown', invocationCount: 200, category: 'utility', triggers: ['/end-of-transmission', '/eot'] },
  { id: 'sharingan', name: 'sharingan', description: 'Clone and mirror any agent pattern', invocationCount: 77, category: 'meta', triggers: ['/sharingan'] },
  { id: 'graphify', name: 'graphify', description: 'Convert prose into mermaid diagrams', invocationCount: 112, category: 'visualization', triggers: ['/graphify'] },
  { id: 'schedule', name: 'schedule', description: 'Cron-based task scheduler for agents', invocationCount: 89, category: 'utility', triggers: ['/schedule'] },
  { id: 'compact-optimizer', name: 'compact-optimizer', description: 'Context-window token compaction', invocationCount: 155, category: 'optimization', triggers: ['/compact-optimizer', '/compact'] },
  { id: 'tokenmaxxing', name: 'tokenmaxxing', description: 'Aggressive token budgeting and forecasting', invocationCount: 43, category: 'finance', triggers: ['/tokenmaxxing'] },
  { id: 'parallel-clone-orchestrator', name: 'parallel-clone-orchestrator', description: 'Fan-out identical tasks across N lanes', invocationCount: 29, category: 'orchestration', triggers: ['/parallel-clone-orchestrator', '/pco'] },
  { id: 'failure-evolution-loop', name: 'failure-evolution-loop', description: 'Iterate on failure until success threshold', invocationCount: 17, category: 'meta', triggers: ['/failure-evolution-loop', '/fel'] },
  { id: 'pattern-mirror-core', name: 'pattern-mirror-core', description: 'Reflect agent decision trees for audit', invocationCount: 0, category: 'meta', triggers: ['/pattern-mirror-core', '/pmc'] },
];
