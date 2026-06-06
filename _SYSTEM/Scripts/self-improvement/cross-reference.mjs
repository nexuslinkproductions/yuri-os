#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildIndex, matchPrefixFilter } from '../corpus-match.mjs';
import { makeFeatureFn } from '../math/yuri-token-expand.mjs';

export const TAXONOMY = {
  framing_failure: {
    label: 'Framing failure',
    group: 'Reasoning',
    description: 'The work answered a different question than the one that mattered.',
    aliases: [
      'wrong question',
      'question mismatch',
      'question drift',
      'misframed',
      'framing failure',
      'wrong market question',
      'resolution source mismatch',
    ],
  },
  source_of_truth_mismatch: {
    label: 'Source of truth mismatch',
    group: 'Evidence',
    description: 'The wrong source was treated as authoritative.',
    aliases: [
      'wrong source of truth',
      'source mismatch',
      'wrong source',
      'bad source',
      'resolution source',
      'reference mismatch',
    ],
  },
  missing_gate: {
    label: 'Missing gate',
    group: 'Decision',
    description: 'A readiness or approval check was skipped or absent.',
    aliases: [
      'approval gate',
      'missing gate',
      'readiness check',
      'manual approval',
      'sign off',
      'sign-off',
      'checklist missing',
    ],
  },
  late_data: {
    label: 'Late data',
    group: 'Signal',
    description: 'The signal arrived too late or was already stale.',
    aliases: [
      'stale data',
      'old data',
      'late data',
      'freshness issue',
      'data too old',
      'stale signal',
    ],
  },
  threshold_mismatch: {
    label: 'Threshold mismatch',
    group: 'Decision',
    description: 'The cutoff, limit, or boundary was chosen poorly.',
    aliases: [
      'threshold mismatch',
      'limit exceeded',
      'cutoff wrong',
      'boundary issue',
      'wrong threshold',
    ],
  },
  scope_mismatch: {
    label: 'Scope mismatch',
    group: 'Scope',
    description: 'The task was too broad, too narrow, or outside the actual scope.',
    aliases: [
      'scope mismatch',
      'out of scope',
      'too broad',
      'too narrow',
      'scope creep',
    ],
  },
  ownership_gap: {
    label: 'Ownership gap',
    group: 'Coordination',
    description: 'Responsibility or handoff was unclear.',
    aliases: [
      'ownership gap',
      'missing owner',
      'unclear owner',
      'handoff gap',
      'routing gap',
      'who owns',
    ],
  },
  calibration_drift: {
    label: 'Calibration drift',
    group: 'Learning',
    description: 'The confidence model, threshold, or estimate drifted away from reality.',
    aliases: [
      'calibration drift',
      'confidence calibration',
      'brier',
      'overconfident',
      'underconfident',
      'miscalibrated',
    ],
  },
  timing_error: {
    label: 'Timing error',
    group: 'Execution',
    description: 'The action happened too early, too late, or with the wrong latency.',
    aliases: [
      'timing error',
      'wrong timing',
      'too early',
      'too late',
      'entry timing',
      'latency issue',
    ],
  },
  tooling_gap: {
    label: 'Tooling gap',
    group: 'Execution',
    description: 'The path, command, or tool was missing or broken.',
    aliases: [
      'tooling gap',
      'missing file',
      'broken command',
      'entrypoint missing',
      'command not found',
      'script missing',
    ],
  },
  state_drift: {
    label: 'State drift',
    group: 'State',
    description: 'The active state diverged from the expected state.',
    aliases: [
      'state drift',
      'out of sync',
      'stale state',
      'desync',
      'state mismatch',
    ],
  },
  implicit_assumption: {
    label: 'Implicit assumption',
    group: 'Reasoning',
    description: 'A hidden assumption was treated as a fact.',
    aliases: [
      'implicit assumption',
      'assumed',
      'assumption',
      'unspoken assumption',
      'without checking',
    ],
  },
};

