-- Stessa difesa in profondità di 0001, 0004, 0006 e 0009 per i pacchetti
-- d'esame: `anon` senza privilegi, `authenticated` in sola lettura (RLS).
-- I pacchetti li scrive solo l'API sul server.
REVOKE ALL ON "lesson_exam_packs" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "lesson_exam_packs" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "lesson_exam_packs" TO authenticated;
