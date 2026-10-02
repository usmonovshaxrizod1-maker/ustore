import { decryptBotToken } from './bot-token-crypto.ts';
import { verifyTelegramInitData } from './telegram.ts';
import { resolveSession } from './web-auth.ts';

export type ShopTenantContext = {
  botId: string;
  shopId: string;
  publicCode: string;
  botUsername: string | null;
  tokenCiphertext: string;
  tokenIv: string;
  billzAccessGranted: boolean;
  clickAccessGranted: boolean;
  paymeAccessGranted: boolean;
  uzumAccessGranted: boolean;
};

export type TelegramShopIdentity = {
  botToken: string;
  tgId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
};

export function readShopLocator(req: Request, body: any): string {
  const url = new URL(req.url);
  return String(body?.botId ?? url.searchParams.get('bot_id') ?? '').trim();
}

export async function resolveShopTenant(db: any, req: Request, body: any): Promise<
  | { ok: true; tenant: ShopTenantContext }
  | { ok: false; error: string; status: number }
> {
  const rawBotId = readShopLocator(req, body);
  if (!rawBotId || !/^\d+$/.test(rawBotId)) return { ok: false, error: 'missing_or_invalid_bot_id', status: 400 };

  const { data: botRow, error: botErr } = await db.from('shop_bots')
    .select('shop_id,telegram_bot_id,bot_username,token_ciphertext,token_iv,status')
    .eq('telegram_bot_id', rawBotId).maybeSingle();
  if (botErr) throw botErr;
  if (!botRow || botRow.status !== 'ACTIVE') return { ok: false, error: 'unknown_or_disabled_bot', status: 404 };

  const { data: shopRow, error: shopErr } = await db.from('shops')
    .select('id,public_code,status,billz_access_granted,click_access_granted,payme_access_granted,uzum_access_granted')
    .eq('id', botRow.shop_id).maybeSingle();
  if (shopErr) throw shopErr;
  if (!shopRow || shopRow.status !== 'ACTIVE') {
    const status = shopRow?.status;
    const error = status === 'PROVISIONING' ? 'shop_not_active_yet'
      : status === 'FROZEN' ? 'shop_frozen'
      : status === 'TERMINATED' ? 'shop_terminated'
      : 'shop_disabled';
    return { ok: false, error, status: 403 };
  }

  return {
    ok: true,
    tenant: {
      botId: rawBotId,
      shopId: String(botRow.shop_id),
      publicCode: String(shopRow.public_code || botRow.shop_id),
      botUsername: botRow.bot_username || null,
      tokenCiphertext: String(botRow.token_ciphertext || ''),
      tokenIv: String(botRow.token_iv || ''),
      billzAccessGranted: shopRow.billz_access_granted === true,
      clickAccessGranted: shopRow.click_access_granted === true,
      paymeAccessGranted: shopRow.payme_access_granted === true,
      uzumAccessGranted: shopRow.uzum_access_granted === true,
    },
  };
}

export async function authenticateTelegramShopTenant(tenant: ShopTenantContext, body: any, masterKey: string): Promise<
  | { ok: true; identity: TelegramShopIdentity }
  | { ok: false; error: string; status: number }
> {
  let botToken = '';
  try {
    botToken = await decryptBotToken(masterKey, tenant.tokenCiphertext, tenant.tokenIv);
  } catch (error) {
    console.error('[SHOP_CONTEXT_BOT_TOKEN_DECRYPT_FAILED]', { shopId: tenant.shopId, code: (error as any)?.code || 'unknown' });
    return { ok: false, error: 'bot_token_decrypt_failed', status: 500 };
  }
  const verified = await verifyTelegramInitData(String(body?.initData || ''), botToken);
  if (!verified.ok) return { ok: false, error: `auth_failed:${'reason' in verified ? verified.reason : 'invalid'}`, status: 401 };
  return { ok: true, identity: { botToken, tgId: verified.tgId, firstName: verified.firstName, lastName: verified.lastName, username: verified.username } };
}

export function readWebSessionToken(req: Request): string {
  const raw = String(req.headers.get('authorization') || '');
  const match = raw.match(/^UStoreSession\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

// Ordinary parallel shop reads/writes must not compete to replace one token.
// Rotation belongs to explicit web-auth get_session.
export async function resolveOptionalWebSession(db: any, req: Request, rotate = false): Promise<
  | { ok: true; session: null }
  | { ok: true; session: { accountId: string; sessionId: string; expiresAt: string; replacementToken?: string } }
  | { ok: false; error: string; status: number }
> {
  const token = readWebSessionToken(req);
  if (!token) return { ok: true, session: null };
  const session = await resolveSession(db, token, rotate);
  if (!session) return { ok: false, error: 'session_expired', status: 401 };
  return { ok: true, session };
}
