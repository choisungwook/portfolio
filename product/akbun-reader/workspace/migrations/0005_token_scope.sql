ALTER TABLE api_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'write' CHECK(scope IN ('read','write'));
