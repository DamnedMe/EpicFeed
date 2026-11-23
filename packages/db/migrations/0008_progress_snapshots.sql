CREATE TABLE "progress_snapshots" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"kdf" text NOT NULL,
	"salt" text NOT NULL,
	"iv" text NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_snapshots_revision_check" CHECK ("progress_snapshots"."revision" >= 1),
	CONSTRAINT "progress_snapshots_kdf_check" CHECK ("progress_snapshots"."kdf" ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "progress_snapshots_salt_check" CHECK ("progress_snapshots"."salt" ~ '^[A-Za-z0-9+/]{22}==$'),
	CONSTRAINT "progress_snapshots_iv_check" CHECK ("progress_snapshots"."iv" ~ '^[A-Za-z0-9+/]{16}$'),
	CONSTRAINT "progress_snapshots_ciphertext_check" CHECK (char_length("progress_snapshots"."ciphertext") between 24 and 4000000 and "progress_snapshots"."ciphertext" ~ '^[A-Za-z0-9+/]+={0,2}$')
);
--> statement-breakpoint
ALTER TABLE "progress_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "progress_snapshots_select_own" ON "progress_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("progress_snapshots"."user_id" = (select auth.uid()));