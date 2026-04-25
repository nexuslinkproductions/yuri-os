import Database from 'better-sqlite3';

const NOTEBOOK_SCHEMA = `
CREATE TABLE IF NOT EXISTS notebook_notebooks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL DEFAULT 'Untitled Notebook',
    description TEXT,
    model_id    TEXT    NOT NULL DEFAULT 'qwen-liberated:latest',
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notebook_sources (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id     INTEGER NOT NULL REFERENCES notebook_notebooks(id) ON DELETE CASCADE,
    title           TEXT    NOT NULL,
    source_type     TEXT    NOT NULL CHECK (source_type IN ('pdf','docx','audio','video','url','obsidian')),
    origin_path     TEXT,
    obsidian_path   TEXT,
    file_size_bytes INTEGER DEFAULT 0,
    mime_type       TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','ready','error')),
    error_msg       TEXT,
    word_count      INTEGER DEFAULT 0,
    metadata        TEXT,
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notebook_chunks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES notebook_sources(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content     TEXT    NOT NULL,
    token_count INTEGER DEFAULT 0,
    embedding   TEXT,
    metadata    TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notebook_docs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id   INTEGER NOT NULL REFERENCES notebook_notebooks(id) ON DELETE CASCADE,
    doc_type      TEXT    NOT NULL
                  CHECK (doc_type IN ('summary','study_guide','faq','timeline','briefing')),
    title         TEXT    NOT NULL,
    content       TEXT    NOT NULL,
    pdf_path      TEXT,
    obsidian_path TEXT,
    model_id      TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notebook_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER NOT NULL REFERENCES notebook_notebooks(id) ON DELETE CASCADE,
    role        TEXT    NOT NULL CHECK (role IN ('user','assistant')),
    content     TEXT    NOT NULL,
    sources_used TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nb_sources_notebook  ON notebook_sources(notebook_id);
CREATE INDEX IF NOT EXISTS idx_nb_sources_status    ON notebook_sources(status);
CREATE INDEX IF NOT EXISTS idx_nb_chunks_source     ON notebook_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_nb_docs_notebook     ON notebook_docs(notebook_id);
CREATE INDEX IF NOT EXISTS idx_nb_msgs_notebook     ON notebook_messages(notebook_id);
`;

export function runNotebookMigrations(db: Database.Database): void {
    db.exec(NOTEBOOK_SCHEMA);
    console.log('⬡ NOTEBOOK_SCHEMA_READY');
}
