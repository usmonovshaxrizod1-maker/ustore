import { createButton, createStatePanel } from '../../components/ui.js';

const BENEFITS = Object.freeze([
  ['Katalog va mahsulotlar', 'Mahsulotlar, kategoriyalar, narx va qoldiqni bitta joydan boshqaring.'],
  ['Buyurtmalar', 'Buyurtmalarni qabul qiling, holatini kuzating va mijoz bilan ishlang.'],
  ['Ombor nazorati', 'Qoldiq va tugayotgan mahsulotlarni variantlar kesimida kuzating.'],
  ['Marketing va hisobotlar', 'Aksiyalar, promo-kodlar va mavjud real hisobotlardan foydalaning.'],
  ['To‘lovlar', 'Do‘koningiz uchun mavjud to‘lov usullarini sozlang.'],
  ['Yetkazib berish', 'Yetkazib berish usullari, hududlar va shartlarni boshqaring.'],
]);

const SHOWCASE = Object.freeze([
  { key: 'channels', eyebrow: 'Web + Telegram Mini App', title: 'Bitta do‘kon. Ikki kanal.', text: 'Mijozlar web saytdan ham, Telegram Mini App ichidan ham bir xil do‘konga kiradi.', panel: 'Web do‘kon', rows: ['Katalog', 'Mahsulotlar', 'Buyurtmalar'], aside: 'Telegram Mini App' },
  { key: 'catalog', eyebrow: 'Mahsulot va katalog', title: 'Katalogni bir joydan boshqaring', text: 'Kategoriya, narx, variant va qoldiq ikkala kanalda ham yangilanadi.', panel: 'Mahsulotlar', rows: ['Kategoriyalar', 'Variantlar', 'Narx va qoldiq'], aside: 'Yagona katalog' },
  { key: 'orders', eyebrow: 'Buyurtmalar', title: 'Buyurtmalar bitta oqimda', text: 'Web va Telegram’dan kelgan buyurtmalarni bitta panelda kuzating.', panel: 'Buyurtmalar', rows: ['Yangi buyurtma', 'Jarayonda', 'Yetkazildi'], aside: 'Bitta boshqaruv' },
  { key: 'inventory', eyebrow: 'Ombor va qoldiq', title: 'Qoldiq doim nazoratda', text: 'Kirim-chiqim va kam qolgan mahsulotlarni bir joydan kuzating.', panel: 'Ombor', rows: ['Kirim va chiqim', 'Mahsulot qoldig‘i', 'Variantlar'], aside: 'Qoldiq nazorati' },
  { key: 'marketing', eyebrow: 'Marketing', title: 'Aksiya va bannerlar bilan soting', text: 'Banner, promo va tavsiyalar web hamda Mini App’da bir xil ko‘rinadi.', panel: 'Marketing', rows: ['Bannerlar', 'Promo-kodlar', 'Tavsiya mahsulotlar'], aside: 'Ikkala kanalda' },
  { key: 'checkout', eyebrow: 'Checkout va to‘lov', title: 'Buyurtmadan to‘lovgacha sodda', text: 'Ma’lumot, yetkazib berish va to‘lov tushunarli oqimda bajariladi.', panel: 'Buyurtma berish', rows: ['Ma’lumot va yetkazish', 'To‘lov', 'Tasdiqlash'], aside: 'Qulay xarid' },
  { key: 'analytics', eyebrow: 'Analitika', title: 'Biznesingizni raqamlar bilan ko‘ring', text: 'Savdo va buyurtmalar holatini boshqaruv panelida kuzating.', panel: 'Hisobotlar', rows: ['Savdo', 'Buyurtmalar', 'Mahsulotlar'], aside: 'Aniq tahlil' },
  { key: 'branding', eyebrow: 'Brending va domen', title: 'O‘z nomingiz bilan ishlang', text: 'Logo, rang, domen va Telegram botni bir markazdan boshqaring.', panel: 'Do‘kon brendi', rows: ['Logo va ranglar', 'Shaxsiy domen', 'Telegram bot'], aside: 'Sizning brendingiz' },
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
  if (limit == null || !Number.isFinite(count)) return 'Cheksiz mahsulot';
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

function makeShowcase(doc) {
  const root = doc.createElement('div');
  root.className = 'uw-platform-showcase';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'UStorE imkoniyatlari');
  root.setAttribute('aria-roledescription', 'carousel');
  const viewport = doc.createElement('div'); viewport.className = 'uw-platform-showcase__viewport';
  const track = doc.createElement('div'); track.className = 'uw-platform-showcase__track';
  const slides = SHOWCASE.map((story, index) => {
    const slide = doc.createElement('article'); slide.className = 'uw-platform-showcase__slide';
    slide.dataset.story = story.key;
    slide.setAttribute('aria-label', `${index + 1} / ${SHOWCASE.length}: ${story.eyebrow}`);
    const caption = doc.createElement('div'); caption.className = 'uw-platform-showcase__caption';
    const eyebrow = doc.createElement('span'); eyebrow.textContent = story.eyebrow;
    const title = doc.createElement('strong'); title.textContent = story.title;
    const text = doc.createElement('p'); text.textContent = story.text;
    caption.append(eyebrow, title, text);
    const scene = doc.createElement('div'); scene.className = 'uw-platform-showcase__scene';
    const panel = doc.createElement('div'); panel.className = 'uw-platform-showcase__panel';
    const panelHead = doc.createElement('div'); panelHead.className = 'uw-platform-showcase__panel-head';
    const windowDots = doc.createElement('span'); windowDots.className = 'uw-platform-showcase__window-dots'; windowDots.setAttribute('aria-hidden', 'true');
    const panelTitle = doc.createElement('b'); panelTitle.textContent = story.panel;
    panelHead.append(windowDots, panelTitle);
    const rows = doc.createElement('div'); rows.className = 'uw-platform-showcase__rows';
    for (const label of story.rows) {
      const row = doc.createElement('div'); row.className = 'uw-platform-showcase__row';
      const marker = doc.createElement('i'); marker.setAttribute('aria-hidden', 'true');
      const name = doc.createElement('span'); name.textContent = label;
      const bar = doc.createElement('em'); bar.setAttribute('aria-hidden', 'true');
      row.append(marker, name, bar); rows.append(row);
    }
    panel.append(panelHead, rows);
    const side = doc.createElement('div'); side.className = 'uw-platform-showcase__side';
    const symbol = doc.createElement('span'); symbol.className = 'uw-platform-showcase__symbol'; symbol.textContent = 'U'; symbol.setAttribute('aria-hidden', 'true');
    const sideTitle = doc.createElement('b'); sideTitle.textContent = story.aside;
    const sideLines = doc.createElement('span'); sideLines.className = 'uw-platform-showcase__side-lines'; sideLines.setAttribute('aria-hidden', 'true');
    side.append(symbol, sideTitle, sideLines); scene.append(panel, side);
    slide.append(caption, scene); track.append(slide);
    return slide;
  });
  viewport.append(track);
  const controls = doc.createElement('div'); controls.className = 'uw-platform-showcase__controls';
  const previous = doc.createElement('button'); previous.type = 'button'; previous.textContent = '←'; previous.setAttribute('aria-label', 'Oldingi imkoniyat');
  const next = doc.createElement('button'); next.type = 'button'; next.textContent = '→'; next.setAttribute('aria-label', 'Keyingi imkoniyat');
  const dots = doc.createElement('div'); dots.className = 'uw-platform-showcase__dots'; dots.setAttribute('aria-label', 'Slaydlar');
  const dotButtons = SHOWCASE.map((story, index) => {
    const dot = doc.createElement('button'); dot.type = 'button'; dot.setAttribute('aria-label', `${index + 1}-slayd: ${story.eyebrow}`);
    dots.append(dot); return dot;
  });
  controls.append(previous, dots, next); root.append(viewport, controls);
  let current = 0; let timer = null; let touchStart = null;
  const sync = () => {
    track.style.transform = `translateX(-${current * 100}%)`;
    slides.forEach((slide, index) => slide.setAttribute('aria-hidden', index === current ? 'false' : 'true'));
    dotButtons.forEach((dot, index) => {
      dot.className = index === current ? 'is-active' : '';
      dot.setAttribute('aria-current', index === current ? 'true' : 'false');
    });
  };
  const pause = () => { if (timer != null) clearInterval(timer); timer = null; };
  const play = () => {
    pause();
    if (doc === globalThis.document && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      timer = setInterval(() => { if (!doc.hidden) { current = (current + 1) % slides.length; sync(); } }, 3000);
    }
  };
  // Manual navigation keeps the selected story in place while the visitor
  // reads it. Autoplay resumes when pointer/focus leaves the carousel.
  const go = (index) => { current = (index + slides.length) % slides.length; sync(); pause(); };
  previous.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
  dotButtons.forEach((dot, index) => dot.addEventListener('click', () => go(index)));
  root.addEventListener('mouseenter', pause); root.addEventListener('mouseleave', play);
  root.addEventListener('focusin', pause); root.addEventListener('focusout', (event) => { if (!root.contains?.(event.relatedTarget)) play(); });
  root.addEventListener('touchstart', (event) => { touchStart = event.touches?.[0]?.clientX ?? null; pause(); }, { passive: true });
  root.addEventListener('touchend', (event) => {
    const delta = (event.changedTouches?.[0]?.clientX ?? touchStart) - touchStart;
    if (touchStart != null && Math.abs(delta) >= 42) go(current + (delta < 0 ? 1 : -1)); else play();
    touchStart = null;
  }, { passive: true });
  sync(); play();
  return { element: root, destroy: pause };
}

function createTariffCard(tariff, { doc, onChoosePlan, billingPeriod = 'monthly' }) {
  const card = doc.createElement('article');
  card.className = 'uw-platform-plan';
  card.dataset.popular = tariff.isPopular ? 'true' : 'false';
  if (tariff.isPopular) {
    const badge = doc.createElement('span'); badge.className = 'uw-platform-plan__badge'; badge.textContent = 'Ommabop · Tavsiya etiladi'; card.append(badge);
  }
  const heading = doc.createElement('div'); heading.className = 'uw-platform-plan__heading';
  const name = doc.createElement('h3'); name.textContent = tariff.name;
  const limit = doc.createElement('div'); limit.className = 'uw-platform-plan__limit';
  const limitLabel = doc.createElement('small'); limitLabel.textContent = 'Mahsulot limiti';
  const limitValue = doc.createElement('strong'); limitValue.textContent = productLimitLabel(tariff.productLimit);
  limit.append(limitLabel, limitValue); heading.append(name, limit);
  const price = doc.createElement('div'); price.className = 'uw-platform-plan__price';
  if (billingPeriod === 'annual') {
    const old = doc.createElement('s'); old.textContent = money(tariff.price * 12); price.append(old);
  }
  const amount = doc.createElement('strong'); amount.textContent = money(billingPeriod === 'annual' ? tariff.price * 10 : tariff.price);
  const period = doc.createElement('span'); period.textContent = billingPeriod === 'annual' ? '/ yil' : '/ oy';
  price.append(amount, period);
  if (billingPeriod === 'annual') {
    const saving = doc.createElement('small'); saving.textContent = `2 oy bepul · ${money(tariff.price * 2)} tejaysiz`; price.append(saving);
  }
  card.append(heading, price);

  if (tariff.features.length) {
    const list = doc.createElement('ul'); list.className = 'uw-platform-plan__features';
    for (const feature of tariff.features.slice(0, 4)) {
      const row = doc.createElement('li');
      const check = doc.createElement('span'); check.setAttribute('aria-hidden', 'true'); check.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      const text = doc.createElement('span'); text.textContent = feature;
      row.append(check, text); list.append(row);
    }
    card.append(list);
  }
  card.append(createButton({ label: 'Kirish va tanlash', variant: tariff.isPopular ? 'primary' : 'secondary', onClick: () => onChoosePlan?.(tariff, billingPeriod) }, doc));
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
  const eyebrow = doc.createElement('span'); eyebrow.className = 'uw-platform-eyebrow'; eyebrow.textContent = 'Web + Telegram Mini App savdo platformasi';
  const h1 = doc.createElement('h1'); h1.textContent = 'Bitta do‘kon. Ikki kanal.';
  const intro = doc.createElement('p'); intro.textContent = 'Web sayt va Telegram Mini App orqali soting. Mahsulot, buyurtma, ombor, marketing va to‘lovlarni bitta UStorE boshqaruv markazidan yuriting.';
  const heroActions = doc.createElement('div'); heroActions.className = 'uw-platform-hero__actions';
  heroActions.append(
    createButton({ label: 'Do‘kon ochishni boshlash', size: 'lg', onClick: () => onLogin?.({ intent: 'new-shop' }) }, doc),
    createButton({ label: 'Tariflarni ko‘rish', variant: 'secondary', size: 'lg', onClick: () => globalThis.document?.getElementById?.('platform-pricing')?.scrollIntoView?.({ behavior: 'smooth' }) }, doc),
  );
  heroCopy.append(eyebrow, h1, intro, heroActions);

  const visual = doc.createElement('div'); visual.className = 'uw-platform-visual';
  const showcase = makeShowcase(doc); visual.append(showcase.element);
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
  const pp = doc.createElement('p'); pp.textContent = 'Oylik yoki yillik to‘lovni tanlang. Yillikda 2 oy bepul; narx va limit amaldagi tariflardan olinadi.'; ph.append(ph2,pp); pricingInner.append(ph);
  let billingPeriod = 'monthly';
  const billing = doc.createElement('div'); billing.className = 'uw-platform-billing'; billing.setAttribute('role', 'group'); billing.setAttribute('aria-label', 'Obuna muddati');
  const monthly = doc.createElement('button'); monthly.type = 'button'; monthly.textContent = 'Oylik';
  const annual = doc.createElement('button'); annual.type = 'button'; annual.textContent = 'Yillik −17%';
  billing.append(monthly, annual); pricingInner.append(billing);
  let plans = null;
  const renderPlans = () => {
    monthly.setAttribute('aria-pressed', billingPeriod === 'monthly' ? 'true' : 'false');
    annual.setAttribute('aria-pressed', billingPeriod === 'annual' ? 'true' : 'false');
    if (plans) plans.replaceChildren(...state.tariffs.map((tariff) => createTariffCard(tariff, { doc, onChoosePlan, billingPeriod })));
  };
  monthly.addEventListener('click', () => { billingPeriod = 'monthly'; renderPlans(); });
  annual.addEventListener('click', () => { billingPeriod = 'annual'; renderPlans(); });
  if (state.status === 'loading' || state.status === 'idle') {
    pricingInner.append(createStatePanel({ kind: 'loading', title: 'Tariflar yuklanmoqda', message: 'Amaldagi tariflar serverdan olinmoqda.', iconText: '…' }, doc));
  } else if (state.status === 'error') {
    pricingInner.append(createStatePanel({ kind: 'error', title: 'Tariflar yuklanmadi', message: state.error?.message || 'Server bilan ulanishda xato yuz berdi.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc));
  } else if (!state.tariffs.length) {
    pricingInner.append(createStatePanel({ kind: 'empty', title: 'Hozircha faol tarif yo‘q', message: 'Faol tariflar qo‘shilganda shu yerda ko‘rinadi.' }, doc));
  } else {
    plans = doc.createElement('div'); plans.className = 'uw-platform-plans';
    pricingInner.append(plans); renderPlans();
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
  return { element: page, destroy: showcase.destroy };
}

export const platformHomeCopy = Object.freeze({ benefits: BENEFITS });
