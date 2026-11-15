DROP INDEX "entitlements_version_idx";--> statement-breakpoint
CREATE INDEX "entitlements_version_part_idx" ON "entitlements" USING btree ("content_version_id","lesson_part_id");