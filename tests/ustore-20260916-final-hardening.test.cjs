const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const shopApi = read('supabase/functions/shop-api/index.ts');
const platformApi = read('supabase/functions/platform-api/index.ts');
const app = read('ustore-shop-app.js');
const excel = read('excel-import.js');
const backupSql = read('supabase/migrations/083_shop_backup_restore.sql');
const returnSql = read('supabase/migrations/084_structured_returns.sql');
const stagingSql = read('supabase/migrations/085_excel_server_staging.sql');
const paymentExpirySql = read('supabase/migrations/086_payment_expiry_provider_state.sql');
const billzClient = read('supabase/functions/_shared/billz-client.ts');

test('BILLZ secret is encrypted on the server and status never selects it', () => {
  assert.match(shopApi, /const secretEnc = await encryptBotToken\(BOT_TOKEN_MASTER_KEY, secretToken\)/);
  assert.match(shopApi, /secret_token_ciphertext: secretEnc\.ciphertext, secret_token_iv: secretEnc\.iv/);
  const statusBlock = shopApi.match(/case "billz_get_status": \{([\s\S]*?)case "billz_connect"/)[1];
  assert.doesNotMatch(statusBlock, /secret_token_ciphertext|access_token_ciphertext|refresh_token_ciphertext/);
});

test('Excel rows are fully server-staged before the catalog commit', () => {
  assert.match(stagingSql, /create table if not exists public\.import_staging_rows/);
  assert.match(stagingSql, /for update;/);
  assert.match(shopApi, /case "stage_import_products"/);
  assert.match(shopApi, /if \(!stageMeta\) return json\(\{ error: "import_stage_required" \}/);
  assert.match(shopApi, /rows = \(stagedChunk \|\| \[\]\)\.map/);
  assert.match(excel, /callApi\('stage_import_products'/);
  assert.match(excel, /Tasdiqlash va katalogga saqlash/);
});

test('BILLZ sale uses the official full-add then recalculate then payment sequence', () => {
  assert.match(billzClient, /billz_sale_items_incomplete/);
  assert.match(billzClient, /\/v1\/recalculate-order-bill\/\$\{orderId\}/);
  assert.match(billzClient, /paid_amount: finalTotal/);
  assert.match(billzClient, /envelopeStatus >= 400/);
});

test('Expired payment reservations also close local Click and Payme transaction states', () => {
  assert.match(paymentExpirySql, /public\.payme_transactions/);
  assert.match(paymentExpirySql, /state = -1, cancel_time = v_cancel_time, reason = 4/);
  assert.match(paymentExpirySql, /public\.click_transactions/);
  assert.match(paymentExpirySql, /state = 'CANCELLED'/);
  assert.match(paymentExpirySql, /public\.update_order_status/);
});

test('Shop backup excludes secrets and restore is audited in the same SQL transaction', () => {
  assert.match(backupSql, /'shop_bots','billz_connections','click_connections','payme_connections','uzum_connections'/);
  assert.match(backupSql, /insert into public\.platform_admin_action_log/);
  assert.match(backupSql, /'RESTORE_BACKUP'/);
  assert.match(platformApi, /checkCRC32: true/);
  assert.match(platformApi, /backup_too_many_files/);
  assert.match(platformApi, /p_restored_by: restoredBy/);
});

test('Structured return workflow restocks atomically and records refund without calling a provider', () => {
  assert.match(returnSql, /status text not null default 'REQUESTED'/);
  assert.match(returnSql, /for update;/);
  assert.match(returnSql, /operation_type,admin_tg_id,order_id/);
  assert.match(returnSql, /payment_status='REFUNDED'/);
  assert.doesNotMatch(returnSql, /clickCreate|buildPayme|uzumRegister|functions\/v1\/(?:click|payme|uzum)/i);
});

test('Reports separate ordered, paid, refunded and uncollected cash amounts', () => {
  assert.match(shopApi, /orderedAmount/);
  assert.match(shopApi, /paidAmount/);
  assert.match(shopApi, /refundedAmount/);
  assert.match(shopApi, /uncollectedCashAmount/);
  assert.match(app, /Berilgan buyurtmalar summasi/);
  assert.match(app, /Haqiqatan tushgan pul/);
  assert.match(app, /Hali olinmagan naqd/);
});

test('BILLZ modal explains server-only secret handling and uses the premium provider surface', () => {
  assert.match(app, /Kalit faqat serverga yuboriladi va brauzerda saqlanmaydi/);
  assert.match(app, /fc-provider-modal/);
  assert.match(app, /fc-provider-security-note/);
});
