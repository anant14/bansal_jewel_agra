-- Phase 2: Gold & Silver Rate Manager

-- CreateTable
CREATE TABLE "rate_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metal" TEXT NOT NULL,
    "purity" TEXT,
    "display_name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_entries" (
    "id" TEXT NOT NULL,
    "rate_type_id" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "rate_date" DATE NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "entered_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_requests" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "whatsapp_account_id" TEXT,
    "source" TEXT NOT NULL,
    "requested_type" TEXT NOT NULL,
    "rate_snapshot" JSONB NOT NULL,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "delivery_status" TEXT NOT NULL DEFAULT 'pending',
    "message_id" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_types_code_key" ON "rate_types"("code");

-- CreateIndex
CREATE INDEX "rate_entries_rate_type_id_idx" ON "rate_entries"("rate_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_entries_rate_type_id_rate_date_key" ON "rate_entries"("rate_type_id", "rate_date");

-- CreateIndex
CREATE INDEX "rate_requests_contact_id_idx" ON "rate_requests"("contact_id");

-- CreateIndex
CREATE INDEX "rate_requests_source_idx" ON "rate_requests"("source");

-- CreateIndex
CREATE INDEX "rate_requests_created_at_idx" ON "rate_requests"("created_at");

-- AddForeignKey
ALTER TABLE "rate_entries" ADD CONSTRAINT "rate_entries_rate_type_id_fkey" FOREIGN KEY ("rate_type_id") REFERENCES "rate_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_entries" ADD CONSTRAINT "rate_entries_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_requests" ADD CONSTRAINT "rate_requests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
