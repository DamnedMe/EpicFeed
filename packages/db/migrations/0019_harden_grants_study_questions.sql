-- Stessa difesa in profondità delle migrazioni precedenti per le domande in
-- coda (M6): `anon` senza privilegi, `authenticated` in sola lettura delle
-- proprie righe (RLS). Le scrive e le cancella solo l'API sul server.
REVOKE ALL ON "study_questions" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "study_questions" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "study_questions" TO authenticated;