const CANONICAL_TAGS = Object.keys(TAXONOMY);
const ALIAS_LOOKUP = buildAliasLookup(TAXONOMY);

function buildAliasLookup(taxonomy) {
  const map = new Map();
  for (const [tag, entry] of Object.entries(taxonomy)) {
    map.set(normalizeToken(tag), tag);
    map.set(normalizeToken(entry.label), tag);
    for (const alias of entry.aliases || []) {
      map.set(normalizeToken(alias), tag);
    }
  }
  return map;
}

export function normalizeToken(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePathFragment(value) {
  return normalizeToken(value).replace(/\s+/g, '_');
}

export function walkMarkdownFiles(rootDir, { excludeDirs = ['archive'], skipReadme = true } = {}) {
  if (!existsSync(rootDir)) return [];
  const files = [];

  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (excludeDirs.includes(entry.name)) continue;
        visit(join(dir, entry.name));
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      if (skipReadme && entry.name.toLowerCase() === 'readme.md') continue;
      files.push(join(dir, entry.name));
    }
  }

  visit(rootDir);
  return files;
}

export function deriveLessonDomain(filePath, rootDir) {
  const rel = relative(rootDir, filePath);
  const parts = rel.split(sep).filter(Boolean);
  if (parts.length <= 1) return 'general';
  return normalizePathFragment(parts[0]) || 'general';
}

export function parseLessonMetadata(content) {
  const metadata = {
    domain: null,
    tags: [],
  };

  const lines = String(content ?? '').split('\n');
  let inFrontmatter = false;
  let frontmatterBuffer = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '---' && !inFrontmatter) {
      inFrontmatter = true;
      continue;
    }

    if (inFrontmatter && trimmed === '---') {
      const parsed = parseFrontmatterBlock(frontmatterBuffer);
      if (parsed.domain) metadata.domain = parsed.domain;
      if (parsed.tags.length > 0) metadata.tags.push(...parsed.tags);
      inFrontmatter = false;
      frontmatterBuffer = [];
      continue;
    }

    if (inFrontmatter) {
      frontmatterBuffer.push(line);
      continue;
    }

    const tagMatch = trimmed.match(/^tags?\s*:\s*(.+)$/i);
    if (tagMatch) {
      metadata.tags.push(...splitList(tagMatch[1]));
      continue;
    }

    const domainMatch = trimmed.match(/^domain\s*:\s*(.+)$/i);
    if (domainMatch && !metadata.domain) {
      metadata.domain = normalizePathFragment(domainMatch[1]);
    }
  }

  metadata.tags = [...new Set(metadata.tags.map(tag => resolveCanonicalTag(tag)).filter(Boolean))];
  return metadata;
}

function parseFrontmatterBlock(lines) {
  const out = { domain: null, tags: [] };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const tagMatch = line.match(/^tags?\s*:\s*(.+)$/i);
    if (tagMatch) {
      out.tags.push(...splitList(tagMatch[1]));
      continue;
    }
    const domainMatch = line.match(/^domain\s*:\s*(.+)$/i);
    if (domainMatch && !out.domain) {
      out.domain = normalizePathFragment(domainMatch[1]);
    }
  }
  return out;
}

