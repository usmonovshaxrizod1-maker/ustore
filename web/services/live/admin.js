import { fail, ok, STABLE_ERROR_CODES } from '../ports/result.js';

const ERROR_SET = new Set(STABLE_ERROR_CODES);

// Astra-6a: this is intentionally narrower than the legacy shop-api surface.
// The server has the same authoritative whitelist and still re-checks the
// concrete permission inside every existing action handler.
export const LIVE_ADMIN_ACTIONS = Object.freeze([
  'get_my_permissions',
  'get_admin_settings',
  'set_shop_contact', 'set_low_stock_threshold', 'set_orders_paused',
  'set_fulfillment_config', 'set_order_policies',
  'set_design_settings', 'set_shop_logo', 'set_start_message',
  'click_get_status', 'click_connect', 'click_disconnect', 'click_start_test_payment', 'click_test_progress',
  'payme_get_status', 'payme_connect', 'payme_disconnect', 'payme_start_test_payment', 'payme_test_progress',
  'uzum_get_status', 'uzum_connect', 'uzum_disconnect',

  'get_support_tickets', 'get_support_messages', 'send_support_message',

  'get_marketing_bootstrap', 'marketing_summary', 'set_featured_categories',
  'banner_list', 'banner_reorder', 'banner_create', 'banner_update', 'banner_delete',
  'promo_generate_code', 'promo_list', 'promo_create', 'promo_update', 'promo_delete', 'promo_usage_list',
  'bundle_list', 'bundle_create', 'bundle_update', 'bundle_delete',
  'discount_tier_group_list', 'discount_tier_group_create', 'discount_tier_group_update', 'discount_tier_group_delete',
  'automatic_gift_list', 'automatic_gift_create', 'automatic_gift_update', 'automatic_gift_delete',
  'reward_rule_list', 'reward_rule_create', 'reward_rule_update', 'reward_rule_delete',


  'get_admin_products', 'get_admin_product_editor', 'add_product', 'edit_product_field',
  'toggle_product_visibility', 'duplicate_product', 'bulk_move_products', 'bulk_trash_products',
  'add_category', 'edit_category',

  'get_excel_template_url', 'start_import_batch', 'stage_import_products',
  'bulk_import_products', 'get_category_aliases', 'get_last_import_batch',
  'rollback_import_batch',

  'billz_get_status', 'billz_connect', 'billz_list_config_options',
  'billz_save_sale_config', 'billz_disconnect', 'billz_get_categories',
  'billz_browse_products', 'billz_import_products',
  'billz_list_imported_products', 'billz_unlink_products',
  'billz_list_deleted_products', 'billz_restore_product',

  'upload_product_image', 'get_upload_url', 'finalize_image_upload',

  'get_all_orders', 'update_order_status', 'get_payment_receipt_url',
  'approve_payment_receipt', 'reject_payment_receipt',

  'get_inventory_rows', 'bulk_stock_update', 'record_stock_in', 'get_stock_movements',

  'role_list', 'role_create', 'role_update', 'role_delete',
  'staff_list', 'staff_invite', 'staff_cancel_invite', 'staff_update_roles', 'staff_set_blocked', 'staff_remove',
  'list_admin_audit_log',

  'get_dashboard_lite', 'get_report_overview', 'get_sales_report',
  'get_customer_report', 'get_product_report', 'get_warehouse_summary',
  'upload_report_pdf',
]);
const ACTION_SET = new Set(LIVE_ADMIN_ACTIONS);

function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('shop-api endpoint HTTPS bo‘lishi kerak.');
  return url.href;
}

function normalizeError(body, status) {
  const raw = String(typeof body?.error === 'string' ? body.error : body?.error?.code || '').toLowerCase();
  const code = status === 401 || raw === 'auth_required' || raw === 'session_expired'
    ? (raw === 'auth_required' ? 'AUTH_REQUIRED' : 'SESSION_EXPIRED')
    : status === 403 || raw.startsWith('forbidden') || raw === 'web_admin_action_not_allowed'
      ? 'FORBIDDEN'
      : status === 404 || raw.endsWith('_not_found')
        ? 'NOT_FOUND'
        : status === 409 || raw.includes('duplicate') || raw.includes('conflict') || raw.includes('in_progress')
          ? 'CONFLICT'
          : status === 429 || raw.includes('rate_limit')
            ? 'RATE_LIMITED'
            : status === 400 || raw.startsWith('invalid_') || raw.endsWith('_required')
              ? 'VALIDATION_ERROR'
              : ERROR_SET.has(String(body?.error)) ? String(body.error) : 'NETWORK_ERROR';
  const defaults = {
    AUTH_REQUIRED: 'Kirish talab qilinadi.',
    SESSION_EXPIRED: 'Sessiya tugagan. Qayta kiring.',
    FORBIDDEN: 'Bu amal uchun ruxsat yo‘q.',
    NOT_FOUND: 'Ma’lumot topilmadi.',
    CONFLICT: 'Amal joriy holat bilan mos kelmadi.',
    RATE_LIMITED: 'Juda ko‘p urinish. Keyinroq qayta urinib ko‘ring.',
    VALIDATION_ERROR: 'Kiritilgan ma’lumotni tekshiring.',
    NETWORK_ERROR: 'Admin so‘rovi bajarilmadi.',
  };
  return fail(code, body?.message || defaults[code] || defaults.NETWORK_ERROR, {
    retryable: code === 'NETWORK_ERROR' || code === 'RATE_LIMITED',
    requestId: body?.requestId || undefined,
  });
}

export function createLiveAdminAdapter({ endpoint, botId, fetchImpl = globalThis.fetch, tokenStore } = {}) {
  const url = safeEndpoint(endpoint);
  const locator = String(botId || '').trim();
  if (!/^\d+$/.test(locator)) throw new TypeError('botId raqam bo‘lishi kerak');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');
  if (!tokenStore?.get) throw new TypeError('tokenStore kerak');

  return Object.freeze({
    async invoke(action, payload = {}, options = {}) {
      const name = String(action || '');
      if (!name) return fail('VALIDATION_ERROR', 'Admin action kerak.');
      if (!ACTION_SET.has(name)) return fail('CAPABILITY_UNAVAILABLE', 'Bu admin action web live adapterida ochilmagan.');
      const token = String(tokenStore.get() || '');
      if (!token) return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      const headers = { 'content-type': 'application/json', authorization: `UStoreSession ${token}` };
      if (options?.requestId) headers['x-request-id'] = String(options.requestId).slice(0, 120);
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST', headers,
          body: JSON.stringify({ action: name, payload: payload && typeof payload === 'object' ? payload : {}, clientMode: 'web', botId: locator }),
          credentials: 'omit',
        });
      } catch (_) {
        return fail('NETWORK_ERROR', 'Shop admin serveriga ulanib bo‘lmadi.', { retryable: true });
      }
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok || body?.error) return normalizeError(body, response.status);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('CONTRACT_MISMATCH', 'Server javobi noto‘g‘ri.');
      return ok(body || {});
    },
  });
}
