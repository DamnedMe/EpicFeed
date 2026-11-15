-- Difesa in profondità sui permessi di tabella (oltre alla RLS).
-- Supabase concede di default a `anon` e `authenticated` tutti i privilegi
-- sulle nuove tabelle di `public`: la RLS senza policy di scrittura già nega
-- insert/update/delete, ma togliamo anche i privilegi, così un errore futuro
-- in una policy non basta ad aprire le scritture dal client.
-- Le scritture passano solo dall'API sul server.
REVOKE ALL ON "study_programs", "editions", "subjects", "chapters", "lessons", "lesson_parts", "content_versions", "entitlements" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "study_programs", "editions", "subjects", "chapters", "lessons", "lesson_parts", "content_versions", "entitlements" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "study_programs", "editions", "subjects", "chapters", "lessons", "lesson_parts", "content_versions", "entitlements" TO authenticated;
