// ============================================================================
// USTORE — report-export-cleanup-cron
// Removes temporary PDF report exports after 24 hours.
// Invoked hourly by pg_cron/pg_net. No user-controlled path is accepted.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { json, corsHeaders } from "../_shared/http.ts";

const BUCKET = "report-exports";
const BATCH_SIZE = 200;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("USTORE_REPORT_EXPORT_CRON_SECRET") || "";
  const got = req.headers.get("x-cron-secret") || "";
  if (!expected || got !== expected) return json({ error: "forbidden" }, 403);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const { data: expired, error: queryError } = await db
    .from("report_export_files")
    .select("path,expires_at")
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryError) return json({ error: "report_export_query_failed", detail: queryError.message }, 500);
  if (!expired?.length) return json({ ok: true, checked: 0, deleted: 0, failed: 0 });

  let deleted = 0;
  let failed = 0;
  const failures: Array<{ path: string; message: string }> = [];

  for (const item of expired) {
    const path = String(item.path || "");
    // Defense-in-depth: cleanup only paths created by UStorE report export flow.
    if (!/^shops\/[0-9a-f-]+\/users\/[0-9A-Za-z_-]+\/latest\.pdf$/i.test(path)) {
      failed++;
      failures.push({ path, message: "invalid_managed_report_path" });
      continue;
    }

    // Re-read immediately before deletion. A newly generated PDF upserts this
    // row and pushes expires_at forward by 24h; this prevents an old cron read
    // from deleting a just-refreshed latest.pdf.
    const { data: current, error: currentError } = await db
      .from("report_export_files")
      .select("expires_at")
      .eq("path", path)
      .maybeSingle();

    if (currentError) {
      failed++;
      failures.push({ path, message: currentError.message });
      continue;
    }
    if (!current || new Date(current.expires_at).getTime() > Date.now()) continue;

    const { error: removeError } = await db.storage.from(BUCKET).remove([path]);
    if (removeError) {
      failed++;
      failures.push({ path, message: removeError.message });
      continue;
    }

    // Delete metadata only if it is still expired. If a concurrent upload
    // refreshed the row between our checks, keep the row so a future cleanup
    // can safely handle it.
    const { error: metaError } = await db
      .from("report_export_files")
      .delete()
      .eq("path", path)
      .lte("expires_at", new Date().toISOString());

    if (metaError) {
      failed++;
      failures.push({ path, message: metaError.message });
      continue;
    }
    deleted++;
  }

  return json({ ok: true, checked: expired.length, deleted, failed, failures: failures.slice(0, 20) });
});
