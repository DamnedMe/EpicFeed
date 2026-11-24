-- Stessa difesa in profondità delle migrazioni precedenti per le risposte da
-- correggere: `anon` senza privilegi, `authenticated` in sola lettura delle
-- proprie righe (RLS). Le scrive e le cancella solo l'API sul server.
REVOKE ALL ON "exam_submissions" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "exam_submissions" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "exam_submissions" TO authenticated;
