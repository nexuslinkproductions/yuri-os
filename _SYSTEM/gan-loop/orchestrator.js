#!/usr/bin/env node

/**
 * GAN Loop Orchestrator
 *
 * Coordinates generator → evaluator loop for shot lists and client briefs.
 * Usage: node orchestrator.js <contentType> <inputFilePath> [rubricFilePath]
 *
 * Examples:
 *   node orchestrator.js shot-list ~/brief.md
 *   node orchestrator.js brief ~/requirements.txt ~/custom-rubric.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SYSTEM_DIR = '/Volumes/T7/NUDIMMUD/_SYSTEM/gan-loop';
const OUTPUT_DIR = '/Volumes/T7/NUDIMMUD/_SYSTEM/gan-loop/outputs';

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const args = process.argv.slice(2);
const contentType = args[0]; // 'shot-list' or 'brief'
const inputFile = args[1];
const rubricFile = args[2];

if (!contentType || !inputFile) {
  console.log(`
Usage: node orchestrator.js <contentType> <inputFile> [rubricFile]

Content Types:
  shot-list    Generate shot list from brief
  brief        Generate client brief from requirements

Examples:
  node orchestrator.js shot-list ~/brief.md
  node orchestrator.js brief ~/requirements.txt ~/custom-rubric.md
  `);
  process.exit(1);
}

async function orchestrateLoop() {
  try {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║         GAN LOOP ORCHESTRATOR                     ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Validate inputs
    if (!fs.existsSync(inputFile)) {
      console.error(`✗ Input file not found: ${inputFile}`);
      process.exit(1);
    }

    const input = fs.readFileSync(inputFile, 'utf8');
    const defaultRubric = `${SYSTEM_DIR}/${contentType}-rubric.md`;
    const rubric = rubricFile || defaultRubric;

    if (!fs.existsSync(rubric)) {
      console.error(`✗ Rubric not found: ${rubric}`);
      process.exit(1);
    }

    const rubricContent = fs.readFileSync(rubric, 'utf8');
    const timestamp = new Date().toISOString().split('T')[0];
    const sessionId = `${contentType}_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

    console.log(`Content Type: ${contentType}`);
    console.log(`Session ID: ${sessionId}\n`);

    let iteration = 1;
    let generatedContent = '';
    let finalScore = 0;
    let shouldContinue = true;

    while (shouldContinue && iteration <= 3) {
      console.log(`\n${'─'.repeat(52)}`);
      console.log(`ITERATION ${iteration}`);
      console.log(`${'─'.repeat(52)}\n`);

      // GENERATOR PHASE
      console.log('[1/2] GENERATOR: Creating content...\n');
      generatedContent = await runGenerator(
        contentType,
        input,
        generatedContent,
        iteration
      );

      saveOutput(sessionId, iteration, 'generated', generatedContent);

      // EVALUATOR PHASE
      console.log('\n[2/2] EVALUATOR: Assessing quality...\n');
      const evaluation = await runEvaluator(
        contentType,
        generatedContent,
        rubricContent,
        iteration
      );

      saveOutput(sessionId, iteration, 'evaluation', evaluation.fullFeedback);

      finalScore = evaluation.score;
      console.log(`\n▶ Score: ${finalScore.toFixed(1)}/10`);

      // Decision
      if (evaluation.gateFailed) {
        console.log('▶ Status: GATE FAILED — Needs major fixes');
        shouldContinue = iteration < 3;
      } else if (finalScore >= 7.0) {
        console.log('▶ Status: PASS — Ready to ship');
        shouldContinue = false;
      } else if (iteration < 3) {
        console.log('▶ Status: ITERATE — Score below 7.0, attempting improvement');
        shouldContinue = true;
      } else {
        console.log('▶ Status: MAX ITERATIONS — Shipping best version');
        shouldContinue = false;
      }

      if (shouldContinue) {
        // Prepare feedback for next iteration
        const generatorFeedback = extractGeneratorFeedback(evaluation.fullFeedback);
        console.log(`\n▶ Feedback for next iteration:\n${generatorFeedback}\n`);

        // Inject feedback into generated content for next iteration
        generatedContent += `\n\n---\n\n## Evaluator Feedback (Iteration ${iteration})\n\n${generatorFeedback}`;
      }

      iteration++;
    }

    // SUMMARY
    console.log(`\n${'═'.repeat(52)}`);
    console.log(`FINAL RESULT`);
    console.log(`═'.repeat(52)\n`);

    console.log(`Content Type: ${contentType}`);
    console.log(`Iterations: ${iteration - 1}`);
    console.log(`Final Score: ${finalScore.toFixed(1)}/10`);
    console.log(`Status: ${finalScore >= 7.0 ? '✓ PASS' : '✗ PASS with caveats (below 7.0)'}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`\nFinal output saved to: ${OUTPUT_DIR}/${sessionId}-final.md\n`);

    // Save final version
    saveFinalOutput(sessionId, generatedContent, finalScore, iteration - 1);

  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    process.exit(1);
  }
}

async function runGenerator(contentType, input, previousOutput, iteration) {
  const generatorPrompt = buildGeneratorPrompt(contentType, input, previousOutput, iteration);

  // In real usage, this would invoke Claude API or spawn subagent
  // For now, return structured request
  console.log('(Would invoke Claude Generator Agent with prompt above)');
  console.log('(Awaiting user approval to run as subagent)\n');

  // Return placeholder for demo
  return `## Generated Content — Iteration ${iteration}\n\n[Claude Generator would create content here based on:\n\n${generatorPrompt.substring(0, 300)}...]\n`;
}

async function runEvaluator(contentType, generatedContent, rubricContent, iteration) {
  const evaluatorPrompt = buildEvaluatorPrompt(contentType, generatedContent, rubricContent, iteration);

  console.log('(Would invoke Claude Evaluator Agent with prompt above)');
  console.log('(Awaiting user approval to run as subagent)\n');

  // Return placeholder for demo
  return {
    score: 7.2 + (iteration * 0.3), // Simulated improvement
    gateFailed: false,
    fullFeedback: `## Evaluation — Iteration ${iteration}\n\n**Score: 7.${iteration}/10**\n\n[Claude Evaluator would assess quality here]`
  };
}

function buildGeneratorPrompt(contentType, input, previousFeedback, iteration) {
  let prompt = '';

  if (iteration === 1) {
    prompt = `You are generating a ${contentType === 'shot-list' ? 'detailed shot list' : 'client brief'}.

Input requirements:
${input}

Generate a complete, specific, ready-to-execute output. Be concrete with timings, equipment, crew needs.`;
  } else {
    prompt = `Improve the previous ${contentType === 'shot-list' ? 'shot list' : 'brief'} based on evaluation feedback.

Previous version:
${previousFeedback.substring(0, 1000)}

Address every point in the evaluator's feedback. Keep what worked well.`;
  }

  return prompt;
}

function buildEvaluatorPrompt(contentType, generatedContent, rubricContent, iteration) {
  return `You are evaluating a ${contentType === 'shot-list' ? 'shot list' : 'brief'}.

RUBRIC:
${rubricContent}

CONTENT TO EVALUATE:
${generatedContent}

Score against the rubric. If any binary gate fails, reject immediately with clear fixes.
If all gates pass, score dimensions and provide weighted final score.

Format feedback exactly as shown in EVALUATOR-SKILL.md template.`;
}

function extractGeneratorFeedback(evaluation) {
  // Parse evaluation and extract "Fixes" section
  const match = evaluation.match(/### (Fixes|Action)[\s\S]*?(?=###|$)/);
  return match ? match[0] : evaluation;
}

function saveOutput(sessionId, iteration, phase, content) {
  const filename = `${OUTPUT_DIR}/${sessionId}-iter${iteration}-${phase}.md`;
  fs.writeFileSync(filename, content);
  console.log(`  Saved: ${filename}`);
}

function saveFinalOutput(sessionId, content, score, iterations) {
  const header = `# Final Output — ${sessionId}

**Score:** ${score.toFixed(1)}/10
**Iterations:** ${iterations}
**Generated:** ${new Date().toISOString()}

---

`;

  const filename = `${OUTPUT_DIR}/${sessionId}-final.md`;
  fs.writeFileSync(filename, header + content);
}

orchestrateLoop();
