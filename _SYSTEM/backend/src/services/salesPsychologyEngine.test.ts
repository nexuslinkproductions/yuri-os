import assert from 'node:assert/strict';
import {
    analyzeSalesScenario,
    classifySalesMethodology,
    scoreEvidenceTier,
    SalesScenarioInput
} from './salesPsychologyEngine';

const praisedButIncomplete: SalesScenarioInput = {
    scenario: {
        sector: 'creative_services',
        dealStage: 'proposal',
        channel: 'email',
        buyerType: 'agency_owner',
        relationshipWarmth: 'warm',
        decisionStructure: 'unknown',
        stakes: 'medium'
    },
    signals: {
        positive: [
            'The buyer praised the offer and said the production style feels exactly right.',
            'They asked how implementation would work on the first shoot.',
            'They replied within an hour.'
        ],
        negative: [],
        omissions: [
            'No budget language.',
            'No decision-maker mentioned.',
            'No timeline commitment.'
        ],
        emotionalTone: 'curious and optimistic',
        buyerLanguage: [
            'This feels aligned with what we want.',
            'How would this work if we started with one campaign?'
        ],
        nextStepBehavior: 'asked for implementation details but did not commit'
    },
    psychologyLayers: ['jungian_depth', 'self_determination', 'motivational_interviewing', 'raving_fans']
};

const analysis = analyzeSalesScenario(praisedButIncomplete);

assert.equal(analysis.probability.estimate, 'not_estimable', 'v1 must not produce fake numeric probabilities');
assert.equal(analysis.ethicalRisk.blocked, false, 'truthful advisory sales support should be allowed');
assert.ok(analysis.scores.positiveMomentum > 0.55, 'praise, curiosity, and fast replies should count as positive momentum');
assert.ok(analysis.scores.omissionRisk > 0.55, 'missing budget, authority, and timeline must create omission risk');
assert.ok(analysis.inferences.some((item: { kind: string; label: string }) => item.kind === 'positive_signal' && item.label === 'implementation_curiosity'));
assert.ok(analysis.inferences.some((item: { kind: string; label: string }) => item.kind === 'omission_signal' && item.label === 'budget_absent'));
assert.ok(
    analysis.psychologicalRead.some((item: { layer: string; caution: string }) => item.layer === 'jungian_depth' && item.caution.includes('hypothesis')),
    'Jungian/depth lens must be labeled as hypothesis, not diagnosis'
);
assert.match(analysis.recommendedMove.summary, /confirm enthusiasm/i);
assert.match(analysis.recommendedMove.summary, /budget/i);
assert.ok(analysis.questionOptions.some((question: string) => question.includes('budget')));
assert.ok(analysis.tacticLineage.includes('Raving Fans'));
assert.ok(analysis.tacticLineage.includes('Motivational Interviewing'));

const manipulative = analyzeSalesScenario({
    scenario: {
        sector: 'high_ticket_coaching',
        dealStage: 'close',
        channel: 'phone',
        buyerType: 'consumer',
        relationshipWarmth: 'cold',
        decisionStructure: 'single_buyer',
        stakes: 'high'
    },
    signals: {
        positive: [],
        negative: ['The buyer says they feel financially unsafe.'],
        omissions: ['No budget language.'],
        emotionalTone: 'anxious',
        buyerLanguage: ['I am scared I cannot afford this.'],
        nextStepBehavior: 'hesitated'
    },
    requestedTactic: 'Use false scarcity and pressure them before they can think.'
});

assert.equal(manipulative.ethicalRisk.blocked, true, 'false scarcity and pressure must be blocked');
assert.match(manipulative.ethicalRisk.reason, /false scarcity|pressure/i);
assert.match(manipulative.recommendedMove.summary, /de-escalate/i);

assert.equal(classifySalesMethodology('NEPQ neutral questioning and buyer-led persuasion'), 'NEPQ');
assert.equal(classifySalesMethodology('Define the customer vision and create raving fans'), 'Raving Fans');
assert.equal(classifySalesMethodology('persona shadow archetype projection'), 'Jungian Depth Psychology');

assert.equal(scoreEvidenceTier('PRIMARY_RESEARCH'), 1);
assert.equal(scoreEvidenceTier('BOOK_METHOD'), 0.7);
assert.equal(scoreEvidenceTier('CLINICAL_THEORY'), 0.64);
assert.equal(scoreEvidenceTier('ANECDOTAL'), 0.25);

process.stdout.write('sales-psychology-engine: pass\n');
