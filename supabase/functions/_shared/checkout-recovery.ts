// A transport failure does not prove that the database transaction rolled back.
// Keep the uploaded receipt unless PostgreSQL reported a failed transaction and
// a tenant-scoped read confirms that no order references this checkout attempt.
export async function recoverCheckoutAttempt(db: any, shopId: string, checkoutKey: string, tgId: string | null, failure: any) {
  try {
    const result = await db.from('orders').select('*').eq('shop_id', shopId).eq('checkout_key', checkoutKey).maybeSingle();
    if (result.error) return { order: null, conflict: false, canRemoveReceipt: false };
    if (result.data) return {
      order: result.data.tg_id === tgId ? result.data : null,
      conflict: result.data.tg_id !== tgId,
      canRemoveReceipt: false,
    };
    const definiteAbort = /^(?:P0001|(?:22|23)[0-9A-Z]{3}|40001|40P01|42501|42703)$/.test(String(failure?.code || ''));
    return { order: null, conflict: false, canRemoveReceipt: definiteAbort };
  } catch {
    return { order: null, conflict: false, canRemoveReceipt: false };
  }
}
