-- Stessa difesa in profondità delle migrazioni precedenti per le banche
-- d'esame: `anon` senza privilegi, `authenticated` in sola lettura (RLS).
-- Le banche le scrive solo l'API sul server.
REVOKE ALL ON "subject_exam_banks" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "subject_exam_banks" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "subject_exam_banks" TO authenticated;
