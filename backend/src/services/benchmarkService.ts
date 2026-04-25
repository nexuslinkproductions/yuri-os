import { Database } from 'better-sqlite3';
import { logEvent } from '../models/queries';

export interface BenchmarkScore {
    id: string;
    model: string;
    mmlu: number;
    humanEval: number;
    reasoning: number;
    timestamp: string;
}

/**
 * BenchmarkService
 * Manages local and global model performance metrics.
 */
export class BenchmarkService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
        this.initTable();
    }

    private initTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS benchmarks (
                id TEXT PRIMARY KEY,
                model TEXT,
                mmlu REAL,
                human_eval REAL,
                reasoning REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    public recordScore(model: string, mmlu: number, humanEval: number, reasoning: number) {
        const id = `bench_${Date.now()}`;
        this.db.prepare('INSERT INTO benchmarks (id, model, mmlu, human_eval, reasoning) VALUES (?, ?, ?, ?, ?)')
            .run(id, model, mmlu, humanEval, reasoning);
        
        logEvent(this.db, 'NEURAL', 'BENCHMARK', `Recorded scores for ${model}: MMLU=${mmlu}`, 'INFO');
    }

    public getLatestScores() {
        return this.db.prepare('SELECT * FROM benchmarks ORDER BY timestamp DESC LIMIT 10').all();
    }
}

let benchmarkService: BenchmarkService;

export function initBenchmarkService(db: Database) {
    benchmarkService = new BenchmarkService(db);
    return benchmarkService;
}

export { benchmarkService };

