-- Stessa difesa in profondità di 0001 e 0004 per le tabelle della generazione:
-- `anon` senza privilegi, `authenticated` in sola lettura (le righe visibili le
-- decide la RLS). Feed, glossario e registro li scrive solo l'API sul server.
REVOKE ALL ON "lesson_feeds", "glossary_terms", "generation_events" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "lesson_feeds", "glossary_terms", "generation_events" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "lesson_feeds", "glossary_terms", "generation_events" TO authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "generation_events_id_seq" FROM anon, authenticated;
