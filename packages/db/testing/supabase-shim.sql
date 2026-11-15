-- Riproduce, in PGlite, la parte di Supabase che le migrazioni e la RLS usano:
-- ruoli, schema `auth`, tabella `auth.users` e funzione `auth.uid()`.
-- Solo per i test: su Supabase questi oggetti esistono già.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- Come in Supabase: l'id utente arriva dal JWT della richiesta.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- Privilegi predefiniti di Supabase sulle nuove tabelle di public: tutto ad
-- anon e authenticated. Li replichiamo per verificare che a proteggere i dati
-- siano davvero RLS e la migrazione dei permessi, non la loro assenza.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
