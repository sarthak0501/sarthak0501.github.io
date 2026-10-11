-- Private storage. Application-created records become immutable after a final
-- outcome; the backup service may only acknowledge their durable local copy.
CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  mode TEXT NOT NULL CHECK (mode IN ('question', 'match')),
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND CASE mode WHEN 'question' THEN 1200 ELSE 6000 END),
  answer_json TEXT CHECK (answer_json IS NULL OR (json_valid(answer_json) AND length(answer_json) <= 50000)),
  status TEXT NOT NULL CHECK (status IN ('answered', 'failed')),
  error_code TEXT,
  corpus_revision TEXT NOT NULL CHECK (length(corpus_revision) BETWEEN 1 AND 120),
  latency_ms INTEGER NOT NULL CHECK (latency_ms BETWEEN 0 AND 600000),
  backed_up_at TEXT CHECK (backed_up_at IS NULL OR length(backed_up_at) = 24),
  CHECK ((status = 'answered' AND answer_json IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND answer_json IS NULL AND error_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS interactions_created_at ON interactions(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS interactions_backup_queue ON interactions(backed_up_at, id);
CREATE TRIGGER IF NOT EXISTS interactions_immutable
BEFORE UPDATE OF id, request_id, created_at, mode, question, answer_json, status, error_code, corpus_revision, latency_ms ON interactions
BEGIN
  SELECT RAISE(ABORT, 'Interaction content is immutable');
END;
