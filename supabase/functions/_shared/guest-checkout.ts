// Guest checkout never creates user accounts or exposes private order data.
export function normalizeGuestCheckout(raw: any = {}, strict = false) {
  const phone = String(raw?.phone || '').replace(/[\s()-]/g, '');
  const socialUsername = (value: unknown, kind: 'telegram' | 'instagram') => {
    let username=String(value || '').trim().replace(/^@/,'');
    if (/^https?:\/\//i.test(username)) {
      try {
        const url=new URL(username);
        const hosts=kind==='telegram' ? ['t.me','www.t.me','telegram.me','www.telegram.me'] : ['instagram.com','www.instagram.com'];
        if (!hosts.includes(url.hostname) || url.username || url.password || url.port || !/^\/[^/]+\/?$/.test(url.pathname)) return '';
        username=url.pathname.split('/')[1];
      } catch { return ''; }
    }
    const valid=kind==='telegram' ? /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) : /^[A-Za-z0-9_.]{1,30}$/.test(username) && !['.','..'].includes(username);
    return valid ? username : '';
  };
  const telegram = socialUsername(raw?.telegram,'telegram');
  const instagram = socialUsername(raw?.instagram,'instagram');
  const validPhone = /^\+998\d{9}$/.test(phone);
  const validTelegram = !String(raw?.telegram || '').trim() || !!telegram;
  const instagramUrl = instagram ? `https://www.instagram.com/${instagram}/` : '';
  if (strict && String(raw?.instagram || '').trim() && !instagram) throw new Error('invalid_guest_instagram');
  if (strict && phone && !validPhone) throw new Error('invalid_guest_phone');
  if (strict && !validTelegram) throw new Error('invalid_guest_telegram');
  if (strict && raw?.enabled === true && !validPhone) throw new Error('guest_contact_phone_required');
  return { enabled: raw?.enabled === true && validPhone, phone: validPhone ? phone : '', telegram: validTelegram ? telegram : '', instagram: instagramUrl };
}

export function createGuestTrackingCode(): string {
  let code = '';
  while (code.length < 10) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const value of bytes) {
      if (value >= 250) continue;
      code += String(value % 10);
      if (code.length === 10) break;
    }
  }
  return code;
}

export function guestTrackingProjection(order: any) {
  return {
    code: String(order.guest_tracking_code), status: order.status, createdAt: order.created_at,
    total: Number(order.payable_total ?? order.total_price) || 0,
    paymentStatus: order.payment_status || 'PENDING',
    receiptReviewStatus: order.payment_receipt_path ? order.receipt_review_status || 'PENDING' : null,
    shipmentStatus: order.shipment?.status || 'READY',
  };
}

export async function guestRateKey(req: Request): Promise<string> {
  const address = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
