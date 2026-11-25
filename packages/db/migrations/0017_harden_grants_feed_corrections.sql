-- Stessa difesa in profondità delle migrazioni precedenti per le correzioni
-- personali (M5): `anon` senza privilegi, `authenticated` in sola lettura delle
-- proprie righe (RLS). Le scrive e le cancella solo l'API sul server.
REVOKE ALL ON "feed_corrections" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "feed_corrections" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "feed_corrections" TO authenticated;
