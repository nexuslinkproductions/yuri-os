export interface NudimmudDesignConfig {
  theme: string;
  motionIntensity: string;
  backgroundLife: string;
  layoutMode: string;
  componentStyle: string;
  auditTone: string;
  enabledFunctions: string[];
  confirmed: boolean;
}

export const DEFAULT_CONFIG: NudimmudDesignConfig = {
  theme: '',
  motionIntensity: '',
  backgroundLife: '',
  layoutMode: '',
  componentStyle: '',
  auditTone: '',
  enabledFunctions: [],
  confirmed: false,
};

export interface CatalogOption {
  value: string;
  description: string;
}

export interface CatalogCategory {
  key: keyof Pick<NudimmudDesignConfig, 'theme' | 'motionIntensity' | 'backgroundLife' | 'layoutMode' | 'componentStyle' | 'auditTone'>;
  label: string;
  code: string;
  options: CatalogOption[];
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    key: 'theme',
    label: 'Theme Direction',
    code: 'THM',
    options: [
      { value: 'Cyber HUD', description: 'Neon grids, sharp edges, operator aesthetic' },
      { value: 'Luxury Dark', description: 'Refined darkness, gold accents, editorial weight' },
      { value: 'Neon Terminal', description: 'Retro terminal with vivid phosphor glow' },
      { value: 'Tactical Glass', description: 'Frosted, layered, high-contrast command glass' },
      { value: 'Minimal Command', description: 'Zero ornament, pure function, high clarity' },
      { value: 'Experimental Living', description: 'Alive, reactive, boundary-pushing surfaces' },
    ],
  },
  {
    key: 'motionIntensity',
    label: 'Motion Intensity',
    code: 'MOT',
    options: [
      { value: 'Calm', description: 'Subtle, barely there — focus on content' },
      { value: 'Responsive', description: 'Precise feedback, no excess — feels alive' },
      { value: 'Energetic', description: 'Bold transitions, clear momentum' },
      { value: 'Cinematic', description: 'Dramatic entrances, deliberate timing' },
    ],
  },
  {
    key: 'backgroundLife',
    label: 'Background Life',
    code: 'BGL',
    options: [
      { value: 'Static depth', description: 'Layered darkness, no movement' },
      { value: 'Animated gradient', description: 'Slow-shifting color field' },
      { value: 'Floating particles', description: 'Sparse ambient particle drift' },
      { value: 'Grid scanlines', description: 'Horizontal scan rhythm overlay' },
      { value: 'Ambient light trails', description: 'Soft light streak movement' },
      { value: 'Reactive cursor', description: 'Background responds to cursor position' },
    ],
  },
  {
    key: 'layoutMode',
    label: 'Layout Mode',
    code: 'LAY',
    options: [
      { value: 'Split HUD', description: 'Left panel + main viewport, always visible' },
      { value: 'Floating panels', description: 'Cards float over a unified background' },
      { value: 'Fullscreen command', description: 'Single immersive view, no sidebars' },
      { value: 'Notebook card stack', description: 'Stacked cards in notebook style' },
      { value: 'Game menu carousel', description: 'Horizontal scroll between audit zones' },
    ],
  },
  {
    key: 'componentStyle',
    label: 'Component Style',
    code: 'CMP',
    options: [
      { value: 'Rounded glass', description: 'Soft corners, blur, layered light' },
      { value: 'Sharp tactical', description: '0 radius, crisp borders, military precision' },
      { value: 'Premium minimal', description: 'Thin strokes, plenty of void, refined' },
      { value: 'Heavy arcade', description: 'Bold, chunky, high-contrast game UI' },
      { value: 'Terminal native', description: 'Monospace, ASCII borders, hacker native' },
    ],
  },
  {
    key: 'auditTone',
    label: 'Audit Tone',
    code: 'TN',
    options: [
      { value: 'Clean professional', description: 'Measured, objective, client-ready' },
      { value: 'Strategic consultant', description: 'High-level, structured, decision-focused' },
      { value: 'Game mission report', description: 'Mission briefing format, objectives + risk' },
      { value: 'Creative director', description: 'Opinionated, intuitive, taste-led critique' },
      { value: 'Technical audit', description: 'Detailed, code-like, spec-precise' },
    ],
  },
];

export const FUNCTION_TOGGLES: string[] = [
  'Collapsible audit sections',
  'Live theme switching',
  'Keyboard navigation',
  'Animated score meters',
  'Document section heatmap',
  'Hover-to-inspect comments',
  'Before/after preview',
  'Export handoff JSON',
  'Copy audit summary',
  'Save config',
  'Reset customization',
  'Reduced motion toggle',
];

export interface AuditFinding {
  id: string;
  type: 'strength' | 'issue' | 'note';
  text: string;
  detail: string;
}

export interface AuditSection {
  id: string;
  label: string;
  code: string;
  score: number;
  verdict: string;
  summary: string;
  findings: AuditFinding[];
}

export interface AuditSuggestion {
  priority: 'HIGH' | 'MED' | 'LOW';
  category: string;
  text: string;
  impact: string;
}

export interface YURI_DESIGN_HANDOFF {
  schema: '1.0.0';
  generated: string;
  config: NudimmudDesignConfig;
  auditSummary: {
    overallScore: number;
    strongestSection: string;
    weakestSection: string;
    sectionScores: Record<string, number>;
  };
  suggestions: AuditSuggestion[];
  styleDirection: string;
  nextBuildInstructions: string[];
}

