import { Database } from 'better-sqlite3';
import { memoryGovernor } from './memoryGovernorService';

export type SessionOutcome = 'pending' | 'improved' | 'stable' | 'mixed' | 'regressed';
export type LessonCandidateStatus = 'pending' | 'approved' | 'rejected' | 'promoted';
export type LessonReviewAction = 'approve' | 'reject' | 'revise';

export interface SessionImprovementStartInput {
    sessionId: string;
    command: string;
    commandType: string;
    voiceMode?: string;
    topicTags?: string[];
    goal?: string;
    metadata?: Record<string, unknown>;
}

export interface SessionImprovementFinalizeInput {
    sessionId: string;
    outcome?: SessionOutcome;
    whatHappened?: string;
    corrections?: number;
    rework?: number;
    autoScore?: number;
    humanScore?: number | null;
    whatGotBetter?: string;
    whatGotWorse?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
    reviewedAt?: string | null;
}

export interface SessionImprovementRow {
    id: number;
    session_id: string;
    goal: string | null;
    command: string;
    command_type: string;
    voice_mode: string;
    topic_tags: string;
    what_happened: string | null;
    corrections: number;
    rework: number;
    outcome: SessionOutcome;
    auto_score: number;
    human_score: number | null;
    improvement_score: number;
    what_got_better: string | null;
    what_got_worse: string | null;
    notes: string | null;
    metadata: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionImprovementSummary {
    totalSessions: number;
    reviewedSessions: number;
    pendingReviewSessions: number;
    averageAutoScore: number;
    averageImprovementScore: number;
    recentSessions: Array<{
        sessionId: string;
        outcome: SessionOutcome;
        autoScore: number;
        improvementScore: number;
        reviewedAt: string | null;
    }>;
    reviewQueue: Array<{
        sessionId: string;
        command: string;
        outcome: SessionOutcome;
        autoScore: number;
    }>;
    trends: {
        sevenDayAverage: number;
        thirtyDayAverage: number;
        staleReviewAgeHours: number | null;
    };
    pendingLessonCandidates: LessonCandidateRow[];
    promotedLessons: PromotedLessonRow[];
    regressionCandidates: RegressionTrendRow[];
}

export interface LessonCandidateRow {
    id: number;
    source_session_id: string;
    lesson_key: string;
    lesson_type: string;
    lesson_text: string;
    topic_tags: string;
    evidence_count: number;
    confidence_score: number;
    source_outcome: SessionOutcome;
    source_score: number;
    status: LessonCandidateStatus;
    reviewer_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PromotedLessonRow {
    id: number;
    lesson_key: string;
    lesson_text: string;
    topic_tags: string;
    evidence_count: number;
    promotion_score: number;
    memory_item_id: number | null;
    status: 'active' | 'revoked';
    promoted_at: string;
    updated_at: string;
}

export interface RegressionTrendRow {
    id: number;
    trend_key: string;
    topic_tag: string;
    regression_count: number;
    score_drop: number;
    status: 'active' | 'resolved';
    last_seen_at: string;
    created_at: string;
    updated_at: string;
}

type LessonMemoryWriter = (input: {
    content: string;
    memoryType: string;
    sourceAgent: string;
    sourceUri: string;
    sourceKind: string;
    tags: string[];
    importance: number;
    metadata: Record<string, unknown>;
}) => number | null;

let lessonMemoryWriter: LessonMemoryWriter = (input) => memoryGovernor.governWrite(input);

export function setLessonMemoryWriterForTests(writer: LessonMemoryWriter): () => void {
    const previous = lessonMemoryWriter;
    lessonMemoryWriter = writer;
    return () => {
        lessonMemoryWriter = previous;
    };
}

function clamp(value: number, min = 0, max = 100): number {
    return Math.min(max, Math.max(min, value));
}

function toJson(value?: Record<string, unknown>): string | null {
    if (!value) return null;
    return JSON.stringify(value);
}

function parseTopicTags(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((tag) => String(tag)) : [];
    } catch {
        return [];
    }
}

function normalizeLessonKey(text: string, tags: string[]): string {
    const normalizedText = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
    const normalizedTags = tags.map((tag) => tag.toLowerCase()).sort().join(',');
    return `${normalizedText}|${normalizedTags}`;
}

function parseJsonArray(raw: string | null): string[] {
    return parseTopicTags(raw);
}

function uniqueTags(tags: string[]): string[] {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
}

function firstMeaningfulLine(value?: string | null): string | null {
    if (!value) return null;
    const line = value
        .split(/\n+/)
        .map((part) => part.trim())
        .find((part) => part.length >= 8);
    return line ? line.slice(0, 800) : null;
}

function deriveOutcome(autoScore: number, humanScore: number | null | undefined, corrections: number, rework: number): SessionOutcome {
    const basis = humanScore != null ? clamp((autoScore * 0.7) + (humanScore * 20 * 0.3)) : autoScore;
    const penalty = Math.min(20, (corrections * 4) + (rework * 5));
    const score = clamp(basis - penalty);

    if (score >= 75) return 'improved';
    if (score >= 55) return 'stable';
    if (score >= 40) return 'mixed';
    return 'regressed';
}

export function deriveAutoScore(input: {
    status: string;
    confidenceBand?: string;
    loopCount?: number;
    escalated?: boolean;
    corrections?: number;
    rework?: number;
}): number {
    let score = 55;

    if (input.status === 'CONCLAVE_SUCCESS') score += 20;
    else if (input.status === 'FORGE_DEGRADED') score += 5;
    else if (input.status === 'CONCLAVE_TIMEOUT') score -= 10;
    else score -= 15;

    switch ((input.confidenceBand || '').toUpperCase()) {
        case 'HIGH':
            score += 15;
            break;
        case 'MEDIUM':
            score += 8;
            break;
        case 'GUARDED':
            score += 2;
            break;
        case 'LOW':
            score -= 8;
            break;
    }

    if (input.escalated) score -= 8;
    if ((input.loopCount || 1) > 1) score -= Math.min(20, ((input.loopCount || 1) - 1) * 6);
    if ((input.corrections || 0) > 0) score -= Math.min(20, (input.corrections || 0) * 4);
    if ((input.rework || 0) > 0) score -= Math.min(20, (input.rework || 0) * 5);

    return clamp(Math.round(score));
}

export function ensureSessionImprovementLog(db: Database) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS session_improvement_log (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id          TEXT NOT NULL UNIQUE,
            goal                TEXT,
            command             TEXT NOT NULL,
            command_type        TEXT NOT NULL,
            voice_mode          TEXT DEFAULT 'deadpool-annunaki',
            topic_tags          TEXT NOT NULL DEFAULT '[]',
            what_happened       TEXT,
            corrections         INTEGER DEFAULT 0,
            rework              INTEGER DEFAULT 0,
            outcome             TEXT DEFAULT 'pending',
            auto_score          REAL DEFAULT 0,
            human_score         INTEGER,
            improvement_score   REAL DEFAULT 0,
            what_got_better     TEXT,
            what_got_worse      TEXT,
            notes               TEXT,
            metadata            TEXT,
            reviewed_at         TEXT,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_session_improvement_created_at ON session_improvement_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_session_improvement_outcome ON session_improvement_log(outcome);
        CREATE INDEX IF NOT EXISTS idx_session_improvement_reviewed_at ON session_improvement_log(reviewed_at);

        CREATE TABLE IF NOT EXISTS session_lesson_candidates (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            source_session_id   TEXT NOT NULL,
            lesson_key          TEXT NOT NULL,
            lesson_type         TEXT NOT NULL,
            lesson_text         TEXT NOT NULL,
            topic_tags          TEXT NOT NULL DEFAULT '[]',
            evidence_count      INTEGER NOT NULL DEFAULT 1,
            confidence_score    REAL NOT NULL DEFAULT 0,
            source_outcome      TEXT NOT NULL,
            source_score        REAL NOT NULL DEFAULT 0,
            status              TEXT NOT NULL DEFAULT 'pending',
            reviewer_notes      TEXT,
            reviewed_at         TEXT,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now')),
            UNIQUE(source_session_id, lesson_key, lesson_type)
        );
        CREATE INDEX IF NOT EXISTS idx_lesson_candidates_key ON session_lesson_candidates(lesson_key);
        CREATE INDEX IF NOT EXISTS idx_lesson_candidates_status ON session_lesson_candidates(status);
        CREATE INDEX IF NOT EXISTS idx_lesson_candidates_session ON session_lesson_candidates(source_session_id);

        CREATE TABLE IF NOT EXISTS promoted_lessons (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_key          TEXT NOT NULL UNIQUE,
            lesson_text         TEXT NOT NULL,
            topic_tags          TEXT NOT NULL DEFAULT '[]',
            evidence_count      INTEGER NOT NULL DEFAULT 0,
            promotion_score     REAL NOT NULL DEFAULT 0,
            memory_item_id      INTEGER,
            status              TEXT NOT NULL DEFAULT 'active',
            promoted_at         TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_promoted_lessons_status ON promoted_lessons(status);

        CREATE TABLE IF NOT EXISTS session_regression_trends (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            trend_key           TEXT NOT NULL UNIQUE,
            topic_tag           TEXT NOT NULL,
            regression_count    INTEGER NOT NULL DEFAULT 0,
            score_drop          REAL NOT NULL DEFAULT 0,
            status              TEXT NOT NULL DEFAULT 'active',
            last_seen_at        TEXT NOT NULL,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_regression_trends_status ON session_regression_trends(status);
    `);
}

export function startSessionImprovement(db: Database, input: SessionImprovementStartInput): void {
    ensureSessionImprovementLog(db);
    db.prepare(`
        INSERT OR REPLACE INTO session_improvement_log (
            session_id,
            goal,
            command,
            command_type,
            voice_mode,
            topic_tags,
            metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        input.sessionId,
        input.goal || null,
        input.command,
        input.commandType,
        input.voiceMode || 'deadpool-annunaki',
        JSON.stringify(input.topicTags || []),
        toJson(input.metadata)
    );
}

export function finalizeSessionImprovement(db: Database, input: SessionImprovementFinalizeInput): SessionImprovementRow | null {
    ensureSessionImprovementLog(db);
    const row = db.prepare('SELECT * FROM session_improvement_log WHERE session_id = ?').get(input.sessionId) as SessionImprovementRow | undefined;
    if (!row) return null;

    const corrections = input.corrections ?? row.corrections ?? 0;
    const rework = input.rework ?? row.rework ?? 0;
    const humanScore = input.humanScore ?? row.human_score ?? null;
    const autoScore = input.autoScore ?? row.auto_score ?? 0;
    const outcome = input.outcome || deriveOutcome(autoScore, humanScore, corrections, rework);
    const improvementScore = humanScore != null
        ? clamp(Math.round((autoScore * 0.7) + (humanScore * 20 * 0.3)))
        : clamp(Math.round(autoScore - Math.min(20, corrections * 4 + rework * 5)));

    db.prepare(`
        UPDATE session_improvement_log
        SET what_happened = COALESCE(?, what_happened),
            corrections = ?,
            rework = ?,
            outcome = ?,
            auto_score = ?,
            human_score = ?,
            improvement_score = ?,
            what_got_better = COALESCE(?, what_got_better),
            what_got_worse = COALESCE(?, what_got_worse),
            notes = COALESCE(?, notes),
            reviewed_at = COALESCE(?, reviewed_at),
            metadata = COALESCE(?, metadata),
            updated_at = datetime('now')
        WHERE session_id = ?
    `).run(
        input.whatHappened || null,
        corrections,
        rework,
        outcome,
        clamp(Math.round(autoScore)),
        humanScore,
        improvementScore,
        input.whatGotBetter || null,
        input.whatGotWorse || null,
        input.notes || null,
        input.reviewedAt || null,
        toJson(input.metadata),
        input.sessionId
    );

    const updated = db.prepare('SELECT * FROM session_improvement_log WHERE session_id = ?').get(input.sessionId) as SessionImprovementRow | null;
    if (updated) {
        refreshLearningLoop(db, updated);
    }
    return updated;
}

export function recordSessionReview(
    db: Database,
    sessionId: string,
    humanScore: number,
    notes?: string
): SessionImprovementRow | null {
    const row = db.prepare('SELECT * FROM session_improvement_log WHERE session_id = ?').get(sessionId) as SessionImprovementRow | undefined;
    if (!row) return null;

    const updated = finalizeSessionImprovement(db, {
        sessionId,
        humanScore,
        notes,
        reviewedAt: new Date().toISOString(),
        outcome: deriveOutcome(row.auto_score, humanScore, row.corrections, row.rework)
    });

    if (updated) {
        refreshLearningLoop(db, updated);
    }

    return updated;
}

export function getSessionImprovementSummary(db: Database, limit = 10): SessionImprovementSummary {
    ensureSessionImprovementLog(db);
    const rows = db.prepare('SELECT * FROM session_improvement_log ORDER BY created_at DESC LIMIT ?').all(limit) as SessionImprovementRow[];
    const totalRow = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed,
            AVG(auto_score) AS avg_auto,
            AVG(improvement_score) AS avg_improvement,
            SUM(CASE WHEN reviewed_at IS NULL THEN 1 ELSE 0 END) AS pending_review
        FROM session_improvement_log
    `).get() as {
        total: number;
        reviewed: number;
        avg_auto: number | null;
        avg_improvement: number | null;
        pending_review: number;
    };

    const reviewQueueRows = db.prepare(`
        SELECT session_id, command, outcome, auto_score
        FROM session_improvement_log
        WHERE reviewed_at IS NULL
        ORDER BY auto_score DESC, created_at ASC
        LIMIT ?
    `).all(limit) as Array<{ session_id: string; command: string; outcome: SessionOutcome; auto_score: number }>;

    const trendsRow = db.prepare(`
        SELECT
            AVG(CASE WHEN created_at >= datetime('now', '-7 days') THEN improvement_score END) AS avg_7,
            AVG(CASE WHEN created_at >= datetime('now', '-30 days') THEN improvement_score END) AS avg_30
        FROM session_improvement_log
    `).get() as { avg_7: number | null; avg_30: number | null };

    const staleReviewRow = db.prepare(`
        SELECT MAX((julianday('now') - julianday(created_at)) * 24) AS age_hours
        FROM session_improvement_log
        WHERE reviewed_at IS NULL
    `).get() as { age_hours: number | null };

    const pendingLessonCandidates = db.prepare(`
        SELECT * FROM session_lesson_candidates
        WHERE status = 'pending'
        ORDER BY confidence_score DESC, created_at DESC
        LIMIT ?
    `).all(limit) as LessonCandidateRow[];

    const promotedLessons = db.prepare(`
        SELECT * FROM promoted_lessons
        WHERE status = 'active'
        ORDER BY promoted_at DESC
        LIMIT ?
    `).all(limit) as PromotedLessonRow[];

    const regressionCandidates = db.prepare(`
        SELECT * FROM session_regression_trends
        WHERE status = 'active'
        ORDER BY last_seen_at DESC
        LIMIT ?
    `).all(limit) as RegressionTrendRow[];

    return {
        totalSessions: totalRow.total || 0,
        reviewedSessions: totalRow.reviewed || 0,
        pendingReviewSessions: totalRow.pending_review || 0,
        averageAutoScore: totalRow.avg_auto == null ? 0 : Math.round(totalRow.avg_auto),
        averageImprovementScore: totalRow.avg_improvement == null ? 0 : Math.round(totalRow.avg_improvement),
        recentSessions: rows.map((row) => ({
            sessionId: row.session_id,
            outcome: row.outcome,
            autoScore: row.auto_score,
            improvementScore: row.improvement_score,
            reviewedAt: row.reviewed_at
        })),
        reviewQueue: reviewQueueRows.map((row) => ({
            sessionId: row.session_id,
            command: row.command,
            outcome: row.outcome,
            autoScore: row.auto_score
        })),
        trends: {
            sevenDayAverage: trendsRow.avg_7 == null ? 0 : Math.round(trendsRow.avg_7),
            thirtyDayAverage: trendsRow.avg_30 == null ? 0 : Math.round(trendsRow.avg_30),
            staleReviewAgeHours: staleReviewRow.age_hours == null ? null : Math.round(staleReviewRow.age_hours)
        },
        pendingLessonCandidates,
        promotedLessons,
        regressionCandidates
    };
}

export function getSessionImprovementById(db: Database, sessionId: string): SessionImprovementRow | null {
    ensureSessionImprovementLog(db);
    return db.prepare('SELECT * FROM session_improvement_log WHERE session_id = ?').get(sessionId) as SessionImprovementRow | null;
}

export function getSessionImprovementTags(row: SessionImprovementRow | null): string[] {
    if (!row) return [];
    return parseTopicTags(row.topic_tags);
}

export function reviewLessonCandidate(
    db: Database,
    candidateId: number,
    action: LessonReviewAction,
    revisedText?: string,
    reviewerNotes?: string
): LessonCandidateRow | null {
    ensureSessionImprovementLog(db);
    const existing = db.prepare('SELECT * FROM session_lesson_candidates WHERE id = ?').get(candidateId) as LessonCandidateRow | undefined;
    if (!existing) return null;

    const tags = parseJsonArray(existing.topic_tags);
    const lessonText = action === 'revise' && revisedText?.trim()
        ? revisedText.trim()
        : existing.lesson_text;
    const status: LessonCandidateStatus = action === 'reject' ? 'rejected' : 'approved';
    const lessonKey = normalizeLessonKey(lessonText, tags);

    db.prepare(`
        UPDATE session_lesson_candidates
        SET lesson_text = ?,
            lesson_key = ?,
            status = ?,
            reviewer_notes = ?,
            reviewed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(lessonText, lessonKey, status, reviewerNotes || null, candidateId);

    const updated = db.prepare('SELECT * FROM session_lesson_candidates WHERE id = ?').get(candidateId) as LessonCandidateRow;
    if (status === 'approved') {
        evaluatePromotionForCandidate(db, updated);
    }
    return updated;
}

export function promoteReviewedLessons(db: Database): PromotedLessonRow[] {
    ensureSessionImprovementLog(db);
    const approved = db.prepare(`
        SELECT * FROM session_lesson_candidates
        WHERE status = 'approved'
        ORDER BY reviewed_at ASC
    `).all() as LessonCandidateRow[];

    const promoted: PromotedLessonRow[] = [];
    for (const candidate of approved) {
        const result = evaluatePromotionForCandidate(db, candidate);
        if (result) promoted.push(result);
    }
    return promoted;
}

function refreshLearningLoop(db: Database, row: SessionImprovementRow): void {
    ensureSessionImprovementLog(db);
    createLessonCandidates(db, row);
    refreshRegressionTrends(db, parseJsonArray(row.topic_tags));
    if (row.reviewed_at) {
        promoteReviewedLessons(db);
    }
}

function createLessonCandidates(db: Database, row: SessionImprovementRow): void {
    const tags = uniqueTags(parseJsonArray(row.topic_tags));
    const evidence: Array<{ type: string; text: string; confidence: number }> = [];

    const better = firstMeaningfulLine(row.what_got_better);
    if (better) evidence.push({ type: 'win', text: better, confidence: row.improvement_score / 100 });

    const worse = firstMeaningfulLine(row.what_got_worse);
    if (worse) evidence.push({ type: 'regression', text: worse, confidence: Math.max(0.35, (100 - row.improvement_score) / 100) });

    const notes = firstMeaningfulLine(row.notes);
    if (notes) evidence.push({ type: row.outcome === 'regressed' ? 'regression' : 'observation', text: notes, confidence: Math.max(0.4, row.improvement_score / 100) });

    if (row.corrections > 0 || row.rework > 0) {
        evidence.push({
            type: 'regression',
            text: `Reduce repeated correction/rework pattern for ${tags.join(', ') || row.command_type}.`,
            confidence: Math.min(0.9, 0.45 + (row.corrections * 0.08) + (row.rework * 0.1))
        });
    }

    const insert = db.prepare(`
        INSERT INTO session_lesson_candidates (
            source_session_id, lesson_key, lesson_type, lesson_text, topic_tags,
            confidence_score, source_outcome, source_score, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT(source_session_id, lesson_key, lesson_type) DO UPDATE SET
            evidence_count = evidence_count + 1,
            confidence_score = MAX(confidence_score, excluded.confidence_score),
            source_score = excluded.source_score,
            updated_at = datetime('now')
    `);

    for (const item of evidence) {
        const key = normalizeLessonKey(item.text, tags);
        insert.run(
            row.session_id,
            key,
            item.type,
            item.text,
            JSON.stringify(tags),
            clamp(Math.round(item.confidence * 100), 0, 100),
            row.outcome,
            row.improvement_score
        );
    }
}

function refreshRegressionTrends(db: Database, touchedTags: string[]): void {
    const tags = uniqueTags(touchedTags);
    for (const tag of tags) {
        const recent = db.prepare(`
            SELECT COUNT(*) AS count, AVG(improvement_score) AS avg_score, MAX(updated_at) AS last_seen
            FROM session_improvement_log
            WHERE reviewed_at IS NOT NULL
              AND created_at >= datetime('now', '-7 days')
              AND topic_tags LIKE ?
              AND outcome = 'regressed'
        `).get(`%"${tag}"%`) as { count: number; avg_score: number | null; last_seen: string | null };

        const averages = db.prepare(`
            SELECT
                AVG(CASE WHEN created_at >= datetime('now', '-7 days') THEN improvement_score END) AS avg_7,
                AVG(CASE WHEN created_at < datetime('now', '-7 days') AND created_at >= datetime('now', '-30 days') THEN improvement_score END) AS avg_prev
            FROM session_improvement_log
            WHERE reviewed_at IS NOT NULL
              AND topic_tags LIKE ?
        `).get(`%"${tag}"%`) as { avg_7: number | null; avg_prev: number | null };

        const scoreDrop = averages.avg_prev != null && averages.avg_7 != null
            ? Math.max(0, averages.avg_prev - averages.avg_7)
            : 0;

        if ((recent.count || 0) >= 2 || scoreDrop >= 15) {
            db.prepare(`
                INSERT INTO session_regression_trends (
                    trend_key, topic_tag, regression_count, score_drop, status, last_seen_at
                ) VALUES (?, ?, ?, ?, 'active', COALESCE(?, datetime('now')))
                ON CONFLICT(trend_key) DO UPDATE SET
                    regression_count = excluded.regression_count,
                    score_drop = excluded.score_drop,
                    status = 'active',
                    last_seen_at = excluded.last_seen_at,
                    updated_at = datetime('now')
            `).run(`tag:${tag}`, tag, recent.count || 0, Math.round(scoreDrop), recent.last_seen);
        }
    }
}

function evaluatePromotionForCandidate(db: Database, candidate: LessonCandidateRow): PromotedLessonRow | null {
    if (candidate.status !== 'approved') return null;
    const tags = parseJsonArray(candidate.topic_tags);

    for (const tag of tags) {
        const activeRegression = db.prepare(`
            SELECT id FROM session_regression_trends
            WHERE status = 'active' AND topic_tag = ?
            LIMIT 1
        `).get(tag);
        if (activeRegression) return null;
    }

    const evidence = db.prepare(`
        SELECT c.*, s.improvement_score, s.session_id
        FROM session_lesson_candidates c
        JOIN session_improvement_log s ON s.session_id = c.source_session_id
        WHERE c.lesson_key = ?
          AND c.status = 'approved'
          AND c.created_at >= datetime('now', '-7 days')
          AND s.reviewed_at IS NOT NULL
          AND s.outcome IN ('improved', 'stable')
    `).all(candidate.lesson_key) as Array<LessonCandidateRow & { improvement_score: number; session_id: string }>;

    const sessionIds = [...new Set(evidence.map((row) => row.session_id))];
    const averageScore = evidence.length === 0
        ? 0
        : evidence.reduce((sum, row) => sum + row.improvement_score, 0) / evidence.length;

    if (sessionIds.length < 3 || averageScore < 75) return null;

    const existing = db.prepare('SELECT * FROM promoted_lessons WHERE lesson_key = ?').get(candidate.lesson_key) as PromotedLessonRow | undefined;
    if (existing?.status === 'active') return existing;

    const memoryItemId = lessonMemoryWriter({
        content: candidate.lesson_text,
        memoryType: candidate.lesson_type === 'regression' ? 'policy' : 'procedural',
        sourceAgent: 'YURI_LEARNING_LOOP',
        sourceUri: `session:${candidate.source_session_id}`,
        sourceKind: 'session_learning',
        tags,
        importance: 3,
        metadata: {
            evidenceSessionIds: sessionIds,
            promotionScore: Math.round(averageScore),
            lessonCandidateId: candidate.id
        }
    });

    db.prepare(`
        INSERT INTO promoted_lessons (
            lesson_key, lesson_text, topic_tags, evidence_count, promotion_score, memory_item_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(lesson_key) DO UPDATE SET
            lesson_text = excluded.lesson_text,
            topic_tags = excluded.topic_tags,
            evidence_count = excluded.evidence_count,
            promotion_score = excluded.promotion_score,
            memory_item_id = COALESCE(excluded.memory_item_id, promoted_lessons.memory_item_id),
            status = 'active',
            updated_at = datetime('now')
    `).run(
        candidate.lesson_key,
        candidate.lesson_text,
        JSON.stringify(tags),
        sessionIds.length,
        Math.round(averageScore),
        memoryItemId
    );

    db.prepare(`
        UPDATE session_lesson_candidates
        SET status = 'promoted', updated_at = datetime('now')
        WHERE lesson_key = ? AND status = 'approved'
    `).run(candidate.lesson_key);

    return db.prepare('SELECT * FROM promoted_lessons WHERE lesson_key = ?').get(candidate.lesson_key) as PromotedLessonRow;
}
