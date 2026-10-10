/* UStorE Task 1 — shared, zero-dependency storefront welcome UI. */
(() => {
  'use strict';
  const WELCOME_SELECTOR = '.ustore-welcome';
  const isSecureImage = (url) => {
    try { const parsed = new URL(String(url)); return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname)); } catch (_) { return false; }
  };
  const colorParts = (value) => {
    const text = String(value || '').trim();
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(text);
    if (!match) return null;
    const hex = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
    return [0,2,4].map((at) => parseInt(hex.slice(at, at + 2),16));
  };
  function brightness(rgb) {
    if (!rgb) return 1;
    const linear = rgb.map((value) => { const c=value/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; });
    return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  }
  function hue(rgb) {
    const [r,g,b] = rgb.map((v)=>v/255);
    const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min;
    if (!delta) return 213;
    let h=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
    return ((h*60)%360+360)%360;
  }
  function setTheme(section, theme = {}) {
    if (!section) return;
    const colors = theme?.colors || theme || {};
    // These are the existing Shop App's default preset colors, not a second theme setting.
    // Server theme overrides always take priority over this first-paint fallback.
    const presets = {
      minimal: {primary:'#2563eb',pageBg:'#f6f8fb'},
      dark: {primary:'#60a5fa',pageBg:'#15253c'},
      sport: {primary:'#16a34a',pageBg:'#f3f6f2'},
      elegant: {primary:'#6d28d9',pageBg:'#faf7ff'},
      bright: {primary:'#2563eb',pageBg:'#f4f7fb'},
    };
    const preset = presets[String(theme?.themeId || '').toLowerCase()] || {};
    const accent = colorParts(colors.primary || colors.accent || theme.primary || preset.primary);
    const page = colorParts(colors.pageBg || colors.page_bg || theme.pageBg || preset.pageBg);
    if (accent) {
      section.style.setProperty('--ustore-welcome-accent', `rgb(${accent.join(',')})`);
      section.style.setProperty('--ustore-welcome-hue', `${Math.round(hue(accent)-213)}deg`);
      // Golds and yellows need a deeper accent for readable text on pale glass.
      const dim = brightness(accent) > .42;
      section.style.setProperty('--ustore-welcome-title-accent', dim ? `rgb(${accent.map((n) => Math.round(n*.68)).join(',')})` : `rgb(${accent.join(',')})`);
    }
    const isDark = page ? brightness(page) < .18 : String(theme?.themeId || '').toLowerCase()==='dark';
    section.classList.toggle('ustore-welcome--dark', isDark);
  }
  function content(section) {
    let body = section.querySelector('.ustore-welcome__content');
    if (body) return body;
    section.replaceChildren();
    const art = document.createElement('div'); art.className='ustore-welcome__art'; art.setAttribute('aria-hidden','true');
    const glass = document.createElement('div'); glass.className='ustore-welcome__glass';
    const emblem = document.createElement('span'); emblem.className='ustore-welcome__logo';
    const fallback = document.createElement('span'); fallback.className='ustore-welcome__monogram'; fallback.textContent='U';
    emblem.append(fallback); glass.append(emblem);
    const headline=document.createElement('h1'); headline.className='ustore-welcome__title';
    const name=document.createElement('span'); name.className='ustore-welcome__name'; name.textContent='Do‘kon';
    const greeting=document.createElement('span'); greeting.className='ustore-welcome__greeting'; greeting.textContent='Xush kelibsiz';
    headline.append(name,greeting);
    const dots=document.createElement('div'); dots.className='ustore-welcome__dots'; dots.setAttribute('aria-hidden','true');
    for (let i=0;i<3;i++) dots.append(document.createElement('i'));
    const error=document.createElement('div'); error.className='ustore-welcome__error'; error.hidden=true;
    body=document.createElement('div'); body.className='ustore-welcome__content'; body.append(glass,headline,dots,error);
    section.append(art,body);
    return body;
  }
  function create({ extraClass = '', name = '', logoUrl = '', locale = 'uz', theme = null, mode = 'shop', message = '' } = {}) {
    const section=document.createElement('section');
    section.className=`ustore-welcome uw-shop-opening ${extraClass}`.trim();
    section.setAttribute('role','status'); section.setAttribute('aria-busy','true');
    content(section);
    update(section, { name,logoUrl,locale,theme });
    if (mode === 'platform') {
      section.classList.add('ustore-welcome--platform');
      section.classList.remove('uw-shop-opening');
      section.querySelector('.ustore-welcome__greeting').textContent=message || (locale==='ru'?'Готовим платформу для вашего бизнеса…':'Biznesingiz uchun platforma tayyorlanmoqda…');
      const foot=document.createElement('small'); foot.className='ustore-welcome__foot';
      foot.textContent=locale==='ru'?'Устанавливаем безопасное соединение и загружаем необходимые модули':'Xavfsiz ulanish va kerakli modullar yuklanmoqda';
      section.querySelector('.ustore-welcome__content').append(foot);
    }
    return section;
  }
  function update(section, {name,logoUrl,locale,theme} = {}) {
    if (!section) return;
    content(section);
    if (name !== undefined) {
      const title=String(name || '').trim() || (locale==='ru'?'Магазин':'Do‘kon');
      section.querySelector('.ustore-welcome__name').textContent=title;
      const fallback=section.querySelector('.ustore-welcome__monogram');
      if (fallback) fallback.textContent=Array.from(title)[0]?.toUpperCase() || 'U';
    }
    if (locale !== undefined) section.querySelector('.ustore-welcome__greeting').textContent=locale==='ru'?'Добро пожаловать':'Xush kelibsiz';
    if (logoUrl !== undefined) {
      const host=section.querySelector('.ustore-welcome__logo');
      const prev=host?.querySelector('img');
      const safe=isSecureImage(logoUrl)?String(logoUrl):'';
      if (!safe) { prev?.remove(); }
      else if (!prev || prev.src !== safe) {
        const img=document.createElement('img'); img.alt=''; img.decoding='async'; img.src=safe;
        img.addEventListener('error', () => img.remove(), {once:true});
        prev?.remove(); host?.append(img);
      }
    }
    if (theme !== undefined && theme !== null) setTheme(section, theme);
  }
  function failure(section, { message = '', onRetry = null, locale='uz' } = {}) {
    if (!section) return;
    const error=content(section).querySelector('.ustore-welcome__error');
    const text=document.createElement('p'); text.textContent=message || (locale==='ru'?'Не удалось открыть магазин.':'Do‘konni ochib bo‘lmadi.');
    const button=document.createElement('button'); button.type='button'; button.textContent=locale==='ru'?'Повторить':'Qayta urinish';
    button.addEventListener('click', onRetry || (() => window.location.reload()));
    error.replaceChildren(text,button); error.hidden=false;
    section.setAttribute('aria-busy','false');
    section.querySelector('.ustore-welcome__dots').hidden=true;
  }
  function dismiss(section, { immediate = false } = {}) {
    if (!section || section.dataset.welcomeLeaving === 'true') return;
    section.dataset.welcomeLeaving='true'; section.setAttribute('aria-busy','false');
    if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {section.remove();return;}
    section.classList.add('ustore-welcome--leaving');
    const done=()=>section.remove();
    section.addEventListener('transitionend', (event)=>{if(event.target===section && event.propertyName==='opacity')done();},{once:true});
    setTimeout(done, 500); // One-shot removal fallback; never extends initial loading.
  }
  window.USTORE_SHOP_WELCOME=Object.freeze({create,update,setTheme,failure,dismiss});
})();
