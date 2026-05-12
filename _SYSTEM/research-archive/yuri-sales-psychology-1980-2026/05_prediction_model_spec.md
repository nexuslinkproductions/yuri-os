# Sales Prediction Model Spec

advisory_only: true
local_truth_claim: false

## Runtime Input

```ts
type SalesScenarioInput = {
  scenario: {
    sector: string;
    dealStage: string;
    channel: string;
    buyerType: string;
    relationshipWarmth: string;
    decisionStructure: string;
    stakes: string;
    constraints?: string[];
  };
  signals: {
    positive: string[];
    negative: string[];
    omissions: string[];
    emotionalTone?: string;
    buyerLanguage?: string[];
    nextStepBehavior?: string;
  };
  psychologyLayers?: string[];
  requestedTactic?: string;
};
```

## Runtime Output

```ts
type SalesAnalysis = {
  scores: {
    evidenceStrength: number;
    sectorFit: number;
    stageFit: number;
    positiveMomentum: number;
    omissionRisk: number;
    psychologicalLayerFit: number;
    buyerReadConfidence: number;
    downsideRisk: number;
    nextStepClarity: number;
  };
  inferences: Array<{ kind: string; label: string; evidence: string; weight: number }>;
  psychologicalRead: Array<{ layer: string; read: string; caution: string }>;
  recommendedMove: { summary: string; stage: string };
  questionOptions: string[];
  tacticLineage: string[];
  evidenceTier: string;
  ethicalRisk: { blocked: boolean; reason: string };
  probability: { estimate: "not_estimable"; confidence: string; rationale: string };
  calibrationRow: {
    outcomeToTrack: string;
    signalsToRecheck: string[];
    predictedNextObservable: string;
  };
};
```

## Deterministic Scoring

V1 uses deterministic scoring, not statistical prediction:

- `evidenceStrength`: source tier confidence
- `sectorFit`: whether the lens fits the sector
- `stageFit`: whether the lens fits the deal stage
- `positiveMomentum`: praise, curiosity, future language, implementation questions, fast response, referral energy
- `omissionRisk`: missing budget, authority, timeline, pain ownership, curiosity, or emotional response
- `psychologicalLayerFit`: whether a requested psychology lens has enough signal to be useful
- `buyerReadConfidence`: how much evidence exists for any recommendation
- `downsideRisk`: harm, pressure, bad-fit, misread, or premature close risk
- `nextStepClarity`: whether Yuri can recommend one concrete next step

## Probability Rule

Return `not_estimable` unless Yuri has calibrated local outcome history for the same scenario class. Calibration rows must track:

- scenario class
- signal set
- recommendation
- predicted next observable
- actual outcome
- time horizon
- confidence

## V1 Implementation

The first runtime implementation lives at `backend/src/services/salesPsychologyEngine.ts` and intentionally avoids route/database coupling so it can be tested without touching unrelated backend state.
