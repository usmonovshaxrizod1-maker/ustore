-- ============================================================================
-- USTORE PHASE 2 — 009: PLATFORM SHOP PROVISIONING
-- ============================================================================
-- ONE-TIME ADDITIVE migration — does NOT touch 001-008 in any way (no
-- ALTER/DROP on any existing table, no data touched). This is production
-- schema already carrying real shops; this file only ADDS a new RPC.
--
-- ustore_create_shop_provisioning() is the atomic DB half of
-- platform_connect_bot (see platform-api/index.ts). Telegram API calls
-- (getMe, setChatMenuButton, setWebhook) can never be part of a DB
-- transaction, so the split is deliberate:
--   1) THIS RPC creates shops+shop_bots+shop_memberships+empty settings
--      atomically, leaving the shop in PROVISIONING.
--   2) platform-api then does the Telegram calls OUTSIDE any transaction.
--   3) Only on full Telegram success does platform-api flip the shop to
--      ACTIVE with a plain UPDATE (no RPC needed for that one column).
--
-- RETRY SUPPORT: if platform_connect_bot is called again with a bot token
-- whose telegram_bot_id already has a shop_bots row that is STILL
-- PROVISIONING (i.e. step 2/3 above failed or was never reached last time),
-- this RPC treats it as a retry — updates the stored (re-encrypted) token
-- in case it was corrected, and returns the EXISTING shop_id instead of
-- creating a duplicate shop. A bot already attached to an ACTIVE or
-- DISABLED shop is rejected as a genuine duplicate.
-- ============================================================================

begin;

create or replace function public.ustore_create_shop_provisioning(
  p_owner_telegram_id bigint,
  p_telegram_bot_id bigint,
  p_bot_username text,
  p_bot_name text,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_last4 text
) returns jsonb
language plpgsql
as $$
declare
  v_existing_shop_id uuid;
  v_existing_shop_status text;
  v_shop_id uuid;
  v_public_code text;
begin
  select s.id, s.status into v_existing_shop_id, v_existing_shop_status
    from public.shop_bots b
    join public.shops s on s.id = b.shop_id
   where b.telegram_bot_id = p_telegram_bot_id
   for update of s;

  if v_existing_shop_id is not null then
    if v_existing_shop_status <> 'PROVISIONING' then
      raise exception 'bot_already_connected:%', v_existing_shop_status;
    end if;

    -- Retry: this bot's shop exists but never finished activation. Refresh
    -- the stored token/metadata (the admin may have re-entered a corrected
    -- token) and hand the same shop_id back rather than creating a second one.
    update public.shop_bots
       set bot_username = p_bot_username, bot_name = p_bot_name,
           token_ciphertext = p_token_ciphertext, token_iv = p_token_iv, token_last4 = p_token_last4
     where telegram_bot_id = p_telegram_bot_id;

    return jsonb_build_object('shopId', v_existing_shop_id, 'isRetry', true);
  end if;

  -- public_code: short, unique, human-referenceable — not secret, just an
  -- identifier (e.g. for support conversations "which shop is this").
  v_public_code := 'shop_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.shops (public_code, status)
  values (v_public_code, 'PROVISIONING')
  returning id into v_shop_id;

  insert into public.shop_bots (shop_id, telegram_bot_id, bot_username, bot_name, token_ciphertext, token_iv, token_last4, status)
  values (v_shop_id, p_telegram_bot_id, p_bot_username, p_bot_name, p_token_ciphertext, p_token_iv, p_token_last4, 'ACTIVE');

  insert into public.shop_memberships (shop_id, telegram_user_id, role, status)
  values (v_shop_id, p_owner_telegram_id, 'OWNER', 'ACTIVE');

  -- 9-band STEP 9: minimal empty settings — every column left at its
  -- schema default (null/empty), exactly the "new shop is business-data-
  -- zero" state the empty-template rounds already established.
  insert into public.shop_settings (shop_id) values (v_shop_id);
  insert into public.design_settings (shop_id) values (v_shop_id);

  return jsonb_build_object('shopId', v_shop_id, 'isRetry', false);
end;
$$;

revoke all on function public.ustore_create_shop_provisioning(bigint, bigint, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.ustore_create_shop_provisioning(bigint, bigint, text, text, text, text, text) to service_role;

commit;
