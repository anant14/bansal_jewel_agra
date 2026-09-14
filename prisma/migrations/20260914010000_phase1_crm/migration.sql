-- Phase 1: CRM (Contacts, Tags, Consent) + real conversations/messages

-- Contact: replace the tri-state opt_in_status string with a boolean
-- fast-state (marketing_opt_in) plus explicit in/out timestamps. Consent
-- history itself lives in the "consents" table and is untouched here.
DROP INDEX IF EXISTS "contacts_opt_in_status_idx";
ALTER TABLE "contacts" DROP COLUMN "opt_in_status";
ALTER TABLE "contacts" RENAME COLUMN "opt_in_at" TO "marketing_opt_in_at";
ALTER TABLE "contacts" RENAME COLUMN "opt_out_at" TO "marketing_opt_out_at";
ALTER TABLE "contacts" ADD COLUMN "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "contacts_marketing_opt_in_idx" ON "contacts"("marketing_opt_in");

-- Consent: room for non-marketing consent purposes later.
ALTER TABLE "consents" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'marketing';

-- Conversation: exactly one conversation per contact per WhatsApp number.
CREATE UNIQUE INDEX "conversations_contact_id_whatsapp_account_id_key" ON "conversations"("contact_id", "whatsapp_account_id");

-- Message: denormalized contact_id for fast per-contact/timeline queries,
-- media metadata, reply-context, granular status timestamps and error text.
ALTER TABLE "messages" ADD COLUMN "contact_id" TEXT;
UPDATE "messages" m SET "contact_id" = c."contact_id" FROM "conversations" c WHERE c."id" = m."conversation_id";
ALTER TABLE "messages" ALTER COLUMN "contact_id" SET NOT NULL;
ALTER TABLE "messages" ADD COLUMN "context_whatsapp_message_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_mime_type" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_caption" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_filename" TEXT;
ALTER TABLE "messages" ADD COLUMN "error_message" TEXT;
ALTER TABLE "messages" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "failed_at" TIMESTAMP(3);
CREATE INDEX "messages_contact_id_idx" ON "messages"("contact_id");

-- MessageEvent: guard against a redelivered status webhook creating a
-- second identical event row.
CREATE UNIQUE INDEX "message_events_message_id_event_type_key" ON "message_events"("message_id", "event_type");

-- AuditLog: every event now says which customer's timeline it belongs to,
-- so the whole timeline is one indexed query instead of merging tables.
ALTER TABLE "audit_logs" ADD COLUMN "contact_id" TEXT;
CREATE INDEX "audit_logs_contact_id_idx" ON "audit_logs"("contact_id");
