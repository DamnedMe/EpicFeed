-- Stessa difesa in profondità di 0001, 0004 e 0006 per i progressi
-- sincronizzati: `anon` senza privilegi, `authenticated` in sola lettura delle
-- proprie righe (RLS). La copia cifrata la scrive solo l'API sul server.
REVOKE ALL ON "progress_snapshots" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "progress_snapshots" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "progress_snapshots" TO authenticated;
