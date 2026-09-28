// Called only on the registered Telegram redirect URI (the platform root).
export async function completeOfficialTelegramCallback({ locationRef, historyRef, authPort, pendingStore }) {
  const url = new URL(locationRef.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (!code && !state && !error) return null;
  // The code is short-lived but must never remain in browser history/referrers.
  for (const key of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(key);
  historyRef.replaceState(historyRef.state ?? null, '', `${url.pathname}${url.search}${url.hash}`);
  if (error) {
    pendingStore.clear();
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Telegram orqali kirish bekor qilindi.' } };
  }
  if (!code || !state || code.length > 2048 || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    pendingStore.clear();
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Telegram javobi noto‘g‘ri.' } };
  }
  return authPort.completeOfficialTelegramSignIn({ code, state });
}