function splitList(raw) {
  return String(raw)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function resolveCanonicalTag(value) {
  if (!value) return null;
  const normalized = normalizeToken(value);
  if (ALIAS_LOOKUP.has(normalized)) return ALIAS_LOOKUP.get(normalized);

  const underscored = normalizePathFragment(value);
  if (CANONICAL_TAGS.includes(underscored)) return underscored;

  return null;
}

function matchCanonicalTags(text) {
  const normalized = normalizeToken(text);
  const matches = [];

  for (const tag of CANONICAL_TAGS) {
    const aliases = [tag, TAXONOMY[tag].label, ...(TAXONOMY[tag].aliases || [])];
    if (aliases.some(alias => normalized.includes(normalizeToken(alias)))) {
      matches.push(tag);
    }
  }

  return dedupeTags(matches);
}

export function dedupeTags(tags) {
  return [...new Set(tags.filter(Boolean))];
}

export function classifyLesson(lesson) {
  const content = String(lesson?.content ?? '');
  const title = String(lesson?.title ?? '');
  const explicitTags = dedupeTags((lesson?.tags || []).map(resolveCanonicalTag).filter(Boolean));
  const inferredTags = matchCanonicalTags([title, content, lesson?.domain || '', lesson?.path || ''].join('\n'));
  const tags = dedupeTags([...explicitTags, ...inferredTags]);
  const primaryTag = tags[0] || 'implicit_assumption';

  return {
    ...lesson,
    tags,
    primaryTag,
    taxonomy: tags.map(tag => ({
      tag,
      label: TAXONOMY[tag]?.label || tag,
      group: TAXONOMY[tag]?.group || 'General',
      description: TAXONOMY[tag]?.description || '',
    })),
  };
}

export function buildCrossReferenceIndex(lessons, { week = null } = {}) {
  const classified = lessons.map(classifyLesson);
  const similarity = buildSimilarityCrossReference(classified);
  const tagBuckets = {};
  const domainBuckets = {};

  for (const lesson of classified) {
    const domain = lesson.domain || 'general';
    if (!domainBuckets[domain]) {
      domainBuckets[domain] = { domain, lessons: [] };
    }
    domainBuckets[domain].lessons.push(lesson);

    const tags = lesson.tags.length > 0 ? lesson.tags : ['implicit_assumption'];
    for (const tag of tags) {
      if (!tagBuckets[tag]) {
        tagBuckets[tag] = {
          tag,
          label: TAXONOMY[tag]?.label || tag,
          group: TAXONOMY[tag]?.group || 'General',
          description: TAXONOMY[tag]?.description || '',
          lessons: [],
          domains: new Set(),
        };
      }

      tagBuckets[tag].lessons.push(lesson);
      tagBuckets[tag].domains.add(domain);
    }
  }

  const tags = Object.values(tagBuckets)
    .map(bucket => ({
      ...bucket,
      domains: [...bucket.domains].sort(),
      lessons: bucket.lessons
        .map(lesson => ({
          title: lesson.title,
          path: lesson.path,
          archivePath: lesson.archivePath,
          domain: lesson.domain || 'general',
          primaryTag: lesson.primaryTag,
          tags: lesson.tags,
          questions: lesson.questions || [],
          summary: lesson.summary || lesson.title,
          taxonomy: lesson.taxonomy,
        }))
        .sort((a, b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => b.lessons.length - a.lessons.length || a.label.localeCompare(b.label));

  const bridges = tags.filter(bucket => bucket.domains.length > 1);

  return {
    generatedAt: new Date().toISOString(),
    week,
    totalLessons: classified.length,
    totalDomains: Object.keys(domainBuckets).length,
    similarity,
    taxonomy: CANONICAL_TAGS.map(tag => ({
      tag,
      ...TAXONOMY[tag],
    })),
    domains: Object.values(domainBuckets)
      .map(bucket => ({
        domain: bucket.domain,
        lessons: bucket.lessons
          .map(lesson => ({
            title: lesson.title,
            path: lesson.path,
            archivePath: lesson.archivePath,
            primaryTag: lesson.primaryTag,
            tags: lesson.tags,
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain)),
    tags,
    bridges,
  };
}

// ── SIMILARITY cross-reference: wire the COMPLETE prefix-filter matcher over the lesson corpus, so the
// cross-reference math is ACTIVELY USED (not just lexical aliases). Owner-gated wiring, 2026-06-06.
export function buildSimilarityCrossReference(lessons, opts = {}) {
  const threshold = opts.threshold ?? opts.similarityThreshold ?? 0.3;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`buildSimilarityCrossReference threshold must be in (0,1], got ${threshold}`);
  }
  const records = buildSimilarityRecords(lessons);
  const empty = { threshold, mode: 'prefix-filter', complete: true, totalLessons: records.length, relatedById: {}, records };
  if (records.length <= 1) return empty;

  const featureOpts = opts.featureOptions || opts;
  const { featureFn } = makeFeatureFn(records, featureOpts);
  const index = buildIndex(records, { threshold, featureFn, metric: 'jaccard', prefixFilter: true, lsh: false });

  const relatedById = {};
  for (const record of records) {
    const result = matchPrefixFilter(index, record.text, { threshold });
    relatedById[record.id] = result.matches
      .filter((match) => match.id !== record.id)
      .map((match) => {
        const lesson = records.find((item) => item.id === match.id)?.lesson || {};
        return {
          id: match.id, score: match.score, title: lesson.title || match.id, path: lesson.path || null,
          archivePath: lesson.archivePath || null, domain: lesson.domain || 'general',
          primaryTag: lesson.primaryTag || null, tags: lesson.tags || [],
        };
      });
  }
  return { ...empty, complete: true, relatedById };
}

function buildSimilarityRecords(lessons) {
  const seen = new Map();
  return (lessons || []).map((lesson, idx) => {
    const baseId = String(lesson?.path || lesson?.title || `lesson-${idx + 1}`);
    const count = seen.get(baseId) || 0;
    seen.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}#${count + 1}`;
    const title = lesson?.title || '';
    const questions = (lesson?.questions || []).join('\n');
    const summary = lesson?.summary || '';
    const body = lesson?.content || lesson?.body || (lesson?.tokens || []).join(' ');
    return { id, text: [title, questions, summary, body].filter(Boolean).join('\n'), lesson };
  }).filter((record) => record.text.trim().length > 0);
}

export function renderCrossReferenceMarkdown(index) {
  const lines = [
    '# Cross-Reference Index',
    '',
    `Generated: ${index.generatedAt}`,
    index.week ? `Week: ${index.week}` : null,
    `Lessons indexed: ${index.totalLessons}`,
    `Domains indexed: ${index.totalDomains}`,
    '',
    '## Canonical Taxonomy',
  ].filter(Boolean);

  for (const entry of index.taxonomy || []) {
    lines.push(
      '',
      `### ${entry.label}`,
      `- Tag: \`${entry.tag}\``,
      `- Group: ${entry.group}`,
      `- Use when: ${entry.description}`,
      `- Aliases: ${(TAXONOMY[entry.tag]?.aliases || []).join(', ') || 'None'}`,
    );
  }

  lines.push('', '## Cross-Domain Bridges');
  if ((index.bridges || []).length === 0) {
    lines.push('- None yet');
  } else {
    for (const bucket of index.bridges) {
      lines.push(
        '',
        `### ${bucket.label}`,
        `Domains: ${bucket.domains.join(', ')}`,
      );
      for (const lesson of bucket.lessons) {
        lines.push(`- ${lesson.domain}: ${lesson.title} -> ${lesson.archivePath || lesson.path}`);
      }
    }
  }

  lines.push('', `## Related Lessons (similarity >= ${index.similarity?.threshold ?? 0.3}, complete prefix-filter)`);
  const similarityRows = [];
  for (const record of index.similarity?.records || []) {
    const related = index.similarity.relatedById?.[record.id] || [];
    if (related.length > 0) similarityRows.push({ lesson: record.lesson || {}, related });
  }
  if (similarityRows.length === 0) {
    lines.push('- None yet');
  } else {
    for (const row of similarityRows) {
      lines.push('', `### ${row.lesson.title || row.lesson.path || 'Untitled lesson'}`);
      for (const related of row.related) {
        lines.push(`- ${related.score.toFixed(3)} ${related.title} -> ${related.archivePath || related.path || related.id}`);
      }
    }
  }

  lines.push('', '## Domains');
  for (const domain of index.domains || []) {
    lines.push('', `### ${domain.domain}`);
    for (const lesson of domain.lessons) {
      lines.push(`- ${lesson.title} -> ${lesson.archivePath || lesson.path}`);
    }
  }

  return lines.join('\n');
}

export function renderPreventionRulesMarkdown(index) {
  const lessonMap = new Map();
  for (const bucket of index.tags || []) {
    for (const lesson of bucket.lessons) {
      const existing = lessonMap.get(lesson.path) || {
        ...lesson,
        tags: [...(lesson.tags || [])],
        primaryTag: lesson.primaryTag || bucket.tag,
        primaryLabel: bucket.label,
        crossDomains: new Set(bucket.domains || []),
      };

      existing.tags = dedupeTags([...(existing.tags || []), ...(lesson.tags || [])]);
      existing.crossDomains = new Set([...(existing.crossDomains || []), ...(bucket.domains || [])]);
      if (!existing.primaryTag) existing.primaryTag = bucket.tag;
      if (!existing.primaryLabel) existing.primaryLabel = bucket.label;
      if (!existing.summary && lesson.summary) existing.summary = lesson.summary;
      if (!existing.questions || existing.questions.length === 0) existing.questions = lesson.questions || [];
      lessonMap.set(lesson.path, existing);
    }
  }

  const orderedLessons = [...lessonMap.values()].sort((a, b) => {
    const aKey = `${a.primaryTag}:${a.domain}:${a.title}`;
    const bKey = `${b.primaryTag}:${b.domain}:${b.title}`;
    return aKey.localeCompare(bKey);
  });

  const lines = [
    '# Prevention Rules',
    '',
    `Updated: ${index.generatedAt}`,
    '',
  ];

  orderedLessons.forEach((lesson, idx) => {
    const rule = lesson.questions?.[0] || lesson.summary || 'What failure can this prevent next time?';
    const related = index.tags
      .find(bucket => bucket.tag === lesson.primaryTag)
      ?.lessons
      .filter(other => other.path !== lesson.path)
      .slice(0, 3)
      .map(other => `${other.domain}: ${other.title}`)
      .join(' | ');

    lines.push(`## ${idx + 1}. [${lesson.primaryLabel}] ${lesson.title}`);
    lines.push(`- Ask: ${rule}`);
    lines.push(`- Primary tag: \`${lesson.primaryTag}\``);
    lines.push(`- Domain: ${lesson.domain}`);
    lines.push(`- Cross-reference: ${[...lesson.crossDomains].sort().join(', ')}`);
    if (related) {
      lines.push(`- See also: ${related}`);
    }
    lines.push('');
  });

  if (orderedLessons.length === 0) {
    lines.push('- No lessons processed yet.');
  }

  return lines.join('\n');
}

export function extractLessonQuestions(content) {
  return String(content ?? '')
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim().replace(/^-+\s*/, ''))
    .filter(Boolean)
    .slice(0, 8);
}

export function extractLessonTitle(content) {
  const lines = String(content ?? '').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^#\s+(.+)$/);
    if (heading) return heading[1].trim();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '---') continue;
    if (/^(tags?|domain)\s*:\s*/i.test(line)) continue;
    return line.replace(/^-+\s*/, '').trim();
  }

  return '';
}

export function summarizeLesson(content) {
  const lines = String(content ?? '').split('\n');
  let sawTitle = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '---') continue;
    if (/^(tags?|domain)\s*:\s*/i.test(line)) continue;
    if (/^#\s+/.test(line)) {
      sawTitle = true;
      continue;
    }
    if (sawTitle || !line.startsWith('#')) {
      return line.replace(/^-+\s*/, '').trim();
    }
  }

  return extractLessonTitle(content);
}

export { CANONICAL_TAGS };