export const MOCK_AUDIT_SECTIONS: AuditSection[] = [
  {
    id: 'structure',
    label: 'Structure Audit',
    code: 'STR',
    score: 82,
    verdict: 'SOLID',
    summary: 'Hierarchy is clear and navigation logic is coherent. One missing transition spec between major sections reduces the overall flow score.',
    findings: [
      { id: 's1', type: 'strength', text: 'Section hierarchy reads cleanly top-to-bottom', detail: 'H1 → H2 → H3 nesting is consistent throughout all 7 document sections. No orphaned headings detected.' },
      { id: 's2', type: 'strength', text: 'Flow from overview to detail is intuitive', detail: 'The overview-first, detail-second pattern is applied consistently. Users can skim or deep-read without losing orientation.' },
      { id: 's3', type: 'issue', text: 'Missing transition specification between Section 3 → Section 4', detail: 'The jump from the "Visual System" section to "Interaction Model" lacks a connecting statement. Adds cognitive load at a critical transition point.' },
      { id: 's4', type: 'note', text: 'Consider a sub-nav anchor for sections longer than 800 words', detail: 'Section 5 exceeds 1200 words. A sticky anchor nav would reduce scroll fatigue significantly.' },
    ],
  },
  {
    id: 'visual',
    label: 'Visual Audit',
    code: 'VIS',
    score: 71,
    verdict: 'NEEDS WORK',
    summary: 'Spacing inconsistency at the 12px/16px boundary is the primary weakness. Motion tokens are underused in hover states.',
    findings: [
      { id: 'v1', type: 'issue', text: 'Spacing oscillates between 12px and 16px without system logic', detail: 'Found 14 instances where spacing alternates arbitrarily. Recommend locking to 4px base unit: 8, 12, 16, 24, 32, 48.' },
      { id: 'v2', type: 'issue', text: 'Motion tokens absent from 6 interactive elements', detail: 'Buttons, chips, and card hovers in Sections 2, 4, and 6 lack transition declarations. They feel unfinished.' },
      { id: 'v3', type: 'strength', text: 'Color hierarchy is well-established and consistent', detail: 'Primary, secondary, and muted token roles are applied correctly across all 33 components reviewed.' },
      { id: 'v4', type: 'note', text: 'Typography scale is solid — weight contrast needs reinforcement at body level', detail: 'Display weights (700, 800) are excellent. Body text stays at 400 throughout — a 500 weight for key callouts would add punch.' },
    ],
  },
  {
    id: 'ux',
    label: 'UX Audit',
    code: 'UX',
    score: 84,
    verdict: 'STRONG',
    summary: 'Keyboard navigation coverage is solid. Cognitive load is well-managed per screen. Inspector depth meets expectation.',
    findings: [
      { id: 'u1', type: 'strength', text: 'Keyboard navigation covers all primary interaction flows', detail: 'Tab order is logical, all interactive elements are keyboard-reachable, and focus indicators are visible.' },
      { id: 'u2', type: 'strength', text: 'Cognitive load per screen is appropriately managed', detail: 'No screen exceeds 5 primary decision points. The progressive disclosure pattern works well in the audit sections.' },
      { id: 'u3', type: 'issue', text: 'aria-live missing from score meter updates', detail: 'When scores animate, screen readers receive no notification. Add aria-live="polite" to the score container.' },
      { id: 'u4', type: 'note', text: 'Tooltip show delay could be reduced from 400ms to 250ms', detail: 'Power users hitting the inspector repeatedly experience the delay as friction. 250ms feels native at this interaction density.' },
    ],
  },
  {
    id: 'content',
    label: 'Content Audit',
    code: 'CNT',
    score: 76,
    verdict: 'ADEQUATE',
    summary: 'Document purpose and status are stated clearly. Weakest section headers need rewriting for scannability.',
    findings: [
      { id: 'c1', type: 'strength', text: 'Document purpose stated unambiguously in the overview', detail: 'The opening statement correctly names the document type, target audience, and intended outcome in under 3 sentences.' },
      { id: 'c2', type: 'issue', text: 'Section 2 and Section 5 headers are too vague for quick scanning', detail: '"System Notes" and "Additional Context" could be any document. They should name the specific system or context.' },
      { id: 'c3', type: 'issue', text: 'Improvement suggestions lack a prioritization signal', detail: 'Readers cannot tell which suggestions are critical vs. optional. A HIGH/MED/LOW tag or number ranking is needed.' },
      { id: 'c4', type: 'note', text: 'Action items should lead with verbs, not nouns', detail: '"Authentication redesign" should be "Redesign the authentication flow." Verb-first framing reduces ambiguity about who owns the action.' },
    ],
  },
];

export const MOCK_SUGGESTIONS: AuditSuggestion[] = [
  {
    priority: 'HIGH',
    category: 'Spacing',
    text: 'Unify spacing scale to a strict 4px base unit across all components',
    impact: 'Eliminates 12px/16px inconsistency, reduces layout decision fatigue',
  },
  {
    priority: 'HIGH',
    category: 'Accessibility',
    text: 'Add aria-live="polite" to all score meter containers',
    impact: 'Screen reader users receive score change announcements without disruption',
  },
  {
    priority: 'MED',
    category: 'Motion',
    text: 'Apply --transition-master to all interactive elements missing motion tokens',
    impact: 'Unifies tactile feel, significantly increases perceived polish',
  },
  {
    priority: 'MED',
    category: 'Content',
    text: 'Rewrite Section 2 and Section 5 headers to lead with the user action or outcome',
    impact: 'Improves scannability, reduces time-to-comprehension by ~40%',
  },
  {
    priority: 'LOW',
    category: 'UX Polish',
    text: 'Reduce tooltip show delay from 400ms to 250ms for hover-to-inspect',
    impact: 'Feels faster and more native to power users',
  },
];
