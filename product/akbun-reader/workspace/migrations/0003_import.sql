ALTER TABLE documents ADD COLUMN import_day TEXT;
CREATE INDEX documents_import_day ON documents(import_day);
CREATE TRIGGER document_deleted AFTER DELETE ON documents BEGIN
  INSERT INTO changes(document_id, operation) VALUES (OLD.id, 'delete');
END;
