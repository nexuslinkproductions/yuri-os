#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  buildCrossReferenceIndex,
  deriveLessonDomain,
  extractLessonQuestions,
  extractLessonTitle,
  parseLessonMetadata,
  renderCrossReferenceMarkdown,
  renderPreventionRulesMarkdown,
  summarizeLesson,
  walkMarkdownFiles,
} from './cross-reference.mjs';

const DEFAULT_ROOT = resolve(process.cwd(), '_SYSTEM/SELF-IMPROVEMENT');
const EXTRACT_DIR = resolve(DEFAULT_ROOT, '02_EXTRACT');
const ENTRIES_DIR = resolve(EXTRACT_DIR, 'entries');
const EXPERIMENTS_DIR = resolve(EXTRACT_DIR, 'experiments');
const CONSOLIDATIONS_DIR = resolve(EXTRACT_DIR, 'consolidations');
const ARCHIVE_DIR = resolve(EXTRACT_DIR, 'archive/raw-lessons');
const RULES_PATH = resolve(EXTRACT_DIR, 'prevention-rules.md');
const CROSS_REF_MD = resolve(EXTRACT_DIR, 'cross-reference-index.md');
const CROSS_REF_JSON = resolve(EXTRACT_DIR, 'cross-reference-index.json');

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function isoWeek(date = new Date()) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function pickWeek(args) {
  const idx = args.indexOf('--week');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return isoWeek();
}

function pickRoot(args) {
  const idx = args.indexOf('--root');
  if (idx !== -1 && args[idx + 1]) return resolve(args[idx + 1]);
  return DEFAULT_ROOT;
}

function pickDryRun(args) {
  return args.includes('--dry-run');
}

function lessonArchivePath(rootDir, week, lesson) {
  const archiveRoot = resolve(rootDir, '02_EXTRACT/archive/raw-lessons');
  return resolve(archiveRoot, week, lesson.domain || 'general', basename(lesson.path));
}

function collectLessons(rootDir, week) {
  const extractDir = resolve(rootDir, '02_EXTRACT');
  const entriesDir = resolve(extractDir, 'entries');
  const experimentsDir = resolve(extractDir, 'experiments');

  const lessonPaths = [
    ...walkMarkdownFiles(entriesDir),
    ...walkMarkdownFiles(experimentsDir),
  ];

  return lessonPaths.map(path => {
    const content = readFileSync(path, 'utf-8');
    const metadata = parseLessonMetadata(content);
    const domain = metadata.domain || deriveLessonDomain(path, entriesDir) || deriveLessonDomain(path, experimentsDir) || 'general';
    const questions = extractLessonQuestions(content);
    const title = extractLessonTitle(content) || basename(path, '.md');
    const summary = summarizeLesson(content);
    const archivePath = lessonArchivePath(rootDir, week, { path, domain });
    return {
      path,
      archivePath,
      content,
      title,
      summary,
      questions,
      domain,
      tags: metadata.tags,
      declaredDomain: metadata.domain,
    };
  });
}

function writeJson(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function consolidateWeek({ rootDir = DEFAULT_ROOT, week = isoWeek(), dryRun = false } = {}) {
  const extractDir = resolve(rootDir, '02_EXTRACT');
  const entriesDir = resolve(extractDir, 'entries');
  const experimentsDir = resolve(extractDir, 'experiments');
  const consolidationsDir = resolve(extractDir, 'consolidations');
  const archiveDir = resolve(extractDir, 'archive/raw-lessons');
  const rulesPath = resolve(extractDir, 'prevention-rules.md');
  const crossRefMd = resolve(extractDir, 'cross-reference-index.md');
  const crossRefJson = resolve(extractDir, 'cross-reference-index.json');
  const digestPath = resolve(consolidationsDir, `${week}-consolidation.md`);

  ensureDir(consolidationsDir);
  ensureDir(archiveDir);

  const lessons = collectLessons(rootDir, week);
  const index = buildCrossReferenceIndex(lessons, { week });
  const digest = renderWeeklyDigest(week, lessons, index);
  const crossRefMarkdown = renderCrossReferenceMarkdown(index);
  const rules = renderPreventionRulesMarkdown(index);

  if (!dryRun) {
    writeFileSync(digestPath, digest, 'utf-8');
    writeFileSync(rulesPath, rules, 'utf-8');
    writeFileSync(crossRefMd, crossRefMarkdown, 'utf-8');
    writeJson(crossRefJson, index);

    for (const lesson of lessons) {
      ensureDir(dirname(lesson.archivePath));
      renameSync(lesson.path, lesson.archivePath);
    }
  }

  return {
    week,
    dryRun,
    rootDir,
    entriesDir,
    experimentsDir,
    digestPath,
    rulesPath,
    crossRefMd,
    crossRefJson,
    archiveDir,
    selected: lessons.map(lesson => lesson.path),
    index,
  };
}

function renderWeeklyDigest(week, lessons, index) {
  const sharedBridges = (index.bridges || []).slice(0, 6);
  const tagLines = sharedBridges.length > 0
    ? sharedBridges.map(bucket => `- ${bucket.label}: ${bucket.domains.join(', ')}`)
    : ['- No cross-domain bridges yet'];

  return [
    `# ${week} Consolidation`,
    '',
    `Lessons processed: ${lessons.length}`,
    `Cross-domain tags: ${(index.tags || []).length}`,
    '',
    '## Selected Lessons',
    ...lessons.map(lesson => `- ${lesson.domain}: ${lesson.title} -> ${lesson.archivePath}`),
    '',
    '## Cross-Domain Bridges',
    ...tagLines,
    '',
    '## Next Rule Set',
    `See \`prevention-rules.md\` and \`cross-reference-index.md\` for the generated rules and alias map.`,
  ].join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = pickDryRun(argv);
  const rootDir = pickRoot(argv);
  const week = pickWeek(argv);
  const result = consolidateWeek({ rootDir, week, dryRun });

  console.log(JSON.stringify({
    ok: true,
    ...result,
    index: {
      ...result.index,
      tags: result.index.tags?.length || 0,
      bridges: result.index.bridges?.length || 0,
    },
  }, null, 2));
}

if (process.argv[1]?.endsWith('weekly-comp.mjs')) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

export {
  DEFAULT_ROOT,
  EXTRACT_DIR,
  ENTRIES_DIR,
  EXPERIMENTS_DIR,
  CONSOLIDATIONS_DIR,
  ARCHIVE_DIR,
  RULES_PATH,
  CROSS_REF_MD,
  CROSS_REF_JSON,
  isoWeek,
  pickRoot,
  pickWeek,
  pickDryRun,
  collectLessons,
  consolidateWeek,
  renderWeeklyDigest,
};
