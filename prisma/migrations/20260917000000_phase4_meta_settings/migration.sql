-- Phase 4: Meta Settings & Connection Center

-- AlterTable: whatsapp_accounts — connection/discovery metadata.
-- updated_at gets a migration-time default so the existing row (the
-- bootstrapped default account) satisfies NOT NULL; every future write
-- is timestamped by Prisma's @updatedAt as usual.
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_portfolio_id" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "display_name" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "quality_rating" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "last_connection_test_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_accounts" ADD COLUMN "last_connection_status" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "last_connection_error" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "meta_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "app_id" TEXT,
    "waba_id" TEXT,
    "business_portfolio_id" TEXT,
    "phone_number_id" TEXT,
    "graph_version" TEXT,
    "verify_token" TEXT,
    "encrypted_token" TEXT,
    "encrypted_app_secret" TEXT,
    "rate_template_name" TEXT,
    "rate_template_lang" TEXT,
    "embedded_signup_config_id" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "last_verify_status" TEXT,
    "last_verify_error" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_settings_pkey" PRIMARY KEY ("id")
);
