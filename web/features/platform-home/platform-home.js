import { createButton, createStatePanel } from '../../components/ui.js';

const BENEFITS = Object.freeze([
  ['Katalog va mahsulotlar', 'Mahsulotlar, kategoriyalar, narx va qoldiqni bitta joydan boshqaring.'],
  ['Buyurtmalar', 'Buyurtmalarni qabul qiling, holatini kuzating va mijoz bilan ishlang.'],
  ['Ombor nazorati', 'Qoldiq va tugayotgan mahsulotlarni variantlar kesimida kuzating.'],
  ['Marketing va hisobotlar', 'Aksiyalar, promo-kodlar va mavjud real hisobotlardan foydalaning.'],
  ['To‘lovlar', 'Do‘koningiz uchun mavjud to‘lov usullarini sozlang.'],
  ['Yetkazib berish', 'Yetkazib berish usullari, hududlar va shartlarni boshqaring.'],
]);

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Platform home UI uchun DOM document kerak.');
  return doc;
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('uz-UZ').format(Math.round(amount))} so‘m` : '—';
}

function productLimitLabel(limit) {
  const count = Number(limit);
  if (limit == null || !Number.isFinite(count)) return 'Mahsulot limiti cheklanmagan';
  return `${new Intl.NumberFormat('uz-UZ').format(Math.max(0, Math.trunc(count)))} tagacha mahsulot`;
}

function normalizeTariff(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();
  const price = Number(raw.price);
  if (!id || !name || !Number.isFinite(price) || price < 0) return null;
  return Object.freeze({
    id,
    name,
    price,
    productLimit: raw.productLimit == null ? null : Number(raw.productLimit),
    isPopular: raw.isPopular === true,
    features: Array.isArray(raw.features) ? raw.features.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8) : [],
  });
}

export function createPlatformHomeController({ platformPort } = {}) {
  if (!platformPort?.invoke) throw new TypeError('platformPort.invoke kerak');
  let state = { status: 'idle', tariffs: [], error: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn({ ...state, tariffs: [...state.tariffs] }));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return state; };
  return Object.freeze({
    getState: () => ({ ...state, tariffs: [...state.tariffs] }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async load() {
      if (state.status === 'loading') return null;
      set({ status: 'loading', error: null });
      const result = await platformPort.invoke('platform_public_catalog', {});
      if (!result?.ok) {
        set({ status: 'error', error: result?.error || { code: 'NETWORK_ERROR', message: 'Tariflarni yuklab bo‘lmadi.' } });
        return result;
      }
      const tariffs = (Array.isArray(result.data?.tariffs) ? result.data.tariffs : []).map(normalizeTariff).filter(Boolean);
      set({ status: 'ready', tariffs, error: null });
      return result;
    },
  });
}

function makeBrand(doc) {
  const brand = doc.createElement('a');
  brand.className = 'uw-platform-brand';
  brand.href = '#platform-top';
  brand.setAttribute('aria-label', 'UStorE bosh sahifa');
  const mark = doc.createElement('span'); mark.className = 'uw-platform-brand__mark'; mark.textContent = 'U';
  const name = doc.createElement('strong'); name.textContent = 'UStorE';
  brand.append(mark, name);
  return brand;
}

function createTariffCard(tariff, { doc, onChoosePlan }) {
  const card = doc.createElement('article');
  card.className = 'uw-platform-plan';
  card.dataset.popular = tariff.isPopular ? 'true' : 'false';
  if (tariff.isPopular) {
    const badge = doc.createElement('span'); badge.className = 'uw-platform-plan__badge'; badge.textContent = 'Ommabop'; card.append(badge);
  }
  const heading = doc.createElement('div'); heading.className = 'uw-platform-plan__heading';
  const name = doc.createElement('h3'); name.textContent = tariff.name;
  const limit = doc.createElement('p'); limit.textContent = productLimitLabel(tariff.productLimit);
  heading.append(name, limit);
  const price = doc.createElement('div'); price.className = 'uw-platform-plan__price';
  const amount = doc.createElement('strong'); amount.textContent = money(tariff.price);
  const period = doc.createElement('span'); period.textContent = '/ oy';
  price.append(amount, period);
  card.append(heading, price);

  if (tariff.features.length) {
    const list = doc.createElement('ul'); list.className = 'uw-platform-plan__features';
    for (const feature of tariff.features) {
      const row = doc.createElement('li');
      const check = doc.createElement('span'); check.setAttribute('aria-hidden', 'true'); check.textContent = '✓';
      const text = doc.createElement('span'); text.textContent = feature;
      row.append(check, text); list.append(row);
    }
    card.append(list);
  }
  card.append(createButton({ label: 'Kirish va tanlash', variant: tariff.isPopular ? 'primary' : 'secondary', onClick: () => onChoosePlan?.(tariff) }, doc));
  return card;
}

export function createPlatformHomeView({ controller, state = controller?.getState?.() || {}, onLogin, onChoosePlan } = {}, documentRef) {
  const doc = getDocument(documentRef);
  if (!controller) throw new TypeError('controller kerak');
  const page = doc.createElement('div');
  page.className = 'uw-platform-home uw-root';
  page.id = 'platform-top';
  page.dataset.feature = 'platform-home';

  const header = doc.createElement('header'); header.className = 'uw-platform-header';
  const headerInner = doc.createElement('div'); headerInner.className = 'uw-platform-container uw-platform-header__inner';
  const nav = doc.createElement('nav'); nav.className = 'uw-platform-nav'; nav.setAttribute('aria-label', 'Asosiy navigatsiya');
  for (const [label, href] of [['Imkoniyatlar','#platform-benefits'], ['Tariflar','#platform-pricing']]) {
    const link = doc.createElement('a'); link.href = href; link.textContent = label; nav.append(link);
  }
  const login = createButton({ label: 'Kirish', variant: 'secondary', size: 'sm', onClick: () => onLogin?.() }, doc);
  headerInner.append(makeBrand(doc), nav, login); header.append(headerInner);

  const main = doc.createElement('main'); main.id = 'uw-main-content';
  const hero = doc.createElement('section'); hero.className = 'uw-platform-hero';
  const heroInner = doc.createElement('div'); heroInner.className = 'uw-platform-container uw-platform-hero__inner';
  const heroCopy = doc.createElement('div'); heroCopy.className = 'uw-platform-hero__copy';
  const eyebrow = doc.createElement('span'); eyebrow.className = 'uw-platform-eyebrow'; eyebrow.textContent = 'Telegram uchun e-do‘kon platformasi';
  const h1 = doc.createElement('h1'); h1.textContent = 'Telegram’da o‘z e-do‘koningizni oching';
  const intro = doc.createElement('p'); intro.textContent = 'Mahsulotlarni boshqaring, buyurtmalarni qabul qiling, to‘lov va yetkazib berishni sozlang — barchasi bitta tizimda.';
  const heroActions = doc.createElement('div'); heroActions.className = 'uw-platform-hero__actions';
  heroActions.append(
    createButton({ label: 'Do‘kon ochishni boshlash', size: 'lg', onClick: () => onLogin?.({ intent: 'new-shop' }) }, doc),
    createButton({ label: 'Tariflarni ko‘rish', variant: 'secondary', size: 'lg', onClick: () => globalThis.document?.getElementById?.('platform-pricing')?.scrollIntoView?.({ behavior: 'smooth' }) }, doc),
  );
  heroCopy.append(eyebrow, h1, intro, heroActions);

  const visual = doc.createElement('div'); visual.className = 'uw-platform-visual'; visual.setAttribute('aria-hidden', 'true');
  const windowNode = doc.createElement('div'); windowNode.className = 'uw-platform-visual__window';
  const windowTop = doc.createElement('div'); windowTop.className = 'uw-platform-visual__top';
  for (let i = 0; i < 3; i += 1) { const dot = doc.createElement('span'); windowTop.append(dot); }
  const windowBody = doc.createElement('div'); windowBody.className = 'uw-platform-visual__body';
  for (const [title, text] of [['Katalog','Mahsulotlar va kategoriyalar'], ['Buyurtmalar','Yagona boshqaruv oqimi'], ['Ombor','Qoldiq nazorati']]) {
    const row = doc.createElement('div'); row.className = 'uw-platform-visual__row';
    const icon = doc.createElement('span'); icon.className = 'uw-platform-visual__icon'; icon.textContent = title.slice(0,1);
    const copy = doc.createElement('div'); const strong = doc.createElement('strong'); strong.textContent = title; const small = doc.createElement('small'); small.textContent = text; copy.append(strong,small); row.append(icon,copy); windowBody.append(row);
  }
  windowNode.append(windowTop, windowBody); visual.append(windowNode);
  heroInner.append(heroCopy, visual); hero.append(heroInner); main.append(hero);

  const benefits = doc.createElement('section'); benefits.className = 'uw-platform-section'; benefits.id = 'platform-benefits';
  const benefitsInner = doc.createElement('div'); benefitsInner.className = 'uw-platform-container';
  const bh = doc.createElement('div'); bh.className = 'uw-platform-section__heading';
  const bh2 = doc.createElement('h2'); bh2.textContent = 'Savdoni bitta tizimda boshqaring';
  const bp = doc.createElement('p'); bp.textContent = 'UStorE kundalik savdo jarayonlarini Telegram do‘koni va premium web boshqaruvi bilan birlashtiradi.'; bh.append(bh2,bp);
  const grid = doc.createElement('div'); grid.className = 'uw-platform-benefit-grid';
  BENEFITS.forEach(([title, text], index) => { const item=doc.createElement('article'); item.className='uw-platform-benefit'; const num=doc.createElement('span'); num.textContent=String(index+1).padStart(2,'0'); const hh=doc.createElement('h3');hh.textContent=title;const pp=doc.createElement('p');pp.textContent=text;item.append(num,hh,pp);grid.append(item); });
  benefitsInner.append(bh,grid); benefits.append(benefitsInner); main.append(benefits);

  const pricing = doc.createElement('section'); pricing.className = 'uw-platform-section uw-platform-pricing'; pricing.id = 'platform-pricing';
  const pricingInner = doc.createElement('div'); pricingInner.className = 'uw-platform-container';
  const ph = doc.createElement('div'); ph.className = 'uw-platform-section__heading';
  const ph2 = doc.createElement('h2'); ph2.textContent = 'Tariflar';
  const pp = doc.createElement('p'); pp.textContent = 'Narx va mahsulot limiti UStorE’dagi amaldagi faol tariflardan olinadi.'; ph.append(ph2,pp); pricingInner.append(ph);
  if (state.status === 'loading' || state.status === 'idle') {
    pricingInner.append(createStatePanel({ kind: 'loading', title: 'Tariflar yuklanmoqda', message: 'Amaldagi tariflar serverdan olinmoqda.', iconText: '…' }, doc));
  } else if (state.status === 'error') {
    pricingInner.append(createStatePanel({ kind: 'error', title: 'Tariflar yuklanmadi', message: state.error?.message || 'Server bilan ulanishda xato yuz berdi.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc));
  } else if (!state.tariffs.length) {
    pricingInner.append(createStatePanel({ kind: 'empty', title: 'Hozircha faol tarif yo‘q', message: 'Faol tariflar qo‘shilganda shu yerda ko‘rinadi.' }, doc));
  } else {
    const plans = doc.createElement('div'); plans.className = 'uw-platform-plans';
    state.tariffs.forEach((tariff) => plans.append(createTariffCard(tariff, { doc, onChoosePlan })));
    pricingInner.append(plans);
  }
  pricing.append(pricingInner); main.append(pricing);

  const cta = doc.createElement('section'); cta.className = 'uw-platform-final-cta';
  const ctaInner = doc.createElement('div'); ctaInner.className = 'uw-platform-container uw-platform-final-cta__inner';
  const ctaCopy = doc.createElement('div'); const ctaH = doc.createElement('h2'); ctaH.textContent = 'Do‘koningizni UStorE bilan boshqarishni boshlang'; const ctaP = doc.createElement('p'); ctaP.textContent = 'Kirish markaziy UStorE akkaunti orqali xavfsiz bajariladi.'; ctaCopy.append(ctaH,ctaP);
  ctaInner.append(ctaCopy, createButton({ label: 'UStorE’ga kirish', size: 'lg', onClick: () => onLogin?.() }, doc)); cta.append(ctaInner); main.append(cta);

  const footer = doc.createElement('footer'); footer.className = 'uw-platform-footer';
  const footerInner = doc.createElement('div'); footerInner.className = 'uw-platform-container uw-platform-footer__inner';
  const fBrand = doc.createElement('strong'); fBrand.textContent = 'UStorE';
  const fText = doc.createElement('span'); fText.textContent = 'Onlayn do‘koningiz uchun yagona savdo platformasi.';
  footerInner.append(fBrand,fText); footer.append(footerInner);

  page.append(header, main, footer);
  return { element: page };
}

export const platformHomeCopy = Object.freeze({ benefits: BENEFITS });
