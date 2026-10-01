// ============================================================================
// USTORE ROUND14 — trash-purge-cron
// Permanently purges trash batches that have been in Trash for >= 24 hours.
// Invoked hourly by pg_cron/pg_net. Uses the existing platform cron secret.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { json, corsHeaders } from "../_shared/http.ts";

function productStoragePathFromUrl(value: unknown, supabaseUrl: string, shopId: string): string | null {
  try {
    const url = new URL(String(value || ""));
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const prefix = "/storage/v1/object/public/images/";
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const expectedPrefix = `shops/${shopId}/products/`;
    if (!path.startsWith(expectedPrefix)) return null;
    return /^shops\/[0-9a-f-]+\/products\/\d+-[0-9a-f-]+\.(?:jpg|jpeg|png|webp)$/i.test(path) ? path : null;
  } catch { return null; }
}

async function cleanupImages(db: any, shopId: string, urls: unknown[], supabaseUrl: string) {
  for (const rawUrl of Array.from(new Set((urls || []).map(String).filter(Boolean)))) {
    const path = productStoragePathFromUrl(rawUrl, supabaseUrl, shopId);
    if (!path) continue;
    const { data: refs } = await db.from("products").select("id").eq("shop_id", shopId).eq("img", rawUrl).limit(1);
    if ((refs || []).length) continue;
    const { error } = await db.storage.from("images").remove([path]);
    if (error) console.error("[TRASH_PURGE] image cleanup", { shopId, path, message: error.message });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const expected = Deno.env.get("USTORE_PLATFORM_CRON_SECRET") || "";
  const got = req.headers.get("x-cron-secret") || "";
  if (!expected || got !== expected) return json({ error: "forbidden" }, 403);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: expired, error } = await db.from("trash_batches")
    .select("id,shop_id,deleted_at")
    .is("restored_at", null).is("purged_at", null)
    .lte("deleted_at", cutoff).order("deleted_at", { ascending: true }).limit(500);
  if (error) return json({ error: "trash_query_failed", detail: error.message }, 500);

  let purged = 0, failed = 0;
  const failures: Array<{batchId:string; message:string}> = [];
  for (const batch of expired || []) {
    try {
      const { data: result, error: purgeError } = await db.rpc("ustore_purge_trash_batch", {
        p_shop_id: batch.shop_id, p_batch_id: batch.id,
      });
      if (purgeError) throw purgeError;
      await cleanupImages(db, batch.shop_id, result?.imageUrls || [], SUPABASE_URL);
      purged++;
    } catch (e: any) {
      failed++;
      failures.push({ batchId: String(batch.id), message: String(e?.message || e).slice(0, 300) });
      console.error("[TRASH_PURGE] batch failed", { batchId: batch.id, shopId: batch.shop_id, message: e?.message || e });
    }
  }
  return json({ ok: true, checked: (expired || []).length, purged, failed, failures: failures.slice(0, 20) });
});
