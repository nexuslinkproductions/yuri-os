import assert from 'assert';
import Database from 'better-sqlite3';
import {
    ensureSessionImprovementLog,
    finalizeSessionImprovement,
    promoteReviewedLessons,
    recordSessionReview,
    reviewLessonCandidate,
    setLessonMemoryWriterForTests,
    startSessionImprovement
} from './services/sessionImprovementService';

type Row = Record<string, any>;

function createDb(): Database.Database {
    const db = new Database(':memory:');
    ensureSessionImprovementLog(db);
    return db;
}

function createReviewedSession(db: Database.Database, sessionId: string, score = 86, tags = ['ops'], lesson = 'Keep the project state ledger updated after each agent handoff.'): void {
    startSessionImprovement(db, {
        sessionId,
        command: 'learning-loop-test',
        commandType: 'test',
        topicTags: tags,
        goal: 'Verify durable learning loop'
    });
    finalizeSessionImprovement(db, {
        sessionId,
        outcome: 'stable',
        autoScore: score,
        whatGotBetter: lesson,
        notes: lesson
    });
    recordSessionReview(db, sessionId, 5, 'reviewed');
}

function approvePending(db: Database.Database): void {
    const rows = db.prepare("SELECT id FROM session_lesson_candidates WHERE status = 'pending' ORDER BY id").all() as Row[];
    for (const row of rows) {
        reviewLessonCandidate(db, row.id, 'approve', undefined, 'approved in test');
    }
}

function testCandidateExtraction(): void {
    const db = createDb();
    createReviewedSession(db, 'extract-1', 78, ['extract'], 'Reuse the same closeout checklist for every delivery.');
    finalizeSessionImprovement(db, {
        sessionId: 'extract-1',
        whatGotWorse: 'Forgot to include the final verification command.',
        corrections: 1,
        rework: 1
    });

    const rows = db.prepare('SELECT lesson_type FROM session_lesson_candidates ORDER BY id').all() as Row[];
    assert(rows.some((row) => row.lesson_type === 'win'));
    assert(rows.some((row) => row.lesson_type === 'regression'));
    db.close();
}

function testPromotionAfterThreeApprovedSessions(): void {
    const db = createDb();
    let memoryWrites = 0;
    const restore = setLessonMemoryWriterForTests((input) => {
        memoryWrites += 1;
        assert.strictEqual(input.sourceKind, 'session_learning');
        assert.deepStrictEqual(input.tags, ['ops']);
        return 123;
    });

    createReviewedSession(db, 'promote-1');
    createReviewedSession(db, 'promote-2');
    createReviewedSession(db, 'promote-3');
    approvePending(db);
    promoteReviewedLessons(db);

    const row = db.prepare('SELECT * FROM promoted_lessons WHERE status = ?').get('active') as Row;
    assert(row);
    assert.strictEqual(row.evidence_count, 3);
    assert.strictEqual(row.memory_item_id, 123);
    assert(memoryWrites >= 1);
    restore();
    db.close();
}

function testRegressionTrendAndPromotionBlock(): void {
    const db = createDb();
    let memoryWrites = 0;
    const restore = setLessonMemoryWriterForTests(() => {
        memoryWrites += 1;
        return 999;
    });

    for (const id of ['regress-1', 'regress-2']) {
        startSessionImprovement(db, {
            sessionId: id,
            command: 'regression-test',
            commandType: 'test',
            topicTags: ['blocked']
        });
        finalizeSessionImprovement(db, {
            sessionId: id,
            outcome: 'regressed',
            autoScore: 30,
            whatGotWorse: 'Repeated missing verification created rework.'
        });
        recordSessionReview(db, id, 1, 'regressed');
    }

    const trend = db.prepare("SELECT * FROM session_regression_trends WHERE topic_tag = 'blocked' AND status = 'active'").get() as Row;
    assert.strictEqual(trend.regression_count, 2);

    for (const id of ['blocked-1', 'blocked-2', 'blocked-3']) {
        createReviewedSession(db, id, 90, ['blocked'], 'Always run backend build before declaring the route safe.');
    }
    approvePending(db);
    promoteReviewedLessons(db);

    const promotedCount = db.prepare('SELECT COUNT(*) AS count FROM promoted_lessons').get() as Row;
    assert.strictEqual(promotedCount.count, 0);
    assert.strictEqual(memoryWrites, 0);
    restore();
    db.close();
}

function testRejectedCandidatesNeverPromote(): void {
    const db = createDb();
    createReviewedSession(db, 'reject-1', 88, ['reject'], 'Rejected lessons must not enter durable memory.');
    createReviewedSession(db, 'reject-2', 88, ['reject'], 'Rejected lessons must not enter durable memory.');
    createReviewedSession(db, 'reject-3', 88, ['reject'], 'Rejected lessons must not enter durable memory.');

    const rows = db.prepare("SELECT id FROM session_lesson_candidates WHERE status = 'pending'").all() as Row[];
    for (const row of rows) {
        reviewLessonCandidate(db, row.id, 'reject', undefined, 'not durable');
    }
    const promoted = promoteReviewedLessons(db);
    assert.strictEqual(promoted.length, 0);
    db.close();
}

function testDuplicateCandidatesCollapse(): void {
    const db = createDb();
    startSessionImprovement(db, {
        sessionId: 'dupe-1',
        command: 'dupe',
        commandType: 'test',
        topicTags: ['dupe']
    });
    finalizeSessionImprovement(db, {
        sessionId: 'dupe-1',
        outcome: 'stable',
        autoScore: 80,
        whatGotBetter: 'One duplicate lesson should collapse per source session.'
    });
    finalizeSessionImprovement(db, {
        sessionId: 'dupe-1',
        outcome: 'stable',
        autoScore: 80,
        whatGotBetter: 'One duplicate lesson should collapse per source session.'
    });

    const row = db.prepare("SELECT COUNT(*) AS count FROM session_lesson_candidates WHERE source_session_id = 'dupe-1' AND lesson_type = 'win'").get() as Row;
    assert.strictEqual(row.count, 1);
    db.close();
}

testCandidateExtraction();
testPromotionAfterThreeApprovedSessions();
testRegressionTrendAndPromotionBlock();
testRejectedCandidatesNeverPromote();
testDuplicateCandidatesCollapse();

process.stdout.write('learning-loop: pass\n');
