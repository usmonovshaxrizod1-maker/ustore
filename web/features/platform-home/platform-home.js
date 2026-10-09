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
  let state = { status: 'idle', tariffs: [], landingSlides: [], error: null };
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
      const landingSlides = (Array.isArray(result.data?.landingSlides) ? result.data.landingSlides : []).filter(slide => { try { return ['http:','https:'].includes(new URL(slide.imageUrl).protocol); } catch { return false; } }).slice(0,10);
      set({ status: 'ready', tariffs, landingSlides, error: null });
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

function makeShowcase(doc, items = []) {
  const root = doc.createElement('div');root.className='uw-platform-showcase uw-platform-photo-showcase';
  root.setAttribute('role','region');root.setAttribute('aria-label','UStorE reklama slayderi');root.setAttribute('aria-roledescription','carousel');
  const slides = Array.isArray(items)?items.slice(0,10):[];
  if (!slides.length) {root.className += ' is-empty';root.setAttribute('aria-label','Reklama slayderida hozircha rasm yo‘q');return {element:root,destroy:()=>{}};}
  const viewport=doc.createElement('div');viewport.className='uw-platform-showcase__viewport';
  const track=doc.createElement('div');track.className='uw-platform-showcase__track';
  slides.forEach((item,i)=>{const slide=doc.createElement('div');slide.className='uw-platform-showcase__slide uw-platform-photo-slide';slide.setAttribute('aria-label',`${i+1}/${slides.length}`);const img=doc.createElement('img');img.src=item.imageUrl;img.alt=`UStorE reklama rasmi ${i+1}`;img.loading=i===0?'eager':'lazy';img.decoding='async';img.width=600;img.height=600;slide.append(img);track.append(slide);});
  viewport.append(track);root.append(viewport);
  let index=0,timer=null,touchX=null;
  const controls=doc.createElement('div');controls.className='uw-platform-showcase__controls';
  const dots=doc.createElement('div');dots.className='uw-platform-showcase__dots';
  const dotButtons=[];
  const sync=()=>{track.style.transform=`translateX(-${index*100}%)`;dotButtons.forEach((d,i)=>{d.className=i===index?'is-active':'';d.setAttribute('aria-current',i===index?'true':'false');});};
  const pause=()=>{if(timer!=null)clearInterval(timer);timer=null;};
  const play=()=>{pause();if(slides.length>1&&doc===globalThis.document&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)timer=setInterval(()=>{if(!doc.hidden){index=(index+1)%slides.length;sync();}},5000);};
  const go=(n)=>{index=(n+slides.length)%slides.length;sync();play();};
  if(slides.length>1){
    const prev=doc.createElement('button');prev.type='button';prev.textContent='←';prev.setAttribute('aria-label','Oldingi rasm');prev.addEventListener('click',()=>go(index-1));
    const next=doc.createElement('button');next.type='button';next.textContent='→';next.setAttribute('aria-label','Keyingi rasm');next.addEventListener('click',()=>go(index+1));
    slides.forEach((_,i)=>{const button=doc.createElement('button');button.type='button';button.setAttribute('aria-label',`${i+1}-rasm`);button.addEventListener('click',()=>go(i));dotButtons.push(button);dots.append(button);});
    controls.append(prev,dots,next);root.append(controls);
    root.addEventListener('mouseenter',pause);root.addEventListener('mouseleave',play);
    root.addEventListener('focusin',pause);root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))play();});
    root.addEventListener('touchstart',e=>{touchX=e.touches?.[0]?.clientX??null;pause();},{passive:true});
    root.addEventListener('touchend',e=>{const x=e.changedTouches?.[0]?.clientX??touchX;if(touchX!=null&&Math.abs(x-touchX)>40)go(index+(x<touchX?1:-1));else play();touchX=null;},{passive:true});
  }
  sync();play();return {element:root,destroy:pause};
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
  const showcase = makeShowcase(doc, state.landingSlides); visual.append(showcase.element);
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
