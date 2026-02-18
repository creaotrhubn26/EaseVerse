CREATE TABLE IF NOT EXISTS collab_protools_sync (
  external_track_id VARCHAR(160) NOT NULL,
  project_id VARCHAR(160) NOT NULL DEFAULT '__default__',
  source VARCHAR(120) NOT NULL DEFAULT 'protools-companion',
  bpm INTEGER,
  markers JSONB NOT NULL DEFAULT '[]'::jsonb,
  take_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  pronunciation_feedback JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (external_track_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_collab_protools_sync_project_id
  ON collab_protools_sync(project_id);

CREATE INDEX IF NOT EXISTS idx_collab_protools_sync_source
  ON collab_protools_sync(source);

CREATE INDEX IF NOT EXISTS idx_collab_protools_sync_updated_at
  ON collab_protools_sync(updated_at DESC);
