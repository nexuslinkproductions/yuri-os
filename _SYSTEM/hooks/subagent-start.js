#!/usr/bin/env node

/**
 * Self-Evolving Hooks: SubAgent Start
 *
 * Loads all learned rules from vault before subagent executes.
 * Prepends rules via <mnemosyne> blocks so agent starts with previous corrections integrated.
 *
 * Triggered: SessionStart
 */

const fs = require('fs');
const path = require('path');

const LEARNING_DIR = '/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/learning';
const CONFIG_PATH = path.join(LEARNING_DIR, 'config.json');

async function loadLearningRules() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.log('[Mnemosyne] Learning system not initialized.');
      return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!config.enabled) {
      return;
    }

    // Load all domain-specific rules
    const rules = {};
    config.domains.forEach((domain) => {
      const rulePath = path.join(LEARNING_DIR, `${domain}.md`);
      if (fs.existsSync(rulePath)) {
        const content = fs.readFileSync(rulePath, 'utf8');
        const rulesSection = content.match(/## Rules\n([\s\S]*?)\n---/);
        if (rulesSection && rulesSection[1].trim()) {
          rules[domain] = rulesSection[1]
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('*'))
            .map(line => line.replace(/^- /, '').trim())
            .filter(line => line.length > 0);
        }
      }
    });

    // Build mnemosyne block
    const hasRules = Object.values(rules).some(arr => arr.length > 0);
    if (hasRules) {
      const mnemosyne = buildMnemosyneBlock(rules);
      console.log(mnemosyne);
    }
  } catch (error) {
    console.error('[Mnemosyne] Error loading rules:', error.message);
  }
}

function buildMnemosyneBlock(rules) {
  let block = '<mnemosyne>\n';
  block += '**System: Previous corrections integrated below.**\n\n';

  Object.entries(rules).forEach(([domain, ruleList]) => {
    if (ruleList.length > 0) {
      block += `**${domain}:**\n`;
      ruleList.slice(0, 10).forEach(rule => {
        block += `- ${rule}\n`;
      });
      block += '\n';
    }
  });

  block += '</mnemosyne>\n';
  return block;
}

loadLearningRules();
