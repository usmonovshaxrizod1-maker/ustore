// Astra 7a-7c domain registry/provider/routing foundation.
export const RESERVED_SLUGS = new Set(['www','admin','api','app','auth','login','account','accounts','platform','support','help','mail','email','smtp','ftp','cdn','assets','static','status','billing','docs','dev','test','staging','localhost','ustore']);
export function normalizeShopSlug(value: unknown): string {
  const slug = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) || RESERVED_SLUGS.has(slug)) throw new Error('invalid_slug');
  return slug;
}
export function normalizeDomainHostname(value: unknown): string {
  const hostname = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (hostname.length > 253 || !hostname.includes('.') || !/^[a-z0-9.-]+$/.test(hostname)) throw new Error('invalid_hostname');
  const labels = hostname.split('.');
  if (labels.some(x => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)) || !/^[a-z][a-z0-9-]*$/.test(labels.at(-1)!)) throw new Error('invalid_hostname');
  if (['localhost','local','internal','test','example','invalid'].includes(labels.at(-1)!)) throw new Error('invalid_hostname');
  return hostname;
}
export type DomainState = 'DRAFT'|'PENDING_DNS'|'VERIFYING'|'PENDING_TLS'|'ACTIVE'|'ERROR'|'REMOVING';
const EDGES: Record<DomainState, readonly DomainState[]> = {
  DRAFT: ['PENDING_DNS','VERIFYING','ERROR','REMOVING'], PENDING_DNS: ['VERIFYING','ERROR','REMOVING'],
  VERIFYING: ['PENDING_DNS','PENDING_TLS','ACTIVE','ERROR','REMOVING'], PENDING_TLS: ['ACTIVE','VERIFYING','ERROR','REMOVING'],
  ACTIVE: ['VERIFYING','ERROR','REMOVING'], ERROR: ['PENDING_DNS','VERIFYING','REMOVING'], REMOVING: [],
};
export function canTransitionDomain(from: DomainState, to: DomainState): boolean { return !!EDGES[from] && !!EDGES[to] && (from === to || (from !== 'REMOVING' && to !== 'DRAFT' && !(to === 'ACTIVE' && ['DRAFT','PENDING_DNS'].includes(from)))); }
export function publicDomain(row: any) {
  return { id: row.id, hostname: row.hostname, kind: row.kind, status: row.status,
    ownershipVerified: row.ownership_verified === true, dnsStatus: row.dns_status, tlsStatus: row.tls_status,
    isPrimary: row.is_primary === true, records: row.dns_records || [], lastCheckedAt: row.last_checked_at || null,
    errorCode: row.error_code || null };
}

type ProviderSnapshot = { providerId: string; ownershipVerified: boolean; dnsStatus: 'PENDING'|'VERIFIED'|'ERROR'; tlsStatus: 'PENDING'|'ACTIVE'|'ERROR'; records: any[]; rawStatus?: string|null; errorCode?: string|null };
export type DomainProvider = {
  name: string;
  createHostname(hostname: string, idempotencyKey: string): Promise<ProviderSnapshot>;
  inspectHostname(providerId: string): Promise<ProviderSnapshot>;
  deleteHostname(providerId: string): Promise<void>;
};
export function createUnconfiguredDomainProvider(): DomainProvider {
  const unavailable = async (): Promise<never> => { throw new Error('domain_provider_unavailable'); };
  return Object.freeze({ name: 'UNCONFIGURED', createHostname: unavailable, inspectHostname: unavailable, deleteHostname: unavailable });
}

