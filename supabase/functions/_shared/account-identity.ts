// UStorE central account <-> verified Telegram identity mapping.
// Kept independent from password hashing so the platform bot webhook does not
// load bcrypt merely to resolve a Telegram account.

async function linkTelegramRecords(db: any, subject: string, accountId: string): Promise<void> {
  const results = await Promise.all([
    db.from("app_users").update({ account_id: accountId }).eq("tg_id", subject).is("account_id", null),
    db.from("shop_memberships").update({ account_id: accountId }).eq("telegram_user_id", subject).is("account_id", null),
  ]);
  for (const result of results) if (result.error) throw result.error;
}

export async function ensureTelegramAccount(db: any, telegramUserId: string, displayName?: string | null): Promise<string> {
  const subject = String(telegramUserId || "").trim();
  if (!/^\d{5,20}$/.test(subject)) throw new Error("invalid_telegram_user_id");
  const { data: identity, error: identityError } = await db.from("account_identities")
    .select("account_id").eq("provider", "TELEGRAM").eq("provider_subject", subject).maybeSingle();
  if (identityError) throw identityError;
  if (identity?.account_id) {
    const id = String(identity.account_id);
    await linkTelegramRecords(db, subject, id);
    return id;
  }

  const { data: account, error: accountError } = await db.from("accounts")
    .insert({ display_name: displayName ? String(displayName).slice(0, 160) : null }).select("id").single();
  if (accountError) throw accountError;
  const { error: insertIdentityError } = await db.from("account_identities").insert({
    account_id: account.id, provider: "TELEGRAM", provider_subject: subject,
  });
  if (insertIdentityError) {
    // A transport failure may follow a committed insert. Never delete an
    // account unless a unique conflict proves another account owns the ID.
    if (String(insertIdentityError.code) !== "23505") throw insertIdentityError;
    const { data: winner, error: winnerError } = await db.from("account_identities").select("account_id")
      .eq("provider", "TELEGRAM").eq("provider_subject", subject).maybeSingle();
    if (winnerError) throw winnerError;
    if (winner?.account_id) {
      if (String(winner.account_id) !== String(account.id)) {
        const { error: cleanupError } = await db.from("accounts").delete().eq("id", account.id);
        if (cleanupError) throw cleanupError;
      }
      await linkTelegramRecords(db, subject, String(winner.account_id));
      return String(winner.account_id);
    }
    throw insertIdentityError;
  }
  const id = String(account.id);
  await linkTelegramRecords(db, subject, id);
  return id;
}
