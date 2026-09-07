ALTER TABLE documents ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'unavailable'
  CHECK(extraction_status IN ('unavailable','provided','pending','done','failed'));