function cfRecord(record: any, purpose: string) {
  const value = record?.value || record?.txt_record || record?.txt_value || record?.cname_target;
  const name = record?.name || record?.txt_name || record?.cname || record?.hostname;
  if (!value || !name) return null;
  return { type: String(record.type || (record.cname ? 'CNAME' : 'TXT')).toUpperCase(), name: String(name), value: String(value), purpose };
}
function cloudflareSnapshot(result: any): ProviderSnapshot {
  const hostStatus = String(result?.status || '').toLowerCase();
  const sslStatus = String(result?.ssl?.status || '').toLowerCase();
  const ownership = result?.ownership_verification || null;
  const target = String(Deno.env.get('CLOUDFLARE_SAAS_CNAME_TARGET') || '').trim().toLowerCase().replace(/\.$/, '');
  const records = [cfRecord(ownership, 'OWNERSHIP'), ...((result?.ssl?.validation_records || []).map((r: any) => cfRecord(r, 'TLS'))),
    target && result?.hostname ? { type: 'CNAME', name: String(result.hostname), value: target, purpose: 'ROUTING' } : null].filter(Boolean);
  if (!result?.id || typeof result.id !== 'string') throw new Error('domain_provider_error');
  const ownershipVerified = hostStatus === 'active';
  const dnsStatus = hostStatus === 'active' ? 'VERIFIED' : ['blocked','pending_blocked','pending_deletion','moved','deleted'].includes(hostStatus) ? 'ERROR' : 'PENDING';
  const tlsStatus = sslStatus === 'active' ? 'ACTIVE' : ['validation_timed_out','validation_failed','deleted'].includes(sslStatus) ? 'ERROR' : 'PENDING';
  return { providerId: String(result?.id || ''), ownershipVerified, dnsStatus, tlsStatus, records, rawStatus: hostStatus || null, errorCode: dnsStatus === 'ERROR' || tlsStatus === 'ERROR' ? `CF_${(sslStatus || hostStatus || 'ERROR').toUpperCase()}` : null };
}
export function createCloudflareDomainProvider(fetchImpl: typeof fetch = fetch): DomainProvider {
  const token = String(Deno.env.get('CLOUDFLARE_API_TOKEN') || '');
  const zoneId = String(Deno.env.get('CLOUDFLARE_ZONE_ID') || '');
  if (!token || !zoneId) return createUnconfiguredDomainProvider();
  const base = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/custom_hostnames`;
  async function call(url: string, init: RequestInit) {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000), redirect: 'error', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    if (init.method === 'DELETE' && response.status === 404) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) { const err: any = new Error(response.status === 403 ? 'domain_provider_capability' : 'domain_provider_error'); err.status = response.status; throw err; }
    return body?.result;
  }
  return Object.freeze({
    name: 'CLOUDFLARE',
    async createHostname(hostname, idempotencyKey) {
      // The database operation claim serializes calls. Never assume an undocumented idempotency header.
      const existing = await call(`${base}?hostname=${encodeURIComponent(hostname)}`, { method: 'GET' });
      if (!Array.isArray(existing)) throw new Error('domain_provider_error');
      const matches = existing.filter((item: any) => item?.hostname === hostname);
      if (matches.length > 1) throw new Error('domain_provider_error');
      if (matches.length === 1) {
        // Custom metadata is unavailable on Cloudflare for SaaS Free/Pro/Business.
        // The database reserves hostnames uniquely before reaching this provider.
        // Still reject an explicit key belonging to a different operation.
        const existingKey = matches[0]?.custom_metadata?.ustore_domain_key;
        if (existingKey && existingKey !== idempotencyKey) throw new Error('domain_provider_error');
        return cloudflareSnapshot(matches[0]);
      }
      const result = await call(base, { method: 'POST', body: JSON.stringify({ hostname, ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } } }) });
      return cloudflareSnapshot(result);
    },
    async inspectHostname(providerId) { return cloudflareSnapshot(await call(`${base}/${encodeURIComponent(providerId)}`, { method: 'GET' })); },
    async deleteHostname(providerId) { await call(`${base}/${encodeURIComponent(providerId)}`, { method: 'DELETE' }); },
  });
}

export async function requireDomainManager(db: any, shopId: string, tgId: string) {
  const { data, error } = await db.rpc('ustore_can_manage_domains', { p_shop_id: shopId, p_tg_id: tgId });
  if (error) throw error;
  if (data !== true) throw new Error('forbidden:domains.manage');
}
async function readOwnedDomain(db: any, shopId: string, domainId: string) {
  const { data, error } = await db.from('shop_domains').select('*').eq('shop_id', shopId).eq('id', domainId).maybeSingle();
  if (error) throw error; if (!data) throw new Error('domain_not_found'); return data;
}
function stateFromSnapshot(row: any, snap: ProviderSnapshot, routingReady: boolean): DomainState {
  if (snap.dnsStatus === 'ERROR' || snap.tlsStatus === 'ERROR') return 'ERROR';
  if (!snap.ownershipVerified || snap.dnsStatus !== 'VERIFIED') return 'PENDING_DNS';
  if (snap.tlsStatus !== 'ACTIVE' || !routingReady || !canTransitionDomain(row.status, 'ACTIVE')) return 'PENDING_TLS';
  return 'ACTIVE';
}
async function routingCnameVerified(hostname: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const target = String(Deno.env.get('CLOUDFLARE_SAAS_CNAME_TARGET') || '').trim().toLowerCase().replace(/\.$/, '');
  if (!target || Deno.env.get('USTORE_CUSTOM_DOMAIN_ROUTING_READY') !== 'true') return false;
  const lookup = async (name: string, type: string) => {
    const query = new URL('https://cloudflare-dns.com/dns-query');
    query.searchParams.set('name', name); query.searchParams.set('type', type);
    const response = await fetchImpl(query.href, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result.Answer) ? result.Answer : [];
  };
  try {
    const cname = await lookup(hostname, 'CNAME');
    if (cname.some((record: any) => record.type === 5 && String(record.data || '').toLowerCase().replace(/\.$/, '') === target)) return true;
    // Apex domains may flatten the CNAME. Require at least one matching
    // public address from the target rather than accepting arbitrary A records.
    const [hostA, targetA, hostAAAA, targetAAAA] = await Promise.all([
      lookup(hostname, 'A'), lookup(target, 'A'), lookup(hostname, 'AAAA'), lookup(target, 'AAAA'),
    ]);
    const targetAddresses = new Set([...targetA, ...targetAAAA].map((r: any) => String(r.data || '')));
    return targetAddresses.size > 0 && [...hostA, ...hostAAAA].some((r: any) => targetAddresses.has(String(r.data || '')));
  } catch (_) { return false; }
}
async function persistSnapshot(db: any, row: any, provider: DomainProvider, snap: ProviderSnapshot) {
  // Cloudflare can pre-validate a hostname before its DNS points at our SaaS
  // zone. Both provider states AND real public CNAME routing are required.
  const routingReady = snap.ownershipVerified && snap.tlsStatus === 'ACTIVE' && await routingCnameVerified(row.hostname);
  const nextStatus = stateFromSnapshot(row, snap, routingReady);
  const patch = { provider_name: provider.name, provider_id: snap.providerId || row.provider_id, ownership_verified: snap.ownershipVerified, dns_status: snap.dnsStatus,
    tls_status: snap.tlsStatus, routing_ready: routingReady, dns_records: snap.records, status: nextStatus,
    error_code: snap.errorCode || (snap.tlsStatus === 'ACTIVE' && !routingReady ? 'ROUTING_DNS_PENDING' : null),
    last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(), revision: Number(row.revision || 0) + 1 };
  const { data, error } = await db.from('shop_domains').update(patch).eq('id', row.id).eq('shop_id', row.shop_id).eq('revision', row.revision).select('*').maybeSingle();
  if (error) throw error; if (!data) throw new Error('domain_revision_conflict'); return data;
}

export async function handleShopDomainAction(db: any, shopId: string, tgId: string, action: string, payload: any, baseHostname: string) {
  await requireDomainManager(db, shopId, tgId);
  if (action === 'domains_list') {
    const { data, error } = await db.from('shop_domains').select('*').eq('shop_id', shopId).order('created_at');
    if (error) throw error; return { items: (data || []).map(publicDomain) };
  }
  if (action === 'domains_add' || action === 'domains_reserve_slug') {
    const base = normalizeDomainHostname(baseHostname);
    const slug = action === 'domains_reserve_slug' ? normalizeShopSlug(payload?.slug) : null;
    const hostname = slug ? `${slug}.${base}` : normalizeDomainHostname(payload?.hostname);
    if (!slug && (hostname === base || hostname.endsWith(`.${base}`))) throw new Error('invalid_hostname');
    const { data, error } = await db.rpc('ustore_reserve_shop_domain', { p_shop_id: shopId, p_tg_id: tgId, p_hostname: hostname, p_slug: slug, p_base_hostname: base });
    if (error) throw error; return { domain: publicDomain(data) };
  }
  if (action === 'domains_change_slug') {
    const base = normalizeDomainHostname(baseHostname);
    const slug = normalizeShopSlug(payload?.slug);
    const { data, error } = await db.rpc('ustore_change_shop_subdomain', {
      p_shop_id: shopId, p_tg_id: tgId, p_slug: slug, p_base_hostname: base,
    });
    if (error) throw error;
    let row = data;
    if (Deno.env.get('USTORE_WILDCARD_READY') === 'true') {
      const activated = await db.rpc('ustore_activate_shop_subdomain', { p_shop_id: shopId, p_base_hostname: base });
      if (activated.error) throw activated.error;
      row = activated.data || row;
    }
    return { domain: publicDomain(row) };
  }
  const domainId = String(payload?.domainId || ''); if (!domainId) throw new Error('invalid_domain_id');
  if (action === 'domains_verify') {
    let row = await readOwnedDomain(db, shopId, domainId);
    if (row.status === 'REMOVING') throw new Error('domain_removing');
    const provider = createCloudflareDomainProvider();
    if (row.kind === 'CUSTOM' && provider.name === 'UNCONFIGURED') throw new Error('domain_provider_unavailable');
    if (row.kind === 'SUBDOMAIN' && Deno.env.get('USTORE_WILDCARD_READY') !== 'true') throw new Error('domain_provider_unavailable');
    const { data: claimed, error: claimError } = await db.rpc('ustore_claim_domain_operation', { p_shop_id: shopId, p_tg_id: tgId, p_domain_id: domainId, p_operation: 'VERIFY' });
    if (claimError) throw claimError;
    row = claimed;
    let snap: ProviderSnapshot;
    if (row.kind === 'SUBDOMAIN') {
      // Wildcard subdomains are routed by 7c infrastructure; no per-host provider object is created.
      const patch = { ownership_verified: true, dns_status: 'VERIFIED', tls_status: 'ACTIVE', routing_ready: true, status: canTransitionDomain(row.status, 'ACTIVE') ? 'ACTIVE' : 'PENDING_TLS', last_checked_at: new Date().toISOString(), error_code: null, revision: Number(row.revision || 0) + 1 };
      const { data, error } = await db.from('shop_domains').update(patch).eq('id', row.id).eq('revision', row.revision).select('*').single(); if (error) throw error; row = data;
    } else {
      snap = row.provider_id ? await provider.inspectHostname(row.provider_id) : await provider.createHostname(row.hostname, `ustore-domain-${row.id}`);
      row = await persistSnapshot(db, row, provider, snap);
    }
    const { error: releaseError } = await db.rpc('ustore_release_domain_operation', { p_domain_id: domainId, p_operation: 'VERIFY' });
    if (releaseError) throw releaseError;
    return { domain: publicDomain(row) };
  }
  if (action === 'domains_set_primary') {
    const { data, error } = await db.rpc('ustore_set_primary_domain', { p_shop_id: shopId, p_tg_id: tgId, p_domain_id: domainId });
    if (error) throw error; return { domain: publicDomain(data) };
  }
  if (action === 'domains_remove') {
    let row = await readOwnedDomain(db, shopId, domainId);
    if (row.kind !== 'CUSTOM') throw new Error('cannot_remove_default_subdomain');
    const { error: claimError } = await db.rpc('ustore_claim_domain_operation', { p_shop_id: shopId, p_tg_id: tgId, p_domain_id: domainId, p_operation: 'REMOVE' });
    if (claimError) throw claimError;
    const { data: marked, error: markError } = await db.rpc('ustore_mark_domain_removing', { p_shop_id: shopId, p_tg_id: tgId, p_domain_id: domainId });
    if (markError) throw markError; row = marked;
    if (row.provider_id) await createCloudflareDomainProvider().deleteHostname(row.provider_id);
    const { data, error } = await db.rpc('ustore_finalize_domain_removal', { p_shop_id: shopId, p_tg_id: tgId, p_domain_id: domainId });
    if (error) throw error; return { removed: true, domain: publicDomain(data) };
  }
  throw new Error('domain_provider_unavailable');
}

// Called only after platform-api verifies the central platform Super Admin.
// This uses service-role access, always scopes by shop_id, and audits the real
// platform actor rather than pretending to be the shop owner.
export async function handlePlatformDomainAction(db: any, shopId: string, actorTgId: string, action: string, payload: any, baseHostname: string) {
  const { data: shop, error: shopError } = await db.from('shops').select('id,status').eq('id', shopId).maybeSingle();
  if (shopError) throw shopError;
  if (!shop || shop.status === 'TERMINATED') throw new Error('shop_not_found');
  const audit = async (event: string, row: any, details: any = {}) => {
    const result = await db.from('admin_audit_log').insert({ shop_id: shopId, admin_tg_id: actorTgId,
      action: event, entity_type: 'DOMAIN', entity_id: String(row.id), details: { hostname: row.hostname, ...details } });
    if (result.error) throw result.error;
  };
  if (action === 'list') {
    const { data, error } = await db.from('shop_domains').select('*').eq('shop_id', shopId).order('created_at');
    if (error) throw error;
    return { items: (data || []).map(publicDomain) };
  }
  if (action === 'change_slug') {
    const slug = normalizeShopSlug(payload?.slug);
    const { data, error } = await db.rpc('ustore_platform_change_shop_subdomain', {
      p_shop_id: shopId, p_actor_tg_id: actorTgId, p_slug: slug, p_base_hostname: normalizeDomainHostname(baseHostname),
    });
    if (error) throw error;
    let row = data;
    if (Deno.env.get('USTORE_WILDCARD_READY') === 'true') {
      const activated = await db.rpc('ustore_activate_shop_subdomain', { p_shop_id: shopId, p_base_hostname: baseHostname });
      if (activated.error) throw activated.error;
      row = activated.data || row;
    }
    return { domain: publicDomain(row) };
  }
  if (action === 'add') {
    const hostname = normalizeDomainHostname(payload?.hostname);
    const base = normalizeDomainHostname(baseHostname);
    if (hostname === base || hostname.endsWith(`.${base}`)) throw new Error('invalid_hostname');
    const { data, error } = await db.from('shop_domains').insert({ shop_id: shopId, hostname, kind: 'CUSTOM' }).select('*').single();
    if (error) throw error;
    await audit('PLATFORM_DOMAIN_RESERVED', data);
    return { domain: publicDomain(data) };
  }
  const domainId = String(payload?.domainId || '');
  if (!/^[0-9a-f-]{36}$/i.test(domainId)) throw new Error('invalid_domain_id');
  let row = await readOwnedDomain(db, shopId, domainId);
  if (action === 'verify') {
    if (row.status === 'REMOVING') throw new Error('domain_removing');
    if (row.kind === 'SUBDOMAIN') {
      if (Deno.env.get('USTORE_WILDCARD_READY') !== 'true') throw new Error('domain_provider_unavailable');
      const result = await db.rpc('ustore_activate_shop_subdomain', { p_shop_id: shopId, p_base_hostname: baseHostname });
      if (result.error) throw result.error;
      await audit('PLATFORM_DOMAIN_VERIFY_REQUESTED', row, { status: result.data?.status });
      return { domain: publicDomain(result.data) };
    }
    const provider = createCloudflareDomainProvider();
    if (provider.name === 'UNCONFIGURED') throw new Error('domain_provider_unavailable');
    const claim = await db.from('shop_domains').update({ operation_kind: 'VERIFY', operation_started_at: new Date().toISOString() })
      .eq('shop_id', shopId).eq('id', domainId).is('operation_kind', null).select('*').maybeSingle();
    if (claim.error) throw claim.error;
    if (!claim.data) throw new Error('domain_operation_busy');
    row = claim.data;
    const snap = row.provider_id ? await provider.inspectHostname(row.provider_id) : await provider.createHostname(row.hostname, `ustore-domain-${row.id}`);
    row = await persistSnapshot(db, row, provider, snap);
    const release = await db.from('shop_domains').update({ operation_kind: null, operation_started_at: null })
      .eq('shop_id', shopId).eq('id', domainId).eq('operation_kind', 'VERIFY').select('*').single();
    if (release.error) throw release.error;
    row = release.data;
    await audit('PLATFORM_DOMAIN_VERIFY_REQUESTED', row, { status: row.status, dnsStatus: row.dns_status, tlsStatus: row.tls_status });
    return { domain: publicDomain(row) };
  }
  if (action === 'set_primary') {
    const result = await db.rpc('ustore_platform_set_primary_domain', { p_shop_id: shopId, p_actor_tg_id: actorTgId, p_domain_id: domainId });
    if (result.error) throw result.error;
    return { domain: publicDomain(result.data) };
  }
  if (action === 'remove') {
    if (row.kind !== 'CUSTOM') throw new Error('cannot_remove_default_subdomain');
    if (row.operation_kind) throw new Error('domain_operation_busy');
    const marked = await db.from('shop_domains').update({ status: 'REMOVING', routing_ready: false, is_primary: false,
      operation_kind: 'REMOVE', operation_started_at: new Date().toISOString() })
      .eq('shop_id', shopId).eq('id', domainId).is('operation_kind', null).select('*').maybeSingle();
    if (marked.error) throw marked.error;
    if (!marked.data) throw new Error('domain_operation_busy');
    row = marked.data;
    if (row.provider_id) await createCloudflareDomainProvider().deleteHostname(row.provider_id);
    const handoffs = await db.from('web_origin_auth_handoffs').delete().eq('target_domain_id', domainId);
    if (handoffs.error) throw handoffs.error;
    const target = await db.from('shop_settings').update({ telegram_mini_app_domain_id: null, telegram_mini_app_updated_at: new Date().toISOString() })
      .eq('shop_id', shopId).eq('telegram_mini_app_domain_id', domainId);
    if (target.error) throw target.error;
    const deleted = await db.from('shop_domains').delete().eq('shop_id', shopId).eq('id', domainId).eq('status', 'REMOVING');
    if (deleted.error) throw deleted.error;
    await audit('PLATFORM_DOMAIN_REMOVED', row);
    return { removed: true, domain: publicDomain(row) };
  }
  throw new Error('invalid_domain_action');
}

export async function resolveActiveDomainRoute(db: any, hostnameInput: string) {
  const hostname = normalizeDomainHostname(hostnameInput);
  const { data, error } = await db.from('shop_domains').select('id,shop_id,hostname,is_primary,status,routing_ready,shops!inner(status)').eq('shops.status','ACTIVE').eq('hostname', hostname).eq('status','ACTIVE').eq('routing_ready',true).maybeSingle();
  if (error) throw error; return data || null;
}
