CREATE VIRTUAL TABLE `stories_fts` USING fts5(title, summary, content='stories', content_rowid='id');
--> statement-breakpoint
CREATE TRIGGER `stories_fts_ai` AFTER INSERT ON `stories` BEGIN
  INSERT INTO stories_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;
--> statement-breakpoint
CREATE TRIGGER `stories_fts_ad` AFTER DELETE ON `stories` BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, summary) VALUES ('delete', old.id, old.title, old.summary);
END;
--> statement-breakpoint
CREATE TRIGGER `stories_fts_au` AFTER UPDATE ON `stories` BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, summary) VALUES ('delete', old.id, old.title, old.summary);
  INSERT INTO stories_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;
