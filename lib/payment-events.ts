import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CallbackProcessingStatus =
  | "received"
  | "processed"
  | "ignored"
  | "failed"
  | "duplicate";

function stableHash(payload: unknown): string {
  const json = JSON.stringify(payload ?? {});
  return createHash("sha256").update(json).digest("hex");
}

/**
 * Record a gateway callback for audit + idempotency.
 * Returns { duplicate: true } when the same payload was already processed.
 */
export async function recordPaymentCallbackEvent(opts: {
  gateway: "moolre" | "hubtel" | "paystack" | string;
  eventType?: string;
  externalEventId?: string | null;
  internalReference?: string | null;
  gatewayReference?: string | null;
  orderNumber?: string | null;
  payload: unknown;
  signatureStatus?: string;
  amountExpected?: number | null;
  amountReported?: number | null;
  currency?: string;
}): Promise<{ id: string | null; duplicate: boolean }> {
  const payload_hash = stableHash(opts.payload);

  // Fast duplicate check by hash
  const { data: existing } = await supabaseAdmin
    .from("payment_callback_events")
    .select("id, processing_status")
    .eq("gateway", opts.gateway)
    .eq("payload_hash", payload_hash)
    .maybeSingle();

  if (existing?.id) {
    if (existing.processing_status === "processed") {
      return { id: existing.id, duplicate: true };
    }
    return { id: existing.id, duplicate: false };
  }

  const { data, error } = await supabaseAdmin
    .from("payment_callback_events")
    .insert({
      gateway: opts.gateway,
      event_type: opts.eventType || "callback",
      external_event_id: opts.externalEventId || null,
      internal_reference: opts.internalReference || null,
      gateway_reference: opts.gatewayReference || null,
      order_number: opts.orderNumber || null,
      payload_hash,
      signature_status: opts.signatureStatus || "unchecked",
      processing_status: "received",
      amount_expected: opts.amountExpected ?? null,
      amount_reported: opts.amountReported ?? null,
      currency: opts.currency || "GHS",
    })
    .select("id")
    .single();

  if (error) {
    // Unique race → treat as duplicate/existing
    if (error.message?.includes("duplicate") || error.code === "23505") {
      return { id: null, duplicate: true };
    }
    console.error("[payment-events] insert failed:", error.message);
    return { id: null, duplicate: false };
  }

  return { id: data?.id ?? null, duplicate: false };
}

export async function finalizePaymentCallbackEvent(
  id: string | null,
  status: CallbackProcessingStatus,
  errorMessage?: string | null
): Promise<void> {
  if (!id) return;
  await supabaseAdmin
    .from("payment_callback_events")
    .update({
      processing_status: status,
      error_message: errorMessage || null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
}
