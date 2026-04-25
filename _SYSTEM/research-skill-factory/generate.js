#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RESEARCH_ROOTS = [
  path.join(ROOT, '02_AREAS', 'research-intake'),
  path.join(ROOT, 'RESEARCH'),
];
const DRAFT_ROOT = path.join(ROOT, '02_AREAS', 'skills', 'drafts');
const WATCH = process.argv.includes('--watch');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'archive',
  'archives',
]);

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64) || 'unnamed-artifact';
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return { frontmatter: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const raw = content.slice(4, end).split('\n');
  const frontmatter = {};
  let currentKey = null;

  for (const line of raw) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = [];
      frontmatter[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const pairMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pairMatch) continue;
    const key = pairMatch[1];
    const value = pairMatch[2];

    currentKey = key;
    if (value === '') {
      frontmatter[key] = [];
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        frontmatter[key] = JSON.parse(value.replace(/'/g, '"'));
      } catch {
        frontmatter[key] = toArray(value.slice(1, -1));
      }
      continue;
    }

    frontmatter[key] = parseScalar(value);
  }

  return {
    frontmatter,
    body: content.slice(end + 4).trim(),
  };
}

function walkMarkdownFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(fullPath);
    }
  }

  return out;
}

function summarizeBody(body) {
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'));
  return lines.slice(0, 2).join(' ');
}

function normalizeCandidate(filePath) {
  if (path.basename(filePath) === 'ARTIFACT-CANDIDATE.md') return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const artifactKindRaw = String(frontmatter.artifact_kind || frontmatter.candidate_artifact || frontmatter.kind || '').toLowerCase();
  if (!artifactKindRaw.includes('skill') && !artifactKindRaw.includes('tool')) return null;

  const artifactName = String(frontmatter.artifact_name || frontmatter.title || path.basename(filePath, '.md')).trim();
  const slug = slugify(artifactName);
  const kinds = artifactKindRaw.includes('both')
    ? ['skill', 'tool']
    : artifactKindRaw.split(/[\s,|]+/).map(v => v.trim()).filter(v => v === 'skill' || v === 'tool');

  const evidence = toArray(frontmatter.source_notes || frontmatter.evidence_notes || frontmatter.sources)
    .map(note => String(note).trim())
    .filter(Boolean);

  if (evidence.length === 0) {
    evidence.push(path.relative(ROOT, filePath));
  }

  const confidence = String(frontmatter.confidence || 'medium').toLowerCase();
  const status = String(frontmatter.status || 'draft').toLowerCase();
  const summary = summarizeBody(body);

  return {
    filePath,
    artifactName,
    slug,
    kinds,
    confidence,
    status,
    evidence,
    summary,
    toolInterface: toArray(frontmatter.tool_interface),
    draftRoot: path.join(DRAFT_ROOT, slug),
  };
}

function renderSkill(candidate) {
  const kindText = candidate.kinds.join(' + ');
  const evidenceList = candidate.evidence.map(item => `- ${item}`).join('\n');
  const toolLine = candidate.kinds.includes('tool')
    ? `- Tool scaffold: \`scripts/${candidate.slug}.js\``
    : `- Tool scaffold: none`;

  return `---\nname: ${candidate.slug}\ndescription: Draft ${kindText} generated from research. Use when the research thread is mature, repeated, and reviewed.\n---\n\n# ${candidate.artifactName}\n\n**Status:** ${candidate.status}\n**Confidence:** ${candidate.confidence}\n\n## Purpose\n\n${candidate.summary || 'Document the reusable behavior extracted from the research thread.'}\n\n## Evidence\n\n${evidenceList}\n\n## Workflow\n\n1. Read the evidence notes.\n2. Extract the stable behavior.\n3. Separate instructions from deterministic code.\n4. Keep the artifact narrowly scoped.\n5. Review before promotion into \`.claude/skills/\`.\n\n## Guardrails\n\n- Do not publish weak or contradictory research.\n- Do not bundle unrelated behaviors.\n- Keep the skill focused on one reusable job.\n- Keep the tool scaffold minimal and deterministic.\n\n## Draft Output\n\n- Skill: \`SKILL.md\`\n${toolLine}\n- Manifest: \`manifest.json\`\n`;
}

function renderTool(candidate) {
  const toolName = `${candidate.slug}-tool`;
  return `#!/usr/bin/env node\n\nconst fs = require('fs');\nconst path = require('path');\n\nconst manifestPath = path.join(__dirname, '..', 'manifest.json');\nconst manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));\nconst args = process.argv.slice(2);\n\nif (args.includes('--help') || args.length === 0) {\n  console.log(manifest.tool_help || '${candidate.artifactName} tool scaffold');\n  console.log('Options: --manifest, --help');\n  process.exit(0);\n}\n\nif (args.includes('--manifest')) {\n  console.log(JSON.stringify(manifest, null, 2));\n  process.exit(0);\n}\n\nconsole.log(JSON.stringify({\n  status: 'draft',\n  name: manifest.name,\n  args,\n  evidence: manifest.evidence,\n}, null, 2));\n`;
}

function writeCandidate(candidate) {
  fs.mkdirSync(candidate.draftRoot, { recursive: true });

  const manifest = {
    name: candidate.artifactName,
    slug: candidate.slug,
    status: candidate.status,
    confidence: candidate.confidence,
    kinds: candidate.kinds,
    evidence: candidate.evidence,
    source_note: path.relative(ROOT, candidate.filePath),
    generated_at: new Date().toISOString(),
    tool_help: `${candidate.artifactName} draft tool scaffold`,
  };

  fs.writeFileSync(path.join(candidate.draftRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(candidate.draftRoot, 'SKILL.md'), renderSkill(candidate));

  if (candidate.kinds.includes('tool')) {
    const scriptsDir = path.join(candidate.draftRoot, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const toolPath = path.join(scriptsDir, `${candidate.slug}.js`);
    fs.writeFileSync(toolPath, renderTool(candidate));
    fs.chmodSync(toolPath, 0o755);
  }
}

function scanOnce() {
  const candidates = [];
  for (const root of RESEARCH_ROOTS) {
    for (const filePath of walkMarkdownFiles(root)) {
      const candidate = normalizeCandidate(filePath);
      if (candidate) candidates.push(candidate);
    }
  }

  fs.mkdirSync(DRAFT_ROOT, { recursive: true });

  const seen = new Set();
  const uniqueCandidates = candidates.filter(candidate => {
    const key = `${candidate.slug}:${candidate.kinds.join('+')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const candidate of uniqueCandidates) {
    writeCandidate(candidate);
  }

  console.log(`Generated ${uniqueCandidates.length} draft artifact(s) into ${path.relative(ROOT, DRAFT_ROOT) || DRAFT_ROOT}`);
  for (const candidate of uniqueCandidates) {
    console.log(`- ${candidate.artifactName} → ${path.relative(ROOT, candidate.draftRoot)}`);
  }
}

function watch() {
  scanOnce();
  console.log('\nWatching research roots for changes...\n');

  for (const root of RESEARCH_ROOTS) {
    if (!fs.existsSync(root)) continue;
    fs.watch(root, { recursive: true }, () => {
      try {
        scanOnce();
      } catch (error) {
        console.error(error);
      }
    });
  }
}

if (WATCH) {
  watch();
} else {
  scanOnce();
}
