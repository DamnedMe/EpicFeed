-- Stessa difesa in profondità di 0001_harden_grants per le tabelle nuove:
-- `anon` senza privilegi, `authenticated` in sola lettura (le righe visibili le
-- decide la RLS). Tracce, permessi, token e registro degli import li scrive
-- solo l'API sul server.
REVOKE ALL ON "subtitle_tracks", "subtitle_access", "api_tokens", "import_events" FROM anon;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "subtitle_tracks", "subtitle_access", "api_tokens", "import_events" FROM authenticated;--> statement-breakpoint
GRANT SELECT ON "subtitle_tracks", "subtitle_access", "api_tokens", "import_events" TO authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "import_events_id_seq" FROM anon, authenticated;
