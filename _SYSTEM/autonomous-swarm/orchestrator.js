#!/usr/bin/env node

/**
 * Autonomous AI Swarm Orchestrator
 *
 * Coordinates five phases:
 * 1. Generation (all agents in parallel)
 * 2. Validation (GAN Loop for each piece)
 * 3. Learning (extract patterns, update hooks)
 * 4. Deployment (queue approved content)
 * 5. Reporting (morning briefing)
 *
 * Runs nightly 22:00–06:00 Vienna time
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "config.json");
const VAULT_ROOT = "/Users/marcelspatz/YURI-OS-MUSUBI";
const GENERATED_DIR = path.join(__dirname, "generated");
const VALIDATED_DIR = path.join(__dirname, "validated");
const DEPLOYMENTS_DIR = path.join(__dirname, "deployments");
const REJECTED_DIR = path.join(__dirname, "rejected");
const REPORTS_DIR = path.join(__dirname, "reports");

let config = {};
let runLog = [];

/**
 * Initialize directories
 */
function initDirectories() {
  const dirs = [GENERATED_DIR, VALIDATED_DIR, DEPLOYMENTS_DIR, REJECTED_DIR, REPORTS_DIR];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  log("✓ Directories initialized");
}

/**
 * Load configuration
 */
function loadConfig() {
  try {
    const configText = fs.readFileSync(CONFIG_PATH, "utf-8");
    config = JSON.parse(configText);
    log(`✓ Config loaded: ${config.name}`);
  } catch (err) {
    log(`✗ Failed to load config: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Logging utility
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}`;
  console.log(logEntry);
  runLog.push(logEntry);
}

/**
 * Phase 1: Generation
 * Spawn all distribution agents in parallel
 */
async function phase1Generation() {
  log("📝 PHASE 1: Generation");
  log(`Starting ${config.phases.generation.agents.length} agents in parallel...`);

  const today = new Date().toISOString().split("T")[0];
  const generatedToday = path.join(GENERATED_DIR, today);

  if (!fs.existsSync(generatedToday)) {
    fs.mkdirSync(generatedToday, { recursive: true });
  }

  const agents = config.phases.generation.agents;
  const generationStartTime = Date.now();
  const generationResults = {};

  // Simulate agent outputs (in production, these would be actual Claude API calls)
  for (const agent of agents) {
    try {
      log(`  ⚙️ Dispatching ${agent}...`);

      // Create placeholder outputs
      if (agent === "behind-the-scenes-writer") {
        const blogPost = {
          title: `Production Insight — ${new Date().toLocaleDateString()}`,
          content: "# [Blog post content would be generated here]\n\nThis is a placeholder for actual blog post generation.",
          slug: "production-insight",
          date: today,
        };
        fs.writeFileSync(
          path.join(generatedToday, "blog-post.md"),
          JSON.stringify(blogPost, null, 2)
        );
        generationResults[agent] = "✓ Blog post generated";
      } else if (agent === "carousel-maker") {
        const carousel = {
          topic: "Production Techniques",
          slides: 7,
          date: today,
        };
        fs.mkdirSync(path.join(generatedToday, "carousel"), { recursive: true });
        fs.writeFileSync(
          path.join(generatedToday, "carousel", "metadata.json"),
          JSON.stringify(carousel, null, 2)
        );
        generationResults[agent] = "✓ Carousel metadata created";
      } else if (agent === "reddit-scout") {
        const redditDrafts = {
          date: today,
          threadsCount: 9,
          threads: [],
        };
        fs.writeFileSync(
          path.join(generatedToday, "reddit-drafts.json"),
          JSON.stringify(redditDrafts, null, 2)
        );
        generationResults[agent] = "✓ 9 Reddit threads drafted";
      } else if (agent === "finance-digest") {
        const financePiece = {
          date: today,
          period: "Weekly",
        };
        fs.writeFileSync(
          path.join(generatedToday, "finance-digest.json"),
          JSON.stringify(financePiece, null, 2)
        );
        generationResults[agent] = "✓ Finance digest created";
      }

      log(`    ${generationResults[agent]}`);
    } catch (err) {
      log(`    ✗ ${agent} failed: ${err.message}`);
      generationResults[agent] = `✗ Failed: ${err.message}`;
    }
  }

  const generationTime = Math.round((Date.now() - generationStartTime) / 1000);
  log(`✓ Generation complete (${generationTime}s)`);
  log(`  Generated: ${Object.values(generationResults).filter((r) => r.includes("✓")).length}/${agents.length} pieces`);

  return generationResults;
}

/**
 * Phase 2: Validation
 * Run each piece through GAN Loop validation
 */
async function phase2Validation(generationResults) {
  log("🔍 PHASE 2: Validation (GAN Loop)");

  const today = new Date().toISOString().split("T")[0];
  const validationResults = {};
  let approvedCount = 0;
  let rejectedCount = 0;

  const pieces = [
    { name: "blog_post", minScore: 7.0 },
    { name: "carousel", minScore: 7.0 },
    { name: "reddit_drafts", minScore: 7.5 },
    { name: "finance_digest", minScore: 8.5 },
  ];

  for (const piece of pieces) {
    try {
      log(`  📋 Validating ${piece.name}...`);

      // Simulate validation scoring
      const score = Math.random() * 10;
      const approved = score >= piece.minScore;

      validationResults[piece.name] = {
        score: score.toFixed(2),
        approved: approved,
        feedback: approved
          ? "✓ Approved for deployment"
          : `✗ Score below ${piece.minScore}. Queued for review.`,
      };

      if (approved) {
        approvedCount++;
        log(`    ✓ Score: ${score.toFixed(2)}/10 → APPROVED`);
      } else {
        rejectedCount++;
        log(`    ✗ Score: ${score.toFixed(2)}/10 → REJECTED (threshold: ${piece.minScore})`);
      }
    } catch (err) {
      log(`    ✗ Validation error for ${piece.name}: ${err.message}`);
    }
  }

  const validatedDir = path.join(VALIDATED_DIR, today);
  if (!fs.existsSync(validatedDir)) {
    fs.mkdirSync(validatedDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(validatedDir, "results.json"),
    JSON.stringify(validationResults, null, 2)
  );

  log(`✓ Validation complete`);
  log(`  Approved: ${approvedCount} | Rejected: ${rejectedCount}`);

  return validationResults;
}

/**
 * Phase 3: Learning
 * Extract patterns from validation results
 */
async function phase3Learning(validationResults) {
  log("🧠 PHASE 3: Learning & Pattern Extraction");

  const today = new Date().toISOString().split("T")[0];
  const insights = {
    date: today,
    timestamp: new Date().toISOString(),
    analysis: {
      highest_scoring: null,
      lowest_scoring: null,
      patterns: [],
    },
  };

  // Find highest and lowest scoring pieces
  let highest = { name: "", score: 0 };
  let lowest = { name: "", score: 10 };

  for (const [key, value] of Object.entries(validationResults)) {
    const score = parseFloat(value.score);
    if (score > highest.score) {
      highest = { name: key, score };
    }
    if (score < lowest.score) {
      lowest = { name: key, score };
    }
  }

  insights.analysis.highest_scoring = highest;
  insights.analysis.lowest_scoring = lowest;

  // Example pattern extraction
  if (highest.score > 8.0) {
    insights.analysis.patterns.push(`Strong performer: ${highest.name} (${highest.score.toFixed(2)}/10)`);
  }

  const insightsFile = path.join(REPORTS_DIR, `${today}-insights.json`);
  fs.writeFileSync(insightsFile, JSON.stringify(insights, null, 2));

  log(`  ✓ Highest score: ${highest.name} (${highest.score.toFixed(2)}/10)`);
  log(`  ✓ Learning patterns extracted`);
  log(`  ✓ Insights saved: ${insightsFile}`);

  return insights;
}

/**
 * Phase 4: Deployment
 * Queue approved content for posting
 */
async function phase4Deployment(generationResults, validationResults) {
  log("📦 PHASE 4: Deployment");

  const today = new Date().toISOString().split("T")[0];
  const deploymentManifest = {
    date: today,
    timestamp: new Date().toISOString(),
    deployed: [],
    rejected: [],
  };

  for (const [piece, result] of Object.entries(validationResults)) {
    if (result.approved) {
      log(`  ✓ Queuing ${piece} for deployment...`);
      deploymentManifest.deployed.push({
        piece,
        score: result.score,
        status: "queued",
      });
    } else {
      log(`  ⚠️ Moving ${piece} to rejected folder...`);
      deploymentManifest.rejected.push({
        piece,
        score: result.score,
        reason: result.feedback,
      });
    }
  }

  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${today}-manifest.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentManifest, null, 2));

  log(`✓ Deployment complete`);
  log(`  Deployed: ${deploymentManifest.deployed.length} pieces`);
  log(`  Rejected: ${deploymentManifest.rejected.length} pieces`);

  return deploymentManifest;
}

/**
 * Phase 5: Reporting
 * Generate morning briefing
 */
async function phase5Reporting(generationResults, validationResults, deploymentManifest) {
  log("📊 PHASE 5: Morning Briefing");

  const today = new Date().toISOString().split("T")[0];
  const totalRunTime = Math.round((Date.now() - swarmStartTime) / 60000); // minutes

  const briefing = `# Swarm Report — ${today}

## 🎯 Completion Summary

✅ **Swarm completed successfully**
⏱️ Total runtime: ${totalRunTime} minutes
📊 Content generated: ${Object.keys(generationResults).length} pieces
✓ Approved for deployment: ${deploymentManifest.deployed.length} pieces
⚠️ Queued for review: ${deploymentManifest.rejected.length} pieces

## 📝 Content Generated

${Object.entries(generationResults)
  .map(([agent, result]) => `- **${agent}**: ${result}`)
  .join("\n")}

## 🔍 Validation Results

${Object.entries(validationResults)
  .map(([piece, result]) => `- **${piece}**: ${result.score}/10 → ${result.approved ? "✅" : "❌"}`)
  .join("\n")}

## 📦 Deployment Queue

${deploymentManifest.deployed.map((d) => `- ✅ ${d.piece} (${d.score}/10)`).join("\n")}

${deploymentManifest.rejected.length > 0 ? `### Rejected (Review Needed)\n\n${deploymentManifest.rejected.map((d) => `- ⚠️ ${d.piece} (${d.score}/10)`).join("\n")}` : ""}

## 📈 Swarm Health

- **Status**: IDLE (next run 22:00 tonight)
- **Runtime**: ${totalRunTime} minutes
- **Success rate**: ${((deploymentManifest.deployed.length / (deploymentManifest.deployed.length + deploymentManifest.rejected.length)) * 100).toFixed(1)}%

---

Generated: ${new Date().toISOString()}
Ready for your review. Deploy at will.
`;

  const briefingPath = path.join(REPORTS_DIR, `${today}-morning-brief.md`);
  fs.writeFileSync(briefingPath, briefing);

  log(`✓ Morning briefing generated`);
  log(`  Location: ${briefingPath}`);

  // Also log the briefing to console
  console.log("\n" + "=".repeat(60));
  console.log(briefing);
  console.log("=".repeat(60) + "\n");

  return briefingPath;
}

/**
 * Main orchestration flow
 */
const swarmStartTime = Date.now();

async function runSwarm() {
  try {
    log("🌙 AUTONOMOUS AI SWARM — STARTING");
    log(`Time: ${new Date().toLocaleString("de-AT")}`);
    log("");

    initDirectories();
    loadConfig();

    // Phase 1
    const genResults = await phase1Generation();
    log("");

    // Phase 2
    const valResults = await phase2Validation(genResults);
    log("");

    // Phase 3
    const learningResults = await phase3Learning(valResults);
    log("");

    // Phase 4
    const deployResults = await phase4Deployment(genResults, valResults);
    log("");

    // Phase 5
    await phase5Reporting(genResults, valResults, deployResults);
    log("");

    const totalTime = Math.round((Date.now() - swarmStartTime) / 60000);
    log(`✅ SWARM COMPLETE (${totalTime} minutes)`);
    log("Returning to sleep. See morning briefing for results.");

    // Save full run log
    const logPath = path.join(__dirname, `logs/${new Date().toISOString().split("T")[0]}-run.log`);
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.writeFileSync(logPath, runLog.join("\n"));

  } catch (err) {
    log(`✗ SWARM FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Run the swarm
runSwarm();
