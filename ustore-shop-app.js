    // GLOBAL LOADER
    function showLoader(text) {
      const el = document.getElementById('global-loader');
      const txt = document.getElementById('global-loader-text');
      if (txt) txt.innerText = text || tr("Yuklanmoqda...", "Загрузка...");
      if (el) el.classList.remove('hidden');
    }
    function hideLoader() {
      const el = document.getElementById('global-loader');
      if (el) el.classList.add('hidden');
    }

    // Kichik, ekranni bloklamaydigan holat xabari. Admin amallarida global loader
    // o'rniga shu ishlatiladi: foydalanuvchi darhol natijani ko'radi, server esa fon rejimida saqlaydi.
    let actionToastTimer = null;
    function showActionToast(text, state = 'saving', duration = 0) {
      const el = document.getElementById('action-toast');
      if (!el) return;
      if (actionToastTimer) { clearTimeout(actionToastTimer); actionToastTimer = null; }
      el.innerHTML = text || '';
      el.dataset.state = state;
      el.classList.remove('hidden');
      if (duration > 0) {
        actionToastTimer = setTimeout(() => { el.classList.add('hidden'); actionToastTimer = null; }, duration);
      }
    }
    function hideActionToast() {
      const el = document.getElementById('action-toast');
      if (actionToastTimer) { clearTimeout(actionToastTimer); actionToastTimer = null; }
      if (el) el.classList.add('hidden');
    }
    function cloneData(v) {
      if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (_) {} }
      return JSON.parse(JSON.stringify(v));
    }

    // XSS OLDINI OLISH UCHUN: foydalanuvchi kiritgan matnni HTML'ga xavfsiz qo'yish
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Legacy audit, 1-band: eski via.placeholder.com (tashqi, tarmoqqa
    // bog'liq, brendga mos kelmaydigan) o'rniga mahalliy inline SVG —
    // tarmoqsiz ham ishlaydi, istalgan o'lchamda aniq (vektor) ko'rinadi.
    const FALLBACK_IMG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcng9IjE0IiBmaWxsPSIjZjNmNGY2Ii8+PGcgc3Ryb2tlPSIjYzdjZGQ2IiBzdHJva2Utd2lkdGg9IjQiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMjgiIHk9IjI4IiB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHJ4PSI2Ii8+PGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNCIvPjxwYXRoIGQ9Ik0yOCA2MiBMNDQgNDYgTDU0IDU2IEw3MiAzOCIvPjwvZz48L3N2Zz4=';

    // 31-band: navigatsiya/action kontekstidagi emoji o'rniga zamonaviy SVG
    // iconlar — inline (Lucide-uslubida chizilgan, lekin data-lucide emas,
    // shuning uchun lucide.createIcons() chaqirilishiga bog'liq emas va har
    // qanday render yo'lida darhol ko'rinadi). Bitta stroke/size uslubi.
    function fcIcon(pathHtml, cls = 'w-3.5 h-3.5') {
      return `<svg class="inline align-[-2px] ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathHtml}</svg>`;
    }
    const ICON_EDIT = fcIcon('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="M15 5l4 4"></path>');
    const ICON_TRASH = fcIcon('<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>');
    const ICON_UP = fcIcon('<polyline points="18 15 12 9 6 15"></polyline>');
    const ICON_DOWN = fcIcon('<polyline points="6 9 12 15 18 9"></polyline>');
    const ICON_PIN = fcIcon('<line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>');
    const ICON_GRIP_6 = fcIcon('<circle cx="9" cy="7" r="1" fill="currentColor" stroke="none"></circle><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"></circle><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"></circle><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"></circle><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none"></circle><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none"></circle>', 'w-4 h-4');
    // Legacy audit, 6-band: admin katalog toolbar'idagi tasodifiy emoji
    // (🖼️🧭☑️🔳) o'rniga bir xil stroke uslubidagi ikonalar.
    const ICON_IMAGE = fcIcon('<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path>');
    const ICON_COPY_CHECK = fcIcon('<rect x="3" y="8" width="13" height="13" rx="2"></rect><path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3"></path><path d="M6.5 14.5l2 2 4-4"></path>');
    const ICON_CHECK_SQUARE = fcIcon('<rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M7.5 12.5l3 3 6-6"></path>');
    const ICON_DOWNLOAD = fcIcon('<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M4 19h16"></path>');
    // Legacy audit, 9-band: to'lov metod tanlagichidagi emoji (💵💳⚡🔳) o'rniga.
    const ICON_CASH = fcIcon('<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="3"></circle><path d="M6 6v0M18 6v0M6 18v0M18 18v0"></path>', 'w-5 h-5');
    const ICON_CARD = fcIcon('<rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M2 10h20"></path>', 'w-5 h-5');
    const ICON_BOLT = fcIcon('<path d="M13 2 5 14h6l-1 8 9-12h-6l1-8z"></path>', 'w-5 h-5');
    const ICON_QR = fcIcon('<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01"></path>', 'w-5 h-5');
    const ICON_SETTINGS = fcIcon('<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>');

    // ⚙️ CONFIGURATION
    // MUHIM: bot tokeni va admin ID endi bu yerda YO'Q — ular faqat serverda
    // (Edge Function ichida, maxfiy sifatida) saqlanadi. Frontendda ular
    // umuman ko'rinmaydi, chunki bu yerga yozilgan har qanday narsani
    // dev-tools orqali istalgan kishi o'qib olishi mumkin.
    // Supabase loyiha URL/key esa endi bu faylda emas, config.public.js'da
    // (index.html uni ustore-shop-app.js'dan OLDIN yuklaydi, PUBLIC —
    // publishable key GitHub Pages'da ochiq turishi mo'ljallangan) — shu
    // tufayli bu fayl har qanday do'kon uchun universal qoladi.
    if (!window.APP_CONFIG) {
      throw new Error('config.public.js topilmadi yoki yuklanmadi.');
    }
    const CONFIG = window.APP_CONFIG;

    const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    const TASHKENT_CITY_DISTRICTS = ["Bektemir","Chilonzor","Mirobod","Mirzo Ulug'bek","Olmazor","Sergeli","Shayxontohur","Uchtepa","Yakkasaroy","Yashnobod","Yunusobod"];

    // Kanonik snake_case hudud kodlari. Bular DB/API/HTML atributlarida ID
    // sifatida ishlatiladi va HECH QACHON o'zbekcha ko'rsatiladigan nom
    // bo'lmasligi kerak — oldingi versiyada hudud ID'lari to'g'ridan-to'g'ri
    // "Farg'ona viloyati" kabi nomlar edi va admin sozlamalar UI'si bu nomni
    // encodeURIComponent (apostrofni escape qilmaydi) orqali bitta-tirnoqli
    // inline JS onchange ichiga qo'yardi — natijada apostrofli nomlar (Farg'ona,
    // Qoraqalpog'iston) uchun checkbox handler jim buzilib qolardi. Tafsilot:
    // supabase/migrations/013_region_canonical_codes.sql.
    const REGION_DEFS = [
      { code: 'tashkent_city', nameUz: 'Toshkent shahri', nameRu: 'Город Ташкент' },
      { code: 'tashkent_region', nameUz: 'Toshkent viloyati', nameRu: 'Ташкентская область' },
      { code: 'andijan', nameUz: 'Andijon viloyati', nameRu: 'Андижанская область' },
      { code: 'bukhara', nameUz: 'Buxoro viloyati', nameRu: 'Бухарская область' },
      { code: 'fergana', nameUz: "Farg'ona viloyati", nameRu: 'Ферганская область' },
      { code: 'jizzakh', nameUz: 'Jizzax viloyati', nameRu: 'Джизакская область' },
      { code: 'namangan', nameUz: 'Namangan viloyati', nameRu: 'Наманганская область' },
      { code: 'navoi', nameUz: 'Navoiy viloyati', nameRu: 'Навоийская область' },
      { code: 'qashqadaryo', nameUz: 'Qashqadaryo viloyati', nameRu: 'Кашкадарьинская область' },
      { code: 'karakalpakstan', nameUz: "Qoraqalpog'iston Respublikasi", nameRu: 'Республика Каракалпакстан' },
      { code: 'samarkand', nameUz: 'Samarqand viloyati', nameRu: 'Самаркандская область' },
      { code: 'sirdaryo', nameUz: 'Sirdaryo viloyati', nameRu: 'Сырдарьинская область' },
      { code: 'surxondaryo', nameUz: 'Surxondaryo viloyati', nameRu: 'Сурхандарьинская область' },
      { code: 'khorezm', nameUz: 'Xorazm viloyati', nameRu: 'Хорезмская область' },
    ];
    // Eski (pre-013) mijoz holatlarida (masalan localStorage'dagi checkoutDraft)
    // qolib ketgan bo'lishi mumkin bo'lgan eski ID'larni yangi kodga o'giradi.
    const LEGACY_REGION_CODE_MAP = {
      TASHKENT_CITY: 'tashkent_city', 'Toshkent viloyati': 'tashkent_region',
      'Andijon viloyati': 'andijan', 'Buxoro viloyati': 'bukhara', "Farg'ona viloyati": 'fergana',
      'Jizzax viloyati': 'jizzakh', 'Namangan viloyati': 'namangan', 'Navoiy viloyati': 'navoi',
      'Qashqadaryo viloyati': 'qashqadaryo', "Qoraqalpog'iston Respublikasi": 'karakalpakstan',
      'Samarqand viloyati': 'samarkand', 'Sirdaryo viloyati': 'sirdaryo',
      'Surxondaryo viloyati': 'surxondaryo', 'Xorazm viloyati': 'khorezm',
    };
    function canonicalRegionCode(value) {
      if (!value) return null;
      if (REGION_DEFS.some(r => r.code === value)) return value;
      return LEGACY_REGION_CODE_MAP[value] || null;
    }

    const UZ_REGIONS_BY_CODE = {
      andijan: ["Andijon shahri","Andijon tumani","Asaka","Baliqchi","Bo'z","Buloqboshi","Izboskan","Jalaquduq","Marhamat","Oltinko'l","Paxtaobod","Qo'rg'ontepa","Shahrixon","Ulug'nor","Xo'jaobod","Xonobod shahri"],
      bukhara: ["Buxoro shahri","Buxoro tumani","G'ijduvon","Jondor","Kogon shahri","Kogon tumani","Olot","Peshku","Qorako'l","Qorovulbozor","Romitan","Shofirkon","Vobkent"],
      fergana: ["Farg'ona shahri","Marg'ilon shahri","Qo'qon shahri","Farg'ona tumani","Bag'dod","Beshariq","Buvayda","Dang'ara","Furqat","Oltiariq","O'zbekiston","Quva","Qo'shtepa","Rishton","So'x","Toshloq","Uchko'prik","Yozyovon"],
      jizzakh: ["Jizzax shahri","Jizzax tumani","Arnasoy","Baxmal","Do'stlik","Forish","G'allaorol","Mirzacho'l","Paxtakor","Sh.Rashidov tumani","Yangiobod","Zafarobod","Zarbdor","Zomin"],
      khorezm: ["Urganch shahri","Urganch tumani","Bog'ot","Gurlan","Hazorasp","Xiva","Xonqa","Qo'shko'pir","Shovot","Yangiariq","Yangibozor"],
      namangan: ["Namangan shahri","Namangan tumani","Chortoq","Chust","Kosonsoy","Mingbuloq","Norin","Pop","To'raqo'rg'on","Uchqo'rg'on","Uychi","Yangiqo'rg'on"],
      navoi: ["Navoiy shahri","Zarafshon shahri","Karmana","Konimex","Navbahor","Nurota","Qiziltepa","Tomdi","Uchquduq","Xatirchi"],
      qashqadaryo: ["Qarshi shahri","Shahrisabz shahri","Qarshi tumani","Shahrisabz tumani","Chiroqchi","Dehqonobod","G'uzor","Kasbi","Kitob","Koson","Mirishkor","Muborak","Nishon","Qamashi","Yakkabog'"],
      karakalpakstan: ["Nukus shahri","Nukus tumani","Amudaryo","Beruniy","Chimboy","Ellikqal'a","Kegeyli","Mo'ynoq","Qanliko'l","Qorao'zak","Qo'ng'irot","Shumanay","Taxtako'pir","To'rtko'l","Xo'jayli"],
      samarkand: ["Samarqand shahri","Samarqand tumani","Bulung'ur","Ishtixon","Jomboy","Kattaqo'rg'on","Narpay","Nurobod","Oqdaryo","Pastdarg'om","Paxtachi","Payariq","Qo'shrabot","Toyloq","Urgut"],
      sirdaryo: ["Guliston shahri","Guliston tumani","Yangiyer shahri","Boyovut","Mirzaobod","Oqoltin","Sardoba","Sayxunobod","Sirdaryo tumani","Xovos"],
      surxondaryo: ["Termiz shahri","Termiz tumani","Angor","Bandixon","Boysun","Denov","Jarqo'rg'on","Muzrabot","Oltinsoy","Qiziriq","Qumqo'rg'on","Sariosiyo","Sherobod","Sho'rchi","Uzun"],
      tashkent_region: ["Angren shahri","Bekobod shahri","Bekobod tumani","Bo'ka","Bo'stonliq","Chinoz","Chirchiq shahri","Ohangaron shahri","Ohangaron tumani","Olmaliq shahri","Oqqo'rg'on","Parkent","Piskent","Qibray","Quyichirchiq","Toshkent tumani","O'rtachirchiq","Yangiyo'l shahri","Yangiyo'l tumani","Yuqorichirchiq","Zangiota"],
    };

    // 5-band: tuman/shahar nomlarining haqiqiy ruscha tarjimasi — qo'lda
    // yozilgan (Azure emas, chunki bu ro'yxat qat'iy va bir martalik).
    // Transliteratsiya EMAS — masalan "Farg'ona tumani" -> "Ферганский
    // район", harf-ma-harf o'girilgan variant emas. Kalitlar UZ_REGIONS_BY_CODE/
    // TASHKENT_CITY_DISTRICTS'dagi qiymatlar bilan aynan bir xil (select
    // value shu o'zbekcha qiymat bo'lib qoladi — faqat ko'rsatiladigan matn
    // almashadi). Qarang: districtNameRu().
    const TASHKENT_CITY_DISTRICTS_RU = {
      "Bektemir": "Бектемирский район", "Chilonzor": "Чиланзарский район", "Mirobod": "Мирабадский район",
      "Mirzo Ulug'bek": "Мирзо-Улугбекский район", "Olmazor": "Алмазарский район", "Sergeli": "Сергелийский район",
      "Shayxontohur": "Шайхантахурский район", "Uchtepa": "Учтепинский район", "Yakkasaroy": "Яккасарайский район",
      "Yashnobod": "Яшнабадский район", "Yunusobod": "Юнусабадский район",
    };
    const DISTRICT_RU_BY_REGION = {
      andijan: {
        "Andijon shahri": "город Андижан", "Andijon tumani": "Андижанский район", "Asaka": "Асакинский район",
        "Baliqchi": "Баликчинский район", "Bo'z": "Бозский район", "Buloqboshi": "Булакбашинский район",
        "Izboskan": "Избасканский район", "Jalaquduq": "Джалакудукский район", "Marhamat": "Мархаматский район",
        "Oltinko'l": "Алтынкульский район", "Paxtaobod": "Пахтаабадский район", "Qo'rg'ontepa": "Кургантепинский район",
        "Shahrixon": "Шахриханский район", "Ulug'nor": "Улугнорский район", "Xo'jaobod": "Ходжаабадский район",
        "Xonobod shahri": "город Ханабад",
      },
      bukhara: {
        "Buxoro shahri": "город Бухара", "Buxoro tumani": "Бухарский район", "G'ijduvon": "Гиждуванский район",
        "Jondor": "Жондорский район", "Kogon shahri": "город Каган", "Kogon tumani": "Каганский район",
        "Olot": "Алатский район", "Peshku": "Пешкунский район", "Qorako'l": "Каракульский район",
        "Qorovulbozor": "Караулбазарский район", "Romitan": "Ромитанский район", "Shofirkon": "Шафирканский район",
        "Vobkent": "Вабкентский район",
      },
      fergana: {
        "Farg'ona shahri": "город Фергана", "Marg'ilon shahri": "город Маргилан", "Qo'qon shahri": "город Коканд",
        "Farg'ona tumani": "Ферганский район", "Bag'dod": "Багдадский район", "Beshariq": "Бешарыкский район",
        "Buvayda": "Бувайдинский район", "Dang'ara": "Дангаринский район", "Furqat": "Фуркатский район",
        "Oltiariq": "Алтыарыкский район", "O'zbekiston": "Узбекистанский район", "Quva": "Кувинский район",
        "Qo'shtepa": "Куштепинский район", "Rishton": "Риштанский район", "So'x": "Сохский район",
        "Toshloq": "Ташлакский район", "Uchko'prik": "Учкуприкский район", "Yozyovon": "Язъяванский район",
      },
      jizzakh: {
        "Jizzax shahri": "город Джизак", "Jizzax tumani": "Джизакский район", "Arnasoy": "Арнасайский район",
        "Baxmal": "Бахмальский район", "Do'stlik": "Дустликский район", "Forish": "Фаришский район",
        "G'allaorol": "Галляаральский район", "Mirzacho'l": "Мирзачульский район", "Paxtakor": "Пахтакорский район",
        "Sh.Rashidov tumani": "район Шарофа Рашидова", "Yangiobod": "Янгиабадский район", "Zafarobod": "Зафарабадский район",
        "Zarbdor": "Зарбдарский район", "Zomin": "Зааминский район",
      },
      khorezm: {
        "Urganch shahri": "город Ургенч", "Urganch tumani": "Ургенчский район", "Bog'ot": "Багатский район",
        "Gurlan": "Гурланский район", "Hazorasp": "Хазараспский район", "Xiva": "Хивинский район",
        "Xonqa": "Ханкинский район", "Qo'shko'pir": "Кошкупырский район", "Shovot": "Шаватский район",
        "Yangiariq": "Янгиарыкский район", "Yangibozor": "Янгибазарский район",
      },
      namangan: {
        "Namangan shahri": "город Наманган", "Namangan tumani": "Наманганский район", "Chortoq": "Чартакский район",
        "Chust": "Чустский район", "Kosonsoy": "Касансайский район", "Mingbuloq": "Мингбулакский район",
        "Norin": "Наринский район", "Pop": "Папский район", "To'raqo'rg'on": "Туракурганский район",
        "Uchqo'rg'on": "Учкурганский район", "Uychi": "Уйчинский район", "Yangiqo'rg'on": "Янгикурганский район",
      },
      navoi: {
        "Navoiy shahri": "город Навои", "Zarafshon shahri": "город Зарафшан", "Karmana": "Карманинский район",
        "Konimex": "Канимехский район", "Navbahor": "Навбахорский район", "Nurota": "Нуратинский район",
        "Qiziltepa": "Кызылтепинский район", "Tomdi": "Тамдынский район", "Uchquduq": "Учкудукский район",
        "Xatirchi": "Хатырчинский район",
      },
      qashqadaryo: {
        "Qarshi shahri": "город Карши", "Shahrisabz shahri": "город Шахрисабз", "Qarshi tumani": "Каршинский район",
        "Shahrisabz tumani": "Шахрисабзский район", "Chiroqchi": "Чиракчинский район", "Dehqonobod": "Дехканабадский район",
        "G'uzor": "Гузарский район", "Kasbi": "Касбийский район", "Kitob": "Китабский район",
        "Koson": "Касанский район", "Mirishkor": "Миришкорский район", "Muborak": "Мубарекский район",
        "Nishon": "Нишанский район", "Qamashi": "Камашинский район", "Yakkabog'": "Яккабагский район",
      },
      karakalpakstan: {
        "Nukus shahri": "город Нукус", "Nukus tumani": "Нукусский район", "Amudaryo": "Амударьинский район",
        "Beruniy": "Берунийский район", "Chimboy": "Чимбайский район", "Ellikqal'a": "Элликкалинский район",
        "Kegeyli": "Кегейлийский район", "Mo'ynoq": "Муйнакский район", "Qanliko'l": "Канлыкульский район",
        "Qorao'zak": "Караузякский район", "Qo'ng'irot": "Кунградский район", "Shumanay": "Шуманайский район",
        "Taxtako'pir": "Тахтакупырский район", "To'rtko'l": "Турткульский район", "Xo'jayli": "Ходжейлийский район",
      },
      samarkand: {
        "Samarqand shahri": "город Самарканд", "Samarqand tumani": "Самаркандский район", "Bulung'ur": "Булунгурский район",
        "Ishtixon": "Иштыханский район", "Jomboy": "Джамбайский район", "Kattaqo'rg'on": "Каттакурганский район",
        "Narpay": "Нарпайский район", "Nurobod": "Нурабадский район", "Oqdaryo": "Акдарьинский район",
        "Pastdarg'om": "Пастдаргомский район", "Paxtachi": "Пахтачийский район", "Payariq": "Пайарыкский район",
        "Qo'shrabot": "Кошрабадский район", "Toyloq": "Тайлакский район", "Urgut": "Ургутский район",
      },
      sirdaryo: {
        "Guliston shahri": "город Гулистан", "Guliston tumani": "Гулистанский район", "Yangiyer shahri": "город Янгиер",
        "Boyovut": "Баяутский район", "Mirzaobod": "Мирзаабадский район", "Oqoltin": "Акалтынский район",
        "Sardoba": "Сардобинский район", "Sayxunobod": "Сайхунабадский район", "Sirdaryo tumani": "Сырдарьинский район",
        "Xovos": "Хавастский район",
      },
      surxondaryo: {
        "Termiz shahri": "город Термез", "Termiz tumani": "Термезский район", "Angor": "Ангорский район",
        "Bandixon": "Бандиханский район", "Boysun": "Байсунский район", "Denov": "Денауский район",
        "Jarqo'rg'on": "Джаркурганский район", "Muzrabot": "Музрабадский район", "Oltinsoy": "Алтынсайский район",
        "Qiziriq": "Кызирикский район", "Qumqo'rg'on": "Кумкурганский район", "Sariosiyo": "Сариасийский район",
        "Sherobod": "Шерабадский район", "Sho'rchi": "Шурчинский район", "Uzun": "Узунский район",
      },
      tashkent_region: {
        "Angren shahri": "город Ангрен", "Bekobod shahri": "город Бекабад", "Bekobod tumani": "Бекабадский район",
        "Bo'ka": "Букинский район", "Bo'stonliq": "Бостанлыкский район", "Chinoz": "Чиназский район",
        "Chirchiq shahri": "город Чирчик", "Ohangaron shahri": "город Ахангаран", "Ohangaron tumani": "Ахангаранский район",
        "Olmaliq shahri": "город Алмалык", "Oqqo'rg'on": "Аккурганский район", "Parkent": "Паркентский район",
        "Piskent": "Пскентский район", "Qibray": "Кибрайский район", "Quyichirchiq": "Нижнечирчикский район",
        "Toshkent tumani": "Ташкентский район", "O'rtachirchiq": "Среднечирчикский район", "Yangiyo'l shahri": "город Янгиюль",
        "Yangiyo'l tumani": "Янгиюльский район", "Yuqorichirchiq": "Верхнечирчикский район", "Zangiota": "Зангиатинский район",
      },
    };
    // Barcha regionlar bo'yicha bitta tekis lug'at (aniq mos kelish uchun tez qidiruv).
    const DISTRICT_RU_FLAT = Object.assign({}, TASHKENT_CITY_DISTRICTS_RU, ...Object.values(DISTRICT_RU_BY_REGION));
    // Haqiqiy filial ma'lumotidan (get_delivery_districts) kelgan yorliq har
    // doim ham lug'at kaliti bilan harfma-harf mos kelmasligi mumkin — shu
    // sabab "tumani"/"shahri" so'zini olib tashlab, bazaviy nom bo'yicha ham
    // qidiriladi. Topilmasa (5-band talabiga ko'ra) o'zbekcha qiymat qoladi.
    function districtNameRu(uzLabel) {
      if (!uzLabel) return uzLabel;
      if (DISTRICT_RU_FLAT[uzLabel]) return DISTRICT_RU_FLAT[uzLabel];
      const strip = (s) => String(s).replace(/\s*(tumani|shahri)\s*$/i, '').trim().toLowerCase();
      const target = strip(uzLabel);
      for (const [uzKey, ruVal] of Object.entries(DISTRICT_RU_FLAT)) {
        if (strip(uzKey) === target) return ruVal;
      }
      return uzLabel;
    }
    function districtLabelForUi(uzLabel) { return uiLang === 'ru' ? districtNameRu(uzLabel) : uzLabel; }

    // 10-band: hardcoded fallback ro'yxat ("Olmazor") va server'dan kelgan
    // normalized ro'yxat ("Olmazor tumani") xuddi bir xil tumanni har xil
    // shaklda yozadi — tanlovni tiklashda oddiy qat'iy string tenglik shu
    // sabab ishlamay qolib, foydalanuvchining tanlovi yo'qolib qolardi.
    // Bu "tumani"/"shahri" qo'shimchasini tashlab, mos variantni topadi.
    function districtNormalizedKey(value) {
      return String(value || '').trim().toLocaleLowerCase('uz').replace(/\s+(tumani|shahri)$/, '').trim();
    }
    function findMatchingDistrictOption(options, previousValue) {
      if (!previousValue) return null;
      const key = districtNormalizedKey(previousValue);
      return options.find(d => districtNormalizedKey(d) === key) || null;
    }

    const TOP_LEVEL_REGIONS = REGION_DEFS.map(r => ({ id: r.code, nameUz: r.nameUz, nameRu: r.nameRu }));
    const TOP_LEVEL_REGION_IDS = TOP_LEVEL_REGIONS.map(region => region.id);
    const imageIO = window.UstoreImageIO;
    const commerce = window.UstoreCommerce;
    const SUPPORTED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const MAX_ORIGINAL_IMAGE_BYTES = 15 * 1024 * 1024;
    const MAX_STORED_IMAGE_BYTES = 5 * 1024 * 1024;
    // Server-first upload Telegram WebView'da direct Storage fetch'ga qaraganda barqarorroq.
    // Base64 request'ni kichik saqlash uchun local rasmlarni imkon qadar 2MB ostiga siqamiz.
    const TARGET_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
    const MAX_RECEIPT_BYTES = 6 * 1024 * 1024;

    function validatePickedImageFile(file, maxOriginalBytes = MAX_ORIGINAL_IMAGE_BYTES) {
      if (!file || !SUPPORTED_IMAGE_MIME.has(String(file.type || '').toLowerCase())) {
        throw new Error('invalid_image_type');
      }
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxOriginalBytes) {
        throw new Error('image_too_large');
      }
      return true;
    }
    // 6-band: accept="image/*" endi telefon galereyasidagi ko'proq formatni
    // (shu jumladan HEIC/HEIF) tanlashga imkon beradi, lekin brauzer HEIC'ni
    // canvas orqali ishonchli dekodlay olmaydi va serverda ham xavfsiz
    // normalizatsiya yo'q (Deno'da ishonchli HEIC decoder yo'q) — shu sabab
    // HEIC/HEIF hali ham rad etiladi, faqat aniqroq xabar bilan (kengaytmaga
    // ishonib qolmasdan, extensiyasiz fayllar uchun ham MIME orqali aniqlash
    // urinib ko'riladi).
    function isLikelyHeicFile(file) {
      const mime = String(file?.type || '').toLowerCase();
      const name = String(file?.name || '').toLowerCase();
      return mime === 'image/heic' || mime === 'image/heif' || /\.(heic|heif)$/.test(name);
    }
    function pickedImageErrorMessage(err, file) {
      const code = String(err?.message || err || '');
      if (code === 'invalid_image_type') {
        return isLikelyHeicFile(file)
          ? tr("⚠️ HEIC/HEIF formati hali qo'llab-quvvatlanmaydi. iPhone: Sozlamalar > Kamera > Formatlar > \"Eng mos\"ni tanlang, yoki rasmni avval JPG/PNG'ga o'tkazing.", "⚠️ Формат HEIC/HEIF пока не поддерживается. iPhone: Настройки > Камера > Форматы > «Наиболее совместимые», либо сначала преобразуйте фото в JPG/PNG.")
          : tr('⚠️ Faqat JPG/JPEG, PNG yoki WebP rasm tanlang!', '⚠️ Выберите JPG/JPEG, PNG или WebP!');
      }
      return tr('⚠️ Original rasm hajmi 15MB dan oshmasligi kerak!', '⚠️ Исходное изображение не должно превышать 15 МБ!');
    }

    const tg = window.Telegram?.WebApp;
    if (tg) tg.expand();

    // ============ SHOP IDENTITY (multi-tenant) ============
    // 6-band: the SAME GitHub Pages origin serves every shop's Mini App —
    // the URL's ?bot_id= is the only thing that tells this page load which
    // shop it's rendering for. It is NEVER treated as authorization by
    // itself (the server re-derives everything from it + a verified
    // Telegram signature) — here it is used only as (a) the value sent with
    // every callApi() call so the server can look up the right shop_bots
    // row, and (b) the prefix for shop-scoped local/session storage keys,
    // so Shop A's cart/profile/cache can never bleed into Shop B's when
    // both are opened from the same browser.
    const BOT_ID = new URLSearchParams(window.location.search).get('bot_id') || '';
    function scopedKey(name) { return `ustore:${BOT_ID}:${name}`; }

    // ============ DB <-> JS MAPPERS ============
    function mapProductFromDB(r) {
      const legacySizes = Array.isArray(r.sizes) ? r.sizes : null;
      const variants = Array.isArray(r.variants)
        ? r.variants
        : (legacySizes || []).map(x => ({ size: x.size || null, color: null, qty: Number(x.qty) || 0, sku: x.sku || null }));
      return {
        id: r.id, sku: r.sku, name: r.name, nameRu: r.name_ru || null, price: Number(r.price),
        oldPrice: r.old_price !== null ? Number(r.old_price) : null,
        stock: Number(r.stock) || 0, categoryId: r.category_id, status: r.status,
        img: r.img, desc: r.description, descRu: r.description_ru || null,
        isFeatured: r.is_featured, isVisible: r.is_visible !== false, sortOrder: r.sort_order,
        sizes: legacySizes, variants,
        soldCount: r.sold_count || 0, createdAt: r.created_at || null,
        importBatchId: r.import_batch_id || null, badge: r.badge || null
      };
    }

    const PRODUCT_BADGE_LABELS = {
      NEW: { uz: 'Yangi', ru: 'Новинка' },
      TOP: { uz: 'Top', ru: 'Топ' },
      RECOMMENDED: { uz: 'Tavsiya', ru: 'Рекомендуем' },
      PROMO: { uz: 'Aksiya', ru: 'Акция' },
    };
    function productBadgeLabel(badge) {
      const l = PRODUCT_BADGE_LABELS[badge];
      return l ? tr(l.uz, l.ru) : '';
    }
    function productBadgeChipHtml(p) {
      if (!p.badge || !PRODUCT_BADGE_LABELS[p.badge]) return '';
      return `<span class="fc-product-badge-chip fc-product-badge-${p.badge.toLowerCase()}">${productBadgeLabel(p.badge)}</span>`;
    }

    // Universal variant modeli: oddiy / faqat o'lcham / faqat rang / o'lcham+rangi.
    function productVariants(p) { return Array.isArray(p?.variants) ? p.variants : []; }
    function hasProductImage(p) { return typeof p?.img === 'string' && p.img.trim().length > 0; }
    function variantLabel(v) {
      return [v?.size, v?.color].filter(Boolean).join(' / ') || 'Asosiy';
    }
    function variantKey(size, color) { return `${size || ''}::${color || ''}`; }
    function variantQty(p, size, color) {
      const v = productVariants(p).find(x => (x.size || null) === (size || null) && (x.color || null) === (color || null));
      return v ? Number(v.qty) || 0 : Number(p?.stock) || 0;
    }

    // O'lchamlarni "40,2/42,4/44,8" matnidan [{size,qty}] ro'yxatiga o'giradi.
    // Agar ranglar bilan variant kiritilsa, Excel/import parseri alohida universal formatga aylantiradi.
    function parseSizesInput(text) {
      return (text || '').split('/').map(s => s.trim()).filter(Boolean).map(pair => {
        const parts = pair.split(',').map(s => s.trim());
        const size = parts[0] || '';
        const qty = parseInt(parts[1], 10);
        return { size, qty: isNaN(qty) ? 0 : qty };
      }).filter(s => s.size);
    }
    function formatSizesForInput(sizes) {
      return (sizes || []).map(s => `${s.size},${s.qty}`).join('/');
    }

    // ==================== UNIVERSAL 2-USTUNLI VARIANT KONSTRUKTORI ====================
    // Tovar qo'shish va tahrirlashda BIR XIL komponent. Ustun nomlari generic
    // ("1-ustun"/"2-ustun") — DBda hamon size/color deb saqlanadi (backend/RPC/
    // checkout/order-tarixi o'zgarmasligi uchun ataylab shunday: 1-ustun->size,
    // 2-ustun->color, bitta-birga mos). Matn kiritishda HECH QACHON qayta render
    // qilinmaydi (fokus/klaviatura buzilmasligi uchun) — faqat qator qo'shish/
    // o'chirishda (+/-) qatorlar ro'yxati DOM'dan o'qilib qayta chiziladi.
    function hydrateVariantBuilderFromProduct(p) {
      const vars = productVariants(p);
      variantBuilderRows = vars.length
        ? vars.map(v => ({ level1: v.size || '', level2: v.color || '', qty: String(v.qty ?? 0) }))
        : [{ level1: '', level2: '', qty: '' }];
    }
    function readVariantBuilderRowsFromDom() {
      const rowEls = document.querySelectorAll('#vb-rows .vb-row');
      return Array.from(rowEls).map(el => ({
        level1: el.querySelector('.vb-level1')?.value || '',
        level2: el.querySelector('.vb-level2')?.value || '',
        qty: el.querySelector('.vb-qty')?.value || '',
      }));
    }
    function variantBuilderInsertRow(idx) {
      const rows = readVariantBuilderRowsFromDom();
      rows.splice(idx + 1, 0, { level1: '', level2: '', qty: '' });
      variantBuilderRows = rows;
      const container = document.getElementById('vb-rows');
      if (!container) return;
      container.innerHTML = renderVariantBuilderRowsHtml(rows);
      const newInput = container.querySelector(`.vb-row[data-idx="${idx + 1}"] .vb-level1`);
      if (newInput) newInput.focus();
    }
    function variantBuilderRemoveRow(idx) {
      const rows = readVariantBuilderRowsFromDom();
      if (rows.length <= 1) return;
      rows.splice(idx, 1);
      variantBuilderRows = rows;
      const container = document.getElementById('vb-rows');
      if (container) container.innerHTML = renderVariantBuilderRowsHtml(rows);
    }
    // Har ustun MUSTAQIL yuqoridan-pastga meros oladi (bo'sh katak = yuqoridagi
    // eng yaqin qiymat). Soni hech qachon meros olinmaydi — har qatorning o'zi.
    function resolveVariantBuilderRows(rawRows) {
      let last1 = null, last2 = null;
      const out = [];
      for (const row of (rawRows || [])) {
        const v1 = String(row.level1 || '').trim();
        const v2 = String(row.level2 || '').trim();
        if (v1) last1 = v1;
        if (v2) last2 = v2;
        const qty = Math.max(0, Number.parseInt(row.qty, 10) || 0);
        const size = last1 || null;
        const color = last2 || null;
        if (size || color) out.push({ size, color, qty });
      }
      return out;
    }
    function renderVariantBuilderRowsHtml(rows) {
      return rows.map((row, i) => `
        <div class="vb-row fc-variant-row" data-idx="${i}">
          <input type="text" class="vb-level1 p-2 border rounded-lg text-xs" value="${escapeHtml(row.level1)}" placeholder="${tr('1-ustun', '1-я колонка')}">
          <input type="text" class="vb-level2 p-2 border rounded-lg text-xs" value="${escapeHtml(row.level2)}" placeholder="${tr('2-ustun', '2-я колонка')}">
          <input type="number" min="0" class="vb-qty p-2 border rounded-lg text-xs" value="${escapeHtml(row.qty)}" placeholder="0">
          <div class="flex gap-1">
            <button type="button" onclick="variantBuilderInsertRow(${i})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 font-bold text-sm" aria-label="${tr("Qator qo'shish", "Добавить строку")}">+</button>
            <button type="button" onclick="variantBuilderRemoveRow(${i})" ${rows.length <= 1 ? 'disabled' : ''} class="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 font-bold text-sm disabled:opacity-30" aria-label="${tr("Qatorni o'chirish", "Удалить строку")}">−</button>
          </div>
        </div>
      `).join('');
    }
    function renderVariantBuilderHtml() {
      const rows = variantBuilderRows.length ? variantBuilderRows : [{ level1: '', level2: '', qty: '' }];
      return `
        <div class="space-y-2">
          <label class="font-bold text-gray-600">${tr('Variantlar (ixtiyoriy)', 'Варианты (необязательно)')}</label>
          <div class="fc-variant-row text-[10px] font-bold text-gray-400 px-0.5">
            <span>${tr('1-ustun', '1-я колонка')}</span>
            <span>${tr('2-ustun', '2-я колонка')}</span>
            <span>${tr('Soni', 'Кол-во')}</span>
            <span></span>
          </div>
          <div id="vb-rows" class="space-y-1.5">${renderVariantBuilderRowsHtml(rows)}</div>
          <p class="text-[9px] text-gray-400">${tr("Katak bo'sh qoldirilsa, shu ustunda yuqoridagi eng yaqin qiymat olinadi. Masalan: 48/Qizil/5, keyingi qatorda 1-ustun bo'sh + Sariq/8 → natija 48/Sariq/8.", "Если ячейка пуста, берётся ближайшее значение сверху в этой колонке. Например: 48/Красный/5, затем пусто + Жёлтый/8 → результат 48/Жёлтый/8.")}</p>
        </div>
      `;
    }

    // Legacy audit, 1-band: ba'zi tovar tavsiflarida (masalan Billz import
    // orqali kelgan) xom HTML manba matni ("<p class=...>") saqlanib qolgan —
    // escapeHtml() to'g'ri ishlayapti (XSS yo'q), lekin teglar userga
    // "teg supi" bo'lib ko'rinadi. Teglarni escaping'dan OLDIN olib
    // tashlaymiz — escaping o'zi saqlanadi (xavfsizlik pasaymaydi).
    function stripHtmlTags(text) {
      if (!text) return '';
      return String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function truncateText(text, maxLen) {
      if (!text) return '';
      return text.length > maxLen ? text.slice(0, maxLen).trim() + '…' : text;
    }
    function sizesTotalQty(sizes) {
      return (sizes || []).reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
    }
    function mapCategoryFromDB(r) {
      return { id: r.id, name: r.name, nameRu: r.name_ru || null, parentId: r.parent_id, img: r.img, sortOrder: r.sort_order || 0 };
    }
    // Buyurtma va savat tarixi endi to'g'ridan-to'g'ri bazadan emas, balki
    // serverda tasdiqlangan Edge Function javobidan keladi (pastdagi callApi).
    function formatOrderForUi(o) {
      const deliveryFee = Math.max(0, Number(o?.deliveryFee ?? o?.delivery?.fee ?? 0) || 0);
      const rawPayable = Number(o?.payableTotal ?? o?.totalPrice ?? 0) || 0;
      const subtotal = Math.max(0, Number(o?.subtotal ?? (rawPayable - deliveryFee)) || 0);
      const promoDiscount = Math.max(0, Number(o?.promoDiscount) || 0);
      const payableTotal = Math.max(0, subtotal + deliveryFee - promoDiscount);
      return { ...o, subtotal, deliveryFee, promoDiscount, payableTotal, totalPrice: payableTotal, date: new Date(o.createdAt).toLocaleString() };
    }

    // STATE VARIABLES (bo'sh boshlanadi, Supabase/Edge Function'dan yuklanadi)
    let products = [];
    let categories = [];
    let adminsList = [];
    let orders = [];
    let ordersLoaded = false, ordersLoading = false;
    let usersLoaded = false, usersLoading = false;
    let adminsLoaded = false, adminsLoading = false;
    // Savatni tashlab ketganlar (Online Do'kon yaxshilashlari, 2-band).
    let abandonedCarts = [];
    let abandonedCartsLoaded = false, abandonedCartsLoading = false;
    // Promo-kod (Online Do'kon yaxshilashlari, 1-band) — admin ro'yxati + forma.
    let promoList = [];
    let promoListLoaded = false, promoListLoading = false;
    let promoDraft = null; // {id?, code, name, discountType, discountValue, minOrderAmount, startsAt, endsAt, usageLimit, perCustomerLimit, isActive}
    let promoSaving = false;
    // "Kelganda xabar bering" (back-in-stock) — boot() orqali to'ldiriladi.
    let mySubscribedProductIds = new Set();
    let stockSubscribeBusy = new Set();
    // Do'kon pauza rejimi (Online Do'kon yaxshilashlari, 13-band).
    let ordersPaused = false;
    let ordersPausedNote = '';
    let ordersPausedSaving = false;
    // Banner tizimi (Online Do'kon yaxshilashlari, 17-band).
    let activeBanners = [];
    // Bosh sahifa — tanlangan kataloglar qatori: [{categoryId, productIds}].
    let featuredCategories = [];
    let featuredCategoriesSaving = false;
    // Bekor qilish cutoff + qaytarish murojaati (Online Do'kon yaxshilashlari, 14/15-band).
    let customerCancelCutoff = 'BEFORE_SHIPPED';
    let returnRequestsEnabled = true;
    let orderPoliciesSaving = false;
    // 18-band: bosh sahifadagi "e'tibor talab qiladi" markazi.
    let adminActionCenter = null;
    let adminActionCenterLoading = false;
    let bannerList = [];
    let bannerListLoaded = false, bannerListLoading = false;
    let bannerDraft = null;
    let bannerSaving = false;
    // Shop takomillashtirish (qo'shimcha): Aksiya (bundle) / Bosqichli
    // chegirma (tier) / Avtomatik sovg'a qoidasi (reward) / VIP mijoz
    // chegirmasi — hammasi bannerlar bilan bir xil CRUD naqshida.
    let bundleList = [];
    let bundleListLoaded = false, bundleListLoading = false;
    let bundleDraft = null;
    let bundleSaving = false;
    let tierList = [];
    let tierListLoaded = false, tierListLoading = false;
    let tierDraft = null;
    let tierSaving = false;
    let rewardRuleList = [];
    let rewardRuleListLoaded = false, rewardRuleListLoading = false;
    let rewardRuleDraft = null;
    let rewardRuleSaving = false;
    let customerDiscountList = [];
    let customerDiscountSaving = false;
    let vipSelectMode = false;
    let vipSelectedTgIds = new Set();
    // "Aksiyalar va chegirmalar" ommaviy sahifasi + detail.
    let marketingCampaigns = null; // { bundles, promotions }
    let marketingCampaignsLoading = false;
    let campaignDetail = null; // { kind, bundle|promotion }
    let campaignDetailLoading = false;
    let campaignMediaViewerIdx = null;
    // 2-10-band (2026-08-17): qo'llab-quvvatlash — cheksiz xabarlashuvli
    // thread, admin tomonda user->chatlar->chat bo'ylab guruhlangan.
    let supportTickets = [];
    let supportTicketsLoaded = false, supportTicketsLoading = false;
    let adminSupportTickets = [];
    let adminSupportTicketsLoaded = false, adminSupportTicketsLoading = false;
    let supportTicketOrderId = null; // openSupportModal(orderId) orqali kelgan kontekst
    let supportTicketType = 'SUPPORT'; // 'SUPPORT' | 'RETURN'
    let supportMessages = []; // hozir ochiq chatning xabarlari
    let supportMessagesLoading = false;
    let openSupportTicketId = null; // mijoz tomonda hozir ochiq chat
    let supportReplyTarget = null; // {id, body, sender} — "shu xabarga javob" preview
    let supportSendingMessage = false; // 41-band: ikki marta yuborishni oldini olish
    let adminSupportSelectedUser = null; // admin: Support -> User bosqichi
    let adminSupportSelectedTicketId = null; // admin: User -> Chat bosqichi
    let cart = JSON.parse(localStorage.getItem(scopedKey('cart')) || "{}");
    // Shop takomillashtirish qo'shimchasi: Aksiya (bundle) savat qatorlari
    // oddiy `cart`dan ALOHIDA (bundleId -> {qty,name,bundlePrice,coverImageUrl}
    // snapshot, checkout ochilgan payt) — bundle ro'yxati/narxi backend'da
    // faqat public get_marketing_campaigns/get_campaign_detail orqali
    // ko'rinadi (bundle_list admin-only), shuning uchun snapshot yetarli.
    let bundleCart = JSON.parse(localStorage.getItem(scopedKey('bundleCart')) || "{}");
    let registeredUser = JSON.parse(localStorage.getItem(scopedKey('registeredUser')) || "null");
    let checkoutDraft = JSON.parse(localStorage.getItem(scopedKey('checkoutDraft')) || "null") || { fullname: '', phone: '', regionKey: 'tashkent_city', district: '', address: '' };
    // Eski (pre-013) localStorage'da qolgan bo'lishi mumkin bo'lgan hudud
    // ID'larini (o'zbekcha nom yoki eski 'TASHKENT_CITY') kanonik kodga o'giradi.
    checkoutDraft.regionKey = canonicalRegionCode(checkoutDraft.regionKey)
      || canonicalRegionCode(checkoutDraft.region === 'PROVINCE' ? checkoutDraft.viloyat : null)
      || 'tashkent_city';

    // MUHIM: bular endi HECH QACHON "standart admin"ga tushmaydi. Haqiqiy
    // qiymatlar faqat boot() ichida, serverdagi Edge Function Telegram
    // imzosini tasdiqlagandan KEYIN o'rnatiladi. Ilova Telegram tashqarisida
    // ochilsa, bular hech qachon to'ldirilmaydi va ilova ishlamaydi (bu ataylab
    // shunday — xavfsizlik uchun).
    let currentTgId = null;
    let isSuperAdmin = false;
    // Xodimlar/Huquqlar (Admin Roles & Permissions). staffRole: 'OWNER'|'STAFF'|null.
    // myPermissions: ['*'] (OWNER/platforma bosh admin) yoki aniq ro'yxat (STAFF).
    let staffRole = null;
    let myPermissions = [];
    function hasPermission(perm) { return myPermissions.includes('*') || myPermissions.includes(perm); }
    let pendingStaffInvite = null;
    let staffList = [];
    let staffPendingInvites = [];
    let staffListLoaded = false, staffListLoading = false;
    let allPermissions = [];
    let roleList = [];
    let rolesLoaded = false, rolesLoading = false;
    let roleDraft = null;
    let isUserAnAdmin = false;

    // Bloklash/ogohlantirish holati — faqat serverdan (boot javobidan) keladi
    let myStatus = { isBlocked: false, blockReason: null, isWarned: false, warnReason: null };

    let currentTab = 'home';
    // POLISH ROUND 1-bosqich: page-shell — modal (backdrop) emas, to'liq sahifa
    // (Qo'llab-quvvatlash/Sozlamalar/Dashboard/Ombor-Holat). null = hech qanday page ochiq emas.
    let activePage = null;
    let warehouseMissingImageOnly = false;
    // 11-16-band: Ombor tabi ichida ikki sub-bo'lim — Holat (summary, default)
    // va Qoldiqni yangilash (mavjud daraxt+SKU tezkor yangilash, o'zgarishsiz saqlangan).
    let warehouseSubTab = 'HOLAT';
    let warehouseSummaryData = null;
    let warehouseSummaryLoading = false;
    let warehouseSummaryLoaded = false;
    let warehouseStockFilter = null; // 'LOW' | 'OUT' | null — Holat cardi bosilganda
    let warehouseStockFilterPage = 1;
    let warehouseStockFilterSearch = '';
    let warehouseKirimShowCatalog = false;
    // 15-16-band: Kirim (stock-in ADD) + harakatlar tarixi
    let warehouseKirimSearch = '';
    let warehouseKirimSelectedProduct = null;
    let warehouseKirimSelectedVariantSku = null;
    let warehouseKirimQty = '';
    let warehouseKirimSaving = false;
    // ROUND 10: Qoldiq + Kirim bitta katalog-brauzer oqimida. Backend actionlar o'zgarmaydi.
    let warehouseBrowseCategoryId = null;
    let warehouseBulkPanelOpen = false;
    let warehouseStockAdjustProductId = null;
    let warehouseStockAdjustVariantSku = null;
    let warehouseStockAdjustDraft = '';
    let warehouseStockAdjustSaving = false;
    let warehouseMovements = [];
    let warehouseMovementsLoading = false;
    let warehouseMovementsLoaded = false;
    let warehouseMovementsPage = 1;
    let warehouseMovementsTotal = 0;
    let warehouseMovementsFilter = null; // 'KIRIM' | 'BUYURTMA' | 'MANUAL' | null
    let warehouseMovementsSearch = '';
    let warehouseMovementsDateRange = null; // 'today' | '7d' | '30d' | 'custom' | null (barchasi)
    let warehouseMovementsDateFrom = '';
    let warehouseMovementsDateTo = '';
    let warehouseImportedMissingImageOnly = false;
    let isAdminMode = false;
    let authReady = false;
    let adminCatParentId = null;
    let categoryPage = 1;
    // sortPrice/sortNew/sortSold: null | 'asc' | 'desc' — har biri mustaqil yoqiladi
    let categoryFilter = { search: '', minPrice: '', maxPrice: '', sortPrice: null, sortNew: null, sortSold: null, inStockOnly: false, discountOnly: false };
    // 23-band: Bosh sahifa qidiruv matni — search-input DOM elementi qayta
    // chizilganda (masalan product detaildan orqaga qaytilganda) yo'qolmasin.
    let homeSearchQuery = '';
    let ordersPage = 1;
    let userOrderFilter = 'ALL';
    // Buyurtmalar uchun umumiy sana oralig'i filtri — user/admin bir xil state.
    // Buyurtmalar uchun bitta zamonaviy kalendar-range filtri.
    // 1-bosish = boshlanish, 2-bosish = tugash. Shu kunni ikki marta bosish
    // aynan bitta kunlik intervalni (masalan 22.08.2026–22.08.2026) tanlaydi.
    let ordersDateFrom = '';
    let ordersDateTo = '';
    // Calendar popup ichidagi tanlov committed filterdan alohida draftda turadi.
    // Faqat tasdiqlash iconi bosilganda ordersDateFrom/To ga o'tadi.
    let ordersCalendarDraftFrom = '';
    let ordersCalendarDraftTo = '';
    let ordersCalendarAnchorRect = null;
    let ordersCalendarPickerMode = 'days'; // days | months | years
    let ordersCalendarYearPageStart = null;
    let cardActionMenu = null; // {kind:'product'|'category', id}
    let ordersCalendarMonth = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    let selectedProductModal = null;
    let selectedOrderModal = null;
    let rejectReceiptOrderId = null; // 14-band: REJECT_RECEIPT modali qaysi buyurtma uchun ochilgani
    let selectedCategoryModal = null;
    let selectedUserModal = null;
    let usersSummary = [];
    let shopLogoUrl = null;
    let botUsername = null; // 1.10: "Telegramda ko'rish" uchun — hardcode emas, boot() javobidan
    let shopContact = { name: null, address: null, addressRu: null, coordinates: null, phone: null, phone2: null, phone3: null, instagram: null, telegram: null, facebook: null, startMessage: null, workHours: null };
    let shopLowStockThreshold = 5;
    // Billz (billz.ai) integratsiyasi — boshqarilgan/beta chiqarilish: faqat
    // platforma bosh admin ruxsat bergan do'konlarda true bo'ladi (boot()
    // javobidan). false bo'lsa "Billz" bo'limi sozlamalarda umuman ko'rinmaydi.
    let billzAccessGranted = false;
    let billzConnectionStatus = null; // {status, billzShopName, billzCashboxName, billzPaymentTypeName, lastError}
    let billzConfigOptions = null; // {shops, cashboxes, paymentTypes} — ulangandan keyin tanlash uchun
    // Click.uz avtomatik to'lov integratsiyasi — Billz bilan bir xil
    // ruxsat-darvoza naqshi (platforma bosh admin ruxsat berganda true).
    let clickAccessGranted = false;
    let clickConnectionStatus = null; // {status, merchantId, serviceId}
    // Billz Phase 2 — katalog ko'rish/import holati.
    let billzBrowseCategories = null; // Billz'ning o'z kategoriya daraxti
    let billzBrowseSelectedCatId = ''; // hozir ko'rilayotgan Billz kategoriyasi
    let billzBrowseSearch = '';
    let billzBrowseLoading = false;
    let billzBrowseItems = []; // hozirgi sahifadagi hali import qilinmagan Billz tovarlari
    let billzBrowseCount = 0;
    let billzBrowsePage = 1;
    let billzBrowseSelectedIds = new Set(); // tanlangan billzProductId'lar
    let billzImportTargetCategoryId = null; // "B" tugmasi bosilgan katalogdan oldindan to'ldiriladi
    let billzImporting = false;
    // Billz Phase 4 — avtomatik sinxron natijasida o'chirilgan tovarlar sahifasi.
    let billzSubTab = 'IMPORT'; // 'IMPORT' | 'IMPORTED' | 'DELETED'
    let billzDeletedItems = [];
    let billzDeletedLoading = false;
    // 8-band: "Import qilinganlar" — Billz'ga bog'langan UStorE tovarlari,
    // belgilab importdan (Billz bog'lanishidan) olib tashlash mumkin.
    let billzImportedItems = [];
    let billzImportedLoading = false;
    let billzImportedSelectedIds = new Set();
    let billzUnlinking = false;
    // 9-band: sahifa hajmi tanlovi (10/25/50/100) — 100 tanlangan va jami
    // 100 tadan ko'p bo'lsa raqamli sahifalash (1,2,3...) chiqadi.
    let billzBrowsePageSize = 10;
    let fulfillmentConfig = commerce.defaultConfig(TOP_LEVEL_REGION_IDS);
    let fulfillmentDraft = null;

    // ---- Block 4: store design/theme ----
    let designSettings = { themeId: 'minimal', colors: {} };
    let designDraft = null;
    // ROUND14: huquqiy hujjatlar shop-scoped, serverdan keladi.
    let legalDocuments = [];
    let legalDraft = null;
    let legalConsentRequired = false;
    // 'MENU' (A/B tanlash) | 'DELIVERY' | 'PAYMENTS' — 1.1 talabiga ko'ra
    // "Yetkazib berish va to'lov" endi ikkita alohida bo'limga bo'lingan.
    let fulfillmentSettingsSection = 'MENU';
    let fulfillmentDeliveryKind = 'FREE'; // FREE | FIXED | TAXI | POST (faqat DELIVERY bo'limida)
    let fulfillmentExpandedPayment = null; // CASH | CARD | null (faqat PAYMENTS bo'limida, 1.2: yonma-yon + inline ochilish)
    // Yetkazib berish parametrlarida bir vaqtda faqat kerakli hudud kartasi ochiq turadi.
    let fulfillmentExpandedRegionKey = null;
    // ROUND14: tumanlar region kartasi ochilishi bilan birdan ko'rinmaydi — alohida tugma bilan ochiladi.
    let fulfillmentExpandedDistrictKey = null;
    const qrProviderTestState = {}; // providerId -> {status:'opened'|'verified'|'failed', note?}
    const qrProviderDecodedRaw = {};
    const qrProviderDecodeState = {}; // providerId -> {status:'loading'|'success'|'error', message?}
    const qrProviderLoading = new Set();
    const qrProviderNeedsTest = new Set();
    let selectedDeliveryMethodId = checkoutDraft.deliveryMethodId || null;
    let selectedPayMethod = checkoutDraft.paymentMethodId || null;
    let selectedQrProviderId = null;
    // Promo-kod: checkoutPromoCode — inputdagi qiymat, appliedPromoState —
    // faqat server (promo_preview) tasdiqlagandan keyin to'ldiriladi. Chegirma
    // HAR DOIM promo_preview/create_order javobidan olinadi, mijoz tomonda
    // hisoblanmaydi.
    let checkoutPromoCode = '';
    let appliedPromoState = null; // { code, name, discountAmount } | null
    let promoApplying = false;
    let promoError = '';
    let checkoutReceiptFile = null;
    let checkoutReceiptPreparing = null;
    let checkoutReceiptPreviewUrl = null; // 1.8: local preview uchun object URL
    // 15-band: rad etilgan chekni qayta yuborish uchun alohida state —
    // checkout state'idan mustaqil (checkout draft bilan aralashib ketmasin).
    let resubmitOrderId = null;
    let resubmitReceiptFile = null;
    let resubmitReceiptPreparing = null;
    let resubmitReceiptPreviewUrl = null;
    let resubmitReceiptSelectionVersion = 0;
    // 8-bo'lim: preview asl native File'dan uzoq yashaydigan object URL bo'lib
    // qolmasligi uchun — capture muvaffaqiyatli bo'lgach detached Blob'dan
    // yangilanadi. Bu versiya tez-tez qayta tanlashda eski (sekin) capture'ning
    // yangi tanlovni bosib yubormasligini kafolatlaydi.
    let checkoutReceiptSelectionVersion = 0;
    // 1.14: BTS/EMU filial tanlash — mijoz qo'lda manzil yozmaydi.
    let checkoutBranches = [];
    let checkoutBranchesLoading = false;
    let checkoutBranchesLoadedFor = null; // `${regionKey}::${district}::${providerId}` — qayta yuklashni oldini olish uchun
    let checkoutSelectedBranch = null;
    let checkoutBranchSearch = '';
    // 5.7: har loadCheckoutBranches chaqiruvi o'zining raqamini oladi — eski
    // (sekin) so'rov keyinroq qaytsa ham, agar bu orada yangi so'rov
    // boshlangan bo'lsa, eski javob UI holatini bosib yubormaydi.
    let branchRequestSeq = 0;
    // 5.6: POST (BTS/EMU) oqimi uchun tuman/shahar bosqichi — provider bu
    // tanlanmaguncha tanlanmaydi (avtomatik tanlanmaydi).
    // 2-band: bitta tuman state — #chk-district har doim yagona manba.
    // checkoutDistrictOptions haqiqiy delivery_branches ma'lumotidan olingan
    // ro'yxat (BTS/EMU filtrlashga to'g'ri mos keladi); bo'sh bo'lsa hardcoded
    // UZ_REGIONS_BY_CODE/TASHKENT_CITY_DISTRICTS'ga fallback qilinadi.
    let checkoutDistrictOptions = [];
    let checkoutDistrictOptionsLoading = false;
    let checkoutDistrictOptionsLoadedFor = null; // regionKey
    let activePopupModal = null;
    // Do'kon ma'lumotlari formasida logo tanlash/URL oynasiga o'tishda
    // hali saqlanmagan input qiymatlari yo'qolib ketmasligi uchun vaqtinchalik draft.
    let shopInfoDraft = null;
    // Do'kon logosi form draftining bir qismi: tanlash = faqat preview; real saqlash
    // faqat SHOP_INFO pastidagi "Saqlash" bosilganda bajariladi.
    let shopLogoDraft = null; // { kind:'file', file, previewUrl } | { kind:'url', url }
    let shopLogoPreparing = false; // gallery/files tanlangach preview tayyor bo'lguncha spinner
    let editingFieldData = null;
    // Universal 2-ustunli variant konstruktori (Add + Edit bir xil komponent).
    // Har qator: {level1, level2, qty} — level1->size, level2->color (mavjud
    // backend/RPC shakli o'zgarmaydi, faqat kiritish UX'i almashadi).
    let variantBuilderRows = [];
    let missingImageQueueIndex = 0;
    let missingImageQueueSaving = false;

    // ---- Block 2: catalog management (reorder/move/trash/duplicate/history) ----
    let priceHistoryProductId = null;
    let priceHistoryList = null;
    let moveProductId = null;
    let moveTargetCategoryId = '';
    let moveCategoryId = null;
    let moveCategoryTargetId = '';
    let trashBatches = null;
    // 28-30-band: PRODUCT-turdagi trash batchlarda mahsulot darajasidagi
    // tanlash holati — batchId bo'yicha.
    let trashSelectMode = {};
    let trashSelectedProductIds = {};
    let bulkProductSelectMode = false;
    const bulkSelectedProductIds = new Set();
    let bulkMoveTargetCategoryId = '';
    let bulkCategorySelectMode = false;
    const bulkSelectedCategoryIds = new Set();
    let movePickerParentId = null;
    let movePickerSearch = '';
    let catalogLongPressTimer = null;
    let suppressCatalogClickOnce = false;
    let catalogDragState = null;
    let trashBulkSelectMode = false;
    const trashSelectedBatchIds = new Set();
    let trashSearchQuery = '';
    let trashLongPressTimer = null;
    let suppressTrashClickOnce = false;
    let trashActionMenuBatchId = null;
    // 17-band: Sevimlilar — boot'dan keyin bir marta yuklanadi (har card uchun
    // alohida so'rov yo'q, 48-band talabi).
    let favoriteProductIds = new Set();
    let favoritesLoaded = false;
    let favoritesLoading = false;
    let favoritesPage = 1;
    // 18-band: Yaqinda ko'rilganlar — tartib muhim (eng oxirgi birinchi), shuning
    // uchun massiv (Set emas).
    let recentViewProductIds = [];
    let recentViewsLoaded = false;
    let recentPage = 1;
    let dashboardLiteData = null;
    let dashboardLiteLoading = false;
    let dashboardCustomerPage = 1; // 9-band: Dashboard ichidagi Mijozlar bo'limi paginationi
    // 49-51-band: Dashboard+Hisobot BITTA modul, ichki tablar + davr filtri.
    let dashboardTab = 'UMUMIY'; // UMUMIY | BUYURTMALAR | SAVDO | MIJOZLAR | MAHSULOTLAR
    let dashboardPeriod = 'all'; // 'today' | 'week' | 'month' | 'custom' | 'all'
    let dashboardCustomFrom = '';
    let dashboardCustomTo = '';

    // Rasm yuklash uchun: haqiqiy fayl (Storage'ga yuklanadi) va preview (faqat ko'rsatish uchun)
    let tempImageFile = null;
    let tempImagePreviewUrl = null;
    let tempImagePreparingPromise = null;
    let tempImageUrl = null;
    let tempImageExistingUrl = null;
    let tempImageSelectionVersion = 0;

    function clearTempImageSelection() {
      tempImageSelectionVersion += 1;
      if (tempImagePreviewUrl && String(tempImagePreviewUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(tempImagePreviewUrl); } catch (_) {}
      }
      tempImageFile = null;
      tempImagePreviewUrl = null;
      tempImagePreparingPromise = null;
      tempImageUrl = null;
      tempImageExistingUrl = null;
    }
    function initializeTempImageEditor(existingUrl = null) {
      clearTempImageSelection();
      tempImageExistingUrl = hasProductImage({ img: existingUrl }) ? String(existingUrl).trim() : null;
    }
    function takeTempImageSnapshot() {
      const snap = {
        file: tempImageFile,
        preview: tempImagePreviewUrl,
        preparing: tempImagePreparingPromise,
        url: tempImageUrl,
      };
      tempImageFile = null;
      tempImagePreviewUrl = null;
      tempImagePreparingPromise = null;
      tempImageUrl = null;
      tempImageExistingUrl = null;
      tempImageSelectionVersion += 1;
      return snap;
    }
    function releaseImageSnapshot(snap) {
      if (snap?.preview && String(snap.preview).startsWith('blob:')) {
        try { URL.revokeObjectURL(snap.preview); } catch (_) {}
      }
    }

    // Joriy ko'rinib turgan mahsulotlar ro'yxati (⬆️⬇️ tugmalari shu ro'yxat ichida ishlashi uchun)
    let currentVisibleProductIds = [];

    let adminOrderFilters = {
      status: 'ALL',
      region: 'ALL',
      payment: 'ALL',
      search: ''
    };

    // Buyurtma statuslarini o'zbekcha ko'rsatish va har biriga alohida rang
    const STATUS_COLORS = {
      NEW: "bg-amber-100 text-amber-800",
      PROCESSING: "bg-blue-100 text-blue-800",
      DELIVERED: "bg-green-100 text-green-800",
      CANCELLED: "fc-bg-danger-soft fc-text-danger",
      REJECTED: "fc-bg-danger-soft fc-text-danger",
    };
    function statusColorClass(st) { return STATUS_COLORS[st] || "bg-gray-100 text-gray-600"; }
    // 14-band: chek rad etilgan bo'lsa, orders.status o'zi o'zgarmagan (hali
    // "Yangi" bo'lishi mumkin) — lekin mijoz/adminga alohida "Rad etildi"
    // holati ko'rsatiladi, orders.status'ga hech qanday yangi qiymat
    // qo'shilmagan (mavjud update_order_status RPCga tegilmadi).
    // 3-band: "Chek tekshirilmoqda" endi tepadagi badge'da EMAS — faqat
    // effectiveShipmentStatusLabel() orqali "Jo'natma holati" qatorida
    // ko'rsatiladi (ikkita alohida ko'rsatkich birlashtirildi). Tepadagi
    // badge endi buyurtmaning haqiqiy o.status qiymatini ko'rsatadi.
    function orderDisplayStatus(o) {
      if (o?.receiptReviewStatus === 'REJECTED') return 'REJECTED';
      return o?.status;
    }

    // Karta orqali to'langan, chek yuklangan, lekin admin hali ko'rib
    // chiqmagan buyurtma — orders.status hamon "NEW" bo'lib qoladi (hech
    // qanday yangi haqiqiy status qiymati kiritilmagan), faqat displeyda
    // almashtiriladi.
    function isReceiptPendingReview(o) {
      return o?.status === 'NEW' && o?.hasReceipt && (o?.receiptReviewStatus || 'PENDING') === 'PENDING';
    }
    // 3-band: avval mustaqil tepadagi badge ("Chek tekshirilmoqda") va
    // pastdagi "Jo'natma holati: Tayyorlanmoqda" qatori bir vaqtda ko'rinardi.
    // Endi bitta manba — chek ko'rib chiqilayotgan bo'lsa shipment qatorining
    // o'zi "Chek tekshirilmoqda" deydi, aks holda oddiy shipment holati.
    function effectiveShipmentStatusLabel(o) {
      if (isReceiptPendingReview(o)) return tr('🧾 Chek tekshirilmoqda', '🧾 Проверка чека');
      return shipmentStatusLabel(o?.shipment?.status);
    }

    // ============ TIL (O'ZBEK / RUS) ============
    // Ilovaning tayyor matnlari uchun lug'at. Faqat shu yerda ro'yxatdagi
    // matnlar tugma bilan tilga qarab almashadi. Admin kiritgan tovar
    // nomi/tavsifi esa alohida (nameRu/descRu maydonlari orqali) boshqariladi.
    let uiLang = localStorage.getItem('uiLang') || 'uz';
    // Shop takomillashtirish: matn hajmi (zoom), -2..+2, qurilma bo'yicha
    // shaxsiy afzallik (uiLang kabi shop'ga bog'liq emas — scopedKey shart emas).
    let textZoomLevel = Math.max(-2, Math.min(2, Number.parseInt(localStorage.getItem('textZoomLevel'), 10) || 0));
    function applyTextZoom(level) {
      textZoomLevel = Math.max(-2, Math.min(2, Number.parseInt(level, 10) || 0));
      localStorage.setItem('textZoomLevel', String(textZoomLevel));
      document.documentElement.classList.remove('fc-zoom--2', 'fc-zoom--1', 'fc-zoom-1', 'fc-zoom-2');
      if (textZoomLevel !== 0) document.documentElement.classList.add(`fc-zoom-${textZoomLevel}`);
    }
    applyTextZoom(textZoomLevel);
    function setTextZoom(level) { applyTextZoom(level); render(); }
    const UI_TEXT = {
      nav_home: { uz: "Bosh sahifa", ru: "Главная" },
      nav_categories: { uz: "Kataloglar", ru: "Каталоги" },
      nav_cart: { uz: "Savatcha", ru: "Корзина" },
      nav_orders: { uz: "Buyurtmalar", ru: "Заказы" },
      nav_warehouse: { uz: "Ombor", ru: "Склад" },
      nav_support: { uz: "Qo'llab-quvvatlash", ru: "Поддержка" },
      nav_profile: { uz: "Profil", ru: "Профиль" },
      // 14-band: oddiy mijozga ID orqali qidirish mumkinligini reklama qilmaydi
      // — texnik SKU/ID tushunchasi faqat admin uchun. Qidiruv FUNKSIYASI (ID
      // bo'yicha ham topish) o'zgarmagan, faqat matn shartli. Qarang: searchPlaceholderText().
      search_placeholder: { uz: "Nomi yoki ID (masalan: 111001) orqali qidirish...", ru: "Поиск по названию или ID (например: 111001)..." },
      search_placeholder_user: { uz: "Mahsulot qidiring...", ru: "Поиск товара..." },
      add_to_cart: { uz: "Savatga qo'shish", ru: "Добавить в корзину" },
      add_to_cart_short: { uz: "Savatga", ru: "В корзину" },
      out_of_stock: { uz: "Tugagan", ru: "Нет в наличии" },
      choose_size: { uz: "O'lchamni tanlash", ru: "Выбрать размер" },
      choose_variant: { uz: "Variantni tanlash", ru: "Выбрать вариант" },
      choose_color: { uz: "Rangni tanlash", ru: "Выбрать цвет" },
      place_order: { uz: "Buyurtma berish", ru: "Оформить заказ" },
      save: { uz: "Saqlash", ru: "Сохранить" },
      cancel: { uz: "Bekor qilish", ru: "Отмена" },
      cart_title: { uz: "Savatcha", ru: "Корзина" },
      cart_empty: { uz: "Savatchangiz bo'sh", ru: "Ваша корзина пуста" },
      shop_now: { uz: "Xarid qilish", ru: "Начать покупки" },
      my_orders: { uz: "Buyurtmalarim", ru: "Мои заказы" },
      all_orders: { uz: "Barcha buyurtmalar", ru: "Все заказы" },
      all_filter: { uz: "Barchasi", ru: "Все" },
      warehouse_title: { uz: "Ombor", ru: "Склад" },
      users_title: { uz: "Mijozlar", ru: "Клиенты" },
      total: { uz: "Jami", ru: "Итого" },
    };
    function t(key) {
      const entry = UI_TEXT[key];
      if (!entry) return key;
      return entry[uiLang] || entry.uz;
    }
    function tr(uz, ru) { return uiLang === 'ru' ? ru : uz; }
    // 14-band: admin ID/SKU bo'yicha qidirishni bilishi va ishlatishi davom
    // etadi; oddiy mijozga esa bu texnik tafsilot ko'rsatilmaydi.
    function searchPlaceholderText() { return (isAdminMode && isUserAnAdmin) ? t('search_placeholder') : t('search_placeholder_user'); }
    window.ustoreGetLang = () => uiLang;
    function toggleUiLang() {
      uiLang = uiLang === 'uz' ? 'ru' : 'uz';
      localStorage.setItem('uiLang', uiLang);
      document.documentElement.lang = uiLang;
      render();
    }
    // Admin kiritgan tovar nomi/tavsifi — ruscha tarjimasi bo'lsa va til
    // ruscha tanlangan bo'lsa o'shani, aks holda o'zbekchasini ko'rsatadi.
    function productName(p) { return (uiLang === 'ru' && p.nameRu) ? p.nameRu : p.name; }
    // 5-band: buyurtma ichidagi item — order yaratilganda snapshot qilingan
    // nameRu (create_order action) bo'lsa o'shani, bo'lmasa (eski buyurtmalar)
    // o'zbekchasini ko'rsatadi.
    function orderItemName(i) { return (uiLang === 'ru' && i?.nameRu) ? i.nameRu : (i?.name || ''); }
    function productDesc(p) { return stripHtmlTags((uiLang === 'ru' && p.descRu) ? p.descRu : (p.desc || '')); }
    function categoryName(c) { return (uiLang === 'ru' && c?.nameRu) ? c.nameRu : (c?.name || ''); }
    // 5-band: BTS/EMU filiali — translate_delivery_branches_batch orqali RU
    // maydon to'ldirilgan bo'lsa o'shani, bo'lmasa (production'da hali
    // ishga tushirilmagan bo'lishi mumkin) o'zbekchasini ko'rsatadi.
    function branchNameLabel(b) { return (uiLang === 'ru' && b?.branch_name_ru) ? b.branch_name_ru : (b?.branch_name || ''); }
    function branchDistrictLabel(b) { return (uiLang === 'ru' && b?.district_or_city_ru) ? b.district_or_city_ru : (b?.district_or_city || ''); }
    function branchAddressLabel(b) { return (uiLang === 'ru' && b?.full_address_ru) ? b.full_address_ru : (b?.full_address || ''); }
    // 6-band: admin do'kon nomini o'zgartirmagan bo'lsa neutral "Do'kon"
    // qoladi — orqaga mos, hech kim majburan o'zgartirishga majbur emas.
    function shopDisplayName() { return (shopContact && shopContact.name) ? shopContact.name : "Do'kon"; }
    function formatNumber(v) {
      const n = Math.round(Number(v || 0));
      return String(Number.isFinite(n) ? n : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    function money(v) { return `${formatNumber(v)} ${tr("so‘m", 'сум')}`; }
    // 8-band: oldPrice > price bo'lgandagina chegirma foizi bor — butun songa
    // yaxlitlanadi. oldPrice yo'q yoki price'dan katta emas bo'lsa null
    // (chaqiruvchi taraf shunda badge'ni umuman ko'rsatmaydi).
    function discountPercent(p) {
      if (!p?.oldPrice || !(p.oldPrice > p.price)) return null;
      return Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100);
    }

    // 4-band: Telegram WebView'da (ayniqsa eski Android) navigator.clipboard
    // hamma vaqt ham mavjud/ruxsat etilgan bo'lavermaydi — shu sabab
    // muvaffaqiyatsiz/yo'q bo'lsa xavfsiz fallback (vaqtinchalik yashirin
    // textarea + document.execCommand) ishlatiladi. Ikkalasi ham
    // muvaffaqiyatsiz bo'lsa xatolik jim yutilmaydi — foydalanuvchi buni
    // ko'radi (raqamni qo'lda ko'chirib olishi mumkin bo'lsin uchun).
    async function copyTextToClipboard(text) {
      const value = String(text || '').trim();
      if (!value) return false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (_) { /* fallback pastda */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.top = '0';
        ta.style.left = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    }
    async function copyCardNumber(text) {
      const ok = await copyTextToClipboard(text);
      if (ok) showActionToast(tr('✅ Nusxa olindi', '✅ Скопировано'), 'success', 1400);
      else alert(tr("Nusxalab bo'lmadi. Raqamni qo'lda tanlab nusxalang.", "Не удалось скопировать. Выделите номер вручную."));
    }

    // Har bir katalog uchun o'zidagi va barcha avlod kataloglaridagi tovarlar
    // sonini xotiradagi products/categories ma'lumotidan bir marta hisoblaydi.
    // Bunda qo'shimcha Supabase so'rovi yo'q; noto'g'ri sikl bo'lsa ham cheksiz
    // rekursiyaga tushmaslik uchun visiting to'plami ishlatiladi.
    function buildRecursiveProductCountMap() {
      const childrenByParent = new Map();
      const directProductCount = new Map();

      for (const category of categories) {
        const parentKey = category.parentId === null || category.parentId === undefined
          ? null
          : String(category.parentId);
        if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
        childrenByParent.get(parentKey).push(String(category.id));
      }

      for (const product of products) {
        if (!productVisibleInCurrentMode(product) || product.categoryId === null || product.categoryId === undefined) continue;
        const categoryKey = String(product.categoryId);
        directProductCount.set(categoryKey, (directProductCount.get(categoryKey) || 0) + 1);
      }

      const totals = new Map();
      const visiting = new Set();
      const countFor = (categoryKey) => {
        if (totals.has(categoryKey)) return totals.get(categoryKey);
        if (visiting.has(categoryKey)) return 0;
        visiting.add(categoryKey);
        let total = directProductCount.get(categoryKey) || 0;
        for (const childKey of childrenByParent.get(categoryKey) || []) total += countFor(childKey);
        visiting.delete(categoryKey);
        totals.set(categoryKey, total);
        return total;
      };

      for (const category of categories) countFor(String(category.id));
      return totals;
    }
    function getMissingImageProducts() {
      return products.filter(p => p.status !== 'DELETED' && !hasProductImage(p));
    }
    function categoryPathForProduct(product) {
      const byId = new Map(categories.map(c => [String(c.id), c]));
      const path = [];
      const seen = new Set();
      let currentId = product?.categoryId === null || product?.categoryId === undefined ? null : String(product.categoryId);
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const category = byId.get(currentId);
        if (!category) break;
        path.unshift(categoryName(category));
        currentId = category.parentId === null || category.parentId === undefined ? null : String(category.parentId);
      }
      return path.length ? path.join(' / ') : tr('Bosh katalog', 'Главный каталог');
    }
    // categoryPathForProduct bilan bir xil parentId-yurish logikasi, lekin
    // bosiladigan breadcrumb qurish uchun {id, name} massivini qaytaradi.
    function categoryAncestorChain(categoryId) {
      const byId = new Map(categories.map(c => [String(c.id), c]));
      const chain = [];
      const seen = new Set();
      let currentId = categoryId === null || categoryId === undefined ? null : String(categoryId);
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const category = byId.get(currentId);
        if (!category) break;
        chain.unshift({ id: category.id, name: categoryName(category) });
        currentId = category.parentId === null || category.parentId === undefined ? null : String(category.parentId);
      }
      return chain;
    }
    function openMissingImageQueue() {
      if (!isUserAnAdmin || !isAdminMode) return;
      missingImageQueueIndex = Math.min(missingImageQueueIndex, Math.max(0, getMissingImageProducts().length - 1));
      missingImageQueueSaving = false;
      initializeTempImageEditor(null);
      activePopupModal = 'MISSING_IMAGE_QUEUE';
      selectedProductModal = null;
      render();
    }
    function moveMissingImageQueue(direction) {
      if (missingImageQueueSaving) return;
      const queue = getMissingImageProducts();
      if (!queue.length) return;
      missingImageQueueIndex = Math.max(0, Math.min(queue.length - 1, missingImageQueueIndex + Number(direction || 0)));
      initializeTempImageEditor(null);
      renderModalContainer();
    }
    function regionLabel(v) { return v === 'TASHKENT' ? tr('Toshkent shahri','Город Ташкент') : (v === 'PROVINCE' ? tr('Viloyatlar','Области') : (v || '')); }
    function orderRegionFilterKey(order) {
      const snapshotKey = canonicalRegionCode(order?.delivery?.regionKey) || canonicalRegionCode(order?.delivery?.regionLabel);
      if (snapshotKey) return snapshotKey;
      if (order?.region === 'TASHKENT') return 'tashkent_city';
      return null;
    }
    function payMethodLabel(v) { return v === 'CASH' ? tr('Naqd pul','Наличные') : (v === 'CARD' ? tr('Karta','Карта') : (v || '')); }

    const STATUS_LABELS_BY_LANG = {
      uz: { NEW: "Yangi", PROCESSING: "Jarayonda", DELIVERED: "Yetkazib berilgan", CANCELLED: "Bekor qilingan", REJECTED: "❌ Rad etildi" },
      ru: { NEW: "Новый", PROCESSING: "В обработке", DELIVERED: "Доставлен", CANCELLED: "Отменён", REJECTED: "❌ Отклонён" },
    };
    function statusLabel(st) { return (STATUS_LABELS_BY_LANG[uiLang] || STATUS_LABELS_BY_LANG.uz)[st] || st; }

    let currentUser = {
      firstName: registeredUser?.firstName || tg?.initDataUnsafe?.user?.first_name || tr("Mijoz", "Клиент"),
      lastName: registeredUser?.lastName || tg?.initDataUnsafe?.user?.last_name || "",
      phone: registeredUser?.phone || "+998",
      username: tg?.initDataUnsafe?.user?.username || '',
      photoUrl: tg?.initDataUnsafe?.user?.photo_url || '',
      tgId: null
    };

    // ============ SERVER BILAN GAPLASHISH (Edge Function) ============
    // Barcha admin amallari va ${tr("buyurtma", "заказов")}lar endi to'g'ridan-to'g'ri bazaga
    // emas, shu funksiya orqali serverga (shop-api Edge Function) boradi.
    // Server har safar Telegram imzosini (tg.initData) tekshiradi, shuning
    // uchun bu yerdan hech qanday "soxta admin" yoki "soxta narx" o'tmaydi.
    // 6-band: BOT_ID har requestda yuboriladi — bu shop_id EMAS, faqat
    // "qaysi bot" degan taxmin (candidate identity). Server botId'ni
    // shop_bots'da qidiradi, tokenini serverda decrypt qiladi, va AYNAN
    // o'sha token bilan initData'ni tasdiqlaydi — shundan keyingina haqiqiy
    // ctx.shopId hosil bo'ladi. BOT_ID'ni frontendda "ishonch" sifatida
    // umuman ishlatilmaydi.
    async function callApi(action, payload) {
      const perfStarted = performance.now();
      const initData = tg?.initData || '';
      const controller = new AbortController();
      const timeoutMs = action === 'bulk_import_products' ? 45000
        : action === 'get_excel_template_url' ? 9000
        : action === 'edit_product_field' && payload?.field === 'img' && !payload?.imageUpload ? 10000
        : action === 'add_product' || action === 'edit_product_field' ? 30000
        : 15000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/shop-api`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
            'apikey': CONFIG.SUPABASE_KEY
          },
          body: JSON.stringify({ action, payload: payload || {}, initData, botId: BOT_ID }),
          signal: controller.signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const apiError = new Error(data.error || `Server xatosi (${res.status})`);
          apiError.details = data;
          throw apiError;
        }
        return data;
      } catch (e) {
        if (e.name === 'AbortError') {
          if (action === 'get_excel_template_url') throw new Error("Shablon serverda 9 soniyada tayyor bo'lmadi. Internetni tekshirib qayta urinib ko'ring.");
          if (action === 'edit_product_field' && payload?.field === 'img' && !payload?.imageUpload) throw new Error(tr("Rasm URL 10 soniyada saqlanmadi. Internetni tekshirib qayta urinib ko'ring.", "URL изображения не сохранился за 10 секунд. Проверьте интернет."));
          if (action === 'add_product' || action === 'edit_product_field') throw new Error(tr("Rasm/tovar 30 soniyada saqlanmadi. Internetni tekshirib qayta urinib ko'ring.", "Изображение/товар не сохранились за 30 секунд. Проверьте интернет и повторите."));
          throw new Error("Server javob bermadi (vaqt tugadi). Internetni tekshirib qayta urinib ko'ring.");
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
        const ms = Math.round(performance.now() - perfStarted);
        if (ms >= 500) console.info(`[USTORE perf] Edge ${action}: ${ms}ms`);
      }
    }

    // O'zbek telefon raqami formatini oddiy tekshirish
    function isValidPhone(phone) {
      const cleaned = (phone || '').replace(/\s+/g, '');
      return /^\+998\d{9}$/.test(cleaned);
    }

    // TRANSLITERATION & SEARCH
    function normalizeText(text) {
      if (!text) return { latin: '', cyrillic: '' };
      let str = text.toLowerCase().trim();
      const map = { 'sh':'ш','ch':'ч','yo':'ё','yu':'ю','ya':'я','ye':'е','a':'а','b':'б','v':'в','g':'г','d':'д','e':'е','z':'з','i':'и','j':'ж','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п','r':'р','s':'с','t':'т','u':'у','f':'ф','x':'х','h':'ҳ' };
      let cyr = str;
      for (let k in map) cyr = cyr.split(k).join(map[k]);
      return { latin: str, cyrillic: cyr };
    }

    // Mahsulotlarni nomi (lotin/kirill) YOKI ID (SKU) bo'yicha qidirish.
    // ID bo'yicha to'g'ridan-to'g'ri mos kelganlar ro'yxat boshida chiqadi.
    function productVisibleInCurrentMode(p) {
      return p && p.status !== 'DELETED' && ((isAdminMode && isUserAnAdmin) || p.isVisible !== false);
    }

    function searchProducts(query) {
      const activeProducts = products.filter(productVisibleInCurrentMode).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      if (!query || !query.trim()) return activeProducts;

      const { latin, cyrillic } = normalizeText(query);
      const q = query.trim().toLowerCase();
      // 13-band: har bir mahsulot uchun moslik BIR MARTA hisoblanadi (name
      // VA description'da mos kelsa ham bitta yozuv) — keyin shu bitta
      // moslik natijasidan HAM filtrlash, HAM tartiblash uchun foydalaniladi.
      const decorated = [];
      for (const p of activeProducts) {
        const pNorm = normalizeText(p.name);
        const skuMatch = String(p.sku || '').toLowerCase().includes(latin);
        // 3.5: name_uz, description_uz, name_ru, description_ru bo'yicha qidiradi.
        // RU maydonlari (avtomatik tarjima qilingan) o'zining haqiqiy kirill
        // shaklida, transliteratsiyasiz solishtiriladi.
        const nameRuMatch = p.nameRu && p.nameRu.toLowerCase().includes(q);
        const nameMatch = pNorm.latin.includes(latin) || pNorm.cyrillic.includes(cyrillic) || nameRuMatch;
        const descNorm = normalizeText(p.desc || '');
        const descMatch = descNorm.latin.includes(latin) || descNorm.cyrillic.includes(cyrillic);
        const descRuMatch = p.descRu && p.descRu.toLowerCase().includes(q);
        // Har bir o'lchamning O'ZINING ID'sini ham qidiradi.
        const variantSkuMatch = productVariants(p).some(v => v.sku && String(v.sku).toLowerCase().includes(latin));
        const variantTextMatch = productVariants(p).some(v => [v.size,v.color].filter(Boolean).some(x => String(x).toLowerCase().includes(q)));
        // Online Do'kon yaxshilashlari, 7-band: kategoriya nomi bo'yicha ham
        // topiladi — masalan "krossovka" deb qidirilganda o'sha katalogdagi
        // barcha tovarlar chiqishi uchun. Reyting nomdan pastroq (izoh bilan bir xil).
        const cat = p.categoryId ? categories.find(c => c.id === p.categoryId) : null;
        const catNorm = cat ? normalizeText(categoryName(cat) || '') : null;
        const categoryMatch = !!(catNorm && (catNorm.latin.includes(latin) || catNorm.cyrillic.includes(cyrillic)));
        if (nameMatch || skuMatch || descMatch || descRuMatch || variantSkuMatch || variantTextMatch || categoryMatch) {
          decorated.push({ p, nameMatch, skuStarts: String(p.sku || '').toLowerCase().startsWith(latin) });
        }
      }

      decorated.sort((a, b) => {
        const aSkuStarts = a.skuStarts ? 0 : 1;
        const bSkuStarts = b.skuStarts ? 0 : 1;
        if (aSkuStarts !== bSkuStarts) return aSkuStarts - bSkuStarts;
        // Avval NOMIDA mos kelganlar, keyin faqat izohida (yoki variant/SKU
        // ichida) mos kelganlar — ikkalasi ham teng bo'lsa mavjud tartib saqlanadi.
        const aNameRank = a.nameMatch ? 0 : 1;
        const bNameRank = b.nameMatch ? 0 : 1;
        return aNameRank - bNameRank;
      });

      return decorated.map(d => d.p);
    }

    // NAVIGATION — og'ir admin ma'lumotlari faqat kerak bo'lgan tab ochilganda yuklanadi.
    async function loadOrdersLazy(force = false) {
      if (ordersLoading || (ordersLoaded && !force)) return;
      ordersLoading = true;
      if (currentTab === 'orders') render();
      try {
        const data = isUserAnAdmin && isAdminMode ? await callApi('get_all_orders', {}) : await callApi('get_my_orders', {});
        orders = (data.orders || []).map(formatOrderForUi);
        ordersLoaded = true;
        ordersSnapshot = JSON.stringify(orders.map(o => [o.id, o.status]));
      } catch (e) {
        console.error('Buyurtmalarni yuklashda xatolik:', e);
      } finally {
        ordersLoading = false;
        if (currentTab === 'orders') render();
      }
    }

    async function loadUsersLazy(force = false) {
      if (!isUserAnAdmin || usersLoading || (usersLoaded && !force)) return;
      usersLoading = true;
      if ((activePage === 'SUPPORT' || activePage === 'DASHBOARD') && !isCatalogEditorModalOpen()) render();
      try {
        const data = await callApi('get_users_summary', {});
        usersSummary = data.users || [];
        usersLoaded = true;
      } catch (e) {
        console.error('Mijozlarni yuklashda xatolik:', e);
      } finally {
        usersLoading = false;
        if ((activePage === 'SUPPORT' || activePage === 'DASHBOARD') && !isCatalogEditorModalOpen()) render();
      }
    }

    async function loadAdminsLazy(force = false) {
      if (!isSuperAdmin || adminsLoading || (adminsLoaded && !force)) return;
      adminsLoading = true;
      try {
        const data = await callApi('get_admins_list', {});
        adminsList = data.admins || [];
        adminsLoaded = true;
      } catch (e) {
        console.error('Adminlarni yuklashda xatolik:', e);
      } finally {
        adminsLoading = false;
        if ((currentTab === 'profile' || activePage === 'PLATFORM_ADMINS') && !isCatalogEditorModalOpen()) render();
      }
    }

    // 2-10-band (2026-08-17): qo'llab-quvvatlash — mijoz o'z murojaatlarini,
    // admin barcha murojaatlarni lazy yuklaydi (boshqa lazy ro'yxatlar bilan
    // bir xil pattern). Har ticket endi lastMessage/messageCount bilan keladi
    // (backend attachTicketSummaries) — to'liq thread alohida lazy yuklanadi.
    async function loadMySupportTicketsLazy(force = false) {
      if (supportTicketsLoading || (supportTicketsLoaded && !force)) return;
      supportTicketsLoading = true;
      try {
        const data = await callApi('get_my_support_tickets', {});
        supportTickets = data.tickets || [];
        supportTicketsLoaded = true;
      } catch (e) {
        console.error("Murojaatlarni yuklashda xatolik:", e);
      } finally {
        supportTicketsLoading = false;
        // POLISH ROUND: bottom-nav Support tugmasidagi o'qilmagan-nuqta ham
        // shu yuklanishga bog'liq — activePage/tab'dan qat'iy nazar qayta chizamiz.
        // 14-band: BEKOR — bu ham fon poll orqali (8334-qator) chaqirilishi
        // mumkin, shuning uchun ADD_PROD/EDIT_PROD_FIELD/ADD_CAT/EDIT_CAT
        // ochiq bo'lsa baribir o'tkazib yuboriladi (draft yo'qolish bugi,
        // 8300-qatordagi isCatalogEditorModalOpen() bilan bir xil naqsh).
        if (!isCatalogEditorModalOpen()) render();
      }
    }
    async function loadAdminSupportTicketsLazy(force = false) {
      if (!isUserAnAdmin || adminSupportTicketsLoading || (adminSupportTicketsLoaded && !force)) return;
      adminSupportTicketsLoading = true;
      try {
        const data = await callApi('get_support_tickets', {});
        adminSupportTickets = data.tickets || [];
        adminSupportTicketsLoaded = true;
      } catch (e) {
        console.error("Murojaatlarni yuklashda xatolik:", e);
      } finally {
        adminSupportTicketsLoading = false;
        if (!isCatalogEditorModalOpen()) render();
      }
    }
    async function loadSupportMessages(ticketId, force = false) {
      if (!force && openSupportTicketId === ticketId && supportMessages.length) return;
      supportMessagesLoading = true;
      if (!isCatalogEditorModalOpen()) render();
      try {
        const data = await callApi('get_support_messages', { ticketId });
        supportMessages = data.messages || [];
      } catch (e) {
        console.error("Xabarlarni yuklashda xatolik:", e);
        supportMessages = [];
      } finally {
        supportMessagesLoading = false;
        if (!isCatalogEditorModalOpen()) render();
      }
    }
    // 5-band: usersSummary allaqachon boshqa joyda (Mijozlar tab) yuklangan
    // bo'lsa, shundan foydalanib aniq ism ko'rsatamiz — yangi so'rov qo'shmaymiz.
    function supportUserLabel(tgId) {
      const u = usersSummary.find(x => String(x.tgId) === String(tgId));
      return u?.userName ? `${u.userName} (${tgId})` : String(tgId);
    }
    function supportNeedsAttention(t) {
      return t.status === 'ANSWERED' && t.lastMessage?.sender === 'USER';
    }

    // 1/2-band: bottom-nav "Qo'llab-quvvatlash" tugmasi — rolga qarab
    // admin/mijoz oqimini ochadi (index.html'dagi yagona nav-support-btn).
    function openAdminSupportOrUserSupport() {
      if (isAdminMode && isUserAnAdmin) openAdminSupportModal();
      else openSupportModal(null);
    }

    // ---- Mijoz tomon ----
    // 15-band: ticketType — 'SUPPORT' (umumiy) yoki 'RETURN' (qaytarish/
    // muammo, alohida oqim, seller sozlamada butunlay o'chirishi mumkin).
    function openSupportModal(orderId, ticketType) {
      supportTicketOrderId = orderId || null;
      supportTicketType = ticketType === 'RETURN' ? 'RETURN' : 'SUPPORT';
      openSupportTicketId = null;
      supportMessages = [];
      supportReplyTarget = null;
      openPage('SUPPORT', 'nav-profile');
      loadMySupportTicketsLazy().then(resolveActiveSupportTicket);
    }
    // Shu order (yoki umumiy) + shu turdagi yopilmagan ticket bo'lsa,
    // to'g'ridan-to'g'ri o'sha chatni ochadi — bo'lmasa yangi xabar
    // yozish ko'rinishi qoladi.
    function resolveActiveSupportTicket() {
      const active = supportTickets.find(t => t.status !== 'CLOSED' && (t.orderId || null) === supportTicketOrderId && (t.ticketType || 'SUPPORT') === supportTicketType);
      if (active) { openSupportTicketId = active.id; loadSupportMessages(active.id); }
      else render();
    }
    function openMySupportChat(ticketId) {
      openSupportTicketId = ticketId;
      supportReplyTarget = null;
      render();
      loadSupportMessages(ticketId);
    }
    function backToMySupportList() {
      openSupportTicketId = null;
      supportReplyTarget = null;
      render();
    }
    async function submitSupportComposer() {
      if (supportSendingMessage) return;
      const textareaId = openSupportTicketId ? 'sup-chat-message' : 'sup-message';
      const body = document.getElementById(textareaId)?.value.trim() || '';
      if (!body) return alert(tr("Murojaat matnini yozing.", "Напишите текст обращения."));
      supportSendingMessage = true;
      render();
      showActionToast(tr("⏳ Yuborilmoqda...", "⏳ Отправка..."), 'saving');
      try {
        if (openSupportTicketId) {
          const data = await callApi('send_support_message', { ticketId: openSupportTicketId, body, replyToMessageId: supportReplyTarget?.id || null });
          supportMessages = [...supportMessages, data.message];
          const idx = supportTickets.findIndex(t => t.id === openSupportTicketId);
          if (idx >= 0) supportTickets[idx] = { ...supportTickets[idx], ...data.ticket, lastMessage: { sender: data.message.sender, body: data.message.body, createdAt: data.message.createdAt } };
        } else {
          const data = await callApi('create_support_ticket', { message: body, orderId: supportTicketOrderId, ticketType: supportTicketType });
          supportTickets = [{ ...data.ticket, lastMessage: { sender: data.message.sender, body: data.message.body, createdAt: data.message.createdAt }, messageCount: 1 }, ...supportTickets];
          openSupportTicketId = data.ticket.id;
          supportMessages = [data.message];
        }
        supportReplyTarget = null;
        showActionToast(tr("✅ Yuborildi", "✅ Отправлено"), 'success', 1500);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Yuborilmadi", "❌ Не отправлено"), 'error', 2000);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      } finally {
        supportSendingMessage = false;
        render();
      }
    }
    // 7-band: FAQAT mijoz o'zi murojaatni tugatadi.
    async function closeSupportTicket(ticketId) {
      if (!confirm(tr("Murojaatni tugatasizmi? Keyin shu ticketga yozib bo'lmaydi.", "Завершить обращение? После этого писать в этот тикет будет нельзя."))) return;
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохранение..."), 'saving');
      try {
        const data = await callApi('close_support_ticket', { ticketId });
        const idx = supportTickets.findIndex(t => t.id === ticketId);
        if (idx >= 0) supportTickets[idx] = { ...supportTickets[idx], ...data.ticket };
        render();
        showActionToast(tr("✅ Tugallandi", "✅ Завершено"), 'success', 1500);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 2000);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      }
    }

    // ---- Admin tomon: Support -> User -> Chatlar -> Chat ----
    function openAdminSupportModal() {
      adminSupportSelectedUser = null;
      adminSupportSelectedTicketId = null;
      supportReplyTarget = null;
      openPage('SUPPORT', 'nav-profile');
      loadAdminSupportTicketsLazy();
      loadUsersLazy();
    }
    function groupAdminSupportTicketsByUser() {
      const byUser = new Map();
      for (const t of adminSupportTickets) {
        if (!byUser.has(t.tgId)) byUser.set(t.tgId, []);
        byUser.get(t.tgId).push(t);
      }
      return Array.from(byUser.entries()).map(([tgId, tickets]) => ({
        tgId, tickets,
        needsAttention: tickets.some(supportNeedsAttention),
        hasOpen: tickets.some(t => t.status === 'OPEN'),
        lastActivityAt: Math.max(...tickets.map(t => new Date(t.lastMessage?.createdAt || t.createdAt).getTime())),
      })).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    }
    function selectAdminSupportUser(tgId) {
      adminSupportSelectedUser = tgId;
      adminSupportSelectedTicketId = null;
      render();
    }
    function backToAdminSupportUsers() {
      adminSupportSelectedUser = null;
      adminSupportSelectedTicketId = null;
      render();
    }
    function backToAdminSupportUserTickets() {
      adminSupportSelectedTicketId = null;
      supportReplyTarget = null;
      render();
    }
    function openAdminSupportChat(ticketId) {
      adminSupportSelectedTicketId = ticketId;
      supportReplyTarget = null;
      render();
      loadSupportMessages(ticketId);
    }
    async function submitAdminSupportReply() {
      if (supportSendingMessage) return;
      const ticketId = adminSupportSelectedTicketId;
      const body = document.getElementById('sup-admin-message')?.value.trim() || '';
      if (!body) return alert(tr("Javob matnini yozing.", "Напишите текст ответа."));
      supportSendingMessage = true;
      render();
      showActionToast(tr("⏳ Yuborilmoqda...", "⏳ Отправка..."), 'saving');
      try {
        const data = await callApi('send_support_message', { ticketId, body, replyToMessageId: supportReplyTarget?.id || null });
        supportMessages = [...supportMessages, data.message];
        const idx = adminSupportTickets.findIndex(t => t.id === ticketId);
        if (idx >= 0) adminSupportTickets[idx] = { ...adminSupportTickets[idx], ...data.ticket, lastMessage: { sender: data.message.sender, body: data.message.body, createdAt: data.message.createdAt } };
        supportReplyTarget = null;
        showActionToast(tr("✅ Javob yuborildi", "✅ Ответ отправлен"), 'success', 1500);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Yuborilmadi", "❌ Не отправлено"), 'error', 2000);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      } finally {
        supportSendingMessage = false;
        render();
      }
    }
    function setSupportReplyTarget(id) {
      const m = supportMessages.find(x => x.id === id);
      if (!m) return;
      supportReplyTarget = { id: m.id, body: m.body, sender: m.sender };
      render();
    }
    function clearSupportReplyTarget() {
      supportReplyTarget = null;
      render();
    }
    // 6-band: xabarlar tarixini render qilish — mijoz va admin chat
    // ko'rinishlari shu bitta funksiyani ishlatadi (ikkinchi tizim yo'q).
    // viewerIsAdmin — hozirgi ko'ruvchi kim ekaniga qarab o'z xabarlari
    // o'ngga (mine/blue), boshqa tomonniki chapga (theirs/gray) chiqadi.
    function renderSupportThreadHtml(messages, viewerIsAdmin) {
      const byId = new Map(messages.map(m => [m.id, m]));
      return messages.map(m => {
        const mine = viewerIsAdmin ? m.sender === 'ADMIN' : m.sender === 'USER';
        const parent = m.replyToMessageId ? byId.get(m.replyToMessageId) : null;
        return `
          <div class="ustore-msg-row ${mine ? 'mine' : ''}">
            <div class="ustore-msg-bubble ${mine ? 'mine' : 'theirs'}">
              ${parent ? `<div class="ustore-msg-reply-quote">${escapeHtml(parent.body.slice(0, 80))}</div>` : ''}
              <div>${escapeHtml(m.body)}</div>
              <div class="ustore-msg-time">${new Date(m.createdAt).toLocaleString()}</div>
              <span class="ustore-msg-reply-btn" onclick="setSupportReplyTarget(${m.id})">↩ ${tr('Javob','Ответ')}</span>
            </div>
          </div>`;
      }).join('');
    }
    function renderSupportReplyBarHtml() {
      if (!supportReplyTarget) return '';
      return `
        <div class="ustore-reply-bar">
          <span>↩ ${tr('Javob','Ответ')}: ${escapeHtml(String(supportReplyTarget.body || '').slice(0, 60))}</span>
          <button onclick="clearSupportReplyTarget()" class="font-bold">✕</button>
        </div>`;
    }

    function switchTab(tab) {
      currentTab = tab;
      activePage = null; // istalgan bottom-nav tugmasi bosilsa ochiq page (Support va h.k.) yopiladi
      // 32-36-band: Support/Profile navigatsiya bugi — istalgan ochiq MODAL ham
      // (activePopupModal) bottom-nav bosilganda albatta yopiladi. Eski tizimda
      // Support modal edi va switchTab uni tozalamas edi, shuning uchun Profilga
      // o'tilganda pastda Profil render bo'lsa-da, eski modal tepada ko'rinib
      // qolardi. Support endi activePage (yuqorida tozalanadi), lekin bu bug
      // klassi BOSHQA istalgan modal uchun ham amal qilishi mumkin edi — shu
      // yerda umumiy mudofaa sifatida yopiladi.
      activePopupModal = null;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('text-blue-600', 'font-bold'));
      const activeNav = document.getElementById(`nav-${tab}`);
      if (activeNav) activeNav.classList.add('text-blue-600', 'font-bold');
      render(); // tugma bosilishi darhol sezilsin
      if (tab === 'orders') loadOrdersLazy();
      if (tab === 'warehouse') loadWarehouseSummary();
      if (tab === 'profile' && isSuperAdmin) loadAdminsLazy();
      if (tab === 'profile' && isUserAnAdmin) loadAdminSupportTicketsLazy();
      if (tab === 'profile' && !(isAdminMode && isUserAnAdmin)) loadMySupportTicketsLazy();
    }

    function toggleAdminRole() {
      if (!isUserAnAdmin) {
        alert(tr("Sizda Admin huquqi yo'q!", "У вас нет прав администратора!"));
        isAdminMode = false;
        return;
      }
      isAdminMode = !isAdminMode;
      render();
    }

    // CART LOGIC — universal variant (size/color) qo'llab-quvvatlanadi.
    function cartKey(productId, size, color) {
      return (size || color) ? `${productId}::${size || ''}::${color || ''}` : productId;
    }
    function cartEntryProductId(key, entry) { return (entry && entry.productId) || String(key).split('::')[0]; }
    function cartQtyForVariant(productId, size, color, excludeKey) {
      return Object.entries(cart)
        .filter(([k,c]) => k !== excludeKey && cartEntryProductId(k,c) === productId && (c.size || null) === (size || null) && (c.color || null) === (color || null))
        .reduce((sum,[,c]) => sum + (Number(c.qty) || 0), 0);
    }
    function totalCartQtyForProduct(productId, excludeKey) {
      return Object.entries(cart).filter(([k,c]) => k !== excludeKey && cartEntryProductId(k,c) === productId).reduce((sum,[,c]) => sum + (Number(c.qty) || 0), 0);
    }

    function addToCart(id, e) {
      if (e) e.stopPropagation();
      const p = products.find(prod => prod.id === id);
      if (!p || p.stock <= 0) return alert(tr("Mahsulot tugagan!", "Товар закончился!"));
      if (productVariants(p).length) {
        openProductDetailModal(id);
        return;
      }
      const key = cartKey(id, null, null);
      const current = Number(cart[key]?.qty) || 0;
      if (current + 1 > p.stock) return alert(`${tr("⚠️ Omborda faqat", "⚠️ На складе только")} ${p.stock} ${tr("ta mavjud!", "шт.! ")}`);
      if (!cart[key]) cart[key] = { productId:id, size:null, color:null, qty:1, addedAt:new Date().toLocaleString() };
      else cart[key].qty += 1;
      localStorage.setItem(scopedKey('cart'), JSON.stringify(cart));
      updateCartBadge(); render();
    }

    function saveBundleCart() { localStorage.setItem(scopedKey('bundleCart'), JSON.stringify(bundleCart)); }
    // Nom/rasm inline onclick orqali emas, joriy ochiq campaignDetail'dan
    // olinadi — aksiya nomi apostrof/tirnoq ichishi mumkin (o'zbekcha matn),
    // ularni to'g'ridan-to'g'ri onclick atributiga JSON.stringify qilib
    // qo'yish HTML/JS escaping xatosiga olib kelardi.
    function addBundleToCart(bundleId) {
      if (!campaignDetail || campaignDetail.kind !== 'BUNDLE' || campaignDetail.id !== bundleId) return;
      const current = bundleCart[bundleId];
      if (current) { if (current.qty >= 10) return; current.qty += 1; }
      else bundleCart[bundleId] = { qty: 1, name: campaignDetail.name, bundlePrice: Number(campaignDetail.bundlePrice) || 0, coverImageUrl: campaignDetail.coverImageUrl || null };
      saveBundleCart();
      updateCartBadge();
      showActionToast(tr('✅ Savatga qo\'shildi', '✅ Добавлено в корзину'), 'success', 1500);
      render();
    }
    function changeBundleCartQty(bundleId, delta) {
      const item = bundleCart[bundleId];
      if (!item) return;
      item.qty = Math.max(0, Math.min(10, item.qty + delta));
      if (item.qty === 0) delete bundleCart[bundleId];
      saveBundleCart();
      updateCartBadge();
      render();
    }
    function removeBundleCartItem(bundleId) {
      delete bundleCart[bundleId];
      saveBundleCart();
      updateCartBadge();
      render();
    }

    // ---- Qayta buyurtma (POLISH ROUND 2-bosqich, 20-band) ----
    // Eski order snapshotidagi narx KO'R-KO'RONA ishlatilmaydi — joriy
    // mahsulot/variant SKU orqali topiladi, joriy narx/qoldiq tekshiriladi.
    function resolveOrderItemToLiveProduct(item) {
      for (const p of products) {
        if (p.status === 'DELETED') continue;
        if (p.sku === item.sku) return { product: p, variant: null };
        const v = productVariants(p).find(x => x.sku === item.sku);
        if (v) return { product: p, variant: v };
      }
      return null;
    }
    async function saveOrderInternalNote(orderId) {
      const note = document.getElementById(`order-internal-note-${orderId}`)?.value || '';
      try {
        const result = await callApi('set_order_internal_note', { orderId, note });
        const idx = orders.findIndex(x => x.id === orderId);
        if (idx >= 0) orders[idx] = formatOrderForUi(result.order);
        if (selectedOrderModal?.id === orderId) selectedOrderModal = formatOrderForUi(result.order);
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1200);
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      }
    }

    async function confirmOrderReceived(orderId) {
      if (!confirm(tr("Buyurtmani qabul qilib olganingizni tasdiqlaysizmi?", "Подтвердить, что вы получили заказ?"))) return;
      try {
        const result = await callApi('confirm_order_received', { orderId });
        const idx = orders.findIndex(x => x.id === orderId);
        if (idx >= 0) orders[idx] = formatOrderForUi(result.order);
        if (selectedOrderModal?.id === orderId) selectedOrderModal = formatOrderForUi(result.order);
        showActionToast(tr('✅ Rahmat!', '✅ Спасибо!'), 'success', 1500);
        render();
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      }
    }

    function reorderFromOrder(orderId) {
      const o = (selectedOrderModal && selectedOrderModal.id === orderId) ? selectedOrderModal : orders.find(x => x.id === orderId);
      if (!o || !o.items?.length) return;
      if (!confirm(tr('Bu buyurtmadagi mahsulotlar joriy narx va mavjudlik bo‘yicha savatchaga qo‘shiladi. Davom etasizmi?', 'Товары из этого заказа будут добавлены в корзину по текущей цене и наличию. Продолжить?'))) return;

      const totalCount = o.items.length;
      let addedCount = 0;
      for (const item of o.items) {
        const resolved = resolveOrderItemToLiveProduct(item);
        if (!resolved || !resolved.product) continue; // o'chirilgan/topilmagan mahsulot — o'tkazib yuboriladi
        const { product: p, variant: v } = resolved;
        const size = v ? (v.size || null) : null;
        const color = v ? (v.color || null) : null;
        const available = v ? (Number(v.qty) || 0) : (Number(p.stock) || 0);
        if (available <= 0) continue; // mavjud emas — o'tkazib yuboriladi
        const key = cartKey(p.id, size, color);
        const otherQty = cartQtyForVariant(p.id, size, color, null);
        const addQty = Math.max(0, Math.min(Math.max(1, Number(item.qty) || 1), available - otherQty));
        if (addQty <= 0) continue;
        if (!cart[key]) cart[key] = { productId: p.id, size, color, qty: addQty, addedAt: new Date().toLocaleString() };
        else cart[key].qty += addQty;
        addedCount++;
      }
      localStorage.setItem(scopedKey('cart'), JSON.stringify(cart));
      updateCartBadge();
      selectedOrderModal = null;
      render();
      // Diqqat: UZ va RU so'z tartibi teskari ("4 mahsulotdan 3 tasi" vs "3 из 4
      // товаров") — shuning uchun butun jumla ikki tilda alohida yozilgan,
      // fragmentlarni tr() bilan qo'shib bo'lmaydi.
      const summary = tr(`${totalCount} mahsulotdan ${addedCount} tasi savatchaga qo‘shildi.`, `${addedCount} из ${totalCount} товаров добавлено в корзину.`);
      showActionToast((addedCount ? '✅ ' : '⚠️ ') + summary, addedCount ? 'success' : 'error', 2500);
    }

    function changeCartQty(key, delta, e) {
      if (e) e.stopPropagation();
      if (!cart[key]) return;
      const entry = cart[key];
      const productId = cartEntryProductId(key, entry);
      const p = products.find(prod => prod.id === productId);
      const newQty = (Number(entry.qty) || 0) + delta;
      if (newQty <= 0) delete cart[key];
      else if (p) {
        const available = productVariants(p).length ? variantQty(p, entry.size || null, entry.color || null) : p.stock;
        const otherQty = cartQtyForVariant(productId, entry.size || null, entry.color || null, key);
        if (otherQty + newQty > available) {
          const label = [entry.size,entry.color].filter(Boolean).join(' / ');
          return alert(`⚠️ ${label ? '"'+label+'" ' : ''}${tr('variantidan faqat','вариант: доступно только')} ${available} ${tr('ta mavjud!','шт.!')}`);
        }
        entry.qty = newQty;
      } else entry.qty = newQty;
      localStorage.setItem(scopedKey('cart'), JSON.stringify(cart)); updateCartBadge(); render();
    }

    function addVariantItemsToCart(productId, selectionMap) {
      const p = products.find(prod => prod.id === productId);
      if (!p) return;
      const vars = productVariants(p);
      const entries = Object.entries(selectionMap || {}).filter(([,q]) => Number(q) > 0);
      if (!entries.length) return alert(tr("Kamida bitta variant va sonini tanlang!", "Выберите хотя бы один вариант и количество!"));
      for (const [k,qtyRaw] of entries) {
        const v = vars.find(x => variantKey(x.size,x.color) === k);
        if (!v) return alert(tr("Variant topilmadi. Sahifani yangilang.", "Вариант не найден. Обновите страницу."));
        const qty = Number(qtyRaw) || 0;
        const cKey = cartKey(productId, v.size || null, v.color || null);
        const already = Number(cart[cKey]?.qty) || 0;
        if (already + qty > Number(v.qty || 0)) return alert(`⚠️ "${variantLabel(v)}": ${tr('faqat','доступно только')} ${v.qty} ${tr('ta mavjud!','шт.!')}`);
      }
      for (const [k,qtyRaw] of entries) {
        const v = vars.find(x => variantKey(x.size,x.color) === k);
        const qty = Number(qtyRaw) || 0;
        const cKey = cartKey(productId, v.size || null, v.color || null);
        if (cart[cKey]) cart[cKey].qty += qty;
        else cart[cKey] = { productId, size:v.size || null, color:v.color || null, qty, addedAt:new Date().toLocaleString() };
      }
      localStorage.setItem(scopedKey('cart'), JSON.stringify(cart)); updateCartBadge();
    }

    // Legacy helper — eski size-only UI/call'lar buzilmasligi uchun.
    function addSizedItemsToCart(productId, sizeQtyMap) {
      const selection = {};
      for (const [size,qty] of Object.entries(sizeQtyMap || {})) selection[variantKey(size,null)] = qty;
      addVariantItemsToCart(productId, selection);
    }

    function updateCartBadge() {
      const count = Object.values(cart).reduce((a, b) => a + (b.qty || 0), 0) + Object.values(bundleCart).reduce((a, b) => a + (b.qty || 0), 0);
      const badge = document.getElementById('cart-badge');
      if (count > 0) {
        badge.innerText = count;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
      } else {
        badge.classList.add('hidden');
      }
      scheduleCartSnapshotSave();
    }

    // Admin uchun "savatni tashlab ketganlar" monitoringi — har bir savat
    // o'zgarishida serverga darhol emas, 1.5s debounce bilan yuboriladi
    // (tez-tez +/- bosilganda so'rov bombardimoni bo'lmasin uchun).
    // Muvaffaqiyatsizlik jim o'tkaziladi — bu faqat monitoring, checkout
    // oqimini hech qachon bloklamaydi.
    let cartSnapshotTimer = null;
    function scheduleCartSnapshotSave() {
      clearTimeout(cartSnapshotTimer);
      cartSnapshotTimer = setTimeout(() => {
        const items = Object.entries(cart).map(([key, itemData]) => ({ productId: cartEntryProductId(key, itemData), qty: itemData.qty, size: itemData.size || null, color: itemData.color || null }));
        callApi('save_cart_snapshot', { items }).catch(() => {});
      }, 1500);
    }

    // ============ IMAGE UPLOAD (Supabase Storage, signed URL orqali) ============
    // Telegram Desktop/WebView ayrim file-picker File handle'larini callback tugagach
    // ishonchsiz holatga o'tkazadi. Baytlarni tanlash paytida darhol detached Blob'ga
    // ko'chiramiz; preview va keyingi Save shu mustaqil nusxadan foydalanadi.
    function readBlobAsArrayBuffer(blob) {
      return imageIO.readBlobAsArrayBuffer(blob);
    }

    function makeDetachedImageFile(bytes, source) {
      return imageIO.makeDetachedImageFile(bytes, source);
    }

    async function decodeImageSource(blob) {
      const DECODE_TIMEOUT_MS = 8000;
      if (typeof createImageBitmap === 'function') {
        try {
          const bitmap = await Promise.race([
            createImageBitmap(blob),
            new Promise((_, reject) => setTimeout(() => reject(new Error('create_image_bitmap_timeout')), DECODE_TIMEOUT_MS)),
          ]);
          return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
        } catch (e) {
          imageIO.logStage('CREATE_IMAGE_BITMAP_FAILED', { mime: blob?.type, size: blob?.size, name: e?.name, message: e?.message, level: 'warn' });
        }
      }
      return new Promise((resolve, reject) => {
        let settled = false;
        const url = URL.createObjectURL(blob);
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(url);
          imageIO.logStage('DECODE_FAILED', { mime: blob?.type, size: blob?.size, name: 'TimeoutError', message: 'image_decode_timeout', level: 'warn' });
          reject(new Error('image_decode_timeout'));
        }, DECODE_TIMEOUT_MS);
        const img = new Image();
        img.onload = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, close: () => URL.revokeObjectURL(url) });
        };
        img.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          imageIO.logStage('DECODE_FAILED', { mime: blob?.type, size: blob?.size, level: 'warn' });
          reject(new Error('image_decode_failed'));
        };
        img.src = url;
      });
    }

    function canvasToBlob(canvas, mimeType, quality) {
      return new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
    }

    // Rasmni serverga yuborishdan oldin kichraytirish: uzun tomoni maxDim px.
    // PNG/WebP MIME turi saqlanadi; JPEG JPEG bo'lib qoladi.
    //
    // 1.11 pipeline talabi: compression urinishi HECH QACHON xato tashlamasin —
    // decode/canvas/toBlob bosqichlarining birortasi kutilmagan tarzda
    // yiqilsa ham (masalan WebView'ning noodatiy Canvas xatosi), funksiya
    // shunchaki original (allaqachon mustaqil nusxalangan) faylni qaytaradi.
    // Xato faqat "compression VA original ikkalasi ham ishlamasa" chiqishi
    // kerak — bu yerda emas, chaqiruvchi tomonda (upload muvaffaqiyatsiz
    // bo'lganda) yuz beradi. Bundan oldin bu funksiya faqat AYRIM bosqichlar
    // uchun try/catch qilingandi (masalan canvas.toBlob xatosi tashqariga
    // chiqib ketardi) — shu tirqish "Rasm faylini lokal o'qishda xato"
    // xabarining haqiqiy sababi edi, garchi baytlar aslida muvaffaqiyatli
    // o'qilgan bo'lsa ham.
    async function compressImage(file, maxDim, quality) {
      try {
        let decoded;
        try { decoded = await decodeImageSource(file); }
        catch (_) { return file; }
        try {
          let width = decoded.width;
          let height = decoded.height;
          if (!width || !height) return file;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
            else { width = Math.round(width * maxDim / height); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return file;
          ctx.drawImage(decoded.source, 0, 0, width, height);
          const outputType = file.type === 'image/png' ? 'image/png' : (file.type === 'image/webp' ? 'image/webp' : 'image/jpeg');
          const blob = await canvasToBlob(canvas, outputType, outputType === 'image/png' ? undefined : quality);
          if (!blob) return file;
          const extension = outputType === 'image/png' ? 'png' : (outputType === 'image/webp' ? 'webp' : 'jpg');
          const name = String(file.name || 'product-image').replace(/\.[^.]+$/, '') + '.' + extension;
          return makeDetachedImageFile(await readBlobAsArrayBuffer(blob), { name, type: outputType });
        } finally {
          decoded.close?.();
        }
      } catch (_) {
        imageIO.logStage('COMPRESS_FAILED', { mime: file?.type, size: file?.size, message: _?.message, level: 'warn' });
        return file;
      }
    }

    async function compressImageToLimit(file, maxBytes, maxDim = 1000, quality = 0.8) {
      if (!file) return file;
      const dims = Array.from(new Set([maxDim, Math.min(maxDim, 1200), Math.min(maxDim, 900), Math.min(maxDim, 720), Math.min(maxDim, 600)]))
        .filter((n) => Number(n) > 0)
        .sort((a, b) => b - a);
      const qualities = [quality, Math.min(quality, 0.75), 0.65, 0.55, 0.48];
      let best = file;
      for (let i = 0; i < dims.length; i++) {
        const candidate = await compressImage(file, dims[i], qualities[Math.min(i, qualities.length - 1)]);
        if (candidate && (!best || candidate.size < best.size)) best = candidate;
        if (candidate && candidate.size <= maxBytes) return candidate;
      }
      return best;
    }

    // ============ IMAGE PIPELINE V2 ============
    // Markazlashtirilgan rasm tayyorlash — mahsulot/kategoriya/logotip
    // (onImagePicked), chek (onCheckoutReceiptPicked) va chekni qayta
    // yuborish (onResubmitReceiptPicked) barchasi shundan foydalanadi.
    //
    // ESKI (V1) muammo: fayl tanlangan ZAHOTI original File'ni
    // readBlobAsArrayBuffer (FileReader.readAsArrayBuffer, keyin
    // blob.arrayBuffer() fallback) orqali TO'LIQ o'qib, keyin detached
    // nusxaga o'girardi — bu Telegram WebView'da (ayniqsa Android
    // content:// orqali tanlangan rasmlarda) ba'zida abadiy osilib qolardi
    // ("10 ta rasmdan 2 tasi o'qiladi" — production'da kuzatilgan bug).
    //
    // YANGI (V2): FileReader/ArrayBuffer orqali oldindan o'qish UMUMAN olib
    // tashlangan. compressImageToLimit -> compressImage -> decodeImageSource
    // ICHKARIDA createImageBitmap(file)'ni TO'G'RIDAN-TO'G'RI original
    // File'dan chaqiradi (FileReader kerak emas) — bu yo'l WebView'dagi
    // hang muammosiga umuman duch kelmaydi. Muvaffaqiyatli bo'lsa natija
    // ALLAQACHON canvas'dan yaratilgan yangi (detached) fayl — qo'shimcha
    // tashqi detach qadamiga hojat yo'q.
    //
    // FALLBACK (o'chirilmagan, faqat ikkinchi darajaga tushirilgan): agar
    // ICHKI dekod (createImageBitmap VA <img> fallback) IKKALASI HAM
    // muvaffaqiyatsiz bo'lsa (compressed === file, o'zgarishsiz qaytgan
    // bo'lsa), eski FileReader/ArrayBuffer + makeDetachedImageFile zanjiri
    // qayta urinib ko'radi. Bu ham ishlamasa — funksiya xato TASHLAMAYDI,
    // original faylni o'zgarishsiz qaytaradi (signed-URL yuklash browser
    // darajasida to'g'ridan-to'g'ri fetch bilan ishlaydi, JS'da qayta bayt
    // o'qishni talab qilmaydi — shu sabab original native handle hali
    // yaroqli bo'lsa, yuklash baribir muvaffaqiyatli bo'lishi mumkin).
    //
    // onPrepared(file) — mustaqil nusxa tayyor bo'lgan zahoti (preview'ni
    // barqaror manzilga o'tkazish uchun) chaqiriladi; ixtiyoriy.
    async function captureAndPrepareImageV2(file, maxBytes, maxDim, quality, onPrepared) {
      const compressed = await compressImageToLimit(file, maxBytes, maxDim, quality);
      if (compressed && compressed !== file) {
        imageIO.logStage('IMAGE_V2_DIRECT_OK', { mime: file?.type, size: file?.size });
        if (onPrepared) { try { onPrepared(compressed); } catch (_) {} }
        return compressed;
      }
      imageIO.logStage('IMAGE_V2_FALLBACK_STARTED', { mime: file?.type, size: file?.size, level: 'warn' });
      try {
        const bytes = await readBlobAsArrayBuffer(file);
        const detached = makeDetachedImageFile(bytes, file);
        if (onPrepared) { try { onPrepared(detached); } catch (_) {} }
        const recompressed = await compressImageToLimit(detached, maxBytes, maxDim, quality);
        return recompressed || detached;
      } catch (fallbackErr) {
        imageIO.logStage('IMAGE_V2_FALLBACK_FAILED', { mime: file?.type, size: file?.size, message: fallbackErr?.message, level: 'error' });
        return file;
      }
    }

    function validateExternalImageUrl(value) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      if (raw.length > 2048) throw new Error(tr("Rasm URL juda uzun.", "URL изображения слишком длинный."));
      let parsed;
      try { parsed = new URL(raw); } catch { throw new Error(tr("Rasm URL noto'g'ri. To'liq HTTPS havola kiriting.", "Неверный URL изображения. Введите полный HTTPS-адрес.")); }
      if (parsed.protocol !== 'https:') throw new Error(tr("Rasm URL faqat HTTPS bo'lishi kerak.", "URL изображения должен использовать HTTPS."));
      return parsed.href;
    }

    function setImageUrlError(errorId, message = '') {
      const el = document.getElementById(errorId);
      if (!el) return;
      el.textContent = message;
      el.classList.toggle('hidden', !message);
    }

    function onImageUrlInput(value, previewId, errorId, buttonId) {
      const raw = String(value || '').trim();
      if (tempImagePreviewUrl && String(tempImagePreviewUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(tempImagePreviewUrl); } catch (_) {}
      }
      tempImageFile = null;
      tempImagePreparingPromise = null;
      tempImagePreviewUrl = null;
      tempImageUrl = raw || null;
      const preview = document.getElementById(previewId);
      const pickerButton = buttonId ? document.getElementById(buttonId) : null;
      if (pickerButton) pickerButton.textContent = `🖼 ${tr('Xotiradan yuklash', 'Загрузить с устройства')}`;

      if (!raw) {
        setImageUrlError(errorId, '');
        if (preview) {
          if (tempImageExistingUrl) { preview.src = tempImageExistingUrl; preview.classList.remove('hidden'); }
          else { preview.removeAttribute('src'); preview.classList.add('hidden'); }
        }
        return;
      }

      let validUrl;
      try { validUrl = validateExternalImageUrl(raw); }
      catch (e) {
        setImageUrlError(errorId, e.message || String(e));
        if (preview) preview.classList.add('hidden');
        return;
      }
      tempImageUrl = validUrl;
      setImageUrlError(errorId, xlImageText('Rasm tekshirilmoqda…', 'Изображение проверяется…'));
      if (!preview) return;
      preview.onload = () => setImageUrlError(errorId, '');
      preview.onerror = () => {
        preview.classList.add('hidden');
        setImageUrlError(errorId, tr("Rasmni bu URL orqali ko'rsatib bo'lmadi. Havolani tekshiring.", "Не удалось показать изображение по этому URL. Проверьте ссылку."));
      };
      preview.src = validUrl;
      preview.classList.remove('hidden');
    }

    function xlImageText(uz, ru) { return tr(uz, ru); }

    async function onImagePicked(event, previewId, buttonId, urlInputId, errorId) {
      const file = event.target.files?.[0];
      if (!file) return;
      imageIO.logStage('FILE_SELECTED', { mime: file.type, size: file.size });

      try { validatePickedImageFile(file); }
      catch (e) {
        event.target.value = '';
        alert(pickedImageErrorMessage(e, file));
        return;
      }

      // Preview upload'dan mustaqil: object URL darhol ko'rsatiladi (V2:
      // to'g'ridan-to'g'ri ORIGINAL File'dan — o'qishni talab qilmaydi).
      const selectionVersion = ++tempImageSelectionVersion;
      if (tempImagePreviewUrl && String(tempImagePreviewUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(tempImagePreviewUrl); } catch (_) {}
      }
      tempImageFile = file;
      try { tempImagePreviewUrl = URL.createObjectURL(file); }
      catch (_) { tempImagePreviewUrl = null; }
      tempImageUrl = null;
      const urlInput = urlInputId ? document.getElementById(urlInputId) : null;
      if (urlInput) urlInput.value = '';
      if (errorId) setImageUrlError(errorId, '');
      const prev = document.getElementById(previewId);
      if (prev) {
        if (tempImagePreviewUrl) {
          prev.src = tempImagePreviewUrl;
          prev.classList.remove('hidden');
        }
      }
      const pickerButton = buttonId ? document.getElementById(buttonId) : null;
      if (pickerButton) pickerButton.textContent = `🖼 ${tr('Rasmni almashtirish', 'Заменить фото')}`;

      const preparing = captureAndPrepareImageV2(file, TARGET_PRODUCT_IMAGE_BYTES, 1000, 0.8, (updated) => {
        // 8-bo'lim: preview yangilanishi kosmetik — muvaffaqiyatsiz bo'lsa
        // ham bu READ xatosi sifatida yuqoriga chiqmasin.
        if (selectionVersion !== tempImageSelectionVersion || tempImagePreparingPromise !== preparing) return;
        try {
          tempImageFile = updated;
          const stablePreviewUrl = URL.createObjectURL(updated);
          const oldPreviewUrl = tempImagePreviewUrl;
          tempImagePreviewUrl = stablePreviewUrl;
          if (prev) { prev.src = stablePreviewUrl; prev.classList.remove('hidden'); }
          if (oldPreviewUrl && oldPreviewUrl !== stablePreviewUrl && oldPreviewUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(oldPreviewUrl); } catch (_) {}
          }
        } catch (previewErr) {
          imageIO.logStage('PREVIEW_FAILED', { message: previewErr?.message, level: 'warn' });
        }
      });
      tempImagePreparingPromise = preparing;
      showActionToast(tr("🖼️ Rasm tanlandi", "🖼️ Фото выбрано"), 'success', 1200);
    }

    async function fileToBase64(file) {
      return imageIO.blobToBase64(file);
    }

    // Mahsulot/kategoriya/logotip bitta pipeline'da: local baytlar darhol
    // detached nusxaga olinadi va kichraytiriladi. Telegram WebView'da direct
    // Storage fetch oldingi production testda beqaror bo'lgani uchun PRIMARY
    // transport app-api server upload. U ishlamasa signed Storage URL fallback.
    // Admin local rasm tanlagan bo'lsa requireImage=true ishlaydi:
    // upload xatosi mahsulotni jim rasmsiz saqlab yubormaydi.
    async function productImagePayloadFromSnapshot(snapshot, requireImage = false) {
      if (snapshot?.file || snapshot?.preparing) {
        const uploadedUrl = await uploadImageSnapshot(snapshot, null, requireImage);
        if (!uploadedUrl && requireImage) {
          throw new Error(tr("Rasm yuklanmadi.", "Изображение не загружено."));
        }
        return { imageUpload: null, img: uploadedUrl };
      }
      if (snapshot?.url) return { imageUpload: null, img: validateExternalImageUrl(snapshot.url) };
      if (requireImage) throw new Error(tr("Rasm faylini tanlang yoki HTTPS rasm URL kiriting.", "Выберите файл изображения или укажите HTTPS URL."));
      return { imageUpload: null, img: null };
    }
    function friendlyImageError(error) {
      const raw = String(error?.message || error || '');
      if (/failed to fetch|networkerror|load failed/i.test(raw)) return tr("Internet yoki Telegram WebView tarmoq xatosi. Eski rasm o'zgarmadi; internetni tekshirib qayta urinib ko'ring.", "Ошибка сети или Telegram WebView. Старое изображение не изменено; проверьте интернет и повторите.");
      if (/invalid_image_url/i.test(raw)) return tr("Rasm URL noto'g'ri. To'liq HTTPS havola kiriting.", "Неверный URL изображения. Введите полный HTTPS-адрес.");
      if (/invalid_image_upload|invalid_image_type/i.test(raw)) return tr("Rasm formati noto'g'ri. JPG, PNG yoki WebP fayl tanlang.", "Неверный формат изображения. Выберите JPG, PNG или WebP.");
      if (/image_too_large/i.test(raw)) return tr("Rasm juda katta. Kichikroq rasm tanlang.", "Изображение слишком большое. Выберите файл меньшего размера.");
      if (/image_upload_failed|image_public_url_failed/i.test(raw)) return tr("Rasm server xotirasiga yuklanmadi. Eski rasm saqlanib qoldi; qayta urinib ko'ring.", "Не удалось загрузить изображение в хранилище. Старое изображение сохранено; повторите попытку.");
      return raw || tr("Noma'lum rasm xatosi.", "Неизвестная ошибка изображения.");
    }

    function cancelProductEditor() {
      clearTempImageSelection();
      activePopupModal = null;
      render();
    }

    // Telegram WebView'da bitta urinishdagi tarmoq xatosi ("Failed to
    // fetch"/"Load failed") ko'pincha o'tkinchi — shu sabab yuklash
    // qadamlari uchun umumiy qayta-urinish va timeout yordamchilari.
    function withTimeout(promise, timeoutMs, timeoutMessage) {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
      ]);
    }
    async function retryAsync(fn, attempts, delayMs) {
      let lastErr;
      for (let i = 0; i < attempts; i++) {
        try { return await fn(); }
        catch (e) {
          lastErr = e;
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      throw lastErr;
    }

    async function uploadImageSnapshot(snapshot, existingImg, strict = false) {
      if (!snapshot || (!snapshot.file && !snapshot.preparing)) return existingImg || null;
      const pipelineStartedAt = Date.now();
      let prepared;
      try {
        prepared = snapshot.preparing ? await snapshot.preparing : snapshot.file;
      } catch (e) {
        console.error(`[image:${e?.code || 'DECODE_FAILED'}]`, e);
        if (strict) throw e;
        return existingImg || null;
      }
      if (!prepared) return existingImg || null;
      imageIO.logStage('PREPARED_OK', { mime: prepared.type, size: prepared.size, duration: Date.now() - pipelineStartedAt });

      showActionToast(tr("☁️ Rasm yuklanmoqda...", "☁️ Фото загружается..."), 'saving');
      const mimeType = String(prepared.type || '').toLowerCase();
      if (!SUPPORTED_IMAGE_MIME.has(mimeType)) {
        const err = new Error('invalid_image_type');
        imageIO.logStage('FINAL_SIZE_FAILED', { mime: mimeType, message: 'invalid_image_type', level: 'warn' });
        if (strict) throw err;
        return existingImg || null;
      }
      if (prepared.size > MAX_STORED_IMAGE_BYTES) {
        const err = new Error('image_too_large');
        imageIO.logStage('FINAL_SIZE_FAILED', { size: prepared.size, message: 'image_too_large', level: 'warn' });
        if (strict) throw err;
        return existingImg || null;
      }

      // V2 PRIMARY: signed URL to'g'ridan-to'g'ri Supabase Storage'ga —
      // Edge Function bayt ko'rmaydi (base64/JSON emas). Yuklangach
      // finalize_image_upload orqali Storage'da haqiqatan mavjudligi
      // tasdiqlanadi (finalize_payment_receipt bilan bir xil pattern:
      // "yozildi" deb signed URL javobiga emas, haqiqiy Storage `.list()`
      // natijasiga ishoniladi).
      //
      // MUHIM TUZATISH: captureAndPrepareImageV2 dekod/o'qish butunlay
      // muvaffaqiyatsiz bo'lganda ham (yuqoridagi izohga qarang) ataylab
      // ORIGINAL faylni o'zgarishsiz qaytaradi — chunki signed-URL yuklash
      // browser darajasida to'g'ridan-to'g'ri fetch bilan ishlaydi va bu
      // ba'zida JS o'qishi ishlamagan taqdirda ham muvaffaqiyatli bo'lishi
      // mumkin. Lekin real production'da bu "balki ishlaydi" chegara holati
      // ko'pincha bitta urinishda muvaffaqiyatsiz (WebView tarmoq xatosi,
      // "Failed to fetch"/"Load failed") — shu sabab ikkala transport ham
      // endi qisqa kechikish bilan qayta uriniladi (uploadToSignedUrl esa
      // qo'shimcha ravishda timeout bilan himoyalangan, chunki u xom fetch
      // bo'lib, callApi'dagi kabi o'z AbortController'iga ega emas).
      const extByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const ext = extByMime[mimeType] || 'jpg';
      let signedErr = null;
      const signedUploadStartedAt = Date.now();
      try {
        const finalUrl = await retryAsync(async () => {
          const { path, token } = await callApi('get_upload_url', { ext, size: prepared.size, mimeType });
          const { error: upErr } = await withTimeout(
            sb.storage.from(CONFIG.IMAGES_BUCKET).uploadToSignedUrl(path, token, prepared),
            20000, 'signed_url_upload_timeout'
          );
          if (upErr) throw upErr;
          const finalized = await callApi('finalize_image_upload', { path });
          if (!finalized?.url) throw new Error('image_public_url_failed');
          return finalized.url;
        }, 2, 1200);
        imageIO.logStage('SIGNED_URL_UPLOAD_OK', { duration: Date.now() - signedUploadStartedAt, size: prepared.size });
        return finalUrl;
      } catch (e) {
        signedErr = e;
        console.warn('[image:SIGNED_URL_UPLOAD_FAILED]', e);
        imageIO.logStage('SIGNED_URL_UPLOAD_FAILED', { duration: Date.now() - signedUploadStartedAt, name: e?.name, message: e?.message, level: 'warn' });
      }

      // FALLBACK (o'chirilmagan, ikkinchi darajali): signed URL vaqtincha
      // ishlamasa (masalan Storage CORS/tarmoq muammosi), base64-in-JSON
      // orqali app-api server upload — mustaqil ikkinchi yo'l. Bu ham
      // xuddi shunday qayta uriniladi (callApi'ning o'zida 15s timeout bor).
      const serverUploadStartedAt = Date.now();
      try {
        const imageUpload = { mimeType, base64: await fileToBase64(prepared) };
        const url = await retryAsync(async () => {
          const result = await callApi('upload_product_image', { imageUpload });
          if (!result?.url) throw new Error('image_public_url_failed');
          return result.url;
        }, 2, 1200);
        imageIO.logStage('SERVER_UPLOAD_OK', { duration: Date.now() - serverUploadStartedAt, size: prepared.size });
        return url;
      } catch (fallbackErr) {
        console.error('[image:SERVER_UPLOAD_FALLBACK_FAILED]', { signedErr, fallbackErr });
        imageIO.logStage('SERVER_UPLOAD_FAILED', { duration: Date.now() - serverUploadStartedAt, name: fallbackErr?.name, message: fallbackErr?.message, level: 'error' });
        imageIO.logStage('UPLOAD_ALL_FAILED', { duration: Date.now() - pipelineStartedAt, level: 'error' });
        if (strict) throw signedErr || fallbackErr || new Error('image_upload_failed');
        return existingImg || null;
      }
    }

    // Eski chaqiruvlar uchun wrapper.
    async function uploadImageIfNeeded(existingImg) {
      const snap = takeTempImageSnapshot();
      try { return await uploadImageSnapshot(snap, existingImg, false); }
      finally { releaseImageSnapshot(snap); }
    }

    // RENDER ROUTER
    function updateNavLabels() {
      const map = {
        'nav-label-home': 'nav_home', 'nav-label-categories': 'nav_categories',
        'nav-label-cart': 'nav_cart', 'nav-label-orders': 'nav_orders',
        'nav-label-warehouse': 'nav_warehouse', 'nav-label-support': 'nav_support',
        'nav-label-profile': 'nav_profile',
      };
      for (const [elId, key] of Object.entries(map)) {
        const el = document.getElementById(elId);
        if (el) el.innerText = t(key);
      }
    }

    function updateHeaderChrome() {
      const logoImg = document.getElementById('shop-logo-img');
      if (logoImg) {
        if (shopLogoUrl) { logoImg.src = shopLogoUrl; logoImg.classList.remove('hidden'); }
        else { logoImg.classList.add('hidden'); }
        // Headerdagi logo endi faqat brend ko'rinishi. Uni tahrirlash
        // "Profil → Do'kon haqida" ichidagi yagona zamonaviy logo blokida.
        logoImg.onclick = null;
        logoImg.classList.remove('cursor-pointer');
      }
      const flagBtn = document.getElementById('lang-flag-btn');
      if (flagBtn) flagBtn.innerText = uiLang === 'uz' ? '🇷🇺' : '🇺🇿';
      const cartBtn = document.getElementById('header-cart-btn');
      if (cartBtn) cartBtn.classList.toggle('hidden', isAdminMode && isUserAnAdmin);
      const personBtn = document.getElementById('header-person-btn');
      if (personBtn) {
        // Oddiy user Profilga pastki menyudan kiradi; tepada foydasiz odamcha ko'rinmaydi.
        personBtn.classList.toggle('hidden', !isUserAnAdmin);
        personBtn.onclick = isUserAnAdmin ? togglePersonMenu : null;
      }
      // Sozlama (⚙️) tugmasi faqat admin uchun — oddiy userga bosilganda hech
      // narsa qilmaydigan "o'lik" icon ko'rsatmaslik uchun.
      const settingsBtn = document.getElementById('header-settings-btn');
      if (settingsBtn) settingsBtn.classList.toggle('hidden', !(isAdminMode && isUserAnAdmin));
    }

    // 20-band: Profildagi katta "rejim almashtirish" tugmasi o'rniga headerdagi
    // odamcha icon — faqat admin huquqiga ega userlarga chiqadi, joriy rejimga
    // qarab bitta variant ko'rsatadi. toggleAdminRole() o'zgarmagan.
    // 17-band: popover avval statik `right-4 top-14` bilan joylashtirilgan
    // edi — bu odamcha iconning haqiqiy ekrandagi joyidan mustaqil taxmin
    // bo'lib, real Telegram'da logo ustidan chiqib qolardi. Endi tugmaning
    // haqiqiy joyi o'lchanadi va popover shunga aniq anchor qilinadi.
    function togglePersonMenu(event) {
      if (event) event.stopPropagation();
      const popover = document.getElementById('role-mode-popover');
      const personBtn = document.getElementById('header-person-btn');
      if (!popover || !personBtn) return;
      const isOpen = !popover.classList.contains('hidden');
      if (isOpen) { popover.classList.add('hidden'); return; }
      const label = isAdminMode ? tr("👤 Userga o'tish", '👤 Перейти к пользователю') : tr("🛡️ Adminga o'tish", '🛡️ Перейти в админку');
      popover.innerHTML = `<button onclick="document.getElementById('role-mode-popover').classList.add('hidden'); toggleAdminRole();" class="block w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 whitespace-nowrap">${label}</button>`;
      popover.classList.remove('hidden');
      const rect = personBtn.getBoundingClientRect();
      const popW = popover.offsetWidth || 200;
      const margin = 8;
      let left = rect.left + rect.width / 2 - popW / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));
      popover.style.top = `${rect.bottom + margin}px`;
      popover.style.left = `${left}px`;
      popover.style.right = 'auto';
    }
    document.addEventListener('click', (event) => {
      const popover = document.getElementById('role-mode-popover');
      const personBtn = document.getElementById('header-person-btn');
      if (popover && !popover.classList.contains('hidden')) {
        if (!(popover.contains(event.target) || (personBtn && personBtn.contains(event.target)))) {
          popover.classList.add('hidden');
        }
      }

      // Product/katalogdagi uch nuqta menyusi: tashqariga bosilganda yopiladi.
      if (cardActionMenu) {
        const target = event.target;
        const insideMenu = target?.closest?.('.fc-card-action-menu');
        const onMenuButton = target?.closest?.('.fc-product-more-overlay, .fc-card-more-btn');
        if (!insideMenu && !onMenuButton) {
          cardActionMenu = null;
          render();
        }
      }
    });

    function render() {
      updateCartBadge();
      updateNavLabels();
      updateHeaderChrome();

      if (authReady && (!registeredUser || legalConsentRequired) && !isAdminMode && activePopupModal !== 'REGISTRATION') {
        activePopupModal = 'REGISTRATION';
      }

      const roleTag = document.getElementById('role-tag');
      if (roleTag && authReady) roleTag.classList.remove('hidden');
      const whBtn = document.getElementById('nav-warehouse-btn');
      const cartNavBtn = document.getElementById('nav-cart');

      if (isAdminMode && isUserAnAdmin) {
        roleTag.innerText = "ADMIN";
        roleTag.dataset.role = 'admin';
        whBtn.classList.remove('hidden');
        whBtn.classList.add('flex');
        cartNavBtn.classList.add('hidden');
        cartNavBtn.classList.remove('flex');
        if (currentTab === 'cart') currentTab = 'home';
        // 1-band: admin bo'lsa murojaatlar (Support badge) doim fonda yuklab boriladi.
        loadAdminSupportTicketsLazy();
      } else {
        roleTag.innerText = "STORE";
        roleTag.dataset.role = 'store';
        whBtn.classList.add('hidden');
        cartNavBtn.classList.remove('hidden');
        cartNavBtn.classList.add('flex');
        if (currentTab === 'warehouse') currentTab = 'home';
      }

      // 1/3-band: Qo'llab-quvvatlash bottom-nav tugmasidagi o'qilmagan-nuqta.
      const supportNavBtn = document.getElementById('nav-support-btn');
      if (supportNavBtn) {
        let dot = supportNavBtn.querySelector('.fc-nav-dot');
        const unread = (isAdminMode && isUserAnAdmin) ? adminSupportTickets.some(t => t.status === 'OPEN' || supportNeedsAttention(t)) : supportTickets.some(t => t.status === 'ANSWERED');
        if (unread && !dot) { dot = document.createElement('span'); dot.className = 'fc-nav-dot'; supportNavBtn.appendChild(dot); }
        else if (!unread && dot) { dot.remove(); }
      }

      const container = document.getElementById('app-content');
      switch (currentTab) {
        case 'home': renderHome(container); break;
        case 'categories': renderCategories(container); break;
        case 'cart': renderCart(container); break;
        case 'orders': renderOrders(container); break;
        case 'warehouse': renderWarehouse(container); break;
        case 'profile': renderProfile(container); break;
      }

      // POLISH ROUND 1-bosqich: page-shell — activePage bo'lsa to'liq sahifa
      // app-content/bottom-nav ustidan chiqadi (currentTab fonda o'zgarmay qoladi).
      const pageContainer = document.getElementById('page-container');
      if (activePage) {
        pageContainer.classList.remove('hidden');
        renderActivePage(pageContainer);
      } else {
        pageContainer.classList.add('hidden');
        pageContainer.innerHTML = '';
      }

      renderModalContainer();
      lucide.createIcons();
    }

    // 38-band: custom tasdiqlash dialogi (native confirm() o'rniga) —
    // eng yuqori-xavfli, QAYTARIB BO'LMAYDIGAN amallar uchun (butunlay
    // o'chirish). Boshqa joylardagi native confirm() o'zgartirilmadi —
    // ular allaqachon kam-xavfli/tez-tez ishlatiladigan amallar.
    let fcConfirmResolver = null;
    function fcConfirm(title, text, opts = {}) {
      return new Promise((resolve) => {
        fcConfirmResolver = resolve;
        const danger = opts.danger !== false;
        const root = document.createElement('div');
        root.id = 'fc-confirm-root';
        root.innerHTML = `
          <div class="fc-confirm-backdrop" onclick="window.__fcConfirmAnswer(false)">
            <div class="fc-confirm-box" onclick="event.stopPropagation()">
              <p class="fc-confirm-title">${escapeHtml(title)}</p>
              <p class="fc-confirm-text">${escapeHtml(text)}</p>
              <div class="fc-confirm-actions">
                <button onclick="window.__fcConfirmAnswer(false)" class="fc-btn fc-btn-secondary">${tr('Bekor qilish', 'Отмена')}</button>
                <button onclick="window.__fcConfirmAnswer(true)" class="fc-btn ${danger ? 'fc-btn-danger' : 'fc-btn-primary'}">${tr('Tasdiqlash', 'Подтвердить')}</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(root);
      });
    }
    window.__fcConfirmAnswer = function (val) {
      const root = document.getElementById('fc-confirm-root');
      if (root) root.remove();
      if (fcConfirmResolver) { fcConfirmResolver(val); fcConfirmResolver = null; }
    };

    // Legacy audit: rasm/fayl tanlashning 9+ turli joyi turlicha (label,
    // button+onclick, ikkitasi yonma-yon, ba'zisida Fayllar varianti
    // umuman yo'q) ko'rinishda edi. Bitta umumiy action-sheet — YASHIRIN
    // <input>/onchange handlerlarga HECH TEGILMAYDI, faqat ularni
    // TRIGGER qiladigan ko'rinish bitta joyda. fcConfirm bilan bir xil
    // naqsh (o'z appendChild root'i — #modal-container'dagi mavjud
    // modalni (masalan tovar tahrirlash formasi) yo'q qilib qo'ymaslik
    // uchun, chunki innerHTML almashtirish uning holatini yo'qotardi).
    function openImagePickerSheet(galleryInputId, filesInputId) {
      // ROUND13: custom Galereya/Fayl action-sheet olib tashlandi. Har bir
      // upload joyi to'g'ridan-to'g'ri native file picker'ni ochadi. Biz
      // qurilmaning qaysi papkasini birinchi ko'rsatishini majburlamaymiz —
      // bu Android/iOS/Telegram WebView'ning o'zi boshqaradigan native UI.
      const target = document.getElementById(filesInputId || galleryInputId);
      if (target) target.click();
    }
    function closeImagePickerSheet() {
      const root = document.getElementById('fc-picker-sheet-root');
      if (root) root.remove();
    }

    // ---- page-shell primitive (POLISH ROUND 1-bosqich) ----
    // Kelgusi vazifalarda renderActivePage() ichiga yangi case'lar qo'shiladi:
    // SUPPORT, SETTINGS, DASHBOARD, WAREHOUSE_HOLAT va h.k.
    function renderActivePage(container) {
      switch (activePage) {
        case 'SUPPORT': renderSupportPage(container); break;
        case 'PLATFORM_ADMINS': renderPlatformAdminsPage(container); break;
        case 'STAFF': renderStaffPage(container); break;
        case 'ROLES': renderRolesPage(container); break;
        case 'SETTINGS': renderSettingsPage(container); break;
        case 'DASHBOARD': renderDashboardPage(container); break;
        case 'FAVORITES': renderFavoritesPage(container); break;
        case 'RECENT': renderRecentPage(container); break;
        case 'BILLZ': renderBillzPage(container); break;
        case 'ORDER_INFO': renderOrderInfoPage(container); break;
        case 'DESIGN_SETTINGS': renderDesignSettingsPage(container); break;
        case 'DELIVERY_SETTINGS': renderDeliverySettingsPage(container); break;
        case 'PAYMENT_SETTINGS': renderPaymentSettingsPage(container); break;
        case 'LEGAL_SETTINGS': renderLegalSettingsPage(container); break;
        case 'PROMO_CODES': renderPromoPage(container); break;
        case 'ABANDONED_CARTS': renderAbandonedCartsPage(container); break;
        case 'BANNERS': renderBannersPage(container); break;
        case 'FEATURED_CATEGORIES': renderFeaturedCategoriesPage(container); break;
        case 'REPORTS': renderReportsPage(container); break;
        case 'BUNDLES': renderBundlesPage(container); break;
        case 'DISCOUNT_TIERS': renderDiscountTiersPage(container); break;
        case 'REWARD_RULES': renderRewardRulesPage(container); break;
        case 'MARKETING_HUB': renderMarketingHubPage(container); break;
        case 'CAMPAIGNS': renderCampaignsPage(container); break;
        case 'CAMPAIGN_DETAIL': renderCampaignDetailPage(container); break;
        default:
          container.innerHTML = '';
      }
    }

    function openPage(pageId, navBtnId) {
      activePage = pageId;
      render();
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('text-blue-600', 'font-bold'));
      if (navBtnId) {
        const btn = document.getElementById(navBtnId);
        if (btn) btn.classList.add('text-blue-600', 'font-bold');
      }
    }

    function closePage() {
      activePage = null;
      render();
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('text-blue-600', 'font-bold'));
      const activeNav = document.getElementById(`nav-${currentTab}`);
      if (activeNav) activeNav.classList.add('text-blue-600', 'font-bold');
    }

    function goHomePage() {
      activePage = null;
      currentTab = 'home';
      render();
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('text-blue-600', 'font-bold'));
      const activeNav = document.getElementById('nav-home');
      if (activeNav) activeNav.classList.add('text-blue-600', 'font-bold');
    }

    // Standart sahifa header: ← Orqaga / sarlavha / ⌂ Bosh sahifa (46-band).
    // onBack berilmasa closePage() ishlatiladi (avvalgi tab/holatga qaytadi).
    function renderPageShell(container, title, bodyHtml, opts = {}) {
      const backAction = opts.onBack || 'closePage()';
      container.innerHTML = `
        <div class="fc-page-header">
          <button onclick="${backAction}" class="fc-page-header-btn" aria-label="${escapeHtml(tr('Orqaga', 'Назад'))}" title="${escapeHtml(tr('Orqaga', 'Назад'))}">
            <i data-lucide="arrow-left" class="w-5 h-5"></i>
          </button>
          <div class="fc-page-header-title">${escapeHtml(title)}</div>
          <button onclick="goHomePage()" class="fc-page-header-btn" aria-label="${escapeHtml(tr('Bosh sahifa', 'Главная'))}" title="${escapeHtml(tr('Bosh sahifa', 'Главная'))}">
            <i data-lucide="home" class="w-5 h-5"></i>
          </button>
        </div>
        <div class="p-4 max-w-md mx-auto" style="padding-bottom:calc(5rem + env(safe-area-inset-bottom))">
          ${bodyHtml}
        </div>
      `;
    }

    // ---- umumiy pagination (POLISH ROUND 1-bosqich, 21/26-band) ----
    // Mavjud categoryPage/ordersPage 10-tadan patternini umumlashtiradi —
    // Ombor Holat/Sevimlilar/Yaqinda ko'rilganlar/Trash/Kirim tarixi shundan foydalanadi.
    function paginate(list, page, pageSize = 10) {
      const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
      const clampedPage = Math.min(Math.max(1, page || 1), totalPages);
      const start = (clampedPage - 1) * pageSize;
      return { items: list.slice(start, start + pageSize), totalPages, page: clampedPage };
    }

    // Umumiy pager UI: ‹ 1 2 3 › (ko'p bo'lsa 1 2 … 10). onPageFn — sahifa
    // raqamini argument sifatida qabul qiladigan global funksiya nomi (masalan "setFavoritesPage").
    function renderPagerHTML(page, totalPages, onPageFn) {
      if (totalPages <= 1) return '';
      const pages = new Set([1, totalPages]);
      for (let n = page - 1; n <= page + 1; n++) { if (n > 1 && n < totalPages) pages.add(n); }
      const sorted = [...pages].sort((a, b) => a - b);

      let itemsHtml = '';
      let prev = 0;
      for (const n of sorted) {
        if (prev && n - prev > 1) itemsHtml += `<span class="fc-pager-ellipsis">…</span>`;
        itemsHtml += `<button onclick="${onPageFn}(${n})" class="fc-pager-btn ${n === page ? 'fc-pager-active' : ''}">${n}</button>`;
        prev = n;
      }

      return `
        <div class="fc-pager">
          <button onclick="${onPageFn}(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="fc-pager-btn" aria-label="${escapeHtml(tr('Oldingi', 'Предыдущая'))}">‹</button>
          ${itemsHtml}
          <button onclick="${onPageFn}(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="fc-pager-btn" aria-label="${escapeHtml(tr('Keyingi', 'Следующая'))}">›</button>
        </div>
      `;
    }

    // ==================== HISOBOTLAR / ANALYTICS (Reports round, 3.5-bosqich) ====================
    // Chart kutubxonasi ISHLATILMAYDI — barcha vizualizatsiya (ranking-bar,
    // donut) sof CSS/HTML bilan (conic-gradient, width-percent) — Telegram
    // WebView'da eng ishonchli, yangi tashqi bog'liqlik xavfisiz yechim.
    let reportsActiveTab = 'OVERVIEW'; // OVERVIEW | SALES | CUSTOMERS | PRODUCTS
    let reportsPeriod = '30d';
    let reportsDateFrom = null, reportsDateTo = null;
    let reportOverviewData = null, reportOverviewLoading = false, reportOverviewError = null;
    let reportSalesData = null, reportSalesLoading = false, reportSalesError = null;
    let reportSalesFilters = { regionCode: '', payMethod: '', status: '' };
    let reportSalesProductPage = 1;
    let reportCustomerData = null, reportCustomerLoading = false, reportCustomerError = null;
    let reportCustomerSearch = '';
    let reportCustomerSegment = 'ALL';
    let reportCustomerPage = 1;
    let reportProductData = null, reportProductLoading = false, reportProductError = null;
    let reportProductView = 'TOP_REVENUE';
    let reportProductPage = 1;
    const REPORT_CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    function reportsPeriodParams() {
      if (reportsPeriod === 'custom' && reportsDateFrom && reportsDateTo) return { period: 'custom', dateFrom: reportsDateFrom, dateTo: reportsDateTo };
      return { period: reportsPeriod };
    }
    function reportsInvalidateAll() {
      reportOverviewData = null; reportSalesData = null; reportCustomerData = null; reportProductData = null;
      reportSalesProductPage = 1; reportCustomerPage = 1; reportProductPage = 1;
    }
    const REPORT_PERIOD_LABELS = {
      today: () => tr('Bugun', 'Сегодня'), week: () => tr('Hafta', 'Неделя'), month: () => tr('Bu oy', 'Этот месяц'),
      '30d': () => tr('Oxirgi 30 kun', 'Последние 30 дней'),
    };
    function reportsPeriodLabel() {
      if (reportsPeriod === 'custom' && reportsDateFrom && reportsDateTo) return `${reportsDateFrom} — ${reportsDateTo}`;
      return (REPORT_PERIOD_LABELS[reportsPeriod] || REPORT_PERIOD_LABELS['30d'])();
    }

    function openReportsPage() {
      if (!(isAdminMode && isUserAnAdmin && hasPermission('reports.view'))) return;
      openPage('REPORTS', 'nav-profile');
      loadActiveReportTabLazy();
    }
    function setReportsTab(tab) {
      reportsActiveTab = tab;
      render();
      loadActiveReportTabLazy();
    }
    function loadActiveReportTabLazy() {
      if (reportsActiveTab === 'OVERVIEW') loadReportOverviewLazy();
      else if (reportsActiveTab === 'SALES') loadReportSalesLazy();
      else if (reportsActiveTab === 'CUSTOMERS') loadReportCustomerLazy();
      else if (reportsActiveTab === 'PRODUCTS') loadReportProductLazy();
    }

    async function loadReportOverviewLazy(force = false) {
      if (reportOverviewLoading || (reportOverviewData && !force)) return;
      reportOverviewLoading = true; reportOverviewError = null;
      if (activePage === 'REPORTS') render();
      try {
        reportOverviewData = await callApi('get_report_overview', reportsPeriodParams());
      } catch (e) {
        console.error('Hisobot yuklanmadi:', e);
        reportOverviewError = e?.message || tr("Yuklab bo'lmadi", 'Не удалось загрузить');
      } finally {
        reportOverviewLoading = false;
        if (activePage === 'REPORTS' && reportsActiveTab === 'OVERVIEW') render();
      }
    }
    async function loadReportSalesLazy(force = false) {
      if (reportSalesLoading || (reportSalesData && !force)) return;
      reportSalesLoading = true; reportSalesError = null;
      if (activePage === 'REPORTS') render();
      try {
        const params = { ...reportsPeriodParams() };
        if (reportSalesFilters.regionCode) params.regionCode = reportSalesFilters.regionCode;
        if (reportSalesFilters.payMethod) params.payMethod = reportSalesFilters.payMethod;
        if (reportSalesFilters.status) params.status = reportSalesFilters.status;
        reportSalesProductPage = 1;
        reportSalesData = await callApi('get_sales_report', params);
      } catch (e) {
        console.error('Savdo hisoboti yuklanmadi:', e);
        reportSalesError = e?.message || tr("Yuklab bo'lmadi", 'Не удалось загрузить');
      } finally {
        reportSalesLoading = false;
        if (activePage === 'REPORTS' && reportsActiveTab === 'SALES') render();
      }
    }
    async function loadReportCustomerLazy() {
      if (reportCustomerLoading) return;
      reportCustomerLoading = true; reportCustomerError = null;
      if (activePage === 'REPORTS') render();
      try {
        reportCustomerData = await callApi('get_customer_report', {
          ...reportsPeriodParams(), search: reportCustomerSearch, segment: reportCustomerSegment, page: reportCustomerPage, pageSize: 20,
        });
      } catch (e) {
        console.error('Mijozlar hisoboti yuklanmadi:', e);
        reportCustomerError = e?.message || tr("Yuklab bo'lmadi", 'Не удалось загрузить');
      } finally {
        reportCustomerLoading = false;
        if (activePage === 'REPORTS' && reportsActiveTab === 'CUSTOMERS') render();
      }
    }
    async function loadReportProductLazy() {
      if (reportProductLoading) return;
      reportProductLoading = true; reportProductError = null;
      if (activePage === 'REPORTS') render();
      try {
        reportProductData = await callApi('get_product_report', {
          ...reportsPeriodParams(), view: reportProductView, page: reportProductPage, pageSize: 20,
        });
      } catch (e) {
        console.error('Mahsulot hisoboti yuklanmadi:', e);
        reportProductError = e?.message || tr("Yuklab bo'lmadi", 'Не удалось загрузить');
      } finally {
        reportProductLoading = false;
        if (activePage === 'REPORTS' && reportsActiveTab === 'PRODUCTS') render();
      }
    }

    function setSalesFilter(key, value) { reportSalesFilters[key] = value; loadReportSalesLazy(true); }
    function setReportSalesProductPage(n) { reportSalesProductPage = Math.max(1, n); render(); }
    let reportCustomerSearchTimer = null;
    function onReportCustomerSearchInput(v) {
      clearTimeout(reportCustomerSearchTimer);
      reportCustomerSearchTimer = setTimeout(() => { reportCustomerSearch = v; reportCustomerPage = 1; loadReportCustomerLazy(); }, 350);
    }
    function setReportCustomerSegment(v) { reportCustomerSegment = v; reportCustomerPage = 1; loadReportCustomerLazy(); }
    function goToReportCustomerPage(n) { reportCustomerPage = Math.max(1, n); loadReportCustomerLazy(); }
    function setProductView(v) { reportProductView = v; reportProductPage = 1; loadReportProductLazy(); }
    function goToReportProductPage(n) { reportProductPage = Math.max(1, n); loadReportProductLazy(); }

    function openReportPeriodSheet() {
      const allowPresets = reportsActiveTab === 'OVERVIEW';
      let root = document.getElementById('fc-report-period-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-report-period-root'; document.body.appendChild(root); }
      const presetsHtml = allowPresets ? `
        <div class="fc-tabs">
          ${['today', 'week', 'month', '30d'].map(p => `<button type="button" onclick="applyReportPeriod('${p}')" class="fc-tab ${reportsPeriod === p ? 'fc-tab-active' : ''}">${REPORT_PERIOD_LABELS[p]()}</button>`).join('')}
        </div>
      ` : '';
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeReportPeriodSheet();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Davr tanlash', 'Выбор периода')}</div><button type="button" onclick="closeReportPeriodSheet()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            ${presetsHtml}
            <div class="grid grid-cols-2 gap-2">
              <label class="fc-mini-field"><span>${tr('Boshlanish', 'Начало')}</span><input type="date" id="report-date-from" value="${escapeHtml(reportsDateFrom || '')}"></label>
              <label class="fc-mini-field"><span>${tr('Tugash', 'Конец')}</span><input type="date" id="report-date-to" value="${escapeHtml(reportsDateTo || '')}"></label>
            </div>
          </div>
          <div class="fc-sheet-footer"><button type="button" onclick="applyReportCustomRange()" class="fc-btn fc-btn-primary w-full">${tr('Qollash', 'Применить')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    function closeReportPeriodSheet() {
      const root = document.getElementById('fc-report-period-root');
      if (root) root.remove();
    }
    function applyReportPeriod(period) {
      reportsPeriod = period; reportsDateFrom = null; reportsDateTo = null;
      reportsInvalidateAll();
      closeReportPeriodSheet();
      render();
      loadActiveReportTabLazy();
    }
    function applyReportCustomRange() {
      const from = document.getElementById('report-date-from')?.value;
      const to = document.getElementById('report-date-to')?.value;
      if (!from || !to) { alert(tr('Ikkala sanani ham tanlang.', 'Выберите обе даты.')); return; }
      if (from > to) { alert(tr("Boshlanish sanasi tugash sanasidan kech bo'lmasligi kerak.", 'Дата начала не может быть позже даты окончания.')); return; }
      reportsPeriod = 'custom'; reportsDateFrom = from; reportsDateTo = to;
      reportsInvalidateAll();
      closeReportPeriodSheet();
      render();
      loadActiveReportTabLazy();
    }

    function reportKpiCardHtml(label, value, deltaPercent) {
      const hasDelta = deltaPercent !== null && deltaPercent !== undefined;
      const deltaHtml = hasDelta ? `<div class="fc-report-kpi-delta ${deltaPercent >= 0 ? 'up' : 'down'}"><i data-lucide="${deltaPercent >= 0 ? 'trending-up' : 'trending-down'}" class="w-3 h-3"></i>${deltaPercent >= 0 ? '+' : ''}${formatNumber(deltaPercent)}%</div>` : '';
      return `<div class="fc-report-kpi-card"><div class="fc-report-kpi-label">${label}</div><div class="fc-report-kpi-value">${value}</div>${deltaHtml}</div>`;
    }
    function reportRankingBarsHtml(items) {
      if (!items.length) return `<p class="text-xs text-gray-400">${tr("Ma'lumot yo'q", 'Нет данных')}</p>`;
      const max = Math.max(...items.map((i) => i.value), 1);
      return items.map((i) => `
        <div class="fc-report-rank-row">
          <span class="fc-report-rank-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span>
          <span class="fc-report-rank-bar-track"><span class="fc-report-rank-bar-fill" style="width:${Math.round((i.value / max) * 100)}%"></span></span>
          <span class="fc-report-rank-value">${escapeHtml(i.displayValue)}</span>
        </div>
      `).join('');
    }
    function reportDonutHtml(items) {
      const total = items.reduce((s, i) => s + i.value, 0);
      if (!total) return `<p class="text-xs text-gray-400">${tr("Ma'lumot yo'q", 'Нет данных')}</p>`;
      let acc = 0;
      const stops = items.map((i) => {
        const startPct = (acc / total) * 100;
        acc += i.value;
        return `${i.color} ${startPct}% ${(acc / total) * 100}%`;
      }).join(', ');
      return `<div class="fc-report-donut-wrap">
        <div class="fc-report-donut" style="background:conic-gradient(${stops})"></div>
        <div class="fc-report-legend">
          ${items.map((i) => `<div class="fc-report-legend-row"><span class="fc-report-legend-dot" style="background:${i.color}"></span><span class="fc-report-legend-label">${escapeHtml(i.label)}</span><span class="fc-report-legend-value">${Math.round((i.value / total) * 100)}%</span></div>`).join('')}
        </div>
      </div>`;
    }

    function renderReportsPage(container) {
      if (!(isAdminMode && isUserAnAdmin && hasPermission('reports.view'))) {
        renderPageShell(container, tr('Hisobotlar', 'Отчёты'), `<div class="fc-empty-state"><i data-lucide="shield-alert" class="w-7 h-7"></i><p>${tr("Bu bo'limga kirish huquqingiz yo'q.", 'У вас нет доступа к этому разделу.')}</p></div>`);
        return;
      }
      const tabsBar = `
        <div class="fc-tabs">
          <button onclick="setReportsTab('OVERVIEW')" class="fc-tab ${reportsActiveTab === 'OVERVIEW' ? 'fc-tab-active' : ''}">${tr('Umumiy', 'Общий')}</button>
          <button onclick="setReportsTab('SALES')" class="fc-tab ${reportsActiveTab === 'SALES' ? 'fc-tab-active' : ''}">${tr('Savdo', 'Продажи')}</button>
          <button onclick="setReportsTab('CUSTOMERS')" class="fc-tab ${reportsActiveTab === 'CUSTOMERS' ? 'fc-tab-active' : ''}">${tr('Mijozlar', 'Клиенты')}</button>
          <button onclick="setReportsTab('PRODUCTS')" class="fc-tab ${reportsActiveTab === 'PRODUCTS' ? 'fc-tab-active' : ''}">${tr('Mahsulotlar', 'Товары')}</button>
        </div>
      `;
      const periodBtn = `
        <div class="flex gap-2">
          <button type="button" onclick="openReportPeriodSheet()" class="fc-card fc-report-period-btn flex-1">
            <span class="flex items-center gap-2 text-xs font-bold"><i data-lucide="calendar" class="w-4 h-4"></i>${escapeHtml(reportsPeriodLabel())}</span>
            <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400"></i>
          </button>
          <button type="button" onclick="exportActiveReportPdf()" class="fc-btn fc-btn-secondary" title="PDF" aria-label="PDF"><i data-lucide="file-down" class="w-4 h-4"></i>PDF</button>
        </div>
      `;
      let body = '';
      if (reportsActiveTab === 'OVERVIEW') body = renderReportOverviewTab();
      else if (reportsActiveTab === 'SALES') body = renderReportSalesTab();
      else if (reportsActiveTab === 'CUSTOMERS') body = renderReportCustomerTab();
      else body = renderReportProductTab();

      renderPageShell(container, tr('Hisobotlar', 'Отчёты'), `<div class="space-y-3">${tabsBar}${periodBtn}${body}</div>`);
    }

    function renderReportOverviewTab() {
      if (reportOverviewError && !reportOverviewData) return `<div class="fc-empty-state"><i data-lucide="alert-triangle" class="w-7 h-7"></i><p>${escapeHtml(reportOverviewError)}</p><button type="button" onclick="loadReportOverviewLazy(true)" class="fc-btn fc-btn-secondary mt-2">${tr('Qayta urinish', 'Повторить')}</button></div>`;
      if (!reportOverviewData) return `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`;
      const d = reportOverviewData;
      const cmp = d.comparison;
      return `
        <div class="fc-report-kpi-grid">
          ${reportKpiCardHtml(tr('Jami savdo', 'Продажи'), money(d.totalSales), cmp?.totalSalesChangePercent ?? null)}
          ${reportKpiCardHtml(tr('Buyurtmalar', 'Заказы'), formatNumber(d.orderCount), cmp?.orderCountChangePercent ?? null)}
          ${reportKpiCardHtml(tr('Yakunlangan', 'Завершено'), formatNumber(d.completedOrders))}
          ${reportKpiCardHtml(tr('Yangi', 'Новые'), formatNumber(d.newOrders))}
          ${reportKpiCardHtml(tr('Bekor qilingan', 'Отменено'), `${formatNumber(d.cancelledOrders)} (${formatNumber(d.cancellationRate)}%)`)}
          ${reportKpiCardHtml(tr("O'rtacha chek", 'Средний чек'), money(d.avgOrderValue))}
          ${reportKpiCardHtml(tr('Sotilgan birlik', 'Продано штук'), formatNumber(d.totalUnitsSold))}
          ${reportKpiCardHtml(tr('Mijozlar', 'Клиенты'), formatNumber(d.totalCustomers))}
        </div>
        <div class="fc-card space-y-1">
          <b class="text-xs">${tr('Mijozlar tafsiloti', 'Детали по клиентам')}</b>
          <div class="flex justify-between text-xs"><span>${tr('Yangi mijozlar', 'Новые клиенты')}</span><b>${formatNumber(d.newCustomers)}</b></div>
          <div class="flex justify-between text-xs"><span>${tr('Qayta xarid', 'Повторные')}</span><b>${formatNumber(d.repeatCustomers)}</b></div>
        </div>
        ${(d.topProduct || d.topRegion || d.topPaymentMethod) ? `<div class="fc-card space-y-1.5">
          <b class="text-xs">${tr('Top ko‘rsatkichlar', 'Топ-показатели')}</b>
          ${d.topProduct ? `<div class="flex justify-between text-xs"><span>${tr('Top mahsulot', 'Топ товар')}</span><b>${escapeHtml(d.topProduct.name)}</b></div>` : ''}
          ${d.topRegion ? `<div class="flex justify-between text-xs"><span>${tr('Top hudud', 'Топ регион')}</span><b>${escapeHtml(d.topRegion.label)}</b></div>` : ''}
          ${d.topPaymentMethod ? `<div class="flex justify-between text-xs"><span>${tr("Top to'lov usuli", 'Топ способ оплаты')}</span><b>${escapeHtml(d.topPaymentMethod.label)}</b></div>` : ''}
        </div>` : ''}
      `;
    }

    function renderReportSalesTab() {
      if (reportSalesError && !reportSalesData) return `<div class="fc-empty-state"><i data-lucide="alert-triangle" class="w-7 h-7"></i><p>${escapeHtml(reportSalesError)}</p><button type="button" onclick="loadReportSalesLazy(true)" class="fc-btn fc-btn-secondary mt-2">${tr('Qayta urinish', 'Повторить')}</button></div>`;
      if (!reportSalesData) return `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`;
      const d = reportSalesData;
      const regionRows = d.byRegion.map((r) => ({ label: r.regionLabel, value: r.salesAmount, displayValue: money(r.salesAmount) }));
      const { items: productPage, totalPages: productTotalPages, page: productPageNum } = paginate(d.byProduct, reportSalesProductPage, 10);
      const paymentDonutItems = d.byPaymentMethod.map((p, idx) => ({ label: p.label, value: p.salesAmount, color: REPORT_CHART_COLORS[idx % REPORT_CHART_COLORS.length] }));
      const selectCls = 'flex-1 min-w-[130px] p-2 border rounded-xl text-xs bg-white';
      return `
        <div class="fc-card space-y-2">
          <div class="flex justify-between text-xs"><span>${tr('Jami savdo', 'Всего продаж')}</span><b>${money(d.totalSales)}</b></div>
          <div class="flex justify-between text-xs"><span>${tr('Buyurtmalar', 'Заказы')}</span><b>${formatNumber(d.totalOrders)}</b></div>
        </div>
        <div class="fc-report-filter-row">
          <select onchange="setSalesFilter('regionCode', this.value)" class="${selectCls}">
            <option value="">${tr('Barcha hududlar', 'Все регионы')}</option>
            ${REGION_DEFS.map((r) => `<option value="${r.code}" ${reportSalesFilters.regionCode === r.code ? 'selected' : ''}>${escapeHtml(tr(r.nameUz, r.nameRu))}</option>`).join('')}
          </select>
          <select onchange="setSalesFilter('payMethod', this.value)" class="${selectCls}">
            <option value="">${tr("Barcha to'lov usullari", 'Все способы оплаты')}</option>
            <option value="CASH" ${reportSalesFilters.payMethod === 'CASH' ? 'selected' : ''}>${tr('Naqd', 'Наличные')}</option>
            <option value="CARD" ${reportSalesFilters.payMethod === 'CARD' ? 'selected' : ''}>${tr('Karta', 'Карта')}</option>
            <option value="CLICK" ${reportSalesFilters.payMethod === 'CLICK' ? 'selected' : ''}>Click</option>
          </select>
          <select onchange="setSalesFilter('status', this.value)" class="${selectCls}">
            <option value="">${tr('Barcha statuslar', 'Все статусы')}</option>
            <option value="NEW" ${reportSalesFilters.status === 'NEW' ? 'selected' : ''}>${tr('Yangi', 'Новый')}</option>
            <option value="PROCESSING" ${reportSalesFilters.status === 'PROCESSING' ? 'selected' : ''}>${tr('Jarayonda', 'В обработке')}</option>
            <option value="DELIVERED" ${reportSalesFilters.status === 'DELIVERED' ? 'selected' : ''}>${tr('Yetkazildi', 'Доставлено')}</option>
            <option value="CANCELLED" ${reportSalesFilters.status === 'CANCELLED' ? 'selected' : ''}>${tr('Bekor qilindi', 'Отменён')}</option>
          </select>
        </div>
        <div class="fc-card"><b class="text-xs">${tr("Hududlar bo'yicha", 'По регионам')}</b><div class="mt-2">${reportRankingBarsHtml(regionRows)}</div></div>
        <div class="fc-card"><b class="text-xs">${tr("To'lov turi bo'yicha", 'По способам оплаты')}</b><div class="mt-2">${reportDonutHtml(paymentDonutItems)}</div></div>
        <div class="fc-card">
          <b class="text-xs">${tr("Mahsulotlar bo'yicha", 'По товарам')}</b>
          <div class="fc-staff-list mt-2">
            ${productPage.map((p) => `
              <div class="fc-staff-row">
                <div class="min-w-0 flex-1">
                  <div class="fc-staff-name">${escapeHtml(p.name)}</div>
                  <div class="fc-staff-id">${formatNumber(p.unitsSold)} ${tr('dona', 'шт')} · ${formatNumber(p.orderCount)} ${tr('buyurtma', 'заказ')}</div>
                </div>
                <b class="text-xs">${money(p.revenue)}</b>
              </div>
            `).join('') || `<div class="fc-empty-state"><p>${tr("Ma'lumot yo'q", 'Нет данных')}</p></div>`}
          </div>
          ${renderPagerHTML(productPageNum, productTotalPages, 'setReportSalesProductPage')}
        </div>
      `;
    }

    function renderReportCustomerTab() {
      const d = reportCustomerData;
      const loadingFirst = reportCustomerLoading && !d;
      const errorFirst = reportCustomerError && !d;
      const kpi = d?.kpi;
      const segments = [
        ['ALL', tr('Barchasi', 'Все')], ['TOP_ORDERS', tr("Ko'p buyurtma", 'Много заказов')], ['TOP_SPEND', tr("Ko'p sarflagan", 'Много потратил')],
        ['REPEAT', tr('Qayta xarid', 'Повторные')], ['NEW', tr('Yangi', 'Новые')], ['NEVER_ORDERED', tr('Buyurtma qilmagan', 'Без заказов')],
        ['DORMANT', tr('Uzoq faolsiz', 'Давно неактивны')], ['HIGH_CANCEL', tr("Ko'p bekor qilgan", 'Часто отменяет')],
      ];
      return `
        ${kpi ? `<div class="fc-report-kpi-grid">
          ${reportKpiCardHtml(tr('Jami mijozlar', 'Всего клиентов'), formatNumber(kpi.totalCustomers))}
          ${reportKpiCardHtml(tr('Yangi mijozlar', 'Новые клиенты'), formatNumber(kpi.newCustomers))}
          ${reportKpiCardHtml(tr('Qayta xarid', 'Повторные'), formatNumber(kpi.repeatCustomers))}
          ${reportKpiCardHtml(tr('1 marta xarid', 'Разовые'), formatNumber(kpi.oneTimeCustomers))}
          ${reportKpiCardHtml(tr("O'rtacha xarajat", 'Средние траты'), money(kpi.avgCustomerSpend))}
          ${kpi.topSpender ? reportKpiCardHtml(tr("Ko'p sarflagan", 'Больше всех потратил'), escapeHtml(kpi.topSpender.name)) : ''}
        </div>` : ''}
        <input type="text" oninput="onReportCustomerSearchInput(this.value)" value="${escapeHtml(reportCustomerSearch)}" placeholder="${escapeHtml(tr('Ism, telefon yoki username', 'Имя, телефон или username'))}" class="w-full bg-white px-3 py-2.5 rounded-xl border border-gray-200 text-xs">
        <div class="fc-report-filter-row">
          ${segments.map(([key, label]) => `<button type="button" onclick="setReportCustomerSegment('${key}')" class="fc-tab ${reportCustomerSegment === key ? 'fc-tab-active' : ''}">${label}</button>`).join('')}
        </div>
        <div class="fc-card p-0 overflow-hidden">
          ${errorFirst ? `<div class="fc-empty-state"><i data-lucide="alert-triangle" class="w-7 h-7"></i><p>${escapeHtml(reportCustomerError)}</p><button type="button" onclick="loadReportCustomerLazy()" class="fc-btn fc-btn-secondary mt-2">${tr('Qayta urinish', 'Повторить')}</button></div>` : loadingFirst ? `<div class="fc-empty-state"><div class="fc-spinner"></div></div>` : `<div class="fc-staff-list">
            ${(d?.customers || []).map((c) => `
              <div class="fc-staff-row">
                <div class="min-w-0 flex-1">
                  <div class="fc-staff-name">${escapeHtml(c.name)}${c.username ? ` <span class="text-gray-400">@${escapeHtml(c.username)}</span>` : ''}</div>
                  <div class="fc-staff-id">${c.phone ? escapeHtml(c.phone) + ' · ' : ''}${formatNumber(c.successfulOrders)} ${tr('buyurtma', 'заказ')} · ${money(c.totalSpent)}</div>
                </div>
              </div>
            `).join('') || `<div class="fc-empty-state"><p>${tr('Mijozlar topilmadi.', 'Клиенты не найдены.')}</p></div>`}
          </div>`}
        </div>
        ${d ? renderPagerHTML(d.page, d.totalPages, 'goToReportCustomerPage') : ''}
      `;
    }

    const REPORT_PRODUCT_VIEWS = [
      ['TOP_REVENUE', () => tr("Ko'p tushum", 'Больше выручки')], ['TOP_SOLD', () => tr("Ko'p sotilgan", 'Больше продано')],
      ['LEAST_SOLD', () => tr('Kam sotilgan', 'Мало продано')], ['NEVER_SOLD', () => tr('Sotilmagan', 'Не продавался')],
      ['LOW_STOCK', () => tr("Qoldig'i kam", 'Мало на складе')], ['OUT_OF_STOCK', () => tr('Tugagan', 'Нет в наличии')],
      ['TRENDING_UP', () => tr("O'sayotgan", 'Растёт')], ['TRENDING_DOWN', () => tr('Pasayayotgan', 'Падает')],
    ];
    function renderReportProductTab() {
      const d = reportProductData;
      const loadingFirst = reportProductLoading && !d;
      const errorFirst = reportProductError && !d;
      return `
        <div class="fc-report-filter-row">
          ${REPORT_PRODUCT_VIEWS.map(([key, label]) => `<button type="button" onclick="setProductView('${key}')" class="fc-tab ${reportProductView === key ? 'fc-tab-active' : ''}">${label()}</button>`).join('')}
        </div>
        <div class="fc-card p-0 overflow-hidden">
          ${errorFirst ? `<div class="fc-empty-state"><i data-lucide="alert-triangle" class="w-7 h-7"></i><p>${escapeHtml(reportProductError)}</p><button type="button" onclick="loadReportProductLazy()" class="fc-btn fc-btn-secondary mt-2">${tr('Qayta urinish', 'Повторить')}</button></div>` : loadingFirst ? `<div class="fc-empty-state"><div class="fc-spinner"></div></div>` : `<div class="fc-staff-list">
            ${(d?.products || []).map((p) => `
              <div class="fc-staff-row">
                <div class="fc-staff-avatar">${p.img ? `<img src="${escapeHtml(p.img)}" class="w-full h-full object-cover rounded-full">` : `<i data-lucide="package" class="w-4 h-4"></i>`}</div>
                <div class="min-w-0 flex-1">
                  <div class="fc-staff-name">${escapeHtml(p.name)}${p.isDeleted ? ` <span class="fc-badge fc-badge-muted">${tr("o'chirilgan", 'удалён')}</span>` : ''}</div>
                  <div class="fc-staff-id">${formatNumber(p.unitsSold)} ${tr('dona', 'шт')}${p.currentStock !== null ? ` · ${tr('qoldiq', 'остаток')}: ${formatNumber(p.currentStock)}` : ''}</div>
                </div>
                <b class="text-xs">${money(p.revenue)}</b>
              </div>
            `).join('') || `<div class="fc-empty-state"><p>${tr("Ma'lumot yo'q", 'Нет данных')}</p></div>`}
          </div>`}
        </div>
        ${d ? renderPagerHTML(d.page, d.totalPages, 'goToReportProductPage') : ''}
      `;
    }

    // ==================== HISOBOTLAR — PDF eksport (Reports round, 3.6-bosqich) ====================
    // Supabase'ga HECH NARSA yuklanmaydi/saqlanmaydi (spec 9-bandi) — PDF
    // butunlay foydalanuvchi qurilmasida (jsPDF, CDN orqali) generatsiya
    // qilinadi va to'g'ridan-to'g'ri yuklab olinadi. Chart'lar
    // html2canvas/skrinshot orqali EMAS (Telegram WebView'da notinch bo'lishi
    // mumkin) — jsPDF'ning o'z vektor chizish API'si (rect/text) bilan, sof
    // UI'dagi ranking-bar bilan bir xil g'oyada. Har bir eksport allaqachon
    // sahifada yuklangan (UI'da ko'rinayotgan) ma'lumotdan foydalanadi —
    // shuning uchun PDF va UI raqamlari HAR DOIM bir xil (spec 8-bandi).
    function sanitizePdfFilename(name) {
      return String(name || 'Hisobot').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
    }
    function pdfFilenameFor(reportTypeLabel, dateFrom, dateTo) {
      const shop = sanitizePdfFilename(shopDisplayName());
      const type = sanitizePdfFilename(reportTypeLabel);
      const from = String(dateFrom || '').slice(0, 10);
      const to = String(dateTo || '').slice(0, 10);
      return `${shop}_${type}_${from}_${to}.pdf`;
    }
    function reportPdfAvailable() {
      return !!(window.jspdf && window.jspdf.jsPDF);
    }
    function drawPdfRankingBars(doc, x, y, width, items) {
      const rowH = 6.2;
      const labelW = width * 0.34;
      const valueW = width * 0.24;
      const barW = width - labelW - valueW - 4;
      const max = Math.max(...items.map((i) => i.value), 1);
      doc.setFontSize(8);
      items.forEach((item, idx) => {
        const rowY = y + idx * rowH;
        doc.setTextColor(30, 41, 59);
        doc.text(String(item.label).slice(0, 26), x, rowY + 3.2);
        doc.setFillColor(226, 232, 240);
        doc.rect(x + labelW, rowY, barW, 3.2, 'F');
        const fillW = Math.max(1, (item.value / max) * barW);
        doc.setFillColor(59, 130, 246);
        doc.rect(x + labelW, rowY, fillW, 3.2, 'F');
        doc.setTextColor(15, 23, 42);
        doc.text(String(item.displayValue), x + labelW + barW + 2, rowY + 3.2);
      });
      return y + items.length * rowH;
    }
    function newReportPdfDoc(reportTypeLabel, periodLabel) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text(shopDisplayName(), 14, 18);
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text(reportTypeLabel, 14, 25);
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${tr('Davr', 'Период')}: ${periodLabel}`, 14, 31);
      doc.text(`${tr('Yaratildi', 'Создано')}: ${new Date().toLocaleString(uiLang === 'ru' ? 'ru-RU' : 'uz-UZ')}`, 14, 35.5);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 39, pageW - 14, 39);
      return { doc, pageW, y: 46 };
    }
    function pdfKpiGrid(doc, x, y, width, pairs) {
      const colW = width / 2;
      let cy = y;
      for (let i = 0; i < pairs.length; i += 2) {
        [pairs[i], pairs[i + 1]].filter(Boolean).forEach(([label, value], colIdx) => {
          const cx = x + colIdx * colW;
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          doc.text(String(label), cx, cy);
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text(String(value), cx, cy + 5);
        });
        cy += 12;
      }
      return cy + 2;
    }
    function pdfSectionTitle(doc, x, y, title) {
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(title, x, y);
      return y + 5;
    }
    function pdfEnsureSpace(doc, y, needed) {
      const pageH = doc.internal.pageSize.getHeight();
      if (y + needed > pageH - 16) { doc.addPage(); return 18; }
      return y;
    }
    function pdfNoDataYetToast() { showActionToast(tr('Avval hisobot yuklansin', 'Сначала загрузите отчёт'), 'error', 1500); }
    function pdfLibMissingAlert() { alert(tr('PDF kutubxonasi yuklanmadi. Internetni tekshiring.', 'Библиотека PDF не загрузилась. Проверьте интернет.')); }
    function exportActiveReportPdf() {
      if (reportsActiveTab === 'OVERVIEW') exportOverviewPdf();
      else if (reportsActiveTab === 'SALES') exportSalesPdf();
      else if (reportsActiveTab === 'CUSTOMERS') exportCustomerPdf();
      else exportProductPdf();
    }

    function exportOverviewPdf() {
      if (!reportOverviewData) { pdfNoDataYetToast(); return; }
      if (!reportPdfAvailable()) { pdfLibMissingAlert(); return; }
      const d = reportOverviewData;
      const { doc, pageW, y: y0 } = newReportPdfDoc(tr('Umumiy hisobot', 'Общий отчёт'), reportsPeriodLabel());
      let y = pdfSectionTitle(doc, 14, y0, tr('Asosiy ko‘rsatkichlar', 'Основные показатели'));
      y = pdfKpiGrid(doc, 14, y + 4, pageW - 28, [
        [tr('Jami savdo', 'Продажи'), money(d.totalSales)],
        [tr('Buyurtmalar', 'Заказы'), formatNumber(d.orderCount)],
        [tr('Yakunlangan', 'Завершено'), formatNumber(d.completedOrders)],
        [tr('Bekor qilingan', 'Отменено'), `${formatNumber(d.cancelledOrders)} (${formatNumber(d.cancellationRate)}%)`],
        [tr('O‘rtacha chek', 'Средний чек'), money(d.avgOrderValue)],
        [tr('Sotilgan birlik', 'Продано штук'), formatNumber(d.totalUnitsSold)],
        [tr('Jami mijozlar', 'Всего клиентов'), formatNumber(d.totalCustomers)],
        [tr('Yangi mijozlar', 'Новые клиенты'), formatNumber(d.newCustomers)],
      ]);
      if (d.topProduct || d.topRegion || d.topPaymentMethod) {
        y = pdfSectionTitle(doc, 14, y + 4, tr('Top ko‘rsatkichlar', 'Топ-показатели'));
        const rows = [];
        if (d.topProduct) rows.push([tr('Top mahsulot', 'Топ товар'), d.topProduct.name, money(d.topProduct.revenue)]);
        if (d.topRegion) rows.push([tr('Top hudud', 'Топ регион'), d.topRegion.label, money(d.topRegion.revenue)]);
        if (d.topPaymentMethod) rows.push([tr('Top to‘lov usuli', 'Топ способ оплаты'), d.topPaymentMethod.label, money(d.topPaymentMethod.revenue)]);
        doc.autoTable({ startY: y + 2, head: [[tr('Ko‘rsatkich', 'Показатель'), tr('Nomi', 'Название'), tr('Summasi', 'Сумма')]], body: rows, styles: { fontSize: 8 }, headStyles: { fillColor: [59, 130, 246] }, margin: { left: 14, right: 14 } });
      }
      doc.save(pdfFilenameFor(tr('Umumiy_Hisobot', 'Obshiy_Otchet'), d.dateFrom, d.dateTo));
    }

    function exportSalesPdf() {
      if (!reportSalesData) { pdfNoDataYetToast(); return; }
      if (!reportPdfAvailable()) { pdfLibMissingAlert(); return; }
      const d = reportSalesData;
      const { doc, pageW, y: y0 } = newReportPdfDoc(tr('Savdo hisoboti', 'Отчёт по продажам'), reportsPeriodLabel());
      let y = pdfKpiGrid(doc, 14, y0 + 2, pageW - 28, [
        [tr('Jami savdo', 'Продажи'), money(d.totalSales)],
        [tr('Buyurtmalar', 'Заказы'), formatNumber(d.totalOrders)],
      ]);
      if (d.byRegion.length) {
        y = pdfEnsureSpace(doc, y, d.byRegion.length * 6.2 + 10);
        y = pdfSectionTitle(doc, 14, y + 2, tr('Hududlar bo‘yicha', 'По регионам'));
        y = drawPdfRankingBars(doc, 14, y + 3, pageW - 28, d.byRegion.slice(0, 10).map((r) => ({ label: r.regionLabel, value: r.salesAmount, displayValue: money(r.salesAmount) })));
      }
      if (d.byPaymentMethod.length) {
        y = pdfEnsureSpace(doc, y, 30);
        y = pdfSectionTitle(doc, 14, y + 4, tr('To‘lov turi bo‘yicha', 'По способам оплаты'));
        doc.autoTable({ startY: y + 2, head: [[tr('Usul', 'Способ'), tr('Summasi', 'Сумма'), tr('Buyurtma', 'Заказы'), tr('Ulush', 'Доля')]], body: d.byPaymentMethod.map((p) => [p.label, money(p.salesAmount), formatNumber(p.orderCount), `${formatNumber(p.sharePercent)}%`]), styles: { fontSize: 8 }, headStyles: { fillColor: [59, 130, 246] }, margin: { left: 14, right: 14 } });
        y = doc.lastAutoTable.finalY + 6;
      }
      if (d.byProduct.length) {
        y = pdfEnsureSpace(doc, y, 20);
        y = pdfSectionTitle(doc, 14, y, tr('Mahsulotlar bo‘yicha', 'По товарам'));
        doc.autoTable({ startY: y + 2, head: [[tr('Mahsulot', 'Товар'), tr('Dona', 'Шт'), tr('Buyurtma', 'Заказы'), tr('Tushum', 'Выручка')]], body: d.byProduct.slice(0, 50).map((p) => [p.name, formatNumber(p.unitsSold), formatNumber(p.orderCount), money(p.revenue)]), styles: { fontSize: 8 }, headStyles: { fillColor: [59, 130, 246] }, margin: { left: 14, right: 14 } });
      }
      doc.save(pdfFilenameFor(tr('Savdo_Hisoboti', 'Otchet_Prodazh'), d.dateFrom, d.dateTo));
    }

    function exportCustomerPdf() {
      if (!reportCustomerData) { pdfNoDataYetToast(); return; }
      if (!reportPdfAvailable()) { pdfLibMissingAlert(); return; }
      const d = reportCustomerData;
      const { doc, pageW, y: y0 } = newReportPdfDoc(tr('Mijozlar hisoboti', 'Отчёт по клиентам'), reportsPeriodLabel());
      let y = y0;
      if (d.kpi) {
        y = pdfKpiGrid(doc, 14, y0 + 2, pageW - 28, [
          [tr('Jami mijozlar', 'Всего клиентов'), formatNumber(d.kpi.totalCustomers)],
          [tr('Yangi mijozlar', 'Новые клиенты'), formatNumber(d.kpi.newCustomers)],
          [tr('Qayta xarid', 'Повторные'), formatNumber(d.kpi.repeatCustomers)],
          [tr('O‘rtacha xarajat', 'Средние траты'), money(d.kpi.avgCustomerSpend)],
        ]);
      }
      y = pdfSectionTitle(doc, 14, y + 2, `${tr('Mijozlar ro‘yxati', 'Список клиентов')} (${d.page}/${d.totalPages})`);
      doc.autoTable({
        startY: y + 2,
        head: [[tr('Ism', 'Имя'), tr('Telefon', 'Телефон'), tr('Buyurtma', 'Заказы'), tr('Xarajat', 'Траты'), tr('Oxirgi', 'Последний')]],
        body: (d.customers || []).map((c) => [c.name, c.phone || '-', formatNumber(c.successfulOrders), money(c.totalSpent), c.lastOrderAt ? String(c.lastOrderAt).slice(0, 10) : '-']),
        styles: { fontSize: 7.5 }, headStyles: { fillColor: [59, 130, 246] }, margin: { left: 14, right: 14 },
      });
      doc.save(pdfFilenameFor(tr('Mijozlar_Hisoboti', 'Otchet_Klientov'), d.dateFrom, d.dateTo));
    }

    function exportProductPdf() {
      if (!reportProductData) { pdfNoDataYetToast(); return; }
      if (!reportPdfAvailable()) { pdfLibMissingAlert(); return; }
      const d = reportProductData;
      const { doc, y: y0 } = newReportPdfDoc(tr('Mahsulotlar hisoboti', 'Отчёт по товарам'), reportsPeriodLabel());
      const viewLabel = (REPORT_PRODUCT_VIEWS.find(([k]) => k === d.view) || [null, () => d.view])[1]();
      let y = pdfSectionTitle(doc, 14, y0, `${tr('Ko‘rinish', 'Вид')}: ${viewLabel}`);
      doc.autoTable({
        startY: y + 2,
        head: [[tr('Mahsulot', 'Товар'), tr('Dona', 'Шт'), tr('Buyurtma', 'Заказы'), tr('Tushum', 'Выручка'), tr('Qoldiq', 'Остаток')]],
        body: (d.products || []).map((p) => [p.name, formatNumber(p.unitsSold), formatNumber(p.orderCount), money(p.revenue), p.currentStock === null ? '-' : formatNumber(p.currentStock)]),
        styles: { fontSize: 7.5 }, headStyles: { fillColor: [59, 130, 246] }, margin: { left: 14, right: 14 },
      });
      doc.save(pdfFilenameFor(tr('Mahsulotlar_Hisoboti', 'Otchet_Tovarov'), d.dateFrom, d.dateTo));
    }

    // ---- Qo'llab-quvvatlash sahifasi (POLISH ROUND 1-bosqich, 1-3-band) ----
    // Admin va oddiy user bitta activePage='SUPPORT' orqali keladi, lekin
    // roliga qarab ikki xil tarkib ko'radi — mantiq (state/API) o'zgarishsiz,
    // faqat modal->page chrome almashtirildi.
    function renderSupportPage(container) {
      const isAdminView = isAdminMode && isUserAnAdmin;
      if (isAdminView) {
        const openTicket = adminSupportSelectedTicketId ? adminSupportTickets.find(t => t.id === adminSupportSelectedTicketId) : null;
        const onBack = openTicket ? 'backToAdminSupportUserTickets()' : (adminSupportSelectedUser ? 'backToAdminSupportUsers()' : 'closePage()');
        renderPageShell(container, tr("Qo'llab-quvvatlash", 'Поддержка'), renderAdminSupportBodyHtml(), { onBack });
      } else {
        const onBack = openSupportTicketId ? 'backToMySupportList()' : 'closePage()';
        renderPageShell(container, tr("Qo'llab-quvvatlash", 'Поддержка'), renderUserSupportBodyHtml(), { onBack });
      }
    }

    function renderUserSupportBodyHtml() {
      const openTicket = openSupportTicketId ? supportTickets.find(t => t.id === openSupportTicketId) : null;
      return `
        <div class="fc-card space-y-3 text-xs">
          ${openTicket ? `
            <div class="flex items-center justify-between border-b pb-2">
              <h3 class="font-bold text-sm text-gray-900">💬 ${openTicket.orderId ? `#${openTicket.orderId}` : tr('Murojaat', 'Обращение')}</h3>
              <span class="fc-badge ${openTicket.status === 'CLOSED' ? 'fc-badge-muted' : (openTicket.status === 'OPEN' ? 'fc-badge-warning' : 'fc-badge-success')}">${openTicket.status === 'CLOSED' ? tr('Tugallangan', 'Завершено') : (openTicket.status === 'OPEN' ? tr('Yangi', 'Новое') : tr('Javob berilgan', 'Отвечено'))}</span>
            </div>
            <div>
              ${supportMessagesLoading ? `<p class="text-center text-gray-400 py-2">${tr('Yuklanmoqda...', 'Загрузка...')}</p>` : renderSupportThreadHtml(supportMessages, false)}
            </div>
            ${openTicket.status !== 'CLOSED' ? `
              ${renderSupportReplyBarHtml()}
              <textarea id="sup-chat-message" rows="2" placeholder="${tr('Xabar yozing...', 'Напишите сообщение...')}" class="w-full p-2.5 border rounded-xl"></textarea>
              <div class="flex gap-2">
                <button onclick="submitSupportComposer()" ${supportSendingMessage ? 'disabled' : ''} class="fc-btn fc-btn-primary flex-1">${supportSendingMessage ? tr('Yuborilmoqda...', 'Отправка...') : '✅ ' + tr('Yuborish', 'Отправить')}</button>
                <button onclick="closeSupportTicket(${openTicket.id})" class="fc-btn fc-btn-secondary">${tr('Tugatish', 'Завершить')}</button>
              </div>
            ` : `<p class="text-center text-gray-400 py-2">${tr('Bu murojaat tugallangan.', 'Это обращение завершено.')}</p>`}
          ` : `
            ${supportTicketOrderId ? `<p class="text-[10px] text-gray-500">${tr('Buyurtma', 'Заказ')} #${supportTicketOrderId} ${tr('bo‘yicha murojaat', 'по этому заказу')}</p>` : ''}
            <div>
              <label class="font-bold text-gray-600">${tr('Murojaatingiz', 'Ваше обращение')}</label>
              <textarea id="sup-message" rows="4" placeholder="${tr('Savolingiz yoki muammoingizni yozing...', 'Опишите ваш вопрос или проблему...')}" class="w-full mt-1 p-2.5 border rounded-xl"></textarea>
              <button onclick="submitSupportComposer()" ${supportSendingMessage ? 'disabled' : ''} class="fc-btn fc-btn-primary w-full mt-2">${supportSendingMessage ? tr('Yuborilmoqda...', 'Отправка...') : '✅ ' + tr('Yuborish', 'Отправить')}</button>
            </div>
            ${supportTicketsLoading ? `<p class="text-center text-gray-400 py-2">${tr('Yuklanmoqda...', 'Загрузка...')}</p>` : ''}
            ${(!supportTicketsLoading && !supportTickets.length) ? `
              <div class="fc-empty-state">
                <i data-lucide="message-circle" class="w-8 h-8"></i>
                <p>${tr('Hali murojaatlar yo‘q.', 'Пока нет обращений.')}</p>
              </div>
            ` : ''}
            ${(!supportTicketsLoading && supportTickets.length) ? `
              <div class="border-t pt-2 space-y-2">
                <p class="font-bold text-gray-600">${tr('Oldingi murojaatlar', 'Предыдущие обращения')}</p>
                ${supportTickets.map(t => `
                  <div class="bg-gray-50 border rounded-xl p-2.5 space-y-1 cursor-pointer" onclick="openMySupportChat(${t.id})">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] text-gray-400">${t.orderId ? `#${t.orderId} · ` : ''}${new Date(t.lastMessage?.createdAt || t.createdAt).toLocaleString()}</span>
                      <span class="fc-badge ${t.status === 'CLOSED' ? 'fc-badge-muted' : (t.status === 'OPEN' ? 'fc-badge-warning' : 'fc-badge-success')}">${t.status === 'CLOSED' ? tr('Tugallangan', 'Завершено') : (t.status === 'OPEN' ? tr('Yangi', 'Новое') : tr('Javob berilgan', 'Отвечено'))}</span>
                    </div>
                    <p>${escapeHtml((t.lastMessage?.body || '').slice(0, 80))}</p>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          `}
        </div>
      `;
    }

    // 3-band: user card — Ism Familiya / Telefon • ID (2-qatorli), aniq ajralgan,
    // yangi xabar bo'lsa aniq indikator. Ism/telefon usersSummary'dan (agar
    // yuklangan bo'lsa), bo'lmasa faqat ID ko'rsatiladi (fallback).
    function supportUserCardInfo(tgId) {
      const u = usersSummary.find(x => String(x.tgId) === String(tgId));
      const name = (u?.userName && String(u.userName) !== String(tgId)) ? u.userName : tr('Noma’lum foydalanuvchi', 'Неизвестный пользователь');
      return { name, phone: u?.phone || null, tgId };
    }

    function renderAdminSupportBodyHtml() {
      const grouped = groupAdminSupportTicketsByUser();
      const selectedUserTickets = adminSupportSelectedUser ? adminSupportTickets.filter(t => t.tgId === adminSupportSelectedUser) : [];
      const openTicket = adminSupportSelectedTicketId ? adminSupportTickets.find(t => t.id === adminSupportSelectedTicketId) : null;
      return `
        <div class="space-y-2 text-xs">
          ${openTicket ? `
            <div class="fc-card space-y-2">
              <div class="flex items-center justify-between border-b pb-2">
                <h3 class="font-bold text-sm text-gray-900">${openTicket.orderId ? `#${openTicket.orderId} · ` : ''}${escapeHtml(supportUserCardInfo(openTicket.tgId).name)}</h3>
                <span class="fc-badge ${openTicket.status === 'CLOSED' ? 'fc-badge-muted' : (openTicket.status === 'OPEN' ? 'fc-badge-warning' : 'fc-badge-success')}">${openTicket.status === 'CLOSED' ? tr('Tugallangan', 'Завершено') : (openTicket.status === 'OPEN' ? tr('Yangi', 'Новое') : tr('Javob berilgan', 'Отвечено'))}</span>
              </div>
              <div>
                ${supportMessagesLoading ? `<p class="text-center text-gray-400 py-2">${tr('Yuklanmoqda...', 'Загрузка...')}</p>` : renderSupportThreadHtml(supportMessages, true)}
              </div>
              ${openTicket.status !== 'CLOSED' ? `
                ${renderSupportReplyBarHtml()}
                <textarea id="sup-admin-message" rows="2" placeholder="${tr('Javob yozing...', 'Напишите ответ...')}" class="w-full p-2.5 border rounded-xl"></textarea>
                <button onclick="submitAdminSupportReply()" ${supportSendingMessage ? 'disabled' : ''} class="fc-btn fc-btn-primary w-full">${supportSendingMessage ? tr('Yuborilmoqda...', 'Отправка...') : '✅ ' + tr('Yuborish', 'Отправить')}</button>
              ` : `<p class="text-center text-gray-400 py-2">${tr('Mijoz bu murojaatni tugatgan.', 'Клиент завершил это обращение.')}</p>`}
            </div>
          ` : adminSupportSelectedUser ? `
            ${(() => { const info = supportUserCardInfo(adminSupportSelectedUser); return `
              <div class="fc-card">
                <p class="font-bold text-sm text-gray-900">${escapeHtml(info.name)}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">${info.phone ? `${escapeHtml(info.phone)} • ` : ''}ID ${escapeHtml(info.tgId)}</p>
              </div>
            `; })()}
            ${selectedUserTickets.map(t => `
              <div class="fc-card cursor-pointer flex items-center justify-between" onclick="openAdminSupportChat(${t.id})">
                <div>
                  <span class="font-bold">${t.orderId ? `📦 #${t.orderId}` : tr('Umumiy', 'Общее')}</span>
                  <p class="text-[10px] text-gray-400">${new Date(t.lastMessage?.createdAt || t.createdAt).toLocaleString()}</p>
                  <p>${escapeHtml((t.lastMessage?.body || '').slice(0, 80))}</p>
                </div>
                <span class="fc-badge ${t.status === 'CLOSED' ? 'fc-badge-muted' : (t.status === 'OPEN' ? 'fc-badge-warning' : 'fc-badge-success')}">${t.status === 'CLOSED' ? tr('Tugallangan', 'Завершено') : (t.status === 'OPEN' ? tr('Yangi', 'Новое') : tr('Javob berilgan', 'Отвечено'))}${supportNeedsAttention(t) ? ' •' : ''}</span>
              </div>
            `).join('')}
          ` : `
            ${adminSupportTicketsLoading ? `<p class="text-center text-gray-400 py-4">${tr('Yuklanmoqda...', 'Загрузка...')}</p>` : ''}
            ${(!adminSupportTicketsLoading && !grouped.length) ? `
              <div class="fc-empty-state">
                <i data-lucide="inbox" class="w-8 h-8"></i>
                <p>${tr('Murojaatlar yo‘q', 'Обращений нет')}</p>
              </div>
            ` : ''}
            ${grouped.map(g => {
              const info = supportUserCardInfo(g.tgId);
              const unread = g.needsAttention || g.hasOpen;
              return `
              <div class="fc-card cursor-pointer flex items-center justify-between gap-2 ${unread ? 'fc-border-warning' : ''}" onclick="selectAdminSupportUser('${g.tgId}')">
                <div class="min-w-0">
                  <p class="font-bold text-gray-900 truncate">${escapeHtml(info.name)}</p>
                  <p class="text-[10px] text-gray-500">${info.phone ? `${escapeHtml(info.phone)} • ` : ''}ID ${escapeHtml(info.tgId)}</p>
                  <p class="text-[10px] text-gray-400 mt-0.5">${g.tickets.length} ${tr('ta murojaat', 'обращений')}</p>
                </div>
                ${unread ? `<span class="fc-badge fc-badge-warning shrink-0">${tr('Yangi', 'Новое')}</span>` : ''}
              </div>
            `; }).join('')}
          `}
        </div>
      `;
    }

    // ---- ROUND14: Huquqiy hujjatlar ---------------------------------------
    function legalDocTitle(doc) {
      if (!doc) return '';
      return uiLang === 'ru' ? (doc.titleRu || doc.titleUz || doc.type) : (doc.titleUz || doc.titleRu || doc.type);
    }
    function legalDocContent(doc) {
      if (!doc) return '';
      return uiLang === 'ru' ? (doc.contentRu || doc.contentUz || '') : (doc.contentUz || doc.contentRu || '');
    }
    function enabledLegalDocuments() {
      return (legalDocuments || []).filter(doc => doc?.enabled === true);
    }
    function openLegalSettingsPage() {
      legalDraft = JSON.parse(JSON.stringify(legalDocuments || []));
      openPage('LEGAL_SETTINGS');
    }
    function setLegalDocumentEnabled(type, enabled) {
      const doc = (legalDraft || []).find(d => d.type === type);
      if (doc) doc.enabled = !!enabled;
      render();
    }
    function setLegalDocumentContent(type, lang, value) {
      const doc = (legalDraft || []).find(d => d.type === type);
      if (!doc) return;
      if (lang === 'ru') doc.contentRu = String(value ?? ''); else doc.contentUz = String(value ?? '');
    }
    function legalDocumentCardHtml(doc) {
      const enabled = doc?.enabled === true;
      return `<section class="fc-legal-doc-card ${enabled ? 'is-enabled' : ''}">
        <div class="fc-legal-doc-head">
          <span class="fc-legal-doc-icon"><i data-lucide="${doc.type === 'PRIVACY' ? 'shield-check' : 'file-signature'}" class="w-5 h-5"></i></span>
          <div class="min-w-0"><b>${escapeHtml(legalDocTitle(doc))}</b><small>${tr(`Versiya ${Number(doc.version)||1}`, `Версия ${Number(doc.version)||1}`)}</small></div>
          <label class="fc-toggle"><input type="checkbox" ${enabled ? 'checked' : ''} onchange="setLegalDocumentEnabled('${doc.type}',this.checked)"><span class="fc-toggle-track"></span></label>
        </div>
        <div class="fc-legal-doc-state ${enabled ? 'is-on' : ''}"><i data-lucide="${enabled ? 'eye' : 'eye-off'}" class="w-3.5 h-3.5"></i>${enabled ? tr('Ro‘yxatdan o‘tishda foydalanuvchiga ko‘rinadi va rozilik majburiy.','Показывается при регистрации, согласие обязательно.') : tr('O‘chirilgan — foydalanuvchiga ko‘rinmaydi.','Выключено — пользователю не показывается.')}</div>
        <details class="fc-legal-editor" open>
          <summary>${tr('O‘zbekcha matnni tahrirlash','Редактировать узбекский текст')}<i data-lucide="chevron-down" class="w-4 h-4"></i></summary>
          <textarea oninput="setLegalDocumentContent('${doc.type}','uz',this.value)" spellcheck="false">${escapeHtml(doc.contentUz || '')}</textarea>
        </details>
        <details class="fc-legal-editor">
          <summary>${tr('Ruscha matnni tahrirlash','Редактировать русский текст')}<i data-lucide="chevron-down" class="w-4 h-4"></i></summary>
          <textarea oninput="setLegalDocumentContent('${doc.type}','ru',this.value)" spellcheck="false">${escapeHtml(doc.contentRu || '')}</textarea>
        </details>
      </section>`;
    }
    function renderLegalSettingsPage(container) {
      if (!legalDraft) legalDraft = JSON.parse(JSON.stringify(legalDocuments || []));
      const docs = legalDraft || [];
      const body = `<div class="fc-legal-settings">
        <div class="fc-legal-template-warning">
          <span><i data-lucide="scale" class="w-5 h-5"></i></span>
          <div><b>${tr('Umumiy huquqiy shablon','Общий юридический шаблон')}</b><p>${tr("UStorE amaldagi O‘zbekiston qonunchiligiga tayangan umumiy shablonni beradi. Xohlasangiz shu holicha yoqing, xohlasangiz do‘koningizga moslab tahrirlang. Bu individual yuridik xulosa emas; maxsus faoliyat yoki tovarlar bo‘lsa moslashtirish tavsiya etiladi.", "UStorE предоставляет общий шаблон на основе действующего законодательства Узбекистана. Можно включить его как есть или адаптировать под магазин. Это не индивидуальное юридическое заключение; для специальных видов деятельности рекомендуется адаптация.")}</p></div>
        </div>
        <div class="fc-legal-doc-list">${docs.map(legalDocumentCardHtml).join('')}</div>
        <div class="fc-legal-savebar"><button type="button" onclick="saveLegalSettings()" class="fc-btn fc-btn-primary"><i data-lucide="save" class="w-4 h-4"></i>${tr('Saqlash','Сохранить')}</button></div>
      </div>`;
      renderPageShell(container, tr('Huquqiy hujjatlar','Правовые документы'), body, { onBack: "legalDraft=null;openPage('SETTINGS')" });
    }
    async function saveLegalSettings() {
      const docs = (legalDraft || []).map(d => ({ type: d.type, enabled: !!d.enabled, contentUz: String(d.contentUz || '').trim(), contentRu: String(d.contentRu || '').trim() }));
      for (const d of docs) {
        if (d.contentUz.length < 200) return alert(tr('Har bir hujjatning o‘zbekcha matni yetarlicha to‘liq bo‘lishi kerak.','Узбекский текст каждого документа должен быть заполнен.'));
      }
      showActionToast(tr('Huquqiy hujjatlar saqlanmoqda...','Сохранение правовых документов...'),'saving');
      try {
        const result = await callApi('set_legal_documents', { documents: docs });
        legalDocuments = Array.isArray(result.legalDocuments) ? result.legalDocuments : legalDocuments;
        legalDraft = JSON.parse(JSON.stringify(legalDocuments));
        showActionToast(tr('Huquqiy hujjatlar saqlandi','Правовые документы сохранены'),'success',1600);
        render();
      } catch (e) {
        console.error(e);
        showActionToast(tr('Hujjatlar saqlanmadi','Документы не сохранены'),'error',1800);
        alert(tr('Saqlashda xatolik: ','Ошибка сохранения: ') + (e.message || e));
      }
    }
    function renderRegistrationLegalConsentsHtml() {
      // Oddiy profil tahririda avval qabul qilingan hujjatlarni qayta-qayta
      // tasdiqlatmaymiz. Yangi user yoki yangi versiya chiqqandagina ko'rsatamiz.
      if (registeredUser && !legalConsentRequired) return '';
      const docs = enabledLegalDocuments();
      if (!docs.length) return '';
      return `<div class="fc-reg-legal-wrap">
        <div class="fc-reg-legal-title"><i data-lucide="shield-check" class="w-4 h-4"></i><span>${tr('Davom etish uchun hujjatlarni o‘qing va tasdiqlang','Прочитайте и примите документы для продолжения')}</span></div>
        ${docs.map(doc => `<div class="fc-reg-legal-item"><label><input id="reg-legal-${doc.type}" type="checkbox"><span>${tr('Roziman:','Согласен:')} <b>${escapeHtml(legalDocTitle(doc))}</b></span></label><details><summary>${tr('O‘qish','Прочитать')} · v${Number(doc.version)||1}</summary><div class="fc-reg-legal-text">${escapeHtml(legalDocContent(doc))}</div></details></div>`).join('')}
      </div>`;
    }

    // ---- Do'kon sozlamalari sahifasi (POLISH ROUND 1-bosqich, 5/6-band) ----
    // Ichidagi 3 bo'lim (Buyurtma ma'lumotlari/Yetkazib berish/Dizayn) hozirgidek
    // modal bo'lib ochiladi (murakkab mavjud mantiqqa tegilmadi) — yopilganda
    // ostidagi shu sahifa qayta ko'rinadi. Bot /start endi shu yerda, alohida
    // qatordan boshqa joyga ko'chirilmagan.
    function renderSettingsPage(container) {
      const body = `
        <div class="space-y-2">
          <div class="fc-card space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0"><b class="text-xs">${tr("Buyurtmalarni vaqtincha qabul qilmaslik", "Временно не принимать заказы")}</b><p class="text-[10px] text-gray-400 mt-0.5">${tr("Katalog ko'rinishda qoladi, faqat yangi buyurtma berish vaqtincha to'xtatiladi.", "Каталог остаётся видимым, приостанавливается только оформление новых заказов.")}</p></div>
              <span class="fc-toggle shrink-0"><input type="checkbox" ${ordersPaused ? 'checked' : ''} onchange="toggleOrdersPaused(this.checked)" ${ordersPausedSaving ? 'disabled' : ''}><span class="fc-toggle-track"></span></span>
            </div>
            ${ordersPaused ? `<textarea id="orders-paused-note" rows="2" placeholder="${tr('Ixtiyoriy izoh, masalan: Bugun inventarizatsiya sababli buyurtmalar qabul qilinmaydi.', 'Необязательный комментарий, например: Сегодня заказы не принимаются из-за инвентаризации.')}" class="w-full p-2 border rounded-xl text-xs" onchange="saveOrdersPausedNote(this.value)">${escapeHtml(ordersPausedNote)}</textarea>` : ''}
          </div>
          <div class="fc-card space-y-2">
            <b class="text-xs">${tr("Mijoz qachongacha bekor qila oladi", "До какого момента клиент может отменить заказ")}</b>
            <div class="fc-tabs">
              <button type="button" onclick="saveOrderPolicies({customerCancelCutoff:'NEW_ONLY'})" class="fc-tab ${customerCancelCutoff === 'NEW_ONLY' ? 'fc-tab-active' : ''}">${tr('Faqat yangi', 'Только новый')}</button>
              <button type="button" onclick="saveOrderPolicies({customerCancelCutoff:'BEFORE_SHIPPED'})" class="fc-tab ${customerCancelCutoff === 'BEFORE_SHIPPED' ? 'fc-tab-active' : ''}">${tr("Jo'natilgunga qadar", 'До отправки')}</button>
              <button type="button" onclick="saveOrderPolicies({customerCancelCutoff:'ANY_NON_TERMINAL'})" class="fc-tab ${customerCancelCutoff === 'ANY_NON_TERMINAL' ? 'fc-tab-active' : ''}">${tr("Yetkazilgunga qadar", 'До доставки')}</button>
            </div>
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-bold text-gray-600">${tr("Qaytarish/muammo murojaatini yoqish", "Разрешить обращения по возврату")}</span>
              <span class="fc-toggle shrink-0"><input type="checkbox" ${returnRequestsEnabled ? 'checked' : ''} onchange="saveOrderPolicies({returnRequestsEnabled:this.checked})" ${orderPoliciesSaving ? 'disabled' : ''}><span class="fc-toggle-track"></span></span>
            </div>
          </div>
          <button type="button" onclick="openDeliverySettingsPage()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="truck" class="w-4 h-4"></i>${tr("Yetkazib berish parametrlari", "Параметры доставки")}</span><span>›</span></button>
          <button type="button" onclick="openPaymentSettingsPage()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="credit-card" class="w-4 h-4"></i>${tr("To'lov parametrlari", "Параметры оплаты")}</span><span>›</span></button>
          <button type="button" onclick="openLegalSettingsPage()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="file-lock-2" class="w-4 h-4"></i>${tr("Huquqiy hujjatlar", "Правовые документы")}</span><span>›</span></button>
          <button type="button" onclick="openDesignSettings()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="palette" class="w-4 h-4"></i>${tr("Dizayn", "Дизайн")}</span><span>›</span></button>
          ${(isSuperAdmin && isAdminMode) ? `
            <button type="button" onclick="activePopupModal='START_MESSAGE'; render();" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="bot" class="w-4 h-4"></i>${tr("Bot /start xabari", "Сообщение бота /start")}</span><span>›</span></button>
          ` : ''}
          ${billzAccessGranted ? `
            <button type="button" onclick="openBillzSettings()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2">🔳 Billz</span><span>›</span></button>
          ` : ''}
          ${clickAccessGranted ? `
            <button type="button" onclick="openClickSettings()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2">💳 Click</span><span>›</span></button>
          ` : ''}
        </div>
      `;
      renderPageShell(container, tr("Do'kon sozlamalari", 'Настройки магазина'), body);
    }

    async function saveOrderPolicies(patch) {
      orderPoliciesSaving = true;
      render();
      try {
        await callApi('set_order_policies', patch);
        if (patch.customerCancelCutoff !== undefined) customerCancelCutoff = patch.customerCancelCutoff;
        if (patch.returnRequestsEnabled !== undefined) returnRequestsEnabled = patch.returnRequestsEnabled;
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      } finally {
        orderPoliciesSaving = false;
        render();
      }
    }

    async function toggleOrdersPaused(checked) {
      ordersPausedSaving = true;
      render();
      try {
        await callApi('set_orders_paused', { paused: checked, note: ordersPausedNote });
        ordersPaused = checked;
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      } finally {
        ordersPausedSaving = false;
        render();
      }
    }
    async function saveOrdersPausedNote(value) {
      ordersPausedNote = value;
      try { await callApi('set_orders_paused', { paused: true, note: value }); }
      catch (e) { showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500); }
    }

    // 10-band: ilgari popup modal bo'lgan sozlamalar endi to'liq sahifa —
    // renderPageShell orqali (mobil Telegram Mini App navigatsiyasiga mos,
    // orqaga/bosh sahifa tugmalari standart, modal fon-scroll muammosi yo'q).
    // Billz sozlamalari (BILLZ_SETTINGS) va Kam qolgan chegarasi
    // (LOW_STOCK_SETTINGS, Ombor sahifasidan ochiladi) ATAYLAB tegilmagan.
    function renderOrderInfoPage(container) {
      renderPageShell(container, tr("Buyurtma ma'lumotlari", "Информация о заказе"),
        `<p class="text-gray-400 text-center py-8 text-xs">${tr("Bu bo'lim tez orada qo'shiladi.", "Этот раздел скоро будет добавлен.")}</p>`);
    }

    function renderDesignSettingsPage(container) {
      const draft = designDraft || { themeId: 'minimal', colors: {} };
      const activeColors = designColorsWithDefaults(draft.colors, draft.themeId);
      const issues = findContrastIssues(draft.colors, draft.themeId);
      const themeDescriptions = {
        minimal: tr('Toza va sodda', 'Чистая и простая'),
        dark: tr('Premium navy — aniq ajraladigan', 'Премиальная navy — чёткие границы'),
        sport: tr('Energiya va dinamika', 'Энергия и динамика'),
        elegant: tr('Nafis va uslubli', 'Элегантная и стильная'),
        bright: tr('Yorqin va iliq', 'Яркая и тёплая'),
      };
      const colorIcons = {
        primary:'circle-dot', accent:'sparkles', button:'mouse-pointer-2', buttonText:'type', secondaryButton:'square',
        pageBg:'panel-top', panelBg:'layers-3', cardBg:'square', inputBg:'search',
        headerBg:'panel-top-open', headerText:'type', bottomNavBg:'panel-bottom', bottomNavText:'type', border:'box',
        text:'type', secondaryText:'text', mutedText:'type', success:'circle-check', warning:'triangle-alert', danger:'circle-x'
      };
      const body = `
        <div class="fc-design-page text-xs">
          <section class="fc-design-section">
            <div class="fc-design-section-title">
              <div><b>${tr("Tayyor mavzular", "Готовые темы")}</b><small>${tr("5 ta tayyor dizayn yoki avtomatik Dizayn yaratish", "5 готовых тем или автоматическое создание дизайна")}</small></div>
            </div>
            <div class="fc-theme-grid">
              ${Object.entries(DESIGN_THEMES).map(([id, theme]) => `
                <button type="button" onclick="pickDesignTheme('${id}')" class="fc-theme-card ${draft.themeId === id ? 'is-selected' : ''}" style="--theme-primary:${theme.colors.primary};--theme-accent:${theme.colors.accent};--theme-button:${theme.colors.button};--theme-page:${theme.colors.pageBg};--theme-card:${theme.colors.cardBg};--theme-text:${theme.colors.text};">
                  <div class="fc-theme-preview">
                    <div class="fc-theme-preview-top"><span></span><i></i></div>
                    <div class="fc-theme-preview-bar"><b></b><span></span><span></span></div>
                    <div class="fc-theme-preview-card"><em></em><div><i></i><i></i><i></i></div><strong></strong></div>
                  </div>
                  <div class="fc-theme-meta"><span class="fc-theme-dot"></span><div><b>${theme.label}</b><small>${themeDescriptions[id]}</small></div></div>
                  ${draft.themeId === id ? `<span class="fc-theme-check"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>` : ''}
                </button>
              `).join('')}
              <button type="button" onclick="generateDesignTheme()" class="fc-theme-card fc-theme-generator ${draft.themeId === 'generated' ? 'is-selected' : ''}" style="--theme-primary:${activeColors.primary};--theme-accent:${activeColors.accent};--theme-button:${activeColors.button};--theme-page:${activeColors.pageBg};--theme-card:${activeColors.cardBg};--theme-text:${activeColors.text};">
                <div class="fc-theme-preview fc-theme-generator-preview"><i data-lucide="sparkles" class="w-8 h-8"></i><span></span><span></span><span></span></div>
                <div class="fc-theme-meta"><span class="fc-theme-dot"></span><div><b>${tr('Dizayn yaratish','Создать дизайн')}</b><small>${tr('Ranglarni o‘zi uyg‘un tanlaydi','Автоматически подбирает гармоничные цвета')}</small></div></div>
                ${draft.themeId === 'generated' ? `<span class="fc-theme-check"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>` : ''}
              </button>
            </div>
            ${draft.themeId === 'generated' ? `<button type="button" onclick="generateDesignTheme()" class="fc-design-regenerate"><i data-lucide="refresh-cw" class="w-4 h-4"></i>${tr('Qayta yaratish','Создать другой вариант')}</button>` : ''}
          </section>

          <section class="fc-design-section fc-design-colors">
            <div class="fc-design-section-title"><div><b>${tr("Har bir qism rangini alohida tanlash", "Отдельный цвет для каждой части")}</b><small>${tr('Rang tanlagichdan foydalaning yoki HEX kodni kiriting', 'Используйте палитру или введите HEX-код')}</small></div></div>
            <div class="fc-design-color-list">
              ${DESIGN_COLOR_KEYS.map(key => `
                <label class="fc-design-color-row">
                  <span class="fc-design-color-icon"><i data-lucide="${colorIcons[key] || 'palette'}" class="w-4 h-4"></i></span>
                  <span class="fc-design-color-name">${DESIGN_COLOR_LABELS[key]}</span>
                  <span class="fc-design-color-value">
                    <input type="color" value="${activeColors[key]}" onchange="setDesignColor('${key}', this.value)" aria-label="${DESIGN_COLOR_LABELS[key]}">
                    <input class="fc-design-hex-input" type="text" value="${activeColors[key].toUpperCase()}" maxlength="7" spellcheck="false" onchange="setDesignColor('${key}', this.value)" onkeydown="if(event.key==='Enter'){this.blur()}" aria-label="${DESIGN_COLOR_LABELS[key]} HEX">
                  </span>
                </label>
              `).join('')}
            </div>
          </section>

          ${issues.length ? `
            <div class="fc-design-warning">
              <i data-lucide="triangle-alert" class="w-4 h-4"></i>
              <div><b>${tr("O'qilishi qiyin bo'lishi mumkin", 'Может быть трудно читать')}</b>${issues.map(i => `<small>${i.pair}: ${i.ratio.toFixed(1)}:1 · ${tr('kerak','нужно')} ${WCAG_AA_RATIO}:1</small>`).join('')}</div>
            </div>
          ` : `<div class="fc-design-ok"><i data-lucide="shield-check" class="w-4 h-4"></i><span>${tr('Asosiy kontrastlar o‘qishga mos','Основные контрасты подходят для чтения')}</span></div>`}

          <div class="fc-design-footer">
            <button onclick="closeDesignSettings()" class="fc-btn fc-btn-secondary">${tr("Bekor qilish", "Отмена")}</button>
            <button onclick="saveDesignSettings()" class="fc-btn fc-btn-primary"><i data-lucide="save" class="w-4 h-4"></i>${tr("Saqlash", "Сохранить")}</button>
          </div>
        </div>
      `;
      renderPageShell(container, tr("Do'kon dizayni", "Дизайн магазина"), body, { onBack: 'closeDesignSettings()' });
    }

    function renderDeliverySettingsPage(container) {
      if (!fulfillmentDraft) fulfillmentDraft = commerce.normalizeConfig(cloneData(fulfillmentConfig), TOP_LEVEL_REGION_IDS);
      fulfillmentSettingsSection = 'DELIVERY';
      const body = `
        <div class="space-y-3 text-xs">
          <p class="text-[10px] text-gray-500">${TOP_LEVEL_REGIONS.length} ${tr('ta top-level hudud mavjud ro‘yxatdan olindi', 'регионов взято из текущего списка')}</p>
          <div id="fulfillment-panel">${renderFulfillmentDeliveryPanel()}</div>
          <div class="grid grid-cols-2 gap-2 sticky bottom-0 fc-delivery-footer">
            <button onclick="saveFulfillmentSettings()" class="fc-btn fc-btn-primary"><i data-lucide="save" class="w-4 h-4"></i>${tr('Saqlash','Сохранить')}</button>
            <button onclick="closeFulfillmentSettingsPage()" class="fc-btn fc-btn-secondary">${tr('Bekor qilish','Отмена')}</button>
          </div>
        </div>
      `;
      renderPageShell(container, tr("Yetkazib berish parametrlari", "Параметры доставки"), body, { onBack: 'closeFulfillmentSettingsPage()' });
    }

    function renderPaymentSettingsPage(container) {
      if (!fulfillmentDraft) fulfillmentDraft = commerce.normalizeConfig(cloneData(fulfillmentConfig), TOP_LEVEL_REGION_IDS);
      fulfillmentSettingsSection = 'PAYMENTS';
      const body = `
        <div class="space-y-3 text-xs">
          <div id="fulfillment-panel">${renderFulfillmentPaymentsPanel()}</div>
          <div class="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
            <button onclick="saveFulfillmentSettings()" class="bg-blue-600 text-white font-black py-3 rounded-xl">✅ ${tr('Saqlash','Сохранить')}</button>
            <button onclick="closeFulfillmentSettingsPage()" class="bg-gray-100 text-gray-700 font-bold py-3 rounded-xl">${tr('Bekor qilish','Отмена')}</button>
          </div>
        </div>
      `;
      renderPageShell(container, tr("To'lov parametrlari", "Параметры оплаты"), body, { onBack: 'closeFulfillmentSettingsPage()' });
    }

    // 1. HOME TAB
    // Bosh sahifa — admin tanlagan (8 tagacha) kataloglar qatori, qidiruv
    // ostida/banner ustida. Bosilganda mavjud Kataloglar sahifasidagi
    // logikaning o'zi ishlatiladi (yangi ro'yxat/filtr yozilmagan).
    // Shop takomillashtirish, 3-band: rasmsiz/neutral, ixcham navigatsiya —
    // bosilganda ENDI joydan joyga o'tmaydi, shu bosh sahifadagi o'sha
    // kategoriya blokiga smooth-scroll qiladi (4-band: "Barchasini ko'rish"
    // esa haqiqatan Kataloglar sahifasiga o'tadi — ikkalasi boshqacha).
    function renderFeaturedCategoriesRowHtml() {
      const entries = featuredCategories.map(e => ({ e, c: categories.find(c => c.id === e.categoryId) })).filter(x => x.c);
      if (!entries.length) return '';
      return `<div class="fc-cat-nav-row">
        ${entries.map(({ c }) => `<button type="button" onclick="scrollToFeaturedCategoryBlock('${c.id}')" class="fc-cat-nav-pill">${escapeHtml(categoryName(c))}</button>`).join('')}
      </div>`;
    }
    function scrollToFeaturedCategoryBlock(catId) {
      const el = document.getElementById(`fc-home-cat-block-${catId}`);
      if (!el) return;
      const sticky = document.querySelector('.fc-home-sticky-bar');
      const offset = (sticky?.offsetHeight || 0) + 14;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    // 4-band: "Barchasini ko'rish" — Kataloglar bo'limiga o'tib, aynan shu
    // katalog ichiga kiradi (mavjud adminCatParentId mexanizmi qayta ishlatiladi).
    function openFeaturedCategoryAll(catId) {
      currentTab = 'categories'; adminCatParentId = catId; categoryPage = 1; render();
    }
    // 2/3-band: bosh sahifadagi "Kategoriya nomi + 6 tagacha mahsulot +
    // Barchasini ko'rish" bloklari — admin har kategoriya uchun tanlagan
    // productIds tartibida, mavjud renderProductCardHTML qayta ishlatiladi.
    function renderFeaturedCategoryBlocksHtml() {
      const entries = featuredCategories.map(e => ({ e, c: categories.find(c => c.id === e.categoryId) })).filter(x => x.c && x.e.productIds.length);
      if (!entries.length) return '';
      return entries.map(({ e, c }) => {
        const prods = e.productIds.map(pid => products.find(p => p.id === pid)).filter(p => p && productVisibleInCurrentMode(p));
        if (!prods.length) return '';
        return `<div id="fc-home-cat-block-${c.id}" class="space-y-2">
          <div class="fc-home-cat-block-header">
            <span class="fc-home-cat-block-title">${escapeHtml(categoryName(c))}</span>
            <button type="button" onclick="openFeaturedCategoryAll('${c.id}')" class="fc-home-cat-block-seeall">${tr("Barchasini ko'rish", 'Смотреть все')} →</button>
          </div>
          <div class="grid grid-cols-2 gap-3">${prods.map((p, idx) => renderProductCardHTML(p, idx, prods.length)).join('')}</div>
        </div>`;
      }).join('');
    }

    // 17-band: bosh sahifadagi banner strip — eng ko'pi bilan 3 ta (server
    // allaqachon shu chegarani qo'ygan), gorizontal scroll-snap bilan.
    // Shop takomillashtirish, 8-band: markaz-peek premium carousel + haqiqiy
    // cheksiz loop (oxiri->boshi va aksincha, klon-va-sakrash usuli — n>=2
    // bo'lsagina, 1 banner uchun loop shart emas).
    function renderBannerCarouselHtml() {
      if (!activeBanners.length) return '';
      const n = activeBanners.length;
      const looped = n >= 2;
      const cardHtml = (b, cloneTag) => `
        <button type="button" onclick="openBannerTarget('${b.id}')" class="fc-banner-card" style="background-image:url('${escapeHtml(b.imageUrl)}')" ${cloneTag ? `data-clone="${cloneTag}"` : ''}>
          ${b.mode === 'TEMPLATE' ? `<div class="fc-banner-overlay">
            ${b.title ? `<h3>${escapeHtml(b.title)}</h3>` : ''}
            ${b.subtitle ? `<p>${escapeHtml(b.subtitle)}</p>` : ''}
            ${b.ctaText ? `<span class="fc-banner-cta">${escapeHtml(b.ctaText)}</span>` : ''}
          </div>` : ''}
        </button>
      `;
      const items = looped
        ? cardHtml(activeBanners[n - 1], 'start') + activeBanners.map(b => cardHtml(b)).join('') + cardHtml(activeBanners[0], 'end')
        : activeBanners.map(b => cardHtml(b)).join('');
      return `<div class="fc-banner-strip" id="fc-banner-strip">${items}</div>`;
    }
    // Carousel'ning boshlang'ich holati + markazdagi kartani scale/opacity
    // bilan ajratish + klon chekkasiga yetilganda animatsiyasiz haqiqiy
    // banner'ga "sakrash" (foydalanuvchi bu sakrashni sezmaydi — chunki bu
    // chekkaga yetgandan keyin, ko'rinmas holatda amalga oshiriladi).
    function initBannerCarousel() {
      const strip = document.getElementById('fc-banner-strip');
      if (!strip) return;
      const cards = [...strip.children];
      if (!cards.length) return;
      const looped = activeBanners.length >= 2;
      const centerScrollTo = (card) => strip.scrollLeft = card.offsetLeft - (strip.clientWidth - card.clientWidth) / 2;
      centerScrollTo(cards[looped ? 1 : 0]);
      const updateActiveCard = () => {
        const center = strip.scrollLeft + strip.clientWidth / 2;
        let closest = cards[0], closestDist = Infinity;
        for (const card of cards) {
          const dist = Math.abs((card.offsetLeft + card.clientWidth / 2) - center);
          if (dist < closestDist) { closestDist = dist; closest = card; }
        }
        cards.forEach(c => c.classList.toggle('is-active', c === closest));
        return closest;
      };
      updateActiveCard();
      let scrollTimer = null;
      strip.addEventListener('scroll', () => {
        updateActiveCard();
        if (!looped) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const active = updateActiveCard();
          if (active.dataset.clone === 'start') centerScrollTo(cards[cards.length - 2]);
          else if (active.dataset.clone === 'end') centerScrollTo(cards[1]);
          updateActiveCard();
        }, 120);
      }, { passive: true });
    }

    // 18-band: bosh sahifadagi "e'tibor talab qiladi" markazi — admin 3-5
    // soniyada bugun nima qilish kerakligini tushunishi uchun. Faqat bir
    // marta yuklanadi (loadOrdersLazy va h.k. bilan bir xil naqsh) —
    // har renderHome() chaqirilganda qayta so'ralmaydi.
    let adminActionCenterLoaded = false;
    async function loadAdminActionCenterLazy(force = false) {
      if (adminActionCenterLoading || (adminActionCenterLoaded && !force)) return;
      adminActionCenterLoading = true;
      try {
        adminActionCenter = await callApi('get_admin_action_center', {});
        adminActionCenterLoaded = true;
      } catch (e) {
        console.error("Action-center yuklanmadi:", e);
      } finally {
        adminActionCenterLoading = false;
        if (currentTab === 'home' && isAdminMode && isUserAnAdmin) rerenderAdminActionCenter();
      }
    }
    function rerenderAdminActionCenter() {
      const el = document.getElementById('admin-action-center');
      if (el) { el.outerHTML = renderAdminActionCenterHtml(); if (window.lucide) lucide.createIcons(); }
    }
    function renderAdminActionCenterHtml() {
      const c = adminActionCenter;
      // c is null until the first loadAdminActionCenterLazy() response lands
      // (the fetch is only kicked off AFTER this HTML is first built, in
      // renderHome()) — must bail out to the spinner BEFORE touching c[...],
      // regardless of whether adminActionCenterLoading happens to be true
      // yet, or the very first render crashes with a null-dereference and
      // renderHome()'s whole container.innerHTML assignment never completes.
      if (!c) {
        return `<div id="admin-action-center" class="fc-empty-state compact"><div class="fc-spinner"></div></div>`;
      }
      const cards = [
        { key: 'newOrders', icon: 'package-plus', label: tr('Yangi buyurtma', 'Новых заказов'), onclick: "dashboardGoToOrders('NEW')" },
        { key: 'pendingReceipts', icon: 'receipt', label: tr('Chek tekshiruvi', 'Чеков на проверке'), onclick: "dashboardGoToOrders('ALL')" },
        { key: 'supportPending', icon: 'messages-square', label: tr('Support javobsiz', 'Обращений без ответа'), onclick: "openAdminSupportOrUserSupport()" },
      ].filter(card => Number(c[card.key]) > 0);
      // Shop takomillashtirish qo'shimchasi: e'tibor talab qiladigan narsa
      // bo'lmasa endi HECH NARSA ko'rsatilmaydi (avval "hozircha yo'q" degan
      // doimiy karta chiqardi — bo'sh joyni band qilib turardi).
      if (!cards.length) {
        return `<div id="admin-action-center"></div>`;
      }
      return `<div id="admin-action-center" class="fc-action-center-grid">
        ${cards.map(card => `<button type="button" onclick="${card.onclick}" class="fc-action-center-card"><span class="fc-action-center-count">${c[card.key]}</span><span class="fc-action-center-icon"><i data-lucide="${card.icon}" class="w-4 h-4"></i></span><span class="fc-action-center-label">${card.label}</span></button>`).join('')}
      </div>`;
    }

    // Shop takomillashtirish qo'shimchasi: bosh sahifada banner tagida
    // faol Aksiyalarni ko'rsatish (avval faqat Profil -> "Aksiyalar va
    // chegirmalar" ichida ko'rinardi, mijoz uni topolmasdi).
    function renderHomeBundlesSectionHtml() {
      const bundles = marketingCampaigns.filter(c => c.kind === 'BUNDLE');
      if (!bundles.length) return '';
      return `<div class="space-y-2" id="fc-home-bundles-section">
        <h3 class="text-sm font-bold px-0.5">${tr('Aksiyalar', 'Акции')}</h3>
        <div class="fc-home-bundles-row">
          ${bundles.map(b => `
            <button type="button" onclick="openCampaignDetail('BUNDLE','${b.id}')" class="fc-home-bundle-card">
              ${b.coverImageUrl ? `<img src="${escapeHtml(b.coverImageUrl)}" loading="lazy">` : `<div class="fc-home-bundle-card-noimg"><i data-lucide="package" class="w-6 h-6"></i></div>`}
              <div class="fc-home-bundle-card-body">
                <b>${escapeHtml(b.name)}</b>
                <span>${b.discountLabel || ''}</span>
              </div>
            </button>
          `).join('')}
        </div>
      </div>`;
    }

    function openBannerTarget(bannerId) {
      const b = activeBanners.find(x => String(x.id) === String(bannerId));
      if (!b) return;
      if (b.targetType === 'PRODUCT' && b.targetProductId) openProductDetailModal(b.targetProductId);
      else if (b.targetType === 'CATEGORY' && b.targetCategoryId) { currentTab = 'categories'; adminCatParentId = b.targetCategoryId; categoryPage = 1; render(); }
      else if (b.targetType === 'URL' && b.targetUrl) openSafeExternalUrl(b.targetUrl);
      else if (b.targetType === 'BUNDLE' && b.targetBundleId) openCampaignDetail('BUNDLE', b.targetBundleId);
      else if (b.targetType === 'PROMOTION' && b.targetPromotionId) openCampaignDetail('PROMOTION', b.targetPromotionId);
    }

    // ==================== AKSIYALAR VA CHEGIRMALAR (public campaign browsing) ====================
    function campaignDiscountLabel(discountType, discountValue) {
      return discountType === 'PERCENT' ? `-${discountValue}%` : `-${money(discountValue)}`;
    }
    let marketingCampaignsLoaded = false;
    // Bosh sahifadagi "Aksiyalar" bloki (banner tagida) VA Profil ->
    // Aksiyalar va chegirmalar sahifasi bir xil ro'yxatdan foydalanadi —
    // ikkalasi ham shu bitta yuklovchidan chaqiradi (ikki marta so'rov
    // yubormaslik uchun, "loaded" bayrog'i bilan).
    async function ensureMarketingCampaignsLoaded(onDone) {
      if (marketingCampaignsLoaded || marketingCampaignsLoading) return;
      marketingCampaignsLoading = true;
      try {
        const data = await callApi('get_marketing_campaigns', {});
        const bundles = (data.bundles || []).map(b => ({ kind: 'BUNDLE', id: b.id, name: b.name, coverImageUrl: b.coverImageUrl, discountLabel: money(b.bundlePrice) }));
        const promotions = (data.promotions || []).map(p => ({ kind: 'PROMOTION', id: p.id, name: p.name, coverImageUrl: null, discountLabel: campaignDiscountLabel(p.discountType, p.discountValue) }));
        marketingCampaigns = [...bundles, ...promotions];
        marketingCampaignsLoaded = true;
      } catch (e) { console.error(e); }
      finally { marketingCampaignsLoading = false; if (onDone) onDone(); }
    }
    function openCampaignsPage() {
      openPage('CAMPAIGNS', 'nav-profile');
      ensureMarketingCampaignsLoaded(() => { if (activePage === 'CAMPAIGNS') render(); });
    }
    function renderCampaignsPage(container) {
      const body = marketingCampaignsLoading && !marketingCampaigns.length
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`
        : marketingCampaigns.length ? `<div class="grid grid-cols-2 gap-3">${marketingCampaigns.map(c => `
          <button type="button" onclick="openCampaignDetail('${c.kind}','${c.id}')" class="fc-card text-left space-y-1.5 p-0 overflow-hidden">
            ${c.coverImageUrl ? `<img src="${escapeHtml(c.coverImageUrl)}" class="w-full h-24 object-cover">` : `<div class="w-full h-24 bg-gray-50 flex items-center justify-center"><i data-lucide="${c.kind === 'BUNDLE' ? 'package' : 'ticket-percent'}" class="w-6 h-6 text-gray-300"></i></div>`}
            <div class="p-2 pt-0.5">
              <b class="text-xs line-clamp-2">${escapeHtml(c.name)}</b>
              <p class="text-[10px] fc-text-danger font-bold mt-0.5">${c.discountLabel || ''}</p>
            </div>
          </button>
        `).join('')}</div>` : `<div class="fc-empty-state"><i data-lucide="gift" class="w-8 h-8"></i><p>${tr("Hozircha aksiya yo'q.", 'Пока нет акций.')}</p></div>`;
      renderPageShell(container, tr('Aksiyalar va chegirmalar', 'Акции и скидки'), body);
    }
    async function openCampaignDetail(kind, id) {
      campaignDetail = null;
      campaignMediaViewerIdx = 0;
      openPage('CAMPAIGN_DETAIL', 'nav-profile');
      campaignDetailLoading = true;
      try {
        const data = await callApi('get_campaign_detail', { kind, id });
        if (data.kind === 'BUNDLE' && data.bundle) {
          const b = data.bundle;
          campaignDetail = {
            kind: 'BUNDLE', id: b.id, name: b.name, description: b.description, coverImageUrl: b.coverImageUrl, endsAt: b.endsAt, code: null,
            bundlePrice: b.bundlePrice,
            discountLabel: `${money(b.bundlePrice)}${b.savings > 0 ? ` (${tr('tejaysiz', 'экономия')} ${money(b.savings)})` : ''}`,
            previewProducts: (b.resolvedItems || []).map(i => ({ id: i.productId, name: (uiLang === 'ru' && i.nameRu) ? i.nameRu : i.name, imageUrl: i.img })),
          };
        } else if (data.kind === 'PROMOTION' && data.promotion) {
          const p = data.promotion;
          campaignDetail = {
            name: p.name, description: null, coverImageUrl: null, endsAt: p.endsAt, code: p.code,
            discountLabel: campaignDiscountLabel(p.discountType, p.discountValue),
            previewProducts: (p.previewProducts || []).map(pr => ({ id: pr.id, name: (uiLang === 'ru' && pr.name_ru) ? pr.name_ru : pr.name, imageUrl: pr.img })),
          };
        } else {
          campaignDetail = null;
        }
      } catch (e) {
        campaignDetail = null;
      } finally {
        campaignDetailLoading = false;
        if (campaignDetail) render();
        else { showActionToast(tr("Aksiya topilmadi", 'Акция не найдена'), 'error', 1800); openCampaignsPage(); }
      }
    }
    function renderCampaignDetailPage(container) {
      if (campaignDetailLoading || !campaignDetail) {
        renderPageShell(container, tr('Aksiya', 'Акция'), `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`);
        return;
      }
      const c = campaignDetail;
      const products = c.previewProducts || [];
      const heroImage = c.coverImageUrl || products.find(p => p.imageUrl)?.imageUrl || '';
      const media = products.map(p => p.imageUrl).filter(Boolean);
      const countdown = c.endsAt ? `<span class="fc-campaign-chip"><i data-lucide="calendar-clock" class="w-3.5 h-3.5"></i>${tr('Tugaydi','Заканчивается')}: ${new Date(c.endsAt).toLocaleDateString()}</span>` : '';
      const codeBlock = c.code ? `<div class="fc-campaign-code-card"><div><small>${tr('Promo-kod','Промокод')}</small><b>${escapeHtml(c.code)}</b></div><button type="button" onclick="copyTextToClipboard('${escapeHtml(c.code)}')" class="fc-btn fc-btn-secondary"><i data-lucide="copy" class="w-3.5 h-3.5"></i>${tr('Nusxalash','Копировать')}</button></div>` : '';
      const mediaHtml = media.length > 1 ? `<div><div class="fc-campaign-section-head"><b>${tr('Mahsulotlar','Товары')}</b><span>${products.length} ${tr('ta','шт.')}</span></div><div class="fc-campaign-media-strip">${products.map(p => `<button type="button" onclick="openProductDetailModal('${p.id}')" class="fc-campaign-media-slide">${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" loading="lazy">` : `<span class="fc-campaign-media-placeholder"><i data-lucide="image" class="w-5 h-5"></i></span>`}<small>${escapeHtml(p.name)}</small></button>`).join('')}</div></div>` : '';
      const productsHtml = products.length ? `<div><div class="fc-campaign-section-head"><b>${tr('Aksiya tarkibi','Состав акции')}</b><span>${products.length} ${tr('mahsulot','товаров')}</span></div><div class="fc-campaign-products-grid">${products.map(p => `<button type="button" onclick="openProductDetailModal('${p.id}')" class="fc-campaign-product-card">${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" loading="lazy">` : `<span class="fc-campaign-product-placeholder"><i data-lucide="image" class="w-5 h-5"></i></span>`}<span>${escapeHtml(p.name)}</span></button>`).join('')}</div></div>` : '';
      const body = `<div class="fc-campaign-detail">
        <section class="fc-campaign-hero">${heroImage ? `<img src="${escapeHtml(heroImage)}" class="fc-campaign-hero-image" loading="lazy">` : ''}<div class="fc-campaign-hero-copy"><div class="fc-campaign-eyebrow">${c.kind === 'BUNDLE' ? tr('Maxsus aksiya','Специальная акция') : tr('Promo taklif','Промо предложение')}</div><h2>${escapeHtml(c.name)}</h2><div class="fc-campaign-price">${c.discountLabel || ''}</div>${countdown}</div></section>
        ${c.description ? `<div class="fc-card fc-campaign-description"><b>${tr('Aksiya haqida','Об акции')}</b><p>${escapeHtml(c.description)}</p></div>` : ''}
        ${codeBlock}${mediaHtml}${productsHtml}
        <div class="fc-campaign-sticky-action">${c.kind === 'BUNDLE' ? renderBundleAddToCartHtml(c) : `<button type="button" onclick="closePage(); currentTab='home';" class="fc-btn fc-btn-primary w-full">${tr("Katalogga o'tish", 'Перейти в каталог')}</button>`}</div>
      </div>`;
      renderPageShell(container, tr('Aksiya', 'Акция'), body);
    }

    function renderBundleAddToCartHtml(c) {
      const inCart = bundleCart[c.id];
      if (!inCart) {
        return `<button type="button" onclick="addBundleToCart('${c.id}')" class="fc-btn fc-btn-success w-full"><i data-lucide="shopping-cart" class="w-4 h-4"></i>${tr('Savatga qo\'shish', 'В корзину')}</button>`;
      }
      return `<div class="flex items-center justify-between gap-2 fc-card">
        <span class="text-xs font-bold">${tr("Savatda", 'В корзине')}</span>
        <div class="flex items-center gap-2">
          <button onclick="changeBundleCartQty('${c.id}',-1)" class="w-9 h-9 bg-gray-100 rounded-lg font-bold text-sm">-</button>
          <span class="font-bold text-sm w-5 text-center">${inCart.qty}</span>
          <button onclick="changeBundleCartQty('${c.id}',1)" ${inCart.qty >= 10 ? 'disabled' : ''} class="w-9 h-9 bg-blue-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm">+</button>
        </div>
      </div>`;
    }

    function renderHome(container) {
      const homeFilterActive = isCategoryFilterActive();
      container.innerHTML = `
        <div class="space-y-4">
          <div class="fc-home-sticky-bar space-y-2">
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input type="text" id="search-input" value="${escapeHtml(homeSearchQuery)}" oninput="handleSearchDebounced()" placeholder="${escapeHtml(searchPlaceholderText())}"
                  class="w-full bg-white pl-10 pr-4 py-3 rounded-2xl border border-gray-200 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <i data-lucide="search" class="w-5 h-5 text-gray-400 absolute left-3 top-3.5"></i>
              </div>
              <button onclick="openCategoryFilterModal()" title="${tr('Filtr','Фильтр')}" aria-pressed="${homeFilterActive ? 'true' : 'false'}" class="fc-filter-launch ${homeFilterActive ? 'is-active' : ''}">
                <i data-lucide="sliders-horizontal" class="w-4 h-4"></i>${homeFilterActive ? '<span class="fc-filter-active-dot"></span>' : ''}
              </button>
            </div>
            ${renderFeaturedCategoriesRowHtml()}
          </div>
          ${renderActiveFilterChipsHtml()}

          ${(isAdminMode && isUserAnAdmin) ? renderAdminActionCenterHtml() : ''}
          ${renderBannerCarouselHtml()}
          ${renderHomeBundlesSectionHtml()}

          <div id="products-grid" class="grid grid-cols-2 gap-3"></div>
          ${renderFeaturedCategoryBlocksHtml()}
        </div>
      `;
      if (isAdminMode && isUserAnAdmin) loadAdminActionCenterLazy();
      if (activeBanners.length) initBannerCarousel();
      ensureMarketingCampaignsLoaded(() => { if (currentTab === 'home') rerenderHomeBundlesSection(); });
      handleSearch();
    }
    function rerenderHomeBundlesSection() {
      const html = renderHomeBundlesSectionHtml();
      if (!html) return;
      const grid = document.getElementById('products-grid');
      if (!grid || document.getElementById('fc-home-bundles-section')) return;
      grid.insertAdjacentHTML('beforebegin', html);
      if (window.lucide) lucide.createIcons();
    }

    // Qidiruvni har harfda emas, 300ms kutib bir marta ishlatish (tezlik uchun)
    let searchDebounceTimer = null;
    function handleSearchDebounced() {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(handleSearch, 300);
    }

    function handleSearch() {
      const q = document.getElementById('search-input')?.value || '';
      // 23-band: qidiruv matni JS o'zgaruvchida saqlanadi — product detaildan
      // orqaga qaytilganda (yoki har qanday full render()da) input bo'sh
      // chizilib qolmasin (id="search-input"da value= yo'q edi, endi bor).
      homeSearchQuery = q;
      let filtered = searchProducts(q);

      if (currentTab === 'home' && !q.trim()) {
        filtered = filtered.filter(p => p.isFeatured === true);
      }
      if (currentTab === 'home') filtered = applyCategoryFilter(filtered);

      currentVisibleProductIds = filtered.map(p => p.id);

      const grid = document.getElementById('products-grid');
      if (!grid) return;

      if (filtered.length === 0) {
        // 21-band: qidiruv so'zi kiritilgan bo'lsa aniq "topilmadi" xabari,
        // aks holda (bosh sahifada hech narsa pin qilinmagan) eski xabar.
        const notFoundMsg = q.trim()
          ? `<div class="fc-empty-state col-span-2"><i data-lucide="search-x" class="w-8 h-8"></i><p>${tr('Mahsulot topilmadi. Boshqa so‘z bilan qidirib ko‘ring.', 'Товар не найден. Попробуйте другой запрос.')}</p></div>`
          : `<div class="fc-empty-state col-span-2"><i data-lucide="package-search" class="w-8 h-8"></i><p>${tr("Bosh sahifa uchun tovar biriktirilmagan", "Для главной страницы нет закреплённых товаров")}</p></div>`;
        grid.innerHTML = notFoundMsg;
        lucide.createIcons();
        return;
      }

      grid.innerHTML = filtered.map((p, idx) => renderProductCardHTML(p, idx, filtered.length)).join('');
      lucide.createIcons();
    }

    // REUSABLE PRODUCT CARD
    // ---- Sevimlilar (POLISH ROUND 2-bosqich, 17-band) ----
    async function loadFavorites(force = false) {
      if (favoritesLoading || (favoritesLoaded && !force)) return;
      favoritesLoading = true;
      try {
        const data = await callApi('get_favorites', {});
        favoriteProductIds = new Set(data.productIds || []);
        favoritesLoaded = true;
        render();
      } catch (e) {
        console.error('Sevimlilarni yuklashda xatolik:', e);
      } finally {
        favoritesLoading = false;
      }
    }
    async function toggleFavorite(productId, event) {
      if (event) event.stopPropagation();
      const wasFavorite = favoriteProductIds.has(productId);
      // Optimistik yangilanish — darhol UI o'zgaradi, xato bo'lsa qaytariladi.
      if (wasFavorite) favoriteProductIds.delete(productId); else favoriteProductIds.add(productId);
      render();
      try {
        await callApi('toggle_favorite', { productId });
      } catch (e) {
        console.error(e);
        if (wasFavorite) favoriteProductIds.add(productId); else favoriteProductIds.delete(productId);
        render();
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }
    function favoriteHeartHtml(productId, size = 'w-3.5 h-3.5') {
      const active = favoriteProductIds.has(productId);
      return `
        <button onclick="toggleFavorite('${productId}', event)" class="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm" aria-label="${tr('Sevimli', 'Избранное')}" title="${tr('Sevimli', 'Избранное')}">
          <svg class="${size}" viewBox="0 0 24 24" fill="${active ? '#ef4444' : 'none'}" stroke="${active ? '#ef4444' : '#9ca3af'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"></path></svg>
        </button>
      `;
    }
    function renderStockSubscribeButtonHtml(p) {
      const subscribed = mySubscribedProductIds.has(String(p.id));
      const busy = stockSubscribeBusy.has(String(p.id));
      if (subscribed) {
        return `<button onclick="toggleStockSubscription('${p.id}', false)" class="fc-btn fc-btn-secondary w-full" ${busy ? 'disabled' : ''}><i data-lucide="bell-off" class="w-4 h-4"></i>${tr("Obunani bekor qilish", "Отменить подписку")}</button>`;
      }
      return `<button onclick="toggleStockSubscription('${p.id}', true)" class="fc-btn fc-btn-primary w-full" ${busy ? 'disabled' : ''}><i data-lucide="bell" class="w-4 h-4"></i>${tr("Kelganda xabar bering", "Сообщить о поступлении")}</button>`;
    }

    async function toggleStockSubscription(productId, subscribe) {
      const id = String(productId);
      if (stockSubscribeBusy.has(id)) return;
      stockSubscribeBusy.add(id);
      render();
      try {
        await callApi(subscribe ? 'subscribe_stock_notification' : 'unsubscribe_stock_notification', { productId: id });
        if (subscribe) mySubscribedProductIds.add(id); else mySubscribedProductIds.delete(id);
        showActionToast(subscribe ? tr('✅ Obuna bo\'ldingiz', '✅ Вы подписались') : tr('Obuna bekor qilindi', 'Подписка отменена'), 'success', 1500);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      } finally {
        stockSubscribeBusy.delete(id);
        render();
      }
    }

    function setFavoritesPage(p) { favoritesPage = p; render(); }
    function renderFavoritesPage(container) {
      const list = products.filter(p => productVisibleInCurrentMode(p) && favoriteProductIds.has(p.id));
      const pageData = paginate(list, favoritesPage, 10);
      const body = !list.length ? `
        <div class="fc-empty-state">
          <svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"></path></svg>
          <p>${tr('Hali sevimli mahsulotlar yo‘q.', 'Пока нет избранных товаров.')}</p>
        </div>
      ` : `
        <div class="grid grid-cols-2 gap-3">${pageData.items.map((p, idx) => renderProductCardHTML(p, idx, pageData.items.length)).join('')}</div>
        ${renderPagerHTML(pageData.page, pageData.totalPages, 'setFavoritesPage')}
      `;
      renderPageShell(container, tr('Sevimlilar', 'Избранное'), body);
    }

    // ---- Yaqinda ko'rilganlar (POLISH ROUND 2-bosqich, 18-band) ----
    async function loadRecentViews(force = false) {
      if (recentViewsLoaded && !force) return;
      try {
        const data = await callApi('get_recent_views', {});
        recentViewProductIds = data.productIds || [];
        recentViewsLoaded = true;
        if (activePage === 'RECENT') render();
      } catch (e) {
        console.error('Yaqinda ko‘rilganlarni yuklashda xatolik:', e);
      }
    }
    async function recordProductView(productId) {
      // Optimistik: tepaga chiqarish/qo'shish darhol, so'rov fonda ketadi.
      recentViewProductIds = [productId, ...recentViewProductIds.filter(id => id !== productId)].slice(0, 20);
      try { await callApi('record_product_view', { productId }); }
      catch (e) { console.error('Ko‘rishni saqlashda xatolik:', e); }
    }
    function setRecentPage(p) { recentPage = p; render(); }
    function renderRecentPage(container) {
      const byId = new Map(products.map(p => [p.id, p]));
      const list = recentViewProductIds.map(id => byId.get(id)).filter(productVisibleInCurrentMode);
      const pageData = paginate(list, recentPage, 10);
      const body = !list.length ? `
        <div class="fc-empty-state">
          <i data-lucide="history" class="w-10 h-10"></i>
          <p>${tr('Hali hech narsa ko‘rilmagan.', 'Пока ничего не просмотрено.')}</p>
        </div>
      ` : `
        <div class="grid grid-cols-2 gap-3">${pageData.items.map((p, idx) => renderProductCardHTML(p, idx, pageData.items.length)).join('')}</div>
        ${renderPagerHTML(pageData.page, pageData.totalPages, 'setRecentPage')}
      `;
      renderPageShell(container, tr('Yaqinda ko‘rilganlar', 'Недавно просмотренные'), body);
    }

    // ---- O'xshash mahsulotlar (POLISH ROUND 2-bosqich, 19-band) ----
    // Deterministik: bir xil (leaf) katalog + omborda bor + joriy mahsulot
    // chiqarilgan. Yetarli bo'lmasa — parent katalogdagi opa-uka kataloglardan
    // to'ldiriladi. Client-side (products allaqachon yuklangan) — yangi so'rov yo'q.
    function similarProductsFor(p, limit = 6) {
      if (!p || !p.categoryId) return [];
      const sameLeaf = products.filter(x => x.id !== p.id && x.status !== 'DELETED' && x.categoryId === p.categoryId && x.stock > 0);
      if (sameLeaf.length >= limit) return sameLeaf.slice(0, limit);
      const cat = categories.find(c => c.id === p.categoryId);
      if (!cat || !cat.parentId) return sameLeaf;
      const siblingCatIds = categories.filter(c => c.parentId === cat.parentId && c.id !== cat.id).map(c => c.id);
      const fromSiblings = products.filter(x => x.id !== p.id && x.status !== 'DELETED' && x.stock > 0 && siblingCatIds.includes(x.categoryId));
      return [...sameLeaf, ...fromSiblings].slice(0, limit);
    }
    function renderSimilarProductsBlockHtml(p) {
      const similar = similarProductsFor(p, 6);
      if (!similar.length) return '';
      return `
        <div class="pt-2 border-t">
          <h4 class="font-bold text-xs text-gray-700 mb-2">${tr('O‘xshash mahsulotlar', 'Похожие товары')}</h4>
          <div class="grid grid-cols-2 gap-3">
            ${similar.map((sp, i) => renderProductCardHTML(sp, i, similar.length)).join('')}
          </div>
        </div>
      `;
    }

    function openCardActionMenu(kind, id, event) {
      event?.preventDefault?.(); event?.stopPropagation?.(); cancelCatalogLongPress();
      cardActionMenu = { kind, id: String(id) };
      render();
    }
    function closeCardActionMenu(event) { event?.stopPropagation?.(); cardActionMenu = null; render(); }
    function cardActionMenuHtml(kind, id) {
      if (!cardActionMenu || cardActionMenu.kind !== kind || String(cardActionMenu.id) !== String(id)) return '';
      const edit = kind === 'product'
        ? `openProductDetailModal('${id}');cardActionMenu=null;render();`
        : `openEditCategoryModal('${id}', event);cardActionMenu=null;`;
      const move = kind === 'product'
        ? `openMoveProductModal('${id}');cardActionMenu=null;`
        : `openMoveCategoryModal('${id}', event);cardActionMenu=null;`;
      const del = kind === 'product'
        ? `deleteProduct('${id}');cardActionMenu=null;`
        : `deleteCategory('${id}', event);cardActionMenu=null;`;
      return `<div class="fc-card-action-menu" onclick="event.stopPropagation()"><button type="button" onclick="${edit}"><i data-lucide="pencil" class="w-4 h-4"></i><span>${tr('Tahrirlash','Изменить')}</span></button><button type="button" onclick="${move}"><i data-lucide="folder-input" class="w-4 h-4"></i><span>${tr('Ko‘chirish','Переместить')}</span></button><button type="button" class="is-danger" onclick="${del}"><i data-lucide="trash-2" class="w-4 h-4"></i><span>${tr('O‘chirish','Удалить')}</span></button></div>`;
    }

    function renderProductCardHTML(p, idx, totalLen) {
      const inCart = cart[p.id];
      const vars = productVariants(p);
      const variantSizes = [...new Set(vars.map(v => v.size).filter(Boolean))];
      const variantColors = [...new Set(vars.map(v => v.color).filter(Boolean))];
      const hasDiscount = p.oldPrice && p.oldPrice > p.price;
      const bulkSelecting = isAdminMode && isUserAnAdmin && bulkProductSelectMode;

      return `
        <div data-product-card-id="${escapeHtml(p.id)}" onclick="handleProductCardClick('${p.id}', event)" onpointerdown="startProductLongPress('${p.id}', event)" onpointerup="cancelCatalogLongPress()" onpointercancel="cancelCatalogLongPress()" onpointerleave="cancelCatalogLongPress()" class="bg-white rounded-2xl p-3 shadow-sm border ${bulkSelecting && bulkSelectedProductIds.has(String(p.id)) ? 'ustore-selected-card border-blue-500' : 'border-gray-100'} flex flex-col justify-between relative cursor-pointer hover:shadow-md transition-all">
          ${bulkSelecting ? `<div class="absolute top-2 left-2 z-30 w-7 h-7 rounded-full flex items-center justify-center font-black ${bulkSelectedProductIds.has(String(p.id)) ? 'bg-blue-600 text-white' : 'bg-white/95 text-gray-400 border'}">${bulkSelectedProductIds.has(String(p.id)) ? '<i data-lucide="check" class="w-4 h-4"></i>' : ''}</div>` : ''}
          <div>
            <div class="relative">
              ${productBadgeChipHtml(p)}
              <div class="w-full h-32 rounded-xl mb-2 bg-gray-50 overflow-hidden flex items-center justify-center p-1.5">
                <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-full h-full object-contain" loading="lazy">
              </div>
              ${(isAdminMode && isUserAnAdmin && !bulkSelecting) ? `<button type="button" class="fc-product-pin-overlay ${p.isFeatured ? 'is-active' : ''}" aria-label="${tr('Pin','Закрепить')}" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation();toggleProductFeatured('${p.id}')">${ICON_PIN}</button><button type="button" class="fc-product-more-overlay" aria-label="${tr('Qo‘shimcha amallar','Дополнительные действия')}" onpointerdown="event.stopPropagation()" onclick="openCardActionMenu('product','${p.id}',event)"><i data-lucide="ellipsis-vertical" class="w-4 h-4"></i></button><button type="button" class="fc-product-visibility-overlay ${p.isVisible === false ? 'is-hidden' : 'is-visible'}" aria-label="${p.isVisible === false ? tr('Userga ko‘rsatish','Показать пользователю') : tr('Userdan yashirish','Скрыть от пользователя')}" title="${p.isVisible === false ? tr('Userga ko‘rsatish','Показать пользователю') : tr('Userdan yashirish','Скрыть от пользователя')}" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation();toggleProductVisibility('${p.id}')"><i data-lucide="${p.isVisible === false ? 'eye-off' : 'eye'}" class="w-4 h-4"></i></button><button type="button" class="fc-drag-handle fc-product-drag-image" aria-label="${tr('Tartiblash','Сортировать')}" onpointerdown="beginCatalogDrag('product','${p.id}',event)" onpointermove="moveCatalogDrag(event)" onpointerup="endCatalogDrag(event)" onpointercancel="cancelCatalogDrag(event)">${ICON_GRIP_6}</button>${cardActionMenuHtml('product', p.id)}` : ''}
              ${!(isAdminMode && isUserAnAdmin) ? `<div class="absolute top-1 left-1">${favoriteHeartHtml(p.id)}</div>` : ''}
            </div>
            ${(isAdminMode && isUserAnAdmin) ? `<span class="text-[10px] bg-gray-100 font-mono text-gray-500 px-1.5 py-0.5 rounded">${escapeHtml(p.sku)}</span>` : ''}
            <h4 class="font-bold text-sm text-gray-800 mt-1 leading-tight line-clamp-2">${escapeHtml(productName(p))}</h4>

            <div class="fc-product-price-block mt-1">
              ${hasDiscount ? `<div class="fc-product-price-main-row"><div class="fc-product-current-price fc-text-danger">${money(p.price)}</div><span class="fc-product-discount-badge">-${discountPercent(p)}%</span></div><div class="fc-product-old-price-row"><span class="fc-product-old-price line-through">${money(p.oldPrice)}</span></div>` : `<div class="fc-product-price-main-row"><div class="fc-product-current-price text-blue-600">${money(p.price)}</div></div>`}
            </div>
            ${variantSizes.length ? `<p class="text-[9px] text-gray-400 mt-0.5">${tr("O'lcham", "Размер")}: ${variantSizes.map(escapeHtml).join(', ')}</p>` : ''}
            ${variantColors.length ? `<p class="text-[9px] text-gray-400 mt-0.5">${tr("Rang", "Цвет")}: ${variantColors.map(escapeHtml).join(', ')}</p>` : ''}
            ${productDesc(p) ? `<p class="text-[10px] text-gray-400 italic mt-0.5 line-clamp-1">${escapeHtml(truncateText(productDesc(p), 40))}</p>` : ''}
          </div>

          <!-- ADMIN: tahrirlash kartaning o'zini bosish orqali; pin/3-nuqta rasm ustida, drag esa kartochkaning pastki o'ng burchagida. -->
          ${(isAdminMode && isUserAnAdmin && !bulkSelecting) ? `` : `
            <!-- USER CART CONTROLS -->
            <div class="mt-2" onclick="event.stopPropagation()">
              ${p.stock > 0 ? (
                vars.length > 0 ? `
                  <button onclick="openProductDetailModal('${p.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1">
                    <span>${t('choose_variant')}</span>
                  </button>
                ` : (
                inCart ? `
                  <div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-1">
                    <button onclick="changeCartQty('${p.id}', -1, event)" class="w-6 h-6 bg-white font-bold rounded-lg shadow text-xs text-blue-600">-</button>
                    <span class="font-bold text-xs text-blue-800">${inCart.qty}</span>
                    <button onclick="changeCartQty('${p.id}', 1, event)" class="w-6 h-6 bg-blue-600 font-bold rounded-lg text-xs text-white">+</button>
                  </div>
                ` : `
                  <button onclick="addToCart('${p.id}', event)" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1">
                    <i data-lucide="plus" class="w-3.5 h-3.5"></i> <span>${t('add_to_cart_short')}</span>
                  </button>
                `
              )) : `<button disabled class="w-full bg-gray-100 text-gray-400 font-bold py-2 rounded-xl text-xs">❌ ${t('out_of_stock')}</button>`}
            </div>
          `}
        </div>
      `;
    }

    // 2. CATEGORIES TAB
    function renderCategories(container) {
      const currentCat = categories.find(c => c.id === adminCatParentId);
      const subCats = categories.filter(c => c.parentId === adminCatParentId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const recursiveProductCounts = buildRecursiveProductCountMap();
      const catProdsRaw = products.filter(p => p.categoryId === adminCatParentId && productVisibleInCurrentMode(p));
      const catProds = applyCategoryFilter(catProdsRaw);
      const globalMissingImageCount = getMissingImageProducts().length;
      const filterActive = isCategoryFilterActive();

      const totalPages = Math.ceil(catProds.length / 10) || 1;
      if (categoryPage > totalPages) categoryPage = 1;
      const paginatedProds = catProds.slice((categoryPage - 1) * 10, categoryPage * 10);
      currentVisibleProductIds = paginatedProds.map(p => p.id);

      const catAncestors = categoryAncestorChain(adminCatParentId);
      const breadcrumbHtml = `<div class="fc-warehouse-breadcrumb fc-catalog-breadcrumb">
        <button type="button" onclick="adminCatParentId=null;categoryPage=1;render();"><i data-lucide="home" class="w-3.5 h-3.5"></i>${tr('Bosh katalog','Главный каталог')}</button>
        ${catAncestors.map(a => `<i data-lucide="chevron-right" class="w-3 h-3"></i><button type="button" onclick="adminCatParentId='${a.id}';categoryPage=1;render();">${escapeHtml(categoryName(a))}</button>`).join('')}
      </div>`;

      container.innerHTML = `
        <div class="space-y-4">
          <button type="button" onclick="window.scrollTo({top:0,behavior:'smooth'})" class="fc-scroll-top-btn" aria-label="${escapeHtml(tr('Tepaga', 'Наверх'))}" title="${escapeHtml(tr('Tepaga', 'Наверх'))}"><i data-lucide="arrow-up" class="w-4 h-4"></i></button>
          <div class="bg-white p-3 rounded-2xl border space-y-2 shadow-sm">
            <div class="fc-catalog-breadcrumb-wrap">
              ${adminCatParentId ? `<div class="fc-catalog-nav-pills"><button onclick="goBackCatLevel()" class="fc-cat-nav-btn" aria-label="${escapeHtml(tr('Orqaga','Назад'))}" title="${escapeHtml(tr('Orqaga','Назад'))}"><i data-lucide="arrow-left" class="w-4 h-4"></i></button><button onclick="adminCatParentId = null; categoryPage=1; render();" class="fc-cat-nav-btn" aria-label="${escapeHtml(tr('Boshiga','В начало'))}" title="${escapeHtml(tr('Boshiga','В начало'))}"><i data-lucide="home" class="w-4 h-4"></i></button></div>` : ''}
              ${breadcrumbHtml}
            </div>

            ${(isAdminMode && isUserAnAdmin) ? `
              <!-- 23-band: Katalog/Tovar/Excel bitta ixcham qatorda, zamonaviy
                   (Lucide) iconlar bilan — eski emoji emas. -->
              <div class="flex space-x-2 pt-1 border-t">
                <button onclick="openAddCatModal()" class="flex-1 flex items-center justify-center gap-1 bg-blue-600 text-white font-bold py-1.5 rounded-xl text-xs"><i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>${tr("Katalog", "Каталог")}</button>
                <button onclick="openAddProductModal()" class="fc-product-add-btn flex-1 flex items-center justify-center gap-1 text-white font-bold py-1.5 rounded-xl text-xs"><i data-lucide="package-plus" class="w-3.5 h-3.5"></i>${tr("Tovar", "Товар")}</button>
                <button onclick="openExcelImportModal()" ${excelOpening ? 'disabled' : ''} class="fc-excel-btn flex-1 flex items-center justify-center gap-1 font-bold py-1.5 rounded-xl text-xs">${excelOpening ? '<span class="fc-spinner fc-spinner-xs"></span>' : '<i data-lucide="table" class="w-3.5 h-3.5"></i>'}${excelOpening ? tr('Ochilmoqda...','Открывается...') : 'Excel'}</button>
              </div>
              <div class="flex flex-wrap gap-1.5 pt-1">
                <button onclick="openMissingImageQueue()" title="${tr('Rasmsiz tovarlar','Товары без фото')} · ${globalMissingImageCount}" aria-label="${tr('Rasmsiz tovarlar','Товары без фото')}" class="flex items-center justify-center gap-1 min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">${ICON_IMAGE}${globalMissingImageCount > 0 ? `<span>${globalMissingImageCount}</span>` : ''}</button>
                <button onclick="openTrashModal()" title="${tr('Chiqindi (24 soat)','Корзина (24 часа)')}" aria-label="${tr('Chiqindi', 'Корзина')}" class="flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-white border fc-text-danger">${ICON_TRASH}</button>
                <button onclick="openDuplicateProductsModal()" title="${tr('Duplicate tovarlarni tekshirish','Проверить дубликаты товаров')}" aria-label="${tr('Duplicate tovarlarni tekshirish','Проверить дубликаты товаров')}" class="flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-white border text-gray-600">${ICON_COPY_CHECK}</button>
                ${billzAccessGranted ? `<button onclick="openBillzBrowse('${adminCatParentId || ''}')" title="${tr("Billz'dan tovar tortib olish", 'Импорт товаров из Billz')}" aria-label="${tr("Billz'dan tovar tortib olish", 'Импорт товаров из Billz')}" class="flex items-center justify-center gap-1 min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-white border text-gray-600">${ICON_DOWNLOAD}Billz</button>` : ''}
              </div>
            ` : ''}
          </div>

          <!-- SUBCATEGORIES LIST -->
          <div class="space-y-2" data-catalog-drag-list="category">
            ${subCats.map((sub, subIdx) => `
              <div data-category-row-id="${sub.id}" onclick="handleCategoryRowClick('${sub.id}', event)" onpointerdown="startCategoryLongPress('${sub.id}', event)" onpointerup="cancelCatalogLongPress()" onpointercancel="cancelCatalogLongPress()" onpointerleave="cancelCatalogLongPress()" class="ustore-cat-row p-3.5 rounded-2xl border ${bulkCategorySelectMode && bulkSelectedCategoryIds.has(String(sub.id)) ? 'ustore-selected-card border-blue-500' : 'border-gray-100'} flex items-center justify-between shadow-sm cursor-pointer">
                <div class="flex items-center space-x-3">
                  ${sub.img && (sub.img.startsWith('http') || sub.img.startsWith('data:')) ?
                    `<img src="${escapeHtml(sub.img)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-8 h-8 object-cover rounded-lg" loading="lazy">` :
                    `<span class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><i data-lucide="folder" class="w-4 h-4"></i></span>`
                  }
                  <div>
                    <h5 class="font-bold text-sm text-gray-800">${escapeHtml(categoryName(sub))}</h5>
                    <p class="text-[10px] text-gray-400">${categories.filter(c => c.parentId === sub.id).length} ${tr('katalog','кат.')} | ${recursiveProductCounts.get(String(sub.id)) || 0} ${tr('tovar','тов.')}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-1">
                  ${(isAdminMode && isUserAnAdmin) ? (bulkCategorySelectMode ? `<span class="fc-select-dot ${bulkSelectedCategoryIds.has(String(sub.id)) ? 'is-selected' : ''}"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>` : `
                    <button type="button" class="fc-drag-handle" aria-label="${tr('Tartiblash','Сортировать')}" onpointerdown="beginCatalogDrag('category','${sub.id}',event)" onpointermove="moveCatalogDrag(event)" onpointerup="endCatalogDrag(event)" onpointercancel="cancelCatalogDrag(event)">${ICON_GRIP_6}</button>
                    <button type="button" class="fc-card-more-btn" onpointerdown="event.stopPropagation()" onclick="openCardActionMenu('category','${sub.id}',event)" aria-label="${tr('Qo‘shimcha amallar','Дополнительные действия')}"><i data-lucide="ellipsis-vertical" class="w-4 h-4"></i></button>
                    ${cardActionMenuHtml('category', sub.id)}
                  `) : ''}
                </div>
              </div>
            `).join('')}
          </div>

          ${bulkCategorySelectMode ? `<div class="fc-selection-toolbar"><span>${bulkSelectedCategoryIds.size}</span><button onclick="openBulkMoveCategoriesModal()" ${bulkSelectedCategoryIds.size?'':'disabled'} aria-label="${tr('Ko‘chirish','Переместить')}"><i data-lucide="folder-input" class="w-4 h-4"></i></button><button onclick="bulkTrashSelectedCategories()" ${bulkSelectedCategoryIds.size?'':'disabled'} class="is-danger" aria-label="${tr('O‘chirish','Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button><button onclick="clearBulkCategorySelection()"><i data-lucide="x" class="w-4 h-4"></i></button></div>` : ''}

          ${catProdsRaw.length === 0 && subCats.length > 0 ? '' : `
          <!-- PRODUCTS LIST -->
          <div class="space-y-2 pt-2">
            <div class="flex items-center justify-between px-1">
              <h4 class="font-bold text-xs text-gray-500 uppercase flex items-center gap-1.5"><i data-lucide="package" class="w-4 h-4"></i>${tr("Tovarlar", "Товары")} (${catProds.length})</h4>
              <div class="flex gap-1">
                ${catProdsRaw.length > 0 ? `
                  ${bulkProductSelectMode ? `<button onclick="selectAllVisibleProducts()" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">${tr('Barchasini tanlash','Выбрать все')}</button>` : ''}
                  <button onclick="openCategoryFilterModal()" aria-label="${tr('Filtr','Фильтр')}" aria-pressed="${filterActive ? 'true' : 'false'}" class="fc-filter-launch fc-filter-launch-inline ${filterActive ? 'is-active' : ''}">
                    <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5"></i>${filterActive ? '<span class="fc-filter-active-dot"></span>' : ''}
                  </button>
                ` : ''}
              </div>
            </div>
            ${renderActiveFilterChipsHtml()}
            ${catProds.length === 0 ? `
              <div class="fc-empty-state">
                <i data-lucide="${filterActive ? 'search-x' : 'package-open'}" class="w-8 h-8"></i>
                <p>${filterActive ? tr('Mahsulot topilmadi. Boshqa so‘z bilan qidirib ko‘ring.', 'Товар не найден. Попробуйте другой запрос.') : tr('Bu katalogda hozircha tovar yo‘q.', 'В этом каталоге пока нет товаров.')}</p>
              </div>
            ` : `
              <div class="grid grid-cols-2 gap-3" data-catalog-drag-list="product">
                ${paginatedProds.map((p, idx) => renderProductCardHTML(p, idx, paginatedProds.length)).join('')}
              </div>
            `}

            ${bulkProductSelectMode ? `<div class="fc-selection-toolbar"><span>${bulkSelectedProductIds.size}</span><button onclick="openBulkMoveProductsModal()" ${bulkSelectedProductIds.size?'':'disabled'} aria-label="${tr('Ko‘chirish','Переместить')}"><i data-lucide="folder-input" class="w-4 h-4"></i></button><button onclick="bulkTrashSelectedProducts()" ${bulkSelectedProductIds.size?'':'disabled'} class="is-danger" aria-label="${tr('O‘chirish','Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button><button onclick="clearBulkProductSelection()" aria-label="${tr('Tanlashni tugatish','Завершить выбор')}"><i data-lucide="x" class="w-4 h-4"></i></button></div>` : ''}

            ${totalPages > 1 ? `
              <div class="flex justify-center items-center space-x-2 pt-4">
                ${Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => `
                  <button onclick="categoryPage = ${pNum}; render();" class="px-3 py-1.5 rounded-xl text-xs font-bold ${categoryPage === pNum ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700'}">
                    ${pNum}
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>
          `}
        </div>
      `;
    }

    function isCategoryFilterActive() {
      return !!(categoryFilter.search || categoryFilter.minPrice || categoryFilter.maxPrice || categoryFilter.sortPrice || categoryFilter.sortNew || categoryFilter.sortSold || categoryFilter.inStockOnly || categoryFilter.discountOnly);
    }

    function applyCategoryFilter(list) {
      let result = list.slice();
      if (categoryFilter.search && categoryFilter.search.trim()) {
        const matchedIds = new Set(searchProducts(categoryFilter.search).map(p => String(p.id)));
        result = result.filter(p => matchedIds.has(String(p.id)));
      }
      // 22-band: "Omborda bor" (tugaganlarni yashirish) — bitta toggle, ikkalasi
      // ham mantiqan bir xil narsa (stock<=0 bo'lganlarni yashirish).
      if (categoryFilter.inStockOnly) result = result.filter(p => Number(p.stock) > 0);
      // Online Do'kon yaxshilashlari, 8-band: faqat chegirmali tovarlarni ko'rsatish.
      if (categoryFilter.discountOnly) result = result.filter(p => p.oldPrice && Number(p.oldPrice) > Number(p.price));
      const min = parseFloat(categoryFilter.minPrice);
      const max = parseFloat(categoryFilter.maxPrice);
      if (!isNaN(min)) result = result.filter(p => p.price >= min);
      if (!isNaN(max)) result = result.filter(p => p.price <= max);

      const dirMul = (dir) => dir === 'asc' ? 1 : -1;
      result.sort((a, b) => {
        if (categoryFilter.sortPrice) {
          const d = (a.price - b.price) * dirMul(categoryFilter.sortPrice);
          if (d !== 0) return d;
        }
        if (categoryFilter.sortNew) {
          const d = (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) * dirMul(categoryFilter.sortNew);
          if (d !== 0) return d;
        }
        if (categoryFilter.sortSold) {
          const d = ((a.soldCount || 0) - (b.soldCount || 0)) * dirMul(categoryFilter.sortSold);
          if (d !== 0) return d;
        }
        return 0;
      });
      return result;
    }

    // 22-band: tanlangan filterlar chip/badge — har biri alohida ✕ bilan olib
    // tashlanadi, "Tozalash" hammasini bekor qiladi. Home va Kataloglar bir xil.
    function renderActiveFilterChipsHtml() {
      if (!isCategoryFilterActive()) return '';
      const chips = [];
      if (categoryFilter.search) chips.push({ key: 'search', label: `"${categoryFilter.search}"` });
      if (categoryFilter.minPrice || categoryFilter.maxPrice) chips.push({ key: 'price', label: `${categoryFilter.minPrice || '0'}—${categoryFilter.maxPrice || '∞'}` });
      if (categoryFilter.sortPrice) chips.push({ key: 'sortPrice', label: tr("Narx", "Цена") + (categoryFilter.sortPrice === 'asc' ? ' ↑' : ' ↓') });
      if (categoryFilter.sortNew) chips.push({ key: 'sortNew', label: tr("Yangi", "Новое") + (categoryFilter.sortNew === 'asc' ? ' ↑' : ' ↓') });
      if (categoryFilter.sortSold) chips.push({ key: 'sortSold', label: tr("Ko'p sotilgan", "Популярное") + (categoryFilter.sortSold === 'asc' ? ' ↑' : ' ↓') });
      if (categoryFilter.inStockOnly) chips.push({ key: 'inStockOnly', label: tr("Omborda bor", "В наличии") });
      if (categoryFilter.discountOnly) chips.push({ key: 'discountOnly', label: tr("Chegirmali", "Со скидкой") });
      if (!chips.length) return '';
      return `
        <div class="flex flex-wrap items-center gap-1.5">
          ${chips.map(c => `<span class="fc-badge fc-badge-primary">${escapeHtml(c.label)} <button onclick="removeCategoryFilterKey('${c.key}')" class="ml-0.5 font-black" aria-label="${tr('Olib tashlash', 'Убрать')}">✕</button></span>`).join('')}
          <button onclick="clearCategoryFilter()" class="text-[10px] font-bold text-blue-600 underline">${tr('Tozalash', 'Сбросить')}</button>
        </div>
      `;
    }

    function openCategoryFilterModal() {
      activePopupModal = 'CAT_FILTER';
      render();
    }

    function closeCategoryFilterModal() {
      activePopupModal = null;
      render();
    }

    function setCategoryPriceBound(field, value) {
      categoryFilter[field] = value;
      categoryPage = 1;
    }

    // 4-rasm: yashirin cycling o'rniga aniq ko'rinadigan, bir martalik variantlar —
    // har bosishda faqat BITTA saralash rejimi yoqiladi (qolganlari tozalanadi),
    // aynan shu rejim allaqachon yoqilgan bo'lsa bosilganda o'chadi. Pastdagi
    // applyCategoryFilter() mantig'i o'zgarishsiz qoladi — bu yerda faqat uning
    // uchta mustaqil maydonidan (sortPrice/sortNew/sortSold) bir vaqtda faqat
    // bittasi to'ldiriladi.
    function currentCategorySortMode() {
      if (categoryFilter.sortPrice === 'asc') return 'priceAsc';
      if (categoryFilter.sortPrice === 'desc') return 'priceDesc';
      if (categoryFilter.sortNew) return 'new';
      if (categoryFilter.sortSold) return 'sold';
      return null;
    }
    function setCategorySortMode(mode) {
      const isActive = currentCategorySortMode() === mode;
      categoryFilter.sortPrice = null; categoryFilter.sortNew = null; categoryFilter.sortSold = null;
      if (!isActive) {
        if (mode === 'priceAsc') categoryFilter.sortPrice = 'asc';
        else if (mode === 'priceDesc') categoryFilter.sortPrice = 'desc';
        else if (mode === 'new') categoryFilter.sortNew = 'desc';
        else if (mode === 'sold') categoryFilter.sortSold = 'desc';
      }
      categoryPage = 1;
      render();
    }
    // Narx-chip presetlar — bosilganda darhol qo'llanadi (typed input'dan farqli,
    // shu bilan render() chaqirilib chip/natija-soni darhol yangilanadi).
    const CATEGORY_PRICE_PRESETS = [
      { min: '', max: '100000' },
      { min: '100000', max: '300000' },
      { min: '300000', max: '1000000' },
      { min: '1000000', max: '' },
    ];
    function applyCategoryPricePreset(min, max) {
      const isActive = String(categoryFilter.minPrice || '') === String(min) && String(categoryFilter.maxPrice || '') === String(max);
      categoryFilter.minPrice = isActive ? '' : min;
      categoryFilter.maxPrice = isActive ? '' : max;
      categoryPage = 1;
      render();
    }

    function clearCategoryFilter() {
      categoryFilter = { search: '', minPrice: '', maxPrice: '', sortPrice: null, sortNew: null, sortSold: null, inStockOnly: false, discountOnly: false };
      categoryPage = 1;
      render();
    }
    function toggleInStockOnlyFilter() {
      categoryFilter.inStockOnly = !categoryFilter.inStockOnly;
      categoryPage = 1;
      render();
    }
    function toggleDiscountOnlyFilter() {
      categoryFilter.discountOnly = !categoryFilter.discountOnly;
      categoryPage = 1;
      render();
    }
    // 22-band: bitta faol filtrni olib tashlaydi (chip'dagi ✕ orqali).
    function removeCategoryFilterKey(key) {
      if (key === 'search') categoryFilter.search = '';
      else if (key === 'price') { categoryFilter.minPrice = ''; categoryFilter.maxPrice = ''; }
      else if (key === 'inStockOnly') categoryFilter.inStockOnly = false;
      else if (key === 'discountOnly') categoryFilter.discountOnly = false;
      else categoryFilter[key] = null;
      categoryPage = 1;
      render();
    }

    function goBackCatLevel() {
      if (!adminCatParentId) return;
      const current = categories.find(c => c.id === adminCatParentId);
      adminCatParentId = current ? current.parentId : null;
      categoryPage = 1;
      render();
    }

    // 3. CART TAB
    function renderCart(container) {
      const items = Object.entries(cart).map(([key, itemData]) => {
        const productId = cartEntryProductId(key, itemData);
        const p = products.find(prod => prod.id === productId);
        return productVisibleInCurrentMode(p) ? { ...p, key, qty: itemData.qty, size: itemData.size || null, color: itemData.color || null } : null;
      }).filter(Boolean);
      const bundleItems = Object.entries(bundleCart).map(([bundleId, b]) => ({ bundleId, ...b }));

      let total = items.reduce((sum, item) => sum + (item.price * item.qty), 0)
        + bundleItems.reduce((sum, b) => sum + (b.bundlePrice * b.qty), 0);

      const bundleRowsHtml = bundleItems.length ? `
        <div class="bg-white rounded-2xl p-4 shadow-sm divide-y">
          ${bundleItems.map(b => `
            <div class="py-3 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                ${b.coverImageUrl ? `<img src="${escapeHtml(b.coverImageUrl)}" class="w-12 h-12 object-cover rounded-lg flex-shrink-0" loading="lazy">` : `<div class="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0"><i data-lucide="package" class="w-5 h-5 text-gray-300"></i></div>`}
                <div class="min-w-0">
                  <h4 class="font-bold text-sm text-gray-800 truncate">${escapeHtml(b.name)}</h4>
                  <span class="fc-badge fc-badge-success">${tr('Aksiya', 'Акция')}</span>
                  <p class="text-xs text-gray-500 mt-0.5">${money(b.bundlePrice)} × ${b.qty} = <b class="text-gray-700">${money(b.bundlePrice * b.qty)}</b></p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button onclick="changeBundleCartQty('${b.bundleId}', -1)" class="w-9 h-9 bg-gray-100 rounded-lg font-bold text-sm">-</button>
                <span class="font-bold text-sm w-5 text-center">${b.qty}</span>
                <button onclick="changeBundleCartQty('${b.bundleId}', 1)" ${b.qty >= 10 ? 'disabled' : ''} class="w-9 h-9 bg-blue-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm">+</button>
              </div>
            </div>
          `).join('')}
        </div>` : '';

      if (items.length === 0 && bundleItems.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12 bg-white rounded-2xl p-6 shadow-sm">
            <i data-lucide="shopping-bag" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i>
            <h3 class="font-bold text-gray-700">${t('cart_empty')}</h3>
            <button onclick="switchTab('home')" class="mt-4 bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl">${t('shop_now')}</button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="space-y-4 pb-24">
          <h2 class="text-lg font-bold">${t('cart_title')}</h2>
          ${bundleRowsHtml}
          ${items.length ? `<div class="bg-white rounded-2xl p-4 shadow-sm divide-y">
            ${items.map(item => {
              const available = productVariants(item).length ? variantQty(item, item.size, item.color) : item.stock;
              return `
              <div class="py-3 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2.5 min-w-0">
                  <img src="${escapeHtml(item.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-12 h-12 object-cover rounded-lg flex-shrink-0" loading="lazy">
                  <div class="min-w-0">
                    <h4 class="font-bold text-sm text-gray-800 truncate">${escapeHtml(productName(item))}</h4>
                    ${(item.size || item.color) ? `<div class="flex items-center gap-1 mt-0.5">${item.size ? `<span class="fc-badge fc-badge-muted">${escapeHtml(item.size)}</span>` : ''}${item.color ? `<span class="fc-badge fc-badge-muted">${escapeHtml(item.color)}</span>` : ''}</div>` : ''}
                    <p class="text-xs text-gray-500 mt-0.5">${money(item.price)} × ${item.qty} = <b class="text-gray-700">${money(item.price * item.qty)}</b></p>
                    ${item.qty >= available ? `<p class="text-[10px] fc-text-warning mt-0.5">${tr('Omborda shuncha bor', 'Столько есть на складе')}: ${available}</p>` : ''}
                  </div>
                </div>
                <div class="flex flex-col items-end gap-1.5 shrink-0">
                  <div class="flex items-center gap-2">
                    <button onclick="changeCartQty('${item.key}', -1)" class="w-9 h-9 bg-gray-100 rounded-lg font-bold text-sm">-</button>
                    <span class="font-bold text-sm w-5 text-center">${item.qty}</span>
                    <button onclick="changeCartQty('${item.key}', 1)" ${item.qty >= available ? 'disabled' : ''} class="w-9 h-9 bg-blue-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm">+</button>
                  </div>
                </div>
              </div>
            `; }).join('')}
          </div>` : ''}
        </div>

        <div class="fixed left-0 right-0 z-30 px-4" style="bottom:calc(4.25rem + env(safe-area-inset-bottom))">
          <div class="bg-white rounded-2xl p-4 shadow-xl border space-y-3 max-w-md mx-auto">
            <div class="flex justify-between items-center text-lg font-black">
              <span>${t('total')}:</span>
              <span class="text-green-600">${money(total)}</span>
            </div>
            <button onclick="openCheckoutForm()" class="fc-btn fc-btn-success w-full text-sm">
              ✅ ${t('place_order')}
            </button>
          </div>
        </div>
      `;
    }

    // 24-band: bitta tovarni to'liq savatchadan olib tashlash (miqdorni
    // birma-bir kamaytirishdan farqli, aniq/tezkor o'chirish).
    function removeCartItem(key) {
      delete cart[key];
      localStorage.setItem(scopedKey('cart'), JSON.stringify(cart));
      updateCartBadge();
      render();
    }

    function topLevelRegionLabel(regionId) {
      const region = TOP_LEVEL_REGIONS.find(item => item.id === regionId);
      return region ? (uiLang === 'ru' ? region.nameRu : region.nameUz) : regionId;
    }

    function checkoutSubtotal() {
      const itemsTotal = Object.entries(cart).reduce((sum, [key, itemData]) => {
        const productId = cartEntryProductId(key, itemData);
        const product = products.find(item => item.id === productId);
        return sum + (productVisibleInCurrentMode(product) ? product.price * (Number(itemData.qty) || 0) : 0);
      }, 0);
      const bundlesTotal = Object.values(bundleCart).reduce((sum, b) => sum + (Number(b.bundlePrice) || 0) * (Number(b.qty) || 0), 0);
      return itemsTotal + bundlesTotal;
    }

    function promoErrorMessage(code) {
      if (String(code || '').startsWith('promo_min_order:')) {
        const minAmount = code.split(':')[1];
        return tr(`Minimal buyurtma summasi: ${formatNumber(minAmount)} so'm`, `Минимальная сумма заказа: ${formatNumber(minAmount)} сум`);
      }
      const map = {
        promo_not_found: tr("Bunday promo-kod topilmadi.", "Такой промокод не найден."),
        promo_not_started: tr("Bu promo-kod hali faollashmagan.", "Этот промокод ещё не активен."),
        promo_expired: tr("Bu promo-kodning muddati tugagan.", "Срок действия промокода истёк."),
        promo_not_applicable: tr("Bu promo-kod savatchangizdagi tovarlarga tegishli emas.", "Этот промокод не подходит к товарам в корзине."),
        promo_usage_limit_reached: tr("Bu promo-kodning foydalanish limiti tugagan.", "Лимит использования промокода исчерпан."),
        promo_customer_limit_reached: tr("Siz bu promo-koddan allaqachon foydalangansiz.", "Вы уже использовали этот промокод."),
        promo_code_required: tr("Promo-kodni kiriting.", "Введите промокод."),
        empty_cart: tr("Savatcha bo'sh.", "Корзина пуста."),
      };
      return map[code] || tr("Promo-kod yaroqsiz.", "Промокод недействителен.");
    }

    async function applyPromoCode() {
      const code = String(document.getElementById('chk-promo-code')?.value || checkoutPromoCode || '').trim().toUpperCase();
      if (!code) { promoError = promoErrorMessage('promo_code_required'); renderCheckoutOptions(); return; }
      promoApplying = true; promoError = '';
      renderCheckoutOptions();
      try {
        const items = Object.entries(cart).map(([key, itemData]) => ({ productId: cartEntryProductId(key, itemData), qty: itemData.qty }));
        const result = await callApi('promo_preview', { code, items });
        if (result.valid) {
          appliedPromoState = { code, name: result.name, discountAmount: Number(result.discountAmount) || 0 };
          checkoutPromoCode = code;
          promoError = '';
        } else {
          appliedPromoState = null;
          promoError = promoErrorMessage(result.error);
        }
      } catch (e) {
        appliedPromoState = null;
        promoError = tr("Promo-kodni tekshirib bo'lmadi. Qaytadan urinib ko'ring.", "Не удалось проверить промокод. Попробуйте ещё раз.");
      } finally {
        promoApplying = false;
        renderCheckoutOptions();
      }
    }

    function removeAppliedPromo() {
      appliedPromoState = null;
      checkoutPromoCode = '';
      promoError = '';
      renderCheckoutOptions();
    }

    function renderPromoWrapHtml() {
      if (appliedPromoState) {
        return `<div class="fc-checkout-promo-row">
          <div class="fc-checkout-promo-applied"><i data-lucide="badge-check" class="w-4 h-4"></i><span>${escapeHtml(appliedPromoState.code)} — ${escapeHtml(appliedPromoState.name)}</span></div>
          <button type="button" onclick="removeAppliedPromo()" class="fc-btn fc-btn-secondary">${tr("Olib tashlash", "Убрать")}</button>
        </div>`;
      }
      return `<div class="fc-checkout-promo-row">
        <input type="text" id="chk-promo-code" value="${escapeHtml(checkoutPromoCode)}" oninput="checkoutPromoCode=this.value.toUpperCase()" onkeydown="if(event.key==='Enter'){event.preventDefault();applyPromoCode();}" placeholder="${tr('Masalan: YOZGI20', 'Например: YOZGI20')}" class="fc-checkout-promo-input">
        <button type="button" onclick="applyPromoCode()" class="fc-btn fc-btn-primary" ${promoApplying ? 'disabled' : ''}>${promoApplying ? tr('Tekshirilmoqda…', 'Проверка…') : tr("Qo'llash", 'Применить')}</button>
      </div>
      ${promoError ? `<p class="fc-checkout-promo-error"><i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>${escapeHtml(promoError)}</p>` : ''}`;
    }

    function deliveryOptionLabel(option) {
      if (option.kind === 'FREE') return tr('Bepul yetkazib berish', 'Бесплатная доставка');
      if (option.kind === 'FIXED') return tr('Yetkazib berish', 'Доставка');
      if (option.kind === 'TAXI') {
        if (option.exactFee !== null && option.exactFee !== undefined) return `${tr('Taksi orqali', 'На такси')} · ${formatNumber(option.exactFee)} ${tr("so'm", 'сум')}`;
        if (option.minFee !== null && option.minFee !== undefined && option.maxFee !== null && option.maxFee !== undefined) return `${tr('Taksi orqali', 'На такси')} · ${formatNumber(option.minFee)}–${formatNumber(option.maxFee)} ${tr("so'm", 'сум')}`;
        return tr('Taksi orqali', 'На такси');
      }
      return escapeHtml(option.providerName || tr('Pochta', 'Почта'));
    }

    function deliveryOptionIcon(option) {
      if (option?.kind === 'TAXI') return 'car-front';
      if (option?.kind === 'POST') return 'package';
      if (option?.kind === 'FREE') return 'badge-check';
      return 'truck';
    }

    function deliveryOptionNotice(option) {
      if (!option) return '';
      if (option.kind === 'TAXI') {
        const hasExact = option.exactFee !== null && option.exactFee !== undefined;
        const hasRange = option.minFee !== null && option.minFee !== undefined && option.maxFee !== null && option.maxFee !== undefined;
        if (hasExact) return tr(
          `Yetkazib berish taxminan ${formatNumber(option.exactFee)} so'm. Bu summa buyurtmaga qo'shilmaydi; olganda haydovchiga alohida to'laysiz.`,
          `Доставка ориентировочно ${formatNumber(option.exactFee)} сум. Сумма не включается в заказ и оплачивается водителю отдельно.`
        );
        if (hasRange) return tr(
          `Yetkazib berish taxminan ${formatNumber(option.minFee)}–${formatNumber(option.maxFee)} so'm. Bu summa buyurtmaga qo'shilmaydi; olganda haydovchiga alohida to'laysiz. ${formatNumber(option.maxFee)} so'm — siz tasdiqlagan maksimal limit.`,
          `Доставка ориентировочно ${formatNumber(option.minFee)}–${formatNumber(option.maxFee)} сум. Сумма не включается в заказ и оплачивается водителю отдельно. ${formatNumber(option.maxFee)} сум — подтверждённый вами максимум.`
        );
        // 7-band: narx umuman kiritilmagan — faqat admin izohi bo'lsa uni
        // (tashqi kod orqali) ko'rsatish uchun bo'sh qatorni qaytaramiz,
        // izoh ham bo'lmasa aniq belgilangan standart matn ko'rsatiladi.
        if (option.comment) return '';
        return tr(
          "Buyurtma taksi orqali yetkaziladi. Buyurtma summasi mijoz tomonidan to'lanadi.",
          'Заказ будет доставлен на такси. Сумма заказа оплачивается клиентом.'
        );
      }
      if (option.kind === 'POST' && option.payer === 'CUSTOMER') return tr(
        "Yetkazib berish narxi tovar hajmi/og'irligi va pochta xizmatining amaldagi tariflariga muvofiq hisoblanadi. To'lov pochta xizmatiga alohida amalga oshiriladi.",
        'Стоимость доставки рассчитывается по габаритам/весу и действующим тарифам почты. Оплата производится почтовой службе отдельно.'
      );
      if (option.kind === 'POST') return tr("Pochta xarajati sotuvchi hisobidan; sizdan alohida haq olinmaydi.", 'Почтовые расходы оплачивает продавец; отдельной оплаты с вас нет.');
      if (option.kind === 'FREE') return tr('Yetkazib berish bepul.', 'Доставка бесплатная.');
      return tr('Yetkazib berish narxi hozir to‘lanadigan jami summaga qo‘shiladi.', 'Стоимость доставки включена в итоговую сумму к оплате.');
    }

    function clearCheckoutReceipt() {
      checkoutReceiptSelectionVersion += 1;
      if (checkoutReceiptPreviewUrl) URL.revokeObjectURL(checkoutReceiptPreviewUrl);
      checkoutReceiptFile = null;
      checkoutReceiptPreparing = null;
      checkoutReceiptPreviewUrl = null;
    }

    // 1.8: native "Choose file / No file chosen" matni hech qachon ko'rinmasin —
    // faqat custom tugma + tanlangach preview + "Almashtirish".
    function renderReceiptPicker(receiptRequired) {
      const label = `${tr("To'lov cheki/skrinshoti", 'Чек/скриншот оплаты')} ${receiptRequired ? '*' : `(${tr('ixtiyoriy', 'необязательно')})`}`;
      // 5-band: boshqa barcha rasm joylari kabi ikkita alohida manba —
      // Galereya (accept=image/*) va Fayllar (accept'siz) — ikkalasi ham
      // bir xil onCheckoutReceiptPicked(event) handler'ga ulanadi.
      const galleryInput = `<input id="chk-receipt" type="file" accept="image/*" onchange="onCheckoutReceiptPicked(event)" class="hidden">`;
      const filesInput = `<input id="chk-receipt-files" type="file" onchange="onCheckoutReceiptPicked(event)" class="hidden">`;
      if (checkoutReceiptPreviewUrl) {
        return `
          <label class="block font-bold">${label}</label>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <img src="${checkoutReceiptPreviewUrl}" class="h-16 w-16 object-cover rounded-xl border" alt="">
            <button type="button" onclick="openImagePickerSheet('chk-receipt','chk-receipt-files')" class="fc-btn fc-btn-secondary" style="min-height:2.5rem;padding:0 .875rem"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Almashtirish', 'Заменить')}</button>
            ${galleryInput}${filesInput}
          </div>`;
      }
      return `
        <label class="block font-bold">${label}</label>
        <div class="flex items-center gap-2 mt-1 flex-wrap">
          <button type="button" onclick="openImagePickerSheet('chk-receipt','chk-receipt-files')" class="fc-btn fc-receipt-picker-btn"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Chekni tanlash', 'Выбрать чек')}</button>
          ${galleryInput}${filesInput}
        </div>`;
    }

    function rerenderReceiptPicker() {
      const wrap = document.getElementById('chk-receipt-wrap');
      if (!wrap) return;
      const regionKey = document.getElementById('chk-region-key')?.value || checkoutDraft.regionKey || 'tashkent_city';
      const districtValue = document.getElementById('chk-district')?.value || '';
      const selectedPayment = commerce.paymentOptions(fulfillmentConfig, regionKey, districtValue).find(m => m.id === selectedPayMethod);
      wrap.innerHTML = renderReceiptPicker(!!selectedPayment?.receiptRequired || selectedPayment?.id === 'QR');
    }

    function openCheckoutForm() {
      if (Object.keys(cart).length === 0 && Object.keys(bundleCart).length === 0) return;
      clearCheckoutReceipt();
      selectedDeliveryMethodId = checkoutDraft.deliveryMethodId || selectedDeliveryMethodId;
      selectedPayMethod = checkoutDraft.paymentMethodId || selectedPayMethod;
      checkoutPromoCode = ''; appliedPromoState = null; promoApplying = false; promoError = '';
      activePopupModal = 'CHECKOUT_FORM';
      render();
    }

    function closeCheckoutForm() {
      clearCheckoutReceipt();
      activePopupModal = null;
      render();
    }

    function saveCheckoutDraft() {
      checkoutDraft = {
        fullname: document.getElementById('chk-fullname')?.value || '',
        phone: document.getElementById('chk-phone')?.value || '',
        regionKey: document.getElementById('chk-region-key')?.value || 'tashkent_city',
        district: document.getElementById('chk-district')?.value || '',
        address: document.getElementById('chk-address')?.value || '',
        deliveryMethodId: selectedDeliveryMethodId,
        paymentMethodId: selectedPayMethod,
      };
      localStorage.setItem(scopedKey('checkoutDraft'), JSON.stringify(checkoutDraft));
    }

    function applyCheckoutDraftToForm() {
      const fullnameEl = document.getElementById('chk-fullname');
      const phoneEl = document.getElementById('chk-phone');
      if (fullnameEl) fullnameEl.value = checkoutDraft.fullname || (currentUser.firstName + ' ' + currentUser.lastName).trim();
      if (phoneEl) phoneEl.value = checkoutDraft.phone || currentUser.phone || '';
      const regionEl = document.getElementById('chk-region-key');
      const regionKey = TOP_LEVEL_REGION_IDS.includes(checkoutDraft.regionKey) ? checkoutDraft.regionKey : 'tashkent_city';
      if (regionEl) regionEl.value = regionKey;
      selectedDeliveryMethodId = checkoutDraft.deliveryMethodId || selectedDeliveryMethodId;
      selectedPayMethod = checkoutDraft.paymentMethodId || selectedPayMethod;
      // 11-band: handleRegionChange(false) O'RNIGA — u selectedDeliveryMethodId/
      // selectedPayMethod/checkoutSelectedBranq'ni doim reset qilardi, yuqorida
      // shu qatorda tiklangan qiymatlarni zudlik bilan yo'qqa chiqarardi. Faqat
      // #chk-district ro'yxatini shu region uchun to'ldiradigan, hech narsani
      // reset qilmaydigan variant kerak (draft tiklanayotganda region "haqiqatan
      // o'zgargani" yo'q — u shunchaki birinchi marta o'rnatilyapti).
      populateDistrictSelectForRegion(regionKey, checkoutDraft.district || '');
      const addressEl = document.getElementById('chk-address');
      if (addressEl) addressEl.value = checkoutDraft.address || '';
      renderCheckoutOptions();
    }

    // 11-band: handleRegionChange()'dan ajratildi — faqat #chk-district
    // ro'yxatini berilgan region uchun to'ldiradi va tanlovni (mavjud
    // bo'lsa) tiklaydi, hech qanday boshqa checkout holatini (delivery
    // method/payment/branch) reset qilmaydi. handleRegionChange() (haqiqiy
    // foydalanuvchi region'ni o'zgartirganda) va applyCheckoutDraftToForm()
    // (saqlangan draft tiklanayotganda, reset kerak EMAS) ikkalasi ham
    // shundan foydalanadi.
    function populateDistrictSelectForRegion(regionKey, previousDistrict) {
      const districtSelect = document.getElementById('chk-district');
      const districts = regionKey === 'tashkent_city' ? TASHKENT_CITY_DISTRICTS : (UZ_REGIONS_BY_CODE[regionKey] || []);
      if (districtSelect) {
        districtSelect.innerHTML = `<option value="">${tr('— Tanlang —', '— Выберите —')}</option>` + districts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(districtLabelForUi(d))}</option>`).join('');
        const matched = findMatchingDistrictOption(districts, previousDistrict);
        if (matched) districtSelect.value = matched;
      }
      // 2-band: viloyat almashsa — real (delivery_branches asosidagi) tuman
      // ro'yxati ham reset qilinadi; #chk-district esa yuqorida hardcoded
      // ro'yxat bilan darhol to'ldirildi (foydalanuvchi kutmasin), real
      // ro'yxat orqadan kelib uni almashtiradi (yoki bo'sh bo'lsa — hardcoded
      // shundayligicha qoladi).
      checkoutDistrictOptions = [];
      checkoutDistrictOptionsLoadedFor = null;
      loadCheckoutDistrictOptions(regionKey);
    }

    function handleRegionChange(shouldSave = true) {
      const regionKey = document.getElementById('chk-region-key')?.value || 'tashkent_city';
      const districtSelect = document.getElementById('chk-district');
      const previousDistrict = districtSelect?.value || '';
      populateDistrictSelectForRegion(regionKey, previousDistrict);
      selectedDeliveryMethodId = null;
      selectedPayMethod = null;
      clearCheckoutReceipt();
      checkoutSelectedBranch = null;
      checkoutBranches = [];
      checkoutBranchesLoadedFor = null;
      checkoutBranchesLoading = false;
      branchRequestSeq++; // 5.7: har qanday kutilayotgan eski so'rovni bekor qiladi
      renderCheckoutOptions();
      if (shouldSave) saveCheckoutDraft();
    }

    function handleViloyatChange() { handleRegionChange(); }

    // 2-band: bitta #chk-district uchun real tuman/shahar ro'yxati — hardcoded
    // UZ_REGIONS_BY_CODE'dan EMAS (u haqiqiy filial ma'lumotlaridagi
    // district_or_city qiymatlari bilan mos kelmasligi mumkin — masalan
    // "Izboskan" vs "Izboskan tuman"), balki delivery_branches jadvalidagi
    // haqiqiy distinct tumanlardan olinadi. Natija bo'sh bo'lsa (regionda
    // BTS/EMU umuman yo'q), hardcoded ro'yxat o'zgarishsiz qoladi.
    async function loadCheckoutDistrictOptions(regionKey) {
      if (checkoutDistrictOptionsLoadedFor === regionKey) return;
      checkoutDistrictOptionsLoading = true;
      try {
        const result = await callApi('get_delivery_districts', { regionKey });
        checkoutDistrictOptions = result.districts || [];
        checkoutDistrictOptionsLoadedFor = regionKey;
      } catch (e) {
        console.error('Tumanlar ro\'yxatini yuklashda xato:', e);
        checkoutDistrictOptions = [];
        checkoutDistrictOptionsLoadedFor = null;
      } finally {
        checkoutDistrictOptionsLoading = false;
        renderDistrictField();
      }
    }

    // Real ro'yxat kelganda (yoki reload orqali) #chk-district'ni yangilaydi,
    // joriy tanlovni (agar yangi ro'yxatda ham mavjud bo'lsa) saqlab qoladi.
    function renderDistrictField() {
      if (!checkoutDistrictOptions.length) return;
      const select = document.getElementById('chk-district');
      if (!select) return;
      const previousValue = select.value;
      select.innerHTML = `<option value="">${tr('— Tanlang —', '— Выберите —')}</option>` +
        checkoutDistrictOptions.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(districtLabelForUi(d))}</option>`).join('');
      const matched = findMatchingDistrictOption(checkoutDistrictOptions, previousValue);
      if (matched) select.value = matched;
    }

    // Tuman/shahar o'zgarganda: draft saqlanadi, eski filial tanlovi bekor
    // qilinadi, va agar hozir POST provider tanlangan bo'lsa — filiallar shu
    // yangi tuman uchun qayta yuklanadi.
    function handleDistrictChange() {
      saveCheckoutDraft();
      checkoutSelectedBranch = null;
      renderCheckoutOptions();
      checkoutBranches = [];
      checkoutBranchesLoadedFor = null;
      const districtValue = document.getElementById('chk-district')?.value || '';
      if (districtValue && String(selectedDeliveryMethodId || '').startsWith('POST:')) {
        const regionKey = document.getElementById('chk-region-key')?.value || checkoutDraft.regionKey || 'tashkent_city';
        loadCheckoutBranches(regionKey, selectedDeliveryMethodId.slice(5), districtValue);
      } else {
        // 9-band: POST bo'lmagan (yoki hali usul tanlanmagan) holatda filial
        // paneli KO'RSATILMASLIGI kerak — avval bu yerda renderBranchPicker()
        // chaqirilardi, u esa selectedDelivery.kind'ni tekshirmasdan panelni
        // doim ko'rsatib qo'yardi (masalan "Uyigacha" tanlangan holda ham).
        const wrap = document.getElementById('chk-branch-wrap');
        if (wrap) wrap.classList.add('hidden');
      }
    }

    function selectDelivery(methodId) {
      // 2-band: POST provider tuman-maydonini yashirmaydi/almashtirmaydi —
      // bitta umumiy #chk-district har doim ko'rinadi. Agar tuman
      // allaqachon tanlangan bo'lsa, provider bosilgach filiallar darhol
      // shu tuman uchun yuklanadi (Viloyat → Tuman/Shahar → Usul → Filial
      // ketma-ketligi o'zgarmaydi).
      if (methodId !== selectedDeliveryMethodId) checkoutSelectedBranch = null;
      selectedDeliveryMethodId = methodId;
      renderCheckoutOptions();
      saveCheckoutDraft();
      const districtValue = document.getElementById('chk-district')?.value || '';
      if (methodId?.startsWith('POST:') && districtValue) {
        const regionKey = document.getElementById('chk-region-key')?.value || checkoutDraft.regionKey || 'tashkent_city';
        loadCheckoutBranches(regionKey, methodId.slice(5), districtValue);
      }
    }

    async function loadCheckoutBranches(regionKey, providerId, districtValue) {
      const cacheKey = `${regionKey}::${districtValue || ''}::${providerId}`;
      if (checkoutBranchesLoadedFor === cacheKey) return;
      // 5.7: bu so'rovning shaxsiy raqami — javob qaytganda joriy
      // hisoblagich bilan solishtiriladi; agar shu orada region/tuman/provider
      // qayta o'zgargan (va yangi so'rov boshlangan) bo'lsa, bu (eski) javob
      // e'tiborsiz qoldiriladi va UI holatini bosib yubormaydi.
      const requestId = ++branchRequestSeq;
      checkoutBranchesLoading = true;
      checkoutBranchSearch = '';
      renderBranchPicker();
      try {
        const result = await callApi('get_delivery_branches', { regionKey, provider: providerId, district: districtValue || undefined });
        if (requestId !== branchRequestSeq) return; // stale javob — e'tiborsiz
        checkoutBranches = result.branches || [];
        checkoutBranchesLoadedFor = cacheKey;
      } catch (e) {
        if (requestId !== branchRequestSeq) return;
        console.error('Filiallarni yuklashda xato:', e);
        checkoutBranches = [];
        checkoutBranchesLoadedFor = null;
      } finally {
        if (requestId === branchRequestSeq) checkoutBranchesLoading = false;
        renderBranchPicker();
      }
    }

    function branchMatchesSearch(branch, query) {
      if (!query || !query.trim()) return true;
      const { latin, cyrillic } = normalizeText(query);
      const fields = [branch.branch_name, branch.district_or_city, branch.full_address];
      return fields.some(f => {
        if (!f) return false;
        const fNorm = normalizeText(f);
        return fNorm.latin.includes(latin) || fNorm.cyrillic.includes(cyrillic);
      });
    }

    function filterBranchList(query) {
      checkoutBranchSearch = query;
      const listEl = document.getElementById('chk-branch-list');
      if (listEl) listEl.innerHTML = renderBranchListHTML();
    }

    function renderBranchListHTML() {
      if (checkoutBranchesLoading) return `<p class="p-3 text-center text-gray-400">${tr('Yuklanmoqda...', 'Загрузка...')}</p>`;
      const filtered = checkoutBranches.filter(b => branchMatchesSearch(b, checkoutBranchSearch));
      if (!filtered.length) return `<p class="p-3 text-center text-gray-400">${tr("Filial topilmadi.", 'Филиалы не найдены.')}</p>`;
      return filtered.map(b => `
        <button type="button" onclick="selectCheckoutBranch(${b.id})" class="w-full text-left p-2.5 ${checkoutSelectedBranch?.id === b.id ? 'bg-blue-50' : 'bg-white'}">
          <p class="font-bold">${escapeHtml(branchNameLabel(b))}</p>
          <p class="text-[10px] text-gray-500">${escapeHtml(branchDistrictLabel(b))} — ${escapeHtml(branchAddressLabel(b))}</p>
        </button>`).join('');
    }

    function renderBranchPicker() {
      // 9-band: hech qachon POST bo'lmagan yetkazib berish usuli uchun
      // filial panelini ko'rsatmaydi — bu qo'shimcha himoya qatlami, asosiy
      // fix handleDistrictChange()'da (endi bu funksiyani noto'g'ri holatda
      // umuman chaqirmaydi).
      const isPost = String(selectedDeliveryMethodId || '').startsWith('POST:');
      const wrap = document.getElementById('chk-branch-wrap');
      if (wrap) wrap.classList.toggle('hidden', !isPost);
      if (!isPost) return;
      const listEl = document.getElementById('chk-branch-list');
      if (listEl) listEl.innerHTML = renderBranchListHTML();
      renderSelectedBranchSummary();
    }

    function renderSelectedBranchSummary() {
      const el = document.getElementById('chk-branch-selected');
      if (!el) return;
      if (!checkoutSelectedBranch) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      el.innerHTML = `<div class="flex items-start gap-2"><i data-lucide="check-circle-2" class="w-4 h-4 mt-0.5 shrink-0"></i><span><b>${escapeHtml(branchNameLabel(checkoutSelectedBranch))}</b><br>${escapeHtml(branchDistrictLabel(checkoutSelectedBranch))} — ${escapeHtml(branchAddressLabel(checkoutSelectedBranch))}</span></div>`;
      if (window.lucide) lucide.createIcons();
    }

    function selectCheckoutBranch(branchId) {
      checkoutSelectedBranch = checkoutBranches.find(b => b.id === branchId) || null;
      const listEl = document.getElementById('chk-branch-list');
      if (listEl) listEl.innerHTML = renderBranchListHTML();
      renderSelectedBranchSummary();
    }

    function selectPayment(type) {
      if (type !== selectedPayMethod) selectedQrProviderId = null;
      selectedPayMethod = type;
      if (type !== 'CARD' && type !== 'QR') clearCheckoutReceipt();
      renderCheckoutOptions();
      saveCheckoutDraft();
    }
    // 17-band: QR to'lov ikkinchi bosqichi — provayder tanlash, keyin uning
    // QR rasmi/"to'lov sahifasiga o'tish" tugmasi + mavjud chek yuklash
    // ko'rinishi (CARD bilan bir xil) chiqadi.
    function selectQrProvider(providerId) {
      selectedQrProviderId = providerId;
      renderCheckoutOptions();
    }
    function openSafeExternalUrl(url) {
      let parsed;
      try { parsed = new URL(String(url || '')); } catch (_) { return; }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
      if (tg?.openLink) tg.openLink(parsed.href);
      else window.open(parsed.href, '_blank', 'noopener');
    }

    function renderCheckoutOptions() {
      const regionKey = document.getElementById('chk-region-key')?.value || checkoutDraft.regionKey || 'tashkent_city';
      const districtValue = document.getElementById('chk-district')?.value || '';
      const deliveryOptions = commerce.deliveryOptions(fulfillmentConfig, regionKey, districtValue);
      const paymentOptions = commerce.paymentOptions(fulfillmentConfig, regionKey, districtValue);
      if (!deliveryOptions.some(option => option.id === selectedDeliveryMethodId)) {
        // 5.6: yetkazib berish provideri (POST:BTS/POST:EMU) hech qachon
        // avtomatik tanlanmaydi — mijoz buni o'zi bosishi shart. Boshqa
        // turlar (FREE/FIXED/TAXI) uchun avvalgi qulay xulq — birinchisi
        // avtomatik tanlanadi — saqlanadi.
        const fallback = deliveryOptions.find(option => option.kind !== 'POST');
        selectedDeliveryMethodId = fallback ? fallback.id : null;
      }
      if (!paymentOptions.some(option => option.id === selectedPayMethod)) selectedPayMethod = paymentOptions[0]?.id || null;
      const selectedDelivery = deliveryOptions.find(option => option.id === selectedDeliveryMethodId) || null;
      const selectedPayment = paymentOptions.find(option => option.id === selectedPayMethod) || null;
      const totals = commerce.calculateTotals(checkoutSubtotal(), selectedDelivery);

      const deliveryWrap = document.getElementById('delivery-method-wrap');
      if (deliveryWrap) deliveryWrap.innerHTML = deliveryOptions.length ? deliveryOptions.map(option => {
        // 5.6: provider tugmalari tuman tanlanmaguncha bosilmaydigan
        // ko'rinishda ko'rsatiladi — lekin onclick faol qoladi, shunda
        // bosilsa selectDelivery o'zi aniq ogohlantirish ko'rsatadi.
        const disabledLook = option.kind === 'POST' && !districtValue;
        return `
        <button type="button" onclick="selectDelivery('${escapeHtml(option.id)}')" class="fc-checkout-choice ${option.id === selectedDeliveryMethodId ? 'is-selected' : ''} ${disabledLook ? 'is-muted' : ''}">
          <span class="fc-checkout-choice-icon"><i data-lucide="${deliveryOptionIcon(option)}" class="w-4 h-4"></i></span><span>${deliveryOptionLabel(option)}</span>
        </button>`;
      }).join('') : `<div class="fc-bg-danger-soft border fc-border-danger fc-text-danger p-3 rounded-xl font-bold">${tr('Bu hudud uchun yetkazib berish usuli yoqilmagan.', 'Для этого региона способы доставки не настроены.')}</div>`;

      const notice = document.getElementById('delivery-notice');
      if (notice) {
        // 13-band: admin izohi bo'lsa, standart bildirishnoma ostida
        // qo'shimcha qator sifatida chiqadi; bo'lmasa hech narsa qo'shilmaydi.
        const noticeText = escapeHtml(deliveryOptionNotice(selectedDelivery));
        const comment = selectedDelivery?.comment ? `${noticeText ? '<br>' : ''}<b>${escapeHtml(selectedDelivery.comment)}</b>` : '';
        // 9-band: "Yetkazib berish vaqti" — ixtiyoriy, to'ldirilgan bo'lsagina
        // ko'rinadi (bo'sh bo'lsa na label, na bo'sh joy qoladi). Alohida
        // "Taxminiy vaqt:" labelisiz — admin kiritgan qiymat tabiiy gap
        // ichiga qo'yiladi.
        const deliveryFeeLine = Number(totals.deliveryFee) > 0
          ? `${(noticeText || comment) ? '<br>' : ''}<span class="fc-checkout-notice-fee"><i data-lucide="badge-dollar-sign" class="w-3.5 h-3.5"></i><span>${tr('Yetkazib berish narxi', 'Стоимость доставки')}: <b>${money(totals.deliveryFee)}</b></span></span>`
          : '';
        const estimatedTimeVal = selectedDelivery?.estimatedTime ? escapeHtml(selectedDelivery.estimatedTime) : '';
        const estimatedTime = estimatedTimeVal
          ? `${(noticeText || comment || deliveryFeeLine) ? '<br>' : ''}<span class="fc-checkout-notice-time"><i data-lucide="clock-3" class="w-3.5 h-3.5"></i><span>${tr(`${estimatedTimeVal} ichida yetkazib beriladi.`, `Доставка в течение ${estimatedTimeVal}.`)}</span></span>` : '';
        notice.innerHTML = noticeText + comment + deliveryFeeLine + estimatedTime;
        notice.classList.toggle('hidden', !selectedDelivery);
      }
      // 2-band: POST (BTS/EMU) uchun faqat manzil maydoni yashiriladi (uning
      // o'rniga filial tanlash ro'yxati ko'rsatiladi) — tuman maydoni endi
      // BARCHA yetkazib berish usullari uchun umumiy va doim ko'rinadi.
      const isPost = selectedDelivery?.kind === 'POST';
      const districtField = document.getElementById('chk-district-field');
      const addressField = document.getElementById('chk-address-field');
      const branchWrap = document.getElementById('chk-branch-wrap');
      if (districtField) districtField.classList.remove('hidden');
      if (addressField) addressField.classList.toggle('hidden', isPost);
      if (branchWrap) branchWrap.classList.toggle('hidden', !isPost);
      if (isPost) renderBranchPicker();

      const payWrap = document.getElementById('pay-method-wrap');
      if (payWrap) payWrap.innerHTML = paymentOptions.length ? paymentOptions.map(method => {
        const icon = method.id === 'CASH' ? 'banknote' : method.id === 'CARD' ? 'credit-card' : method.id === 'CLICK' ? 'zap' : 'qr-code';
        const label = method.id === 'CASH' ? tr('Naqd','Наличные') : method.id === 'CARD' ? tr('Karta orqali','Картой') : method.id === 'QR' ? tr('QR orqali', 'По QR') : method.name;
        return `<button type="button" onclick="selectPayment('${method.id}')" class="fc-checkout-choice ${method.id === selectedPayMethod ? 'is-selected' : ''}"><span class="fc-checkout-choice-icon"><i data-lucide="${icon}" class="w-4 h-4"></i></span><span>${escapeHtml(label)}</span></button>`;
      }).join('') : `<div class="fc-checkout-choice-empty fc-bg-danger-soft border fc-border-danger fc-text-danger">${tr("Bu hudud uchun to'lov usuli yoqilmagan.", 'Для этого региона способы оплаты не настроены.')}</div>`;

      const cardDetails = document.getElementById('card-payment-details');
      if (cardDetails) {
        if (selectedPayment?.id === 'CARD') {
          cardDetails.classList.remove('hidden');
          cardDetails.innerHTML = `
            <div class="fc-checkout-info-card space-y-1">
              <p class="font-bold text-slate-800 flex items-center gap-1.5"><i data-lucide="credit-card" class="w-4 h-4 text-blue-600"></i>${tr("Pul o'tkaziladigan karta", 'Карта для перевода')}</p>
              <div class="flex items-center gap-2">
                <p id="chk-card-number-display" class="font-mono text-sm font-black">${escapeHtml(selectedPayment.cardNumber || '')}</p>
                <button type="button" onclick="copyCardNumber(document.getElementById('chk-card-number-display').textContent)" class="fc-btn fc-btn-secondary shrink-0" style="min-height:2rem;padding:0 .6rem;font-size:.62rem"><i data-lucide="copy" class="w-3.5 h-3.5"></i>${tr('Nusxalash', 'Копировать')}</button>
              </div>
              <p>${escapeHtml(selectedPayment.cardHolder || '')}</p>
              <p class="text-[10px] text-blue-700">${tr(`CVV, PIN, SMS kod yoki amal qilish muddatini hech kimga bermang — ${escapeHtml(shopDisplayName())} ularni so'ramaydi.`, `Никому не сообщайте CVV, PIN, SMS-код или срок действия — ${escapeHtml(shopDisplayName())} их не запрашивает.`)}</p>
            </div>
            <div id="chk-receipt-wrap">${renderReceiptPicker(selectedPayment.receiptRequired)}</div>`;
        } else if (selectedPayment?.id === 'QR') {
          cardDetails.classList.remove('hidden');
          const enabledProviders = (selectedPayment.providers || []).filter(p => p.enabled && p.paymentUrl);
          const activeProvider = enabledProviders.find(p => p.id === selectedQrProviderId) || null;
          cardDetails.innerHTML = `
            <div class="space-y-2">
              <p class="font-bold text-gray-700 text-xs">${tr('Provayderni tanlang', 'Выберите провайдера')}</p>
              <div class="fc-checkout-choice-grid">
                ${enabledProviders.map(p => `<button type="button" onclick="selectQrProvider('${p.id}')" class="fc-checkout-choice ${p.id === selectedQrProviderId ? 'is-selected' : ''}"><span class="fc-checkout-choice-icon"><i data-lucide="qr-code" class="w-4 h-4"></i></span><span>${escapeHtml(p.name)}</span></button>`).join('')}
              </div>
              ${!enabledProviders.length ? `<p class="text-[11px] fc-text-danger font-bold">${tr("Hozircha QR provayder sozlanmagan.", "QR-провайдер пока не настроен.")}</p>` : ''}
              ${activeProvider ? `
                <div class="fc-checkout-info-card space-y-2 text-center">
                  ${activeProvider.qrImageUrl ? `<img src="${escapeHtml(activeProvider.qrImageUrl)}" class="w-40 h-40 object-contain rounded-xl border bg-white mx-auto">` : ''}
                  <p class="font-bold text-blue-900">${escapeHtml(activeProvider.name)}</p>
                  <button type="button" onclick="openSafeExternalUrl('${escapeHtml(activeProvider.paymentUrl)}')" class="fc-btn fc-btn-primary w-full"><i data-lucide="external-link" class="w-4 h-4"></i>${tr("To'lov sahifasiga o'tish", "Перейти к оплате")}</button>
                </div>
                <div id="chk-receipt-wrap">${renderReceiptPicker(true)}</div>
              ` : ''}
            </div>`;
        } else if (selectedPayment?.id === 'CLICK') {
          cardDetails.classList.remove('hidden');
          cardDetails.innerHTML = `
            <div class="fc-checkout-info-card space-y-1 text-center">
              <p class="font-bold text-slate-800 flex items-center justify-center gap-1.5"><i data-lucide="zap" class="w-4 h-4 text-blue-600"></i>${tr("Click orqali avtomatik to'lov", "Автоматическая оплата через Click")}</p>
              <p class="text-[11px] text-blue-700">${tr("Buyurtmani yuborganingizdan so'ng, to'lov so'rovi Click ilovangizga yuboriladi. To'lov tasdiqlanishi bilan buyurtma avtomatik qabul qilinadi — chek yuklash shart emas.", "После отправки заказа запрос на оплату придёт в ваше приложение Click. После подтверждения оплаты заказ будет принят автоматически — чек загружать не нужно.")}</p>
            </div>`;
        } else {
          cardDetails.classList.add('hidden');
          cardDetails.innerHTML = '';
        }
      }
      const subtotalEl = document.getElementById('checkout-subtotal');
      const deliveryFeeEl = document.getElementById('checkout-delivery-fee');
      const payableEl = document.getElementById('checkout-payable-total');
      const promoWrapEl = document.getElementById('chk-promo-wrap');
      const promoRowEl = document.getElementById('checkout-promo-row');
      const promoDiscountEl = document.getElementById('checkout-promo-discount');
      if (promoWrapEl) promoWrapEl.innerHTML = renderPromoWrapHtml();
      const promoDiscount = appliedPromoState?.discountAmount || 0;
      if (promoRowEl) promoRowEl.classList.toggle('hidden', !appliedPromoState);
      if (promoDiscountEl) promoDiscountEl.textContent = promoDiscount ? `-${money(promoDiscount)}` : money(0);
      if (subtotalEl) subtotalEl.textContent = money(totals.subtotal);
      if (deliveryFeeEl) deliveryFeeEl.textContent = selectedDelivery?.kind === 'FIXED' ? money(totals.deliveryFee) : (selectedDelivery?.kind === 'TAXI' ? tr('Alohida', 'Отдельно') : (selectedDelivery?.kind === 'POST' && selectedDelivery.payer === 'CUSTOMER' ? tr('Pochta tarifida', 'По тарифу почты') : money(0)));
      if (payableEl) payableEl.textContent = money(Math.max(0, totals.payableTotal - promoDiscount));
      if (window.lucide) lucide.createIcons();
    }

    async function onCheckoutReceiptPicked(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      imageIO.logStage('FILE_SELECTED', { mime: file.type, size: file.size });
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
        event.target.value = '';
        return alert(isLikelyHeicFile(file)
          ? tr("⚠️ HEIC/HEIF formati hali qo'llab-quvvatlanmaydi. Chekni JPG/PNG formatida yuklang.", "⚠️ Формат HEIC/HEIF пока не поддерживается. Загрузите чек в формате JPG/PNG.")
          : tr('Chek JPG, PNG yoki WebP bo‘lishi va 15MB dan oshmasligi kerak.', 'Чек должен быть JPG, PNG или WebP размером до 15 МБ.'));
      }
      // 1.11: preview tanlangan zahoti ORIGINAL File'dan ko'rsatiladi — V2:
      // FileReader/ArrayBuffer orqali oldindan o'qish shart emas.
      const selectionVersion = ++checkoutReceiptSelectionVersion;
      checkoutReceiptFile = file;
      if (checkoutReceiptPreviewUrl) { try { URL.revokeObjectURL(checkoutReceiptPreviewUrl); } catch (_) {} }
      checkoutReceiptPreviewUrl = URL.createObjectURL(file);
      checkoutReceiptPreparing = captureAndPrepareImageV2(file, MAX_RECEIPT_BYTES, 1600, 0.85, (updated) => {
        if (selectionVersion !== checkoutReceiptSelectionVersion) return;
        try {
          const stableUrl = URL.createObjectURL(updated);
          const oldUrl = checkoutReceiptPreviewUrl;
          checkoutReceiptPreviewUrl = stableUrl;
          rerenderReceiptPicker();
          if (oldUrl && oldUrl !== stableUrl && oldUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(oldUrl); } catch (_) {}
          }
        } catch (previewErr) {
          imageIO.logStage('PREVIEW_FAILED', { message: previewErr?.message, level: 'warn' });
        }
      });
      rerenderReceiptPicker();
    }

    // 1.7: chek order bilan BIR VAQTDA, bitta create_order so'rovida yuboriladi
    // (order avval yaratilib, chek keyin "ixtiyoriy qo'shimcha" sifatida
    // yuborilmaydi) — shunday qilib order chekssiz "muvaffaqiyatli" holatda
    // qolib ketmaydi. Product rasmlaridagi kabi Telegram WebView -> Storage
    // cross-origin signed upload'ga tayanmaymiz; baytlar autentifikatsiyalangan
    // app-api orqali yuboriladi.
    async function prepareReceiptImageUpload() {
      if (!checkoutReceiptFile && !checkoutReceiptPreparing) return null;
      let prepared;
      try {
        prepared = checkoutReceiptPreparing ? await checkoutReceiptPreparing : checkoutReceiptFile;
      } catch (e) {
        console.error('[receipt:READ_ORIGINAL_FAILED]', e);
        // 5.2: eski (allaqachon rad etilgan) promise qayta-qayta kutilib,
        // "Yuborish" cheksiz bir xil xato bilan qaytmasligi uchun — chek
        // holatini tozalaymiz, foydalanuvchi ochiq ko'rinishda qayta tanlaydi.
        clearCheckoutReceipt();
        rerenderReceiptPicker();
        throw new Error('receipt_read_failed');
      }
      if (!prepared || prepared.size > 6 * 1024 * 1024) throw new Error('receipt_too_large');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(prepared.type)) throw new Error('invalid_receipt_file');
      return {
        base64: await fileToBase64(prepared),
        mimeType: prepared.type,
        fileName: prepared.name || 'payment-receipt.jpg',
      };
    }

    let submittingOrder = false;
    async function submitOrder() {
      if (ordersPaused) {
        return alert(ordersPausedNote ? `${tr("Do'kon hozircha yangi buyurtmalarni qabul qilmayapti.", "Магазин временно не принимает новые заказы.")}\n\n${ordersPausedNote}` : tr("Do'kon hozircha yangi buyurtmalarni qabul qilmayapti.", "Магазин временно не принимает новые заказы."));
      }
      if (myStatus.isBlocked) {
        return alert(`${tr("🚫 Siz botdan foydalanish huquqidan mahrum qilingansiz", "🚫 Доступ к оформлению заказов заблокирован")}.\n${tr('Sabab','Причина')}: ${myStatus.blockReason || tr("ko'rsatilmagan",'не указана')}\n\n${tr("Batafsil ma'lumot uchun Profil bo'limiga qarang.",'Подробности смотрите в разделе «Профиль».')}`);
      }

      const fullname = document.getElementById('chk-fullname').value.trim();
      const phone = document.getElementById('chk-phone').value.trim();
      const regionKey = document.getElementById('chk-region-key').value;
      const selectedDistrictValue = document.getElementById('chk-district').value.trim();
      const deliveryOptions = commerce.deliveryOptions(fulfillmentConfig, regionKey, selectedDistrictValue);
      const paymentOptions = commerce.paymentOptions(fulfillmentConfig, regionKey, selectedDistrictValue);
      const selectedDelivery = deliveryOptions.find(option => option.id === selectedDeliveryMethodId);
      const selectedPayment = paymentOptions.find(method => method.id === selectedPayMethod);
      const isPostDelivery = selectedDelivery?.kind === 'POST';

      // 1.13/1.14: BTS/EMU uchun mijoz qo'lda tuman/manzil yozmaydi — ro'yxatdan
      // tanlangan filial manzili ishlatiladi.
      const tuman = isPostDelivery ? (checkoutSelectedBranch?.district_or_city || '') : selectedDistrictValue;
      const district = isPostDelivery ? tuman : (regionKey === 'tashkent_city' ? tuman : `${topLevelRegionLabel(regionKey)}, ${tuman}`);
      const address = isPostDelivery ? (checkoutSelectedBranch?.full_address || '') : document.getElementById('chk-address').value.trim();

      let hasError = false;

      const requiredFields = isPostDelivery
        ? [['chk-fullname', fullname], ['chk-phone', phone]]
        : [['chk-fullname', fullname], ['chk-phone', phone], ['chk-district', tuman], ['chk-address', address]];

      requiredFields.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (!val || val === '+998') {
          el.classList.add('fc-border-danger', 'fc-bg-danger-soft');
          hasError = true;
        } else {
          el.classList.remove('fc-border-danger', 'fc-bg-danger-soft');
        }
      });

      if (hasError) return alert(tr("Iltimos, barcha qizil maydonlarni to'ldiring!", "Заполните все поля, отмеченные красным!"));

      if (!isValidPhone(phone)) {
        document.getElementById('chk-phone').classList.add('fc-border-danger', 'fc-bg-danger-soft');
        return alert(tr("Iltimos, telefon raqamini to'g'ri formatda kiriting: +998901234567", "Введите телефон в формате +998901234567"));
      }

      if (!selectedDelivery) return alert(tr('Bu hudud uchun yetkazib berish usulini tanlang.', 'Выберите доступный способ доставки.'));
      if (isPostDelivery && !checkoutSelectedBranch) return alert(tr('Iltimos, pochta filialini tanlang.', 'Пожалуйста, выберите отделение почты.'));
      if (!selectedPayment) return alert(tr("Bu hudud uchun to'lov usuli mavjud emas.", 'Для этого региона нет доступного способа оплаты.'));
      const selectedQrProvider = selectedPayment.id === 'QR' ? (selectedPayment.providers || []).find(p => p.id === selectedQrProviderId && p.enabled && p.paymentUrl) : null;
      if (selectedPayment.id === 'QR' && !selectedQrProvider) {
        return alert(tr("Iltimos, QR to'lov provayderini tanlang.", 'Пожалуйста, выберите QR-провайдера оплаты.'));
      }
      if ((selectedPayment.id === 'CARD' && selectedPayment.receiptRequired || selectedPayment.id === 'QR') && !checkoutReceiptFile && !checkoutReceiptPreparing) {
        return alert(tr("Buyurtmani yuborish uchun to'lov chekini yuklang.", 'Чтобы отправить заказ, загрузите чек оплаты.'));
      }

      // Savatdagi har bir variant bo'yicha tezkor tekshiruv. Yakuniy atomik tekshiruv serverda.
      for (const [key, itemData] of Object.entries(cart)) {
        const productId = cartEntryProductId(key, itemData);
        const p = products.find(prod => prod.id === productId);
        if (!productVisibleInCurrentMode(p)) return alert(tr('❌ Savatchadagi mahsulot hozir sotuvda ko‘rinmaydi. Savatchani yangilang.', '❌ Товар из корзины сейчас скрыт из продажи. Обновите корзину.'));
        const available = productVariants(p).length
          ? variantQty(p, itemData.size || null, itemData.color || null)
          : Number(p.stock) || 0;
        if ((Number(itemData.qty) || 0) > available) {
          const label = [itemData.size,itemData.color].filter(Boolean).join(' / ');
          return alert(`❌ "${productName(p)}"${label ? ' ('+label+')' : ''} ${tr("omborda yetarli emas. Iltimos, savatchani tekshiring.",'недостаточно на складе. Проверьте корзину.')}`);
        }
      }

      if (submittingOrder) return;
      submittingOrder = true;
      showLoader(tr("Buyurtma qabul qilinmoqda...", "Заказ оформляется..."));

      const itemsPayload = Object.entries(cart).map(([key, itemData]) => ({
        productId: cartEntryProductId(key, itemData), qty: itemData.qty, size: itemData.size || null, color: itemData.color || null
      }));
      const bundleItemsPayload = Object.entries(bundleCart).map(([bundleId, b]) => ({ bundleId, qty: b.qty }));

      try {
        // 1.7: chek order bilan BIR so'rovda, atomik tarzda yuboriladi — order
        // avval yaratilib, chek "keyinroq, ixtiyoriy" tarzda ulanmaydi.
        let receiptImageUpload = null;
        try { receiptImageUpload = await prepareReceiptImageUpload(); }
        catch (prepError) {
          if (String(prepError?.message) === 'receipt_read_failed') {
            return alert(tr("Chek rasmini o'qib bo'lmadi. Iltimos, chek rasmini qaytadan tanlang.", "Не удалось прочитать фото чека. Пожалуйста, выберите фото чека заново."));
          }
          return alert(tr("Chek rasmi yaroqsiz yoki juda katta (JPG/PNG/WebP, 6MB gacha).", 'Файл чека повреждён или слишком большой (JPG/PNG/WebP, до 6 МБ).'));
        }

        const result = await callApi('create_order', {
          items: itemsPayload, bundleItems: bundleItemsPayload, fullname, phone, regionKey, district, address,
          deliveryMethodId: selectedDeliveryMethodId,
          paymentMethodId: selectedPayment.id === 'QR' ? `QR:${selectedQrProvider.id}` : selectedPayMethod,
          receiptImageUpload, branchId: isPostDelivery ? checkoutSelectedBranch?.id : undefined,
          promoCode: appliedPromoState?.code || undefined,
        });
        const newOrder = formatOrderForUi(result.order);
        orders.unshift(newOrder);
        ordersLoaded = true;
        cart = {};
        bundleCart = {};
        localStorage.setItem(scopedKey('cart'), JSON.stringify(cart));
        saveBundleCart();
        checkoutPromoCode = ''; appliedPromoState = null; promoError = '';
        activePopupModal = null;
        checkoutDraft = { fullname: '', phone: '', regionKey: 'tashkent_city', district: '', address: '', deliveryMethodId: null, paymentMethodId: null };
        localStorage.removeItem(scopedKey('checkoutDraft'));
        clearCheckoutReceipt();
        checkoutSelectedBranch = null;
        checkoutBranches = [];
        checkoutBranchesLoadedFor = null;
        checkoutDistrictOptions = [];
        checkoutDistrictOptionsLoadedFor = null;
        openOrderSuccessCelebration(newOrder.id, selectedPayment.id === 'CLICK');
      } catch (e) {
        console.error(e);
        if (String(e.message).includes('insufficient_stock')) {
          alert(tr("❌ Afsuski, savatchangizdagi bir yoki bir nechta tovar omborda tugab qoldi. Savatchani tekshiring.", "❌ Один или несколько товаров в корзине закончились. Проверьте корзину."));
        } else if (String(e.message).includes('bundle_unavailable')) {
          alert(tr("❌ Savatchangizdagi bir aksiya endi mavjud emas (o'chirilgan yoki muddati tugagan). Savatchani tekshiring.", "❌ Одна из акций в корзине больше недоступна (удалена или истёк срок). Проверьте корзину."));
        } else if (String(e.message).startsWith('blocked:')) {
          myStatus.isBlocked = true;
          myStatus.blockReason = e.message.slice('blocked:'.length);
          alert(`${tr("🚫 Siz botdan foydalanish huquqidan mahrum qilingansiz", "🚫 Доступ к оформлению заказов заблокирован")}.\n${tr('Sabab','Причина')}: ${myStatus.blockReason}`);
        } else if (String(e.message).includes('receipt_required')) {
          alert(tr("Buyurtmani yuborish uchun to'lov chekini yuklang.", 'Чтобы отправить заказ, загрузите чек оплаты.'));
        } else if (String(e.message).includes('receipt_upload_failed')) {
          alert(tr("❌ To'lov cheki yuklanmadi, shuning uchun buyurtma yaratilmadi. Qayta urinib ko'ring.", "❌ Чек оплаты не загрузился, поэтому заказ не был создан. Попробуйте ещё раз."));
        } else if (String(e.message).includes('branch_required') || String(e.message).includes('invalid_branch')) {
          checkoutSelectedBranch = null;
          alert(tr("Iltimos, pochta filialini qaytadan tanlang.", 'Пожалуйста, выберите отделение почты заново.'));
        } else {
          alert(tr("❌ Buyurtmani yuborishda xatolik yuz berdi. Qayta urinib ko'ring.", "❌ Не удалось отправить заказ. Попробуйте ещё раз."));
        }
      } finally {
        submittingOrder = false;
        hideLoader();
      }
    }

    function openOrderSuccessCelebration(orderId, isClickPayment) {
      selectedProductModal = null;
      document.getElementById('modal-container').innerHTML = `
        <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-3xl p-6 text-center max-w-sm w-full space-y-4 shadow-2xl">
            <div class="text-5xl">🎉</div>
            <h3 class="text-xl font-black text-gray-900">${tr("Buyurtmangiz qabul qilindi!", "Ваш заказ принят!")}</h3>
            <p class="text-xs text-gray-500">${tr("Buyurtma ID:", "ID заказа:")} <b class="text-blue-600">#${orderId}</b>${isClickPayment
              ? tr(". To'lov so'rovi Click ilovangizga yuborildi — to'lovni shu yerda tasdiqlang.", ". Запрос на оплату отправлен в ваше приложение Click — подтвердите оплату там.")
              : tr(`. ${escapeHtml(shopDisplayName())} mutaxassislari tez orada siz bilan bog'lanishadi.`, `. Специалисты ${escapeHtml(shopDisplayName())} скоро свяжутся с вами.`)}</p>
            <button onclick="document.getElementById('modal-container').innerHTML=''; switchTab('orders');" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-xs">
              ${tr("📦 Buyurtmalarda ko\'rish", "📦 Посмотреть в заказах")}
            </button>
          </div>
        </div>
      `;
    }

    // 4. ORDERS TAB (USER & ADMIN)
    function orderCreatedDate(o) {
      const d = new Date(o?.createdAt || o?.date || 0);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    function orderDateKey(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function parseOrderDateKey(key, endOfDay = false) {
      const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const d = endOfDay
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
        : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    function selectOrdersCalendarDate(key) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return;
      if (!ordersCalendarDraftFrom || ordersCalendarDraftTo) {
        ordersCalendarDraftFrom = key;
        ordersCalendarDraftTo = '';
      } else {
        if (key < ordersCalendarDraftFrom) { ordersCalendarDraftTo = ordersCalendarDraftFrom; ordersCalendarDraftFrom = key; }
        else ordersCalendarDraftTo = key;
      }
      render();
    }
    function openOrdersCalendarModal(event) {
      const btn = event?.currentTarget || event?.target?.closest?.('.fc-orders-calendar-trigger');
      if (btn?.getBoundingClientRect) {
        const r = btn.getBoundingClientRect();
        ordersCalendarAnchorRect = { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      }
      // Default oxirgi 1 oy filtr sifatida ishlaydi, ammo kalendarda bo'yalmaydi.
      ordersCalendarDraftFrom = ordersDateFrom || '';
      ordersCalendarDraftTo = ordersDateTo || '';
      const basis = ordersCalendarDraftFrom ? parseOrderDateKey(ordersCalendarDraftFrom) : new Date();
      ordersCalendarMonth = `${basis.getFullYear()}-${String(basis.getMonth()+1).padStart(2,'0')}`;
      ordersCalendarPickerMode = 'days';
      activePopupModal = 'ORDERS_CALENDAR';
      render();
    }
    function cancelOrdersCalendarSelection() {
      ordersCalendarDraftFrom = '';
      ordersCalendarDraftTo = '';
      activePopupModal = null;
      render();
    }
    function applyOrdersCalendarSelection() {
      if (!ordersCalendarDraftFrom || !ordersCalendarDraftTo) return;
      ordersDateFrom = ordersCalendarDraftFrom;
      ordersDateTo = ordersCalendarDraftTo;
      ordersPage = 1;
      activePopupModal = null;
      render();
    }
    function clearOrdersDateRange() {
      // ROUND14: popupdagi reset draft BILAN BIRGA amaldagi filtrni ham tozalaydi.
      ordersCalendarDraftFrom = '';
      ordersCalendarDraftTo = '';
      ordersDateFrom = '';
      ordersDateTo = '';
      ordersPage = 1;
      render();
    }
    function clearCommittedOrdersDateRange() {
      ordersDateFrom = '';
      ordersDateTo = '';
      ordersPage = 1;
      render();
    }
    function changeOrdersCalendarMonth(delta) {
      const m = String(ordersCalendarMonth || '').match(/^(\d{4})-(\d{2})$/);
      const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
      d.setMonth(d.getMonth() + Number(delta || 0));
      ordersCalendarMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      render();
    }

    function setOrdersCalendarPickerMode(mode) {
      ordersCalendarPickerMode = mode || 'days';
      const m = String(ordersCalendarMonth || '').match(/^(\d{4})-(\d{2})$/);
      const year = m ? Number(m[1]) : new Date().getFullYear();
      if (ordersCalendarPickerMode === 'years') ordersCalendarYearPageStart = Math.floor(year / 12) * 12;
      render();
    }
    function selectOrdersCalendarMonth(monthIndex) {
      const m = String(ordersCalendarMonth || '').match(/^(\d{4})-(\d{2})$/);
      const year = m ? Number(m[1]) : new Date().getFullYear();
      ordersCalendarMonth = `${year}-${String(Number(monthIndex)+1).padStart(2,'0')}`;
      ordersCalendarPickerMode = 'days';
      render();
    }
    function selectOrdersCalendarYear(year) {
      const m = String(ordersCalendarMonth || '').match(/^(\d{4})-(\d{2})$/);
      const month = m ? Number(m[2]) : (new Date().getMonth()+1);
      ordersCalendarMonth = `${Number(year)}-${String(month).padStart(2,'0')}`;
      ordersCalendarPickerMode = 'months';
      render();
    }
    function changeOrdersCalendarYearPage(delta) {
      const base = Number.isFinite(Number(ordersCalendarYearPageStart)) ? Number(ordersCalendarYearPageStart) : Math.floor(new Date().getFullYear()/12)*12;
      ordersCalendarYearPageStart = base + Number(delta || 0) * 12;
      render();
    }

    function formatOrderRangeDate(key) {
      const d = parseOrderDateKey(key);
      if (!d) return '';
      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }

    function filterOrdersBySelectedDate(source) {
      // ROUND14: kalendarda aniq sana oralig'i bo'lmasa HECH QANDAY yashirin
      // default davr qo'llanmaydi. Reset = barcha buyurtmalar.
      if (!ordersDateFrom || !ordersDateTo) return [...source];
      const from = parseOrderDateKey(ordersDateFrom, false);
      const to = parseOrderDateKey(ordersDateTo, true);
      if (!from || !to) return [...source];
      return source.filter(o => { const d = orderCreatedDate(o); return !!d && d >= from && d <= to; });
    }

    function renderOrdersCalendarBodyHtml() {
      const monthMatch = String(ordersCalendarMonth || '').match(/^(\d{4})-(\d{2})$/);
      const base = monthMatch ? new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1) : new Date();
      const year = base.getFullYear(), month = base.getMonth();
      const monthNamesUz = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
      const monthNamesRu = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
      const monthNames = uiLang === 'ru' ? monthNamesRu : monthNamesUz;
      const weekDays = uiLang === 'ru' ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Du','Se','Cho','Pa','Ju','Sha','Ya'];
      const rangeText=ordersCalendarDraftFrom&&ordersCalendarDraftTo?`${formatOrderRangeDate(ordersCalendarDraftFrom)} — ${formatOrderRangeDate(ordersCalendarDraftTo)}`:ordersCalendarDraftFrom?tr(`${formatOrderRangeDate(ordersCalendarDraftFrom)} — tugash sanasini tanlang`,`${formatOrderRangeDate(ordersCalendarDraftFrom)} — выберите дату окончания`):tr('Sana oralig‘ini tanlang','Выберите период');
      let body = '';
      if (ordersCalendarPickerMode === 'months') {
        body = `<div class="fc-orders-picker-grid fc-orders-month-grid">${monthNames.map((name,i)=>`<button type="button" class="${i===month?'is-current':''}" onclick="selectOrdersCalendarMonth(${i})">${escapeHtml(name)}</button>`).join('')}</div>`;
      } else if (ordersCalendarPickerMode === 'years') {
        const start = Number.isFinite(Number(ordersCalendarYearPageStart)) ? Number(ordersCalendarYearPageStart) : Math.floor(year/12)*12;
        const years = Array.from({length:12},(_,i)=>start+i);
        body = `<div class="fc-orders-year-nav"><button type="button" onclick="changeOrdersCalendarYearPage(-1)" class="fc-orders-calendar-nav"><i data-lucide="chevron-left" class="w-4 h-4"></i></button><b>${start}–${start+11}</b><button type="button" onclick="changeOrdersCalendarYearPage(1)" class="fc-orders-calendar-nav"><i data-lucide="chevron-right" class="w-4 h-4"></i></button></div><div class="fc-orders-picker-grid fc-orders-year-grid">${years.map(y=>`<button type="button" class="${y===year?'is-current':''}" onclick="selectOrdersCalendarYear(${y})">${y}</button>`).join('')}</div>`;
      } else {
        const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7, dayCount = new Date(year, month + 1, 0).getDate();
        const todayKey = orderDateKey(new Date()), cells = [];
        for (let i=0;i<firstOffset;i++) cells.push('<span class="fc-orders-calendar-empty"></span>');
        for (let day=1;day<=dayCount;day++) {
          const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const isStart=key===ordersCalendarDraftFrom,isEnd=key===ordersCalendarDraftTo,inRange=!!(ordersCalendarDraftFrom&&ordersCalendarDraftTo&&key>ordersCalendarDraftFrom&&key<ordersCalendarDraftTo),pending=!!(ordersCalendarDraftFrom&&!ordersCalendarDraftTo&&isStart),single=!!(isStart&&isEnd);
          const cls=['fc-orders-calendar-day',isStart?'is-start':'',isEnd?'is-end':'',inRange?'is-in-range':'',pending?'is-pending':'',single?'is-single':'',key===todayKey?'is-today':''].filter(Boolean).join(' ');
          cells.push(`<button type="button" onclick="selectOrdersCalendarDate('${key}')" class="${cls}">${day}</button>`);
        }
        body = `<div class="fc-orders-calendar-weekdays">${weekDays.map(d=>`<span>${d}</span>`).join('')}</div><div class="fc-orders-calendar-grid">${cells.join('')}</div><p class="fc-orders-calendar-hint">${tr('Bitta kun uchun sanani ikki marta bosing. Oraliq uchun boshlanish va tugash sanasini tanlang.','Для одного дня нажмите дату дважды. Для периода выберите начало и конец.')}</p>`;
      }
      return `<div class="fc-orders-calendar-card"><div class="fc-orders-calendar-top"><div class="fc-orders-calendar-title"><span class="fc-orders-calendar-title-icon"><i data-lucide="calendar-days" class="w-4 h-4"></i></span><div><b>${tr('Buyurtmalar sanasi','Дата заказов')}</b><small>${escapeHtml(rangeText)}</small></div></div>${(ordersCalendarDraftFrom||ordersCalendarDraftTo)?`<button type="button" onclick="clearOrdersDateRange()" class="fc-orders-calendar-clear" aria-label="${tr('Tozalash','Сбросить')}"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>`:''}</div><div class="fc-orders-calendar-monthbar"><button type="button" onclick="changeOrdersCalendarMonth(-1)" class="fc-orders-calendar-nav" ${ordersCalendarPickerMode==='days'?'':'style="visibility:hidden"'}><i data-lucide="chevron-left" class="w-4 h-4"></i></button><div class="fc-orders-calendar-period"><button type="button" onclick="setOrdersCalendarPickerMode('months')">${escapeHtml(monthNames[month])}</button><button type="button" onclick="setOrdersCalendarPickerMode('years')">${year}</button></div><button type="button" onclick="changeOrdersCalendarMonth(1)" class="fc-orders-calendar-nav" ${ordersCalendarPickerMode==='days'?'':'style="visibility:hidden"'}><i data-lucide="chevron-right" class="w-4 h-4"></i></button></div>${body}${ordersCalendarDraftFrom?`<div class="fc-orders-calendar-actions"><button type="button" onclick="cancelOrdersCalendarSelection()" aria-label="${tr('Bekor qilish','Отмена')}" title="${tr('Bekor qilish','Отмена')}"><i data-lucide="x" class="w-4 h-4"></i></button><button type="button" onclick="applyOrdersCalendarSelection()" ${ordersCalendarDraftTo?'':'disabled'} class="is-primary" aria-label="${tr('Saqlash','Сохранить')}" title="${tr('Saqlash','Сохранить')}"><i data-lucide="check" class="w-4 h-4"></i></button></div>`:''}</div>`;
    }

    function renderOrdersDateFilterHtml() {
      const explicit=!!(ordersDateFrom&&ordersDateTo);
      return `<button type="button" onclick="openOrdersCalendarModal(event)" class="fc-orders-calendar-trigger ${explicit?'is-active':''}" aria-label="${tr('Kalendar','Календарь')}" title="${tr('Kalendar','Календарь')}"><i data-lucide="calendar-days" class="w-5 h-5"></i></button>`;
    }

    function renderOrders(container) {
      if (ordersLoading || !ordersLoaded) {
        container.innerHTML = `<div class="py-16 text-center text-sm text-gray-500"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>${tr("Buyurtmalar yuklanmoqda...", "Заказы загружаются...")}</div>`;
        return;
      }
      if (isAdminMode && isUserAnAdmin) {
        // ADMIN ORDERS VIEW
        const periodOrders = filterOrdersBySelectedDate(orders);
        let filteredOrders = periodOrders.filter(o => {
          const matchStatus = adminOrderFilters.status === 'ALL' || o.status === adminOrderFilters.status;
          const matchRegion = adminOrderFilters.region === 'ALL' || orderRegionFilterKey(o) === adminOrderFilters.region;
          const matchPayment = adminOrderFilters.payment === 'ALL' || o.payMethod === adminOrderFilters.payment;
          const matchSearch = !adminOrderFilters.search || o.user.toLowerCase().includes(adminOrderFilters.search.toLowerCase()) || o.phone.includes(adminOrderFilters.search);
          return matchStatus && matchRegion && matchPayment && matchSearch;
        });

        const totalPages = Math.ceil(filteredOrders.length / 10) || 1;
        if (ordersPage > totalPages) ordersPage = 1;
        const paginatedOrders = filteredOrders.slice((ordersPage - 1) * 10, ordersPage * 10);

        container.innerHTML = `
          <div class="space-y-4">
            <h2 class="text-lg font-bold text-slate-800">${t('all_orders')}</h2>

            <div class="bg-white p-3 rounded-2xl border space-y-2 text-xs shadow-sm">
              <div class="fc-orders-search-calendar-row"><input type="text" id="adm-ord-search" oninput="adminOrderFilters.search = this.value; render();" placeholder="${tr('Mijoz ismi yoki tel raqami...','Имя клиента или номер телефона...')}" value="${escapeHtml(adminOrderFilters.search)}" class="fc-order-search-input ${adminOrderFilters.search ? 'is-active' : ''} p-2 border rounded-xl">${renderOrdersDateFilterHtml()}</div>

              <div class="flex gap-1 flex-wrap">
                <button onclick="setAdminStatusFilter('ALL')" class="fc-orders-all-filter fc-order-filter-chip px-2.5 py-1 rounded-lg font-bold text-[10px] ${adminOrderFilters.status === 'ALL' ? 'is-active' : ''}">${adminOrderFilters.status === 'ALL' ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}${tr("Barchasi", "Все")}</button>
                ${['NEW', 'PROCESSING', 'DELIVERED', 'CANCELLED'].map(st => `
                  <button onclick="setAdminStatusFilter('${st}')" class="fc-order-filter-chip px-2.5 py-1 rounded-lg font-bold text-[10px] ${adminOrderFilters.status === st ? statusColorClass(st) + ' is-active' : 'bg-gray-100 text-gray-500'}">
                    ${adminOrderFilters.status === st ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}${statusLabel(st)}
                  </button>
                `).join('')}
              </div>

              <div class="grid grid-cols-2 gap-2">
                <select onchange="adminOrderFilters.region = this.value; render();" class="fc-order-filter-select ${adminOrderFilters.region !== 'ALL' ? 'is-active' : ''} p-2 border rounded-xl bg-gray-50 font-bold">
                  <option value="ALL" ${adminOrderFilters.region === 'ALL' ? 'selected' : ''}>${tr("Barcha hududlar", "Все регионы")}</option>
                  ${REGION_DEFS.map(region => `<option value="${region.code}" ${adminOrderFilters.region === region.code ? 'selected' : ''}>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</option>`).join('')}
                </select>

                <select onchange="adminOrderFilters.payment = this.value; render();" class="fc-order-filter-select ${adminOrderFilters.payment !== 'ALL' ? 'is-active' : ''} p-2 border rounded-xl bg-gray-50 font-bold">
                  <option value="ALL" ${adminOrderFilters.payment === 'ALL' ? 'selected' : ''}>${tr("Barcha to'lovlar", "Все способы оплаты")}</option>
                  <option value="CASH" ${adminOrderFilters.payment === 'CASH' ? 'selected' : ''}>${tr("Naqd pul", "Наличные")}</option>
                  <option value="CARD" ${adminOrderFilters.payment === 'CARD' ? 'selected' : ''}>${tr("Karta", "Карта")}</option>
                </select>
              </div>
            </div>

            <div class="space-y-2">
              ${paginatedOrders.length === 0 ? `<p class="text-xs text-gray-400 bg-white p-4 rounded-xl text-center">${tr("Buyurtmalar topilmadi", "Заказы не найдены")}</p>` : ''}
              ${paginatedOrders.map(o => `
                <div onclick="openOrderModal(${o.id})" class="bg-white p-3 rounded-2xl border flex items-center justify-between cursor-pointer hover:bg-gray-50 shadow-sm">
                  <div>
                    <div class="flex items-center space-x-2">
                      <span class="font-black text-blue-600 text-xs">#${o.id}</span>
                      <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${statusColorClass(orderDisplayStatus(o))}">${statusLabel(orderDisplayStatus(o))}</span>
                    </div>
                    <p class="font-bold text-xs text-gray-800 mt-1">${escapeHtml(o.user)} (${escapeHtml(o.phone)})</p>
                    <p class="text-[10px] text-gray-400">${escapeHtml(o.delivery?.regionLabel || regionLabel(o.region))} | ${escapeHtml(payMethodLabel(o.payMethod))}</p>
                    <p class="text-[10px] text-gray-500">${escapeHtml(deliverySnapshotLabel(o))} · ${escapeHtml(effectiveShipmentStatusLabel(o))}</p>${Number(o.deliveryFee) > 0 ? `<p class="fc-order-delivery-fee">${tr('Yetkazib berish narxi','Стоимость доставки')}: <b>${money(o.deliveryFee)}</b></p>` : ''}
                  </div>
                  <span class="font-bold text-xs text-green-600">${money(o.totalPrice)}</span>
                </div>
              `).join('')}
            </div>

            ${totalPages > 1 ? `
              <div class="flex justify-center space-x-2 pt-2">
                ${Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => `
                  <button onclick="ordersPage = ${pNum}; render();" class="px-3 py-1 rounded-xl text-xs font-bold ${ordersPage === pNum ? 'bg-blue-600 text-white' : 'bg-white border'}">${pNum}</button>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
        return;
      }

      // USER ORDERS VIEW
      const periodOrders = filterOrdersBySelectedDate(orders);
      let userOrders = periodOrders.filter(o => userOrderFilter === 'ALL' || o.status === userOrderFilter);

      container.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2"><h2 class="text-lg font-bold text-slate-800">${t('my_orders')}</h2>${renderOrdersDateFilterHtml()}</div>

          <div class="flex space-x-1 overflow-x-auto pb-1 text-xs">
            <button onclick="userOrderFilter='ALL'; render();" class="fc-orders-all-filter fc-order-filter-chip px-2.5 py-1 rounded-xl font-bold ${userOrderFilter === 'ALL' ? 'is-active' : ''}">${userOrderFilter === 'ALL' ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}${tr("Barchasi", "Все")}</button>
            ${['NEW', 'PROCESSING', 'DELIVERED', 'CANCELLED'].map(st => `
              <button onclick="userOrderFilter='${st}'; render();" class="fc-order-filter-chip px-2.5 py-1 rounded-xl font-bold ${userOrderFilter === st ? statusColorClass(st) + ' is-active' : 'bg-white border text-gray-500'}">${userOrderFilter === st ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}${statusLabel(st)}</button>
            `).join('')}
          </div>

          ${userOrders.length === 0 ? `<p class="text-xs text-gray-500 bg-white p-4 rounded-xl text-center">${tr("Buyurtmalar topilmadi", "Заказы не найдены")}</p>` : ''}
          ${userOrders.map(o => `
            <div onclick="openOrderModal(${o.id})" class="bg-white rounded-2xl p-4 shadow-sm space-y-2 border cursor-pointer hover:bg-gray-50">
              <div class="flex justify-between items-center border-b pb-2">
                <span class="font-black text-blue-600">#${o.id}</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColorClass(orderDisplayStatus(o))}">${statusLabel(orderDisplayStatus(o))}</span>
              </div>
              <p class="text-xs text-gray-500">📅 ${escapeHtml(o.date)}</p>
              <p class="text-xs text-gray-600">🚚 ${escapeHtml(deliverySnapshotLabel(o))} · <b>${escapeHtml(effectiveShipmentStatusLabel(o))}</b></p>${Number(o.deliveryFee) > 0 ? `<p class="fc-order-delivery-fee">${tr('Yetkazib berish narxi','Стоимость доставки')}: <b>${money(o.deliveryFee)}</b></p>` : ''}${Number(o.promoDiscount) > 0 ? `<p class="fc-order-promo-discount"><i data-lucide="ticket-percent" class="w-3 h-3 inline align-[-1px]"></i> ${escapeHtml(o.promoCode || '')} — ${tr('chegirma','скидка')}: <b>-${money(o.promoDiscount)}</b></p>` : ''}
              ${o.shipment?.kind === 'TAXI' && o.shipment?.carNumber ? `<div class="bg-blue-50 border border-blue-200 p-2 rounded-xl text-[11px]">🚕 ${tr('Mashina','Машина')}: <b>${escapeHtml(o.shipment.carNumber)}</b><br>${tr('Haydovchi','Водитель')}: ${escapeHtml(o.shipment.driverPhone || '')}${o.shipment.driverName ? ` · ${escapeHtml(o.shipment.driverName)}` : ''}</div>` : ''}
              ${o.shipment?.kind === 'POST' && o.shipment?.trackingNumber ? `<div class="bg-blue-50 border border-blue-200 p-2 rounded-xl text-[11px]">📦 ${escapeHtml(o.shipment.providerName || o.delivery?.providerName || '')}<br>${tr("Jo'natma raqami",'Трек-номер')}: <b>${escapeHtml(o.shipment.trackingNumber)}</b>${o.shipment.shippedAt ? `<br>${tr("Jo'natilgan sana",'Дата отправки')}: <b>${new Date(o.shipment.shippedAt).toLocaleDateString()}</b>` : ''}${o.shipment.originBranch ? `<br>${tr('Filial','Филиал')}: ${escapeHtml(o.shipment.originBranch)}` : ''}</div>` : ''}
              <div class="text-xs space-y-1.5">
                ${o.items.map(i => `
                  <div class="flex items-center gap-2">
                    ${i.img ? `<img src="${escapeHtml(i.img)}" onerror="this.style.display='none'" class="w-7 h-7 object-cover rounded-lg flex-shrink-0" loading="lazy">` : ''}
                    <p class="font-medium">• ${escapeHtml(orderItemName(i))} ${i.size ? `<span class="text-gray-500 font-mono">[${escapeHtml(i.size)}]</span>` : ''} ${i.color ? `<span class="text-gray-500">[${escapeHtml(i.color)}]</span>` : ''} ${(i.sku && isAdminMode && isUserAnAdmin) ? `<span class="text-gray-400 font-mono">(ID: ${escapeHtml(i.sku)})</span>` : ''} x ${i.qty}</p>
                  </div>
                `).join('')}
              </div>
              ${o.status === 'CANCELLED' && o.cancelReason ? `
                <p class="text-[10px] fc-text-danger">${tr('Bekor qilindi','Отменён')} (${o.cancelledBy === 'ADMIN' ? tr("do'kon","магазин") : tr('siz','вы')}): ${escapeHtml(o.cancelReason)}</p>
              ` : ''}
              <div class="border-t pt-2 flex justify-between items-center font-bold text-sm">
                <span class="text-green-600">${money(o.payableTotal ?? o.totalPrice)}</span>
                ${(o.status === 'NEW' && !isReceiptPendingReview(o)) ? `
                  <button onclick="openCancelOrderSheet(${o.id}, event)" class="text-xs fc-bg-danger-soft fc-text-danger border fc-border-danger px-2.5 py-1 rounded-lg font-bold">
                    ❌ ${tr("Bekor qilish", "Отмена")}
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // 14-band: mijoz bekor qilish sababini o'zi tanlaydi/yozadi.
    const CANCEL_REASON_PRESETS = [
      { uz: "Fikrimni o'zgartirdim", ru: "Передумал(а)" },
      { uz: "Xato buyurtma berdim", ru: "Ошибся(лась) при заказе" },
      { uz: "Yetkazib berish juda uzoq", ru: "Слишком долгая доставка" },
      { uz: "Boshqa joydan arzonroq topdim", ru: "Нашёл(нашла) дешевле в другом месте" },
    ];
    let cancelOrderTargetId = null;
    let cancelOrderReasonIdx = -1;

    function openCancelOrderSheet(orderId, e) {
      if (e) e.stopPropagation();
      cancelOrderTargetId = orderId;
      cancelOrderReasonIdx = -1;
      renderCancelOrderSheet();
    }
    function closeCancelOrderSheet() {
      const root = document.getElementById('fc-cancel-order-sheet-root');
      if (root) root.remove();
      cancelOrderTargetId = null;
    }
    function setCancelOrderReasonIdx(idx) {
      cancelOrderReasonIdx = idx;
      const custom = document.getElementById('cancel-order-custom-reason');
      if (custom) custom.value = '';
      renderCancelOrderSheet();
    }
    function renderCancelOrderSheet() {
      let root = document.getElementById('fc-cancel-order-sheet-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-cancel-order-sheet-root'; document.body.appendChild(root); }
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeCancelOrderSheet();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Bekor qilish sababi', 'Причина отмены')}</div><button type="button" onclick="closeCancelOrderSheet()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-2">
            ${CANCEL_REASON_PRESETS.map((r, i) => `<button type="button" onclick="setCancelOrderReasonIdx(${i})" class="w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs ${cancelOrderReasonIdx === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${tr(r.uz, r.ru)}</button>`).join('')}
            <textarea id="cancel-order-custom-reason" rows="2" placeholder="${tr('Boshqa sabab (ixtiyoriy)', 'Другая причина (необязательно)')}" class="w-full p-2 border rounded-xl text-xs" oninput="cancelOrderReasonIdx=-1"></textarea>
          </div>
          <div class="fc-sheet-footer"><button type="button" onclick="submitCancelOrder()" class="fc-btn fc-btn-danger w-full">${tr('Buyurtmani bekor qilish', 'Отменить заказ')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function submitCancelOrder() {
      const orderId = cancelOrderTargetId;
      const customText = document.getElementById('cancel-order-custom-reason')?.value.trim();
      const preset = cancelOrderReasonIdx >= 0 ? CANCEL_REASON_PRESETS[cancelOrderReasonIdx] : null;
      const reason = customText || (preset ? tr(preset.uz, preset.ru) : '');
      closeCancelOrderSheet();
      try {
        const result = await callApi('cancel_order', { orderId, reason });
        const updated = formatOrderForUi(result.order);
        const idx = orders.findIndex(o => o.id === updated.id);
        if (idx >= 0) orders[idx] = updated;
        if (selectedOrderModal?.id === updated.id) selectedOrderModal = updated;
        showActionToast(tr("✅ Buyurtma bekor qilindi", "✅ Заказ отменён"), 'success', 1800);
        render();
      } catch (e2) {
        console.error(e2);
        const code = e2?.details?.error || '';
        if (code === 'cancel_not_allowed_at_this_stage') {
          alert(tr("Bu bosqichda buyurtmani o'zingiz bekor qila olmaysiz. Iltimos, qo'llab-quvvatlash bilan bog'laning.", "На этом этапе вы не можете отменить заказ самостоятельно. Обратитесь в поддержку."));
        } else {
          alert(tr("❌ Xatolik yuz berdi, qayta urinib ko'ring.", "❌ Произошла ошибка. Попробуйте ещё раз."));
        }
      }
    }

    function setAdminStatusFilter(st) {
      adminOrderFilters.status = st;
      render();
    }

    // ROUND 10: Ombor — Holat / Qoldiq / Harakatlar. Kirim alohida tab emas:
    // Qoldiq ichida katalog bo'ylab mahsulotga kirib + / − / aniq qoldiq beriladi.
    function renderWarehouse(container) {
      const tabs = [
        { key: 'HOLAT', label: tr('Holat', 'Состояние'), icon: 'activity' },
        { key: 'QOLDIQ', label: tr('Qoldiq', 'Остаток'), icon: 'package' },
        { key: 'HARAKATLAR', label: tr('Harakatlar', 'Движения'), icon: 'history' },
      ];
      if (warehouseSubTab === 'KIRIM') warehouseSubTab = 'QOLDIQ'; // eski session state mosligi
      container.innerHTML = `
        <div class="fc-warehouse-page">
          <div class="fc-warehouse-heading"><h2>${t('warehouse_title')}</h2></div>
          <div class="fc-warehouse-tabs" role="tablist">
            ${tabs.map(tb => `<button type="button" onclick="switchWarehouseSubTab('${tb.key}')" class="fc-warehouse-tab ${warehouseSubTab === tb.key ? 'is-active' : ''}" role="tab" aria-selected="${warehouseSubTab === tb.key ? 'true' : 'false'}"><i data-lucide="${tb.icon}" class="w-4 h-4"></i><span>${tb.label}</span></button>`).join('')}
          </div>
          <div class="fc-warehouse-content">
            ${warehouseSubTab === 'HOLAT' ? renderWarehouseHolatHtml()
              : warehouseSubTab === 'QOLDIQ' ? renderWarehouseUpdateHtml()
              : renderWarehouseHarakatlarHtml()}
          </div>
        </div>
      `;
    }

    // 11/13-band: Holat — faqat SUMMARY cardlar (daraxt yo'q). Kam qolgan/
    // Tugagan cardlari bosiladigan (15-band) — get_warehouse_summary'dan
    // kelgan id-ro'yxat orqali PRODUCT CARDLAR ko'rinishida filtrlanadi.
    function renderWarehouseHolatHtml() {
      if (warehouseStockFilter) return renderWarehouseStockFilterListHtml();
      if (warehouseSummaryLoading || !warehouseSummaryData) {
        return `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`;
      }
      const s = warehouseSummaryData;
      const missingImageCount = getMissingImageProducts().length;
      const importMissingImageCount = products.filter(p => p.status !== 'DELETED' && !hasProductImage(p) && p.importBatchId).length;
      const statCards = [
        { kind:'LOW', title:tr('Kam qolgan','Заканчивается'), value:s.lowStock, sub:tr('Chegaradan past','Ниже порога'), icon:'bell-ring', tone:'warning' },
        { kind:'OUT', title:tr('Tugagan','Нет в наличии'), value:s.outOfStock, sub:tr('Zaxirada yo‘q','Нет на складе'), icon:'archive-x', tone:'danger' },
        { title:tr('Rasmsiz','Без фото'), value:missingImageCount, sub:tr('Rasm qo‘yilmagan','Без изображения'), icon:'image-off', tone:'primary' },
        { title:tr('Import rasmsiz','Импорт без фото'), value:importMissingImageCount, sub:tr('Importda rasm yo‘q','Без фото в импорте'), icon:'cloud-upload', tone:'violet' },
        { title:tr('Jami mahsulot','Всего товаров'), value:s.totalProducts, sub:tr('Umumiy mahsulotlar','Всего товаров'), icon:'shopping-bag', tone:'success' },
        { title:tr('Jami qoldiq','Всего на складе'), value:s.totalStock, sub:tr('Barcha qoldiq miqdori','Общий остаток'), icon:'layers-3', tone:'primary' },
      ];
      return `
        ${(isUserAnAdmin && isAdminMode) ? `
          <button type="button" onclick="activePopupModal='LOW_STOCK_SETTINGS'; render();" class="fc-warehouse-threshold">
            <span class="fc-warehouse-threshold-icon"><i data-lucide="settings-2" class="w-4 h-4"></i></span>
            <span class="fc-warehouse-threshold-copy"><b>${tr("Kam qolgan chegarasi", "Порог «заканчивается»")}: ${Number.isFinite(s.lowStockThreshold) ? s.lowStockThreshold : shopLowStockThreshold}</b><small>${tr('Ushbu qiymatdan past bo‘lgan tovarlar ogohlantiriladi','Товары ниже этого значения считаются заканчивающимися')}</small></span>
            <span class="fc-warehouse-threshold-action">${tr("O'zgartirish", "Изменить")}<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
          </button>
        ` : ''}
        <div class="fc-warehouse-stat-grid">
          ${statCards.map(card => `${card.kind ? `<button type="button" onclick="openWarehouseStockFilter('${card.kind}')"` : `<div`} class="fc-warehouse-stat is-${card.tone}">
            <span class="fc-warehouse-stat-icon"><i data-lucide="${card.icon}" class="w-5 h-5"></i></span>
            <span class="fc-warehouse-stat-copy"><small>${card.title}</small><b>${card.value}</b><em>${card.sub}</em></span>
          ${card.kind ? `</button>` : `</div>`}`).join('')}
        </div>
      `;
    }

    function warehouseStockFilterMatches() {
      const ids = new Set(warehouseStockFilter === 'LOW' ? (warehouseSummaryData?.lowStockIds || []) : (warehouseSummaryData?.outOfStockIds || []));
      let list = products.filter(p => ids.has(p.id));
      const q = warehouseStockFilterSearch.trim().toLowerCase();
      if (q) list = list.filter(p => productName(p).toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q));
      return list;
    }
    function renderWarehouseStockFilterListHtml() {
      const title = warehouseStockFilter === 'LOW' ? tr('Kam qolgan', 'Заканчивается') : tr('Tugagan', 'Нет в наличии');
      return `
        <div class="space-y-2">
          <button onclick="closeWarehouseStockFilter()" class="text-xs font-bold text-blue-600">‹ ${tr('Holatga qaytish', 'Назад к состоянию')}</button>
          <h3 class="font-bold text-sm text-gray-800">${title}</h3>
          <input type="text" id="warehouse-stock-filter-search-input" value="${escapeHtml(warehouseStockFilterSearch)}" oninput="handleWarehouseStockFilterSearchDebounced()" placeholder="${tr('Nom / SKU / ID bo‘yicha qidirish', 'Поиск по названию / SKU / ID')}" class="w-full p-2.5 border rounded-xl text-xs">
          <div id="warehouse-stock-filter-results">${renderWarehouseStockFilterResultsHtml()}</div>
        </div>
      `;
    }
    function renderWarehouseStockFilterResultsHtml() {
      const list = warehouseStockFilterMatches();
      const pageData = paginate(list, warehouseStockFilterPage, 10);
      if (list.length === 0) {
        return `<div class="fc-empty-state"><i data-lucide="package-check" class="w-8 h-8"></i><p>${tr('Bu holatda mahsulot yo‘q.', 'Нет товаров с таким статусом.')}</p></div>`;
      }
      return `
        <div class="space-y-2">${pageData.items.map(p => renderWarehouseStockProductCardHtml(p)).join('')}</div>
        ${renderPagerHTML(pageData.page, pageData.totalPages, 'setWarehouseStockFilterPage')}
      `;
    }
    let warehouseStockFilterSearchDebounceTimer = null;
    function handleWarehouseStockFilterSearchDebounced() {
      clearTimeout(warehouseStockFilterSearchDebounceTimer);
      warehouseStockFilterSearchDebounceTimer = setTimeout(() => {
        const input = document.getElementById('warehouse-stock-filter-search-input');
        warehouseStockFilterSearch = input ? input.value : '';
        warehouseStockFilterPage = 1;
        const el = document.getElementById('warehouse-stock-filter-results');
        if (el) { el.innerHTML = renderWarehouseStockFilterResultsHtml(); lucide.createIcons(); }
      }, 250);
    }

    function productCategoryLabel(p) {
      const cat = categories.find(c => String(c.id) === String(p.categoryId));
      return cat ? categoryName(cat) : '';
    }
    function renderWarehouseStockProductCardHtml(p) {
      const vars = productVariants(p);
      const variantSummary = vars.length ? vars.map(v => `${escapeHtml(variantLabel(v))}: ${v.qty}`).join(', ') : null;
      const catLabel = productCategoryLabel(p);
      return `
        <button type="button" onclick="openProductDetailModal('${p.id}')" class="fc-card fc-warehouse-stock-card w-full flex items-center gap-3 text-left">
          <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-12 h-12 object-cover rounded-xl flex-shrink-0">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-xs text-gray-800 truncate">${escapeHtml(productName(p))}</p>
            <p class="text-[10px] text-gray-400">ID: ${escapeHtml(p.sku)}${catLabel ? ` · ${escapeHtml(catLabel)}` : ''}</p>
            ${variantSummary ? `<p class="text-[10px] text-gray-500 mt-0.5 truncate">${variantSummary}</p>` : `<p class="text-[10px] text-gray-500 mt-0.5">${tr('Qoldiq', 'Остаток')}: ${p.stock}</p>`}
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-400 shrink-0"></i>
        </button>
      `;
    }

    // ROUND 11: Ombor -> Qoldiq endi bitta sahifadagi to'liq daraxt.
    // Kataloglar doim o'z ierarxiyasida ko'rinadi; katalog bosilganda uning
    // TO'G'RIDAN-TO'G'RI tovarlari aynan o'sha tugun ostida inline ochiladi.
    function warehouseCategoryChildren(parentId) {
      return categories.filter(c => String(c.parentId || '') === String(parentId || ''))
        .sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)||categoryName(a).localeCompare(categoryName(b)));
    }
    function warehouseCategoryProducts(categoryId) {
      return products.filter(p => String(p.categoryId || '') === String(categoryId || '') && p.status !== 'DELETED'
        && (!warehouseMissingImageOnly || !hasProductImage(p))
        && (!warehouseImportedMissingImageOnly || (!hasProductImage(p) && p.importBatchId)))
        .sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)||productName(a).localeCompare(productName(b)));
    }
    function warehouseCategoryPath(categoryId) {
      const out=[]; let cur=categories.find(c=>String(c.id)===String(categoryId||'')); const seen=new Set();
      while(cur && !seen.has(String(cur.id))){ seen.add(String(cur.id)); out.unshift(cur); cur=categories.find(c=>String(c.id)===String(cur.parentId||'')); }
      return out;
    }
    function openWarehouseBrowseCategory(id){ warehouseBrowseCategoryId=id||null; render(); }
    function toggleWarehouseTreeCategory(id){ warehouseBrowseCategoryId=String(warehouseBrowseCategoryId||'')===String(id||'')?null:(id||null); render(); }
    function warehouseBrowseBack(){ const cur=categories.find(c=>String(c.id)===String(warehouseBrowseCategoryId||'')); warehouseBrowseCategoryId=cur?.parentId||null; render(); }
    function warehouseBrowseRoot(){ warehouseBrowseCategoryId=null; render(); }
    function renderWarehouseBrowseBreadcrumbHtml(){
      const path=warehouseCategoryPath(warehouseBrowseCategoryId);
      return `<div class="fc-warehouse-breadcrumb"><button type="button" onclick="warehouseBrowseRoot()"><i data-lucide="home" class="w-3.5 h-3.5"></i>${tr('Bosh katalog','Главный каталог')}</button>${path.map(c=>`<i data-lucide="chevron-right" class="w-3 h-3"></i><button type="button" onclick="openWarehouseBrowseCategory('${c.id}')">${escapeHtml(categoryName(c))}</button>`).join('')}</div>`;
    }
    function renderWarehouseTreeCategoryHtml(category, depth=0, seen=new Set()) {
      if (!category || seen.has(String(category.id))) return '';
      const nextSeen = new Set(seen); nextSeen.add(String(category.id));
      const children = warehouseCategoryChildren(category.id);
      const selected = String(warehouseBrowseCategoryId||'') === String(category.id);
      const directProducts = selected ? warehouseCategoryProducts(category.id) : [];
      const directCount = products.filter(p => String(p.categoryId||'')===String(category.id) && p.status!=='DELETED').length;
      return `<div class="fc-stock-tree-node ${selected?'is-selected':''}" style="--tree-depth:${depth}">
        <button type="button" onclick="toggleWarehouseTreeCategory('${category.id}')" class="fc-stock-tree-category ${selected?'is-selected':''}">
          <span class="fc-stock-tree-caret"><i data-lucide="${children.length?'chevron-down':(selected?'chevron-down':'chevron-right')}" class="w-3.5 h-3.5"></i></span>
          <span class="fc-stock-tree-folder"><i data-lucide="${selected?'folder-open':'folder'}" class="w-4 h-4"></i></span>
          <span class="fc-stock-tree-category-copy"><b>${escapeHtml(categoryName(category))}</b><small>${children.length ? `${children.length} ${tr('ichki katalog','подкат.')}` : ''}${children.length&&directCount?' · ':''}${directCount ? `${directCount} ${tr('tovar','тов.')}` : ''}</small></span>
        </button>
        <div class="fc-stock-tree-children">
          ${selected && directProducts.length ? `<div class="fc-stock-tree-products">${directProducts.map(p=>renderWarehouseBrowseProductHtml(p)).join('')}</div>` : ''}
          ${children.map(child=>renderWarehouseTreeCategoryHtml(child,depth+1,nextSeen)).join('')}
        </div>
      </div>`;
    }
    function renderWarehouseUpdateHtml() {
      const roots=warehouseCategoryChildren(null);
      const currentCat=categories.find(c=>String(c.id)===String(warehouseBrowseCategoryId||''));
      return `
        <div class="fc-warehouse-stack">
          <div class="fc-warehouse-tools">
            <button type="button" onclick="warehouseBulkPanelOpen=!warehouseBulkPanelOpen;render();" class="fc-warehouse-tool-btn ${warehouseBulkPanelOpen?'is-active':''}"><i data-lucide="list-plus" class="w-4 h-4"></i><span>${tr("Ko'p tovarni yangilash","Массовое обновление")}</span></button>
            <button onclick="warehouseMissingImageOnly=!warehouseMissingImageOnly; if(warehouseMissingImageOnly)warehouseImportedMissingImageOnly=false; render();" class="fc-warehouse-tool-icon ${warehouseMissingImageOnly?'is-active is-warning':''}" title="${tr('Rasmsiz','Без фото')}"><i data-lucide="image-off" class="w-4 h-4"></i><small>${getMissingImageProducts().length}</small></button>
            <button onclick="warehouseImportedMissingImageOnly=!warehouseImportedMissingImageOnly; if(warehouseImportedMissingImageOnly)warehouseMissingImageOnly=false; render();" class="fc-warehouse-tool-icon ${warehouseImportedMissingImageOnly?'is-active':''}" title="${tr('Import rasmsiz','Импорт без фото')}"><i data-lucide="cloud-upload" class="w-4 h-4"></i><small>${products.filter(p=>p.status!=='DELETED'&&!hasProductImage(p)&&p.importBatchId).length}</small></button>
          </div>

          ${warehouseBulkPanelOpen ? `<section class="fc-warehouse-bulk-card fc-warehouse-bulk-collapsible">
            <div class="fc-warehouse-section-head"><span><i data-lucide="zap" class="w-5 h-5"></i></span><div><h3>${tr("ID orqali ko'p tovar qoldig'ini yangilash","Массовое обновление остатков по ID")}</h3><p>${tr("SKU va sonini kiriting (Masalan: 111001 35)","Введите SKU и количество (например: 111001 35)")}</p></div></div>
            <textarea id="bulk-input" rows="4" class="fc-warehouse-textarea" placeholder="111001 35&#10;111002 20"></textarea>
            <button onclick="saveBulkStock()" class="fc-btn fc-btn-primary w-full"><i data-lucide="save" class="w-4 h-4"></i>${tr("Barchasini saqlash","Сохранить все")}</button>
          </section>` : ''}

          <section class="fc-warehouse-browser fc-warehouse-tree-browser">
            <div class="fc-warehouse-browser-head">
              <span class="fc-warehouse-browser-icon"><i data-lucide="network" class="w-5 h-5"></i></span>
              <div><h3>${tr('Katalog daraxti','Дерево каталогов')}</h3><p>${currentCat ? `${escapeHtml(categoryName(currentCat))} · ${tr('tovarlar shu yerda ochildi','товары открыты здесь')}` : tr('Katalogni bosing — tovarlari shu daraxtning o‘zida ochiladi','Нажмите каталог — товары откроются прямо в дереве')}</p></div>
            </div>
            ${renderWarehouseBrowseBreadcrumbHtml()}
            <div class="fc-warehouse-tree-list">
              ${roots.length ? roots.map(c=>renderWarehouseTreeCategoryHtml(c,0,new Set())).join('') : `<div class="fc-empty-state compact"><i data-lucide="folders" class="w-7 h-7"></i><p>${tr('Kataloglar topilmadi','Каталоги не найдены')}</p></div>`}
            </div>
          </section>
        </div>`;
    }
    function renderWarehouseBrowseProductHtml(p){
      const vars=productVariants(p); const total=vars.length?vars.reduce((n,v)=>n+(Number(v.qty)||0),0):Number(p.stock||0);
      return `<button type="button" onclick="openWarehouseStockAdjust('${p.id}')" class="fc-warehouse-product-row"><img src="${escapeHtml(p.img||FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';"><span class="fc-warehouse-product-row-copy"><b>${escapeHtml(productName(p))}</b><small>ID: ${escapeHtml(p.sku)}${vars.length?` · ${vars.length} ${tr('variant','вариант')}`:''}</small></span><strong class="${total>0?'is-in':'is-out'}">${total} ${tr('ta','шт.')}</strong><i data-lucide="chevron-right" class="w-4 h-4"></i></button>`;
    }
    function openWarehouseStockAdjust(productId){
      const p=products.find(x=>String(x.id)===String(productId)); if(!p)return;
      const vars=productVariants(p); warehouseStockAdjustProductId=p.id; warehouseStockAdjustVariantSku=vars[0]?.sku||null;
      warehouseStockAdjustDraft=String(vars.length?(Number(vars[0]?.qty)||0):(Number(p.stock)||0)); activePopupModal='WAREHOUSE_STOCK_ADJUST'; render();
    }
    function warehouseStockAdjustCurrent(){
      const p=products.find(x=>String(x.id)===String(warehouseStockAdjustProductId)); if(!p)return 0;
      const vars=productVariants(p); if(vars.length){ return Number(vars.find(v=>String(v.sku)===String(warehouseStockAdjustVariantSku))?.qty)||0; }
      return Number(p.stock)||0;
    }
    function setWarehouseStockAdjustVariant(sku){
      warehouseStockAdjustVariantSku=sku||null; const p=products.find(x=>String(x.id)===String(warehouseStockAdjustProductId));
      const v=productVariants(p).find(x=>String(x.sku)===String(sku)); warehouseStockAdjustDraft=String(Number(v?.qty)||0); renderModalContainer(); if(window.lucide)lucide.createIcons();
    }
    function changeWarehouseStockDraft(delta){ const cur=Math.max(0,Number.parseInt(warehouseStockAdjustDraft,10)||0); warehouseStockAdjustDraft=String(Math.max(0,cur+delta)); renderModalContainer(); if(window.lucide)lucide.createIcons(); }
    function closeWarehouseStockAdjust(){ activePopupModal=null; warehouseStockAdjustProductId=null; warehouseStockAdjustVariantSku=null; warehouseStockAdjustDraft=''; warehouseStockAdjustSaving=false; render(); }
    async function saveWarehouseStockAdjust(){
      const p=products.find(x=>String(x.id)===String(warehouseStockAdjustProductId)); if(!p||warehouseStockAdjustSaving)return;
      const vars=productVariants(p); const sku=vars.length?warehouseStockAdjustVariantSku:p.sku; const stock=Number.parseInt(warehouseStockAdjustDraft,10);
      if(!sku)return alert(tr('SKU topilmadi.','SKU не найден.')); if(!Number.isInteger(stock)||stock<0)return alert(tr('0 yoki undan katta son kiriting.','Введите число 0 или больше.'));
      warehouseStockAdjustSaving=true; renderModalContainer(); showActionToast(tr('Saqlanmoqda...','Сохранение...'),'saving');
      try{
        const result=await callApi('bulk_stock_update',{updates:[{sku:String(sku).toUpperCase(),stock}]});
        (result.products||[]).forEach(row=>{const mapped=mapProductFromDB(row);const idx=products.findIndex(x=>String(x.id)===String(mapped.id));if(idx>=0)products[idx]=mapped;});
        if((result.errors||[]).length)throw new Error(result.errors[0]?.error||tr('Qoldiq yangilanmadi','Остаток не обновлён'));
        saveCatalogCache(); warehouseSummaryLoaded=false; warehouseMovementsLoaded=false; activePopupModal=null; warehouseStockAdjustSaving=false; warehouseStockAdjustProductId=null; warehouseStockAdjustVariantSku=null; warehouseStockAdjustDraft=''; render();
        showActionToast(tr('Qoldiq saqlandi','Остаток сохранён'),'success',1400); loadWarehouseMovements(true);
      }catch(e){warehouseStockAdjustSaving=false;renderModalContainer();console.error(e);showActionToast(tr('Saqlanmadi','Не сохранено'),'error',1800);alert(tr('Xatolik: ','Ошибка: ')+(e.message||e));}
    }

    // 15-16-band: Kirim (stock-in ADD). Harakatlar tarixi ALOHIDA HARAKATLAR
    // tabiga ko'chirildi (renderWarehouseHarakatlarHtml). Qidiruv inputi HECH QACHON
    // qayta render() qilinmaydi — faqat #kirim-search-results targeted yangilanadi,
    // shu bilan fokus/klaviatura yopilib qolish bugi butunlay yo'qoladi.
    function renderWarehouseKirimHtml() {
      const selected = warehouseKirimSelectedProduct;
      const vars = selected ? productVariants(selected) : [];
      const qtyNum = Number.parseInt(warehouseKirimQty, 10);
      const qtyValid = Number.isInteger(qtyNum) && qtyNum > 0;
      const currentQty = vars.length ? (Number(vars.find(v => v.sku === warehouseKirimSelectedVariantSku)?.qty) || 0) : Number(selected?.stock || 0);

      const formHtml = !selected ? `
        <div class="fc-warehouse-search-card">
          <label class="fc-warehouse-search-title"><i data-lucide="search" class="w-4 h-4"></i>${tr('Mahsulot qidirish', 'Поиск товара')}</label>
          <input type="text" id="kirim-search-input" value="${escapeHtml(warehouseKirimSearch)}" oninput="handleKirimSearchDebounced()" placeholder="${tr('Nomi, SKU yoki ID', 'Название, SKU или ID')}" class="fc-warehouse-search-input">
          <div id="kirim-search-results">${renderKirimSearchResultsHtml()}</div>
          <div class="fc-warehouse-catalog-picker">
            <button onclick="warehouseKirimShowCatalog=!warehouseKirimShowCatalog; render();" class="fc-warehouse-catalog-toggle"><span><i data-lucide="folder-search" class="w-4 h-4"></i>${tr('Katalog orqali topish', 'Найти через каталог')}</span><i data-lucide="chevron-${warehouseKirimShowCatalog ? 'up' : 'down'}" class="w-4 h-4"></i></button>
            ${warehouseKirimShowCatalog ? `
              <div class="fc-warehouse-tree fc-warehouse-tree-scroll">
                ${categories.filter(c => !c.parentId).map(parent => renderCategoryTreeNodeHTML(parent, 0, true)).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      ` : `
        <div class="fc-warehouse-form-card">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-sm text-gray-900 truncate">${escapeHtml(productName(selected))}</p>
              <p class="text-[10px] text-gray-400">ID: ${escapeHtml(selected.sku)}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="clearKirimSelection()" class="text-[11px] font-bold text-blue-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>${tr('Orqaga', 'Назад')}</button>
              <button onclick="openProductDetailModal('${selected.id}')" class="text-[11px] font-bold text-gray-600 flex items-center gap-1">${ICON_EDIT}${tr('Tahrirlash', 'Изменить')}</button>
            </div>
          </div>
          ${vars.length ? `
            <div>
              <label class="font-bold text-xs text-gray-700">${tr('Variant', 'Вариант')}</label>
              <select onchange="warehouseKirimSelectedVariantSku=this.value||null; render();" class="w-full p-2.5 border rounded-xl text-xs mt-1">
                <option value="">${tr('Tanlang', 'Выберите')}</option>
                ${vars.map(v => `<option value="${escapeHtml(v.sku)}" ${warehouseKirimSelectedVariantSku === v.sku ? 'selected' : ''}>${escapeHtml(variantLabel(v))} (${tr('hozir', 'сейчас')}: ${v.qty})</option>`).join('')}
              </select>
            </div>
          ` : `<p class="text-xs text-gray-500">${tr('Hozirgi qoldiq', 'Текущий остаток')}: <b>${selected.stock}</b></p>`}
          <div>
            <label class="font-bold text-xs text-gray-700">${tr('Kirim miqdori (+)', 'Количество прихода (+)')}</label>
            <input type="number" min="1" value="${escapeHtml(warehouseKirimQty)}" oninput="warehouseKirimQty=this.value; render();" class="w-full p-2.5 border rounded-xl text-xs mt-1" placeholder="10">
          </div>
          ${qtyValid && (!vars.length || warehouseKirimSelectedVariantSku) ? `
            <p class="text-[11px] fc-bg-success-soft rounded-lg p-2">
              ${tr('Hozirgi qoldiq', 'Текущий остаток')}: ${currentQty} → <b class="fc-text-success">${tr('Yangi qoldiq', 'Новый остаток')}: ${currentQty + qtyNum}</b>
            </p>
          ` : ''}
          <button onclick="submitKirim()" ${warehouseKirimSaving ? 'disabled' : ''} class="fc-btn fc-btn-success w-full"><i data-lucide="save" class="w-4 h-4"></i>${warehouseKirimSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Kirimni saqlash', 'Сохранить приход')}</button>
        </div>
      `;

      return `<div class="space-y-4">${formHtml}</div>`;
    }

    function renderKirimSearchResultsHtml() {
      const q = warehouseKirimSearch.trim().toLowerCase();
      if (!q) return '';
      const matches = products.filter(p => p.status !== 'DELETED' && (productName(p).toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q))).slice(0, 8);
      if (!matches.length) return `<p class="text-[11px] text-gray-400 py-1">${tr('Topilmadi', 'Не найдено')}</p>`;
      return `<div class="space-y-2">${matches.map(p => renderKirimResultCardHtml(p)).join('')}</div>`;
    }

    function renderKirimResultCardHtml(p) {
      const catLabel = productCategoryLabel(p);
      return `
        <div onclick="pickKirimProduct('${p.id}')" class="fc-card flex items-center gap-3 cursor-pointer hover:bg-blue-50">
          <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-12 h-12 object-cover rounded-xl flex-shrink-0">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-xs text-gray-800 truncate">${escapeHtml(productName(p))}</p>
            <p class="text-[10px] text-gray-400">ID: ${escapeHtml(p.sku)}${catLabel ? ` · ${escapeHtml(catLabel)}` : ''}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">${tr('Mavjud qoldiq', 'Текущий остаток')}: ${p.stock}</p>
          </div>
          <span class="fc-badge fc-badge-primary shrink-0">${tr('Kirim qilish', 'Приход')}</span>
        </div>
      `;
    }

    let warehouseKirimSearchDebounceTimer = null;
    function handleKirimSearchDebounced() {
      clearTimeout(warehouseKirimSearchDebounceTimer);
      warehouseKirimSearchDebounceTimer = setTimeout(() => {
        const input = document.getElementById('kirim-search-input');
        warehouseKirimSearch = input ? input.value : '';
        const el = document.getElementById('kirim-search-results');
        if (el) { el.innerHTML = renderKirimSearchResultsHtml(); lucide.createIcons(); }
      }, 250);
    }

    // 47-band: Harakatlar tarixi — Kirimdan ALOHIDA tab, o'z filtr/qidiruv/sana oralig'i bilan.
    function renderWarehouseHarakatlarHtml() {
      const filterChips = [
        { key: 'null', label: tr('Barchasi', 'Все') },
        { key: 'KIRIM', label: tr('Kirim', 'Приход') },
        { key: 'BUYURTMA', label: tr('Buyurtma', 'Заказ') },
        { key: 'MANUAL', label: tr("Qo'lda", 'Вручную') },
      ];
      const dateChips = [
        { key: 'null', label: tr('Barchasi', 'Все') },
        { key: 'today', label: tr('Bugun', 'Сегодня') },
        { key: '7d', label: tr('7 kun', '7 дней') },
        { key: '30d', label: tr('30 kun', '30 дней') },
        { key: 'custom', label: tr('Oraliq', 'Период') },
      ];
      return `
        <div class="space-y-3">
          <input type="text" id="harakatlar-search-input" value="${escapeHtml(warehouseMovementsSearch)}" oninput="handleWarehouseMovementsSearchDebounced()" placeholder="${tr('Nom / SKU / ID bo‘yicha qidirish', 'Поиск по названию / SKU / ID')}" class="w-full p-2.5 border rounded-xl text-xs">
          <div class="flex gap-1.5 flex-wrap">
            ${filterChips.map(c => `<button onclick="setWarehouseMovementsFilter(${c.key === 'null' ? 'null' : `'${c.key}'`})" class="fc-badge ${(warehouseMovementsFilter || 'null') === c.key ? 'fc-badge-primary' : 'fc-badge-muted'}">${c.label}</button>`).join('')}
          </div>
          <div class="flex gap-1.5 flex-wrap">
            ${dateChips.map(c => `<button onclick="setWarehouseMovementsDateRange(${c.key === 'null' ? 'null' : `'${c.key}'`})" class="fc-badge ${(warehouseMovementsDateRange || 'null') === c.key ? 'fc-badge-primary' : 'fc-badge-muted'}">${c.label}</button>`).join('')}
          </div>
          ${warehouseMovementsDateRange === 'custom' ? `
            <div class="flex gap-2 items-center">
              <input type="date" value="${escapeHtml(warehouseMovementsDateFrom)}" onchange="warehouseMovementsDateFrom=this.value; loadWarehouseMovements(true);" class="flex-1 p-2 border rounded-xl text-xs">
              <span class="text-gray-400 text-xs">—</span>
              <input type="date" value="${escapeHtml(warehouseMovementsDateTo)}" onchange="warehouseMovementsDateTo=this.value; loadWarehouseMovements(true);" class="flex-1 p-2 border rounded-xl text-xs">
            </div>
          ` : ''}
          <div id="harakatlar-results">${renderWarehouseHarakatlarResultsHtml()}</div>
        </div>
      `;
    }
    function renderWarehouseHarakatlarResultsHtml() {
      if (warehouseMovementsLoading) return `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`;
      if (!warehouseMovements.length) return `<div class="fc-empty-state"><i data-lucide="history" class="w-8 h-8"></i><p>${tr('Harakatlar yo‘q.', 'Движений пока нет.')}</p></div>`;
      return `
        <div class="space-y-1.5">${warehouseMovements.map(m => renderMovementRowHtml(m)).join('')}</div>
        ${renderPagerHTML(warehouseMovementsPage, Math.max(1, Math.ceil(warehouseMovementsTotal / 20)), 'setWarehouseMovementsPage')}
      `;
    }
    let warehouseMovementsSearchDebounceTimer = null;
    function handleWarehouseMovementsSearchDebounced() {
      clearTimeout(warehouseMovementsSearchDebounceTimer);
      warehouseMovementsSearchDebounceTimer = setTimeout(() => {
        const input = document.getElementById('harakatlar-search-input');
        warehouseMovementsSearch = input ? input.value : '';
        warehouseMovementsPage = 1;
        loadWarehouseMovements(true);
      }, 250);
    }
    function setWarehouseMovementsDateRange(key) {
      warehouseMovementsDateRange = key;
      if (key !== 'custom') { warehouseMovementsDateFrom = ''; warehouseMovementsDateTo = ''; }
      warehouseMovementsPage = 1;
      render();
      if (key !== 'custom') loadWarehouseMovements(true);
    }

    function renderMovementRowHtml(m) {
      const typeLabel = m.operationType === 'KIRIM' ? tr('Kirim', 'Приход') : m.operationType === 'BUYURTMA' ? tr('Buyurtma', 'Заказ') : tr("Qo'lda", 'Вручную');
      const typeVariant = m.operationType === 'KIRIM' ? 'success' : m.operationType === 'BUYURTMA' ? 'primary' : 'muted';
      const deltaText = m.delta > 0 ? `+${m.delta}` : String(m.delta);
      return `
        <div class="fc-card flex items-center justify-between gap-2 text-xs">
          <div class="min-w-0">
            <p class="font-bold text-gray-800 truncate">${escapeHtml(m.productName)}${m.productSku ? ` <span class="text-gray-400 font-normal">(ID: ${escapeHtml(m.productSku)})</span>` : ''}</p>
            <p class="text-[10px] text-gray-400">${new Date(m.createdAt).toLocaleString()}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="fc-badge fc-badge-${typeVariant}">${typeLabel}</span>
            <p class="font-bold mt-0.5 ${m.delta > 0 ? 'fc-text-success' : (m.delta < 0 ? 'fc-text-danger' : '')}">${m.priorStock} → ${m.newStock} (${deltaText})</p>
          </div>
        </div>
      `;
    }

    function pickKirimProduct(productId) {
      warehouseKirimSelectedProduct = products.find(p => p.id === productId) || null;
      warehouseKirimSelectedVariantSku = null;
      warehouseKirimQty = '';
      warehouseKirimShowCatalog = false;
      render();
    }
    function clearKirimSelection() {
      warehouseKirimSelectedProduct = null;
      warehouseKirimSelectedVariantSku = null;
      warehouseKirimQty = '';
      warehouseKirimSearch = '';
      render();
    }
    async function submitKirim() {
      const p = warehouseKirimSelectedProduct;
      if (!p || warehouseKirimSaving) return;
      const qty = Number.parseInt(warehouseKirimQty, 10);
      if (!Number.isInteger(qty) || qty <= 0) return alert(tr('Musbat son kiriting.', 'Введите положительное число.'));
      const vars = productVariants(p);
      if (vars.length && !warehouseKirimSelectedVariantSku) return alert(tr('Variant tanlang.', 'Выберите вариант.'));
      warehouseKirimSaving = true;
      render();
      showActionToast(tr('⏳ Saqlanmoqda...', '⏳ Сохранение...'), 'saving');
      try {
        const data = await callApi('record_stock_in', { productId: p.id, variantSku: warehouseKirimSelectedVariantSku || null, qty });
        const idx = products.findIndex(x => x.id === p.id);
        if (idx >= 0 && data.product) products[idx] = mapProductFromDB(data.product);
        saveCatalogCache();
        warehouseKirimSelectedProduct = null;
        warehouseKirimSelectedVariantSku = null;
        warehouseKirimQty = '';
        warehouseSummaryLoaded = false; // Holat keyingi tashrifda qayta hisoblansin
        warehouseMovementsPage = 1;
        warehouseKirimSaving = false;
        render();
        showActionToast(tr('✅ Kirim saqlandi', '✅ Приход сохранён'), 'success', 1500);
        loadWarehouseMovements(true);
      } catch (e) {
        warehouseKirimSaving = false;
        render();
        console.error(e);
        showActionToast(tr('❌ Saqlanmadi', '❌ Не сохранено'), 'error', 2000);
        alert(tr('Xatolik: ', 'Ошибка: ') + (e.message || e));
      }
    }

    function warehouseMovementsDateBounds() {
      const now = new Date();
      if (warehouseMovementsDateRange === 'today') {
        return { dateFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), dateTo: undefined };
      }
      if (warehouseMovementsDateRange === '7d') {
        return { dateFrom: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), dateTo: undefined };
      }
      if (warehouseMovementsDateRange === '30d') {
        return { dateFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), dateTo: undefined };
      }
      if (warehouseMovementsDateRange === 'custom') {
        return {
          dateFrom: warehouseMovementsDateFrom ? new Date(warehouseMovementsDateFrom + 'T00:00:00').toISOString() : undefined,
          dateTo: warehouseMovementsDateTo ? new Date(warehouseMovementsDateTo + 'T23:59:59').toISOString() : undefined,
        };
      }
      return { dateFrom: undefined, dateTo: undefined };
    }
    // Qidiruv debounce'dan keyin ham input DOM node'ni yo'q qilmaslik uchun
    // to'liq render() emas, faqat #harakatlar-results targeted yangilanadi.
    function updateWarehouseMovementsUI() {
      const el = document.getElementById('harakatlar-results');
      if (el) { el.innerHTML = renderWarehouseHarakatlarResultsHtml(); lucide.createIcons(); }
      else render();
    }
    async function loadWarehouseMovements(force = false) {
      if (!isUserAnAdmin || warehouseMovementsLoading || (warehouseMovementsLoaded && !force)) return;
      warehouseMovementsLoading = true;
      updateWarehouseMovementsUI();
      try {
        const { dateFrom, dateTo } = warehouseMovementsDateBounds();
        const data = await callApi('get_stock_movements', {
          type: warehouseMovementsFilter, page: warehouseMovementsPage,
          q: warehouseMovementsSearch.trim() || undefined, dateFrom, dateTo,
        });
        warehouseMovements = data.movements || [];
        warehouseMovementsTotal = data.total || 0;
        warehouseMovementsLoaded = true;
      } catch (e) {
        console.error('Harakatlar tarixini yuklashda xatolik:', e);
      } finally {
        warehouseMovementsLoading = false;
        updateWarehouseMovementsUI();
      }
    }
    function setWarehouseMovementsFilter(type) {
      warehouseMovementsFilter = type;
      warehouseMovementsPage = 1;
      render(); // chip active-holati darhol yangilansin (setWarehouseMovementsDateRange bilan bir xil naqsh)
      loadWarehouseMovements(true);
    }
    function setWarehouseMovementsPage(p) {
      warehouseMovementsPage = p;
      loadWarehouseMovements(true);
    }

    async function loadWarehouseSummary(force = false) {
      if (!isUserAnAdmin || warehouseSummaryLoading || (warehouseSummaryLoaded && !force)) return;
      warehouseSummaryLoading = true;
      if (currentTab === 'warehouse' && !isCatalogEditorModalOpen()) render();
      try {
        warehouseSummaryData = await callApi('get_warehouse_summary', {});
        warehouseSummaryLoaded = true;
      } catch (e) {
        console.error('Ombor holatini yuklashda xatolik:', e);
      } finally {
        warehouseSummaryLoading = false;
        if (currentTab === 'warehouse' && !isCatalogEditorModalOpen()) render();
      }
    }
    function switchWarehouseSubTab(tabName) {
      const previous = warehouseSubTab;
      warehouseSubTab = tabName === 'KIRIM' ? 'QOLDIQ' : tabName;
      warehouseStockFilter = null;
      if (warehouseSubTab === 'QOLDIQ' && previous !== 'QOLDIQ') warehouseBrowseCategoryId = null;
      render();
      if (warehouseSubTab === 'HARAKATLAR') loadWarehouseMovements();
    }
    function openWarehouseStockFilter(kind) {
      warehouseStockFilter = kind;
      warehouseStockFilterPage = 1;
      warehouseStockFilterSearch = '';
      render();
    }
    function closeWarehouseStockFilter() {
      warehouseStockFilter = null;
      warehouseStockFilterSearch = '';
      render();
    }
    function setWarehouseStockFilterPage(p) {
      warehouseStockFilterPage = p;
      render();
    }

    // pickMode=false (default, o'zgarmagan): qator bosilsa tezkor tahrirlash
    // oynasi ochiladi (Qoldiq tab). pickMode=true: qator bosilsa mahsulot
    // Kirim uchun TANLANADI (pickKirimProduct) — tahrirlash oynasi ochilmaydi.
    function renderCategoryTreeNodeHTML(cat, depth, pickMode = false) {
      const children = categories.filter(c => c.parentId === cat.id);
      const catProds = products.filter(p => p.categoryId === cat.id && p.status !== 'DELETED' && (!warehouseMissingImageOnly || !hasProductImage(p)) && (!warehouseImportedMissingImageOnly || (!hasProductImage(p) && p.importBatchId)));
      return `
        <div class="fc-stock-tree-node" style="--tree-depth:${Math.max(0, depth)}">
          <div class="fc-stock-tree-category">
            <span class="fc-stock-tree-folder"><i data-lucide="folder" class="w-4 h-4"></i></span>
            <b>${escapeHtml(categoryName(cat))}</b>
          </div>
          <div class="fc-stock-tree-children">
            ${catProds.map(p => {
              const vars = productVariants(p);
              const rowClick = pickMode ? `pickKirimProduct('${p.id}')` : null;
              if (vars.length > 0) {
                return vars.map(v => `
                  <button type="button" onclick="${rowClick || `openProductDetailModal('${p.id}')`}" class="fc-stock-tree-product">
                    <span class="fc-stock-tree-product-icon"><i data-lucide="package" class="w-4 h-4"></i></span>
                    <span class="fc-stock-tree-product-copy"><b>${escapeHtml(productName(p))} ${escapeHtml(variantLabel(v))}</b><small>ID: ${escapeHtml(v.sku)}</small></span>
                    <strong class="${v.qty > 0 ? 'is-in' : 'is-out'}">${v.qty} ${tr('ta','шт.')}</strong>
                  </button>
                `).join('');
              }
              return `
                <button type="button" onclick="${rowClick || `openEditFieldModal('${p.id}','stock')`}" class="fc-stock-tree-product">
                  <span class="fc-stock-tree-product-icon"><i data-lucide="package" class="w-4 h-4"></i></span>
                  <span class="fc-stock-tree-product-copy"><b>${escapeHtml(productName(p))}</b><small>ID: ${escapeHtml(p.sku)}</small></span>
                  <strong class="${p.stock > 0 ? 'is-in' : 'is-out'}">${p.stock} ${tr('ta','шт.')}</strong>
                </button>
              `;
            }).join('')}
            ${children.map(child => renderCategoryTreeNodeHTML(child, depth + 1, pickMode)).join('')}
          </div>
        </div>
      `;
    }

    // ---- Dashboard/Hisobot sahifasi (49-52-band: BITTA modul, ichki tablar
    // + davr filtri + bosiladigan kartalar boshqa modullarga deep-link qiladi) ----
    function dashboardGoToOrders(status) {
      adminOrderFilters = { status: status || 'ALL', region: 'ALL', payment: 'ALL', search: '' };
      ordersPage = 1;
      switchTab('orders');
    }
    function dashboardGoToWarehouseFilter(kind) {
      switchTab('warehouse');
      warehouseSubTab = 'HOLAT';
      openWarehouseStockFilter(kind);
    }
    function switchDashboardTab(tab) {
      dashboardTab = tab;
      render();
    }
    function setDashboardPeriod(period) {
      dashboardPeriod = period;
      if (period !== 'custom') { dashboardCustomFrom = ''; dashboardCustomTo = ''; reloadDashboardRange(); }
      else render();
    }
    async function reloadDashboardRange() {
      if (dashboardPeriod === 'custom' && (!dashboardCustomFrom || !dashboardCustomTo)) { render(); return; }
      render();
      try {
        const params = { period: dashboardPeriod };
        if (dashboardPeriod === 'custom') { params.dateFrom = dashboardCustomFrom; params.dateTo = dashboardCustomTo; }
        const data = await callApi('get_dashboard_lite', params);
        dashboardLiteData = data;
        if (data?.customers?.all) { usersSummary = data.customers.all; usersLoaded = true; }
      } catch (e) {
        console.error(e);
        alert(tr('❌ Yuklanmadi: ', '❌ Не загружено: ') + (e.message || e));
      } finally {
        if (activePage === 'DASHBOARD') render();
      }
    }
    // 51-band: "Mahsulotlar" tabi uchun kategoriya bo'yicha tushum — mavjud
    // client-side products/categories'dan hisoblanadi, YANGI backend so'rov
    // qo'shilmaydi (revenueByProduct'dagi sku orqali mos keladi).
    function dashboardTopCategoriesFromRevenue(revenueByProduct) {
      const bySku = new Map(products.map(p => [String(p.sku), p]));
      const catTotals = new Map();
      (revenueByProduct || []).forEach(r => {
        const p = r.sku ? bySku.get(String(r.sku)) : null;
        const key = (p ? productCategoryLabel(p) : '') || tr('Boshqa', 'Другое');
        const cur = catTotals.get(key) || { label: key, revenue: 0, qty: 0 };
        cur.revenue += r.revenue; cur.qty += r.qty;
        catTotals.set(key, cur);
      });
      return [...catTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    }
    function renderDashboardPage(container) {
      const d = dashboardLiteData;
      if (dashboardLiteLoading || !d) {
        renderPageShell(container, tr('Hisobot', 'Отчёт'), `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`);
        return;
      }
      const tabs = [
        { key: 'UMUMIY', label: tr('Umumiy', 'Общее') },
        { key: 'BUYURTMALAR', label: tr('Buyurtmalar', 'Заказы') },
        { key: 'SAVDO', label: tr('Savdo', 'Продажи') },
        { key: 'MIJOZLAR', label: tr('Mijozlar', 'Клиенты') },
        { key: 'MAHSULOTLAR', label: tr('Mahsulotlar', 'Товары') },
      ];
      const periodChips = [
        { key: 'today', label: tr('Bugun', 'Сегодня') },
        { key: 'week', label: tr('Hafta', 'Неделя') },
        { key: 'month', label: tr('Oy', 'Месяц') },
        { key: 'all', label: tr('Hammasi', 'Всё время') },
        { key: 'custom', label: tr('Oraliq', 'Период') },
      ];
      const showPeriodFilter = dashboardTab !== 'UMUMIY' && dashboardTab !== 'MIJOZLAR';
      const tabIcons = { UMUMIY:'layout-dashboard', BUYURTMALAR:'package-check', SAVDO:'chart-no-axes-combined', MIJOZLAR:'users', MAHSULOTLAR:'boxes' };
      const body = `
        <div class="fc-report-page">
          <div class="fc-report-tabs">
            ${tabs.map(tb => `<button onclick="switchDashboardTab('${tb.key}')" class="fc-report-tab ${dashboardTab === tb.key ? 'is-active' : ''}"><i data-lucide="${tabIcons[tb.key]}" class="w-4 h-4"></i><span>${tb.label}</span></button>`).join('')}
          </div>
          ${showPeriodFilter ? `
            <div class="fc-report-periods">
              ${periodChips.map(c => `<button onclick="setDashboardPeriod('${c.key}')" class="fc-report-period ${dashboardPeriod === c.key ? 'is-active' : ''}">${c.label}</button>`).join('')}
            </div>
            ${dashboardPeriod === 'custom' ? `
              <div class="fc-report-date-range">
                <label><span>${tr('Boshlanish','Начало')}</span><input type="date" value="${escapeHtml(dashboardCustomFrom)}" onchange="dashboardCustomFrom=this.value; reloadDashboardRange();"></label>
                <label><span>${tr('Tugash','Конец')}</span><input type="date" value="${escapeHtml(dashboardCustomTo)}" onchange="dashboardCustomTo=this.value; reloadDashboardRange();"></label>
              </div>
            ` : ''}
          ` : ''}
          <div class="fc-report-content">${renderDashboardTabBodyHtml(d)}</div>
        </div>
      `;
      renderPageShell(container, tr('Hisobot', 'Отчёт'), body);
    }
    function renderDashboardTabBodyHtml(d) {
      if (dashboardTab === 'UMUMIY') return renderDashboardUmumiyHtml(d);
      if (dashboardTab === 'BUYURTMALAR') return renderDashboardBuyurtmalarHtml(d);
      if (dashboardTab === 'SAVDO') return renderDashboardSavdoHtml(d);
      if (dashboardTab === 'MIJOZLAR') return renderDashboardMijozlarHtml(d);
      return renderDashboardMahsulotlarHtml(d);
    }
    function renderDashboardUmumiyHtml(d) {
      const salesCard = (label, amount, count) => `
        <div class="fc-card">
          <p class="text-gray-500 text-[11px]">${label}</p>
          <b class="text-lg block">${money(amount)}</b>
          <p class="text-[10px] text-gray-400">${count} ${tr('ta buyurtma', 'заказов')}</p>
        </div>`;
      const orderStatusBadge = (label, count, variant, status) => `
        <div onclick="dashboardGoToOrders('${status}')" class="fc-card flex items-center justify-between cursor-pointer hover:bg-gray-50">
          <span class="text-xs font-bold">${label}</span>
          <span class="fc-badge fc-badge-${variant}">${count}</span>
        </div>`;
      return `
        <section>
          <h3 class="fc-report-section-title"><i data-lucide="wallet-cards" class="w-4 h-4"></i>${tr('Savdo', 'Продажи')}</h3>
          <div class="grid grid-cols-2 gap-2">
            ${salesCard(tr('Bugungi savdo', 'Продажи сегодня'), d.sales.today, d.sales.todayCount)}
            ${salesCard(tr('7 kun', '7 дней'), d.sales.week, d.sales.weekCount)}
            ${salesCard(tr('30 kun', '30 дней'), d.sales.days30, d.sales.days30Count)}
            ${salesCard(tr('Shu oy', 'Этот месяц'), d.sales.month, d.sales.monthCount)}
          </div>
          <div class="fc-card mt-2">
            <p class="text-gray-500 text-[11px]">${tr('Jami tushum (hammasi)', 'Общая выручка (всё время)')}</p>
            <b class="text-xl block">${money(d.sales.allTime)}</b>
            <p class="text-[10px] text-gray-400">${d.sales.allTimeCount} ${tr('ta buyurtma', 'заказов')}</p>
          </div>
        </section>

        <section>
          <h3 class="fc-report-section-title"><i data-lucide="package-check" class="w-4 h-4"></i>${tr('Buyurtmalar', 'Заказы')}</h3>
          <div class="grid grid-cols-2 gap-2">
            ${orderStatusBadge(tr('Yangi', 'Новые'), d.orders.NEW, 'warning', 'NEW')}
            ${orderStatusBadge(tr('Tayyorlanmoqda', 'В обработке'), d.orders.PROCESSING, 'primary', 'PROCESSING')}
            ${orderStatusBadge(tr('Yetkazilgan', 'Доставлены'), d.orders.DELIVERED, 'success', 'DELIVERED')}
            ${orderStatusBadge(tr('Bekor/rad', 'Отменены/откл.'), d.orders.CANCELLED + d.orders.REJECTED, 'danger', 'CANCELLED')}
          </div>
        </section>

        <section>
          <h3 class="fc-report-section-title"><i data-lucide="boxes" class="w-4 h-4"></i>${tr('Tovarlar', 'Товары')}</h3>
          <div class="grid grid-cols-2 gap-2">
            <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Jami mahsulot', 'Всего товаров')}</p><b class="text-lg block">${d.products.total}</b></div>
            <div onclick="dashboardGoToWarehouseFilter('LOW')" class="fc-card fc-border-warning cursor-pointer hover:bg-gray-50"><p class="text-gray-500 text-[11px]">${tr('Kam qolgan', 'Заканчивается')}</p><b class="text-lg block fc-text-warning">${d.products.lowStock}</b></div>
            <div onclick="dashboardGoToWarehouseFilter('OUT')" class="fc-card fc-border-danger col-span-2 cursor-pointer hover:bg-gray-50"><p class="text-gray-500 text-[11px]">${tr('Tugagan', 'Нет в наличии')}</p><b class="text-lg block fc-text-danger">${d.products.outOfStock}</b></div>
          </div>
        </section>

        ${d.regions.length ? `
          <section>
            <h3 class="fc-report-section-title"><i data-lucide="map-pin" class="w-4 h-4"></i>${tr('Hududlar', 'Регионы')}</h3>
            <div class="fc-card space-y-1.5">
              ${d.regions.map((r, i) => `<div class="flex items-center justify-between text-xs ${i ? 'border-t pt-1.5' : ''}"><span>${i + 1}. ${escapeHtml(r.label)}</span><b>${r.count} ${tr('ta buyurtma', 'заказов')}</b></div>`).join('')}
            </div>
          </section>
        ` : ''}
      `;
    }
    function renderDashboardBuyurtmalarHtml(d) {
      const sr = d.selectedRange || { orders: { NEW: 0, PROCESSING: 0, DELIVERED: 0, CANCELLED: 0, REJECTED: 0 } };
      const orderStatusBadge = (label, count, variant, status) => `
        <div onclick="dashboardGoToOrders('${status}')" class="fc-card flex items-center justify-between cursor-pointer hover:bg-gray-50">
          <span class="text-xs font-bold">${label}</span>
          <span class="fc-badge fc-badge-${variant}">${count}</span>
        </div>`;
      const total = sr.orders.NEW + sr.orders.PROCESSING + sr.orders.DELIVERED + sr.orders.CANCELLED;
      return `
        <section>
          <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Tanlangan davrdagi buyurtmalar', 'Заказы за выбранный период')}</p><b class="text-xl block">${total}</b></div>
          <div class="grid grid-cols-2 gap-2 mt-2">
            ${orderStatusBadge(tr('Yangi', 'Новые'), sr.orders.NEW, 'warning', 'NEW')}
            ${orderStatusBadge(tr('Tayyorlanmoqda', 'В обработке'), sr.orders.PROCESSING, 'primary', 'PROCESSING')}
            ${orderStatusBadge(tr('Yetkazilgan', 'Доставлены'), sr.orders.DELIVERED, 'success', 'DELIVERED')}
            ${orderStatusBadge(tr('Bekor/rad', 'Отменены/откл.'), sr.orders.CANCELLED + sr.orders.REJECTED, 'danger', 'CANCELLED')}
          </div>
          <p class="text-[10px] text-gray-400 mt-2">${tr('Kartani bosib to‘liq ro‘yxatga o‘ting.', 'Нажмите карточку, чтобы открыть полный список.')}</p>
        </section>
      `;
    }
    function renderDashboardSavdoHtml(d) {
      const sr = d.selectedRange || { sales: { amount: 0, count: 0 } };
      return `
        <section>
          <div class="fc-card">
            <p class="text-gray-500 text-[11px]">${tr('Tanlangan davrdagi savdo', 'Продажи за выбранный период')}</p>
            <b class="text-2xl block">${money(sr.sales.amount)}</b>
            <p class="text-[10px] text-gray-400">${sr.sales.count} ${tr('ta buyurtma', 'заказов')}</p>
          </div>
        </section>
      `;
    }
    function renderDashboardMijozlarHtml(d) {
      const custPage = paginate([...usersSummary].sort((a, b) => b.totalOrders - a.totalOrders), dashboardCustomerPage, 10);
      return `
        <section>
          <div class="grid grid-cols-3 gap-2">
            <div class="fc-card"><p class="text-gray-500 text-[10px]">${tr('Jami', 'Всего')}</p><b class="text-lg block">${d.customers.total}</b></div>
            <div class="fc-card"><p class="text-gray-500 text-[10px]">${tr('Yangi (30 kun)', 'Новые (30д)')}</p><b class="text-lg block">${d.customers.new30d}</b></div>
            <div class="fc-card"><p class="text-gray-500 text-[10px]">${tr('Qayta buyurtma', 'Повторные')}</p><b class="text-lg block">${d.customers.repeat}</b></div>
          </div>
          <p class="text-[11px] text-gray-500 mt-3">${tr("Mijozlar buyurtmalar soni bo'yicha tartiblangan.", "Клиенты отсортированы по количеству заказов.")}</p>
          <div class="bg-white rounded-2xl border divide-y mt-1">
            ${usersLoading ? `<p class="text-xs text-blue-500 p-4 text-center">${tr("⏳ Yuklanmoqda...", "⏳ Загрузка...")}</p>` : (usersSummary.length === 0 ? `<p class="text-xs text-gray-400 p-4 text-center">${tr("Hozircha mijozlar yo'q", "Клиентов пока нет")}</p>` : custPage.items.map(u => `
              <div onclick="openUserModal('${u.tgId}')" class="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50">
                <div>
                  <div class="flex items-center gap-1.5">
                    <p class="font-bold text-sm text-gray-800">${escapeHtml(u.userName)}</p>
                    ${u.isBlocked ? `<span class="fc-badge fc-badge-danger">${tr("BLOK", "БЛОК")}</span>` : (u.warned ? `<span class="fc-badge fc-badge-warning">${tr("OGOH", "ПРЕДУПР.")}</span>` : '')}
                  </div>
                  <p class="text-[10px] text-gray-400">${escapeHtml(u.phone || '')} · ID: ${escapeHtml(u.tgId)}</p>
                </div>
                <div class="text-right">
                  <p class="font-black text-blue-600 text-sm">${u.totalOrders} ${tr("buyurtma", "заказов")}</p>
                  <p class="text-[10px] text-gray-400">✅${u.delivered} ⏳${u.active} ❌${u.cancelled}</p>
                </div>
              </div>
            `).join(''))}
          </div>
          ${renderPagerHTML(custPage.page, custPage.totalPages, 'setDashboardCustomerPage')}
        </section>
      `;
    }
    function renderDashboardMahsulotlarHtml(d) {
      const revenueByProduct = (d.selectedRange && d.selectedRange.products.revenueByProduct) || [];
      const topCategories = dashboardTopCategoriesFromRevenue(revenueByProduct);
      return `
        <section>
          <div class="grid grid-cols-2 gap-2">
            <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Jami mahsulot', 'Всего товаров')}</p><b class="text-lg block">${d.products.total}</b></div>
            <div onclick="dashboardGoToWarehouseFilter('LOW')" class="fc-card fc-border-warning cursor-pointer hover:bg-gray-50"><p class="text-gray-500 text-[11px]">${tr('Kam qolgan', 'Заканчивается')}</p><b class="text-lg block fc-text-warning">${d.products.lowStock}</b></div>
          </div>

          <h3 class="fc-report-section-title mt-3"><i data-lucide="trophy" class="w-4 h-4"></i>${tr('Eng ko‘p sotilgan (hammasi)', 'Самые продаваемые (всё время)')}</h3>
          ${d.products.bestSellers.length ? `
            <div class="fc-card">
              ${d.products.bestSellers.map((p, i) => `<div class="flex items-center justify-between py-1 ${i ? 'border-t' : ''}"><span class="text-xs truncate">${i + 1}. ${escapeHtml(p.name)}</span><b class="text-xs shrink-0">${p.soldCount}</b></div>`).join('')}
            </div>
          ` : `<div class="fc-empty-state"><p>${tr('Ma’lumot yo‘q', 'Нет данных')}</p></div>`}

          <h3 class="fc-report-section-title mt-3"><i data-lucide="badge-dollar-sign" class="w-4 h-4"></i>${tr('Tanlangan davrda tushum (mahsulot bo‘yicha)', 'Выручка за период (по товарам)')}</h3>
          ${revenueByProduct.length ? `
            <div class="fc-card">
              ${revenueByProduct.map((r, i) => `<div class="flex items-center justify-between py-1 ${i ? 'border-t' : ''}"><span class="text-xs truncate flex-1">${i + 1}. ${escapeHtml(r.name)}${r.sku ? ` <span class="text-gray-400">(${escapeHtml(r.sku)})</span>` : ''}</span><b class="text-xs shrink-0 ml-2">${money(r.revenue)}</b></div>`).join('')}
            </div>
          ` : `<div class="fc-empty-state"><p>${tr('Tanlangan davrda savdo yo‘q', 'Нет продаж за выбранный период')}</p></div>`}

          ${topCategories.length ? `
            <h3 class="fc-report-section-title mt-3"><i data-lucide="folder-kanban" class="w-4 h-4"></i>${tr('Yetakchi kategoriyalar (tanlangan davr)', 'Топ категорий (за период)')}</h3>
            <div class="fc-card space-y-1.5">
              ${topCategories.map((c, i) => `<div class="flex items-center justify-between text-xs ${i ? 'border-t pt-1.5' : ''}"><span>${i + 1}. ${escapeHtml(c.label)}</span><b>${money(c.revenue)}</b></div>`).join('')}
            </div>
          ` : ''}
        </section>
      `;
    }

    function openUserModal(tgId) {
      selectedUserModal = usersSummary.find(u => u.tgId === tgId);
      renderModalContainer();
    }

    function openBlockUserModal(tgId) {
      selectedUserModal = usersSummary.find(u => u.tgId === tgId);
      activePopupModal = 'BLOCK_USER';
      render();
    }

    async function refreshUsersSummary() {
      try {
        const data = await callApi('get_users_summary', {});
        usersSummary = data.users || [];
        usersLoaded = true;
      } catch (e) { console.error('Mijozlarni yangilashda xatolik:', e); }
    }

    async function submitBlockUser(tgId) {
      const reason = document.getElementById('bl-reason').value;
      const note = document.getElementById('bl-note').value.trim();
      if (!confirm(tr("Rostdan ham bu mijozni bloklaysizmi? U buyurtma bera olmaydi.", "Заблокировать этого клиента? Он не сможет оформлять заказы."))) return;
      const idx = usersSummary.findIndex(u => u.tgId === tgId);
      const old = idx >= 0 ? cloneData(usersSummary[idx]) : null;
      if (idx >= 0) {
        usersSummary[idx].isBlocked = true;
        usersSummary[idx].blockReason = reason || note || null;
      }
      activePopupModal = null;
      selectedUserModal = idx >= 0 ? usersSummary[idx] : null;
      render();
      showActionToast(tr("⏳ Bloklanmoqda...", "⏳ Блокировка..."), 'saving');
      try {
        await callApi('block_user', { tgId, reason, note });
        showActionToast(tr("✅ Mijoz bloklandi", "✅ Клиент заблокирован"), 'success', 1200);
        refreshUsersSummary().then(() => { selectedUserModal = usersSummary.find(u => u.tgId === tgId) || null; render(); });
      } catch (e) {
        console.error(e);
        if (idx >= 0 && old) usersSummary[idx] = old;
        selectedUserModal = usersSummary.find(u => u.tgId === tgId) || null;
        render();
        showActionToast(tr("❌ Amal bajarilmadi", "❌ Действие не выполнено"), 'error', 1800);
        alert(tr("❌ Xatolik yuz berdi: ", "❌ Произошла ошибка: ") + (e.message || e));
      }
    }

    async function unblockUser(tgId) {
      if (!confirm(tr("Bu mijoz blokdan chiqarilsinmi?", "Разблокировать этого клиента?"))) return;
      const idx = usersSummary.findIndex(u => u.tgId === tgId);
      const old = idx >= 0 ? cloneData(usersSummary[idx]) : null;
      if (idx >= 0) { usersSummary[idx].isBlocked = false; usersSummary[idx].blockReason = null; }
      selectedUserModal = idx >= 0 ? usersSummary[idx] : null;
      render();
      showActionToast(tr("⏳ Blokdan chiqarilmoqda...", "⏳ Разблокировка..."), 'saving');
      try {
        await callApi('unblock_user', { tgId });
        showActionToast(tr("✅ Blokdan chiqarildi", "✅ Разблокирован"), 'success', 1200);
        refreshUsersSummary().then(() => { selectedUserModal = usersSummary.find(u => u.tgId === tgId) || null; render(); });
      } catch (e) {
        console.error(e);
        if (idx >= 0 && old) usersSummary[idx] = old;
        selectedUserModal = usersSummary.find(u => u.tgId === tgId) || null;
        render();
        showActionToast(tr("❌ Amal bajarilmadi", "❌ Действие не выполнено"), 'error', 1800);
        alert(tr("❌ Xatolik yuz berdi: ", "❌ Произошла ошибка: ") + (e.message || e));
      }
    }

    // 18-band: matnni saqlash — webhook ulash (setupBotWebhook, o'zgarmagan)
    // dan alohida, START_MESSAGE modalidagi "Saqlash" tugmasi chaqiradi.
    async function saveStartMessage() {
      if (!isSuperAdmin) return;
      const value = document.getElementById('sm-text')?.value.trim() || null;
      const old = shopContact.startMessage;
      shopContact = { ...shopContact, startMessage: value };
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохранение..."), 'saving');
      try {
        await callApi('set_start_message', { startMessage: value });
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 1600);
      } catch (e) {
        console.error(e);
        shopContact = { ...shopContact, startMessage: old };
        render();
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 2000);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      }
    }

    async function setupBotWebhook() {
      if (!isSuperAdmin) return;
      if (!confirm(tr("Telegram /start xabarlarini Supabase orqali ulaysizmi?", "Подключить сообщения /start через Supabase?"))) return;
      showActionToast(tr("Ulanmoqda...", "Подключение..."), 'saving');
      try {
        const data = await callApi('setup_bot_webhook', {});
        if (!data.ok) throw new Error(data.description || 'webhook_setup_failed');
        showActionToast(tr("✅ /start xabari ulandi", "✅ /start подключён"), 'success', 2200);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ /start ulanmagan", "❌ /start не подключён"), 'error', 2400);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      }
    }

    // 6. PROFIL TAB (SUPER ADMIN & ADMIN MANAGEMENT)
    function cleanSocialNick(value) {
      return String(value || '').trim().replace(/^@/, '').replace(/\/+$/, '');
    }

    function shopInfoIsEmpty() {
      return !shopContact.address && !shopContact.coordinates && !shopContact.phone && !shopContact.phone2 &&
        !shopContact.phone3 && !shopContact.instagram && !shopContact.telegram && !shopContact.facebook && !shopContact.workHours;
    }

    const DELIVERY_CONFIG_KEYS = { FREE: 'free', FIXED: 'fixed', TAXI: 'taxi' };
    function encodedRegionId(regionId) { return encodeURIComponent(regionId); }
    function decodedRegionId(regionId) { return decodeURIComponent(regionId); }

    // 5-band: Do'kon sozlamalari endi modal emas, header sozlama iconi orqali
    // ochiladigan ALOHIDA SAHIFA. Ichidagi 3 bo'lim (Buyurtma ma'lumotlari/
    // Yetkazib berish/Dizayn) hozirgidek modal bo'lib ochilib turadi — ular
    // yopilganda (activePopupModal=null) ostidagi shu sahifa qayta ko'rinadi,
    // shuning uchun murakkab mavjud mantiqqa (Fulfillment/Dizayn) tegilmadi.
    function openShopParams() {
      if (!isUserAnAdmin || !isAdminMode) return;
      openPage('SETTINGS');
    }

    // ==================== 4-BLOK: DO'KON DIZAYNI ====================
    const DESIGN_COLOR_KEYS = ['primary','accent','button','buttonText','secondaryButton','pageBg','panelBg','cardBg','inputBg','headerBg','headerText','bottomNavBg','bottomNavText','border','text','secondaryText','mutedText','success','warning','danger'];
    const DESIGN_COLOR_LABELS = {
      primary: tr('Asosiy rang','Основной цвет'), accent: tr("Urg'u rangi",'Акцентный цвет'),
      button: tr('Asosiy tugma','Основная кнопка'), buttonText: tr('Tugma matni','Текст кнопки'), secondaryButton: tr('Ikkinchi tugma','Вторичная кнопка'),
      pageBg: tr('Sahifa foni','Фон страницы'), panelBg: tr('Ichki panel foni','Фон внутренних панелей'), cardBg: tr('Kartalar foni','Фон карточек'), inputBg: tr('Input / qidiruv foni','Фон полей / поиска'),
      headerBg: tr('Header foni','Фон шапки'), headerText: tr('Header matni','Текст шапки'), bottomNavBg: tr('Pastki panel foni','Фон нижней панели'), bottomNavText: tr('Pastki panel matni','Текст нижней панели'),
      border: tr('Chegara / border','Границы'), text: tr('Asosiy matn','Основной текст'), secondaryText: tr('Ikkinchi matn','Вторичный текст'), mutedText: tr('Xira matn','Приглушённый текст'),
      success: tr('Muvaffaqiyat / qoldiq','Успех / остаток'), warning: tr('Ogohlantirish','Предупреждение'), danger: tr('Xato / bekor','Ошибка / отмена'),
    };
    // ROUND 11: Dark foydalanuvchi ma'qullagan premium navy/slate ko'rinishga
    // yangilandi. Har bir preset barcha yangi semantik rang rollarini beradi.
    const DESIGN_THEMES = {
      minimal: { label: tr('Minimal', 'Минимал'), colors: { primary:'#2563eb', accent:'#0ea5e9', button:'#2563eb', buttonText:'#ffffff', secondaryButton:'#eef2f7', pageBg:'#f6f8fb', panelBg:'#f1f5f9', cardBg:'#ffffff', inputBg:'#fbfdff', headerBg:'#ffffff', headerText:'#172033', bottomNavBg:'#ffffff', bottomNavText:'#526174', border:'#e2e8f0', text:'#1f2937', secondaryText:'#526174', mutedText:'#7c8a9e', success:'#16a34a', warning:'#d97706', danger:'#dc2626' } },
      dark: { label: tr('Dark', 'Тёмная'), colors: { primary:'#60a5fa', accent:'#38bdf8', button:'#2f6fed', buttonText:'#ffffff', secondaryButton:'#29415f', pageBg:'#15253c', panelBg:'#192d48', cardBg:'#203652', inputBg:'#182b45', headerBg:'#10243b', headerText:'#f8fafc', bottomNavBg:'#10243b', bottomNavText:'#c7d5e6', border:'#3a5574', text:'#f8fafc', secondaryText:'#c8d5e5', mutedText:'#98abc1', success:'#35c96f', warning:'#f2ad42', danger:'#f05b61' } },
      sport: { label: tr('Sport', 'Спорт'), colors: { primary:'#1d4ed8', accent:'#f97316', button:'#2563eb', buttonText:'#ffffff', secondaryButton:'#eaf0f8', pageBg:'#f5f8fc', panelBg:'#eef4fb', cardBg:'#ffffff', inputBg:'#f8fbff', headerBg:'#ffffff', headerText:'#172033', bottomNavBg:'#ffffff', bottomNavText:'#526174', border:'#dbe5f0', text:'#172033', secondaryText:'#526174', mutedText:'#7b8ca1', success:'#16a34a', warning:'#d97706', danger:'#dc2626' } },
      elegant: { label: tr('Elegant', 'Элегант'), colors: { primary:'#6d28d9', accent:'#c084fc', button:'#7c3aed', buttonText:'#ffffff', secondaryButton:'#f0e8fb', pageBg:'#faf7ff', panelBg:'#f5effc', cardBg:'#ffffff', inputBg:'#fcfaff', headerBg:'#ffffff', headerText:'#2e1065', bottomNavBg:'#ffffff', bottomNavText:'#65547b', border:'#e8ddf3', text:'#2e1065', secondaryText:'#65547b', mutedText:'#8f7ca5', success:'#15803d', warning:'#b45309', danger:'#b91c1c' } },
      bright: { label: tr('Bright', 'Яркая'), colors: { primary:'#0f766e', accent:'#f59e0b', button:'#0d9488', buttonText:'#ffffff', secondaryButton:'#e6f4f2', pageBg:'#f3faf9', panelBg:'#eaf6f4', cardBg:'#ffffff', inputBg:'#f8fdfc', headerBg:'#ffffff', headerText:'#17324d', bottomNavBg:'#ffffff', bottomNavText:'#4b6678', border:'#d8e9e6', text:'#17324d', secondaryText:'#4b6678', mutedText:'#71889a', success:'#15803d', warning:'#c26a05', danger:'#c24145' } },
    };

    // ---- 4.3: WCAG kontrast hisoblash ----
    // ROUND 11 rang generatori ham aynan shu tekshiruvlardan foydalanadi.
    function hexToRgb(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function relLuminance(hex) {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;
      const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function contrastRatio(hex1, hex2) {
      const l1 = relLuminance(hex1), l2 = relLuminance(hex2);
      if (l1 === null || l2 === null) return 0;
      const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }
    function readableTextColor(bgHex) {
      const white = contrastRatio(bgHex, '#ffffff');
      const black = contrastRatio(bgHex, '#000000');
      return white >= black ? '#ffffff' : '#000000';
    }
    const WCAG_AA_RATIO = 4.5;

    function normalizeDesignHex(value) {
      let v=String(value||'').trim();
      if (/^[0-9a-f]{6}$/i.test(v)) v='#'+v;
      if (/^#[0-9a-f]{3}$/i.test(v)) v='#'+v.slice(1).split('').map(ch=>ch+ch).join('');
      return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
    }
    function hslToHex(h,s,l) {
      h=((Number(h)%360)+360)%360; s=Math.max(0,Math.min(100,Number(s)))/100; l=Math.max(0,Math.min(100,Number(l)))/100;
      const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2; let r=0,g=0,b=0;
      if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}
      const hx=n=>Math.round((n+m)*255).toString(16).padStart(2,'0'); return `#${hx(r)}${hx(g)}${hx(b)}`;
    }
    function randomBetween(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

    function designColorsWithDefaults(colors, themeId = null) {
      const base = DESIGN_THEMES[themeId]?.colors || DESIGN_THEMES.minimal.colors;
      const merged = {};
      for (const key of DESIGN_COLOR_KEYS) merged[key] = normalizeDesignHex(colors && colors[key]) || base[key];
      return merged;
    }

    function findContrastIssues(colors, themeId = null) {
      const c = designColorsWithDefaults(colors, themeId);
      const issues=[];
      if (contrastRatio(c.text, c.pageBg) < WCAG_AA_RATIO) issues.push({ pair:tr('Matn / Sahifa foni','Текст / Фон страницы'), ratio:contrastRatio(c.text,c.pageBg) });
      if (contrastRatio(c.text, c.cardBg) < WCAG_AA_RATIO) issues.push({ pair:tr('Matn / Karta foni','Текст / Фон карточек'), ratio:contrastRatio(c.text,c.cardBg) });
      if (contrastRatio(c.secondaryText, c.cardBg) < WCAG_AA_RATIO) issues.push({ pair:tr('Ikkinchi matn / Karta','Вторичный текст / Карточка'), ratio:contrastRatio(c.secondaryText,c.cardBg) });
      if (contrastRatio(c.buttonText, c.button) < WCAG_AA_RATIO) issues.push({ pair:tr('Tugma matni / Tugma','Текст кнопки / Кнопка'), ratio:contrastRatio(c.buttonText,c.button) });
      if (contrastRatio(c.headerText, c.headerBg) < WCAG_AA_RATIO) issues.push({ pair:tr('Header matni / Header','Текст шапки / Шапка'), ratio:contrastRatio(c.headerText,c.headerBg) });
      if (contrastRatio(c.bottomNavText, c.bottomNavBg) < WCAG_AA_RATIO) issues.push({ pair:tr('Pastki panel matni / Fon','Текст нижней панели / Фон'), ratio:contrastRatio(c.bottomNavText,c.bottomNavBg) });
      return issues;
    }

    function buildGeneratedDesignColors() {
      const hue=randomBetween(0,359), accentHue=(hue+randomBetween(35,85))%360;
      const isDark=Math.random()<0.55;
      if(isDark){
        const pageBg=hslToHex(hue,30,16), panelBg=hslToHex(hue,32,20), cardBg=hslToHex(hue,31,24), inputBg=hslToHex(hue,32,19), headerBg=hslToHex(hue,36,13), bottomNavBg=hslToHex(hue,36,14);
        const button=hslToHex(hue,76,57);
        return { primary:hslToHex(hue,86,70), accent:hslToHex(accentHue,82,64), button, buttonText:readableTextColor(button), secondaryButton:hslToHex(hue,28,29), pageBg, panelBg, cardBg, inputBg, headerBg, headerText:'#f8fafc', bottomNavBg, bottomNavText:'#d5dfeb', border:hslToHex(hue,25,38), text:'#f8fafc', secondaryText:'#d1dbe7', mutedText:'#a4b4c7', success:hslToHex(145,62,55), warning:hslToHex(39,84,62), danger:hslToHex(358,76,66) };
      }
      const button=hslToHex(hue,70,45);
      return { primary:hslToHex(hue,72,42), accent:hslToHex(accentHue,78,48), button, buttonText:readableTextColor(button), secondaryButton:hslToHex(hue,30,93), pageBg:hslToHex(hue,28,97), panelBg:hslToHex(hue,28,94), cardBg:'#ffffff', inputBg:hslToHex(hue,25,98), headerBg:'#ffffff', headerText:hslToHex(hue,38,20), bottomNavBg:'#ffffff', bottomNavText:hslToHex(hue,25,34), border:hslToHex(hue,22,86), text:hslToHex(hue,38,19), secondaryText:hslToHex(hue,24,34), mutedText:hslToHex(hue,17,45), success:hslToHex(145,62,36), warning:hslToHex(38,82,39), danger:hslToHex(358,66,45) };
    }

    function applyDesignColors(colors, themeId = null) {
      const c = designColorsWithDefaults(colors, themeId);
      const root = document.documentElement.style;
      root.setProperty('--ustore-primary', c.primary);
      root.setProperty('--ustore-accent', c.accent);
      root.setProperty('--ustore-button', c.button);
      root.setProperty('--ustore-button-text', c.buttonText || readableTextColor(c.button));
      root.setProperty('--ustore-secondary-button', c.secondaryButton);
      root.setProperty('--ustore-page-bg', c.pageBg);
      root.setProperty('--ustore-panel-bg', c.panelBg);
      root.setProperty('--ustore-card-bg', c.cardBg);
      root.setProperty('--ustore-input-bg', c.inputBg);
      root.setProperty('--ustore-header-bg', c.headerBg);
      root.setProperty('--ustore-header-text', c.headerText);
      root.setProperty('--ustore-bottomnav-bg', c.bottomNavBg);
      root.setProperty('--ustore-bottomnav-text', c.bottomNavText);
      root.setProperty('--ustore-border', c.border);
      root.setProperty('--ustore-text', c.text);
      root.setProperty('--ustore-secondary-text', c.secondaryText);
      root.setProperty('--ustore-muted-text', c.mutedText);
      root.setProperty('--ustore-success', c.success);
      root.setProperty('--ustore-warning', c.warning);
      root.setProperty('--ustore-danger', c.danger);
      const dark = (relLuminance(c.pageBg) ?? 1) < 0.18;
      document.documentElement.classList.toggle('ustore-dark-theme', dark);
    }

    function openDesignSettings() {
      if (!isUserAnAdmin || !isAdminMode) return;
      designDraft = { themeId: designSettings.themeId, colors: { ...designSettings.colors } };
      openPage('DESIGN_SETTINGS');
    }
    function closeDesignSettings() {
      applyDesignColors(designSettings.colors, designSettings.themeId);
      designDraft = null;
      closePage();
    }
    function pickDesignTheme(themeId) {
      const theme = DESIGN_THEMES[themeId];
      if (!theme) return;
      designDraft.themeId = themeId;
      designDraft.colors = { ...theme.colors };
      applyDesignColors(designDraft.colors);
      render();
    }
    function generateDesignTheme() {
      if (!designDraft) designDraft={themeId:'generated',colors:{}};
      let colors=buildGeneratedDesignColors();
      // Generator yomon kontrast bersa 12 martagacha qayta urinadi.
      for(let i=0;i<12 && findContrastIssues(colors).length;i++) colors=buildGeneratedDesignColors();
      designDraft.themeId='generated';
      designDraft.colors=colors;
      applyDesignColors(colors);
      render();
      showActionToast(tr('✨ Yangi dizayn yaratildi — yoqsa Saqlashni bosing','✨ Новый дизайн создан — если нравится, нажмите Сохранить'),'success',1800);
    }
    function setDesignColor(key, value) {
      if (!DESIGN_COLOR_KEYS.includes(key)) return;
      const normalized=normalizeDesignHex(value);
      if(!normalized){ showActionToast(tr("HEX rang noto'g'ri",'Неверный HEX-цвет'),'error',1500); render(); return; }
      if(!designDraft) designDraft={themeId:'custom',colors:{}};
      const baseThemeId = designDraft.themeId;
      designDraft.colors = { ...designColorsWithDefaults(designDraft.colors, baseThemeId), [key]: normalized };
      designDraft.themeId = 'custom';
      applyDesignColors(designDraft.colors);
      render();
    }
    async function saveDesignSettings() {
      if(!designDraft) return;
      const issues = findContrastIssues(designDraft.colors, designDraft.themeId);
      if (issues.length) {
        const msg = issues.map(i => `${i.pair}: ${i.ratio.toFixed(1)}:1 (kerak ${WCAG_AA_RATIO}:1)`).join('\n');
        if (!confirm(tr(`⚠️ Ba'zi rang juftlari o'qilishi qiyin bo'lishi mumkin:\n${msg}\n\nBaribir saqlaysizmi?`, `⚠️ Некоторые сочетания цветов трудно читать:\n${msg}\n\nВсё равно сохранить?`))) return;
      }
      showActionToast(tr('⏳ Dizayn saqlanmoqda...', '⏳ Дизайн сохраняется...'), 'saving');
      try {
        const result = await callApi('set_design_settings', { themeId: designDraft.themeId, colors: designColorsWithDefaults(designDraft.colors, designDraft.themeId) });
        designSettings = result.designSettings;
        applyDesignColors(designSettings.colors, designSettings.themeId);
        designDraft = null;
        closePage();
        showActionToast(tr('✅ Dizayn saqlandi', '✅ Дизайн сохранён'), 'success', 1500);
      } catch (e) {
        console.error(e);
        applyDesignColors(designSettings.colors, designSettings.themeId);
        showActionToast(tr('❌ Dizayn saqlanmadi', '❌ Дизайн не сохранён'), 'error', 1800);
        alert(tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e));
      }
    }

    function openOrderInfoSettings() {
      if (!isUserAnAdmin || !isAdminMode) return;
      openPage('ORDER_INFO');
    }

    // 11-band: "Yetkazib berish va to'lov" endi BITTA modal ichidagi menyu
    // emas — Do'kon sozlamalari sahifasida ikkita ALOHIDA qator, har biri
    // o'zining TO'LIQ sahifasini ochadi (fulfillmentSettingsSection shu ikki
    // funksiyaning birida darhol DELIVERY/PAYMENTS'ga o'rnatiladi — "MENU"
    // holati endi hech qachon kerak bo'lmaydi).
    function openDeliverySettingsPage() {
      if (!isUserAnAdmin || !isAdminMode) return;
      if (!fulfillmentDraft) fulfillmentDraft = commerce.normalizeConfig(cloneData(fulfillmentConfig), TOP_LEVEL_REGION_IDS);
      fulfillmentSettingsSection = 'DELIVERY';
      fulfillmentDeliveryKind = fulfillmentDeliveryKind || 'FREE';
      openPage('DELIVERY_SETTINGS');
    }
    function openPaymentSettingsPage() {
      if (!isUserAnAdmin || !isAdminMode) return;
      if (!fulfillmentDraft) fulfillmentDraft = commerce.normalizeConfig(cloneData(fulfillmentConfig), TOP_LEVEL_REGION_IDS);
      Object.keys(qrProviderTestState).forEach(k => delete qrProviderTestState[k]);
      Object.keys(qrProviderDecodedRaw).forEach(k => delete qrProviderDecodedRaw[k]);
      Object.keys(qrProviderDecodeState).forEach(k => delete qrProviderDecodeState[k]);
      qrProviderLoading.clear();
      qrProviderNeedsTest.clear();
      fulfillmentSettingsSection = 'PAYMENTS';
      fulfillmentExpandedPayment = fulfillmentExpandedPayment || 'CASH';
      openPage('PAYMENT_SETTINGS');
    }

    function closeFulfillmentSettingsPage() {
      fulfillmentDraft = null;
      openPage('SETTINGS', 'nav-profile');
    }

    // Faqat #fulfillment-panel (sarlavha/Saqlash tugmalaridan tashqari ichki
    // navigatsiya: MENU/DELIVERY/PAYMENTS) qayta chiziladi — tashqi scroll
    // konteyner hech qachon almashtirilmaydi.
    function rerenderFulfillmentPanel() {
      const el = document.getElementById('fulfillment-panel');
      if (el) el.innerHTML = renderFulfillmentPanel();
      if (window.lucide) lucide.createIcons();
    }

    // 1.3: checkbox/toggle bosilganda FAQAT ro'yxat qismi (#fulfillment-body)
    // yangilanadi — sarlavha, bo'lim tugmalari va tashqi scroll konteyner
    // qayta yaratilmaydi, shuning uchun scroll pozitsiyasi buzilmaydi.
    function rerenderFulfillmentBody() {
      const el = document.getElementById('fulfillment-body');
      if (!el) return;
      if (fulfillmentSettingsSection === 'PAYMENTS') {
        const method = fulfillmentExpandedPayment ? paymentMethodConfig(fulfillmentExpandedPayment) : null;
        el.innerHTML = method ? renderPaymentMethodSettings(method) : '';
      } else {
        el.innerHTML = renderFulfillmentDeliveryBody();
      }
      if (window.lucide) lucide.createIcons();
    }

    function setFulfillmentSettingsSection(section) {
      fulfillmentSettingsSection = section;
      if (section === 'DELIVERY' && !fulfillmentDeliveryKind) fulfillmentDeliveryKind = 'FREE';
      if (section === 'PAYMENTS' && !fulfillmentExpandedPayment) fulfillmentExpandedPayment = 'CASH';
      rerenderFulfillmentPanel();
    }

    function setFulfillmentDeliveryKind(kind) {
      fulfillmentDeliveryKind = kind;
      fulfillmentExpandedRegionKey = null;
      rerenderFulfillmentPanel();
    }

    // 1.2: Naqd/Karta yonma-yon; birini bosganda sozlamasi pastda ochiladi
    // (accordion) — ikkinchisini bossa birinchisi yopiladi, sahifa uzun
    // ro'yxatga aylanmaydi.
    function setFulfillmentExpandedPayment(methodId) {
      fulfillmentExpandedPayment = fulfillmentExpandedPayment === methodId ? null : methodId;
      rerenderFulfillmentPanel();
    }

    function toggleFulfillmentRegionPanel(key) {
      const nextKey = fulfillmentExpandedRegionKey === key ? null : key;
      if (nextKey !== fulfillmentExpandedRegionKey) fulfillmentExpandedDistrictKey = null;
      fulfillmentExpandedRegionKey = nextKey;
      rerenderFulfillmentBody();
    }

    function setDeliveryMethodEnabled(kind, enabled) {
      const key = DELIVERY_CONFIG_KEYS[kind];
      if (!key || !fulfillmentDraft) return;
      fulfillmentDraft.delivery[key].enabled = !!enabled;
      rerenderFulfillmentBody();
    }

    function defaultRegionSetting(kind) {
      if (kind === 'FIXED') return { enabled: true, fee: 40000 };
      if (kind === 'TAXI') return { enabled: true, exactFee: null, minFee: null, maxFee: null };
      return { enabled: true };
    }

    function setDeliveryRegionEnabled(kind, encodedId, enabled) {
      const key = DELIVERY_CONFIG_KEYS[kind];
      const regionId = decodedRegionId(encodedId);
      if (!key || !TOP_LEVEL_REGION_IDS.includes(regionId)) return;
      if (enabled) {
        fulfillmentDraft.delivery[key].regions[regionId] = { ...(fulfillmentDraft.delivery[key].regions[regionId] || defaultRegionSetting(kind)), enabled: true };
        fulfillmentExpandedRegionKey = `${kind}:${regionId}`;
      } else {
        delete fulfillmentDraft.delivery[key].regions[regionId];
        if (fulfillmentExpandedRegionKey === `${kind}:${regionId}`) fulfillmentExpandedRegionKey = null;
      }
      rerenderFulfillmentBody();
    }

    // 7-band: bo'sh qoldirilgan maydon endi 0'ga emas, null'ga tushadi —
    // "narx kiritilmagan" va "narx 0 deb kiritilgan" aniq ajratiladi.
    function setDeliveryRegionNumber(kind, encodedId, field, value) {
      const key = DELIVERY_CONFIG_KEYS[kind];
      const regionId = decodedRegionId(encodedId);
      if (!key || !fulfillmentDraft.delivery[key].regions[regionId]) return;
      const raw = String(value ?? '').trim();
      if (raw === '') { fulfillmentDraft.delivery[key].regions[regionId][field] = null; return; }
      const n = Number(raw);
      fulfillmentDraft.delivery[key].regions[regionId][field] = (Number.isFinite(n) && n >= 0) ? Math.round(n) : null;
    }

    // 13-band: har bir yetkazib berish usuli/region uchun ixtiyoriy admin
    // izohi — checkoutda usul tanlanganda mavjud bildirishnoma ostida chiqadi.
    function setDeliveryRegionComment(kind, encodedId, value) {
      const key = DELIVERY_CONFIG_KEYS[kind];
      const regionId = decodedRegionId(encodedId);
      if (!key || !fulfillmentDraft.delivery[key].regions[regionId]) return;
      fulfillmentDraft.delivery[key].regions[regionId].comment = String(value || '').slice(0, 200);
    }
    // 9-band: "Yetkazib berish vaqti" — comment bilan bir xil naqsh, ixtiyoriy.
    function setDeliveryRegionEstimatedTime(kind, encodedId, value) {
      const key = DELIVERY_CONFIG_KEYS[kind];
      const regionId = decodedRegionId(encodedId);
      if (!key || !fulfillmentDraft.delivery[key].regions[regionId]) return;
      fulfillmentDraft.delivery[key].regions[regionId].estimatedTime = String(value || '').slice(0, 60);
    }

    // 7-band: TAXI uchun "umumiy" (region'ga bog'liq bo'lmagan) narx/izoh —
    // biror region o'zining qiymatini kiritmagan bo'lsa shu fallback bo'ladi.
    function setTaxiGeneralNumber(field, value) {
      if (!fulfillmentDraft.delivery.taxi.general) fulfillmentDraft.delivery.taxi.general = { exactFee: null, minFee: null, maxFee: null, comment: null };
      const raw = String(value ?? '').trim();
      if (raw === '') { fulfillmentDraft.delivery.taxi.general[field] = null; return; }
      const n = Number(raw);
      fulfillmentDraft.delivery.taxi.general[field] = (Number.isFinite(n) && n >= 0) ? Math.round(n) : null;
    }
    function setTaxiGeneralComment(value) {
      if (!fulfillmentDraft.delivery.taxi.general) fulfillmentDraft.delivery.taxi.general = { exactFee: null, minFee: null, maxFee: null, comment: null, estimatedTime: null };
      fulfillmentDraft.delivery.taxi.general.comment = String(value || '').slice(0, 200) || null;
    }
    function setTaxiGeneralEstimatedTime(value) {
      if (!fulfillmentDraft.delivery.taxi.general) fulfillmentDraft.delivery.taxi.general = { exactFee: null, minFee: null, maxFee: null, comment: null, estimatedTime: null };
      fulfillmentDraft.delivery.taxi.general.estimatedTime = String(value || '').slice(0, 60) || null;
    }

    function bulkDeliveryRegions(kind, enabled) {
      const key = DELIVERY_CONFIG_KEYS[kind];
      if (!key) return;
      fulfillmentDraft.delivery[key].regions = enabled ? Object.fromEntries(TOP_LEVEL_REGION_IDS.map(regionId => [regionId, defaultRegionSetting(kind)])) : {};
      rerenderFulfillmentBody();
    }

    function setPostEnabled(enabled) {
      fulfillmentDraft.delivery.post.enabled = !!enabled;
      rerenderFulfillmentBody();
    }

    function postProvider(providerId) {
      return fulfillmentDraft?.delivery?.post?.providers?.find(provider => provider.id === providerId);
    }

    function setPostProviderEnabled(providerId, enabled) {
      const provider = postProvider(providerId); if (!provider) return;
      provider.enabled = !!enabled;
      rerenderFulfillmentBody();
    }

    function setPostProviderName(providerId, name) {
      const provider = postProvider(providerId); if (provider) provider.name = String(name || '').trim().slice(0, 80);
    }

    function setPostRegionEnabled(providerId, encodedId, enabled) {
      const provider = postProvider(providerId), regionId = decodedRegionId(encodedId);
      if (!provider || !TOP_LEVEL_REGION_IDS.includes(regionId)) return;
      if (enabled) {
        provider.regions[regionId] = { ...(provider.regions[regionId] || { payer: 'CUSTOMER' }), enabled: true };
        fulfillmentExpandedRegionKey = `POST:${providerId}:${regionId}`;
      } else {
        delete provider.regions[regionId];
        if (fulfillmentExpandedRegionKey === `POST:${providerId}:${regionId}`) fulfillmentExpandedRegionKey = null;
      }
      rerenderFulfillmentBody();
    }

    function setPostRegionPayer(providerId, encodedId, payer) {
      const provider = postProvider(providerId), regionId = decodedRegionId(encodedId);
      if (provider?.regions?.[regionId]) provider.regions[regionId].payer = payer === 'SELLER' ? 'SELLER' : 'CUSTOMER';
    }

    function setPostRegionComment(providerId, encodedId, value) {
      const provider = postProvider(providerId), regionId = decodedRegionId(encodedId);
      if (provider?.regions?.[regionId]) provider.regions[regionId].comment = String(value || '').slice(0, 200);
    }
    function setPostRegionEstimatedTime(providerId, encodedId, value) {
      const provider = postProvider(providerId), regionId = decodedRegionId(encodedId);
      if (provider?.regions?.[regionId]) provider.regions[regionId].estimatedTime = String(value || '').slice(0, 60);
    }

    function bulkPostRegions(providerId, enabled) {
      const provider = postProvider(providerId); if (!provider) return;
      provider.regions = enabled ? Object.fromEntries(TOP_LEVEL_REGION_IDS.map(regionId => [regionId, { enabled: true, payer: 'CUSTOMER' }])) : {};
      rerenderFulfillmentBody();
    }

    function paymentMethodConfig(methodId) {
      return fulfillmentDraft?.payments?.methods?.find(method => method.id === methodId);
    }

    function setPaymentMethodEnabled(methodId, enabled) {
      const method = paymentMethodConfig(methodId); if (!method) return;
      method.enabled = !!enabled;
      rerenderFulfillmentBody();
    }

    function setPaymentRegionEnabled(methodId, encodedId, enabled) {
      const method = paymentMethodConfig(methodId), regionId = decodedRegionId(encodedId);
      if (!method || !TOP_LEVEL_REGION_IDS.includes(regionId)) return;
      if (enabled) { method.regions[regionId] = { ...(method.regions[regionId] || {}), enabled: true }; fulfillmentExpandedRegionKey = `PAYMENT:${methodId}:${regionId}`; }
      else { delete method.regions[regionId]; if (fulfillmentExpandedRegionKey === `PAYMENT:${methodId}:${regionId}`) fulfillmentExpandedRegionKey = null; }
      rerenderFulfillmentBody();
    }

    function bulkPaymentRegions(methodId, enabled) {
      const method = paymentMethodConfig(methodId); if (!method) return;
      method.regions = enabled ? Object.fromEntries(TOP_LEVEL_REGION_IDS.map(regionId => [regionId, { enabled: true }])) : {};
      rerenderFulfillmentBody();
    }

    function setCardSetting(field, value) {
      const card = paymentMethodConfig('CARD'); if (!card) return;
      card[field] = field === 'receiptRequired' ? !!value : String(value || '').slice(0, field === 'cardNumber' ? 32 : 120);
    }

    function settingsBulkButtons(onClickAll, onClickClear) {
      return `<div class="flex gap-2"><button type="button" onclick="${onClickAll}" class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg font-bold text-[10px]">${tr('Barchasini tanlash','Выбрать все')}</button><button type="button" onclick="${onClickClear}" class="bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg font-bold text-[10px]">${tr('Tozalash','Очистить')}</button></div>`;
    }

    // ROUND13: viloyat qoidasini xohlasa tuman/shahargacha toraytirish.
    // districts bo'sh = butun viloyat; kamida bittasi = faqat tanlanganlar.
    function fulfillmentDistrictOptions(regionId) {
      return regionId === 'tashkent_city' ? TASHKENT_CITY_DISTRICTS : (UZ_REGIONS_BY_CODE[regionId] || []);
    }
    function encodedDistrictValue(value) { return encodeURIComponent(String(value || '')).replace(/'/g, '%27'); }
    function decodedDistrictValue(value) { try { return decodeURIComponent(String(value || '')); } catch (_) { return String(value || ''); } }
    function toggleDistrictSelection(entry, encodedDistrict, enabled) {
      if (!entry) return;
      const district = decodedDistrictValue(encodedDistrict);
      const set = new Set(Array.isArray(entry.districts) ? entry.districts.map(String) : []);
      if (enabled) set.add(district); else set.delete(district);
      entry.districts = [...set];
      if (!entry.districts.length) delete entry.districts;
    }
    function setDeliveryRegionDistrict(kind, encodedRegion, encodedDistrict, enabled) {
      const key = DELIVERY_CONFIG_KEYS[kind], regionId = decodedRegionId(encodedRegion);
      const entry = key && fulfillmentDraft?.delivery?.[key]?.regions?.[regionId];
      if (!entry) return;
      toggleDistrictSelection(entry, encodedDistrict, enabled);
      rerenderFulfillmentBody();
    }
    function setPostRegionDistrict(providerId, encodedRegion, encodedDistrict, enabled) {
      const regionId = decodedRegionId(encodedRegion), entry = postProvider(providerId)?.regions?.[regionId];
      if (!entry) return;
      toggleDistrictSelection(entry, encodedDistrict, enabled);
      rerenderFulfillmentBody();
    }
    function setPaymentRegionDistrict(methodId, encodedRegion, encodedDistrict, enabled) {
      const regionId = decodedRegionId(encodedRegion), entry = paymentMethodConfig(methodId)?.regions?.[regionId];
      if (!entry) return;
      toggleDistrictSelection(entry, encodedDistrict, enabled);
      rerenderFulfillmentBody();
    }
    function clearRegionDistrictScope(scope, methodOrKind, encodedRegion, providerId = '') {
      const regionId = decodedRegionId(encodedRegion);
      let entry = null;
      if (scope === 'DELIVERY') entry = fulfillmentDraft?.delivery?.[DELIVERY_CONFIG_KEYS[methodOrKind]]?.regions?.[regionId];
      else if (scope === 'POST') entry = postProvider(providerId)?.regions?.[regionId];
      else if (scope === 'PAYMENT') entry = paymentMethodConfig(methodOrKind)?.regions?.[regionId];
      if (entry) delete entry.districts;
      rerenderFulfillmentBody();
    }
    function toggleDistrictScope(scopeKey) {
      fulfillmentExpandedDistrictKey = fulfillmentExpandedDistrictKey === String(scopeKey) ? null : String(scopeKey);
      rerenderFulfillmentBody();
    }
    function renderDistrictScopeHtml(entry, regionId, setterCall, clearCall, scopeKey) {
      const districts = fulfillmentDistrictOptions(regionId);
      if (!districts.length) return '';
      const selected = new Set(Array.isArray(entry?.districts) ? entry.districts.map(String) : []);
      const open = fulfillmentExpandedDistrictKey === String(scopeKey);
      return `<div class="fc-district-scope ${open ? 'is-open' : ''}">
        <button type="button" class="fc-district-toggle-btn ${selected.size ? 'has-selection' : ''}" onclick="toggleDistrictScope('${scopeKey}')">
          <span><i data-lucide="map-pinned" class="w-4 h-4"></i><span><b>${tr('Tumanlarni tanlash','Выбрать районы')}</b><small>${selected.size ? tr(`${selected.size} ta tanlangan`, `Выбрано: ${selected.size}`) : tr('Ixtiyoriy — tanlanmasa butun viloyat','Необязательно — иначе вся область')}</small></span></span>
          <i data-lucide="chevron-down" class="w-4 h-4"></i>
        </button>
        ${open ? `<div class="fc-district-scope-panel"><div class="fc-district-scope-head"><div><b>${tr('Tuman / shahar bo‘yicha','По району / городу')}</b><small>${selected.size ? tr(`${selected.size} ta hududga amal qiladi`, `Действует для ${selected.size} районов`) : tr('Tanlanmasa — butun viloyatga amal qiladi','Если не выбрано — действует на всю область')}</small></div>${selected.size ? `<button type="button" onclick="${clearCall}" class="fc-district-all-btn">${tr('Butun viloyat','Вся область')}</button>` : `<span class="fc-district-all-badge">${tr('Butun viloyat','Вся область')}</span>`}</div><div class="fc-district-grid">${districts.map(d => { const encoded = encodedDistrictValue(d), checked = selected.has(String(d)); return `<label class="fc-district-chip ${checked ? 'is-selected' : ''}"><input type="checkbox" ${checked ? 'checked' : ''} onchange="${setterCall(encoded)}"><span>${escapeHtml(districtLabelForUi(d))}</span></label>`; }).join('')}</div></div>` : ''}
      </div>`;
    }

    function renderPaymentRegionRows(method) {
      return `<div class="fc-delivery-region-list">${TOP_LEVEL_REGIONS.map(region => {
        const entry = method.regions?.[region.id], encoded = encodedRegionId(region.id);
        const rowKey = `PAYMENT:${method.id}:${region.id}`;
        const open = !!entry?.enabled && fulfillmentExpandedRegionKey === rowKey;
        const districtCount = Array.isArray(entry?.districts) ? entry.districts.length : 0;
        const subtitle = !entry?.enabled ? tr("O'chirilgan", 'Выключено') : districtCount ? tr(`${districtCount} ta tuman/shahar`, `${districtCount} районов/городов`) : tr('Butun viloyat', 'Вся область');
        return `<div class="fc-delivery-region-card ${open ? 'is-open' : ''}">
          <div class="fc-delivery-region-head">
            <button type="button" class="fc-delivery-region-main" onclick="toggleFulfillmentRegionPanel('${rowKey}')" ${entry?.enabled ? '' : 'disabled'}><span><b>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</b><small>${escapeHtml(subtitle)}</small></span>${entry?.enabled ? `<i data-lucide="chevron-down" class="w-4 h-4 fc-delivery-region-chevron"></i>` : ''}</button>
            <label class="fc-toggle" onclick="event.stopPropagation()"><input type="checkbox" ${entry?.enabled ? 'checked' : ''} onchange="setPaymentRegionEnabled('${method.id}','${encoded}',this.checked)"><span class="fc-toggle-track"></span></label>
          </div>
          ${open ? `<div class="fc-delivery-region-body">${renderDistrictScopeHtml(entry, region.id, (districtEncoded) => `setPaymentRegionDistrict('${method.id}','${encoded}','${districtEncoded}',this.checked)`, `clearRegionDistrictScope('PAYMENT','${method.id}','${encoded}')`, rowKey)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }

    function renderDeliveryRegionRows(kind) {
      const key = DELIVERY_CONFIG_KEYS[kind], regions = fulfillmentDraft.delivery[key].regions;
      return `<div class="fc-delivery-region-list">${TOP_LEVEL_REGIONS.map(region => {
        const entry = regions[region.id], encoded = encodedRegionId(region.id);
        const rowKey = `${kind}:${region.id}`;
        const open = !!entry?.enabled && fulfillmentExpandedRegionKey === rowKey;
        const subtitle = !entry?.enabled ? tr("O'chirilgan", 'Выключено')
          : kind === 'FIXED' && entry.fee != null ? `${money(entry.fee)}`
          : kind === 'TAXI' && entry.exactFee != null ? `${money(entry.exactFee)}`
          : tr('Sozlangan', 'Настроено');
        return `<div class="fc-delivery-region-card ${open ? 'is-open' : ''}">
          <div class="fc-delivery-region-head">
            <button type="button" class="fc-delivery-region-main" onclick="toggleFulfillmentRegionPanel('${rowKey}')" ${entry?.enabled ? '' : 'disabled'}>
              <span><b>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</b><small>${escapeHtml(subtitle)}</small></span>
              ${entry?.enabled ? `<i data-lucide="chevron-down" class="w-4 h-4 fc-delivery-region-chevron"></i>` : ''}
            </button>
            <label class="fc-toggle" onclick="event.stopPropagation()"><input type="checkbox" ${entry?.enabled ? 'checked' : ''} onchange="setDeliveryRegionEnabled('${kind}','${encoded}',this.checked)"><span class="fc-toggle-track"></span></label>
          </div>
          ${open ? `<div class="fc-delivery-region-body">
            ${renderDistrictScopeHtml(entry, region.id, (districtEncoded) => `setDeliveryRegionDistrict('${kind}','${encoded}','${districtEncoded}',this.checked)`, `clearRegionDistrictScope('DELIVERY','${kind}','${encoded}')`, rowKey)}
            ${kind === 'FIXED' ? `<label class="fc-mini-field"><span>${tr('Yetkazish narxi','Стоимость доставки')}</span><div class="fc-money-input"><input type="number" min="0" value="${entry.fee ?? ''}" oninput="setDeliveryRegionNumber('FIXED','${encoded}','fee',this.value)"><em>${tr("so'm",'сум')}</em></div></label>` : ''}
            ${kind === 'TAXI' ? `<label class="fc-mini-field"><span>${tr('Aniq narx (ixtiyoriy)','Точная цена (необязательно)')}</span><input type="number" min="0" value="${entry.exactFee ?? ''}" oninput="setDeliveryRegionNumber('TAXI','${encoded}','exactFee',this.value)"></label><div class="grid grid-cols-2 gap-2"><label class="fc-mini-field"><span>Min</span><input type="number" min="0" value="${entry.minFee ?? ''}" oninput="setDeliveryRegionNumber('TAXI','${encoded}','minFee',this.value)"></label><label class="fc-mini-field"><span>Max</span><input type="number" min="0" value="${entry.maxFee ?? ''}" oninput="setDeliveryRegionNumber('TAXI','${encoded}','maxFee',this.value)"></label></div>` : ''}
            <label class="fc-mini-field"><span>${tr('Izoh (ixtiyoriy)','Комментарий (необязательно)')}</span><input type="text" value="${escapeHtml(entry.comment || '')}" oninput="setDeliveryRegionComment('${kind}','${encoded}',this.value)" maxlength="200"></label>
            <label class="fc-mini-field"><span>${tr('Yetkazib berish vaqti (ixtiyoriy)','Время доставки (необязательно)')}</span><input type="text" value="${escapeHtml(entry.estimatedTime || '')}" oninput="setDeliveryRegionEstimatedTime('${kind}','${encoded}',this.value)" placeholder="${tr('Masalan: 30–60 daqiqa','Например: 30–60 минут')}" maxlength="60"></label>
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }

    function renderPostProviderSettings(provider) {
      return `<div class="fc-delivery-provider-card">
        <div class="fc-delivery-provider-head">
          <div class="min-w-0"><b>${escapeHtml(provider.name)}</b><small>${provider.enabled ? tr('Yoqilgan','Включено') : tr("O'chirilgan",'Выключено')}</small></div>
          <label class="fc-toggle"><input type="checkbox" ${provider.enabled ? 'checked' : ''} onchange="setPostProviderEnabled('${provider.id}',this.checked)"><span class="fc-toggle-track"></span></label>
        </div>
        ${provider.id === 'OTHER' ? `<label class="fc-mini-field"><span>${tr('Pochta nomi','Название почты')}</span><input type="text" value="${escapeHtml(provider.name)}" oninput="setPostProviderName('OTHER',this.value)"></label>` : ''}
        ${provider.enabled ? `<div class="fc-delivery-provider-tools">${settingsBulkButtons(`bulkPostRegions('${provider.id}',true)`, `bulkPostRegions('${provider.id}',false)`)}</div><div class="fc-delivery-region-list">${TOP_LEVEL_REGIONS.map(region => {
          const entry = provider.regions[region.id], encoded = encodedRegionId(region.id);
          const rowKey = `POST:${provider.id}:${region.id}`;
          const open = !!entry?.enabled && fulfillmentExpandedRegionKey === rowKey;
          return `<div class="fc-delivery-region-card ${open ? 'is-open' : ''}">
            <div class="fc-delivery-region-head"><button type="button" class="fc-delivery-region-main" onclick="toggleFulfillmentRegionPanel('${rowKey}')" ${entry?.enabled ? '' : 'disabled'}><span><b>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</b><small>${entry?.enabled ? (entry.payer === 'SELLER' ? tr('Sotuvchi hisobidan','За счёт продавца') : tr('Mijoz hisobidan','За счёт клиента')) : tr("O'chirilgan",'Выключено')}</small></span>${entry?.enabled ? `<i data-lucide="chevron-down" class="w-4 h-4 fc-delivery-region-chevron"></i>` : ''}</button><label class="fc-toggle" onclick="event.stopPropagation()"><input type="checkbox" ${entry?.enabled ? 'checked' : ''} onchange="setPostRegionEnabled('${provider.id}','${encoded}',this.checked)"><span class="fc-toggle-track"></span></label></div>
            ${open ? `<div class="fc-delivery-region-body">${renderDistrictScopeHtml(entry, region.id, (districtEncoded) => `setPostRegionDistrict('${provider.id}','${encoded}','${districtEncoded}',this.checked)`, `clearRegionDistrictScope('POST','', '${encoded}','${provider.id}')`, rowKey)}<label class="fc-mini-field"><span>${tr('Pochta xarajati','Почтовые расходы')}</span><select onchange="setPostRegionPayer('${provider.id}','${encoded}',this.value)"><option value="CUSTOMER" ${entry.payer !== 'SELLER' ? 'selected' : ''}>${tr('Mijoz hisobidan','За счёт клиента')}</option><option value="SELLER" ${entry.payer === 'SELLER' ? 'selected' : ''}>${tr('Sotuvchi hisobidan','За счёт продавца')}</option></select></label><label class="fc-mini-field"><span>${tr('Izoh (ixtiyoriy)','Комментарий (необязательно)')}</span><input type="text" value="${escapeHtml(entry.comment || '')}" oninput="setPostRegionComment('${provider.id}','${encoded}',this.value)" maxlength="200"></label><label class="fc-mini-field"><span>${tr('Yetkazib berish vaqti (ixtiyoriy)','Время доставки (необязательно)')}</span><input type="text" value="${escapeHtml(entry.estimatedTime || '')}" oninput="setPostRegionEstimatedTime('${provider.id}','${encoded}',this.value)" maxlength="60"></label></div>` : ''}
          </div>`;
        }).join('')}</div>` : ''}
      </div>`;
    }

    function qrProvidersOf() {
      return fulfillmentDraft?.payments.methods.find(m => m.id === 'QR')?.providers || [];
    }
    function setQrProviderEnabled(providerId, enabled) {
      const p = qrProvidersOf().find(x => x.id === providerId);
      if (p) {
        const wasEnabled = !!p.enabled;
        p.enabled = !!enabled;
        if (!wasEnabled && p.enabled && p.paymentUrl) qrProviderNeedsTest.add(providerId);
        if (!p.enabled) { qrProviderNeedsTest.delete(providerId); delete qrProviderTestState[providerId]; }
      }
      rerenderFulfillmentBody();
    }
    function setQrProviderPaymentUrl(providerId, value) {
      const p = qrProvidersOf().find(x => x.id === providerId);
      if (!p) return;
      const next = String(value || '').trim().slice(0, 2048) || null;
      if (String(p.paymentUrl || '') !== String(next || '')) {
        p.paymentUrl = next;
        qrProviderNeedsTest.add(providerId);
        qrProviderTestState[providerId] = { status: 'changed' };
      }
    }
    function qrProviderExpectedHost(providerId, hostname) {
      const host = String(hostname || '').toLowerCase();
      const rules = {
        CLICK: ['click.uz'], PAYME: ['payme.uz', 'paycom.uz'],
        PAYNET: ['paynet.uz'], UZUM: ['uzum.uz'],
      };
      return (rules[providerId] || []).some(domain => host === domain || host.endsWith('.' + domain));
    }
    function testQrProviderPaymentUrl(providerId) {
      const p = qrProvidersOf().find(x => x.id === providerId);
      if (!p?.paymentUrl) return alert(tr("Avval QR linkni kiriting yoki QR rasmdan avtomatik o'qiting.", 'Сначала укажите ссылку или распознайте её из QR.'));
      let url;
      try { url = new URL(p.paymentUrl); } catch (_) { return alert(tr("URL noto'g'ri.", 'Некорректный URL.')); }
      if (!['http:', 'https:'].includes(url.protocol)) return alert(tr("Faqat http/https link qabul qilinadi.", 'Допустимы только ссылки http/https.'));
      const providerMatch = qrProviderExpectedHost(providerId, url.hostname);
      qrProviderTestState[providerId] = { status: 'opened', note: providerMatch ? '' : tr('Domen provayder nomiga o‘xshamaydi — ochilgan sahifani diqqat bilan tekshiring.', 'Домен не похож на домен провайдера — внимательно проверьте открытую страницу.') };
      qrProviderNeedsTest.add(providerId);
      rerenderFulfillmentBody();
      openSafeExternalUrl(url.href);
    }
    function confirmQrProviderTest(providerId, ok) {
      if (ok) {
        qrProviderTestState[providerId] = { status: 'verified' };
        qrProviderNeedsTest.delete(providerId);
        showActionToast(tr('✅ QR link tekshirildi', '✅ QR-ссылка проверена'), 'success', 1400);
      } else {
        qrProviderTestState[providerId] = { status: 'failed' };
        qrProviderNeedsTest.add(providerId);
      }
      rerenderFulfillmentBody();
    }
    // QR ichidagi ma'lumotni foydalanuvchi ko'radigan to'lov sahifasiga
    // aylantirish. Oddiy URL to'g'ridan-to'g'ri olinadi. Click'ning QR
    // stikerlarida uchraydigan {s_id,p_acc} payload uchun esa my.click.uz
    // payment sahifasi hosil qilinadi (p_acc -> transaction_param).
    function paymentUrlFromQrRaw(providerId, rawValue) {
      const raw = String(rawValue || '').trim();
      if (!raw) return null;
      try {
        const direct = new URL(raw);
        if (['https:', 'http:'].includes(direct.protocol)) return direct.href;
      } catch (_) {}

      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) {}
      if (!parsed || typeof parsed !== 'object') return null;

      // Ayrim QR generatorlar URLni JSON maydoniga joylaydi.
      for (const key of ['url','link','payment_url','paymentUrl']) {
        const candidate = String(parsed[key] || '').trim();
        if (!candidate) continue;
        try {
          const u = new URL(candidate);
          if (['https:', 'http:'].includes(u.protocol)) return u.href;
        } catch (_) {}
      }

      if (providerId === 'CLICK') {
        const serviceId = String(parsed.s_id ?? parsed.service_id ?? '').trim();
        const paymentAccount = String(parsed.p_acc ?? parsed.transaction_param ?? parsed.account ?? '').trim();
        if (serviceId) {
          const u = new URL('https://my.click.uz/services/pay');
          u.searchParams.set('service_id', serviceId);
          if (paymentAccount) u.searchParams.set('transaction_param', paymentAccount);
          return u.href;
        }
      }
      return null;
    }

    async function tryAutoFillQrPaymentUrlFromFile(providerId, file) {
      try {
        if (typeof BarcodeDetector === 'undefined') {
          qrProviderDecodeState[providerId] = { status: 'error', message: tr("Bu qurilmada QR'ni avtomatik o'qish qo'llab-quvvatlanmadi.", 'На этом устройстве авто-распознавание QR не поддерживается.') };
          return false;
        }
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(file);
        let results;
        try { results = await detector.detect(bitmap); } finally { bitmap.close?.(); }
        const raw = String(results?.[0]?.rawValue || '').trim();
        if (!raw) {
          qrProviderDecodeState[providerId] = { status: 'error', message: tr("QR kod o'qilmadi. Boshqa rasm tanlang.", 'QR-код не распознан. Выберите другое изображение.') };
          return false;
        }
        qrProviderDecodedRaw[providerId] = raw;
        const paymentUrl = paymentUrlFromQrRaw(providerId, raw);
        if (!paymentUrl) {
          qrProviderDecodeState[providerId] = { status: 'error', message: tr("QR o'qildi, lekin to'lov sahifasi aniqlanmadi. Boshqa QR rasm tanlang.", 'QR распознан, но платёжная страница не определена. Выберите другой QR.') };
          return false;
        }
        const p = qrProvidersOf().find(x => x.id === providerId);
        if (p) {
          p.paymentUrl = paymentUrl;
          qrProviderNeedsTest.add(providerId);
          qrProviderTestState[providerId] = { status: 'changed' };
        }
        qrProviderDecodeState[providerId] = { status: 'success', message: tr("QR muvaffaqiyatli o'qildi", 'QR успешно распознан') };
        return true;
      } catch (e) {
        console.error('QR decode error', e);
        qrProviderDecodeState[providerId] = { status: 'error', message: tr("QR kodni o'qib bo'lmadi. Boshqa rasm tanlang.", 'Не удалось распознать QR. Выберите другое изображение.') };
        return false;
      }
    }
    async function pickQrProviderImage(event, providerId) {
      const file = event.target.files?.[0];
      if (!file) return;
      try { validatePickedImageFile(file); }
      catch (e) { event.target.value = ''; return alert(pickedImageErrorMessage(e, file)); }

      qrProviderLoading.add(providerId);
      qrProviderDecodeState[providerId] = { status: 'loading' };
      delete qrProviderDecodedRaw[providerId];
      const p0 = qrProvidersOf().find(x => x.id === providerId);
      if (p0) p0.paymentUrl = null;
      qrProviderNeedsTest.add(providerId);
      delete qrProviderTestState[providerId];
      rerenderFulfillmentBody();

      let prepared;
      try { prepared = await captureAndPrepareImageV2(file, TARGET_PRODUCT_IMAGE_BYTES, 800, 0.85); }
      catch (e) {
        event.target.value = '';
        qrProviderLoading.delete(providerId);
        qrProviderDecodeState[providerId] = { status: 'error', message: tr("Rasmni o'qib bo'lmadi. Qaytadan tanlang.", 'Не удалось прочитать изображение. Попробуйте снова.') };
        rerenderFulfillmentBody();
        return;
      }
      try {
        const url = await uploadImageSnapshot({ file: prepared, preparing: Promise.resolve(prepared), url: null }, null, true);
        const p = qrProvidersOf().find(x => x.id === providerId);
        if (p) p.qrImageUrl = url;
        await tryAutoFillQrPaymentUrlFromFile(providerId, file);
      } catch (e) {
        console.error(e);
        qrProviderDecodeState[providerId] = { status: 'error', message: tr("QR rasmni yuklab bo'lmadi.", 'Не удалось загрузить QR-изображение.') };
        alert(tr("QR rasmni yuklab bo'lmadi: ", "Не удалось загрузить QR-изображение: ") + (e.message || e));
      } finally {
        qrProviderLoading.delete(providerId);
        event.target.value = '';
        rerenderFulfillmentBody();
      }
    }
    function renderQrProviderSettings(provider) {
      const test = qrProviderTestState[provider.id] || null;
      const decode = qrProviderDecodeState[provider.id] || null;
      const loading = qrProviderLoading.has(provider.id);
      const verified = test?.status === 'verified' && !qrProviderNeedsTest.has(provider.id);
      const canSave = !!provider.paymentUrl && verified && !loading;
      const preview = loading
        ? `<div class="fc-qr-placeholder fc-qr-loading" aria-label="${tr('QR o‘qilmoqda','QR распознаётся')}"><span class="fc-qr-spinner"></span><small>${tr('O‘qilmoqda…','Распознаётся…')}</small></div>`
        : (provider.qrImageUrl ? `<img src="${escapeHtml(provider.qrImageUrl)}" class="fc-qr-preview">` : `<div class="fc-qr-placeholder"><i data-lucide="qr-code" class="w-6 h-6"></i></div>`);
      return `<div class="fc-qr-provider-card ${provider.enabled ? 'is-enabled' : ''}">
        <label class="fc-qr-provider-head"><span><b>${escapeHtml(provider.name)}</b><small>${provider.enabled ? tr('QR to‘lov faol','QR-оплата включена') : tr("O'chirilgan", 'Выключено')}</small></span><span class="fc-toggle"><input type="checkbox" ${provider.enabled ? 'checked' : ''} onchange="setQrProviderEnabled('${provider.id}',this.checked)"><span class="fc-toggle-track"></span></span></label>
        ${provider.enabled ? `
          <div class="fc-qr-provider-body">
            <div class="fc-qr-image-row">
              ${preview}
              <div class="min-w-0 flex-1"><input id="qr-img-input-${provider.id}" type="file" accept="image/*" class="hidden" onchange="pickQrProviderImage(event,'${provider.id}')"><input id="qr-img-input-files-${provider.id}" type="file" class="hidden" onchange="pickQrProviderImage(event,'${provider.id}')"><button type="button" onclick="openImagePickerSheet('qr-img-input-${provider.id}','qr-img-input-files-${provider.id}')" class="fc-btn fc-btn-secondary fc-qr-upload-btn" ${loading ? 'disabled' : ''}><i data-lucide="folder-open" class="w-3.5 h-3.5"></i>${tr('Xotiradan yuklash', 'Загрузить с устройства')}</button><p>${tr('QR rasm yuklang — to‘lov ma’lumoti avtomatik o‘qiladi.', 'Загрузите QR — платёжные данные распознаются автоматически.')}</p></div>
            </div>
            ${decode?.status === 'success' ? `<div class="fc-qr-verified fc-qr-read-ok"><i data-lucide="scan-line" class="w-4 h-4"></i>${escapeHtml(decode.message || tr("QR muvaffaqiyatli o'qildi", 'QR успешно распознан'))}</div>` : ''}
            ${decode?.status === 'error' ? `<div class="fc-qr-unverified"><i data-lucide="circle-alert" class="w-4 h-4"></i>${escapeHtml(decode.message || tr("QR kodni o'qib bo'lmadi", 'Не удалось распознать QR'))}</div>` : ''}
            ${provider.paymentUrl ? `<div class="fc-qr-actions"><button type="button" onclick="testQrProviderPaymentUrl('${provider.id}')" class="fc-btn fc-qr-test-btn" ${loading ? 'disabled' : ''}><i data-lucide="flask-conical" class="w-3.5 h-3.5"></i>${tr('Sinab ko‘rish','Проверить')}</button><button type="button" onclick="saveFulfillmentSettings()" class="fc-btn fc-qr-save-btn" ${canSave ? '' : 'disabled'}><i data-lucide="save" class="w-3.5 h-3.5"></i>${tr('Saqlash','Сохранить')}</button></div>` : ''}
            ${test?.status === 'opened' ? `<div class="fc-qr-test-confirm"><p>${escapeHtml(test.note || tr('To‘lov sahifasi to‘g‘ri ochildimi?', 'Страница оплаты открылась правильно?'))}</p><div><button type="button" onclick="confirmQrProviderTest('${provider.id}',true)" class="is-ok"><i data-lucide="check" class="w-3.5 h-3.5"></i>${tr('To‘g‘ri ishladi','Работает правильно')}</button><button type="button" onclick="confirmQrProviderTest('${provider.id}',false)" class="is-bad"><i data-lucide="x" class="w-3.5 h-3.5"></i>${tr('Noto‘g‘ri','Неверно')}</button></div></div>` : ''}
            ${verified ? `<div class="fc-qr-verified"><i data-lucide="badge-check" class="w-4 h-4"></i>${tr('Tekshirildi — saqlash mumkin','Проверено — можно сохранить')}</div>` : (qrProviderNeedsTest.has(provider.id) && provider.paymentUrl ? `<div class="fc-qr-unverified"><i data-lucide="circle-alert" class="w-4 h-4"></i>${tr('Saqlashdan oldin Sinab ko‘rish tugmasi orqali tekshiring.','Перед сохранением проверьте через кнопку «Проверить».')}</div>` : '')}
          </div>
        ` : ''}
      </div>`;
    }

    function renderPaymentMethodSettings(method) {
      const icon = method.id === 'CASH' ? ICON_CASH : method.id === 'CARD' ? ICON_CARD : method.id === 'CLICK' ? ICON_BOLT : ICON_QR;
      const label = method.id === 'CASH' ? tr('Naqd','Наличные') : method.id === 'CARD' ? tr('Karta orqali','Картой') : method.id === 'CLICK' ? tr('Click orqali (avtomatik)', 'Click (автоматически)') : tr('QR orqali', 'По QR');
      const clickReady = clickConnectionStatus?.status === 'CONNECTED';
      return `<div class="border rounded-2xl p-3 space-y-3">
        <label class="flex items-center justify-between font-black"><span class="flex items-center gap-1.5">${icon} ${escapeHtml(label)}</span><span class="fc-toggle"><input type="checkbox" ${method.enabled ? 'checked' : ''} onchange="setPaymentMethodEnabled('${method.id}',this.checked)"><span class="fc-toggle-track"></span></span></label>
        ${method.id === 'CLICK' && !clickReady ? `<p class="text-[10px] text-amber-600 font-bold">${tr("Avval Do'kon sozlamalari → Click bo'limidan hisobingizni ulang.", "Сначала подключите аккаунт в Настройки магазина → Click.")}</p>` : ''}
        ${method.enabled ? `${method.id === 'CARD' ? `<div class="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-2"><input type="text" value="${escapeHtml(method.cardNumber || '')}" oninput="setCardSetting('cardNumber',this.value)" placeholder="8600 0000 0000 0000" class="w-full p-2 border rounded-xl font-mono"><input type="text" value="${escapeHtml(method.cardHolder || '')}" oninput="setCardSetting('cardHolder',this.value)" placeholder="${tr('Karta egasi','Владелец карты')}" class="w-full p-2 border rounded-xl"><label class="flex items-center gap-2 font-bold"><input type="checkbox" ${method.receiptRequired ? 'checked' : ''} onchange="setCardSetting('receiptRequired',this.checked)">${tr('Chek yuklash majburiy','Загрузка чека обязательна')}</label><p class="text-[10px] text-blue-700">${tr('Faqat xaridorga ko‘rsatiladigan karta raqami va egasi. CVV/PIN/SMS saqlanmaydi.','Только номер и владелец карты для показа покупателю. CVV/PIN/SMS не сохраняются.')}</p></div>` : ''}${method.id === 'QR' ? `<div class="space-y-2">${(method.providers || []).map(renderQrProviderSettings).join('')}</div>` : ''}${settingsBulkButtons(`bulkPaymentRegions('${method.id}',true)`, `bulkPaymentRegions('${method.id}',false)`)}${renderPaymentRegionRows(method)}` : ''}
      </div>`;
    }

    function renderFulfillmentDeliveryBody() {
      const kind = fulfillmentDeliveryKind;
      if (kind === 'POST') {
        return `<div class="space-y-3">
          <div class="fc-delivery-master-toggle"><div><b>${tr('Pochta orqali yetkazib berish','Доставка почтой')}</b><small>${tr('BTS, EMU va boshqa pochta xizmatlari','BTS, EMU и другие почтовые службы')}</small></div><label class="fc-toggle"><input type="checkbox" ${fulfillmentDraft.delivery.post.enabled ? 'checked' : ''} onchange="setPostEnabled(this.checked)"><span class="fc-toggle-track"></span></label></div>
          ${fulfillmentDraft.delivery.post.enabled ? fulfillmentDraft.delivery.post.providers.map(renderPostProviderSettings).join('') : `<div class="fc-empty-state compact"><p>${tr('Pochta usuli o‘chirilgan.','Почтовая доставка выключена.')}</p></div>`}
        </div>`;
      }
      const key = DELIVERY_CONFIG_KEYS[kind], method = fulfillmentDraft.delivery[key];
      const descriptions = {
        FREE: tr('Tanlangan hududlarda bepul yetkazib berish chiqadi.', 'В выбранных регионах будет бесплатная доставка.'),
        FIXED: tr('Har hudud uchun aniq yetkazish narxini kiriting.', 'Укажите точную стоимость доставки для каждого региона.'),
        TAXI: tr("Aniq narx yoki min/max diapazon ixtiyoriy va informatsion.", "Точная цена или диапазон min/max необязательны и носят информационный характер."),
      };
      const taxiGeneralHtml = kind === 'TAXI' ? (() => {
        const g = fulfillmentDraft.delivery.taxi.general || { exactFee: null, minFee: null, maxFee: null, comment: null };
        return `<div class="fc-delivery-general-card">
          <div class="fc-delivery-general-head"><span class="fc-shop-settings-icon"><i data-lucide="sliders-horizontal" class="w-4 h-4"></i></span><div><b>${tr('Umumiy qiymat','Общее значение')}</b><small>${tr('O‘z narxi kiritilmagan hududlar uchun','Для регионов без собственной цены')}</small></div></div>
          <label class="fc-mini-field"><span>${tr('Aniq narx (ixtiyoriy)','Точная цена (необязательно)')}</span><input type="number" min="0" value="${g.exactFee ?? ''}" oninput="setTaxiGeneralNumber('exactFee',this.value)"></label>
          <div class="grid grid-cols-2 gap-2"><label class="fc-mini-field"><span>Min</span><input type="number" min="0" value="${g.minFee ?? ''}" oninput="setTaxiGeneralNumber('minFee',this.value)"></label><label class="fc-mini-field"><span>Max</span><input type="number" min="0" value="${g.maxFee ?? ''}" oninput="setTaxiGeneralNumber('maxFee',this.value)"></label></div>
          <label class="fc-mini-field"><span>${tr('Umumiy izoh','Общий комментарий')}</span><input type="text" value="${escapeHtml(g.comment || '')}" oninput="setTaxiGeneralComment(this.value)" maxlength="200"></label>
          <label class="fc-mini-field"><span>${tr('Yetkazib berish vaqti','Время доставки')}</span><input type="text" value="${escapeHtml(g.estimatedTime || '')}" oninput="setTaxiGeneralEstimatedTime(this.value)" maxlength="60"></label>
        </div>`;
      })() : '';
      return `<div class="space-y-3">
        <div class="fc-delivery-master-toggle"><div><b>${tr('Usulni yoqish','Включить способ')}</b><small>${descriptions[kind]}</small></div><label class="fc-toggle"><input type="checkbox" ${method.enabled ? 'checked' : ''} onchange="setDeliveryMethodEnabled('${kind}',this.checked)"><span class="fc-toggle-track"></span></label></div>
        ${method.enabled ? `${taxiGeneralHtml}<div class="fc-delivery-bulk-tools">${settingsBulkButtons(`bulkDeliveryRegions('${kind}',true)`, `bulkDeliveryRegions('${kind}',false)`)}</div>${renderDeliveryRegionRows(kind)}` : `<div class="fc-empty-state compact"><p>${tr('Bu yetkazib berish usuli o‘chirilgan.','Этот способ доставки выключен.')}</p></div>`}
      </div>`;
    }

    function fulfillmentBackButton() {
      return `<button type="button" onclick="setFulfillmentSettingsSection('MENU')" class="text-[11px] font-bold text-blue-600 bg-blue-50 flex items-center gap-1 px-2.5 py-1.5 rounded-full w-fit">‹ ${tr('Orqaga','Назад')}</button>`;
    }

    // 1.1: "Yetkazib berish va to'lov" ikkita mustaqil bo'limga bo'lingan:
    // A) Yetkazib berish usullari  B) To'lov turlari. Telegram katalogi kabi
    // — avval bo'lim ro'yxati, bosilganda ichiga kirasiz.
    function renderFulfillmentMenuPanel() {
      const deliveryOnCount = ['FREE', 'FIXED', 'TAXI'].filter(k => fulfillmentDraft.delivery[DELIVERY_CONFIG_KEYS[k]].enabled).length + (fulfillmentDraft.delivery.post.enabled ? 1 : 0);
      const paymentOnCount = fulfillmentDraft.payments.methods.filter(m => m.enabled).length;
      return `<div class="space-y-2">
        <button type="button" onclick="setFulfillmentSettingsSection('DELIVERY')" class="w-full flex items-center justify-between bg-gray-50 border rounded-2xl p-3.5 font-bold text-left">
          <span>🚚 ${tr('Yetkazib berish usullari','Способы доставки')}<br><span class="text-[10px] font-normal text-gray-500">${deliveryOnCount} ${tr('usul yoqilgan','способов включено')}</span></span><span>›</span>
        </button>
        <button type="button" onclick="setFulfillmentSettingsSection('PAYMENTS')" class="w-full flex items-center justify-between bg-gray-50 border rounded-2xl p-3.5 font-bold text-left">
          <span>💳 ${tr("To'lov turlari",'Способы оплаты')}<br><span class="text-[10px] font-normal text-gray-500">${paymentOnCount} ${tr('usul yoqilgan','способов включено')}</span></span><span>›</span>
        </button>
      </div>`;
    }

    function renderFulfillmentDeliveryPanel() {
      const kinds = [
        ['FREE', tr('Bepul', 'Бесплатно'), 'badge-check'],
        ['FIXED', tr('Aniq narx', 'Фикс. цена'), 'truck'],
        ['TAXI', tr('Taksi', 'Такси'), 'car-front'],
        ['POST', tr('Pochta', 'Почта'), 'package-open'],
      ];
      return `<div class="space-y-3">
        <div class="fc-delivery-kind-grid">${kinds.map(([id, label, icon]) => `<button type="button" onclick="setFulfillmentDeliveryKind('${id}')" class="fc-delivery-kind ${fulfillmentDeliveryKind === id ? 'is-active' : ''}"><i data-lucide="${icon}" class="w-4 h-4"></i><span>${label}</span></button>`).join('')}</div>
        <div id="fulfillment-body" class="fc-delivery-body-shell">${renderFulfillmentDeliveryBody()}</div>
      </div>`;
    }

    // 1.2: Naqd va Karta yonma-yon tugma; bosilgan usul pastda ochiladi.
    function renderFulfillmentPaymentsPanel() {
      // CLICK — faqat platforma ruxsat bergan do'konlarda ko'rinadi (Billz
      // bilan bir xil naqsh); ruxsatsiz do'kon uchun ishlatib bo'lmaydigan
      // tugmani ko'rsatib chalkashtirmaslik uchun ro'yxatdan olib tashlanadi.
      const methods = fulfillmentDraft.payments.methods.filter(m => m.id !== 'CLICK' || clickAccessGranted);
      return `<div class="space-y-3">
        <div class="fc-payment-method-grid">${methods.map(m => `
          <button type="button" onclick="setFulfillmentExpandedPayment('${m.id}')" class="fc-payment-method-card ${fulfillmentExpandedPayment === m.id ? 'is-active' : ''}">
            ${m.id === 'CASH' ? ICON_CASH : m.id === 'CARD' ? ICON_CARD : m.id === 'CLICK' ? ICON_BOLT : ICON_QR}
            <span>${escapeHtml(m.name)}</span>
            <span class="text-[9px] font-bold ${m.enabled ? (fulfillmentExpandedPayment === m.id ? 'text-emerald-200' : 'text-emerald-600') : 'text-gray-400'}">${m.enabled ? tr('Yoqilgan','Включено') : tr("O'chirilgan",'Выключено')}</span>
          </button>`).join('')}</div>
        <div id="fulfillment-body">${fulfillmentExpandedPayment ? renderPaymentMethodSettings(paymentMethodConfig(fulfillmentExpandedPayment)) : ''}</div>
      </div>`;
    }

    function renderFulfillmentPanel() {
      if (fulfillmentSettingsSection === 'DELIVERY') return renderFulfillmentDeliveryPanel();
      if (fulfillmentSettingsSection === 'PAYMENTS') return renderFulfillmentPaymentsPanel();
      return renderFulfillmentMenuPanel();
    }

    async function saveFulfillmentSettings() {
      const qrMethodEnabled = paymentMethodConfig('QR')?.enabled === true;
      const activeQrProviders = qrMethodEnabled ? (qrProvidersOf() || []).filter(p => p.enabled) : [];
      const missingQrUrl = activeQrProviders.filter(p => !String(p.paymentUrl || '').trim());
      if (missingQrUrl.length) return alert(tr(`QR to'lovni saqlash uchun QR rasmini yuklang va muvaffaqiyatli o'qiting: ${missingQrUrl.map(p => p.name).join(', ')}`, `Для сохранения QR-оплаты загрузите QR и успешно распознайте его: ${missingQrUrl.map(p => p.name).join(', ')}`));
      const untestedQr = activeQrProviders.filter(p => p.paymentUrl && qrProviderNeedsTest.has(p.id));
      if (untestedQr.length) return alert(tr(`QR linkni saqlashdan oldin "Sinash" orqali tekshiring: ${untestedQr.map(p => p.name).join(', ')}`, `Перед сохранением проверьте QR-ссылку кнопкой «Тест»: ${untestedQr.map(p => p.name).join(', ')}`));
      const checked = commerce.validateConfig(fulfillmentDraft, TOP_LEVEL_REGION_IDS);
      if (checked.issues.length) {
        const first = checked.issues[0];
        if (first.code === 'CARD_DETAILS_REQUIRED') return alert(tr('Karta raqami va karta egasi nomini to‘g‘ri kiriting.', 'Правильно укажите номер карты и имя владельца.'));
        if (first.code === 'FIXED_FEE_REQUIRED') return alert(`${topLevelRegionLabel(first.regionId)}: ${tr('aniq yetkazish narxini kiriting.', 'укажите стоимость доставки.')}`);
        if (first.code === 'QR_PROVIDER_REQUIRED') return alert(tr("Kamida bitta QR provayderni yoqing va QR rasmini muvaffaqiyatli o'qiting.", "Включите хотя бы один QR-провайдер и успешно распознайте QR."));
        return alert(`${first.regionId === null ? tr('Umumiy qiymat', 'Общее значение') : topLevelRegionLabel(first.regionId)}: ${tr('taksi min/max diapazonini tekshiring.', 'проверьте диапазон такси min/max.')}`);
      }
      const old = fulfillmentConfig;
      fulfillmentConfig = checked.config;
      fulfillmentDraft = null;
      closePage();
      showActionToast(tr('⏳ Yetkazib berish sozlamalari saqlanmoqda...', '⏳ Настройки доставки сохраняются...'), 'saving');
      try {
        const result = await callApi('set_fulfillment_config', { config: fulfillmentConfig });
        fulfillmentConfig = commerce.normalizeConfig(result.fulfillmentConfig, TOP_LEVEL_REGION_IDS);
        showActionToast(tr('✅ Yetkazib berish va to‘lov sozlamalari saqlandi', '✅ Настройки доставки и оплаты сохранены'), 'success', 1600);
      } catch (e) {
        fulfillmentConfig = old;
        render();
        showActionToast(tr('❌ Sozlamalar saqlanmadi', '❌ Настройки не сохранены'), 'error', 1800);
        alert(tr('Sozlamalarni saqlashda xato: ', 'Ошибка сохранения настроек: ') + (e.message || e));
      }
    }

    function currentProfileDisplayName() {
      return [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim() || tr('Foydalanuvchi', 'Пользователь');
    }

    function currentProfileAvatarHtml() {
      const photo = String(currentUser.photoUrl || '').trim();
      if (photo) {
        return `<img src="${escapeHtml(photo)}" alt="${escapeHtml(currentProfileDisplayName())}" class="fc-profile-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');"><span class="fc-profile-avatar-fallback hidden"><i data-lucide="user" class="w-6 h-6"></i></span>`;
      }
      return `<span class="fc-profile-avatar-fallback"><i data-lucide="user" class="w-6 h-6"></i></span>`;
    }

    function profileSupportNeedsBadge() {
      return (isAdminMode && isUserAnAdmin)
        ? adminSupportTickets.some(t => t.status === 'OPEN' || supportNeedsAttention(t))
        : supportTickets.some(t => t.status === 'ANSWERED');
    }

    function profileMenuRowHtml({ icon, title, subtitle = '', onclick, badge = '', danger = false }) {
      return `<button type="button" onclick="${onclick}" class="fc-profile-menu-row">
        <span class="fc-profile-menu-icon ${danger ? 'is-danger' : ''}"><i data-lucide="${icon}" class="w-4 h-4"></i></span>
        <span class="fc-profile-menu-copy"><span class="fc-profile-menu-title">${title}</span>${subtitle ? `<span class="fc-profile-menu-subtitle">${subtitle}</span>` : ''}</span>
        ${badge ? `<span class="fc-profile-menu-badge">${badge}</span>` : ''}
        <i data-lucide="chevron-right" class="w-4 h-4 fc-profile-menu-chevron"></i>
      </button>`;
    }

    // ==================== BOSH SAHIFA KATALOGLARI (foydalanuvchi qo'shimcha so'rovi) ====================

    function openFeaturedCategoriesPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('FEATURED_CATEGORIES', 'nav-profile');
    }

    function findFeaturedEntry(catId) { return featuredCategories.find(e => e.categoryId === catId); }
    function toggleFeaturedCategory(catId) {
      const idx = featuredCategories.findIndex(e => e.categoryId === catId);
      if (idx >= 0) featuredCategories.splice(idx, 1);
      else {
        if (featuredCategories.length >= 8) return showActionToast(tr("Eng ko'pi 8 ta katalog tanlash mumkin.", "Можно выбрать не более 8 каталогов."), 'error', 1800);
        featuredCategories.push({ categoryId: catId, productIds: [] });
      }
      render();
    }
    // 2-band: har tanlangan katalog uchun admin alohida maks 6 ta mahsulot tanlaydi.
    function toggleFeaturedCategoryProduct(catId, productId) {
      const entry = findFeaturedEntry(catId);
      if (!entry) return;
      const idx = entry.productIds.indexOf(productId);
      if (idx >= 0) entry.productIds.splice(idx, 1);
      else {
        if (entry.productIds.length >= 6) return showActionToast(tr("Eng ko'pi 6 ta mahsulot tanlash mumkin.", "Можно выбрать не более 6 товаров."), 'error', 1800);
        entry.productIds.push(productId);
      }
      render();
    }

    async function saveFeaturedCategories() {
      featuredCategoriesSaving = true;
      render();
      try {
        await callApi('set_featured_categories', { featuredCategories });
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1500);
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      } finally {
        featuredCategoriesSaving = false;
        render();
      }
    }

    // Shop takomillashtirish, 2-band: avval faqat bosh/root kataloglar tanlanardi
    // — endi istalgan chuqurlikdagi katalog (ichki/subkategoriya ham) tanlanadi.
    function flattenCategoriesForPicker(parentId = null, depth = 0, seen = new Set()) {
      const children = categories.filter(c => (c.parentId || null) === parentId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      let out = [];
      for (const c of children) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push({ ...c, depth });
        out = out.concat(flattenCategoriesForPicker(c.id, depth + 1, seen));
      }
      return out;
    }
    function renderFeaturedCategoriesPage(container) {
      const flatCats = flattenCategoriesForPicker();
      const rows = flatCats.map(c => {
        const entry = findFeaturedEntry(c.id);
        const catProducts = products.filter(p => p.categoryId === c.id && p.status !== 'DELETED');
        const productPicker = entry ? `
          <div class="pl-3 pt-2 mt-2 space-y-1.5 border-l-2 border-gray-100 ml-2">
            <p class="text-[10px] text-gray-400">${entry.productIds.length} / 6 ${tr('mahsulot tanlandi', 'товаров выбрано')}</p>
            ${catProducts.length ? catProducts.map(p => `
              <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" ${entry.productIds.includes(p.id) ? 'checked' : ''} onchange="toggleFeaturedCategoryProduct('${c.id}','${p.id}')">
                <span class="truncate">${escapeHtml(p.name)}</span>
              </label>
            `).join('') : `<p class="text-[10px] text-gray-400">${tr("Bu katalogda mahsulot yo'q.", 'В этом каталоге нет товаров.')}</p>`}
          </div>` : '';
        return `
          <div class="fc-card" style="margin-left:${c.depth * 14}px">
            <label class="flex items-center justify-between gap-2">
              <span class="flex items-center gap-2 min-w-0"><span class="fc-featured-cat-icon" style="width:2.2rem;height:2.2rem">${c.img ? `<img src="${escapeHtml(c.img)}">` : `<i data-lucide="folder" class="w-4 h-4"></i>`}</span><b class="text-xs truncate">${escapeHtml(categoryName(c))}</b></span>
              <span class="fc-toggle shrink-0"><input type="checkbox" ${entry ? 'checked' : ''} onchange="toggleFeaturedCategory('${c.id}')"><span class="fc-toggle-track"></span></span>
            </label>
            ${productPicker}
          </div>
        `;
      }).join('');
      const body = `<div class="space-y-3">
        <div class="fc-card"><p class="text-xs text-gray-600">${tr("Bosh sahifada ko'rinadigan kataloglarni va har biriga 6 tagacha mahsulot tanlang.", "Выберите каталоги для главной и до 6 товаров для каждого.")}</p><p class="text-[10px] text-gray-400 mt-1">${featuredCategories.length} / 8 ${tr('katalog tanlandi', 'каталогов выбрано')}</p></div>
        <div class="space-y-1.5">${rows || `<div class="fc-empty-state"><p>${tr("Kataloglar topilmadi.", "Каталоги не найдены.")}</p></div>`}</div>
        <button type="button" onclick="saveFeaturedCategories()" class="fc-btn fc-btn-primary w-full" ${featuredCategoriesSaving ? 'disabled' : ''}>${featuredCategoriesSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Saqlash', 'Сохранить')}</button>
      </div>`;
      renderPageShell(container, tr('Bosh sahifa kataloglari', 'Каталоги на главной'), body, { onBack: "openMarketingHubPage()" });
    }

    // ==================== BANNERLAR (Online Do'kon yaxshilashlari, 17-band) ====================

    function openBannersPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('BANNERS', 'nav-profile');
      loadBannerListLazy();
    }

    async function loadBannerListLazy(force = false) {
      if (!isUserAnAdmin || bannerListLoading || (bannerListLoaded && !force)) return;
      bannerListLoading = true;
      if (activePage === 'BANNERS') render();
      try {
        const data = await callApi('banner_list', {});
        bannerList = data.banners || [];
        bannerListLoaded = true;
      } catch (e) {
        console.error("Bannerlarni yuklashda xatolik:", e);
      } finally {
        bannerListLoading = false;
        if (activePage === 'BANNERS') render();
      }
    }

    function bannerTargetLabel(b) {
      if (b.targetType === 'PRODUCT') return `${tr('Mahsulot', 'Товар')}: ${escapeHtml((products.find(p => p.id === b.targetProductId) || {}).name || b.targetProductId || '')}`;
      if (b.targetType === 'CATEGORY') return `${tr('Katalog', 'Каталог')}: ${escapeHtml(categoryName(categories.find(c => c.id === b.targetCategoryId)) || b.targetCategoryId || '')}`;
      if (b.targetType === 'URL') return `${tr('Havola', 'Ссылка')}: ${escapeHtml(b.targetUrl || '')}`;
      if (b.targetType === 'BUNDLE') return `${tr('Aksiya', 'Акция')}: ${escapeHtml((bundleList.find(x => x.id === b.targetBundleId) || {}).name || b.targetBundleId || '')}`;
      if (b.targetType === 'PROMOTION') return `${tr('Promo-kod', 'Промокод')}: ${escapeHtml((promoList.find(x => x.id === b.targetPromotionId) || {}).name || b.targetPromotionId || '')}`;
      return tr("Hech narsa", "Ничего");
    }

    function renderBannersPage(container) {
      const rows = bannerListLoading && !bannerListLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
        : bannerList.length ? bannerList.map((b) => `
          <div class="fc-card fc-marketing-card">
            <button type="button" onclick="openBannerPreview('${b.id}')" class="fc-marketing-card-main">
              <span class="fc-marketing-drag-handle" aria-hidden="true"><i data-lucide="grip-vertical" class="w-4 h-4"></i></span>
              <img src="${escapeHtml(b.imageUrl)}" class="fc-marketing-thumb" loading="lazy">
              <span class="fc-marketing-copy">
                <b>${escapeHtml(b.title || (b.mode === 'IMAGE' ? tr('Tayyor rasm', 'Готовое изображение') : tr('(sarlavhasiz)', '(без заголовка)')))}</b>
                <small>${bannerTargetLabel(b)}</small>
              </span>
              <i data-lucide="chevron-right" class="w-4 h-4 fc-marketing-chevron"></i>
            </button>
            <div class="fc-marketing-actions">
              <button type="button" onclick="openBannerForm('${b.id}')" class="fc-btn fc-btn-icon" aria-label="${tr('Tahrirlash','Изменить')}"><i data-lucide="pencil" class="w-4 h-4"></i></button>
              <button type="button" onclick="deleteBannerAt('${b.id}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", "Удалить")}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
              <span class="fc-toggle shrink-0 ml-auto"><input type="checkbox" ${b.isActive ? 'checked' : ''} onchange="toggleBannerActive('${b.id}', this.checked)"><span class="fc-toggle-track"></span></span>
            </div>
          </div>
        `).join('') : `<div class="fc-empty-state"><i data-lucide="image" class="w-7 h-7"></i><p>${tr("Hozircha banner yo'q.", "Пока нет баннеров.")}</p></div>`;
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Bannerlar', 'Баннеры')}</h3><p>${tr("Jami 10 tagacha banner saqlashingiz mumkin, bosh sahifada bir vaqtda faqat 5 tasi ko'rsatiladi (yoqilgan bo'lsa).", "Можно сохранить до 10 баннеров, на главной одновременно показывается не более 5 (если включены).")}</p><p class="text-[10px] text-gray-400 mt-1">${bannerList.length} / 10</p></div>
          <button type="button" onclick="openBannerForm()" class="fc-btn fc-btn-primary" ${bannerList.length >= 10 ? 'disabled' : ''}><i data-lucide="plus" class="w-4 h-4"></i>${tr("Banner qo'shish", "Добавить")}</button>
        </div>
        <div class="space-y-2">${rows}</div>
      </div>`;
      renderPageShell(container, tr('Bannerlar', 'Баннеры'), body, { onBack: "openMarketingHubPage()" });
    }

    function openBannerPreview(id) {
      const b = bannerList.find(x => String(x.id) === String(id));
      if (!b) return;
      const target = bannerTargetLabel(b);
      const root = document.createElement('div');
      root.id = 'fc-banner-preview-root';
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) this.parentElement.remove();">
        <div class="fc-sheet fc-marketing-detail-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Banner ma’lumotlari','Данные баннера')}</div><button type="button" onclick="document.getElementById('fc-banner-preview-root')?.remove()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <img src="${escapeHtml(b.imageUrl)}" class="fc-marketing-detail-image" loading="lazy">
            <div class="fc-card space-y-1"><b class="text-sm">${escapeHtml(b.title || tr('Banner','Баннер'))}</b>${b.subtitle ? `<p class="text-xs text-gray-500">${escapeHtml(b.subtitle)}</p>` : ''}</div>
            <div class="fc-card flex items-center justify-between gap-3"><span class="text-xs text-gray-500">${tr('Ulangan joy','Привязано к')}</span><b class="text-xs text-right">${target}</b></div>
          </div>
        </div>
      </div>`;
      document.body.appendChild(root);
      if (window.lucide) lucide.createIcons();
    }

    function openBannerForm(id) {
      const existing = id ? bannerList.find(b => String(b.id) === String(id)) : null;
      clearTempImageSelection();
      bannerDraft = existing ? {
        id: existing.id, mode: 'IMAGE', title: existing.title || '', subtitle: existing.subtitle || '',
        ctaText: existing.ctaText || '', imageUrl: existing.imageUrl,
        targetType: existing.targetType, targetProductId: existing.targetProductId || '', targetCategoryId: existing.targetCategoryId || '',
        targetUrl: existing.targetUrl || '', targetBundleId: existing.targetBundleId || '', targetPromotionId: existing.targetPromotionId || '',
        startsAt: existing.startsAt ? existing.startsAt.slice(0, 10) : '',
        endsAt: existing.endsAt ? existing.endsAt.slice(0, 10) : '', isActive: existing.isActive,
      } : { mode: 'IMAGE', title: '', subtitle: '', ctaText: '', imageUrl: '', targetType: 'NONE', targetProductId: '', targetCategoryId: '', targetUrl: '', targetBundleId: '', targetPromotionId: '', startsAt: '', endsAt: '', isActive: true };
      renderBannerFormSheet();
      Promise.all([loadBundleListLazy(), loadPromoListLazy()]).then(() => {
        if (document.getElementById('fc-banner-form-root')) renderBannerFormSheet();
      });
    }

    function closeBannerForm() {
      const root = document.getElementById('fc-banner-form-root');
      if (root) root.remove();
      bannerDraft = null;
      clearTempImageSelection();
    }

    function setBannerDraftTarget(type) { bannerDraft.targetType = type; renderBannerFormSheet(); }

    function renderBannerFormSheet() {
      let root = document.getElementById('fc-banner-form-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'fc-banner-form-root';
        document.body.appendChild(root);
      }
      const d = bannerDraft;
      const isEdit = !!d.id;
      const previewSrc = tempImagePreviewUrl || d.imageUrl || '';
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeBannerForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${isEdit ? tr("Bannerni tahrirlash", "Изменить баннер") : tr("Yangi banner", "Новый баннер")}</div><button type="button" onclick="closeBannerForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <div>
              <label class="font-bold text-gray-600 text-xs">${tr('Banner rasmi', 'Изображение баннера')}</label>
              <p class="text-[10px] text-gray-400 mt-0.5">${tr('Tavsiya etilgan o\'lcham: 1200 × 400 px (3:1)', 'Рекомендуемый размер: 1200 × 400 px (3:1)')}</p>
              <input id="banner-image-input" type="file" accept="image/*" onchange="onImagePicked(event, 'banner-image-prev', 'banner-image-button', '', '')" class="hidden">
              <input id="banner-image-input-files" type="file" onchange="onImagePicked(event, 'banner-image-prev', 'banner-image-button', '', '')" class="hidden">
              <button id="banner-image-button" type="button" onclick="openImagePickerSheet('banner-image-input','banner-image-input-files')" class="fc-btn fc-btn-secondary w-full mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${previewSrc ? tr("Rasmni almashtirish", "Заменить фото") : tr("Rasm tanlash", "Выбрать фото")}</button>
              <img id="banner-image-prev" src="${escapeHtml(previewSrc)}" style="aspect-ratio:3/1" class="w-full object-cover rounded-xl mt-2 ${previewSrc ? '' : 'hidden'} border">
            </div>

            <div class="fc-mini-field"><span>${tr('Bosilganda nima ochiladi', 'Что открывается при нажатии')}</span><div class="fc-tabs">
              ${['NONE','PRODUCT','CATEGORY','URL','BUNDLE','PROMOTION'].map(t => `<button type="button" onclick="setBannerDraftTarget('${t}')" class="fc-tab ${d.targetType === t ? 'fc-tab-active' : ''}">${{NONE:tr("Hech narsa","Ничего"),PRODUCT:tr('Mahsulot','Товар'),CATEGORY:tr('Katalog','Каталог'),URL:tr('Havola','Ссылка'),BUNDLE:tr('Aksiya','Акция'),PROMOTION:tr('Promo-kod','Промокод')}[t]}</button>`).join('')}
            </div></div>
            ${d.targetType === 'PRODUCT' ? `<select id="banner-f-target-product" class="w-full p-2 border rounded-xl text-xs">${products.map(p => `<option value="${escapeHtml(p.id)}" ${d.targetProductId === p.id ? 'selected' : ''}>${escapeHtml(productName(p))}</option>`).join('')}</select>` : ''}
            ${d.targetType === 'CATEGORY' ? `<select id="banner-f-target-category" class="w-full p-2 border rounded-xl text-xs">${categories.map(c => `<option value="${escapeHtml(c.id)}" ${d.targetCategoryId === c.id ? 'selected' : ''}>${escapeHtml(categoryName(c))}</option>`).join('')}</select>` : ''}
            ${d.targetType === 'URL' ? `<input type="url" id="banner-f-target-url" value="${escapeHtml(d.targetUrl)}" placeholder="https://..." class="w-full p-2 border rounded-xl text-xs">` : ''}
            ${d.targetType === 'BUNDLE' ? (bundleList.length ? `<select id="banner-f-target-bundle" class="w-full p-2 border rounded-xl text-xs">${bundleList.map(b => `<option value="${escapeHtml(b.id)}" ${d.targetBundleId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select>` : `<p class="text-[10px] text-gray-400">${tr("Avval Aksiya yarating.", 'Сначала создайте акцию.')}</p>`) : ''}
            ${d.targetType === 'PROMOTION' ? (promoList.length ? `<select id="banner-f-target-promotion" class="w-full p-2 border rounded-xl text-xs">${promoList.map(p => `<option value="${escapeHtml(p.id)}" ${d.targetPromotionId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`).join('')}</select>` : `<p class="text-[10px] text-gray-400">${tr("Avval promo-kod yarating.", 'Сначала создайте промокод.')}</p>`) : ''}

            <div class="grid grid-cols-2 gap-2">
              <label class="fc-mini-field"><span>${tr('Boshlanish sanasi', 'Дата начала')}</span><input type="date" id="banner-f-starts" value="${escapeHtml(d.startsAt)}"></label>
              <label class="fc-mini-field"><span>${tr('Tugash sanasi', 'Дата окончания')}</span><input type="date" id="banner-f-ends" value="${escapeHtml(d.endsAt)}"></label>
            </div>
            <div class="flex items-center justify-between p-1"><span class="text-xs font-bold text-gray-600">${tr('Faol', 'Активен')}</span><span class="fc-toggle"><input type="checkbox" id="banner-f-active" ${d.isActive ? 'checked' : ''}><span class="fc-toggle-track"></span></span></div>
          </div>
          <div class="fc-sheet-footer">
            <button type="button" onclick="saveBannerForm()" class="fc-btn fc-btn-primary w-full" ${bannerSaving ? 'disabled' : ''}>${bannerSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Saqlash', 'Сохранить')}</button>
          </div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }

    async function saveBannerForm() {
      if (bannerSaving) return;
      const d = bannerDraft;
      const targetType = d.targetType;
      const targetProductId = targetType === 'PRODUCT' ? document.getElementById('banner-f-target-product')?.value : null;
      const targetCategoryId = targetType === 'CATEGORY' ? document.getElementById('banner-f-target-category')?.value : null;
      const targetUrl = targetType === 'URL' ? document.getElementById('banner-f-target-url')?.value.trim() : null;
      const targetBundleId = targetType === 'BUNDLE' ? document.getElementById('banner-f-target-bundle')?.value : null;
      const targetPromotionId = targetType === 'PROMOTION' ? document.getElementById('banner-f-target-promotion')?.value : null;
      if (targetType === 'URL' && !targetUrl) return alert(tr("Havolani kiriting.", "Введите ссылку."));
      if (targetType === 'BUNDLE' && !targetBundleId) return alert(tr("Aksiyani tanlang.", "Выберите акцию."));
      if (targetType === 'PROMOTION' && !targetPromotionId) return alert(tr("Promo-kodni tanlang.", "Выберите промокод."));

      bannerSaving = true;
      renderBannerFormSheet();
      try {
        const imageSnap = takeTempImageSnapshot();
        const localImageWasSelected = !!(imageSnap?.file || imageSnap?.preparing);
        let imageUrl = d.imageUrl || null;
        if (localImageWasSelected) {
          const result = await productImagePayloadFromSnapshot(imageSnap, true);
          imageUrl = result.img;
        }
        if (!imageUrl) { bannerSaving = false; renderBannerFormSheet(); return alert(tr("Rasm tanlang.", "Выберите изображение.")); }

        const payload = {
          mode: d.mode, imageUrl,
          title: d.mode === 'TEMPLATE' ? document.getElementById('banner-f-title')?.value.trim() : null,
          subtitle: d.mode === 'TEMPLATE' ? document.getElementById('banner-f-subtitle')?.value.trim() : null,
          ctaText: d.mode === 'TEMPLATE' ? document.getElementById('banner-f-cta')?.value.trim() : null,
          targetType, targetProductId, targetCategoryId, targetUrl, targetBundleId, targetPromotionId,
          startsAt: document.getElementById('banner-f-starts')?.value || null,
          endsAt: document.getElementById('banner-f-ends')?.value || null,
          isActive: !!document.getElementById('banner-f-active')?.checked,
        };
        if (d.id) await callApi('banner_update', { id: d.id, ...payload });
        else await callApi('banner_create', payload);
        closeBannerForm();
        showActionToast(tr('Saqlandi', 'Сохранено'), 'success', 1500);
        await loadBannerListLazy(true);
      } catch (e) {
        alert(tr("Saqlab bo'lmadi. Qaytadan urinib ko'ring.", "Не удалось сохранить. Попробуйте ещё раз."));
      } finally {
        bannerSaving = false;
      }
    }

    async function toggleBannerActive(id, checked) {
      try {
        await callApi('banner_update', { id, isActive: checked });
        const item = bannerList.find(b => String(b.id) === String(id));
        if (item) item.isActive = checked;
        render();
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
        render();
      }
    }

    async function deleteBannerAt(id) {
      const ok = await fcConfirm(tr("Bannerni o'chirish", "Удалить баннер"), tr("Bu banner butunlay o'chiriladi.", "Этот баннер будет удалён навсегда."));
      if (!ok) return;
      try {
        await callApi('banner_delete', { id });
        await loadBannerListLazy(true);
        showActionToast(tr("O'chirildi", 'Удалён'), 'success', 1500);
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      }
    }

    // ==================== SAVATNI TASHLAB KETGANLAR (Online Do'kon yaxshilashlari, 2-band) ====================

    function openAbandonedCartsPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('ABANDONED_CARTS', 'nav-profile');
      loadAbandonedCartsLazy();
    }

    async function loadAbandonedCartsLazy(force = false) {
      if (!isUserAnAdmin || abandonedCartsLoading || (abandonedCartsLoaded && !force)) return;
      abandonedCartsLoading = true;
      if (activePage === 'ABANDONED_CARTS') render();
      try {
        const data = await callApi('list_abandoned_carts', {});
        abandonedCarts = data.carts || [];
        abandonedCartsLoaded = true;
      } catch (e) {
        console.error("Tashlab ketilgan savatlarni yuklashda xatolik:", e);
      } finally {
        abandonedCartsLoading = false;
        if (activePage === 'ABANDONED_CARTS') render();
      }
    }

    function cartAgeLabel(updatedAt) {
      const mins = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000));
      if (mins < 60) return tr(`${mins} daqiqa oldin`, `${mins} мин. назад`);
      const hours = Math.round(mins / 60);
      if (hours < 24) return tr(`${hours} soat oldin`, `${hours} ч. назад`);
      return tr(`${Math.round(hours / 24)} kun oldin`, `${Math.round(hours / 24)} дн. назад`);
    }

    function renderAbandonedCartsPage(container) {
      const rows = abandonedCartsLoading && !abandonedCartsLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
        : abandonedCarts.length ? abandonedCarts.map(c => `
          <div class="fc-card space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0"><b class="text-sm">${escapeHtml(c.customerName || c.username || c.phone || ('#' + c.tgId))}</b>${c.phone ? `<p class="text-[10px] text-gray-400">${escapeHtml(c.phone)}</p>` : ''}</div>
              <b class="text-sm text-blue-600 shrink-0">${money(c.cartValue)}</b>
            </div>
            <p class="text-[10px] text-gray-400">${c.itemCount} ${tr('ta mahsulot', 'товаров')} · ${cartAgeLabel(c.updatedAt)}</p>
            <p class="text-xs text-gray-600 truncate">${c.items.map(i => escapeHtml(i.name)).join(', ')}</p>
          </div>
        `).join('') : `<div class="fc-empty-state"><i data-lucide="shopping-cart" class="w-7 h-7"></i><p>${tr("Hozircha tashlab ketilgan savat yo'q.", "Пока нет брошенных корзин.")}</p></div>`;
      const body = `<div class="space-y-3">
        <div class="fc-card"><p class="text-xs text-gray-600">${tr("Savatga mahsulot qo'shib, kamida 30 daqiqadan beri buyurtma bermagan mijozlar.", "Клиенты, добавившие товары в корзину и не оформившие заказ уже 30+ минут.")}</p></div>
        <div class="space-y-2">${rows}</div>
      </div>`;
      renderPageShell(container, tr('Tashlab ketilgan savatlar', 'Брошенные корзины'), body);
    }

    // ==================== PROMO-KOD (Online Do'kon yaxshilashlari, 1-band) ====================

    // ==================== AKSIYALAR (Bundle) — shop takomillashtirish qo'shimchasi ====================
    function openBundlesPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('BUNDLES', 'nav-profile');
      loadBundleListLazy();
    }
    async function loadBundleListLazy(force = false) {
      if (!isUserAnAdmin || bundleListLoading || (bundleListLoaded && !force)) return;
      bundleListLoading = true;
      if (activePage === 'BUNDLES') render();
      try {
        const data = await callApi('bundle_list', {});
        bundleList = data.bundles || [];
        bundleListLoaded = true;
      } catch (e) { console.error(e); }
      finally { bundleListLoading = false; if (activePage === 'BUNDLES') render(); }
    }
    function renderBundlesPage(container) {
      const rows = bundleListLoading && !bundleListLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`
        : bundleList.length ? bundleList.map(b => `
          <div class="fc-card fc-marketing-card">
            <button type="button" onclick="openCampaignDetail('BUNDLE','${b.id}')" class="fc-marketing-card-main">
              ${b.coverImageUrl ? `<img src="${escapeHtml(b.coverImageUrl)}" class="fc-marketing-thumb is-square">` : `<span class="fc-marketing-thumb is-square fc-marketing-placeholder"><i data-lucide="package" class="w-5 h-5"></i></span>`}
              <span class="fc-marketing-copy"><b>${escapeHtml(b.name)}</b><small>${b.items.length} ${tr('mahsulot', 'товаров')} · ${money(b.bundlePrice)}</small>${!b.isActive ? `<em>${tr('Faol emas','Неактивен')}</em>` : ''}</span>
              <i data-lucide="chevron-right" class="w-4 h-4 fc-marketing-chevron"></i>
            </button>
            <div class="fc-marketing-actions">
              <button type="button" onclick="openBundleForm('${b.id}')" class="fc-btn fc-btn-icon" aria-label="${tr('Tahrirlash','Изменить')}"><i data-lucide="pencil" class="w-4 h-4"></i></button>
              <button type="button" onclick="deleteBundleAt('${b.id}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", 'Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
              <span class="fc-badge ${b.isActive ? 'fc-badge-success' : 'fc-badge-muted'} ml-auto">${b.isActive ? tr('Faol','Активна') : tr('Faol emas','Неактивна')}</span>
            </div>
          </div>
        `).join('') : `<div class="fc-empty-state"><i data-lucide="package" class="w-7 h-7"></i><p>${tr("Hozircha aksiya yo'q.", 'Пока нет акций.')}</p></div>`;
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Aksiyalar', 'Акции')}</h3><p>${tr("Bir nechta mahsulotni bitta to'plam narxida sotish.", 'Продажа нескольких товаров по цене набора.')}</p></div>
          <button type="button" onclick="openBundleForm()" class="fc-btn fc-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i>${tr('Yaratish', 'Создать')}</button>
        </div>
        <div class="space-y-2">${rows}</div>
      </div>`;
      renderPageShell(container, tr('Aksiyalar', 'Акции'), body, { onBack: "openMarketingHubPage()" });
    }
    function openBundleForm(id) {
      const existing = id ? bundleList.find(b => String(b.id) === String(id)) : null;
      clearTempImageSelection();
      bundleDraft = existing ? {
        id: existing.id, name: existing.name, description: existing.description || '',
        items: existing.items.map(i => ({ productId: i.productId, qty: i.qty })), bundlePrice: existing.bundlePrice,
        coverImageUrl: existing.coverImageUrl || '', startsAt: existing.startsAt ? existing.startsAt.slice(0, 10) : '',
        endsAt: existing.endsAt ? existing.endsAt.slice(0, 10) : '', isActive: existing.isActive,
      } : { id: null, name: '', description: '', items: [], bundlePrice: '', coverImageUrl: '', startsAt: '', endsAt: '', isActive: true };
      renderBundleFormSheet();
    }
    function closeBundleForm() {
      const root = document.getElementById('fc-bundle-form-root');
      if (root) root.remove();
      bundleDraft = null;
      clearTempImageSelection();
    }
    function toggleBundleDraftProduct(productId) {
      const idx = bundleDraft.items.findIndex(i => i.productId === productId);
      if (idx >= 0) bundleDraft.items.splice(idx, 1);
      else bundleDraft.items.push({ productId, qty: 1 });
      renderBundleFormSheet();
    }
    function setBundleDraftProductQty(productId, qty) {
      const item = bundleDraft.items.find(i => i.productId === productId);
      if (item) item.qty = Math.max(1, Math.round(Number(qty) || 1));
    }
    function renderBundleFormSheet() {
      let root = document.getElementById('fc-bundle-form-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-bundle-form-root'; document.body.appendChild(root); }
      const d = bundleDraft;
      const isEdit = !!d.id;
      const previewSrc = tempImagePreviewUrl || d.coverImageUrl || '';
      const regularTotal = d.items.reduce((s, i) => { const p = products.find(pp => pp.id === i.productId); return s + (p ? Number(p.price) * i.qty : 0); }, 0);
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeBundleForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${isEdit ? tr('Aksiyani tahrirlash', 'Изменить акцию') : tr('Yangi aksiya', 'Новая акция')}</div><button type="button" onclick="closeBundleForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <label class="fc-mini-field"><span>${tr('Nomi', 'Название')}</span><input type="text" id="bundle-f-name" value="${escapeHtml(d.name)}" maxlength="120" placeholder="${tr("Masalan: Massa yig'ish to'plami", 'Например: Набор для набора массы')}"></label>
            <label class="fc-mini-field"><span>${tr('Qisqa izoh', 'Короткое описание')}</span><input type="text" id="bundle-f-desc" value="${escapeHtml(d.description)}" maxlength="300"></label>
            <div>
              <label class="font-bold text-gray-600 text-xs">${tr('Muqova rasmi (ixtiyoriy)', 'Обложка (необязательно)')}</label>
              <input id="bundle-image-input" type="file" accept="image/*" onchange="onImagePicked(event, 'bundle-image-prev', 'bundle-image-button', '', '')" class="hidden">
              <input id="bundle-image-input-files" type="file" onchange="onImagePicked(event, 'bundle-image-prev', 'bundle-image-button', '', '')" class="hidden">
              <button id="bundle-image-button" type="button" onclick="openImagePickerSheet('bundle-image-input','bundle-image-input-files')" class="fc-btn fc-btn-secondary w-full mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${previewSrc ? tr('Rasmni almashtirish', 'Заменить фото') : tr('Rasm tanlash (ixtiyoriy)', 'Выбрать фото (необязательно)')}</button>
              <img id="bundle-image-prev" src="${escapeHtml(previewSrc)}" class="w-full h-28 object-cover rounded-xl mt-2 ${previewSrc ? '' : 'hidden'} border">
            </div>
            <div class="space-y-1.5">
              <b class="text-xs text-gray-600">${tr('Mahsulotlar (kamida 2 ta)', 'Товары (минимум 2)')}</b>
              <div class="max-h-56 overflow-y-auto space-y-1 border rounded-xl p-2">
                ${products.filter(p => p.status !== 'DELETED').map(p => {
                  const item = d.items.find(i => i.productId === p.id);
                  return `<div class="flex items-center gap-2 text-xs py-1">
                    <input type="checkbox" ${item ? 'checked' : ''} onchange="toggleBundleDraftProduct('${p.id}')">
                    <span class="flex-1 truncate">${escapeHtml(productName(p))}</span>
                    ${item ? `<input type="number" min="1" value="${item.qty}" onchange="setBundleDraftProductQty('${p.id}', this.value)" class="w-14 p-1 border rounded text-center">` : ''}
                  </div>`;
                }).join('')}
              </div>
              ${regularTotal > 0 ? `<p class="text-[10px] text-gray-400">${tr('Oddiy jami', 'Обычная сумма')}: ${money(regularTotal)}</p>` : ''}
            </div>
            <label class="fc-mini-field"><span>${tr('Aksiya narxi', 'Цена акции')}</span><input type="number" id="bundle-f-price" value="${escapeHtml(String(d.bundlePrice))}" min="1"></label>
            <div class="grid grid-cols-2 gap-2">
              <label class="fc-mini-field"><span>${tr('Boshlanish sanasi', 'Дата начала')}</span><input type="date" id="bundle-f-starts" value="${escapeHtml(d.startsAt)}"></label>
              <label class="fc-mini-field"><span>${tr('Tugash sanasi', 'Дата окончания')}</span><input type="date" id="bundle-f-ends" value="${escapeHtml(d.endsAt)}"></label>
            </div>
            <div class="flex items-center justify-between p-1"><span class="text-xs font-bold text-gray-600">${tr('Faol', 'Активен')}</span><span class="fc-toggle"><input type="checkbox" id="bundle-f-active" ${d.isActive ? 'checked' : ''}><span class="fc-toggle-track"></span></span></div>
          </div>
          <div class="fc-sheet-footer"><button type="button" onclick="saveBundleForm()" class="fc-btn fc-btn-primary w-full" ${bundleSaving ? 'disabled' : ''}>${bundleSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Saqlash', 'Сохранить')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function saveBundleForm() {
      if (bundleSaving) return;
      const d = bundleDraft;
      const name = document.getElementById('bundle-f-name')?.value.trim();
      if (!name) return alert(tr('Nomini kiriting.', 'Введите название.'));
      if (d.items.length < 2) return alert(tr('Kamida 2 ta mahsulot tanlang.', 'Выберите минимум 2 товара.'));
      const bundlePrice = Number(document.getElementById('bundle-f-price')?.value);
      if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) return alert(tr("To'g'ri narx kiriting.", 'Введите корректную цену.'));
      bundleSaving = true;
      renderBundleFormSheet();
      try {
        const imageSnap = takeTempImageSnapshot();
        let coverImageUrl = d.coverImageUrl || null;
        if (imageSnap?.file || imageSnap?.preparing) {
          const result = await productImagePayloadFromSnapshot(imageSnap, false);
          coverImageUrl = result.img;
        }
        const payload = {
          name, description: document.getElementById('bundle-f-desc')?.value.trim() || null,
          items: d.items, bundlePrice, coverImageUrl,
          startsAt: document.getElementById('bundle-f-starts')?.value || null,
          endsAt: document.getElementById('bundle-f-ends')?.value || null,
          isActive: !!document.getElementById('bundle-f-active')?.checked,
        };
        if (d.id) await callApi('bundle_update', { id: d.id, ...payload });
        else await callApi('bundle_create', payload);
        closeBundleForm();
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1500);
        await loadBundleListLazy(true);
      } catch (e) {
        alert(tr("Saqlab bo'lmadi.", 'Не удалось сохранить.'));
      } finally {
        bundleSaving = false;
      }
    }
    async function deleteBundleAt(id) {
      const ok = await fcConfirm(tr("Aksiyani o'chirish", 'Удалить акцию'), tr("Bu aksiya butunlay o'chiriladi.", 'Эта акция будет удалена навсегда.'));
      if (!ok) return;
      try {
        await callApi('bundle_delete', { id });
        await loadBundleListLazy(true);
        showActionToast(tr("O'chirildi", 'Удалена'), 'success', 1500);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    // ==================== BOSQICHLI CHEGIRMA (tier) ====================
    function openDiscountTiersPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('DISCOUNT_TIERS', 'nav-profile');
      loadTierListLazy();
    }
    async function loadTierListLazy(force = false) {
      if (!isUserAnAdmin || tierListLoading || (tierListLoaded && !force)) return;
      tierListLoading = true;
      if (activePage === 'DISCOUNT_TIERS') render();
      try {
        const data = await callApi('discount_tier_list', {});
        tierList = data.tiers || [];
        tierListLoaded = true;
      } catch (e) { console.error(e); }
      finally { tierListLoading = false; if (activePage === 'DISCOUNT_TIERS') render(); }
    }
    function renderDiscountTiersPage(container) {
      const rows = tierListLoading && !tierListLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`
        : tierList.length ? tierList.map(t => `
          <div class="fc-card fc-marketing-card">
            <button type="button" onclick="openTierPreview('${t.id}')" class="fc-marketing-card-main">
              <span class="fc-marketing-iconbox"><i data-lucide="trending-up" class="w-5 h-5"></i></span>
              <span class="fc-marketing-copy"><b>${t.name ? escapeHtml(t.name) : `${money(t.thresholdAmount)}+`}</b><small>${money(t.thresholdAmount)}${tr(' dan', ' от')} → ${t.discountType === 'PERCENT' ? `${t.discountValue}%` : money(t.discountValue)}</small></span>
              <i data-lucide="chevron-right" class="w-4 h-4 fc-marketing-chevron"></i>
            </button>
            <div class="fc-marketing-actions"><button type="button" onclick="openTierForm('${t.id}')" class="fc-btn fc-btn-icon" aria-label="${tr('Tahrirlash','Изменить')}"><i data-lucide="pencil" class="w-4 h-4"></i></button><button type="button" onclick="deleteTierAt('${t.id}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", 'Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button><span class="fc-badge ${t.isActive ? 'fc-badge-success' : 'fc-badge-muted'} ml-auto">${t.isActive ? tr('Faol','Активна') : tr('Faol emas','Неактивна')}</span></div>
          </div>
        `).join('') : `<div class="fc-empty-state"><i data-lucide="trending-up" class="w-7 h-7"></i><p>${tr("Hozircha bosqichli chegirma yo'q.", 'Пока нет ступенчатых скидок.')}</p></div>`;
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Bosqichli chegirma', 'Ступенчатые скидки')}</h3><p>${tr("Masalan: 2 000 000 so'mdan yuqori buyurtmaga 7% chegirma. Faqat ENG YUQORI mos bosqich ishlaydi.", 'Например: скидка 7% на заказы от 2 000 000 сум. Работает только САМАЯ ВЫСОКАЯ подходящая ступень.')}</p></div>
          <button type="button" onclick="openTierForm()" class="fc-btn fc-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i>${tr('Yaratish', 'Создать')}</button>
        </div>
        <div class="space-y-2">${rows}</div>
      </div>`;
      renderPageShell(container, tr('Bosqichli chegirma', 'Ступенчатые скидки'), body, { onBack: "openMarketingHubPage()" });
    }
    function openTierPreview(id) {
      const t = tierList.find(x => String(x.id) === String(id));
      if (!t) return;
      const root = document.createElement('div');
      root.id = 'fc-tier-preview-root';
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) this.parentElement.remove();"><div class="fc-sheet fc-marketing-detail-sheet"><div class="fc-sheet-handle"></div><div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Bosqichli chegirma','Ступенчатая скидка')}</div><button type="button" onclick="document.getElementById('fc-tier-preview-root')?.remove()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div><div class="fc-sheet-body space-y-3"><div class="fc-card"><h3 class="font-black text-base">${escapeHtml(t.name || `${money(t.thresholdAmount)}+`)}</h3><p class="text-xs text-gray-500 mt-1">${money(t.thresholdAmount)}${tr(' dan boshlab',' начиная с')} → <b>${t.discountType === 'PERCENT' ? `${t.discountValue}%` : money(t.discountValue)}</b></p></div><div class="grid grid-cols-2 gap-2"><div class="fc-card"><small>${tr('Boshlanish','Начало')}</small><b>${t.startsAt ? new Date(t.startsAt).toLocaleDateString() : '—'}</b></div><div class="fc-card"><small>${tr('Tugash','Окончание')}</small><b>${t.endsAt ? new Date(t.endsAt).toLocaleDateString() : '—'}</b></div></div></div></div></div>`;
      document.body.appendChild(root); if (window.lucide) lucide.createIcons();
    }

    function openTierForm(id) {
      const existing = id ? tierList.find(t => String(t.id) === String(id)) : null;
      tierDraft = existing ? {
        id: existing.id, name: existing.name || '', thresholdAmount: existing.thresholdAmount,
        discountType: existing.discountType, discountValue: existing.discountValue,
        startsAt: existing.startsAt ? existing.startsAt.slice(0, 10) : '', endsAt: existing.endsAt ? existing.endsAt.slice(0, 10) : '',
        isActive: existing.isActive,
      } : { id: null, name: '', thresholdAmount: '', discountType: 'PERCENT', discountValue: '', startsAt: '', endsAt: '', isActive: true };
      renderTierFormSheet();
    }
    function closeTierForm() {
      const root = document.getElementById('fc-tier-form-root');
      if (root) root.remove();
      tierDraft = null;
    }
    function setTierDraftType(type) { tierDraft.discountType = type; renderTierFormSheet(); }
    function renderTierFormSheet() {
      let root = document.getElementById('fc-tier-form-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-tier-form-root'; document.body.appendChild(root); }
      const d = tierDraft;
      const isEdit = !!d.id;
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeTierForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${isEdit ? tr('Bosqichni tahrirlash', 'Изменить ступень') : tr('Yangi bosqich', 'Новая ступень')}</div><button type="button" onclick="closeTierForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <label class="fc-mini-field"><span>${tr('Nomi (ixtiyoriy)', 'Название (необязательно)')}</span><input type="text" id="tier-f-name" value="${escapeHtml(d.name)}" maxlength="80"></label>
            <label class="fc-mini-field"><span>${tr("Buyurtma summasi shundan yuqori bo'lsa", 'Если сумма заказа выше')}</span><input type="number" id="tier-f-threshold" value="${escapeHtml(String(d.thresholdAmount))}" min="1" placeholder="2000000"></label>
            <div class="fc-mini-field"><span>${tr('Chegirma turi', 'Тип скидки')}</span><div class="fc-tabs">
              <button type="button" onclick="setTierDraftType('PERCENT')" class="fc-tab ${d.discountType === 'PERCENT' ? 'fc-tab-active' : ''}">${tr('Foiz (%)', 'Процент (%)')}</button>
              <button type="button" onclick="setTierDraftType('FIXED')" class="fc-tab ${d.discountType === 'FIXED' ? 'fc-tab-active' : ''}">${tr("Aniq summa (so'm)", 'Фикс. сумма (сум)')}</button>
            </div></div>
            <label class="fc-mini-field"><span>${d.discountType === 'PERCENT' ? tr('Chegirma foizi', 'Процент скидки') : tr("Chegirma summasi (so'm)", 'Сумма скидки (сум)')}</span><input type="number" id="tier-f-value" value="${escapeHtml(String(d.discountValue))}" min="1" ${d.discountType === 'PERCENT' ? 'max="100"' : ''}></label>
            <div class="grid grid-cols-2 gap-2">
              <label class="fc-mini-field"><span>${tr('Boshlanish sanasi', 'Дата начала')}</span><input type="date" id="tier-f-starts" value="${escapeHtml(d.startsAt)}"></label>
              <label class="fc-mini-field"><span>${tr('Tugash sanasi', 'Дата окончания')}</span><input type="date" id="tier-f-ends" value="${escapeHtml(d.endsAt)}"></label>
            </div>
            <div class="flex items-center justify-between p-1"><span class="text-xs font-bold text-gray-600">${tr('Faol', 'Активен')}</span><span class="fc-toggle"><input type="checkbox" id="tier-f-active" ${d.isActive ? 'checked' : ''}><span class="fc-toggle-track"></span></span></div>
          </div>
          <div class="fc-sheet-footer"><button type="button" onclick="saveTierForm()" class="fc-btn fc-btn-primary w-full" ${tierSaving ? 'disabled' : ''}>${tierSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Saqlash', 'Сохранить')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function saveTierForm() {
      if (tierSaving) return;
      const d = tierDraft;
      const thresholdAmount = Number(document.getElementById('tier-f-threshold')?.value);
      if (!Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return alert(tr("To'g'ri summa kiriting.", 'Введите корректную сумму.'));
      const discountValue = Number(document.getElementById('tier-f-value')?.value);
      if (!Number.isFinite(discountValue) || discountValue <= 0) return alert(tr('Chegirma qiymatini kiriting.', 'Введите значение скидки.'));
      tierSaving = true;
      renderTierFormSheet();
      const payload = {
        name: document.getElementById('tier-f-name')?.value.trim() || null,
        thresholdAmount, discountType: d.discountType, discountValue,
        startsAt: document.getElementById('tier-f-starts')?.value || null,
        endsAt: document.getElementById('tier-f-ends')?.value || null,
        isActive: !!document.getElementById('tier-f-active')?.checked,
      };
      try {
        if (d.id) await callApi('discount_tier_update', { id: d.id, ...payload });
        else await callApi('discount_tier_create', payload);
        closeTierForm();
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1500);
        await loadTierListLazy(true);
      } catch (e) {
        alert(tr("Saqlab bo'lmadi.", 'Не удалось сохранить.'));
      } finally {
        tierSaving = false;
      }
    }
    async function deleteTierAt(id) {
      const ok = await fcConfirm(tr("Bosqichni o'chirish", 'Удалить ступень'), tr('Bu bosqich butunlay o\'chiriladi.', 'Эта ступень будет удалена навсегда.'));
      if (!ok) return;
      try {
        await callApi('discount_tier_delete', { id });
        await loadTierListLazy(true);
        showActionToast(tr("O'chirildi", 'Удалена'), 'success', 1500);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    // ==================== AVTOMATIK SOVG'A PROMO-KOD QOIDALARI (reward) ====================
    function openRewardRulesPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('REWARD_RULES', 'nav-profile');
      loadRewardRuleListLazy();
    }
    async function loadRewardRuleListLazy(force = false) {
      if (!isUserAnAdmin || rewardRuleListLoading || (rewardRuleListLoaded && !force)) return;
      rewardRuleListLoading = true;
      if (activePage === 'REWARD_RULES') render();
      try {
        const data = await callApi('reward_rule_list', {});
        rewardRuleList = data.rules || [];
        rewardRuleListLoaded = true;
      } catch (e) { console.error(e); }
      finally { rewardRuleListLoading = false; if (activePage === 'REWARD_RULES') render(); }
    }
    function renderRewardRulesPage(container) {
      const rows = rewardRuleListLoading && !rewardRuleListLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div></div>`
        : rewardRuleList.length ? rewardRuleList.map(r => `
          <div class="fc-card space-y-1.5">
            <div class="flex items-center justify-between">
              <b class="text-xs">${r.triggerType === 'ORDER_TOTAL' ? tr('Bitta buyurtma', 'Один заказ') : tr('Lifetime jami', 'Всего за всё время')}: ${money(r.thresholdAmount)}+</b>
              ${!r.isActive ? `<span class="fc-badge fc-badge-muted">${tr('faol emas', 'неактивен')}</span>` : ''}
            </div>
            <p class="text-[10px] text-gray-400">${tr('Sovg\'a', 'Награда')}: ${r.rewardType === 'PERCENT' ? `${r.rewardValue}%` : money(r.rewardValue)}${r.codeExpiryDays ? ` · ${r.codeExpiryDays} ${tr('kun amal qiladi', 'дней действия')}` : ''}</p>
            <div class="flex gap-2 pt-1">
              <button type="button" onclick="openRewardRuleForm('${r.id}')" class="fc-btn fc-btn-secondary flex-1"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>${tr('Tahrirlash', 'Изменить')}</button>
              <button type="button" onclick="deleteRewardRuleAt('${r.id}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", 'Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
          </div>
        `).join('') : `<div class="fc-empty-state"><i data-lucide="gift" class="w-7 h-7"></i><p>${tr("Hozircha qoida yo'q.", 'Пока нет правил.')}</p></div>`;
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr("Avtomatik sovg'a kodlari", 'Автоматические промокоды')}</h3><p>${tr("Mijoz belgilangan summaga yetsa, unga avtomatik bir martalik promo-kod beriladi.", 'Когда клиент достигает указанной суммы, ему автоматически выдаётся одноразовый промокод.')}</p></div>
          <button type="button" onclick="openRewardRuleForm()" class="fc-btn fc-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i>${tr('Yaratish', 'Создать')}</button>
        </div>
        <div class="space-y-2">${rows}</div>
      </div>`;
      renderPageShell(container, tr("Avtomatik sovg'a kodlari", 'Автоматические промокоды'), body, { onBack: "openMarketingHubPage()" });
    }
    function openRewardRuleForm(id) {
      const existing = id ? rewardRuleList.find(r => String(r.id) === String(id)) : null;
      rewardRuleDraft = existing ? {
        id: existing.id, triggerType: existing.triggerType, thresholdAmount: existing.thresholdAmount,
        rewardType: existing.rewardType, rewardValue: existing.rewardValue, codeExpiryDays: existing.codeExpiryDays || '',
        isActive: existing.isActive,
      } : { id: null, triggerType: 'ORDER_TOTAL', thresholdAmount: '', rewardType: 'PERCENT', rewardValue: '', codeExpiryDays: '', isActive: true };
      renderRewardRuleFormSheet();
    }
    function closeRewardRuleForm() {
      const root = document.getElementById('fc-reward-rule-form-root');
      if (root) root.remove();
      rewardRuleDraft = null;
    }
    function setRewardRuleDraftTrigger(type) { rewardRuleDraft.triggerType = type; renderRewardRuleFormSheet(); }
    function setRewardRuleDraftType(type) { rewardRuleDraft.rewardType = type; renderRewardRuleFormSheet(); }
    function renderRewardRuleFormSheet() {
      let root = document.getElementById('fc-reward-rule-form-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-reward-rule-form-root'; document.body.appendChild(root); }
      const d = rewardRuleDraft;
      const isEdit = !!d.id;
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeRewardRuleForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${isEdit ? tr('Qoidani tahrirlash', 'Изменить правило') : tr('Yangi qoida', 'Новое правило')}</div><button type="button" onclick="closeRewardRuleForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <div class="fc-mini-field"><span>${tr('Qanday hisoblansin', 'Как считать')}</span><div class="fc-tabs">
              <button type="button" onclick="setRewardRuleDraftTrigger('ORDER_TOTAL')" class="fc-tab ${d.triggerType === 'ORDER_TOTAL' ? 'fc-tab-active' : ''}">${tr('Bitta buyurtma', 'Один заказ')}</button>
              <button type="button" onclick="setRewardRuleDraftTrigger('LIFETIME_TOTAL')" class="fc-tab ${d.triggerType === 'LIFETIME_TOTAL' ? 'fc-tab-active' : ''}">${tr('Umumiy xarid', 'Общая сумма')}</button>
            </div></div>
            <p class="text-[10px] text-gray-400">${d.triggerType === 'ORDER_TOTAL' ? tr('Har safar shu summadan katta buyurtma bo\'lganda beriladi.', 'Выдаётся каждый раз при заказе на такую сумму.') : tr('Mijozning BUTUN vaqt davomidagi jami xaridi shu summaga yetsa, FAQAT BIR MARTA beriladi.', 'Выдаётся ОДИН РАЗ, когда общая сумма покупок клиента достигает этой суммы.')}</p>
            <label class="fc-mini-field"><span>${tr('Chegara summasi', 'Пороговая сумма')}</span><input type="number" id="reward-f-threshold" value="${escapeHtml(String(d.thresholdAmount))}" min="1" placeholder="5000000"></label>
            <div class="fc-mini-field"><span>${tr('Sovg\'a turi', 'Тип награды')}</span><div class="fc-tabs">
              <button type="button" onclick="setRewardRuleDraftType('PERCENT')" class="fc-tab ${d.rewardType === 'PERCENT' ? 'fc-tab-active' : ''}">${tr('Foiz (%)', 'Процент (%)')}</button>
              <button type="button" onclick="setRewardRuleDraftType('FIXED')" class="fc-tab ${d.rewardType === 'FIXED' ? 'fc-tab-active' : ''}">${tr("Aniq summa (so'm)", 'Фикс. сумма (сум)')}</button>
            </div></div>
            <label class="fc-mini-field"><span>${d.rewardType === 'PERCENT' ? tr('Sovg\'a foizi', 'Процент награды') : tr("Sovg'a summasi (so'm)", 'Сумма награды (сум)')}</span><input type="number" id="reward-f-value" value="${escapeHtml(String(d.rewardValue))}" min="1" ${d.rewardType === 'PERCENT' ? 'max="100"' : ''}></label>
            <label class="fc-mini-field"><span>${tr('Kod necha kun amal qiladi (ixtiyoriy)', 'Сколько дней действует код (необязательно)')}</span><input type="number" id="reward-f-expiry" value="${escapeHtml(String(d.codeExpiryDays))}" min="1" placeholder="${tr('Cheklovsiz', 'Без ограничений')}"></label>
            <div class="flex items-center justify-between p-1"><span class="text-xs font-bold text-gray-600">${tr('Faol', 'Активен')}</span><span class="fc-toggle"><input type="checkbox" id="reward-f-active" ${d.isActive ? 'checked' : ''}><span class="fc-toggle-track"></span></span></div>
          </div>
          <div class="fc-sheet-footer"><button type="button" onclick="saveRewardRuleForm()" class="fc-btn fc-btn-primary w-full" ${rewardRuleSaving ? 'disabled' : ''}>${rewardRuleSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Saqlash', 'Сохранить')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function saveRewardRuleForm() {
      if (rewardRuleSaving) return;
      const d = rewardRuleDraft;
      const thresholdAmount = Number(document.getElementById('reward-f-threshold')?.value);
      if (!Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return alert(tr("To'g'ri summa kiriting.", 'Введите корректную сумму.'));
      const rewardValue = Number(document.getElementById('reward-f-value')?.value);
      if (!Number.isFinite(rewardValue) || rewardValue <= 0) return alert(tr("Sovg'a qiymatini kiriting.", 'Введите значение награды.'));
      rewardRuleSaving = true;
      renderRewardRuleFormSheet();
      const payload = {
        triggerType: d.triggerType, thresholdAmount, rewardType: d.rewardType, rewardValue,
        codeExpiryDays: document.getElementById('reward-f-expiry')?.value || null,
        isActive: !!document.getElementById('reward-f-active')?.checked,
      };
      try {
        if (d.id) await callApi('reward_rule_update', { id: d.id, ...payload });
        else await callApi('reward_rule_create', payload);
        closeRewardRuleForm();
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1500);
        await loadRewardRuleListLazy(true);
      } catch (e) {
        alert(tr("Saqlab bo'lmadi.", 'Не удалось сохранить.'));
      } finally {
        rewardRuleSaving = false;
      }
    }
    async function deleteRewardRuleAt(id) {
      const ok = await fcConfirm(tr("Qoidani o'chirish", 'Удалить правило'), tr("Bu qoida butunlay o'chiriladi (allaqachon berilgan kodlarga ta'sir qilmaydi).", 'Это правило будет удалено (не влияет на уже выданные коды).'));
      if (!ok) return;
      try {
        await callApi('reward_rule_delete', { id });
        await loadRewardRuleListLazy(true);
        showActionToast(tr("O'chirildi", 'Удалена'), 'success', 1500);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    // ==================== MARKETING HUB (item 31: bitta kirish nuqtasi) ====================
    function openMarketingHubPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('MARKETING_HUB', 'nav-profile');
    }
    function renderMarketingHubPage(container) {
      const items = [
        { icon: 'image', title: tr('Bannerlar', 'Баннеры'), onclick: 'openBannersPage()' },
        { icon: 'package', title: tr('Aksiyalar', 'Акции'), onclick: 'openBundlesPage()' },
        { icon: 'trending-up', title: tr('Bosqichli chegirma', 'Ступенчатые скидки'), onclick: 'openDiscountTiersPage()' },
        { icon: 'ticket-percent', title: tr('Promo-kodlar', 'Промокоды'), onclick: 'openPromoPage()' },
        { icon: 'gift', title: tr("Avtomatik sovg'a kodlari", 'Автоматические промокоды'), onclick: 'openRewardRulesPage()' },
        { icon: 'layout-grid', title: tr('Bosh sahifa kataloglari', 'Каталоги на главной'), onclick: 'openFeaturedCategoriesPage()' },
      ];
      const body = `<div class="space-y-2">
        ${items.map(it => `
          <button type="button" onclick="${it.onclick}" class="fc-card w-full flex items-center justify-between text-left">
            <span class="font-bold flex items-center gap-2 text-xs"><i data-lucide="${it.icon}" class="w-4 h-4"></i>${it.title}</span>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
          </button>
        `).join('')}
      </div>`;
      renderPageShell(container, tr('Marketing', 'Маркетинг'), body);
    }

    function openPromoPage() {
      if (!(isUserAnAdmin && isAdminMode)) return;
      openPage('PROMO_CODES', 'nav-profile');
      loadPromoListLazy();
    }

    async function loadPromoListLazy(force = false) {
      if (!isUserAnAdmin || promoListLoading || (promoListLoaded && !force)) return;
      promoListLoading = true;
      if (activePage === 'PROMO_CODES') render();
      try {
        const data = await callApi('promo_list', {});
        promoList = data.promotions || [];
        promoListLoaded = true;
      } catch (e) {
        console.error("Promo-kodlarni yuklashda xatolik:", e);
      } finally {
        promoListLoading = false;
        if (activePage === 'PROMO_CODES') render();
      }
    }

    function promoStatusBadge(p) {
      const now = Date.now();
      if (!p.isActive) return `<span class="fc-badge fc-badge-muted">${tr("Nofaol", "Неактивен")}</span>`;
      if (p.endsAt && new Date(p.endsAt).getTime() < now) return `<span class="fc-badge fc-badge-muted">${tr("Muddati tugagan", "Истёк")}</span>`;
      if (p.startsAt && new Date(p.startsAt).getTime() > now) return `<span class="fc-badge fc-badge-warning">${tr("Hali boshlanmagan", "Ещё не начался")}</span>`;
      if (p.usageLimit && p.usedCount >= p.usageLimit) return `<span class="fc-badge fc-badge-muted">${tr("Limit tugagan", "Лимит исчерпан")}</span>`;
      return `<span class="fc-badge fc-badge-success">${tr("Faol", "Активен")}</span>`;
    }

    function promoDiscountLabel(p) {
      return p.discountType === 'PERCENT' ? `${formatNumber(p.discountValue)}%` : money(p.discountValue);
    }

    function renderPromoPage(container) {
      const rows = promoListLoading && !promoListLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
        : promoList.length ? promoList.map(p => `
          <div class="fc-card space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5"><span class="font-mono font-black text-sm">${escapeHtml(p.code)}</span>${promoStatusBadge(p)}</div>
                <p class="text-xs text-gray-600 mt-0.5">${escapeHtml(p.name)} · <b>${promoDiscountLabel(p)}</b> ${tr('chegirma', 'скидка')}</p>
              </div>
              <span class="fc-toggle shrink-0"><input type="checkbox" ${p.isActive ? 'checked' : ''} onchange="togglePromoActive('${p.id}', this.checked)"><span class="fc-toggle-track"></span></span>
            </div>
            <p class="text-[10px] text-gray-400">${tr('Ishlatilgan', 'Использован')}: ${p.usedCount || 0}${p.usageLimit ? ` / ${p.usageLimit}` : ''}${p.minOrderAmount ? ` · ${tr('Min buyurtma', 'Мин. заказ')}: ${money(p.minOrderAmount)}` : ''}</p>
            <div class="flex gap-2 pt-1">
              <button type="button" onclick="openPromoForm('${p.id}')" class="fc-btn fc-btn-secondary flex-1"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>${tr("Tahrirlash", "Изменить")}</button>
              <button type="button" onclick="deletePromoAt('${p.id}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", "Удалить")}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
          </div>
        `).join('') : `<div class="fc-empty-state"><i data-lucide="ticket-percent" class="w-7 h-7"></i><p>${tr("Hozircha promo-kod yo'q.", "Промокодов пока нет.")}</p></div>`;

      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Promo-kodlar', 'Промокоды')}</h3><p>${tr("Mijozlar checkout paytida kod kiritib chegirma olishlari mumkin.", "Клиенты смогут ввести код при оформлении и получить скидку.")}</p></div>
          <button type="button" onclick="openPromoForm()" class="fc-btn fc-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i>${tr("Promo qo'shish", "Добавить")}</button>
        </div>
        <div class="space-y-2">${rows}</div>
      </div>`;
      renderPageShell(container, tr('Promo-kodlar', 'Промокоды'), body, { onBack: "openMarketingHubPage()" });
    }

    function openPromoForm(id) {
      const existing = id ? promoList.find(p => String(p.id) === String(id)) : null;
      promoDraft = existing ? {
        id: existing.id, code: existing.code, name: existing.name, discountType: existing.discountType,
        discountValue: existing.discountValue, minOrderAmount: existing.minOrderAmount,
        startsAt: existing.startsAt ? existing.startsAt.slice(0, 10) : '', endsAt: existing.endsAt ? existing.endsAt.slice(0, 10) : '',
        usageLimit: existing.usageLimit, perCustomerLimit: existing.perCustomerLimit, isActive: existing.isActive,
      } : { code: '', name: '', discountType: 'PERCENT', discountValue: '', minOrderAmount: '', startsAt: '', endsAt: '', usageLimit: '', perCustomerLimit: '', isActive: true };
      renderPromoFormSheet();
    }

    function closePromoForm() {
      const root = document.getElementById('fc-promo-form-root');
      if (root) root.remove();
      promoDraft = null;
    }

    function setPromoDraftType(type) {
      promoDraft.discountType = type;
      renderPromoFormSheet();
    }

    function renderPromoFormSheet() {
      let root = document.getElementById('fc-promo-form-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'fc-promo-form-root';
        document.body.appendChild(root);
      }
      const d = promoDraft;
      const isEdit = !!d.id;
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closePromoForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${isEdit ? tr("Promo-kodni tahrirlash", "Изменить промокод") : tr("Yangi promo-kod", "Новый промокод")}</div><button type="button" onclick="closePromoForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <label class="fc-mini-field"><span>${tr('Nomi', 'Название')}</span><input type="text" id="promo-f-name" value="${escapeHtml(d.name)}" placeholder="${tr('Masalan: Yozgi aksiya', 'Например: Летняя акция')}" maxlength="120"></label>
            <label class="fc-mini-field"><span>${tr('Kod', 'Код')}</span><input type="text" id="promo-f-code" value="${escapeHtml(d.code)}" placeholder="YOZGI20" maxlength="40" style="text-transform:uppercase" ${isEdit ? 'disabled' : ''}></label>
            <div class="fc-mini-field"><span>${tr('Chegirma turi', 'Тип скидки')}</span><div class="fc-tabs">
              <button type="button" onclick="setPromoDraftType('PERCENT')" class="fc-tab ${d.discountType === 'PERCENT' ? 'fc-tab-active' : ''}">${tr('Foiz (%)', 'Процент (%)')}</button>
              <button type="button" onclick="setPromoDraftType('FIXED')" class="fc-tab ${d.discountType === 'FIXED' ? 'fc-tab-active' : ''}">${tr("Aniq summa (so'm)", "Фикс. сумма (сум)")}</button>
            </div></div>
            <label class="fc-mini-field"><span>${d.discountType === 'PERCENT' ? tr('Chegirma foizi', 'Процент скидки') : tr("Chegirma summasi (so'm)", "Сумма скидки (сум)")}</span><input type="number" id="promo-f-value" value="${escapeHtml(String(d.discountValue ?? ''))}" min="1" ${d.discountType === 'PERCENT' ? 'max="100"' : ''} placeholder="${d.discountType === 'PERCENT' ? '20' : '50000'}"></label>
            <label class="fc-mini-field"><span>${tr("Minimal buyurtma summasi (ixtiyoriy)", "Мин. сумма заказа (необязательно)")}</span><input type="number" id="promo-f-min" value="${escapeHtml(String(d.minOrderAmount ?? ''))}" min="0" placeholder="${tr('Cheklovsiz', 'Без ограничений')}"></label>
            <div class="grid grid-cols-2 gap-2">
              <label class="fc-mini-field"><span>${tr('Boshlanish sanasi', 'Дата начала')}</span><input type="date" id="promo-f-starts" value="${escapeHtml(d.startsAt || '')}"></label>
              <label class="fc-mini-field"><span>${tr('Tugash sanasi', 'Дата окончания')}</span><input type="date" id="promo-f-ends" value="${escapeHtml(d.endsAt || '')}"></label>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="fc-mini-field"><span>${tr('Umumiy limit', 'Общий лимит')}</span><input type="number" id="promo-f-usagelimit" value="${escapeHtml(String(d.usageLimit ?? ''))}" min="1" placeholder="${tr('Cheklovsiz', 'Без ограничений')}"></label>
              <label class="fc-mini-field"><span>${tr('Mijoz uchun limit', 'Лимит на клиента')}</span><input type="number" id="promo-f-customerlimit" value="${escapeHtml(String(d.perCustomerLimit ?? ''))}" min="1" placeholder="${tr('Cheklovsiz', 'Без ограничений')}"></label>
            </div>
            <div class="flex items-center justify-between p-1"><span class="text-xs font-bold text-gray-600">${tr('Faol', 'Активен')}</span><span class="fc-toggle"><input type="checkbox" id="promo-f-active" ${d.isActive ? 'checked' : ''}><span class="fc-toggle-track"></span></span></div>
          </div>
          <div class="fc-sheet-footer">
            <button type="button" onclick="savePromoForm()" class="fc-btn fc-btn-primary w-full" ${promoSaving ? 'disabled' : ''}>${promoSaving ? tr('Saqlanmoqda...', 'Сохранение...') : tr('Saqlash', 'Сохранить')}</button>
          </div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }

    function promoSaveErrorMessage(code) {
      const map = {
        invalid_code: tr("Kod faqat lotin harflari, raqam, - va _ dan iborat bo'lsin (2-40 belgi).", "Код должен состоять только из латинских букв, цифр, - и _ (2-40 символов)."),
        promo_code_taken: tr("Bu kod allaqachon band.", "Этот код уже занят."),
        invalid_name: tr("Nomini to'g'ri kiriting.", "Введите корректное название."),
        invalid_discount_value: tr("Chegirma qiymati noto'g'ri.", "Некорректное значение скидки."),
        invalid_percent: tr("Foiz 100 dan oshmasligi kerak.", "Процент не может быть больше 100."),
        invalid_date_range: tr("Tugash sanasi boshlanish sanasidan oldin bo'lmasin.", "Дата окончания не может быть раньше даты начала."),
      };
      return map[code] || tr("Saqlab bo'lmadi. Qaytadan urinib ko'ring.", "Не удалось сохранить. Попробуйте ещё раз.");
    }

    async function savePromoForm() {
      if (promoSaving) return;
      const name = document.getElementById('promo-f-name')?.value.trim();
      const code = document.getElementById('promo-f-code')?.value.trim().toUpperCase();
      const discountValue = document.getElementById('promo-f-value')?.value;
      if (!name) return alert(tr("Nomini kiriting.", "Введите название."));
      if (!promoDraft.id && !code) return alert(tr("Kodni kiriting.", "Введите код."));
      if (!discountValue || Number(discountValue) <= 0) return alert(tr("Chegirma qiymatini kiriting.", "Введите значение скидки."));
      promoSaving = true;
      renderPromoFormSheet();
      const payload = {
        name, discountType: promoDraft.discountType, discountValue: Number(discountValue),
        minOrderAmount: document.getElementById('promo-f-min')?.value || null,
        startsAt: document.getElementById('promo-f-starts')?.value || null,
        endsAt: document.getElementById('promo-f-ends')?.value || null,
        usageLimit: document.getElementById('promo-f-usagelimit')?.value || null,
        perCustomerLimit: document.getElementById('promo-f-customerlimit')?.value || null,
        isActive: !!document.getElementById('promo-f-active')?.checked,
      };
      try {
        if (promoDraft.id) await callApi('promo_update', { id: promoDraft.id, ...payload });
        else await callApi('promo_create', { code, ...payload });
        closePromoForm();
        showActionToast(tr('Saqlandi', 'Сохранено'), 'success', 1500);
        await loadPromoListLazy(true);
      } catch (e) {
        alert(promoSaveErrorMessage(e?.details?.error || e?.message));
      } finally {
        promoSaving = false;
      }
    }

    async function togglePromoActive(id, checked) {
      try {
        await callApi('promo_update', { id, isActive: checked });
        const item = promoList.find(p => String(p.id) === String(id));
        if (item) item.isActive = checked;
        render();
      } catch (e) {
        alert(tr("O'zgartirib bo'lmadi.", "Не удалось изменить."));
        render();
      }
    }

    async function deletePromoAt(id) {
      const ok = await fcConfirm(tr("Promo-kodni o'chirish", "Удалить промокод"), tr("Agar bu kod ishlatilgan bo'lsa, faqat nofaol qilinadi (tarix saqlanadi).", "Если код уже использовался, он будет просто деактивирован (история сохранится)."));
      if (!ok) return;
      try {
        const result = await callApi('promo_delete', { id });
        await loadPromoListLazy(true);
        showActionToast(result.deactivatedInsteadOfDeleted ? tr('Nofaol qilindi', 'Деактивирован') : tr("O'chirildi", 'Удалён'), 'success', 1500);
      } catch (e) {
        alert(tr("O'chirib bo'lmadi.", "Не удалось удалить."));
      }
    }

    // Bu — ESKI, platforma bosh admin uchun do'kon-provisioning oqimi
    // (add_admin/remove_admin, shop_memberships.role='OWNER'). Admin Roles &
    // Permissions round bunga UMUMAN TEGMAYDI — faqat "Xodimlar" nomi/route'i
    // endi YANGI (do'kon egasi boshqaradigan) tizimga berilgani uchun bu
    // eski sahifa "Platforma adminlari" deb qayta nomlandi.
    function openPlatformAdminsPage() {
      if (!(isSuperAdmin && isAdminMode)) return;
      openPage('PLATFORM_ADMINS', 'nav-profile');
      loadAdminsLazy();
    }

    function renderPlatformAdminsPage(container) {
      if (!(isSuperAdmin && isAdminMode)) {
        renderPageShell(container, tr('Platforma adminlari', 'Администраторы платформы'), `<div class="fc-empty-state"><i data-lucide="shield-alert" class="w-7 h-7"></i><p>${tr("Bu bo'lim faqat Bosh Admin uchun.", 'Этот раздел доступен только главному администратору.')}</p></div>`);
        return;
      }
      const rows = adminsLoading && !adminsLoaded
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
        : adminsList.map(admId => {
            const isOwner = String(admId) === String(currentTgId);
            return `<div class="fc-staff-row">
              <div class="fc-staff-avatar"><i data-lucide="${isOwner ? 'crown' : 'user-round'}" class="w-4 h-4"></i></div>
              <div class="min-w-0 flex-1">
                <div class="fc-staff-name">${isOwner ? tr('Bosh Admin', 'Главный администратор') : tr('Admin', 'Администратор')}</div>
                <div class="fc-staff-id">ID: ${escapeHtml(String(admId))}</div>
              </div>
              ${isOwner ? `<span class="fc-badge fc-badge-warning">${tr('Bosh Admin', 'Главный')}</span>` : `<button type="button" onclick="removeAdmin('${escapeHtml(String(admId))}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", 'Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
            </div>`;
          }).join('');
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Platforma adminlari', 'Администраторы платформы')}</h3><p>${tr("Do'kon darajasidagi OWNER'larni qo'shish/olib tashlash (provisioning). Xodimlar/rollar uchun 'Xodimlar' bo'limiga qarang.", 'Добавление/удаление OWNER на уровне магазина (провижининг). Для сотрудников/ролей см. раздел «Сотрудники».')}</p></div>
          <button type="button" onclick="activePopupModal='ADD_ADMIN'; render();" class="fc-btn fc-btn-primary"><i data-lucide="user-plus" class="w-4 h-4"></i>${tr("Admin qo'shish", 'Добавить')}</button>
        </div>
        <div class="fc-card p-0 overflow-hidden"><div class="fc-staff-list">${rows || `<div class="fc-empty-state"><p>${tr('Adminlar topilmadi.', 'Администраторы не найдены.')}</p></div>`}</div></div>
      </div>`;
      renderPageShell(container, tr('Platforma adminlari', 'Администраторы платформы'), body);
    }

    // ==================== XODIMLAR / ROLLAR (Admin Roles & Permissions, 2.3/2.4/2.5-bosqich) ====================
    // Do'kon egasi (OWNER) yoki 'staff.manage' huquqi bor xodim boshqaradi.
    // Owner qatoriga (rol/blok/o'chirish) BU SAHIFADAN tegib bo'lmaydi —
    // himoya backendda (2.3-bosqich), frontend faqat shu qatorlarni yashiradi.

    function staffMemberLabel(m) {
      return m.name || (m.username ? '@' + m.username : ('ID: ' + m.tgId));
    }

    async function loadStaffListLazy(force = false) {
      if (staffListLoading || (staffListLoaded && !force)) return;
      staffListLoading = true;
      if (activePage === 'STAFF') render();
      try {
        const data = await callApi('staff_list', {});
        staffList = data.staff || [];
        staffPendingInvites = data.pendingInvites || [];
        staffListLoaded = true;
      } catch (e) {
        console.error('Xodimlar ro\'yxatini yuklashda xatolik:', e);
      } finally {
        staffListLoading = false;
        if (activePage === 'STAFF') render();
      }
    }

    async function loadRolesLazy(force = false) {
      if (rolesLoading || (rolesLoaded && !force)) return;
      rolesLoading = true;
      if (activePage === 'ROLES') render();
      try {
        const data = await callApi('role_list', {});
        roleList = data.roles || [];
        allPermissions = data.permissions || [];
        rolesLoaded = true;
      } catch (e) {
        console.error('Rollarni yuklashda xatolik:', e);
      } finally {
        rolesLoading = false;
        if (activePage === 'ROLES') render();
      }
    }

    function openStaffPage() {
      if (!(staffRole === 'OWNER' || hasPermission('staff.manage'))) return;
      openPage('STAFF', 'nav-profile');
      loadStaffListLazy();
      loadRolesLazy();
    }

    function openRolesPage() {
      if (!(staffRole === 'OWNER' || hasPermission('staff.manage'))) return;
      openPage('ROLES', 'nav-profile');
      loadRolesLazy();
    }

    function renderStaffPage(container) {
      if (!(staffRole === 'OWNER' || hasPermission('staff.manage'))) {
        renderPageShell(container, tr('Xodimlar', 'Сотрудники'), `<div class="fc-empty-state"><i data-lucide="shield-alert" class="w-7 h-7"></i><p>${tr("Bu bo'limga kirish huquqingiz yo'q.", 'У вас нет доступа к этому разделу.')}</p></div>`);
        return;
      }
      const rows = (staffListLoading && !staffListLoaded)
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
        : staffList.map(m => `
          <button type="button" onclick="openStaffDetail('${escapeHtml(m.tgId)}')" class="fc-staff-row w-full text-left">
            <div class="fc-staff-avatar"><i data-lucide="${m.role === 'OWNER' ? 'crown' : 'user-round'}" class="w-4 h-4"></i></div>
            <div class="min-w-0 flex-1">
              <div class="fc-staff-name">${escapeHtml(staffMemberLabel(m))}${m.status === 'DISABLED' ? ` <span class="fc-badge fc-badge-muted">${tr('bloklangan', 'заблокирован')}</span>` : ''}</div>
              <div class="flex flex-wrap gap-1 mt-1">
                ${m.role === 'OWNER'
                  ? `<span class="fc-badge fc-badge-warning">Owner</span>`
                  : (m.roles.length ? m.roles.map(r => `<span class="fc-badge fc-badge-primary">${escapeHtml(r.name)}</span>`).join('') : `<span class="fc-badge fc-badge-muted">${tr("rol yo'q", 'нет роли')}</span>`)}
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 shrink-0"></i>
          </button>
        `).join('');
      const invitesHtml = staffPendingInvites.length ? `
        <div class="fc-card space-y-2">
          <b class="text-xs">${tr('Kutilayotgan takliflar', 'Ожидающие приглашения')}</b>
          ${staffPendingInvites.map(i => `
            <div class="flex items-center justify-between gap-2 text-xs">
              <span>${escapeHtml(i.username ? '@' + i.username : 'ID: ' + i.tgId)}</span>
              <button type="button" onclick="cancelStaffInvite('${escapeHtml(i.id)}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr('Bekor qilish', 'Отменить')}"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            </div>`).join('')}
        </div>` : '';
      const transferHtml = (staffRole === 'OWNER') ? `
        <button type="button" onclick="openTransferOwnershipSheet()" class="fc-card w-full flex items-center justify-between text-left">
          <span class="font-bold flex items-center gap-2 text-xs"><i data-lucide="crown" class="w-4 h-4"></i>${tr('Egalikni topshirish', 'Передать право собственности')}</span>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
        </button>` : '';
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Xodimlar', 'Сотрудники')}</h3><p>${tr("Xodim qo'shing, rol tayinlang — huquqlar avtomatik qo'llanadi.", 'Добавляйте сотрудников и назначайте роли — права применяются автоматически.')}</p></div>
          <button type="button" onclick="openStaffInviteForm()" class="fc-btn fc-btn-primary"><i data-lucide="user-plus" class="w-4 h-4"></i>${tr("Xodim qo'shish", 'Добавить')}</button>
        </div>
        <button type="button" onclick="openRolesPage()" class="fc-card w-full flex items-center justify-between text-left">
          <span class="font-bold flex items-center gap-2 text-xs"><i data-lucide="shield" class="w-4 h-4"></i>${tr('Rollar', 'Роли')}</span>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
        </button>
        ${invitesHtml}
        <div class="fc-card p-0 overflow-hidden"><div class="fc-staff-list">${rows || `<div class="fc-empty-state"><p>${tr('Xodimlar topilmadi.', 'Сотрудники не найдены.')}</p></div>`}</div></div>
        ${transferHtml}
      </div>`;
      renderPageShell(container, tr('Xodimlar', 'Сотрудники'), body);
    }

    function openStaffDetail(tgId) {
      loadRolesLazy().then(renderStaffDetailSheet);
      renderStaffDetailSheet(tgId);
      window.__fcStaffDetailTgId = tgId;
    }
    function closeStaffDetail() {
      const root = document.getElementById('fc-staff-detail-root');
      if (root) root.remove();
      window.__fcStaffDetailTgId = null;
    }
    function renderStaffDetailSheet(tgId) {
      const targetTgId = tgId || window.__fcStaffDetailTgId;
      if (!targetTgId) return;
      const m = staffList.find(x => x.tgId === targetTgId);
      if (!m) return;
      let root = document.getElementById('fc-staff-detail-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-staff-detail-root'; document.body.appendChild(root); }
      const isOwnerRow = m.role === 'OWNER';
      const currentRoleIds = new Set(m.roles.map(r => String(r.id)));
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeStaffDetail();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${escapeHtml(staffMemberLabel(m))}</div><button type="button" onclick="closeStaffDetail()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            ${m.phone ? `<p class="text-xs text-gray-500">${tr('Telefon', 'Телефон')}: ${escapeHtml(m.phone)}</p>` : ''}
            <p class="text-xs text-gray-400">ID: ${escapeHtml(m.tgId)}</p>
            ${isOwnerRow ? `
              <div class="fc-bg-danger-soft border fc-border-danger p-3 rounded-xl text-xs fc-text-danger">${tr("Bu — do'kon egasi. Rollar/bloklash/o'chirish bu yerdan ishlamaydi.", 'Это владелец магазина. Роли/блокировка/удаление отсюда недоступны.')}</div>
            ` : `
              <div class="space-y-1.5">
                <b class="text-xs text-gray-600">${tr('Rollar', 'Роли')}</b>
                ${roleList.map(r => `
                  <label class="flex items-center justify-between px-3 py-2 border rounded-xl text-xs font-bold">
                    <span>${escapeHtml(r.name)}</span>
                    <input type="checkbox" data-role-id="${escapeHtml(String(r.id))}" ${currentRoleIds.has(String(r.id)) ? 'checked' : ''}>
                  </label>`).join('') || `<p class="text-xs text-gray-400">${tr("Hali rol yaratilmagan.", 'Роли ещё не созданы.')}</p>`}
              </div>
              <button type="button" onclick="saveStaffRoles('${escapeHtml(m.tgId)}')" class="fc-btn fc-btn-primary w-full">${tr('Rollarni saqlash', 'Сохранить роли')}</button>
              <div class="grid grid-cols-2 gap-2 pt-2">
                <button type="button" onclick="toggleStaffBlocked('${escapeHtml(m.tgId)}', ${m.status !== 'DISABLED'})" class="fc-btn fc-btn-secondary">${m.status === 'DISABLED' ? tr('Blokdan chiqarish', 'Разблокировать') : tr('Bloklash', 'Заблокировать')}</button>
                <button type="button" onclick="removeStaffMember('${escapeHtml(m.tgId)}')" class="fc-btn fc-btn-danger">${tr("O'chirish", 'Удалить')}</button>
              </div>
            `}
          </div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function saveStaffRoles(tgId) {
      const roleIds = [...document.querySelectorAll('#fc-staff-detail-root [data-role-id]:checked')].map(el => el.dataset.roleId);
      if (!roleIds.length) { alert(tr('Kamida bitta rol tanlang.', 'Выберите хотя бы одну роль.')); return; }
      try {
        await callApi('staff_update_roles', { telegramUserId: tgId, roleIds });
        closeStaffDetail();
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1500);
        await loadStaffListLazy(true);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }
    async function toggleStaffBlocked(tgId, blocked) {
      try {
        await callApi('staff_set_blocked', { telegramUserId: tgId, blocked });
        closeStaffDetail();
        await loadStaffListLazy(true);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }
    async function removeStaffMember(tgId) {
      const ok = await fcConfirm(tr("Xodimni o'chirish", 'Удалить сотрудника'), tr("Bu xodim do'kondan olib tashlanadi. Davom etasizmi?", 'Этот сотрудник будет удалён из магазина. Продолжить?'));
      if (!ok) return;
      try {
        await callApi('staff_remove', { telegramUserId: tgId });
        closeStaffDetail();
        await loadStaffListLazy(true);
        showActionToast(tr("O'chirildi", 'Удалён'), 'success', 1500);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    function openStaffInviteForm() {
      loadRolesLazy().then(renderStaffInviteSheet);
      renderStaffInviteSheet();
    }
    function closeStaffInviteForm() {
      const root = document.getElementById('fc-staff-invite-root');
      if (root) root.remove();
    }
    function renderStaffInviteSheet() {
      let root = document.getElementById('fc-staff-invite-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-staff-invite-root'; document.body.appendChild(root); }
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeStaffInviteForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr("Xodim qo'shish", 'Добавить сотрудника')}</div><button type="button" onclick="closeStaffInviteForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <label class="fc-mini-field"><span>Telegram ID</span><input type="text" id="staff-invite-tgid" inputmode="numeric" placeholder="123456789"></label>
            <label class="fc-mini-field"><span>Username (${tr('ixtiyoriy', 'необязательно')})</span><input type="text" id="staff-invite-username" placeholder="username"></label>
            <div class="space-y-1.5">
              <b class="text-xs text-gray-600">${tr('Rollar', 'Роли')}</b>
              ${roleList.map(r => `
                <label class="flex items-center justify-between px-3 py-2 border rounded-xl text-xs font-bold">
                  <span>${escapeHtml(r.name)}</span>
                  <input type="checkbox" data-invite-role-id="${escapeHtml(String(r.id))}">
                </label>`).join('') || `<p class="text-xs text-gray-400">${tr("Avval kamida bitta rol yarating.", 'Сначала создайте хотя бы одну роль.')}</p>`}
            </div>
          </div>
          <div class="fc-sheet-footer"><button type="button" id="staff-invite-submit-btn" onclick="submitStaffInvite()" class="fc-btn fc-btn-primary w-full">${tr('Taklif yuborish', 'Отправить приглашение')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    let staffInviteSubmitting = false;
    async function submitStaffInvite() {
      if (staffInviteSubmitting) return; // shop takomillashtirish, 9-band: qo'sh-bosishning oldini olish
      const tgIdVal = (document.getElementById('staff-invite-tgid')?.value || '').trim();
      const username = (document.getElementById('staff-invite-username')?.value || '').trim();
      const roleIds = [...document.querySelectorAll('#fc-staff-invite-root [data-invite-role-id]:checked')].map(el => el.dataset.inviteRoleId);
      if (!/^\d+$/.test(tgIdVal)) { alert(tr("To'g'ri Telegram ID kiriting.", 'Введите корректный Telegram ID.')); return; }
      if (!roleIds.length) { alert(tr('Kamida bitta rol tanlang.', 'Выберите хотя бы одну роль.')); return; }
      staffInviteSubmitting = true;
      const btn = document.getElementById('staff-invite-submit-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = `<span class="fc-spinner fc-spinner-xs"></span> ${tr('Yuborilmoqda...', 'Отправка...')}`; }
      try {
        await callApi('staff_invite', { telegramUserId: tgIdVal, username, roleIds });
        closeStaffInviteForm();
        showActionToast(tr('✅ Taklif yuborildi', '✅ Приглашение отправлено'), 'success', 1800);
        await loadStaffListLazy(true);
      } catch (e) {
        const code = e?.details?.error;
        const msg = code === 'already_a_member' ? tr("Bu foydalanuvchi allaqachon a'zo.", 'Этот пользователь уже участник.')
          : code === 'invite_already_pending' ? tr('Bu foydalanuvchiga allaqachon taklif yuborilgan.', 'Этому пользователю уже отправлено приглашение.')
          : code === 'invalid_tg_id' ? tr("To'g'ri Telegram ID kiriting.", 'Введите корректный Telegram ID.')
          : tr("Yuborib bo'lmadi.", 'Не удалось отправить.');
        alert(msg);
      } finally {
        staffInviteSubmitting = false;
        const btnEl = document.getElementById('staff-invite-submit-btn');
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = tr('Taklif yuborish', 'Отправить приглашение'); }
      }
    }
    async function cancelStaffInvite(inviteId) {
      try {
        await callApi('staff_cancel_invite', { inviteId });
        await loadStaffListLazy(true);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    function openTransferOwnershipSheet() {
      if (staffRole !== 'OWNER') return;
      let root = document.getElementById('fc-transfer-ownership-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-transfer-ownership-root'; document.body.appendChild(root); }
      const staffOnly = staffList.filter(m => m.role === 'STAFF' && m.status === 'ACTIVE');
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeTransferOwnershipSheet();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Egalikni topshirish', 'Передать право собственности')}</div><button type="button" onclick="closeTransferOwnershipSheet()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <div class="fc-bg-danger-soft border fc-border-danger p-3 rounded-xl text-xs fc-text-danger">${tr("Diqqat: bu amaldan keyin siz do'konning to'liq boshqaruvini yo'qotasiz.", 'Внимание: после этого действия вы потеряете полный контроль над магазином.')}</div>
            ${staffOnly.length ? `
              <label class="fc-mini-field"><span>${tr('Yangi egasi', 'Новый владелец')}</span>
                <select id="transfer-target-tgid" class="w-full p-2 border rounded-xl text-xs">${staffOnly.map(m => `<option value="${escapeHtml(m.tgId)}">${escapeHtml(staffMemberLabel(m))}</option>`).join('')}</select>
              </label>
              <label class="flex items-center gap-2 text-xs font-bold"><input type="checkbox" id="transfer-confirm-checkbox">${tr('Tushundim, davom etaman', 'Я понимаю, продолжить')}</label>
            ` : `<p class="text-xs text-gray-400">${tr("Egalikni topshirish uchun avval xodim qo'shing.", 'Чтобы передать право собственности, сначала добавьте сотрудника.')}</p>`}
          </div>
          ${staffOnly.length ? `<div class="fc-sheet-footer"><button type="button" onclick="submitTransferOwnership()" class="fc-btn fc-btn-danger w-full">${tr('Egalikni topshirish', 'Передать')}</button></div>` : ''}
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    function closeTransferOwnershipSheet() {
      const root = document.getElementById('fc-transfer-ownership-root');
      if (root) root.remove();
    }
    async function submitTransferOwnership() {
      const target = document.getElementById('transfer-target-tgid')?.value;
      const confirmed = document.getElementById('transfer-confirm-checkbox')?.checked;
      if (!target || !confirmed) { alert(tr('Tasdiqlash katagini belgilang.', 'Отметьте флажок подтверждения.')); return; }
      const ok = await fcConfirm(tr('Oxirgi tasdiq', 'Последнее подтверждение'), tr("Rostdan ham egalikni topshirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.", 'Вы точно хотите передать право собственности? Это действие необратимо.'));
      if (!ok) return;
      try {
        await callApi('transfer_ownership', { toTelegramUserId: target, oldOwnerNewRole: 'STAFF' });
        closeTransferOwnershipSheet();
        showActionToast(tr('✅ Egalik topshirildi', '✅ Право передано'), 'success', 2000);
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    function permissionGroupLabel(prefix) {
      const map = {
        catalog: tr('Katalog', 'Каталог'), products: tr('Mahsulotlar', 'Товары'), stock: tr('Ombor', 'Склад'),
        orders: tr('Buyurtmalar', 'Заказы'), customers: tr('Mijozlar', 'Клиенты'), support: tr('Support', 'Поддержка'),
        reports: tr('Hisobotlar', 'Отчёты'), marketing: tr('Marketing', 'Маркетинг'), shop: tr("Do'kon", 'Магазин'),
        staff: tr('Xodimlar', 'Сотрудники'),
      };
      return map[prefix] || prefix;
    }
    // Shop takomillashtirish: Rollar sahifasida admin xom "stock.manage" kabi
    // kod-nomlarni emas, tushunarli o'zbekcha/ruscha nomlarni ko'rishi kerak.
    function permissionLabel(perm) {
      const map = {
        'catalog.manage': tr('Katalog boshqaruvi', 'Управление каталогом'),
        'products.manage': tr('Mahsulotlarni tahrirlash', 'Редактирование товаров'),
        'products.import_export': tr('Excel import/eksport', 'Импорт/экспорт Excel'),
        'stock.view': tr('Ombor holatini ko\'rish', 'Просмотр склада'),
        'stock.manage': tr('Qoldiqni o\'zgartirish (kirim)', 'Изменение остатков (приход)'),
        'orders.view': tr('Buyurtmalarni ko\'rish', 'Просмотр заказов'),
        'orders.manage': tr('Buyurtmalarni boshqarish', 'Управление заказами'),
        'customers.view': tr('Mijozlarni ko\'rish', 'Просмотр клиентов'),
        'customers.manage': tr('Mijozlarni boshqarish (bloklash)', 'Управление клиентами'),
        'support.manage': tr('Murojaatlarga javob berish', 'Ответы на обращения'),
        'reports.view': tr('Hisobotlarni ko\'rish', 'Просмотр отчётов'),
        'marketing.manage': tr('Marketing (promo, banner)', 'Маркетинг (промо, баннеры)'),
        'shop.settings.manage': tr("Do'kon sozlamalari", 'Настройки магазина'),
        'integrations.manage': tr('Integratsiyalar (Billz, Click)', 'Интеграции (Billz, Click)'),
        'staff.manage': tr('Xodimlarni boshqarish', 'Управление сотрудниками'),
      };
      return map[perm] || perm;
    }

    function renderRolesPage(container) {
      if (!(staffRole === 'OWNER' || hasPermission('staff.manage'))) {
        renderPageShell(container, tr('Rollar', 'Роли'), `<div class="fc-empty-state"><i data-lucide="shield-alert" class="w-7 h-7"></i><p>${tr("Bu bo'limga kirish huquqingiz yo'q.", 'У вас нет доступа к этому разделу.')}</p></div>`);
        return;
      }
      const rows = (rolesLoading && !rolesLoaded)
        ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
        : roleList.map(r => `
          <div class="fc-card space-y-1.5">
            <div class="flex items-center justify-between">
              <b class="text-xs">${escapeHtml(r.name)}${r.isSystem ? ` <span class="fc-badge fc-badge-muted">${tr('standart', 'стандартная')}</span>` : ''}</b>
              <span class="text-[10px] text-gray-400">${r.usedCount} ${tr('kishi', 'чел.')}</span>
            </div>
            <p class="text-[10px] text-gray-400">${r.permissions.length} ${tr('huquq', 'прав')}</p>
            <div class="flex gap-2">
              <button type="button" onclick="openRoleForm('${escapeHtml(String(r.id))}')" class="fc-btn fc-btn-secondary flex-1"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>${tr('Tahrirlash', 'Изменить')}</button>
              ${!r.isSystem ? `<button type="button" onclick="deleteRoleAt('${escapeHtml(String(r.id))}')" class="fc-btn fc-btn-icon fc-btn-danger" aria-label="${tr("O'chirish", 'Удалить')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
            </div>
          </div>
        `).join('');
      const body = `<div class="space-y-3">
        <div class="fc-card fc-staff-intro">
          <div><h3>${tr('Rollar', 'Роли')}</h3><p>${tr('Standart rollarni tahrirlang yoki yangi rol yarating.', 'Редактируйте стандартные роли или создайте новую.')}</p></div>
          <button type="button" onclick="openRoleForm()" class="fc-btn fc-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i>${tr('Yaratish', 'Создать')}</button>
        </div>
        <div class="space-y-2">${rows || `<div class="fc-empty-state"><p>${tr('Rollar topilmadi.', 'Роли не найдены.')}</p></div>`}</div>
      </div>`;
      renderPageShell(container, tr('Rollar', 'Роли'), body, { onBack: "openStaffPage()" });
    }

    function openRoleForm(id) {
      const existing = id ? roleList.find(r => String(r.id) === String(id)) : null;
      roleDraft = existing
        ? { id: existing.id, name: existing.name, permissions: [...existing.permissions], isSystem: existing.isSystem }
        : { id: null, name: '', permissions: [], isSystem: false };
      renderRoleFormSheet();
    }
    function closeRoleForm() {
      const root = document.getElementById('fc-role-form-root');
      if (root) root.remove();
      roleDraft = null;
    }
    function toggleRoleDraftPermission(perm) {
      if (!roleDraft) return;
      const idx = roleDraft.permissions.indexOf(perm);
      if (idx >= 0) roleDraft.permissions.splice(idx, 1); else roleDraft.permissions.push(perm);
    }
    function renderRoleFormSheet() {
      let root = document.getElementById('fc-role-form-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-role-form-root'; document.body.appendChild(root); }
      const d = roleDraft;
      if (!d) { root.innerHTML = ''; return; }
      const groups = {};
      allPermissions.forEach(p => { const g = p.split('.')[0]; (groups[g] = groups[g] || []).push(p); });
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeRoleForm();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${d.id ? tr('Rolni tahrirlash', 'Изменить роль') : tr('Yangi rol', 'Новая роль')}</div><button type="button" onclick="closeRoleForm()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-3">
            <label class="fc-mini-field"><span>${tr('Nomi', 'Название')}</span><input type="text" id="role-f-name" value="${escapeHtml(d.name)}" maxlength="60"></label>
            ${Object.entries(groups).map(([g, perms]) => `
              <div class="space-y-1">
                <b class="text-[10px] uppercase text-gray-400">${permissionGroupLabel(g)}</b>
                ${perms.map(p => `
                  <label class="flex items-center justify-between px-3 py-2 border rounded-xl text-xs font-bold">
                    <span>${escapeHtml(permissionLabel(p))}</span>
                    <span class="fc-toggle"><input type="checkbox" ${d.permissions.includes(p) ? 'checked' : ''} onchange="toggleRoleDraftPermission('${p}')"><span class="fc-toggle-track"></span></span>
                  </label>`).join('')}
              </div>
            `).join('')}
          </div>
          <div class="fc-sheet-footer"><button type="button" onclick="saveRoleForm()" class="fc-btn fc-btn-primary w-full">${tr('Saqlash', 'Сохранить')}</button></div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function saveRoleForm() {
      const name = (document.getElementById('role-f-name')?.value || '').trim();
      if (!name) { alert(tr('Nomini kiriting.', 'Введите название.')); return; }
      const d = roleDraft;
      try {
        if (d.id) await callApi('role_update', { id: d.id, name, permissions: d.permissions });
        else await callApi('role_create', { name, permissions: d.permissions });
        closeRoleForm();
        showActionToast(tr('✅ Saqlandi', '✅ Сохранено'), 'success', 1500);
        await loadRolesLazy(true);
      } catch (e) {
        alert(tr("Saqlab bo'lmadi.", 'Не удалось сохранить.'));
      }
    }
    async function deleteRoleAt(id) {
      const ok = await fcConfirm(tr('Rolni o\'chirish', 'Удалить роль'), tr("Agar bu roldan foydalanilayotgan bo'lsa, xodimlardan olib tashlanadi.", 'Если роль используется, она будет снята с сотрудников.'));
      if (!ok) return;
      try {
        await callApi('role_delete', { id });
        await loadRolesLazy(true);
        showActionToast(tr("O'chirildi", 'Удалена'), 'success', 1500);
      } catch (e) {
        const code = e?.details?.error;
        if (code === 'role_in_use') {
          const count = e.details.usedCount || 0;
          const ok2 = await fcConfirm(tr('Rol ishlatilmoqda', 'Роль используется'), tr(`Bu rol ${count} ta xodimga tayinlangan. Baribir o'chirilsinmi?`, `Эта роль назначена ${count} сотрудникам. Всё равно удалить?`));
          if (ok2) {
            try {
              await callApi('role_delete', { id, force: true });
              await loadRolesLazy(true);
              showActionToast(tr("O'chirildi", 'Удалена'), 'success', 1500);
            } catch (e2) {
              showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
            }
          }
        } else {
          showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
        }
      }
    }

    function renderPendingInviteBannerHtml() {
      if (!pendingStaffInvite) return '';
      return `<button type="button" onclick="openPendingInviteSheet()" class="w-full bg-blue-50 border border-blue-200 p-3 rounded-2xl text-xs font-bold text-blue-900 shadow-sm flex items-center justify-between">
        <span class="flex items-center gap-2"><i data-lucide="user-plus" class="w-4 h-4"></i>${tr('Sizni jamoaga taklif qilishdi', 'Вас пригласили в команду')}</span>
        <i data-lucide="chevron-right" class="w-4 h-4"></i>
      </button>`;
    }
    function openPendingInviteSheet() {
      if (!pendingStaffInvite) return;
      let root = document.getElementById('fc-pending-invite-root');
      if (!root) { root = document.createElement('div'); root.id = 'fc-pending-invite-root'; document.body.appendChild(root); }
      root.innerHTML = `<div class="fc-sheet-overlay">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Jamoaga taklif', 'Приглашение в команду')}</div></div>
          <div class="fc-sheet-body space-y-3">
            <p class="text-xs text-gray-600">${tr("Sizni ushbu do'kon jamoasiga taklif qilishdi. Qabul qilsangiz, tayinlangan huquqlar bilan xodim bo'lasiz.", 'Вас пригласили в команду этого магазина. Если примете, станете сотрудником с назначенными правами.')}</p>
          </div>
          <div class="fc-sheet-footer flex gap-2">
            <button type="button" onclick="respondToPendingInvite(false)" class="fc-btn fc-btn-secondary flex-1">${tr('Rad etish', 'Отклонить')}</button>
            <button type="button" onclick="respondToPendingInvite(true)" class="fc-btn fc-btn-primary flex-1">${tr('Qabul qilish', 'Принять')}</button>
          </div>
        </div>
      </div>`;
      if (window.lucide) lucide.createIcons();
    }
    async function respondToPendingInvite(accept) {
      const root = document.getElementById('fc-pending-invite-root');
      if (root) root.remove();
      const inviteId = pendingStaffInvite?.id;
      if (!inviteId) return;
      try {
        await callApi('staff_invite_respond', { inviteId, accept });
        pendingStaffInvite = null;
        if (accept) {
          showActionToast(tr('✅ Qabul qilindi! Ilova qayta yuklanadi...', '✅ Принято! Приложение перезагрузится...'), 'success', 1800);
          setTimeout(() => location.reload(), 1200);
        } else {
          showActionToast(tr('Rad etildi', 'Отклонено'), 'success', 1500);
          render();
        }
      } catch (e) {
        showActionToast(tr('❌ Amalga oshmadi', '❌ Не удалось'), 'error', 1500);
      }
    }

    function shopLocationQuery() {
      const coords = String(shopContact.coordinates || '').trim();
      const address = String((uiLang === 'ru' && shopContact.addressRu) ? shopContact.addressRu : (shopContact.address || '')).trim();
      return { coords, address };
    }

    function buildShopMapUrls() {
      const { coords, address } = shopLocationQuery();
      if (coords) {
        const parts = coords.split(',').map(v => v.trim());
        if (parts.length === 2) {
          const lat = encodeURIComponent(parts[0]);
          const lon = encodeURIComponent(parts[1]);
          return {
            google: `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`,
            yandex: `https://yandex.com/maps/?pt=${lon}%2C${lat}&z=16&l=map`,
          };
        }
      }
      const q = encodeURIComponent(address);
      return {
        google: `https://www.google.com/maps/search/?api=1&query=${q}`,
        yandex: `https://yandex.com/maps/?text=${q}`,
      };
    }

    function openShopLocationChooser() {
      const { coords, address } = shopLocationQuery();
      if (!coords && !address) return;
      const urls = buildShopMapUrls();
      const old = document.getElementById('fc-map-sheet-root');
      if (old) old.remove();
      const root = document.createElement('div');
      root.id = 'fc-map-sheet-root';
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeShopLocationChooser();">
        <div class="fc-sheet fc-map-choice-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div><div class="fc-sheet-title">${tr('Xaritada ochish', 'Открыть на карте')}</div><p class="fc-shop-info-subtitle">${escapeHtml(address || coords)}</p></div><button type="button" onclick="closeShopLocationChooser()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-2">
            <button type="button" onclick="openSafeExternalUrl('${escapeHtml(urls.google)}'); closeShopLocationChooser();" class="fc-map-choice-row"><span class="fc-map-choice-icon"><i data-lucide="map" class="w-5 h-5"></i></span><span><b>Google Maps</b><small>${tr('Google xaritasida ochish', 'Открыть в Google Maps')}</small></span><i data-lucide="external-link" class="w-4 h-4"></i></button>
            <button type="button" onclick="openSafeExternalUrl('${escapeHtml(urls.yandex)}'); closeShopLocationChooser();" class="fc-map-choice-row"><span class="fc-map-choice-icon"><i data-lucide="navigation" class="w-5 h-5"></i></span><span><b>Yandex Maps</b><small>${tr('Yandex xaritasida ochish', 'Открыть в Яндекс Картах')}</small></span><i data-lucide="external-link" class="w-4 h-4"></i></button>
          </div>
        </div>
      </div>`;
      document.body.appendChild(root);
      lucide.createIcons();
    }

    function closeShopLocationChooser() {
      const root = document.getElementById('fc-map-sheet-root');
      if (root) root.remove();
    }

    // Mahsulot belgisi (Yangi/Top/Tavsiya/Aksiya) — bitta mahsulotga faqat bittasi.
    function openProductBadgePicker(productId) {
      const p = products.find(x => x.id === productId);
      if (!p) return;
      const old = document.getElementById('fc-badge-sheet-root');
      if (old) old.remove();
      const root = document.createElement('div');
      root.id = 'fc-badge-sheet-root';
      const options = [null, 'NEW', 'TOP', 'RECOMMENDED', 'PROMO'];
      root.innerHTML = `<div class="fc-sheet-overlay" onclick="if(event.target===this) closeProductBadgePicker();">
        <div class="fc-sheet">
          <div class="fc-sheet-handle"></div>
          <div class="fc-sheet-header"><div class="fc-sheet-title">${tr('Mahsulot belgisi', 'Метка товара')}</div><button type="button" onclick="closeProductBadgePicker()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
          <div class="fc-sheet-body space-y-2">
            ${options.map(opt => `<button type="button" onclick="setProductBadge('${productId}', ${opt ? `'${opt}'` : 'null'})" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold ${p.badge === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}"><span>${opt ? escapeHtml(productBadgeLabel(opt)) : tr("Yo'q", 'Нет')}</span>${p.badge === opt ? '<i data-lucide="check" class="w-4 h-4"></i>' : ''}</button>`).join('')}
          </div>
        </div>
      </div>`;
      document.body.appendChild(root);
      if (window.lucide) lucide.createIcons();
    }
    function closeProductBadgePicker() {
      const root = document.getElementById('fc-badge-sheet-root');
      if (root) root.remove();
    }
    async function setProductBadge(productId, badge) {
      closeProductBadgePicker();
      try {
        await callApi('edit_product_field', { productId, field: 'badge', value: badge });
        const p = products.find(x => x.id === productId);
        if (p) p.badge = badge;
        if (selectedProductModal?.id === productId) selectedProductModal.badge = badge;
        render();
      } catch (e) {
        showActionToast(tr("❌ Amalga oshmadi", "❌ Не удалось"), 'error', 1500);
      }
    }

    function renderProfile(container) {
      const phones = [shopContact.phone, shopContact.phone2, shopContact.phone3].filter(Boolean);
      const instagramNick = cleanSocialNick(shopContact.instagram);
      const telegramNick = cleanSocialNick(shopContact.telegram);
      const facebookNick = cleanSocialNick(shopContact.facebook);
      const { coords, address } = shopLocationQuery();
      const locationAvailable = !!(coords || address);
      const supportBadge = profileSupportNeedsBadge() ? '•' : '';

      const adminMenu = (isAdminMode && isUserAnAdmin) ? `
        <div class="fc-profile-menu">
          ${hasPermission('reports.view') ? profileMenuRowHtml({ icon: 'bar-chart-3', title: tr('Hisobotlar', 'Отчёты'), subtitle: tr("Savdo, mijozlar va mahsulotlar bo'yicha to'liq tahlil", 'Полная аналитика по продажам, клиентам и товарам'), onclick: "openReportsPage()" }) : ''}
          ${profileMenuRowHtml({ icon: 'megaphone', title: tr('Marketing', 'Маркетинг'), subtitle: tr('Bannerlar, aksiyalar, promo-kodlar, chegirmalar', 'Баннеры, акции, промокоды, скидки'), onclick: 'openMarketingHubPage()' })}
          ${profileMenuRowHtml({ icon: 'shopping-cart', title: tr('Tashlab ketilgan savatlar', 'Брошенные корзины'), subtitle: tr("Buyurtma bermagan mijozlarning savatlari", 'Корзины клиентов, не оформивших заказ'), onclick: 'openAbandonedCartsPage()' })}
          ${(staffRole === 'OWNER' || hasPermission('staff.manage')) ? profileMenuRowHtml({ icon: 'users-round', title: tr('Xodimlar', 'Сотрудники'), subtitle: tr("Xodim qo'shish, rol va huquqlarni boshqarish", 'Добавление сотрудников, управление ролями и правами'), onclick: 'openStaffPage()' }) : ''}
          ${profileMenuRowHtml({ icon: 'messages-square', title: tr("Qo'llab-quvvatlash", 'Поддержка'), subtitle: tr('Murojaatlar va yozishmalar', 'Обращения и переписка'), onclick: 'openAdminSupportOrUserSupport()', badge: supportBadge })}
        </div>` : '';

      const userQuick = !(isAdminMode && isUserAnAdmin) ? `
        <div class="grid grid-cols-2 gap-2">
          <button onclick="openPage('FAVORITES','nav-profile')" class="fc-card flex items-center gap-2 text-left"><i data-lucide="heart" class="w-5 h-5 fc-text-danger shrink-0"></i><span class="font-bold text-xs">${tr('Sevimlilar', 'Избранное')}</span></button>
          <button onclick="openPage('RECENT','nav-profile')" class="fc-card flex items-center gap-2 text-left"><i data-lucide="history" class="w-5 h-5 text-blue-500 shrink-0"></i><span class="font-bold text-xs">${tr('Yaqinda ko‘rilgan', 'Недавно просмотренные')}</span></button>
        </div>
        <div class="fc-profile-menu">
          ${profileMenuRowHtml({ icon: 'gift', title: tr('Aksiyalar va chegirmalar', 'Акции и скидки'), subtitle: tr('Joriy aksiyalar va promo-kodlar', 'Текущие акции и промокоды'), onclick: "openCampaignsPage()" })}
          ${profileMenuRowHtml({ icon: 'messages-square', title: tr("Qo'llab-quvvatlash", 'Поддержка'), subtitle: tr('Savol yoki muammo bo‘yicha yozish', 'Написать по вопросу или проблеме'), onclick: 'openAdminSupportOrUserSupport()', badge: supportBadge })}
        </div>` : '';

      container.innerHTML = `
        <div class="space-y-4">
          <section class="fc-profile-card">
            <div class="fc-profile-avatar">${currentProfileAvatarHtml()}</div>
            <div class="fc-profile-copy">
              <div class="fc-profile-eyebrow">${tr("Profil ma'lumotlari", 'Данные профиля')}</div>
              <h2>${escapeHtml(currentProfileDisplayName())}</h2>
              ${currentUser.username ? `<p class="fc-profile-username">@${escapeHtml(currentUser.username)}</p>` : ''}
              ${currentUser.phone && currentUser.phone !== '+998' ? `<p class="fc-profile-phone">${escapeHtml(currentUser.phone)}</p>` : ''}
            </div>
            <button type="button" onclick="activePopupModal='REGISTRATION'; render();" class="fc-btn fc-btn-icon fc-profile-edit" title="${tr("Ma'lumotlarni tahrirlash", 'Изменить данные')}"><i data-lucide="pencil" class="w-4 h-4"></i></button>
          </section>

          ${renderPendingInviteBannerHtml()}
          <div class="fc-card fc-textzoom-card">
            <div class="fc-textzoom-head"><div><p class="text-xs font-bold text-gray-700">${tr('Matn hajmi', 'Размер текста')}</p><small>${tr('Faqat yozuvlar o‘lchami o‘zgaradi', 'Меняется только размер текста')}</small></div><div class="fc-textzoom-symbols"><i data-lucide="zoom-out" class="w-4 h-4"></i><i data-lucide="zoom-in" class="w-4 h-4"></i></div></div>
            <div class="fc-textzoom-row">${[-2,-1,0,1,2].map(lvl => `<button type="button" onclick="setTextZoom(${lvl})" class="fc-textzoom-opt ${textZoomLevel===lvl?'is-active':''}" aria-label="${lvl===0?tr('Odatiy','Обычный'):lvl}"><span>${lvl>0?`+${lvl}`:lvl}</span></button>`).join('')}</div>
          </div>
          ${adminMenu}
          ${userQuick}

          ${myStatus.isBlocked ? `<div class="fc-bg-danger-soft border fc-border-danger p-4 rounded-2xl text-xs"><p class="font-bold fc-text-danger">${tr("Siz botdan foydalanish huquqidan mahrum qilingansiz", "Доступ к оформлению заказов заблокирован")}</p><p class="fc-text-danger mt-1">${tr("Sabab", "Причина")}: ${escapeHtml(myStatus.blockReason || tr("ko'rsatilmagan", "не указана"))}</p></div>` : myStatus.isWarned ? `<div class="bg-amber-50 border border-amber-300 p-4 rounded-2xl text-xs"><p class="font-bold text-amber-800">${tr("Sizga ogohlantirish berilgan", "Вам вынесено предупреждение")}</p><p class="text-amber-700 mt-1">${tr("Sabab", "Причина")}: ${escapeHtml(myStatus.warnReason || tr("ko'rsatilmagan", "не указана"))}</p></div>` : ''}

          <section class="shop-about-card fc-shop-public-card">
            <div class="fc-shop-public-head">
              <div class="min-w-0 flex-1"><div class="fc-shop-public-eyebrow">${tr("Do'kon ma'lumotlari", 'Данные магазина')}</div><h3>${escapeHtml(shopDisplayName())}</h3></div>
              ${(isUserAnAdmin && isAdminMode) ? `<button onclick="openShopInfoModal()" class="fc-btn fc-btn-secondary fc-shop-public-edit"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>${tr("Tahrirlash", "Изменить")}</button>` : ''}
            </div>

            <div class="fc-shop-contact-list">
              ${address ? `<button type="button" ${locationAvailable ? 'onclick="openShopLocationChooser()"' : ''} class="fc-shop-contact-row ${locationAvailable ? 'is-clickable' : ''}"><span class="fc-shop-contact-icon"><i data-lucide="map-pin" class="w-4 h-4"></i></span><span class="fc-shop-contact-value">${escapeHtml(address)}</span>${locationAvailable ? `<i data-lucide="chevron-right" class="w-4 h-4 fc-shop-contact-chevron"></i>` : '<span></span>'}</button>` : (coords ? `<button type="button" onclick="openShopLocationChooser()" class="fc-shop-contact-row is-clickable"><span class="fc-shop-contact-icon"><i data-lucide="map-pin" class="w-4 h-4"></i></span><span class="fc-shop-contact-value">${tr('Xaritada joylashuvni ko‘rish','Посмотреть расположение на карте')}</span><i data-lucide="chevron-right" class="w-4 h-4 fc-shop-contact-chevron"></i></button>` : '')}
              ${shopContact.workHours ? `<div class="fc-shop-contact-row"><span class="fc-shop-contact-icon"><i data-lucide="clock-3" class="w-4 h-4"></i></span><span class="fc-shop-contact-value">${escapeHtml(shopContact.workHours)}</span><span></span></div>` : ''}
              ${phones.map(phone => `<a href="tel:${escapeHtml(String(phone).replace(/[^\d+]/g, ''))}" class="fc-shop-contact-row is-clickable"><span class="fc-shop-contact-icon"><i data-lucide="phone" class="w-4 h-4"></i></span><span class="fc-shop-contact-value">${escapeHtml(phone)}</span><span></span></a>`).join('')}
            </div>

            ${(instagramNick || telegramNick || facebookNick) ? `<div class="fc-shop-social-actions">
              ${instagramNick ? `<a href="https://instagram.com/${encodeURIComponent(instagramNick)}" target="_blank" class="fc-shop-social-chip" title="Instagram"><span class="fc-shop-social-chip-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" ry="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"></circle></svg></span><span>Instagram</span></a>` : ''}
              ${telegramNick ? `<a href="https://t.me/${encodeURIComponent(telegramNick)}" target="_blank" class="fc-shop-social-chip" title="Telegram"><span class="fc-shop-social-chip-icon"><i data-lucide="send" class="w-4 h-4"></i></span><span>Telegram</span></a>` : ''}
              ${facebookNick ? `<a href="https://facebook.com/${encodeURIComponent(facebookNick)}" target="_blank" class="fc-shop-social-chip" title="Facebook"><span class="fc-shop-social-chip-icon"><i data-lucide="globe-2" class="w-4 h-4"></i></span><span>Facebook</span></a>` : ''}
            </div>` : ''}

            ${shopInfoIsEmpty() ? `<p class="text-[11px] text-gray-400 text-center py-2">${(isUserAnAdmin && isAdminMode) ? tr("Do'kon ma'lumotlarini Tahrirlash orqali kiriting.", "Заполните данные магазина через Изменить.") : ''}</p>` : ''}
          </section>
        </div>`;
    }

    function readShopContactFormValues() {
      const value = id => String(document.getElementById(id)?.value || '').trim() || null;
      return {
        name: value('sc-name'),
        address: value('sc-address'),
        addressRu: value('sc-address-ru'),
        coordinates: value('sc-coordinates'),
        workHours: value('sc-work-hours'),
        phone: value('sc-phone1'),
        phone2: value('sc-phone2'),
        phone3: value('sc-phone3'),
        instagram: cleanSocialNick(value('sc-instagram')) || null,
        telegram: cleanSocialNick(value('sc-telegram')) || null,
        facebook: cleanSocialNick(value('sc-facebook')) || null,
      };
    }

    function clearShopLogoDraft() {
      if (shopLogoDraft?.previewUrl && String(shopLogoDraft.previewUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(shopLogoDraft.previewUrl); } catch (_) {}
      }
      shopLogoDraft = null;
      shopLogoPreparing = false;
    }

    function shopInfoLogoPreviewUrl() {
      if (shopLogoDraft?.kind === 'file') return shopLogoDraft.previewUrl || '';
      if (shopLogoDraft?.kind === 'url') return shopLogoDraft.url || '';
      return shopLogoUrl || '';
    }

    function openShopInfoModal() {
      shopInfoDraft = null;
      clearShopLogoDraft();
      activePopupModal = 'SHOP_INFO';
      render();
    }

    function closeShopInfoModal() {
      shopInfoDraft = null;
      clearShopLogoDraft();
      activePopupModal = null;
      render();
    }

    // URL orqali logo kiritish eski imkoniyat sifatida saqlanadi. SHOP_INFO'dan
    // kirilganda formadagi hali saqlanmagan qiymatlar draftga olinadi va orqaga
    // qaytganda tiklanadi.
    function openShopLogoUrlFromShopInfo() {
      shopInfoDraft = readShopContactFormValues();
      activePopupModal = 'SHOP_LOGO_URL';
      render();
    }

    function closeShopLogoUrlModal() {
      activePopupModal = shopInfoDraft ? 'SHOP_INFO' : null;
      render();
    }

    function setShopInfoLogoPreparing(isPreparing) {
      shopLogoPreparing = !!isPreparing;
      const preview = document.getElementById('shop-info-logo-preview');
      if (preview && shopLogoPreparing) {
        preview.innerHTML = `<div class="fc-shop-logo-loading"><span class="fc-spinner"></span><small>${tr('Tayyorlanmoqda...', 'Подготовка...')}</small></div>`;
      }
      const status = document.getElementById('shop-info-logo-status');
      if (status && shopLogoPreparing) status.textContent = tr('Rasm tayyorlanmoqda...', 'Изображение подготавливается...');
      document.querySelectorAll('.fc-shop-logo-action').forEach(btn => { btn.disabled = shopLogoPreparing; });
      const saveBtn = document.getElementById('shop-info-save-btn');
      if (saveBtn) saveBtn.disabled = shopLogoPreparing;
      if (window.lucide) lucide.createIcons();
    }

    function updateShopInfoLogoPreview(url) {
      const preview = document.getElementById('shop-info-logo-preview');
      if (preview) {
        preview.innerHTML = url
          ? `<img src="${escapeHtml(url)}" alt="${tr('Do\'kon logotipi', 'Логотип магазина')}" class="fc-shop-logo-image">`
          : `<div class="fc-shop-logo-placeholder"><i data-lucide="image" class="w-6 h-6"></i></div>`;
      }
      const status = document.getElementById('shop-info-logo-status');
      if (status) status.textContent = shopLogoDraft
        ? tr('Yangi logo tanlandi — Saqlashni bosing', 'Новый логотип выбран — нажмите Сохранить')
        : (url ? tr('Logo o‘rnatilgan', 'Логотип установлен') : tr('Logo hali qo‘shilmagan', 'Логотип ещё не добавлен'));
      const buttonLabel = document.getElementById('shop-info-logo-button-label');
      if (buttonLabel) buttonLabel.textContent = tr('Xotiradan yuklash', 'Загрузить с устройства');
      document.querySelectorAll('.fc-shop-logo-action').forEach(btn => { btn.disabled = false; });
      const saveBtn = document.getElementById('shop-info-save-btn');
      if (saveBtn) saveBtn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }

    async function saveShopContact() {
      const next = readShopContactFormValues();

      if (next.coordinates && !/^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/.test(next.coordinates)) {
        return alert(tr("Kordinatani '41.217408,69.211225' ko'rinishida yozing.", "Введите координаты в формате '41.217408,69.211225'."));
      }

      // Logo fayli tanlangan bo'lsa, avval Storage'ga tayyor URL olinadi, lekin
      // set_shop_logo faqat pastdagi umumiy Saqlash bosilgandan keyin chaqiriladi.
      let nextLogoUrl = shopLogoUrl || null;
      try {
        showActionToast(tr("⏳ Do'kon ma'lumotlari saqlanmoqda...", '⏳ Данные магазина сохраняются...'), 'saving');
        if (shopLogoDraft?.kind === 'file' && shopLogoDraft.file) {
          nextLogoUrl = await uploadImageSnapshot({ file: shopLogoDraft.file, preparing: Promise.resolve(shopLogoDraft.file), url: null }, shopLogoUrl, true);
        } else if (shopLogoDraft?.kind === 'url') {
          nextLogoUrl = shopLogoDraft.url || null;
        }

        // Optimistic render QILINMAYDI: ikkala server amali muvaffaqiyatli bo'lgachgina
        // profil/header yangilanadi. Shunda Bekor qilish va xato holatlari toza qoladi.
        await callApi('set_shop_contact', next);
        if (shopLogoDraft) await callApi('set_shop_logo', { logoUrl: nextLogoUrl });

        shopContact = { ...next, startMessage: shopContact.startMessage };
        if (shopLogoDraft) shopLogoUrl = nextLogoUrl;
        shopInfoDraft = null;
        clearShopLogoDraft();
        activePopupModal = null;
        render();
        showActionToast(tr('✅ Do‘kon ma’lumotlari saqlandi', '✅ Данные магазина сохранены'), 'success', 1400);
      } catch (e) {
        console.error(e);
        showActionToast(tr('❌ Ma’lumotlar saqlanmadi', '❌ Данные не сохранены'), 'error', 1800);
        alert(tr("❌ Do'kon ma'lumotlarini saqlab bo'lmadi: ", "❌ Не удалось сохранить данные магазина: ") + (e.message || e));
      }
    }

    // 1.11: boshqa rasm oqimlaridagi (yangi tovar/tahrirlash/Rasmsiz queue)
    // kabi bir xil barqaror pipeline: baytlar avval mustaqil nusxalanadi,
    // vaqtinchalik File obyektiga (upload tugagunicha) keyin ishonilmaydi.
    // 6-band: header logotipiga bosilganda ochiladigan yagona logotip
    // boshqaruvi — Galereya + Fayl + URL, uchtasi ham bitta joyda (5-band:
    // logotip ham boshqa rasm joylari kabi Galereya+Fayl ikkalasiga ega
    // bo'lishi kerak edi, avval faqat Galereya bor edi).
    function openShopLogoManager() {
      activePopupModal = 'SHOP_LOGO_MANAGER';
      render();
    }

    async function saveShopLogoFromPicker(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const editingInsideShopInfo = activePopupModal === 'SHOP_INFO';
      imageIO.logStage('FILE_SELECTED', { mime: file.type, size: file.size });
      try { validatePickedImageFile(file); }
      catch (e) {
        event.target.value = '';
        return alert(pickedImageErrorMessage(e, file));
      }

      if (editingInsideShopInfo) setShopInfoLogoPreparing(true);
      let prepared;
      try {
        prepared = await captureAndPrepareImageV2(file, TARGET_PRODUCT_IMAGE_BYTES, 1000, 0.8);
      } catch (e) {
        console.error('[logo:READ_ORIGINAL_FAILED]', e);
        if (editingInsideShopInfo) {
          shopLogoPreparing = false;
          updateShopInfoLogoPreview(shopInfoLogoPreviewUrl());
        }
        event.target.value = '';
        return alert(tr("Logotip faylini o'qib bo'lmadi. Qaytadan tanlab ko'ring.", "Не удалось прочитать файл логотипа. Попробуйте выбрать заново."));
      }

      if (editingInsideShopInfo) {
        // MUHIM: bu yerda serverga HECH NARSA yuborilmaydi. Faqat draft+preview.
        clearShopLogoDraft();
        const previewUrl = URL.createObjectURL(prepared);
        shopLogoDraft = { kind: 'file', file: prepared, previewUrl };
        shopLogoPreparing = false;
        updateShopInfoLogoPreview(previewUrl);
        showActionToast(tr('Logo tanlandi — Saqlashni bosing', 'Логотип выбран — нажмите Сохранить'), 'success', 1500);
        event.target.value = '';
        return;
      }

      // Legacy manager oqimi (agar qayerdadir chaqirilsa) avvalgi xulqini saqlaydi.
      const old = shopLogoUrl;
      const localPreview = URL.createObjectURL(prepared);
      shopLogoUrl = localPreview;
      render();
      showActionToast(tr('⏳ Logo yuklanmoqda...', '⏳ Логотип загружается...'), 'saving');
      try {
        const url = await uploadImageSnapshot({ file: prepared, preparing: Promise.resolve(prepared), url: null }, old, true);
        await callApi('set_shop_logo', { logoUrl: url });
        shopLogoUrl = url;
        render();
        showActionToast(tr('✅ Logo saqlandi', '✅ Логотип сохранён'), 'success', 1400);
      } catch (e) {
        console.error(e);
        shopLogoUrl = old;
        render();
        showActionToast(tr('❌ Logo saqlanmadi', '❌ Логотип не сохранён'), 'error', 1800);
        alert(tr("❌ Logotipni saqlab bo'lmadi: ", "❌ Не удалось сохранить логотип: ") + (e.message || e));
      } finally {
        URL.revokeObjectURL(localPreview);
        event.target.value = '';
      }
    }

    // 13-band: logotip uchun ham URL orqali qo'shish imkoniyati — fayl
    // pickeriga parallel, mustaqil yo'l (upload qadamiga hojat yo'q).
    async function saveShopLogoFromUrl() {
      const input = document.getElementById('shop-logo-url-input');
      const errorEl = document.getElementById('shop-logo-url-error');
      const raw = String(input?.value || '').trim();
      if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }
      let validUrl;
      try { validUrl = validateExternalImageUrl(raw); }
      catch (e) {
        if (errorEl) { errorEl.textContent = e.message || String(e); errorEl.classList.remove('hidden'); }
        return;
      }
      if (!validUrl) {
        if (errorEl) { errorEl.textContent = tr("URL kiriting.", "Введите URL."); errorEl.classList.remove('hidden'); }
        return;
      }

      if (shopInfoDraft) {
        // SHOP_INFO ichidan kelgan bo'lsa URL ham faqat draft. Real saqlash umumiy
        // Saqlash tugmasigacha kutadi.
        clearShopLogoDraft();
        shopLogoDraft = { kind: 'url', url: validUrl };
        activePopupModal = 'SHOP_INFO';
        render();
        showActionToast(tr('Logo tanlandi — Saqlashni bosing', 'Логотип выбран — нажмите Сохранить'), 'success', 1500);
        return;
      }

      const old = shopLogoUrl;
      shopLogoUrl = validUrl;
      showActionToast(tr("⏳ Logotip saqlanmoqda...", "⏳ Логотип сохраняется..."), 'saving');
      try {
        await callApi('set_shop_logo', { logoUrl: validUrl });
        activePopupModal = null;
        render();
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 1200);
      } catch (e) {
        console.error(e);
        shopLogoUrl = old;
        render();
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 1800);
        alert(tr("❌ Logotipni saqlab bo'lmadi: ", "❌ Не удалось сохранить логотип: ") + (e.message || e));
      }
    }

    async function saveLowStockThreshold() {
      const raw = Number(document.getElementById('low-stock-threshold-input')?.value);
      if (!Number.isFinite(raw) || raw < 0) return alert(tr("To'g'ri son kiriting (0 yoki undan katta).", "Введите корректное число (0 или больше)."));
      const threshold = Math.round(raw);
      const old = shopLowStockThreshold;
      shopLowStockThreshold = threshold;
      activePopupModal = null;
      render();
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохраняется..."), 'saving');
      try {
        await callApi('set_low_stock_threshold', { threshold });
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 1200);
        await loadWarehouseSummary(true);
        render();
      } catch (e) {
        console.error(e);
        shopLowStockThreshold = old;
        render();
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 1800);
        alert(tr("❌ Xatolik: ", "❌ Ошибка: ") + (e.message || e));
      }
    }

    // Billz (billz.ai) integratsiyasi, 0/1-bosqich ----------------------------
    async function openBillzSettings() {
      activePopupModal = 'BILLZ_SETTINGS';
      billzConnectionStatus = null;
      billzConfigOptions = null;
      render();
      await refreshBillzStatus();
    }
    async function refreshBillzStatus() {
      try {
        const st = await callApi('billz_get_status', {});
        billzConnectionStatus = st;
        if (st.status === 'CONNECTED') {
          try { billzConfigOptions = await callApi('billz_list_config_options', {}); }
          catch (e) { console.error(e); billzConfigOptions = { shops: [], cashboxes: [], paymentTypes: [] }; }
        }
      } catch (e) {
        console.error(e);
        billzConnectionStatus = { status: 'ERROR', lastError: e.message || String(e) };
      }
      if (activePopupModal === 'BILLZ_SETTINGS') render();
    }
    async function connectBillz() {
      const secretToken = document.getElementById('billz-secret-token-input')?.value.trim();
      if (!secretToken) return alert(tr("Kalitni kiriting.", "Введите ключ."));
      const btn = document.getElementById('billz-connect-btn');
      if (btn) { btn.disabled = true; btn.textContent = tr("Ulanmoqda...", "Подключение..."); }
      try {
        const result = await callApi('billz_connect', { secretToken });
        billzConnectionStatus = { status: 'CONNECTED', billzShopName: null, billzCashboxName: null, billzPaymentTypeName: null, lastError: null };
        billzConfigOptions = { shops: result.shops || [], cashboxes: result.cashboxes || [], paymentTypes: result.paymentTypes || [] };
        showActionToast(tr("✅ Ulandi", "✅ Подключено"), 'success', 1500);
        render();
      } catch (e) {
        console.error(e);
        alert(tr("Ulab bo'lmadi: ", "Не удалось подключить: ") + (e.message || e));
        await refreshBillzStatus();
      }
    }
    async function saveBillzSaleConfig() {
      const shopSel = document.getElementById('billz-shop-select');
      const cashboxSel = document.getElementById('billz-cashbox-select');
      const paymentSel = document.getElementById('billz-payment-type-select');
      const billzShopId = shopSel?.value || null;
      const billzCashboxId = cashboxSel?.value || null;
      const billzPaymentTypeId = paymentSel?.value || null;
      const billzShopName = billzShopId ? shopSel.options[shopSel.selectedIndex].textContent : null;
      const billzCashboxName = billzCashboxId ? cashboxSel.options[cashboxSel.selectedIndex].textContent : null;
      const billzPaymentTypeName = billzPaymentTypeId ? paymentSel.options[paymentSel.selectedIndex].textContent : null;
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохраняется..."), 'saving');
      try {
        await callApi('billz_save_sale_config', { billzShopId, billzShopName, billzCashboxId, billzCashboxName, billzPaymentTypeId, billzPaymentTypeName });
        if (billzConnectionStatus) {
          billzConnectionStatus.billzShopName = billzShopName;
          billzConnectionStatus.billzCashboxName = billzCashboxName;
          billzConnectionStatus.billzPaymentTypeName = billzPaymentTypeName;
        }
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 1200);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 1800);
        alert(tr("❌ Xatolik: ", "❌ Ошибка: ") + (e.message || e));
      }
    }
    async function disconnectBillz() {
      if (!confirm(tr("Billz ulanishini uzmoqchimisiz?", "Отключить интеграцию с Billz?"))) return;
      showActionToast(tr("⏳ ...", "⏳ ..."), 'saving');
      try {
        await callApi('billz_disconnect', {});
        billzConnectionStatus = { status: 'DISCONNECTED', billzShopName: null, billzCashboxName: null, billzPaymentTypeName: null, lastError: null };
        billzConfigOptions = null;
        showActionToast(tr("✅ Uzildi", "✅ Отключено"), 'success', 1200);
        render();
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Xatolik", "❌ Ошибка"), 'error', 1800);
        alert(e.message || String(e));
      }
    }

    // Click.uz avtomatik to'lov integratsiyasi — Billz sozlamalari bilan bir
    // xil naqsh (openBillzSettings/connectBillz/disconnectBillz nusxasi).
    async function openClickSettings() {
      activePopupModal = 'CLICK_SETTINGS';
      clickConnectionStatus = null;
      render();
      try {
        clickConnectionStatus = await callApi('click_get_status', {});
      } catch (e) {
        console.error(e);
        clickConnectionStatus = { status: 'DISCONNECTED', merchantId: null, serviceId: null };
      }
      if (activePopupModal === 'CLICK_SETTINGS') render();
    }
    async function connectClick() {
      const merchantId = document.getElementById('click-merchant-id-input')?.value.trim();
      const serviceId = document.getElementById('click-service-id-input')?.value.trim();
      const merchantUserId = document.getElementById('click-merchant-user-id-input')?.value.trim();
      const secretKey = document.getElementById('click-secret-key-input')?.value.trim();
      if (!merchantId || !serviceId || !merchantUserId || !secretKey) {
        return alert(tr("Barcha maydonlarni to'ldiring.", "Заполните все поля."));
      }
      const btn = document.getElementById('click-connect-btn');
      if (btn) { btn.disabled = true; btn.textContent = tr("Ulanmoqda...", "Подключение..."); }
      try {
        await callApi('click_connect', { merchantId, serviceId, merchantUserId, secretKey });
        clickConnectionStatus = { status: 'CONNECTED', merchantId, serviceId };
        showActionToast(tr("✅ Ulandi", "✅ Подключено"), 'success', 1500);
        render();
      } catch (e) {
        console.error(e);
        alert(tr("Ulab bo'lmadi: ", "Не удалось подключить: ") + (e.message || e));
        await openClickSettings();
      }
    }
    async function disconnectClick() {
      if (!confirm(tr("Click ulanishini uzmoqchimisiz?", "Отключить интеграцию с Click?"))) return;
      showActionToast(tr("⏳ ...", "⏳ ..."), 'saving');
      try {
        await callApi('click_disconnect', {});
        clickConnectionStatus = { status: 'DISCONNECTED', merchantId: null, serviceId: null };
        showActionToast(tr("✅ Uzildi", "✅ Отключено"), 'success', 1200);
        render();
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Xatolik", "❌ Ошибка"), 'error', 1800);
        alert(e.message || String(e));
      }
    }

    // Billz Phase 2: katalog ko'rish/import qilish -----------------------------
    // "Billz" umumiy menyusi va har katalogdagi "B" tugmasi bir xil sahifani
    // ochadi — farqi faqat billzImportTargetCategoryId oldindan to'ldirilishida
    // ("B" bosilganda hozirgi katalog, umumiy menyudan ochilganda bo'sh —
    // import tasdiqlash bosqichida qo'lda tanlanadi).
    async function openBillzBrowse(categoryId) {
      billzImportTargetCategoryId = categoryId || null;
      billzBrowseSelectedCatId = '';
      billzBrowseSearch = '';
      billzBrowseItems = [];
      billzBrowseSelectedIds = new Set();
      billzSubTab = 'IMPORT';
      openPage('BILLZ');
      if (!billzBrowseCategories) await loadBillzBrowseCategories();
      // 12-band: "B" tugmasi qaysi UStorE katalogidan bosilgan bo'lsa, shu
      // nomdagi Billz kategoriyasi (agar mos kelsa) avtomatik tanlanadi —
      // shunda ro'yxat darhol shu katalogga mos tovarlar bilan ochiladi,
      // har safar bir xil "birinchi ~30 ta" o'rniga. Bazada UStorE<->Billz
      // kategoriya bog'lanishi saqlanmaydi (Billz buni taqdim etmaydi),
      // shuning uchun nom bo'yicha taqqoslanadi; mos kelmasa "Barcha
      // kategoriyalar" holicha qoladi — admin qo'lda tanlaydi. Qidiruv
      // (billzBrowseSearch/handleBillzBrowseSearchDebounced) bunga tegilmagan.
      if (categoryId && billzBrowseCategories && billzBrowseCategories.length) {
        const uStoreCat = categories.find(c => String(c.id) === String(categoryId));
        const uStoreName = uStoreCat ? categoryName(uStoreCat).trim().toLocaleLowerCase('uz') : '';
        const match = uStoreName ? billzBrowseCategories.find(c => String(c.name || '').trim().toLocaleLowerCase('uz') === uStoreName) : null;
        if (match) billzBrowseSelectedCatId = match.id;
      }
      await loadBillzBrowseItems();
    }
    function setBillzSubTab(tab) {
      billzSubTab = tab;
      if (tab === 'DELETED' && !billzDeletedItems.length) loadBillzDeletedItems();
      if (tab === 'IMPORTED') loadBillzImportedItems();
      render();
    }
    async function loadBillzImportedItems() {
      billzImportedLoading = true;
      render();
      try {
        const result = await callApi('billz_list_imported_products', {});
        billzImportedItems = result.items || [];
        const visibleIds = new Set(billzImportedItems.map((it) => it.id));
        billzImportedSelectedIds = new Set([...billzImportedSelectedIds].filter((id) => visibleIds.has(id)));
      } catch (e) {
        console.error(e);
        alert(tr("Import qilinganlar ro'yxatini yuklab bo'lmadi: ", "Не удалось загрузить список импортированных: ") + (e.message || e));
        billzImportedItems = [];
      } finally {
        billzImportedLoading = false;
        if (activePage === 'BILLZ') render();
      }
    }
    function toggleBillzImportedSelected(productId) {
      if (billzImportedSelectedIds.has(productId)) billzImportedSelectedIds.delete(productId);
      else billzImportedSelectedIds.add(productId);
      render();
    }
    async function unlinkSelectedBillzImports() {
      if (!billzImportedSelectedIds.size || billzUnlinking) return;
      if (!confirm(tr("Tanlangan tovarlar Billz bog'lanishidan chiqariladi (tovarning o'zi o'chirilmaydi). Davom etasizmi?", "Выбранные товары будут отвязаны от Billz (сам товар не удаляется). Продолжить?"))) return;
      billzUnlinking = true;
      render();
      try {
        await callApi('billz_unlink_products', { productIds: [...billzImportedSelectedIds] });
        billzImportedSelectedIds = new Set();
        await loadBillzImportedItems();
        showActionToast(tr("✅ Bog'lanish uzildi", "✅ Связь разорвана"), 'success', 1500);
      } catch (e) {
        console.error(e);
        alert(tr("Amalga oshmadi: ", "Не удалось: ") + (e.message || e));
      } finally {
        billzUnlinking = false;
        render();
      }
    }
    async function loadBillzDeletedItems() {
      billzDeletedLoading = true;
      render();
      try {
        const result = await callApi('billz_list_deleted_products', {});
        billzDeletedItems = result.items || [];
      } catch (e) {
        console.error(e);
        alert(tr("Ro'yxatni yuklab bo'lmadi: ", "Не удалось загрузить список: ") + (e.message || e));
        billzDeletedItems = [];
      } finally {
        billzDeletedLoading = false;
        if (activePage === 'BILLZ') render();
      }
    }
    async function restoreBillzProduct(productId) {
      try {
        await callApi('billz_restore_product', { productId });
        billzDeletedItems = billzDeletedItems.filter((it) => it.id !== productId);
        showActionToast(tr("✅ Tiklandi", "✅ Восстановлено"), 'success', 1800);
        render();
      } catch (e) {
        console.error(e);
        alert(tr("Tiklab bo'lmadi: ", "Не удалось восстановить: ") + (e.message || e));
      }
    }
    async function loadBillzBrowseCategories() {
      try {
        const result = await callApi('billz_get_categories', {});
        billzBrowseCategories = result.categories || [];
      } catch (e) {
        console.error(e);
        billzBrowseCategories = [];
      }
      if (activePage === 'BILLZ') render();
    }
    // 9-band: sahifalash — har doim BERILGAN sahifani almashtiradi (append
    // emas). requestedPage berilmasa 1-sahifadan boshlanadi.
    async function loadBillzBrowseItems(requestedPage) {
      const targetPage = requestedPage > 0 ? requestedPage : 1;
      billzBrowseLoading = true;
      render();
      try {
        // Server endi so'ralgan filtr (kategoriya/qidiruv) bo'yicha hali
        // import qilinmagan tovarlarning TO'LIQ, aniq ro'yxatini o'zi
        // hisoblab, kerakli sahifani (yoki "Barchasi" so'ralsa hammasini)
        // qaytaradi — shuning uchun "ALL" uchun mijoz tomonda qayta-qayta
        // so'rov yuborib birlashtirish shart emas (bu avvalgi versiyada
        // har safar to'liq ro'yxatni serverdan qayta-qayta so'rashga olib
        // kelardi, chunki server ham allaqachon to'liq ro'yxatni yig'ib
        // chiqadi).
        const result = await callApi('billz_browse_products', {
          billzCategoryId: billzBrowseSelectedCatId || undefined,
          search: billzBrowseSearch || undefined,
          page: targetPage,
          limit: billzBrowsePageSize === 'ALL' ? 'ALL' : billzBrowsePageSize,
        });
        billzBrowseItems = result.items || [];
        billzBrowseCount = result.count || 0;
        billzBrowsePage = billzBrowsePageSize === 'ALL' ? 1 : targetPage;
        if (result.truncated) {
          console.warn('[billz_browse] katalog xavfsizlik chegarasidan oshdi, ro\'yxat qisman bo\'lishi mumkin');
        }
        // Ekrandan g'oyib bo'lgan (masalan qidiruv o'zgargach) tovarlarning
        // tanlovini ham tozalaymiz — aks holda "tanlangan" hisoblagich
        // ko'rinmas tovarlarni ham hisoblab yuraveradi.
        const visibleIds = new Set(billzBrowseItems.map((it) => it.billzProductId));
        billzBrowseSelectedIds = new Set([...billzBrowseSelectedIds].filter((id) => visibleIds.has(id)));
      } catch (e) {
        console.error(e);
        alert(tr("Billz'dan tovarlarni yuklab bo'lmadi: ", "Не удалось загрузить товары из Billz: ") + (e.message || e));
        billzBrowseItems = [];
      } finally {
        billzBrowseLoading = false;
        if (activePage === 'BILLZ') render();
      }
    }
    // Sahifa hajmini (10/25/50/100/Barchasi) o'zgartirish — 1-sahifadan qayta boshlaydi.
    function setBillzBrowsePageSize(size) {
      billzBrowsePageSize = size === 'ALL' ? 'ALL' : (Number(size) || 10);
      loadBillzBrowseItems(1);
    }
    // 100 tanlangan va jami 100 tadan ko'p bo'lganda ko'rinadigan raqamli
    // sahifalar (1, 2, 3...) — bosilgan sahifaga o'tadi.
    function goToBillzBrowsePage(pageNum) {
      loadBillzBrowseItems(pageNum);
    }
    // Barcha filtr(lar)ni tozalab, hali import qilinmagan tovarlarning
    // TO'LIQ ro'yxatini (birinchi sahifadan) ko'rsatadi.
    function showAllUnimportedBillzItems() {
      billzBrowseSelectedCatId = '';
      billzBrowseSearch = '';
      const searchInput = document.getElementById('billz-browse-search-input');
      if (searchInput) searchInput.value = '';
      loadBillzBrowseItems();
    }
    function setBillzBrowseCategory(catId) {
      billzBrowseSelectedCatId = catId || '';
      loadBillzBrowseItems();
    }
    let billzBrowseSearchTimer = null;
    function handleBillzBrowseSearchDebounced(value) {
      billzBrowseSearch = value;
      clearTimeout(billzBrowseSearchTimer);
      billzBrowseSearchTimer = setTimeout(() => loadBillzBrowseItems(), 500);
    }
    function toggleBillzItemSelected(billzProductId) {
      if (billzBrowseSelectedIds.has(billzProductId)) billzBrowseSelectedIds.delete(billzProductId);
      else billzBrowseSelectedIds.add(billzProductId);
      render();
    }
    function openBillzImportConfirmModal() {
      if (!billzBrowseSelectedIds.size) return;
      activePopupModal = 'BILLZ_IMPORT_CONFIRM';
      render();
    }
    async function confirmBillzImport() {
      const categoryId = document.getElementById('billz-import-category-select')?.value || null;
      const oldPricePercent = (document.getElementById('billz-import-oldprice-input')?.value || '').trim();
      const selectedItems = billzBrowseItems.filter((it) => billzBrowseSelectedIds.has(it.billzProductId));
      if (!selectedItems.length) return alert(tr("Hech narsa tanlanmagan.", "Ничего не выбрано."));
      billzImporting = true;
      render();
      showActionToast(tr("⏳ Import qilinmoqda...", "⏳ Импортируется..."), 'saving');
      try {
        const items = selectedItems.map((it) => ({
          billzProductId: it.billzProductId, name: it.name, description: it.description,
          price: it.price, stock: it.stock,
          variants: it.isVariative ? (it.variants || []).map((v) => ({ billzProductId: v.billzProductId, size: v.size, color: v.color, stock: v.stock })) : undefined,
        }));
        const result = await callApi('billz_import_products', { items, categoryId, oldPricePercent });
        for (const p of (result.imported || [])) upsertLocalProduct(p);
        saveCatalogCache();
        activePopupModal = null;
        billzBrowseSelectedIds = new Set();
        const failedCount = result.failedCount || 0;
        showActionToast(
          failedCount ? `${tr('⚠️ Qisman import qilindi', '⚠️ Импортировано частично')}: ${result.importedCount}/${selectedItems.length}` : `${tr('✅ Import qilindi', '✅ Импортировано')}: ${result.importedCount}`,
          failedCount ? 'error' : 'success', 2200,
        );
        await loadBillzBrowseItems();
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Import qilinmadi", "❌ Не импортировано"), 'error', 1800);
        if (String(e.message).startsWith('product_limit_reached')) {
          const limit = String(e.message).split(':')[1];
          alert(`${tr('⚠️ Tovar soni chegarasiga yetdingiz', '⚠️ Достигнут лимит количества товаров')} (${limit}).`);
        } else {
          alert(tr("❌ Xatolik: ", "❌ Ошибка: ") + (e.message || e));
        }
      } finally {
        billzImporting = false;
        render();
      }
    }
    function renderBillzBrowseItemRow(item) {
      const checked = billzBrowseSelectedIds.has(item.billzProductId);
      const totalStock = item.isVariative ? (item.variants || []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0) : item.stock;
      return `
        <label class="fc-card fc-billz-product-card flex items-center gap-3 cursor-pointer">
          <input class="fc-billz-check" type="checkbox" ${checked ? 'checked' : ''} onchange="toggleBillzItemSelected('${escapeHtml(item.billzProductId)}')">
          <div class="flex-1 min-w-0">
            <p class="font-bold text-xs truncate">${escapeHtml(item.name)}</p>
            <p class="text-[10px] text-gray-500">${money(item.price)} · ${tr('Qoldiq', 'Остаток')}: ${totalStock}${item.isVariative ? ` (${(item.variants || []).length} ${tr('variant', 'вариант')})` : ''}</p>
          </div>
        </label>
      `;
    }
    function renderBillzPage(container) {
      const tabsBar = `
        <div class="fc-tabs fc-billz-tabs">
          <button onclick="setBillzSubTab('IMPORT')" class="fc-tab ${billzSubTab === 'IMPORT' ? 'fc-tab-active' : ''}">${tr('Import', 'Импорт')}</button>
          <button onclick="setBillzSubTab('IMPORTED')" class="fc-tab ${billzSubTab === 'IMPORTED' ? 'fc-tab-active' : ''}">${tr('Import qilinganlar', 'Импортированные')}${billzImportedItems.length ? ` (${billzImportedItems.length})` : ''}</button>
          <button onclick="setBillzSubTab('DELETED')" class="fc-tab ${billzSubTab === 'DELETED' ? 'fc-tab-active' : ''}">${tr("O'chirilganlar", "Удалённые")}${billzDeletedItems.length ? ` (${billzDeletedItems.length})` : ''}</button>
        </div>
      `;
      // 9-band: sahifa hajmi tanlovi + (100 tanlanib, 100 tadan ko'p bo'lsa)
      // raqamli sahifalar — eski "Yana yuklash" tugmasi o'rniga.
      // "Barchasi" tanlanganda sahifalash umuman kerak emas (hammasi bitta
      // ro'yxatda), shu sabab totalPages faqat son bo'lganda hisoblanadi.
      const totalPages = typeof billzBrowsePageSize === 'number' ? Math.ceil(billzBrowseCount / billzBrowsePageSize) : 1;
      const pagerBar = `
        <div class="flex items-center gap-2">
          <label class="text-[10px] font-bold text-gray-500 shrink-0">${tr('Ko\'rsatish', 'Показывать')}:</label>
          <select onchange="setBillzBrowsePageSize(this.value)" class="fc-billz-control flex-1">
            ${[10, 25, 50, 100].map((n) => `<option value="${n}" ${billzBrowsePageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
            <option value="ALL" ${billzBrowsePageSize === 'ALL' ? 'selected' : ''}>${tr('Barchasi', 'Все')}</option>
          </select>
        </div>
        ${billzBrowsePageSize === 100 && totalPages > 1 ? `
          <div class="flex flex-wrap gap-1.5 justify-center">
            ${Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => `
              <button onclick="goToBillzBrowsePage(${n})" class="w-8 h-8 rounded-lg text-xs font-bold ${n === billzBrowsePage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${n}</button>
            `).join('')}
          </div>
        ` : ''}
      `;
      const importBody = `
        <div class="space-y-3" style="padding-bottom:4rem">
          <button onclick="showAllUnimportedBillzItems()" class="fc-billz-info"><i data-lucide="sparkles" class="w-4 h-4 inline-block mr-1"></i>${tr("Hali import qilinmaganlar (hammasi)", "Ещё не импортированные (все)")}</button>
          <select id="billz-browse-cat-select" onchange="setBillzBrowseCategory(this.value)" class="fc-billz-control w-full">
            <option value="">${tr("Barcha kategoriyalar (Billz)", "Все категории (Billz)")}</option>
            ${(billzBrowseCategories || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === billzBrowseSelectedCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <input id="billz-browse-search-input" type="text" value="${escapeHtml(billzBrowseSearch)}" oninput="handleBillzBrowseSearchDebounced(this.value)" placeholder="${tr('Qidirish...', 'Поиск...')}" class="fc-billz-control w-full">
          ${pagerBar}
          ${billzBrowseLoading ? `
            <div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>
          ` : !billzBrowseItems.length ? `
            <p class="text-center text-gray-400 py-6 text-xs">${tr("Hali tortib olinmagan tovar topilmadi.", "Не найдено ещё не импортированных товаров.")}</p>
          ` : `
            <div class="space-y-2">${billzBrowseItems.map(renderBillzBrowseItemRow).join('')}</div>
          `}
        </div>
        ${billzBrowseSelectedIds.size ? `
          <div class="ustore-sticky-panel p-3 bg-white border-t shadow-lg z-40">
            <div class="max-w-md mx-auto">
              <button onclick="openBillzImportConfirmModal()" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">${tr("Import qilish", "Импортировать")} (${billzBrowseSelectedIds.size})</button>
            </div>
          </div>
        ` : ''}
      `;
      const importedBody = `
        <div class="space-y-3" style="padding-bottom:4rem">
          ${billzImportedLoading ? `
            <div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>
          ` : !billzImportedItems.length ? `
            <p class="text-center text-gray-400 py-6 text-xs">${tr("Billz'dan import qilingan tovar yo'q.", "Нет товаров, импортированных из Billz.")}</p>
          ` : `
            <div class="space-y-2">${billzImportedItems.map((it) => `
              <div class="fc-card flex items-center gap-3" onclick="toggleBillzImportedSelected('${it.id}')">
                <div class="w-5 h-5 rounded flex items-center justify-center font-black text-[10px] shrink-0 ${billzImportedSelectedIds.has(it.id) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 border'}">${billzImportedSelectedIds.has(it.id) ? '✓' : ''}</div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-xs truncate">${escapeHtml(it.name)}</p>
                  <p class="text-[10px] text-gray-500">${money(it.price)} · ${tr('Qoldiq', 'Остаток')}: ${it.stock}</p>
                </div>
              </div>
            `).join('')}</div>
          `}
        </div>
        ${billzImportedSelectedIds.size ? `
          <div class="ustore-sticky-panel p-3 bg-white border-t shadow-lg z-40">
            <div class="max-w-md mx-auto">
              <button onclick="unlinkSelectedBillzImports()" ${billzUnlinking ? 'disabled' : ''} class="w-full fc-bg-danger text-white font-bold py-3 rounded-xl">${billzUnlinking ? tr('Bajarilmoqda...', 'Выполняется...') : `${tr("Importdan olib tashlash", "Убрать из импорта")} (${billzImportedSelectedIds.size})`}</button>
            </div>
          </div>
        ` : ''}
      `;
      const deletedBody = `
        <div class="space-y-2" style="padding-bottom:2rem">
          ${billzDeletedLoading ? `
            <div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>
          ` : !billzDeletedItems.length ? `
            <p class="text-center text-gray-400 py-6 text-xs">${tr("Billz tomonidan o'chirilgan tovar yo'q.", "Товаров, удалённых со стороны Billz, нет.")}</p>
          ` : billzDeletedItems.map((it) => `
            <div class="fc-card flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="font-bold text-xs truncate">${escapeHtml(it.name)}</p>
                <p class="text-[10px] text-gray-500">${money(it.price)} · ${tr('Oxirgi qoldiq', 'Последний остаток')}: ${it.stock}</p>
              </div>
              <button onclick="restoreBillzProduct('${it.id}')" class="text-xs font-bold text-blue-600 px-3 py-1.5 border border-blue-600 rounded-lg shrink-0">${tr('Tiklash', 'Восстановить')}</button>
            </div>
          `).join('')}
        </div>
      `;
      const bodyBySubTab = { IMPORT: importBody, IMPORTED: importedBody, DELETED: deletedBody };
      const body = `<div class="fc-billz-page space-y-3">${tabsBar}${bodyBySubTab[billzSubTab] || importBody}</div>`;
      renderPageShell(container, 'Billz', body);
    }

    async function removeAdmin(admId) {
      if (!confirm(tr("Ushbu admin huquqini bekor qilmoqchimisiz?", "Удалить права этого администратора?"))) return;
      const idx = adminsList.indexOf(admId);
      if (idx < 0) return;
      adminsList.splice(idx, 1);
      render();
      showActionToast(tr("⏳ Admin o'chirilmoqda...", "⏳ Администратор удаляется..."), 'saving');
      try {
        await callApi('remove_admin', { tgId: admId });
        showActionToast(tr("✅ Admin o'chirildi", "✅ Администратор удалён"), 'success', 1200);
      } catch (e) {
        console.error(e);
        adminsList.splice(Math.min(idx, adminsList.length), 0, admId);
        render();
        showActionToast(tr("❌ O'chirilmadi", "❌ Не удалён"), 'error', 1800);
        alert(tr("❌ Xatolik yuz berdi: ", "❌ Произошла ошибка: ") + (e.message || e));
      }
    }

    // MODALS ENGINE
    function closeAnyOpenModal() {
      clearTempImageSelection();
      activePopupModal = null;
      selectedProductModal = null;
      selectedOrderModal = null;
      selectedCategoryModal = null;
      selectedUserModal = null;
      render();
    }

    function installModalEscapeHandlers() {
      const container = document.getElementById('modal-container');
      if (!container || container.dataset.escapeHandlers === '1') return;
      container.dataset.escapeHandlers = '1';
      container.addEventListener('click', (event) => {
        const overlay = event.target;
        if (overlay instanceof HTMLElement && overlay.parentElement === container && overlay.classList.contains('fixed')) {
          closeAnyOpenModal();
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && container.innerHTML.trim()) closeAnyOpenModal();
      });
    }

    function movePickerAllowedCategories(mode){let forbidden=new Set();if(mode==='category'&&moveCategoryId)forbidden=categoryDescendantIds(moveCategoryId);if(mode==='bulk-category')for(const id of bulkSelectedCategoryIds)for(const x of categoryDescendantIds(id))forbidden.add(String(x));return categories.filter(c=>!c.deletedAt&&!forbidden.has(String(c.id)));}
    function movePickerEnter(id){movePickerParentId=id||null;movePickerSearch='';render();}
    function movePickerBack(){if(!movePickerParentId)return;const c=categories.find(x=>String(x.id)===String(movePickerParentId));movePickerParentId=c?.parentId||null;movePickerSearch='';render();}
    function setMovePickerSearch(v){movePickerSearch=String(v||'');render();}
    function movePickerPathHtml(){const chain=categoryAncestorChain(movePickerParentId);return [`<button type="button" onclick="movePickerEnter(null)">${tr('Bosh katalog','Главный каталог')}</button>`,...chain.map(c=>`<span>/</span><button type="button" onclick="movePickerEnter('${c.id}')">${escapeHtml(categoryName(c))}</button>`)].join('');}
    function renderMovePickerHtml(mode){const allowed=movePickerAllowedCategories(mode),q=normalizeText(movePickerSearch||'').latin;let rows=q?allowed.filter(c=>normalizeText(categoryName(c)).latin.includes(q)):allowed.filter(c=>String(c.parentId||'')===String(movePickerParentId||''));rows=rows.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||categoryName(a).localeCompare(categoryName(b)));const cur=categories.find(c=>String(c.id)===String(movePickerParentId||'')),targetLabel=cur?categoryName(cur):tr('Bosh katalog','Главный каталог');return `<div class="fc-move-picker"><div class="fc-move-picker-nav"><button type="button" onclick="movePickerBack()" ${!movePickerParentId?'disabled':''}><i data-lucide="arrow-left" class="w-4 h-4"></i></button><div class="fc-move-breadcrumb">${movePickerPathHtml()}</div></div><div class="fc-move-search"><i data-lucide="search" class="w-4 h-4"></i><input value="${escapeHtml(movePickerSearch)}" oninput="setMovePickerSearch(this.value)" placeholder="${tr('Katalog qidirish','Поиск каталога')}"></div><div class="fc-move-list">${rows.length?rows.map(c=>`<button type="button" onclick="movePickerEnter('${c.id}')" class="fc-move-folder"><span><i data-lucide="folder" class="w-4 h-4"></i><b>${escapeHtml(categoryName(c))}</b></span><i data-lucide="chevron-right" class="w-4 h-4"></i></button>`).join(''):`<div class="fc-empty-state"><i data-lucide="folder-search" class="w-7 h-7"></i><p>${tr('Katalog topilmadi','Каталог не найден')}</p></div>`}</div><div class="fc-move-target"><small>${tr('Tanlangan joy','Выбранное место')}</small><b>${escapeHtml(targetLabel)}</b></div></div>`;}
    async function saveBulkMoveCategories(){const ids=[...bulkSelectedCategoryIds];if(!ids.length)return;const newParentId=movePickerParentId||null;showActionToast(tr('Ko‘chirilmoqda...','Перемещение...'),'saving');try{for(const id of ids)await callApi('move_category',{categoryId:id,newParentId});await loadCatalog();activePopupModal=null;bulkSelectedCategoryIds.clear();bulkCategorySelectMode=false;render();showActionToast(tr('Kataloglar ko‘chirildi','Каталоги перемещены'),'success',1500);}catch(e){console.error(e);await loadCatalog();activePopupModal=null;bulkSelectedCategoryIds.clear();bulkCategorySelectMode=false;render();alert(tr('Ko‘chirishda xatolik: ','Ошибка перемещения: ')+(e.message||e));}}

    function renderModalContainer() {
      const container = document.getElementById('modal-container');
      installModalEscapeHandlers();

      // REGISTRATION MODAL
      if (activePopupModal === 'REGISTRATION') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs fc-registration-card" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2 text-center">${tr(`📝 ${escapeHtml(shopDisplayName())} ro'yxatdan o'tish`, `📝 Регистрация ${escapeHtml(shopDisplayName())}`)}</h3>
              <p class="text-[11px] text-gray-500 text-center">${tr("Buyurtmani tez rasmiylashtirish uchun ma'lumotlaringizni kiriting:", "Введите данные для быстрого оформления заказов:")}</p>
              <div>
                <label class="font-bold text-gray-600">${tr("Ismingiz *", "Имя *")}</label>
                <input type="text" id="reg-fname" value="${escapeHtml(currentUser.firstName)}" placeholder="Ali" class="w-full mt-1 p-2 border rounded-xl">
              </div>
              <div>
                <label class="font-bold text-gray-600">${tr("Familiyangiz *", "Фамилия *")}</label>
                <input type="text" id="reg-lname" value="${escapeHtml(currentUser.lastName)}" placeholder="Valiyev" class="w-full mt-1 p-2 border rounded-xl">
              </div>
              <div>
                <label class="font-bold text-gray-600">${tr("Telefon raqamingiz *", "Номер телефона *")}</label>
                <input type="text" id="reg-phone" value="${escapeHtml(currentUser.phone)}" placeholder="+998 90 123 45 67" class="w-full mt-1 p-2 border rounded-xl font-mono">
              </div>
              ${renderRegistrationLegalConsentsHtml()}
              <div class="pt-2">
                <button id="reg-save-btn" onclick="saveRegistrationFromModal()" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("✅ Saqlash", "✅ Сохранить")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'SHOP_INFO') {
        const form = shopInfoDraft || shopContact;
        const logoPreview = shopInfoLogoPreviewUrl();
        container.innerHTML = `
          <div class="fc-sheet-overlay fc-shop-info-overlay" onclick="if(event.target===this) closeShopInfoModal();">
            <div class="fc-sheet fc-shop-info-sheet" onclick="event.stopPropagation()">
              <div class="fc-sheet-handle"></div>
              <div class="fc-sheet-header fc-shop-info-header">
                <div class="min-w-0">
                  <div class="fc-sheet-title">${tr("Do'kon haqida", "О магазине")}</div>
                  <p class="fc-shop-info-subtitle">${tr("Brend, manzil va aloqa ma'lumotlarini bir joydan boshqaring", "Управляйте брендом, адресом и контактами в одном месте")}</p>
                </div>
                <button type="button" onclick="closeShopInfoModal()" class="fc-btn fc-btn-icon" style="min-width:2.25rem;min-height:2.25rem" aria-label="${tr('Yopish','Закрыть')}"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>

              <div class="fc-sheet-body fc-shop-info-body">
                <section class="fc-shop-settings-section fc-shop-brand-section">
                  <div class="fc-shop-settings-head">
                    <span class="fc-shop-settings-icon"><i data-lucide="store" class="w-4 h-4"></i></span>
                    <div><h4>${tr('Brend', 'Бренд')}</h4><p>${tr("Do'kon nomi va logotipi", 'Название и логотип магазина')}</p></div>
                  </div>

                  <div class="fc-shop-logo-editor">
                    <div id="shop-info-logo-preview" class="fc-shop-logo-preview">
                      ${logoPreview ? `<img src="${escapeHtml(logoPreview)}" alt="${tr("Do'kon logotipi", 'Логотип магазина')}" class="fc-shop-logo-image">` : `<div class="fc-shop-logo-placeholder"><i data-lucide="image" class="w-6 h-6"></i></div>`}
                    </div>
                    <div class="fc-shop-logo-copy">
                      <p class="fc-shop-logo-title">${tr('Do‘kon logotipi', 'Логотип магазина')}</p>
                      <p id="shop-info-logo-status" class="fc-shop-logo-status">${shopLogoDraft ? tr('Yangi logo tanlandi — Saqlashni bosing', 'Новый логотип выбран — нажмите Сохранить') : (logoPreview ? tr('Logo o‘rnatilgan', 'Логотип установлен') : tr('Logo hali qo‘shilmagan', 'Логотип ещё не добавлен'))}</p>
                      <div class="fc-shop-logo-actions">
                        <input id="shop-logo-input" type="file" accept="image/*" class="hidden" onchange="saveShopLogoFromPicker(event)">
                        <input id="shop-logo-input-files" type="file" class="hidden" onchange="saveShopLogoFromPicker(event)">
                        <button type="button" onclick="openImagePickerSheet('shop-logo-input','shop-logo-input-files')" class="fc-btn fc-btn-primary fc-shop-logo-action"><i data-lucide="image-plus" class="w-4 h-4"></i><span id="shop-info-logo-button-label">${tr('Xotiradan yuklash', 'Загрузить с устройства')}</span></button>
                      </div>
                    </div>
                  </div>

                  <div class="fc-shop-field">
                    <label for="sc-name">${tr("Do'kon nomi", "Название магазина")}</label>
                    <input type="text" id="sc-name" value="${escapeHtml(form.name || '')}" placeholder="${tr("Do'kon nomi", "Название магазина")}" class="fc-shop-input">
                    <p class="fc-shop-field-help">${tr("Bo'sh qoldirilsa, standart \"Do'kon\" nomi ishlatiladi.", "Если оставить пустым, используется название \"Магазин\" по умолчанию.")}</p>
                  </div>
                </section>

                <section class="fc-shop-settings-section">
                  <div class="fc-shop-settings-head">
                    <span class="fc-shop-settings-icon"><i data-lucide="map-pin" class="w-4 h-4"></i></span>
                    <div><h4>${tr('Manzil', 'Адрес')}</h4><p>${tr("Mijoz ko'radigan manzil va xarita koordinatasi", 'Адрес для клиента и координаты карты')}</p></div>
                  </div>
                  <div class="fc-shop-fields-stack">
                    <div class="fc-shop-field">
                      <label for="sc-address">${tr("Manzil", "Адрес")}</label>
                      <textarea id="sc-address" rows="2" placeholder="${tr('Sergeli tumani, ko‘cha...\nMo‘ljal: ...','Сергелийский район, улица...\nОриентир: ...')}" class="fc-shop-input fc-shop-address-input">${escapeHtml(form.address || '')}</textarea>
                      <p class="fc-shop-field-help">${tr("Kerakli joyda Enter bosing — masalan, mo‘ljalni yangi qatordan yozing.", "Нажмите Enter в нужном месте — например, напишите ориентир с новой строки.")}</p>
                    </div>
                    <div class="fc-shop-field">
                      <label for="sc-address-ru">${tr("Manzil (ruscha, ixtiyoriy)", "Адрес (по-русски, необязательно)")}</label>
                      <textarea id="sc-address-ru" rows="2" placeholder="Сергелийский район, улица...\nОриентир: ..." class="fc-shop-input fc-shop-address-input">${escapeHtml(form.addressRu || '')}</textarea>
                      <p class="fc-shop-field-help">${tr("Bo'sh qoldirilsa, ruscha rejimda ham o'zbekcha manzil ko'rsatiladi.", "Если оставить пустым, в русском режиме тоже отображается узбекский адрес.")}</p>
                    </div>
                    <div class="fc-shop-field">
                      <label for="sc-coordinates">${tr("Koordinata", "Координаты")}</label>
                      <div class="fc-shop-input-with-icon"><i data-lucide="navigation" class="w-4 h-4"></i><input type="text" id="sc-coordinates" value="${escapeHtml(form.coordinates || '')}" placeholder="41.217408,69.211225" class="fc-shop-input font-mono"></div>
                      <p class="fc-shop-field-help">${tr("Google Maps'dan koordinatani nusxa qilib qo'ying.", "Вставьте координаты из Google Maps.")}</p>
                    </div>
                  </div>
                </section>

                <section class="fc-shop-settings-section">
                  <div class="fc-shop-settings-head">
                    <span class="fc-shop-settings-icon"><i data-lucide="clock-3" class="w-4 h-4"></i></span>
                    <div><h4>${tr('Ish vaqti', 'Часы работы')}</h4><p>${tr("Mijozlarga ko'rinadigan ish tartibi", 'График, который видят клиенты')}</p></div>
                  </div>
                  <div class="fc-shop-field">
                    <label for="sc-work-hours">${tr('Ish vaqti', 'Часы работы')}</label>
                    <input type="text" id="sc-work-hours" value="${escapeHtml(form.workHours || '')}" placeholder="${tr('Masalan: 09:00–22:00 yoki Du–Yak 09:00–22:00','Например: 09:00–22:00 или Пн–Вс 09:00–22:00')}" class="fc-shop-input">
                  </div>
                </section>

                <section class="fc-shop-settings-section">
                  <div class="fc-shop-settings-head">
                    <span class="fc-shop-settings-icon"><i data-lucide="phone" class="w-4 h-4"></i></span>
                    <div><h4>${tr('Aloqa', 'Контакты')}</h4><p>${tr("Asosiy va qo'shimcha telefon raqamlari", 'Основной и дополнительные номера')}</p></div>
                  </div>
                  <div class="fc-shop-fields-stack">
                    <div class="fc-shop-field"><label for="sc-phone1">${tr("Telefon 1", "Телефон 1")}</label><input type="text" id="sc-phone1" value="${escapeHtml(form.phone || '')}" placeholder="+998 90 123 45 67" class="fc-shop-input font-mono"></div>
                    <div class="fc-shop-field"><label for="sc-phone2">${tr("Telefon 2 (ixtiyoriy)", "Телефон 2 (необязательно)")}</label><input type="text" id="sc-phone2" value="${escapeHtml(form.phone2 || '')}" placeholder="+998 90 123 45 67" class="fc-shop-input font-mono"></div>
                    <div class="fc-shop-field"><label for="sc-phone3">${tr("Telefon 3 (ixtiyoriy)", "Телефон 3 (необязательно)")}</label><input type="text" id="sc-phone3" value="${escapeHtml(form.phone3 || '')}" placeholder="+998 90 123 45 67" class="fc-shop-input font-mono"></div>
                  </div>
                </section>

                <section class="fc-shop-settings-section">
                  <div class="fc-shop-settings-head">
                    <span class="fc-shop-settings-icon"><i data-lucide="share-2" class="w-4 h-4"></i></span>
                    <div><h4>${tr('Ijtimoiy tarmoqlar', 'Социальные сети')}</h4><p>${tr("Nickname'ni @ belgisiz kiriting", 'Введите никнейм без символа @')}</p></div>
                  </div>
                  <div class="fc-shop-fields-stack">
                    <div class="fc-shop-field"><label for="sc-instagram">Instagram</label><div class="fc-shop-social-input"><span>@</span><input type="text" id="sc-instagram" value="${escapeHtml(cleanSocialNick(form.instagram))}" placeholder="mystore.uz"></div></div>
                    <div class="fc-shop-field"><label for="sc-telegram">Telegram</label><div class="fc-shop-social-input"><span>@</span><input type="text" id="sc-telegram" value="${escapeHtml(cleanSocialNick(form.telegram))}" placeholder="mystore_uz"></div></div>
                    <div class="fc-shop-field"><label for="sc-facebook">Facebook</label><div class="fc-shop-social-input"><span>@</span><input type="text" id="sc-facebook" value="${escapeHtml(cleanSocialNick(form.facebook))}" placeholder="mystore.uz"></div></div>
                  </div>
                </section>

                <p class="fc-shop-info-note"><i data-lucide="info" class="w-4 h-4"></i><span>${tr("Bo'sh qoldirilgan maydonlar foydalanuvchiga ko'rsatilmaydi.", "Пустые поля не показываются пользователю.")}</span></p>
              </div>

              <div class="fc-sheet-footer fc-shop-info-footer">
                <button type="button" onclick="closeShopInfoModal()" class="fc-btn fc-btn-secondary">${tr('Bekor qilish', 'Отмена')}</button>
                <button id="shop-info-save-btn" type="button" onclick="saveShopContact()" class="fc-btn fc-btn-primary"><i data-lucide="save" class="w-4 h-4"></i>${tr('Saqlash', 'Сохранить')}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // 18-band: "Bot /start xabarini ulash" endi ikkita ishni bir joyda
      // qiladi — matnni tahrirlash (yangi) va webhookni ulash (mavjud,
      // setupBotWebhook() o'zgarmagan).
      if (activePopupModal === 'START_MESSAGE') {
        const currentStartMessage = shopContact.startMessage || '';
        container.innerHTML = `
          <div class="fc-startmsg-overlay" onclick="activePopupModal=null; render();">
            <div class="fc-startmsg-sheet" onclick="event.stopPropagation()">
              <div class="fc-startmsg-handle"></div>
              <div class="fc-startmsg-header">
                <span class="fc-startmsg-icon"><i data-lucide="bot" class="w-6 h-6"></i></span>
                <div><h3>${tr("Bot /start xabari", "Сообщение бота /start")}</h3><p>${tr("Bot foydalanuvchiga /start buyrug‘ida yuboradigan xabar matni.", "Текст, который бот отправляет пользователю по команде /start.")}</p></div>
                <button type="button" class="fc-startmsg-close" onclick="activePopupModal=null; render();" aria-label="${tr('Yopish','Закрыть')}"><i data-lucide="x" class="w-5 h-5"></i></button>
              </div>
              <div class="fc-startmsg-body">
                <label class="fc-startmsg-label" for="sm-text">${tr("Xabar matni", "Текст сообщения")}</label>
                <textarea id="sm-text" rows="9" placeholder="${tr('Standart matn ishlatiladi...', 'Используется стандартный текст...')}" class="fc-startmsg-textarea">${escapeHtml(currentStartMessage)}</textarea>
                <p class="fc-startmsg-help">${tr("Bo'sh qoldirilsa, standart xabar matni ishlatiladi. HTML teglar (masalan <b>...</b>) qo'llab-quvvatlanadi.", "Если оставить пустым, используется стандартный текст. Поддерживаются HTML-теги (например <b>...</b>).")}</p>
                <button onclick="saveStartMessage()" class="fc-btn fc-btn-primary w-full"><i data-lucide="save" class="w-4 h-4"></i>${tr("Matnni saqlash", "Сохранить текст")}</button>
                <button onclick="setupBotWebhook()" class="fc-startmsg-webhook"><span><i data-lucide="link-2" class="w-5 h-5"></i></span><div><b>${tr("Webhookni ulash", "Подключить webhook")}</b><small>${tr("Botni Supabase'ga ulash uchun bir marta bosish yetarli.", "Для подключения бота к Supabase достаточно нажать один раз.")}</small></div><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                <button onclick="activePopupModal=null; render();" class="fc-btn fc-btn-secondary w-full">${tr("Yopish", "Закрыть")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // POLISH ROUND 1-bosqich: SHOP_PARAMS endi modal emas — renderSettingsPage()
      // (activePage='SETTINGS') ga ko'chirildi.
      // 10/11-band: ORDER_INFO, DESIGN_SETTINGS va FULFILLMENT_SETTINGS
      // (endi ikkiga bo'lingan: DELIVERY_SETTINGS/PAYMENT_SETTINGS) ham xuddi
      // shunday — endi modal emas, to'liq sahifa (renderOrderInfoPage,
      // renderDesignSettingsPage, renderDeliverySettingsPage,
      // renderPaymentSettingsPage — activePage router'da, pastda qarang).

      if (activePopupModal === 'WAREHOUSE_STOCK_ADJUST') {
        const p = products.find(x => String(x.id) === String(warehouseStockAdjustProductId));
        if (!p) { activePopupModal = null; render(); return; }
        const vars = productVariants(p);
        const current = warehouseStockAdjustCurrent();
        const draft = Math.max(0, Number.parseInt(warehouseStockAdjustDraft, 10) || 0);
        container.innerHTML = `
          <div class="fc-sheet-overlay" onclick="if(event.target===this) closeWarehouseStockAdjust();">
            <div class="fc-sheet fc-stock-adjust-sheet" onclick="event.stopPropagation()">
              <div class="fc-sheet-handle"></div>
              <div class="fc-stock-adjust-head">
                <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';">
                <div><small>${tr('Qoldiqni boshqarish','Управление остатком')}</small><h3>${escapeHtml(productName(p))}</h3><p>ID: ${escapeHtml(p.sku)}</p></div>
                <button type="button" onclick="closeWarehouseStockAdjust()" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>
              <div class="fc-stock-adjust-body">
                ${vars.length ? `<label class="fc-stock-adjust-field"><span>${tr('Variant','Вариант')}</span><select onchange="setWarehouseStockAdjustVariant(this.value)">${vars.map(v=>`<option value="${escapeHtml(v.sku)}" ${String(v.sku)===String(warehouseStockAdjustVariantSku)?'selected':''}>${escapeHtml(variantLabel(v))} · ${v.qty} ${tr('ta','шт.')}</option>`).join('')}</select></label>` : ''}
                <div class="fc-stock-adjust-current"><span>${tr('Hozirgi qoldiq','Текущий остаток')}</span><b>${current}</b></div>
                <div class="fc-stock-adjust-stepper">
                  <button type="button" onclick="changeWarehouseStockDraft(-1)" aria-label="${tr('Kamaytirish','Уменьшить')}"><i data-lucide="minus" class="w-5 h-5"></i></button>
                  <input type="number" min="0" value="${draft}" oninput="warehouseStockAdjustDraft=this.value" aria-label="${tr('Yangi qoldiq','Новый остаток')}">
                  <button type="button" onclick="changeWarehouseStockDraft(1)" aria-label="${tr('Ko‘paytirish','Увеличить')}"><i data-lucide="plus" class="w-5 h-5"></i></button>
                </div>
                <div class="fc-stock-adjust-preview"><span>${current}</span><i data-lucide="arrow-right" class="w-4 h-4"></i><strong>${draft}</strong></div>
              </div>
              <div class="fc-sheet-footer fc-stock-adjust-footer">
                <button type="button" onclick="closeWarehouseStockAdjust()" class="fc-btn fc-btn-secondary">${tr('Bekor qilish','Отмена')}</button>
                <button type="button" onclick="saveWarehouseStockAdjust()" ${warehouseStockAdjustSaving?'disabled':''} class="fc-btn fc-btn-primary"><i data-lucide="save" class="w-4 h-4"></i>${warehouseStockAdjustSaving?tr('Saqlanmoqda...','Сохранение...'):tr('Saqlash','Сохранить')}</button>
              </div>
            </div>
          </div>`;
        return;
      }

      if (activePopupModal === 'ADD_PROD') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("➕ Yangi tovar qo'shish", "➕ Добавить новый товар")}</h3>

              <div>
                <label class="font-bold text-gray-600">${tr("Tovar nomi *", "Название товара *")}</label>
                <input type="text" id="m-prod-name" placeholder="${tr('Masalan: Whey Protein','Например: Whey Protein')}" class="w-full mt-1 p-2 border rounded-xl">
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="font-bold text-gray-600">${tr("Sotuv narxi *", "Цена продажи *")}</label>
                  <input type="number" id="m-prod-price" placeholder="400000" class="w-full mt-1 p-2 border rounded-xl">
                </div>
                <div>
                  <label class="font-bold text-gray-600">${tr("Eski narxi (Chegirma)", "Старая цена (скидка)")}</label>
                  <input type="number" id="m-prod-oldprice" placeholder="480000" class="w-full mt-1 p-2 border rounded-xl">
                </div>
              </div>

              <div>
                <label class="font-bold text-gray-600">${tr("Ombor qoldig'i (Soni) *", "Остаток на складе *")}</label>
                <input type="number" id="m-prod-stock" placeholder="15" class="w-full mt-1 p-2 border rounded-xl">
              </div>

              <div>${renderVariantBuilderHtml()}</div>

              <div>
                <label class="font-bold text-gray-600">${tr("Izoh / Tavsif", "Описание")}</label>
                <textarea id="m-prod-desc" rows="2" placeholder="${tr('Tovar haqida ma\'lumot','Описание товара')}" class="w-full mt-1 p-2 border rounded-xl"></textarea>
              </div>

              <div>
                <label class="font-bold text-gray-600">${tr("Tovar rasmi", "Фото товара")}</label>
                <input id="m-prod-image-input" type="file" accept="image/*" onchange="onImagePicked(event, 'm-prod-prev', 'm-prod-image-button', 'm-prod-image-url', 'm-prod-image-url-error')" class="hidden">
                <input id="m-prod-image-input-files" type="file" onchange="onImagePicked(event, 'm-prod-prev', 'm-prod-image-button', 'm-prod-image-url', 'm-prod-image-url-error')" class="hidden">
                <button id="m-prod-image-button" type="button" onclick="openImagePickerSheet('m-prod-image-input','m-prod-image-input-files')" class="fc-btn fc-btn-secondary w-full mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr("Xotiradan yuklash", "Загрузить с устройства")}</button>
                <input id="m-prod-image-url" type="url" inputmode="url" oninput="onImageUrlInput(this.value, 'm-prod-prev', 'm-prod-image-url-error', 'm-prod-image-button')" placeholder="${tr('Rasm URL (ixtiyoriy)','URL изображения (необязательно)')}" class="w-full mt-2 p-2 border rounded-xl">
                <p id="m-prod-image-url-error" class="hidden mt-1 text-[10px] fc-text-danger"></p>
                <img id="m-prod-prev" src="" class="w-24 h-24 object-cover rounded-xl mt-2 hidden border">
              </div>

              <div class="flex space-x-2 pt-2">
                <button onclick="saveProductFromModal()" class="flex-1 bg-green-600 text-white font-bold py-2.5 rounded-xl">${tr("✅ Saqlash va omborga kiritish", "✅ Сохранить и добавить на склад")}</button>
                <button onclick="cancelProductEditor()" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'ADD_CAT') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("📂 Yangi katalog qo'shish", "📂 Добавить новый каталог")}</h3>
              <div>
                <label class="font-bold text-gray-600">${tr("Katalog nomi *", "Название каталога *")}</label>
                <input type="text" id="m-cat-name" placeholder="${tr('Masalan: Proteinlar','Например: Протеины')}" class="w-full mt-1 p-2 border rounded-xl">
              </div>
              <div>
                <label class="font-bold text-gray-600">${tr("Katalog rasmi", "Изображение каталога")}</label>
                <input id="m-cat-image-input" type="file" accept="image/*" onchange="onImagePicked(event, 'm-cat-prev', 'm-cat-image-button', 'm-cat-image-url', 'm-cat-image-url-error')" class="hidden">
                <input id="m-cat-image-input-files" type="file" onchange="onImagePicked(event, 'm-cat-prev', 'm-cat-image-button', 'm-cat-image-url', 'm-cat-image-url-error')" class="hidden">
                <div class="flex items-center gap-3 mt-1 flex-wrap">
                  <img id="m-cat-prev" src="" class="w-16 h-16 object-cover rounded-xl hidden border">
                  <button id="m-cat-image-button" type="button" onclick="openImagePickerSheet('m-cat-image-input','m-cat-image-input-files')" class="fc-btn fc-btn-secondary"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Xotiradan yuklash', 'Загрузить с устройства')}</button>
                </div>
                <input id="m-cat-image-url" type="url" inputmode="url" oninput="onImageUrlInput(this.value, 'm-cat-prev', 'm-cat-image-url-error', 'm-cat-image-button')" placeholder="${tr('Rasm URL (ixtiyoriy)','URL изображения (необязательно)')}" class="w-full mt-2 p-2 border rounded-xl">
                <p id="m-cat-image-url-error" class="hidden mt-1 text-[10px] fc-text-danger"></p>
              </div>
              <div class="flex space-x-2 pt-2">
                <button onclick="saveCategoryFromModal()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'EDIT_CAT') {
        const c = selectedCategoryModal;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2 flex items-center gap-1.5">${ICON_EDIT} ${tr("Katalogni tahrirlash", "Редактировать каталог")}</h3>
              <div>
                <label class="font-bold text-gray-600">${tr("Katalog nomi *", "Название каталога *")}</label>
                <input type="text" id="ec-name" value="${escapeHtml(c.name)}" class="w-full mt-1 p-2 border rounded-xl">
              </div>
              <div>
                <label class="font-bold text-gray-600">${tr("Katalog rasmi", "Изображение каталога")}</label>
                <input id="ec-image-input" type="file" accept="image/*" onchange="onImagePicked(event, 'ec-img-prev', 'ec-image-button', 'ec-image-url', 'ec-image-url-error')" class="hidden">
                <input id="ec-image-input-files" type="file" onchange="onImagePicked(event, 'ec-img-prev', 'ec-image-button', 'ec-image-url', 'ec-image-url-error')" class="hidden">
                <div class="flex items-center gap-3 mt-1 flex-wrap">
                  <img id="ec-img-prev" src="${escapeHtml((c.img && (c.img.startsWith('http') || c.img.startsWith('data:'))) ? c.img : '')}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-16 h-16 object-cover rounded-xl ${(c.img && (c.img.startsWith('http') || c.img.startsWith('data:'))) ? '' : 'hidden'} border">
                  <button id="ec-image-button" type="button" onclick="openImagePickerSheet('ec-image-input','ec-image-input-files')" class="fc-btn fc-btn-secondary"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Xotiradan yuklash', 'Загрузить с устройства')}</button>
                </div>
                <input id="ec-image-url" type="url" inputmode="url" oninput="onImageUrlInput(this.value, 'ec-img-prev', 'ec-image-url-error', 'ec-image-button')" placeholder="${tr('Rasm URL (ixtiyoriy)','URL изображения (необязательно)')}" class="w-full mt-2 p-2 border rounded-xl">
                <p id="ec-image-url-error" class="hidden mt-1 text-[10px] fc-text-danger"></p>
              </div>
              <div class="flex space-x-2 pt-2">
                <button onclick="saveCategoryEdit('${c.id}')" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'MISSING_IMAGE_QUEUE') {
        const queue = getMissingImageProducts();
        if (missingImageQueueIndex >= queue.length) missingImageQueueIndex = Math.max(0, queue.length - 1);
        const p = queue[missingImageQueueIndex] || null;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div class="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-sm w-full max-h-[94vh] overflow-y-auto space-y-3 shadow-2xl text-xs">
              <div class="flex items-center justify-between border-b pb-2">
                <div><h3 class="font-black text-base flex items-center gap-2"><i data-lucide="image-off" class="w-5 h-5 text-blue-600"></i>${tr('Rasmsiz tovarlar','Товары без фото')}</h3><p class="text-[10px] text-gray-400">${tr('Barcha kataloglar bo‘yicha global navbat','Общая очередь по всем каталогам')}</p></div>
                <button onclick="clearTempImageSelection(); activePopupModal=null; render();" class="fc-icon-btn"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>
              ${p ? `
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="font-black text-sm text-gray-900">${escapeHtml(productName(p))}</p>
                    <p class="mt-1 text-[10px] text-blue-700 font-bold break-words flex items-center gap-1"><i data-lucide="folder" class="w-3.5 h-3.5"></i>${escapeHtml(categoryPathForProduct(p))}</p>
                    <p class="mt-1 text-[10px] font-mono text-gray-500">SKU: ${escapeHtml(p.sku || '—')}</p>
                  </div>
                  <span class="flex-shrink-0 bg-slate-100 text-slate-700 font-black px-2.5 py-1 rounded-xl">${missingImageQueueIndex + 1} / ${queue.length}</span>
                </div>
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <img id="miq-img-prev" src="" class="hidden w-full h-48 object-contain rounded-xl bg-white">
                  <div id="miq-empty-preview" class="h-32 flex flex-col gap-2 items-center justify-center text-center text-gray-400 font-bold"><i data-lucide="image" class="w-7 h-7"></i><span>${tr('Rasm preview','Предпросмотр фото')}</span></div>
                </div>
                <input id="miq-image-input" type="file" accept="image/*" onchange="document.getElementById('miq-empty-preview')?.classList.add('hidden'); onImagePicked(event, 'miq-img-prev', 'miq-image-button', 'miq-image-url', 'miq-image-url-error')" class="hidden">
                <input id="miq-image-input-files" type="file" onchange="document.getElementById('miq-empty-preview')?.classList.add('hidden'); onImagePicked(event, 'miq-img-prev', 'miq-image-button', 'miq-image-url', 'miq-image-url-error')" class="hidden">
                <button id="miq-image-button" type="button" onclick="openImagePickerSheet('miq-image-input','miq-image-input-files')" class="fc-btn fc-btn-secondary w-full"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Xotiradan yuklash','Загрузить с устройства')}</button>
                <input id="miq-image-url" type="url" inputmode="url" oninput="document.getElementById('miq-empty-preview')?.classList.toggle('hidden', !!this.value.trim()); onImageUrlInput(this.value, 'miq-img-prev', 'miq-image-url-error', 'miq-image-button')" placeholder="${tr('Rasm URL (ixtiyoriy)','URL изображения (необязательно)')}" class="w-full p-2.5 border rounded-xl">
                <p id="miq-image-url-error" class="hidden text-[10px] fc-text-danger"></p>
                <button onclick="saveMissingImageQueueItem('${p.id}')" ${missingImageQueueSaving ? 'disabled' : ''} class="w-full ${missingImageQueueSaving ? 'bg-gray-300 text-gray-500' : 'bg-emerald-600 text-white'} font-black py-3 rounded-xl">${missingImageQueueSaving ? tr('Saqlanmoqda…','Сохранение…') : tr('Saqlash','Сохранить')}</button>
                <div class="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
                  <button onclick="moveMissingImageQueue(-1)" ${missingImageQueueSaving || missingImageQueueIndex === 0 ? 'disabled' : ''} class="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl disabled:opacity-40"><i data-lucide="arrow-left" class="w-4 h-4 inline-block mr-1"></i>${tr('Oldingi','Предыдущий')}</button>
                  <button onclick="moveMissingImageQueue(1)" ${missingImageQueueSaving || missingImageQueueIndex >= queue.length - 1 ? 'disabled' : ''} class="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl disabled:opacity-40">${tr('Keyingi','Следующий')}<i data-lucide="arrow-right" class="w-4 h-4 inline-block ml-1"></i></button>
                </div>
              ` : `
                <div class="py-10 text-center space-y-3"><div class="mx-auto w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><i data-lucide="circle-check" class="w-6 h-6"></i></div><p class="font-black text-emerald-700">${tr('Rasmsiz tovar qolmadi.','Товаров без фото не осталось.')}</p><button onclick="clearTempImageSelection(); activePopupModal=null; render();" class="bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl">${tr('Yopish','Закрыть')}</button></div>
              `}
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'EXCEL_IMPORT') {
        if (window.UstoreExcel && typeof window.UstoreExcel.renderModal === 'function') {
          container.innerHTML = window.UstoreExcel.renderModal();
        } else {
          container.innerHTML = `<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div class="bg-white rounded-3xl p-6 text-center text-sm">${tr("⏳ Excel moduli yuklanmoqda...", "⏳ Модуль Excel загружается...")}</div></div>`;
        }
        return;
      }

      // 2.3: tovarni boshqa katalogga ko'chirish — file-manager usuli.
      if (activePopupModal === 'MOVE_PRODUCT_CATEGORY') {
        container.innerHTML = `<div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null;render();"><div class="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[90dvh] flex flex-col overflow-hidden" onclick="event.stopPropagation()"><div class="fc-modal-head"><div><h3>${tr('Katalogni o‘zgartirish','Изменить каталог')}</h3><p>${tr('Katalog ichiga kirib kerakli joyni tanlang','Откройте нужный каталог')}</p></div><button onclick="activePopupModal=null;render();"><i data-lucide="x" class="w-4 h-4"></i></button></div><div class="p-4 overflow-y-auto">${renderMovePickerHtml('product')}</div><div class="p-3 border-t bg-white"><button onclick="saveMoveProduct()" class="fc-btn fc-btn-primary w-full"><i data-lucide="folder-input" class="w-4 h-4"></i>${tr('Shu katalogga ko‘chirish','Переместить сюда')}</button></div></div></div>`; return;
      }

      // 2.2: katalogni boshqa katalog ichiga ko'chirish — file-manager usuli.
      if (activePopupModal === 'MOVE_CATEGORY') {
        container.innerHTML = `<div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null;render();"><div class="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[90dvh] flex flex-col overflow-hidden" onclick="event.stopPropagation()"><div class="fc-modal-head"><div><h3>${tr('Katalogni ko‘chirish','Переместить каталог')}</h3><p>${tr('Katalog ichiga kirib kerakli joyni tanlang','Откройте нужный каталог')}</p></div><button onclick="activePopupModal=null;render();"><i data-lucide="x" class="w-4 h-4"></i></button></div><div class="p-4 overflow-y-auto">${renderMovePickerHtml('category')}</div><div class="p-3 border-t bg-white"><button onclick="saveMoveCategory()" class="fc-btn fc-btn-primary w-full"><i data-lucide="folder-input" class="w-4 h-4"></i>${tr('Shu katalogga ko‘chirish','Переместить сюда')}</button></div></div></div>`; return;
      }

      // 2.8: narx tarixi.      // 2.8: narx tarixi.
      if (activePopupModal === 'PRICE_HISTORY') {
        const rows = priceHistoryList || [];
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[80vh] overflow-y-auto space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("🕘 Narx tarixi", "🕘 История цен")}</h3>
              ${priceHistoryList === null ? `<p class="text-center text-gray-400 py-6">${tr('Yuklanmoqda...', 'Загрузка...')}</p>`
                : rows.length === 0 ? `<p class="text-center text-gray-400 py-6">${tr("O'zgarishlar topilmadi.", 'Изменений не найдено.')}</p>`
                : `<div class="divide-y">${rows.map(h => `
                    <div class="py-2 flex justify-between items-center">
                      <div>
                        <p class="font-bold">${h.oldPrice !== null ? money(h.oldPrice) + ' → ' : ''}${money(h.newPrice)}</p>
                        <p class="text-[10px] text-gray-400">${new Date(h.changedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  `).join('')}</div>`}
              <button onclick="activePopupModal=null; render();" class="w-full bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
            </div>
          </div>`;
        return;
      }

      if (activePopupModal === 'BULK_MOVE_PRODUCTS') {
        container.innerHTML = `<div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null;render();"><div class="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[90dvh] flex flex-col overflow-hidden" onclick="event.stopPropagation()"><div class="fc-modal-head"><div><h3>${tr('Tovarlarni ko‘chirish','Перемещение товаров')}</h3><p>${bulkSelectedProductIds.size} ${tr('ta tovar tanlandi','товаров выбрано')}</p></div><button onclick="activePopupModal=null;render();"><i data-lucide="x" class="w-4 h-4"></i></button></div><div class="p-4 overflow-y-auto">${renderMovePickerHtml('product')}</div><div class="p-3 border-t bg-white"><button onclick="saveBulkMoveProducts()" class="fc-btn fc-btn-primary w-full"><i data-lucide="folder-input" class="w-4 h-4"></i>${tr('Shu katalogga ko‘chirish','Переместить сюда')}</button></div></div></div>`; return;
      }
      if (activePopupModal === 'BULK_MOVE_CATEGORIES') {
        container.innerHTML = `<div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null;render();"><div class="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[90dvh] flex flex-col overflow-hidden" onclick="event.stopPropagation()"><div class="fc-modal-head"><div><h3>${tr('Kataloglarni ko‘chirish','Перемещение каталогов')}</h3><p>${bulkSelectedCategoryIds.size} ${tr('ta katalog tanlandi','каталогов выбрано')}</p></div><button onclick="activePopupModal=null;render();"><i data-lucide="x" class="w-4 h-4"></i></button></div><div class="p-4 overflow-y-auto">${renderMovePickerHtml('bulk-category')}</div><div class="p-3 border-t bg-white"><button onclick="saveBulkMoveCategories()" class="fc-btn fc-btn-primary w-full"><i data-lucide="folder-input" class="w-4 h-4"></i>${tr('Shu katalogga ko‘chirish','Переместить сюда')}</button></div></div></div>`; return;
      }

      // POLISH ROUND 1-bosqich: Dashboard endi modal emas — renderDashboardPage()
      // (activePage='DASHBOARD') ga ko'chirildi, sezilarli kengaytirilgan.

      // 2.5: Chiqindi — qidiruv + long-press multi-select, mavjud restore/purge API'lari saqlanadi.
      if (activePopupModal === 'TRASH') {
        const q = normalizeText(trashSearchQuery || '').latin;
        const allBatches = trashBatches || [];
        const batches = q ? allBatches.filter(b => trashBatchSearchText(b).includes(q)) : allBatches;
        container.innerHTML = `
          <div class="fc-sheet-overlay" onclick="activePopupModal=null; clearTrashBulkSelection();">
            <div class="fc-sheet fc-trash-sheet" onclick="event.stopPropagation(); if(trashActionMenuBatchId!==null) closeTrashActionMenu();">
              <div class="fc-sheet-handle"></div>
              <div class="fc-sheet-header">
                <div class="flex items-center gap-2"><span class="fc-section-icon"><i data-lucide="trash-2" class="w-4 h-4"></i></span><div><div class="fc-sheet-title">${tr('Chiqindi','Корзина')}</div><div class="fc-trash-subtitle">${tr('24 soat ichida tiklash mumkin','Можно восстановить в течение 24 часов')}</div></div></div>
                <button type="button" onclick="activePopupModal=null; clearTrashBulkSelection();" class="fc-icon-btn"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>
              <div class="fc-sheet-body fc-trash-body">
                <label class="fc-trash-search"><i data-lucide="search" class="w-4 h-4"></i><input value="${escapeHtml(trashSearchQuery)}" oninput="setTrashSearchQuery(this.value)" placeholder="${tr('Tovar yoki katalog qidirish','Поиск товара или каталога')}"></label>
                <p class="fc-trash-hint">${trashBulkSelectMode ? tr('Tanlash rejimi: kartalarni bir marta bosib belgilang.','Режим выбора: нажимайте карточки для выбора.') : tr('Tanlashni boshlash uchun kartani bosib turing.','Удерживайте карточку, чтобы начать выбор.')}</p>
                ${trashBatches === null ? `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`
                  : batches.length === 0 ? `<div class="fc-empty-state"><i data-lucide="${q ? 'search-x' : 'trash-2'}" class="w-8 h-8"></i><p>${q ? tr('Mos element topilmadi.','Ничего не найдено.') : tr("Chiqindi bo'sh.", 'Корзина пуста.')}</p></div>`
                  : `<div class="fc-trash-list">${batches.map(b => renderTrashBatchHtml(b)).join('')}</div>`}
              </div>
              ${trashBulkSelectMode ? `<div class="fc-trash-actions"><span>${trashSelectedBatchIds.size}</span><button onclick="restoreSelectedTrashBatches()" ${trashSelectedBatchIds.size ? '' : 'disabled'} aria-label="${tr('Tiklash','Восстановить')}"><i data-lucide="rotate-ccw" class="w-5 h-5"></i></button><button onclick="purgeSelectedTrashBatches()" ${trashSelectedBatchIds.size ? '' : 'disabled'} class="is-danger" aria-label="${tr('Butunlay o‘chirish','Удалить навсегда')}"><i data-lucide="trash-2" class="w-5 h-5"></i></button><button onclick="clearTrashBulkSelection()" aria-label="${tr('Tanlashni tugatish','Завершить выбор')}"><i data-lucide="x" class="w-5 h-5"></i></button></div>` : ''}
            </div>
          </div>`;
        return;
      }

      // 2.7: duplicate tovar NOMZODLARI — faqat aniqlash, avtomatik birlashtirish yo'q.
      if (activePopupModal === 'DUPLICATE_PRODUCTS') {
        const pairs = findDuplicateProductCandidates();
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-sm w-full max-h-[85vh] overflow-y-auto space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <div class="flex items-center justify-between border-b pb-2">
                <h3 class="font-bold text-sm text-gray-900">${tr("🧭 Duplicate tovar nomzodlari", "🧭 Возможные дубликаты")}</h3>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 px-3 py-1.5 rounded-xl font-bold">✕</button>
              </div>
              <p class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">${tr("Bu faqat aniqlash: bir xil katalogdagi juda yaqin nomli tovarlar ko'rsatiladi. Avtomatik birlashtirish (merge) hali yo'q — kerak bo'lsa qo'lda tekshirib, keragini o'chiring yoki tahrirlang.", "Это только обнаружение: показаны товары с очень похожими названиями в одном каталоге. Автоматическое объединение пока не реализовано — проверьте вручную.")}</p>
              ${pairs.length === 0 ? `<p class="text-center text-gray-400 py-6">${tr("Duplicate topilmadi.", "Дубликаты не найдены.")}</p>`
                : `<div class="space-y-2">${pairs.map(({ a, b, score }) => `
                    <div class="border rounded-xl p-2.5 space-y-1">
                      <p class="text-[10px] text-gray-400">${Math.round(score * 100)}% ${tr("o'xshash", "совпадение")}</p>
                      <button onclick="activePopupModal=null; openProductDetailModal('${a.id}');" class="w-full text-left font-bold text-blue-700">${escapeHtml(a.name)} <span class="text-gray-400 font-normal">(${escapeHtml(a.sku)})</span></button>
                      <button onclick="activePopupModal=null; openProductDetailModal('${b.id}');" class="w-full text-left font-bold text-blue-700">${escapeHtml(b.name)} <span class="text-gray-400 font-normal">(${escapeHtml(b.sku)})</span></button>
                    </div>
                  `).join('')}</div>`}
            </div>
          </div>`;
        return;
      }

      // 4-blok: do'kon dizayni — tayyor mavzular + qo'lda ranglar + kontrast ogohlantirish.
      // 10-band: DESIGN_SETTINGS endi modal emas — renderDesignSettingsPage()
      // (activePage='DESIGN_SETTINGS').

      if (activePopupModal === 'ADD_ADMIN') {
        container.innerHTML = `
          <div class="fc-sheet-overlay" onclick="if(event.target===this){activePopupModal=null;render();}">
            <div class="fc-sheet" onclick="event.stopPropagation()">
              <div class="fc-sheet-handle"></div>
              <div class="fc-sheet-header"><div><div class="fc-sheet-title">${tr("Yangi xodim", "Новый сотрудник")}</div><p class="fc-shop-info-subtitle">${tr("Hozircha xodim Admin huquqi bilan qo‘shiladi. Alohida huquqlar keyingi bosqichda.", "Пока сотрудник добавляется с правами администратора. Детальные права будут на следующем этапе.")}</p></div><button type="button" onclick="activePopupModal=null;render();" class="fc-btn fc-btn-icon"><i data-lucide="x" class="w-4 h-4"></i></button></div>
              <div class="fc-sheet-body">
                <label class="fc-mini-field"><span>${tr("Telegram ID raqami", "Telegram ID")}</span><input type="number" id="m-admin-id" placeholder="123456789"></label>
                <p class="fc-shop-field-help">${tr("Xodimning Telegram raqamli ID sini kiriting.", "Введите числовой Telegram ID сотрудника.")}</p>
              </div>
              <div class="fc-sheet-footer grid grid-cols-2 gap-2"><button type="button" onclick="activePopupModal=null;render();" class="fc-btn fc-btn-secondary">${tr("Bekor qilish", "Отмена")}</button><button type="button" onclick="saveAdminFromModal()" class="fc-btn fc-btn-primary"><i data-lucide="user-plus" class="w-4 h-4"></i>${tr("Qo‘shish", "Добавить")}</button></div>
            </div>
          </div>`;
        return;
      }

      if (activePopupModal === 'EDIT_PROD_FIELD') {
        const p = selectedProductModal;
        const field = editingFieldData;

        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2 flex items-center gap-1.5">${ICON_EDIT} ${tr("Ma'lumotni tahrirlash", "Редактирование данных")}</h3>

              ${field === 'name' ? `
                <label class="font-bold text-gray-600">${tr("Yangi nomi:", "Новое название:")}</label>
                <input type="text" id="ef-val" value="${escapeHtml(p.name)}" class="w-full p-2 border rounded-xl">
              ` : ''}

              ${field === 'price' ? `
                <div>
                  <label class="font-bold text-gray-600">${tr("Yangi sotuv narxi *", "Новая цена продажи *")}</label>
                  <input type="number" id="ef-price" value="${p.price}" class="w-full p-2 border rounded-xl">
                </div>
                <div class="mt-2">
                  <label class="font-bold text-gray-600">${tr("Eski narxi (Chegirma)", "Старая цена (скидка)")}</label>
                  <input type="number" id="ef-oldprice" value="${p.oldPrice || ''}" placeholder="${tr('Kattaroq narx','Старая/более высокая цена')}" class="w-full p-2 border rounded-xl">
                </div>
              ` : ''}

              ${field === 'stock' ? `
                <label class="font-bold text-gray-600">${tr("Yangi ombor qoldig'i:", "Новый остаток:")}</label>
                <input type="number" id="ef-val" value="${p.stock}" class="w-full p-2 border rounded-xl">
              ` : ''}

              ${field === 'desc' ? `
                <label class="font-bold text-gray-600">${tr("Yangi izoh / tavsif:", "Новое описание:")}</label>
                <textarea id="ef-val" rows="3" class="w-full p-2 border rounded-xl">${escapeHtml(p.desc || '')}</textarea>
              ` : ''}

              ${field === 'img' ? `
                <label class="font-bold text-gray-600">${tr("Tovar rasmi", "Фото товара")}</label>
                <input id="ef-image-input" type="file" accept="image/*" onchange="onImagePicked(event, 'ef-img-prev', 'ef-image-button', 'ef-image-url', 'ef-image-url-error')" class="hidden">
                <input id="ef-image-input-files" type="file" onchange="onImagePicked(event, 'ef-img-prev', 'ef-image-button', 'ef-image-url', 'ef-image-url-error')" class="hidden">
                <button id="ef-image-button" type="button" onclick="openImagePickerSheet('ef-image-input','ef-image-input-files')" class="fc-btn fc-btn-secondary w-full mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Xotiradan yuklash', 'Загрузить с устройства')}</button>
                <input id="ef-image-url" type="url" inputmode="url" oninput="onImageUrlInput(this.value, 'ef-img-prev', 'ef-image-url-error', 'ef-image-button')" placeholder="${tr('Rasm URL (ixtiyoriy)','URL изображения (необязательно)')}" class="w-full mt-2 p-2 border rounded-xl">
                <p id="ef-image-url-error" class="hidden mt-1 text-[10px] fc-text-danger"></p>
                <img id="ef-img-prev" src="${escapeHtml(hasProductImage(p) ? p.img : '')}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-24 h-24 object-cover rounded-xl mt-2 border ${hasProductImage(p) ? '' : 'hidden'}">
              ` : ''}

              ${(field === 'variants' || field === 'sizes') ? renderVariantBuilderHtml() : ''}

              <div class="flex space-x-2 pt-2">
                <button onclick="saveFieldEdit('${p.id}', '${field}')" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="cancelProductEditor()" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // BLOKLASH MODAL (bu tekshiruv "USER DETAILS MODAL"dan OLDIN turishi shart,
      // aks holda selectedUserModal hali ham to'ldirilgan bo'lgani uchun
      // eski mijoz kartochkasi qayta ko'rsatilib, bu oyna umuman ochilmaydi)
      if (activePopupModal === 'LOW_STOCK_SETTINGS') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">⚙️ ${tr("Kam qolgan chegarasi", "Порог «заканчивается»")}</h3>
              <div>
                <label class="font-bold text-gray-600">${tr("Nechi donadan kam bo'lsa \"Kam qolgan\" deb belgilansin?", "При каком остатке считать товар «заканчивается»?")}</label>
                <input type="number" min="0" step="1" id="low-stock-threshold-input" value="${escapeHtml(String(shopLowStockThreshold))}" class="w-full mt-1 p-2 border rounded-xl font-mono">
                <p class="text-[9px] text-gray-400 mt-1">${tr("Masalan: 5 — qoldiq 5 yoki undan kam bo'lsa \"Kam qolgan\"ga tushadi. Faqat shu do'kon uchun amal qiladi.", "Например: 5 — товар считается «заканчивается» при остатке 5 и менее. Действует только для этого магазина.")}</p>
              </div>
              <div class="flex space-x-2 pt-2">
                <button onclick="saveLowStockThreshold()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // Billz (billz.ai) integratsiyasi, 0/1-bosqich: ulash + do'kon/kassa/
      // to'lov turini tanlash. Faqat billzAccessGranted=true bo'lganda
      // ochiladi (openBillzSettings() orqali). Hech qanday token qiymati
      // bu yerda ko'rsatilmaydi — faqat server allaqachon tasdiqlagan
      // do'kon/kassa/to'lov NOMLARI (billzConnectionStatus'dan).
      if (activePopupModal === 'BILLZ_SETTINGS') {
        const st = billzConnectionStatus;
        const isConnected = st?.status === 'CONNECTED';
        const isLoading = st === null;
        const opts = billzConfigOptions;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2 flex items-center gap-1.5">🔳 Billz</h3>
              ${isLoading ? `
                <div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>
              ` : !isConnected ? `
                <p class="text-gray-500">${tr("Billz hisobingizdagi integratsiya kaliti (secret_token) kiriting. BILLZ UI'da: Sozlamalar → Ключи интеграции.", "Введите ключ интеграции (secret_token) вашего аккаунта Billz. В BILLZ UI: Настройки → Ключи интеграции.")}</p>
                ${st?.status === 'ERROR' && st?.lastError ? `<p class="fc-bg-danger-soft border fc-border-danger fc-text-danger p-2 rounded-xl">${escapeHtml(st.lastError)}</p>` : ''}
                <input type="password" id="billz-secret-token-input" autocomplete="off" placeholder="secret_token" class="w-full p-2 border rounded-xl font-mono">
                <button onclick="connectBillz()" id="billz-connect-btn" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Ulash", "Подключить")}</button>
              ` : `
                <div class="fc-bg-success-soft border fc-border-success fc-text-success p-2.5 rounded-xl font-bold">✅ ${tr("Ulangan", "Подключено")}</div>
                <div>
                  <label class="font-bold text-gray-600">${tr("Billz do'koni", "Магазин Billz")}</label>
                  <select id="billz-shop-select" class="w-full mt-1 p-2 border rounded-xl bg-gray-50">
                    <option value="">${tr("Tanlanmagan", "Не выбрано")}</option>
                    ${(opts?.shops || []).map(s => `<option value="${escapeHtml(s.id)}" ${st.billzShopName === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="font-bold text-gray-600">${tr("Kassa", "Касса")}</label>
                  <select id="billz-cashbox-select" class="w-full mt-1 p-2 border rounded-xl bg-gray-50">
                    <option value="">${tr("Tanlanmagan", "Не выбрано")}</option>
                    ${(opts?.cashboxes || []).map(c => `<option value="${escapeHtml(c.id)}" ${st.billzCashboxName === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="font-bold text-gray-600">${tr("To'lov turi", "Тип оплаты")}</label>
                  <select id="billz-payment-type-select" class="w-full mt-1 p-2 border rounded-xl bg-gray-50">
                    <option value="">${tr("Tanlanmagan", "Не выбрано")}</option>
                    ${(opts?.paymentTypes || []).map(p => `<option value="${escapeHtml(p.id)}" ${st.billzPaymentTypeName === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                  </select>
                </div>
                <p class="text-[9px] text-gray-400">${tr("Bu tanlovlar keyingi bosqichlarda (sotuvlarni Billz'ga yuborish) ishlatiladi.", "Эти настройки будут использоваться на следующих этапах (отправка продаж в Billz).")}</p>
                <button onclick="saveBillzSaleConfig()" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="disconnectBillz()" class="w-full text-center fc-text-danger font-bold py-2">${tr("Uzish", "Отключить")}</button>
              `}
              <button onclick="activePopupModal=null; billzConnectionStatus=null; billzConfigOptions=null; render();" class="w-full bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
            </div>
          </div>
        `;
        return;
      }

      // Click.uz avtomatik to'lov integratsiyasi — BILLZ_SETTINGS bilan bir
      // xil naqsh. Faqat clickAccessGranted=true bo'lganda ochiladi
      // (openClickSettings() orqali). Secret Key hech qanday javobda
      // qaytarilmaydi — bu yerda faqat maydonlarni kiritish shakli.
      if (activePopupModal === 'CLICK_SETTINGS') {
        const cst = clickConnectionStatus;
        const isClickConnected = cst?.status === 'CONNECTED';
        const isClickLoading = cst === null;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2 flex items-center gap-1.5">💳 Click</h3>
              ${isClickLoading ? `
                <div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>
              ` : !isClickConnected ? `
                <p class="text-gray-500">${tr("Click Merchant kabinetingizdagi ma'lumotlarni kiriting — mijozlar to'lagach buyurtma avtomatik tasdiqlanadi.", "Введите данные из вашего кабинета Click Merchant — заказ будет подтверждаться автоматически после оплаты.")}</p>
                <input type="text" id="click-merchant-id-input" autocomplete="off" placeholder="Merchant ID" class="w-full p-2 border rounded-xl font-mono">
                <input type="text" id="click-service-id-input" autocomplete="off" placeholder="Service ID" class="w-full p-2 border rounded-xl font-mono">
                <input type="text" id="click-merchant-user-id-input" autocomplete="off" placeholder="Merchant User ID" class="w-full p-2 border rounded-xl font-mono">
                <input type="password" id="click-secret-key-input" autocomplete="off" placeholder="Secret Key" class="w-full p-2 border rounded-xl font-mono">
                <button onclick="connectClick()" id="click-connect-btn" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Ulash", "Подключить")}</button>
              ` : `
                <div class="fc-bg-success-soft border fc-border-success fc-text-success p-2.5 rounded-xl font-bold">✅ ${tr("Ulangan", "Подключено")}</div>
                <p class="text-gray-500">${tr("Endi \"To'lov sozlamalari\"da \"Click orqali (avtomatik)\" metodini yoqishingiz mumkin.", "Теперь вы можете включить метод \"Click (автоматически)\" в настройках оплаты.")}</p>
                <button onclick="disconnectClick()" class="w-full text-center fc-text-danger font-bold py-2">${tr("Uzish", "Отключить")}</button>
              `}
              <button onclick="activePopupModal=null; clickConnectionStatus=null; render();" class="w-full bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
            </div>
          </div>
        `;
        return;
      }

      // Billz Phase 2: tanlangan tovarlarni qaysi UStorE katalogiga
      // import qilishni tasdiqlash + ixtiyoriy "eski narx" foizi.
      if (activePopupModal === 'BILLZ_IMPORT_CONFIRM') {
        const flatCats = categories.slice().sort((a, b) => categoryName(a).localeCompare(categoryName(b)));
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">🔳 ${tr("Import qilish", "Импорт")} (${billzBrowseSelectedIds.size})</h3>
              <div>
                <label class="font-bold text-gray-600">${tr("Qaysi katalogga qo'shilsin?", "В какой каталог добавить?")}</label>
                <select id="billz-import-category-select" class="w-full mt-1 p-2 border rounded-xl bg-gray-50">
                  <option value="">${tr("— Katalogsiz —", "— Без каталога —")}</option>
                  ${flatCats.map(c => `<option value="${escapeHtml(c.id)}" ${String(c.id) === String(billzImportTargetCategoryId) ? 'selected' : ''}>${escapeHtml(categoryName(c))}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="font-bold text-gray-600">${tr("Eski narx (chegirma ko'rinishi), ixtiyoriy", "Старая цена (для скидки), необязательно")}</label>
                <input type="text" id="billz-import-oldprice-input" placeholder="${tr("Masalan: 20 yoki 10-30", "Например: 20 или 10-30")}" class="w-full mt-1 p-2 border rounded-xl font-mono">
                <p class="text-[9px] text-gray-400 mt-1">${tr("Bitta son — hammasiga bir xil foiz. Oraliq (10-30) — har tovarga har xil, tabiiy ko'rinadigan foiz.", "Одно число — одинаковый процент всем. Диапазон (10-30) — разный процент для каждого товара, выглядит естественнее.")}</p>
              </div>
              <div class="flex space-x-2 pt-2">
                <button onclick="confirmBillzImport()" ${billzImporting ? 'disabled' : ''} class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">${billzImporting ? tr("Import qilinmoqda...", "Импортируется...") : tr("Tasdiqlash", "Подтвердить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'SHOP_LOGO_MANAGER') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("Logotip", "Логотип")}</h3>
              ${shopLogoUrl ? `<img src="${escapeHtml(shopLogoUrl)}" class="h-16 mx-auto rounded-xl bg-slate-50 p-1 border object-contain">` : ''}
              <input id="shop-logo-input" type="file" accept="image/*" class="hidden" onchange="saveShopLogoFromPicker(event)">
              <input id="shop-logo-input-files" type="file" class="hidden" onchange="saveShopLogoFromPicker(event)">
              <div class="flex items-center gap-2 flex-wrap justify-center">
                <button type="button" onclick="openImagePickerSheet('shop-logo-input','shop-logo-input-files')" class="fc-btn fc-btn-primary"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Xotiradan yuklash', 'Загрузить с устройства')}</button>
              </div>
              <button onclick="activePopupModal=null; render();" class="w-full bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'SHOP_LOGO_URL') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("Logotip — URL orqali", "Логотип — по URL")}</h3>
              <input id="shop-logo-url-input" type="url" inputmode="url" placeholder="https://..." value="${escapeHtml((shopLogoUrl && shopLogoUrl.startsWith('http')) ? shopLogoUrl : '')}" class="w-full p-2 border rounded-xl">
              <p id="shop-logo-url-error" class="hidden text-[10px] fc-text-danger"></p>
              <div class="flex space-x-2 pt-2">
                <button onclick="saveShopLogoFromUrl()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="closeShopLogoUrlModal()" class="fc-btn fc-btn-secondary">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'BLOCK_USER') {
        const u = selectedUserModal;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("🚫 Mijozni bloklash", "🚫 Заблокировать клиента")}</h3>
              <p class="text-gray-600">${tr("Mijoz:", "Клиент:")} <b>${escapeHtml(u.userName)}</b></p>
              <p class="fc-text-danger text-[11px]">${tr("⚠️ Bloklangan mijoz buyurtma bera olmaydi.", "⚠️ Заблокированный клиент не сможет оформлять заказы.")}</p>
              <div>
                <label class="font-bold text-gray-600">${tr("Sabab *", "Причина *")}</label>
                <select id="bl-reason" class="w-full mt-1 p-2 border rounded-xl bg-gray-50 font-bold">
                  <option value="${tr("To'lovda muammo bo'lgan", "Проблема с оплатой")}">${tr("To'lovda muammo bo'lgan", "Проблема с оплатой")}</option>
                  <option value="${tr("Buyurtmani qabul qilmagan/bekor qilgan", "Не принял/отменил заказ")}">${tr("Buyurtmani qabul qilmagan/bekor qilgan", "Не принял/отменил заказ")}</option>
                  <option value="${tr("Boshqa", "Другое")}">${tr("Boshqa", "Другое")}</option>
                </select>
              </div>
              <div>
                <label class="font-bold text-gray-600">${tr("Izoh (ixtiyoriy)", "Комментарий (необязательно)")}</label>
                <textarea id="bl-note" rows="2" placeholder="${tr("Qo'shimcha tushuntirish...",'Дополнительное пояснение...')}" class="w-full mt-1 p-2 border rounded-xl"></textarea>
              </div>
              <div class="flex gap-2 pt-2">
                <button onclick="submitBlockUser('${u.tgId}')" class="flex-1 fc-bg-danger text-white font-bold py-2.5 rounded-xl">${tr("🚫 Bloklash", "🚫 Заблокировать")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'ORDERS_CALENDAR') {
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const popW = Math.min(330, Math.max(280, vw - 24));
        const a = ordersCalendarAnchorRect || { left: vw - 56, right: vw - 12, top: 180, bottom: 224 };
        const left = Math.max(12, Math.min(vw - popW - 12, a.right - popW));
        const top = Math.max(82, Math.min((window.innerHeight || 700) - 465, a.bottom + 8));
        container.innerHTML = `<div class="fc-orders-popover-overlay" onclick="cancelOrdersCalendarSelection()"><div class="fc-orders-popover" style="left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(popW)}px" onclick="event.stopPropagation()">${renderOrdersCalendarBodyHtml()}</div></div>`;
        return;
      }

      // CHECKOUT FORM MODAL (savatchadan "Buyurtma berish" bosilganda ochiladi)
      if (activePopupModal === 'CHECKOUT_FORM') {
        const items = Object.entries(cart).map(([key, itemData]) => {
          const productId = cartEntryProductId(key, itemData);
          const p = products.find(prod => prod.id === productId);
          return p ? { ...p, key, qty: itemData.qty, size: itemData.size || null, color: itemData.color || null } : null;
        }).filter(Boolean);

        container.innerHTML = `
          <div class="fc-checkout-overlay" onclick="closeCheckoutForm();">
            <div class="fc-checkout-sheet" onclick="event.stopPropagation()">
              <div class="fc-sheet-handle"></div>
              <div class="fc-checkout-header">
                <div class="fc-checkout-heading">
                  <span class="fc-checkout-heading-icon"><i data-lucide="shopping-bag" class="w-5 h-5"></i></span>
                  <div><h3>${tr('Buyurtmani rasmiylashtirish','Оформление заказа')}</h3><p>${tr("Ma'lumotlarni tekshirib, yetkazib berish va to'lov usulini tanlang", 'Проверьте данные и выберите доставку и оплату')}</p></div>
                </div>
                <button type="button" onclick="closeCheckoutForm()" class="fc-checkout-close" aria-label="${tr('Yopish','Закрыть')}"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>

              <div class="fc-checkout-body">
                <section class="fc-checkout-section">
                  <div class="fc-checkout-section-head"><span><i data-lucide="user-round" class="w-4 h-4"></i></span><div><b>${tr("Mijoz ma'lumotlari",'Данные клиента')}</b><small>${tr("Bog'lanish uchun kerakli ma'lumotlar", 'Данные для связи')}</small></div></div>
                  <div class="fc-checkout-fields">
                    <label class="fc-checkout-field"><span>${tr("Ism va familiyangiz *", "Имя и фамилия *")}</span><div class="fc-checkout-input"><i data-lucide="user" class="w-4 h-4"></i><input type="text" id="chk-fullname" oninput="saveCheckoutDraft()" placeholder="Ali Valiyev"></div></label>
                    <label class="fc-checkout-field"><span>${tr("Telefon raqamingiz *", "Номер телефона *")}</span><div class="fc-checkout-input"><i data-lucide="phone" class="w-4 h-4"></i><input type="text" id="chk-phone" oninput="saveCheckoutDraft()" placeholder="+998 90 123 45 67" class="font-mono"></div></label>
                  </div>
                </section>

                <section class="fc-checkout-section">
                  <div class="fc-checkout-section-head"><span><i data-lucide="map-pin" class="w-4 h-4"></i></span><div><b>${tr('Yetkazib berish','Доставка')}</b><small>${tr('Hudud va yetkazib berish usulini tanlang','Выберите регион и способ доставки')}</small></div></div>
                  <div class="fc-checkout-fields">
                    <label class="fc-checkout-field"><span>${tr("Hududni tanlang *", "Выберите регион *")}</span><div class="fc-checkout-select"><i data-lucide="map" class="w-4 h-4"></i><select id="chk-region-key" onchange="handleRegionChange()">${TOP_LEVEL_REGIONS.map(region => `<option value="${escapeHtml(region.id)}">${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</option>`).join('')}</select><i data-lucide="chevron-down" class="w-4 h-4"></i></div></label>

                    <label id="chk-district-field" class="fc-checkout-field"><span>${tr("Tumanni tanlang *", "Выберите район *")}</span><div class="fc-checkout-select"><i data-lucide="navigation" class="w-4 h-4"></i><select id="chk-district" onchange="handleDistrictChange()"><option value="">${tr("— Tanlang —", "— Выберите —")}</option></select><i data-lucide="chevron-down" class="w-4 h-4"></i></div></label>

                    <div class="fc-checkout-field"><span>${tr("Yetkazib berish usuli *", "Способ доставки *")}</span><div id="delivery-method-wrap" class="fc-checkout-choice-grid"></div></div>
                    <div id="delivery-notice" class="hidden fc-checkout-notice"></div>

                    <label id="chk-address-field" class="fc-checkout-field"><span id="chk-address-label">${tr("Manzil *", "Адрес *")}</span><div class="fc-checkout-input"><i data-lucide="map-pinned" class="w-4 h-4"></i><input type="text" id="chk-address" oninput="saveCheckoutDraft()" placeholder="${tr("Ko'cha, mahalla va uy raqami",'Улица, махалля и номер дома')}"></div></label>

                    <div id="chk-branch-wrap" class="hidden fc-checkout-branch-wrap">
                      <label class="fc-checkout-field"><span>${tr("Filialni tanlang *", "Выберите филиал *")}</span><div class="fc-checkout-input"><i data-lucide="search" class="w-4 h-4"></i><input type="text" id="chk-branch-search" oninput="filterBranchList(this.value)" placeholder="${tr('Filial yoki tuman nomi bilan qidirish', 'Поиск по названию филиала или района')}"></div></label>
                      <div id="chk-branch-list" class="fc-checkout-branch-list"></div>
                      <div id="chk-branch-selected" class="hidden fc-checkout-branch-selected"></div>
                    </div>
                  </div>
                </section>

                <section class="fc-checkout-section">
                  <div class="fc-checkout-section-head"><span><i data-lucide="wallet-cards" class="w-4 h-4"></i></span><div><b>${tr("To'lov",'Оплата')}</b><small>${tr("Qulay to'lov usulini tanlang", 'Выберите удобный способ оплаты')}</small></div></div>
                  <div class="fc-checkout-field"><span>${tr("To'lov turi *", "Способ оплаты *")}</span><div id="pay-method-wrap" class="fc-checkout-choice-grid"></div></div>
                  <div id="card-payment-details" class="hidden fc-checkout-payment-details"></div>
                </section>

                <section class="fc-checkout-section">
                  <div class="fc-checkout-section-head"><span><i data-lucide="ticket-percent" class="w-4 h-4"></i></span><div><b>${tr('Promo-kod', 'Промокод')}</b><small>${tr("Bo'lsa, kodni kiriting", "Если есть, введите код")}</small></div></div>
                  <div id="chk-promo-wrap">${renderPromoWrapHtml()}</div>
                </section>

                <section class="fc-checkout-summary">
                  <div class="fc-checkout-summary-subtotal"><span>${tr('Tovarlar summasi', 'Сумма товаров')}</span><b id="checkout-subtotal"></b></div>
                  <div class="fc-checkout-summary-delivery"><span>${tr('Yetkazib berish narxi', 'Стоимость доставки')}</span><b id="checkout-delivery-fee"></b></div>
                  <div id="checkout-promo-row" class="fc-checkout-summary-discount hidden"><span>${tr('Promo chegirma', 'Скидка по промокоду')}</span><b id="checkout-promo-discount"></b></div>
                  <div class="fc-checkout-summary-total"><span>${tr("Hozir to'lanadigan jami", 'Итого к оплате сейчас')}</span><strong id="checkout-payable-total"></strong></div>
                </section>
              </div>

              <div class="fc-checkout-footer">
                ${ordersPaused ? `<div class="fc-checkout-notice" style="margin-bottom:.6rem"><b>${tr("Do'kon hozircha yangi buyurtmalarni qabul qilmayapti.", "Магазин временно не принимает новые заказы.")}</b>${ordersPausedNote ? `<br>${escapeHtml(ordersPausedNote)}` : ''}</div>` : ''}
                <button type="button" onclick="submitOrder()" class="fc-checkout-submit" ${ordersPaused ? 'disabled style="opacity:.5"' : ''}><i data-lucide="check-circle-2" class="w-5 h-5"></i><span>${tr('Buyurtma berish', 'Оформить заказ')}</span></button>
              </div>
            </div>
          </div>
        `;
        applyCheckoutDraftToForm();
        return;
      }

      // KATALOG FILTR/SARALASH PANELI
      if (activePopupModal === 'CAT_FILTER') {
        const activeSortMode = currentCategorySortMode();
        const sortRowClass = (mode) => activeSortMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600';
        const sortRow = (mode, label) => `
          <button onclick="setCategorySortMode('${mode}')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold ${sortRowClass(mode)}">
            <span>${label}</span><span>${activeSortMode === mode ? '✓' : ''}</span>
          </button>`;
        const pricePresetLabel = (min, max) => {
          if (!min) return tr(`${Number(max).toLocaleString('ru-RU')} so'mgacha`, `До ${Number(max).toLocaleString('ru-RU')}`);
          if (!max) return tr(`${Number(min).toLocaleString('ru-RU')} so'mdan yuqori`, `От ${Number(min).toLocaleString('ru-RU')}`);
          return `${Number(min).toLocaleString('ru-RU')}–${Number(max).toLocaleString('ru-RU')}`;
        };
        // Joriy kontekst (Bosh sahifa yoki Katalog sahifasi)dagi bazaviy ro'yxatga
        // filtrni qo'llab, natija sonini hisoblaydi — mavjud render funksiyalaridagi
        // (renderHome/renderCategories) bazaviy ro'yxat mantig'ini FAQAT o'qish
        // uchun takrorlaydi, ularning o'ziga tegilmaydi.
        let filterResultCount;
        if (currentTab === 'home') {
          let base = searchProducts(homeSearchQuery || '');
          if (!(homeSearchQuery || '').trim()) base = base.filter(p => p.isFeatured === true);
          filterResultCount = applyCategoryFilter(base).length;
        } else {
          const catBase = products.filter(p => p.categoryId === adminCatParentId && productVisibleInCurrentMode(p));
          filterResultCount = applyCategoryFilter(catBase).length;
        }
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="closeCategoryFilterModal();">
            <div class="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-xs max-h-[88vh] overflow-y-auto" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("Filtr va saralash", "Фильтр и сортировка")}</h3>

              <div>
                <label class="font-bold text-gray-600">${tr("Tovar qidirish", "Поиск товара")}</label>
                <input type="text" value="${escapeHtml(categoryFilter.search || '')}" oninput="categoryFilter.search=this.value; categoryPage=1;" placeholder="${escapeHtml(searchPlaceholderText())}" class="w-full mt-1 p-2.5 border rounded-xl">
              </div>

              <button onclick="toggleInStockOnlyFilter()" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold ${categoryFilter.inStockOnly ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">
                <span>${tr('Omborda bor (tugaganlarni yashirish)', 'В наличии (скрыть закончившиеся)')}</span><span>${categoryFilter.inStockOnly ? '✓' : ''}</span>
              </button>
              <button onclick="toggleDiscountOnlyFilter()" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold ${categoryFilter.discountOnly ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">
                <span>${tr('Faqat chegirmali tovarlar', 'Только товары со скидкой')}</span><span>${categoryFilter.discountOnly ? '✓' : ''}</span>
              </button>

              <div>
                <label class="font-bold text-gray-600">${tr("Narx oralig'i (so'm)", "Диапазон цен (сум)")}</label>
                <div class="flex items-center gap-2 mt-1">
                  <input type="number" inputmode="numeric" placeholder="${tr('Dan','От')}" value="${escapeHtml(categoryFilter.minPrice)}" oninput="setCategoryPriceBound('minPrice', this.value)" class="w-full p-2.5 border rounded-xl">
                  <span class="text-gray-400">—</span>
                  <input type="number" inputmode="numeric" placeholder="${tr('Gacha','До')}" value="${escapeHtml(categoryFilter.maxPrice)}" oninput="setCategoryPriceBound('maxPrice', this.value)" class="w-full p-2.5 border rounded-xl">
                </div>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  ${CATEGORY_PRICE_PRESETS.map(p => `
                    <button onclick="applyCategoryPricePreset('${p.min}','${p.max}')" class="px-2.5 py-1.5 rounded-lg font-bold text-[10px] ${String(categoryFilter.minPrice || '') === p.min && String(categoryFilter.maxPrice || '') === p.max ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${pricePresetLabel(p.min, p.max)}</button>
                  `).join('')}
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="font-bold text-gray-600">${tr("Saralash", "Сортировка")}</label>
                ${sortRow('priceAsc', tr("Narx: arzondan qimmatga", "Цена: сначала дешевле"))}
                ${sortRow('priceDesc', tr("Narx: qimmatdan arzonga", "Цена: сначала дороже"))}
                ${sortRow('new', tr("Eng yangi", "Сначала новые"))}
                ${sortRow('sold', tr("Ko'p sotilgan", "Популярное"))}
              </div>

              <div class="flex gap-2 pt-1">
                <button onclick="clearCategoryFilter()" class="flex-1 bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5">${ICON_TRASH} ${tr("Tozalash", "Сбросить")}</button>
                <button onclick="closeCategoryFilterModal()" class="flex-[2] bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr(`Natijalarni ko'rish (${filterResultCount} ta)`, `Показать результаты (${filterResultCount})`)}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // PRODUCT DETAILS MODAL
      if (selectedProductModal) {
        const p = selectedProductModal;
        const inCart = cart[p.id];
        const hasDiscount = p.oldPrice && p.oldPrice > p.price;

        container.innerHTML = `
          <div class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="selectedProductModal=null; render();">
            <div class="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl" onclick="event.stopPropagation()">
              <div class="relative">
                <div class="w-full h-48 rounded-2xl border bg-gray-50 overflow-hidden flex items-center justify-center p-2">
                  <img src="${escapeHtml(p.img || FALLBACK_IMG.replace('150','300'))}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-full h-full object-contain">
                </div>
                ${(isAdminMode && isUserAnAdmin) ? `
                  <button onclick="openEditFieldModal('${p.id}', 'img')" class="absolute bottom-2 right-2 bg-blue-600 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-xl flex items-center space-x-1 shadow">
                    <span class="inline-flex items-center gap-1">${ICON_EDIT} ${tr("Rasmni o'zgartirish", "Изменить фото")}</span>
                  </button>
                ` : ''}
              </div>

              <div class="space-y-1">
                <div class="flex justify-between items-center gap-1">
                  ${(isAdminMode && isUserAnAdmin) ? `<span class="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">ID: ${escapeHtml(p.sku)}</span>` : '<span></span>'}
                  ${(isAdminMode && isUserAnAdmin) ? `
                    <div class="flex gap-1">
                      <button onclick="duplicateProduct('${p.id}')" class="text-xs bg-slate-50 text-slate-600 font-bold px-2 py-1 rounded-lg">${tr("📄 Nusxalash", "📄 Копировать")}</button>
                      <button onclick="deleteProduct('${p.id}'); selectedProductModal=null; render();" class="text-xs fc-bg-danger-soft fc-text-danger font-bold px-2 py-1 rounded-lg flex items-center gap-1">${ICON_TRASH} ${tr("O'chirish", "Удалить")}</button>
                    </div>
                  ` : ''}
                </div>

                <!-- NAME WITH EDIT -->
                <div class="flex justify-between items-center pt-1">
                  <h2 class="text-lg font-black text-gray-900">${escapeHtml(productName(p))}</h2>
                  ${(isAdminMode && isUserAnAdmin) ? `<button onclick="openEditFieldModal('${p.id}', 'name')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${ICON_EDIT}</button>` : ''}
                </div>

                <!-- PRICE WITH EDIT -->
                <div class="flex justify-between items-center pt-1">
                  <div>
                    ${hasDiscount ? `
                      <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-400 line-through font-bold">${money(p.oldPrice)}</span>
                        <span class="text-base fc-text-danger font-black">${money(p.price)}</span>
                      </div>
                    ` : `
                      <p class="text-base font-black text-blue-600">${money(p.price)}</p>
                    `}
                  </div>
                  ${(isAdminMode && isUserAnAdmin) ? `<button onclick="openEditFieldModal('${p.id}', 'price')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${ICON_EDIT}</button>` : ''}
                </div>
                ${(isAdminMode && isUserAnAdmin) ? `<button onclick="openPriceHistoryModal('${p.id}')" class="text-[10px] text-gray-400 underline">${tr("🕘 Narx tarixi", "🕘 История цен")}</button>` : ''}

                <!-- STOCK WITH EDIT -->
                ${(isAdminMode && isUserAnAdmin) ? `
                  <div class="flex justify-between items-center pt-1 text-xs">
                    <span class="font-bold text-gray-600">${tr("Ombor qoldig'i:", "Остаток на складе:")} <b class="${p.stock > 0 ? 'text-green-600' : 'fc-text-danger'}">${p.stock} ${tr('ta','шт.')}</b></span>
                    ${productVariants(p).length ? '' : `<button onclick="openEditFieldModal('${p.id}', 'stock')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${ICON_EDIT}</button>`}
                  </div>
                  <div class="flex justify-between items-start gap-2 pt-1 text-xs">
                    <span class="font-bold text-gray-600 flex-1">${tr("Variantlar:", "Варианты:")} <b>${productVariants(p).length ? escapeHtml(productVariants(p).map(v => `${variantLabel(v)} (${v.qty} ${tr('ta','шт.')}, ID:${v.sku})`).join(', ')) : tr('kiritilmagan','не указано')}</b></span>
                    <button onclick="openEditFieldModal('${p.id}', 'variants')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${ICON_EDIT}</button>
                  </div>
                  <div class="flex justify-between items-center pt-1 text-xs">
                    <span class="font-bold text-gray-600">${tr("Katalog:", "Каталог:")} <b>${escapeHtml(categoryName(categories.find(c => c.id === p.categoryId)) || tr('belgilanmagan','не указан'))}</b></span>
                    <button onclick="openMoveProductModal('${p.id}')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${tr('Ko\'chirish','Переместить')}</button>
                  </div>
                  <div class="flex justify-between items-center pt-1 text-xs">
                    <span class="font-bold text-gray-600">${tr("Belgi:", "Метка:")} <b>${p.badge ? escapeHtml(productBadgeLabel(p.badge)) : tr("yo'q","нет")}</b></span>
                    <button onclick="openProductBadgePicker('${p.id}')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${ICON_EDIT}</button>
                  </div>
                ` : ''}
              </div>

              <!-- TAVSIF WITH EDIT (faqat admin — mijoz uchun 25-band tartibida pastda, o'qish-only) -->
              ${(isAdminMode && isUserAnAdmin) ? `
                <div class="bg-gray-50 p-3 rounded-2xl border text-xs space-y-1 relative">
                  <div class="flex justify-between items-center">
                    <h4 class="font-bold text-gray-700">${tr("📝 Tavsif / Izoh:", "📝 Описание:")}</h4>
                    <button onclick="openEditFieldModal('${p.id}', 'desc')" class="text-xs p-1 bg-blue-50 text-blue-600 rounded-lg font-bold">${ICON_EDIT}</button>
                  </div>
                  <p class="text-gray-600 leading-relaxed">${escapeHtml(productDesc(p) || tr('Tavsif kiritilmagan.','Описание не указано.'))}</p>
                </div>
              ` : ''}

              ${!isAdminMode ? `
                <!-- 25-band: mijoz uchun tartib — rasm/nom/narx (yuqorida) -> mavjudlik -> variant/savatga -> tavsif -> sevimli -> o'xshash. -->
                <div class="flex items-center gap-1.5 text-xs font-bold ${p.stock > 0 ? 'fc-text-success' : 'fc-text-danger'}">
                  <i data-lucide="${p.stock > 0 ? 'check-circle' : 'x-circle'}" class="w-3.5 h-3.5"></i>
                  ${p.stock > 0 ? tr('Omborda bor', 'В наличии') : tr('Mahsulot tugagan', 'Товара нет в наличии')}
                </div>

                <div>
                  ${p.stock > 0 ? (
                    productVariants(p).length > 0 ? `
                      <div class="space-y-2">
                        <p class="text-xs font-bold text-gray-600">${t('choose_variant')} ${tr('(bir nechtasini tanlash mumkin):','(можно выбрать несколько):')}</p>
                        <div class="grid grid-cols-2 gap-2">
                          ${productVariants(p).map((v, vIdx) => {
                            const k = variantKey(v.size, v.color);
                            const selected = !!selectedVariantQtys[k];
                            const qty = selectedVariantQtys[k] || 0;
                            const disabled = !v.qty || Number(v.qty) <= 0;
                            return `
                              <div class="border rounded-xl p-2 ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}">
                                <button ${disabled ? 'disabled' : `onclick="toggleVariantSelect(${vIdx})"`}
                                  class="w-full px-2 py-1.5 rounded-lg font-bold text-xs ${disabled ? 'bg-gray-100 text-gray-300' : (selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-700')}">
                                  ${escapeHtml(variantLabel(v))}
                                </button>
                                <p class="text-[9px] text-center mt-1 text-gray-400">${v.qty} ${tr('ta','шт.')}</p>
                                ${selected ? `
                                  <div class="flex items-center justify-center gap-2 mt-1.5">
                                    <button onclick="setVariantQty(${vIdx}, -1)" class="w-7 h-7 bg-white font-bold rounded-lg shadow text-sm text-blue-600">-</button>
                                    <span class="font-bold text-sm w-5 text-center">${qty}</span>
                                    <button onclick="setVariantQty(${vIdx}, 1)" class="w-7 h-7 bg-blue-600 font-bold rounded-lg text-sm text-white">+</button>
                                  </div>
                                ` : ''}
                              </div>
                            `;
                          }).join('')}
                        </div>
                        <button onclick="addSelectedVariantsToCart('${p.id}'); openProductDetailModal('${p.id}');" class="w-full bg-blue-600 text-white font-bold py-3 rounded-2xl text-sm">🛒 ${t('add_to_cart')}</button>
                      </div>
                    ` : (
                    inCart ? `
                      <div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-2xl p-2">
                        <button onclick="changeCartQty('${p.id}', -1, event); openProductDetailModal('${p.id}');" class="w-10 h-10 bg-white font-bold rounded-xl shadow text-base text-blue-600">-</button>
                        <span class="font-bold text-base text-blue-800">${inCart.qty} ${tr('ta savatda','шт. в корзине')}</span>
                        <button onclick="changeCartQty('${p.id}', 1, event); openProductDetailModal('${p.id}');" class="w-10 h-10 bg-blue-600 font-bold rounded-xl text-base text-white">+</button>
                      </div>
                    ` : `
                      <button onclick="addToCart('${p.id}', event); openProductDetailModal('${p.id}');" class="w-full bg-blue-600 text-white font-bold py-3 rounded-2xl text-sm">🛒 ${t('add_to_cart')}</button>
                    `
                  )) : `<div class="space-y-2"><button disabled class="w-full bg-gray-100 text-gray-400 font-bold py-3 rounded-2xl text-sm">${tr("❌ Mahsulot tugagan", "❌ Товар закончился")}</button>${renderStockSubscribeButtonHtml(p)}</div>`}
                </div>

                ${productDesc(p) ? `
                  <div class="bg-gray-50 p-3 rounded-2xl border text-xs space-y-1">
                    <h4 class="font-bold text-gray-700">${tr("📝 Tavsif", "📝 Описание")}</h4>
                    <p class="text-gray-600 leading-relaxed">${escapeHtml(productDesc(p))}</p>
                  </div>
                ` : ''}

                <button onclick="toggleFavorite('${p.id}', event)" class="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border font-bold text-xs ${favoriteProductIds.has(p.id) ? 'fc-bg-danger-soft fc-border-danger fc-text-danger' : 'bg-white border-gray-200 text-gray-600'}">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="${favoriteProductIds.has(p.id) ? '#ef4444' : 'none'}" stroke="${favoriteProductIds.has(p.id) ? '#ef4444' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"></path></svg>
                  ${favoriteProductIds.has(p.id) ? tr('Sevimlilarda', 'В избранном') : tr('Sevimlilarga qo‘shish', 'Добавить в избранное')}
                </button>

                ${renderSimilarProductsBlockHtml(p)}
              ` : ''}
            </div>
          </div>
        `;
        return;
      }

      // 14-band: chekni rad etish — sabab kiritish oynasi.
      if (activePopupModal === 'REJECT_RECEIPT') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; rejectReceiptOrderId=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">❌ ${tr('Chekni rad etish', 'Отклонить чек')}</h3>
              <div>
                <label class="font-bold text-gray-600">${tr('Rad etish sababi *', 'Причина отклонения *')}</label>
                <textarea id="rr-reason" rows="3" placeholder="${tr('Masalan: rasm noaniq, summa mos emas...', 'Например: изображение нечёткое, сумма не совпадает...')}" class="w-full mt-1 p-2.5 border rounded-xl"></textarea>
              </div>
              <div class="flex gap-2 pt-1">
                <button onclick="submitRejectReceipt()" class="flex-1 fc-bg-danger text-white font-bold py-2.5 rounded-xl">❌ ${tr('Rad etish', 'Отклонить')}</button>
                <button onclick="activePopupModal=null; rejectReceiptOrderId=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr('Bekor qilish', 'Отмена')}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // 15-band: rad etilgan chekni qayta yuborish oynasi.
      if (activePopupModal === 'RESUBMIT_RECEIPT') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="closeResubmitReceiptModal();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">📎 ${tr('Yangi chek yuborish', 'Отправить новый чек')}</h3>
              <div>
                <label class="block font-bold">${tr("To'lov cheki/skrinshoti *", 'Чек/скриншот оплаты *')}</label>
                <input id="resubmit-receipt-input" type="file" accept="image/*" onchange="onResubmitReceiptPicked(event)" class="hidden">
                <input id="resubmit-receipt-input-files" type="file" onchange="onResubmitReceiptPicked(event)" class="hidden">
                ${resubmitReceiptPreviewUrl ? `
                  <div class="flex items-center gap-3 mt-1">
                    <img src="${resubmitReceiptPreviewUrl}" class="h-16 w-16 object-cover rounded-xl border" alt="">
                    <button type="button" onclick="openImagePickerSheet('resubmit-receipt-input','resubmit-receipt-input-files')" class="fc-btn fc-btn-secondary" style="min-height:2.5rem;padding:0 .875rem"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Almashtirish', 'Заменить')}</button>
                  </div>
                ` : `
                  <button type="button" onclick="openImagePickerSheet('resubmit-receipt-input','resubmit-receipt-input-files')" class="fc-btn fc-receipt-picker-btn mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Chekni tanlash', 'Выбрать чек')}</button>
                `}
              </div>
              <div class="flex gap-2 pt-1">
                <button onclick="submitResubmitReceipt()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">✅ ${tr('Yuborish', 'Отправить')}</button>
                <button onclick="closeResubmitReceiptModal()" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr('Bekor qilish', 'Отмена')}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      // POLISH ROUND 1-bosqich: Qo'llab-quvvatlash endi modal emas, to'liq
      // sahifa (page-shell) — renderSupportPage() ga ko'chirildi (activePage='SUPPORT').

      // ORDER DETAILS MODAL
      if (selectedOrderModal) {
        const o = selectedOrderModal;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="selectedOrderModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <div class="fc-order-modal-head"><div><h3>${tr('Buyurtma','Заказ')} #${o.id}</h3><p>${escapeHtml(o.date)}</p></div><span class="fc-order-status ${statusColorClass(orderDisplayStatus(o))}">${statusLabel(orderDisplayStatus(o))}</span></div>
              <section class="fc-order-section"><div class="fc-order-section-title"><i data-lucide="user-round" class="w-4 h-4"></i>${tr('Mijoz','Клиент')}</div><div class="fc-order-kv"><span>${tr('Ism','Имя')}</span><b>${escapeHtml(o.user)}</b></div><div class="fc-order-kv"><span>${tr('Telefon','Телефон')}</span><b>${escapeHtml(o.phone)}</b></div></section>
              ${(isAdminMode && isUserAnAdmin) ? `<section class="fc-order-section"><div class="fc-order-section-title"><i data-lucide="sticky-note" class="w-4 h-4"></i>${tr("Ichki izoh (faqat xodimlar ko'radi)", "Внутренняя заметка (видна только сотрудникам)")}</div><textarea id="order-internal-note-${o.id}" rows="2" placeholder="${tr('Masalan: mijoz 18:00 dan keyin yetkazishni so\'radi','Например: клиент просил доставить после 18:00')}" class="w-full p-2 border rounded-xl text-xs" onclick="event.stopPropagation()">${escapeHtml(o.internalNote || '')}</textarea><button type="button" onclick="event.stopPropagation(); saveOrderInternalNote(${o.id})" class="fc-btn fc-btn-secondary w-full"><i data-lucide="save" class="w-3.5 h-3.5"></i>${tr('Saqlash','Сохранить')}</button></section>` : ''}
              <section class="fc-order-section"><div class="fc-order-section-title"><i data-lucide="truck" class="w-4 h-4"></i>${tr('Yetkazib berish','Доставка')}</div><div class="fc-order-kv"><span>${tr('Hudud','Регион')}</span><b>${escapeHtml(o.delivery?.regionLabel || regionLabel(o.region))}${o.district?` · ${escapeHtml(districtLabelForUi(o.district))}`:''}</b></div>${o.address?`<div class="fc-order-kv"><span>${tr('Manzil','Адрес')}</span><b>${escapeHtml(o.address)}</b></div>`:''}<div class="fc-order-kv"><span>${tr('Usul','Способ')}</span><b>${escapeHtml(deliverySnapshotLabel(o))}</b></div>${Number(o.deliveryFee) > 0 ? `<div class="fc-order-delivery-fee fc-order-delivery-fee-detail">${tr('Yetkazib berish narxi','Стоимость доставки')}: <b>${money(o.deliveryFee)}</b></div>` : ''}<div class="fc-order-kv"><span>${tr('Jo‘natma holati','Статус отправления')}</span><b>${escapeHtml(effectiveShipmentStatusLabel(o))}</b></div></section>
              <section class="fc-order-section"><div class="fc-order-section-title"><i data-lucide="credit-card" class="w-4 h-4"></i>${tr('To‘lov','Оплата')}</div><div class="fc-order-kv"><span>${tr('Usul','Способ')}</span><b>${escapeHtml(o.payment?.label || payMethodLabel(o.payMethod))}</b></div></section>
              <section class="fc-order-section"><div class="fc-order-section-title"><i data-lucide="package" class="w-4 h-4"></i>${tr('Tovarlar','Товары')}</div><div class="fc-order-items">${o.items.map(i=>`<div class="fc-order-item">${i.img?`<img src="${escapeHtml(i.img)}" onerror="this.style.display='none'" loading="lazy">`:`<span class="fc-order-item-placeholder"><i data-lucide="package" class="w-4 h-4"></i></span>`}<div><b>${escapeHtml(orderItemName(i))}</b><small>${(i.sku&&isAdminMode&&isUserAnAdmin)?`ID: ${escapeHtml(i.sku)} · `:''}${i.qty} × ${money(i.price)}</small></div><strong>${money(i.price*i.qty)}</strong></div>`).join('')}</div></section>
              <section class="fc-order-summary-card"><div class="is-subtotal"><span>${tr('Tovarlar summasi','Сумма товаров')}</span><b>${money(o.subtotal ?? o.totalPrice)}</b></div><div class="is-delivery"><span>${tr('Yetkazib berish narxi','Стоимость доставки')}</span><b>${Number(o.deliveryFee)>0?money(o.deliveryFee):money(0)}</b></div>${Number(o.promoDiscount) > 0 ? `<div class="is-discount"><span>${tr('Promo chegirma','Скидка по промокоду')} (${escapeHtml(o.promoCode || '')})</span><b>-${money(o.promoDiscount)}</b></div>` : ''}<div class="is-total"><span>${tr("Hozir to'lanadigan jami",'Итого к оплате сейчас')}</span><strong>${money(o.payableTotal ?? o.totalPrice)}</strong></div></section>

              ${(!isAdminMode && o.status === 'PROCESSING') ? `<button onclick="confirmOrderReceived(${o.id})" class="fc-btn fc-btn-primary w-full"><i data-lucide="package-check" class="w-4 h-4"></i>${tr("Qabul qildim", "Я получил(а)")}</button>` : ''}
              ${!isAdminMode ? `<button onclick="reorderFromOrder(${o.id})" class="fc-btn fc-btn-secondary w-full"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>${tr('Qayta buyurtma', 'Повторить заказ')}</button>` : ''}
              ${(!isAdminMode && returnRequestsEnabled) ? `<button onclick="openSupportModal(${o.id}, 'RETURN')" class="fc-btn fc-btn-secondary w-full"><i data-lucide="package-x" class="w-4 h-4"></i>${tr("Qaytarish / muammo bo'yicha murojaat", "Обращение по возврату / проблеме")}</button>` : ''}

              ${o.delivery?.warning ? `<div class="fc-order-note is-warning"><i data-lucide="info" class="w-4 h-4"></i><span>${escapeHtml(o.delivery.warning)}</span></div>` : ''}
              ${o.delivery?.comment ? `<div class="fc-order-note is-info"><i data-lucide="message-square-text" class="w-4 h-4"></i><span>${escapeHtml(o.delivery.comment)}</span></div>` : ''}

              <div class="bg-slate-50 border rounded-xl p-2.5 space-y-1">
                <p class="font-bold flex items-center gap-1.5"><i data-lucide="truck" class="w-4 h-4 text-blue-600"></i>${tr('Jo‘natma holati','Статус отправления')}: ${escapeHtml(effectiveShipmentStatusLabel(o))}</p>
                ${o.shipment?.kind === 'TAXI' && o.shipment?.carNumber ? `<p>${tr('Mashina','Машина')}: <b>${escapeHtml(o.shipment.carNumber)}</b></p><p>${tr('Haydovchi','Водитель')}: ${escapeHtml(o.shipment.driverPhone || '')}${o.shipment.driverName ? ` · ${escapeHtml(o.shipment.driverName)}` : ''}</p>` : ''}
                ${o.shipment?.kind === 'POST' && o.shipment?.trackingNumber ? `<p>${tr("Jo'natma raqami",'Трек-номер')}: <b>${escapeHtml(o.shipment.trackingNumber)}</b></p>${o.shipment.shippedAt ? `<p>${tr("Jo'natilgan sana",'Дата отправки')}: <b>${new Date(o.shipment.shippedAt).toLocaleDateString()}</b></p>` : ''}${o.shipment.originBranch ? `<p>${tr('Yuborilgan filial','Филиал отправки')}: ${escapeHtml(o.shipment.originBranch)}</p>` : ''}` : ''}
              </div>

              ${(isAdminMode && isUserAnAdmin && o.hasReceipt) ? `<button onclick="openOrderReceipt(${o.id})" class="w-full bg-blue-50 text-blue-700 border border-blue-200 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5"><i data-lucide="receipt-text" class="w-4 h-4"></i>${tr("To'lov chekini ochish", 'Открыть чек оплаты')}</button>` : ''}
              ${(isAdminMode && isUserAnAdmin && o.receiptSentToTelegram && botUsername) ? `<button onclick="openReceiptInTelegram()" class="w-full bg-sky-50 text-sky-700 border border-sky-200 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5"><i data-lucide="send" class="w-4 h-4"></i>${tr("Telegramda ko'rish", 'Смотреть в Telegram')}</button>` : ''}
              ${(isAdminMode && isUserAnAdmin && o.hasReceipt && o.status !== 'CANCELLED' && (o.receiptReviewStatus || 'PENDING') === 'PENDING') ? `
                <div class="grid grid-cols-2 gap-2">
                  <button onclick="approvePaymentReceipt(${o.id})" class="bg-emerald-600 text-white font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1"><i data-lucide="check" class="w-4 h-4"></i>${tr('Tasdiqlash', 'Подтвердить')}</button>
                  <button onclick="openRejectReceiptModal(${o.id})" class="fc-bg-danger text-white font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1"><i data-lucide="x" class="w-4 h-4"></i>${tr('Rad etish', 'Отклонить')}</button>
                </div>
              ` : ''}

              ${(isAdminMode && isUserAnAdmin && o.delivery?.kind === 'TAXI' && o.status !== 'CANCELLED') ? `
                <div class="border-t pt-2 space-y-2">
                  <p class="font-black flex items-center gap-1.5"><i data-lucide="car-taxi-front" class="w-4 h-4 text-blue-600"></i>${tr('Taksi ma’lumoti','Данные такси')}</p>
                  <input id="shipment-car" value="${escapeHtml(o.shipment?.carNumber || '')}" placeholder="01 A 123 BC" class="w-full p-2 border rounded-xl uppercase">
                  <input id="shipment-phone" value="${escapeHtml(o.shipment?.driverPhone || '')}" placeholder="+998 90 123 45 67" class="w-full p-2 border rounded-xl font-mono">
                  <input id="shipment-driver" value="${escapeHtml(o.shipment?.driverName || '')}" placeholder="${tr('Haydovchi ismi (ixtiyoriy)','Имя водителя (необязательно)')}" class="w-full p-2 border rounded-xl">
                  <select id="shipment-status" class="w-full p-2 border rounded-xl bg-gray-50">${o.shipment?.status === 'READY' || !o.shipment?.status ? `<option value="READY" selected disabled hidden>${tr('— Hali harakat qilinmagan —','— Действие ещё не выполнено —')}</option>` : ''}<option value="TAXI_ASSIGNED" ${o.shipment?.status === 'TAXI_ASSIGNED' ? 'selected' : ''}>${tr('Taksi biriktirildi','Такси назначено')}</option><option value="IN_TRANSIT" ${o.shipment?.status === 'IN_TRANSIT' ? 'selected' : ''}>${tr("Yo'lga chiqdi",'В пути')}</option><option value="DELIVERED" ${o.shipment?.status === 'DELIVERED' ? 'selected' : ''}>${tr('Yetkazildi','Доставлено')}</option></select>
                  <button onclick="saveShipmentForOrder(${o.id})" class="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5"><i data-lucide="save" class="w-4 h-4"></i>${tr('Jo‘natmani saqlash','Сохранить отправление')}</button>
                </div>` : ''}

              ${(isAdminMode && isUserAnAdmin && o.delivery?.kind === 'POST' && o.status !== 'CANCELLED') ? `
                <div class="border-t pt-2 space-y-2">
                  <p class="font-black flex items-center gap-1.5"><i data-lucide="package-check" class="w-4 h-4 text-blue-600"></i>${escapeHtml(o.delivery.providerName || tr('Pochta','Почта'))}</p>
                  ${o.delivery.branchName ? `<p class="text-[11px] text-gray-600">${tr('Mijoz tanlagan filial','Филиал, выбранный клиентом')}: <b>${escapeHtml(o.delivery.branchName)}</b></p>` : ''}
                  <input id="shipment-tracking" value="${escapeHtml(o.shipment?.trackingNumber || '')}" placeholder="${tr("Tracking/jo'natma raqami",'Трек-номер')}" class="w-full p-2 border rounded-xl font-mono">
                  <select id="shipment-status" class="w-full p-2 border rounded-xl bg-gray-50">${o.shipment?.status === 'READY' || !o.shipment?.status ? `<option value="READY" selected disabled hidden>${tr('— Hali harakat qilinmagan —','— Действие ещё не выполнено —')}</option>` : ''}<option value="HANDED_TO_CARRIER" ${o.shipment?.status === 'HANDED_TO_CARRIER' ? 'selected' : ''}>${tr('Pochtaga topshirildi','Передано почте')}</option></select>
                  <button onclick="saveShipmentForOrder(${o.id})" class="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5"><i data-lucide="save" class="w-4 h-4"></i>${tr('Jo‘natmani saqlash','Сохранить отправление')}</button>
                </div>` : ''}

              ${o.status === 'CANCELLED' && o.cancelReason ? `
                <div class="fc-bg-danger-soft border fc-border-danger p-2.5 rounded-xl text-[11px] fc-text-danger">
                  <div class="flex items-start gap-1.5"><i data-lucide="circle-x" class="w-4 h-4 shrink-0 mt-0.5"></i><span>${tr('Bekor qilindi','Отменён')} (${o.cancelledBy === 'ADMIN' ? tr("do'kon tomonidan",'магазином') : tr('mijoz tomonidan','клиентом')}): ${escapeHtml(o.cancelReason)}</span></div>
                </div>
              ` : ''}

              ${o.receiptReviewStatus === 'REJECTED' ? `
                <div class="fc-bg-danger-soft border fc-border-danger p-2.5 rounded-xl text-[11px] fc-text-danger space-y-2">
                  <p class="flex items-start gap-1.5"><i data-lucide="circle-x" class="w-4 h-4 shrink-0"></i><span>${tr('Chek rad etildi', 'Чек отклонён')}${o.receiptRejectReason ? `: ${escapeHtml(o.receiptRejectReason)}` : ''}</span></p>
                  ${!isAdminMode ? `
                    <div class="flex gap-2">
                      <button onclick="openResubmitReceiptModal(${o.id})" class="flex-1 bg-blue-600 text-white font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1"><i data-lucide="paperclip" class="w-4 h-4"></i>${tr('Yangi chek yuborish', 'Отправить новый чек')}</button>
                      <button onclick="openSupportModal(${o.id})" class="flex-1 bg-white border fc-border-danger fc-text-danger font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1"><i data-lucide="life-buoy" class="w-4 h-4"></i>${tr("Qo'llab-quvvatlash", 'Поддержка')}</button>
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              ${(isAdminMode && isUserAnAdmin && !['DELIVERED','CANCELLED'].includes(o.status)) ? `
                <div class="border-t pt-2 space-y-2">
                  <label class="font-bold text-gray-700">${tr("Tezkor status o'zgartirish:", "Быстро изменить статус:")}</label>
                  <div class="grid grid-cols-2 gap-2">
                    ${o.status === 'NEW' ? `<button onclick="updateOrderStatus(${o.id}, 'PROCESSING')" class="bg-blue-600 text-white font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1"><i data-lucide="clock-3" class="w-4 h-4"></i>${tr("Jarayonda", "В обработке")}</button>` : ''}
                    <button onclick="updateOrderStatus(${o.id}, 'DELIVERED')" class="bg-green-600 text-white font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1 ${o.status === 'PROCESSING' ? 'col-span-2' : ''}"><i data-lucide="check-check" class="w-4 h-4"></i>${tr("Yetkazib berilgan", "Доставлен")}</button>
                    <button onclick="updateOrderStatus(${o.id}, 'CANCELLED')" class="fc-bg-danger text-white font-bold py-2 rounded-xl text-[11px] col-span-2 flex items-center justify-center gap-1"><i data-lucide="x" class="w-4 h-4"></i>${tr("Bekor qilish", "Отмена")}</button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
        return;
      }

      // USER (MIJOZ) DETAILS MODAL
      if (selectedUserModal) {
        const u = selectedUserModal;
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="selectedUserModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-md w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <div class="flex justify-between items-center border-b pb-2">
                <h3 class="font-black text-sm text-blue-600">${escapeHtml(u.userName)}</h3>
                <button onclick="selectedUserModal=null; render();" class="text-xs bg-gray-100 font-bold px-2.5 py-1 rounded-xl">✕</button>
              </div>
              <p>📞 <b>${tr("Tel:", "Тел:")}</b> ${escapeHtml(u.phone || '-')}</p>
              <p>🆔 <b>${tr("Telegram ID:", "Telegram ID:")}</b> ${escapeHtml(u.tgId)}</p>

              ${u.isBlocked ? `
                <div class="fc-bg-danger-soft border fc-border-danger p-2.5 rounded-xl">
                  <p class="font-bold fc-text-danger">${tr("🚫 Bloklangan", "🚫 Заблокирован")}</p>
                  <p class="fc-text-danger">${tr("Sabab", "Причина")}: ${escapeHtml(u.blockReason || '-')}</p>
                </div>
              ` : (u.warned ? `
                <div class="bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                  <p class="font-bold text-amber-800">${tr("⚠️ Ogohlantirilgan", "⚠️ Предупреждение")}</p>
                  <p class="text-amber-700">${tr("Sabab", "Причина")}: ${escapeHtml(u.warnReason || '-')}</p>
                </div>
              ` : '')}

              <div class="grid grid-cols-2 gap-2 pt-2">
                <div class="bg-gray-50 p-2.5 rounded-xl text-center">
                  <p class="text-lg font-black text-gray-800">${u.totalOrders}</p>
                  <p class="text-[10px] text-gray-500">${tr("Jami buyurtma", "Всего заказов")}</p>
                </div>
                <div class="bg-gray-50 p-2.5 rounded-xl text-center">
                  <p class="text-lg font-black text-green-600">${money(u.totalSpent)}</p>
                  <p class="text-[10px] text-gray-500">${tr("Jami xarid", "Всего покупок")}</p>
                </div>
                <div class="bg-gray-50 p-2.5 rounded-xl text-center">
                  <p class="text-lg font-black text-amber-600">${u.active}</p>
                  <p class="text-[10px] text-gray-500">${tr("Jarayonda", "В обработке")}</p>
                </div>
                <div class="bg-gray-50 p-2.5 rounded-xl text-center">
                  <p class="text-lg font-black text-emerald-600">${u.delivered}</p>
                  <p class="text-[10px] text-gray-500">${tr("Bajarilgan", "Выполнено")}</p>
                </div>
              </div>

              <div class="border-t pt-3 flex gap-2">
                ${u.isBlocked ? `
                  <button onclick="unblockUser('${u.tgId}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-xl text-[11px]">${tr("✅ Blokdan chiqarish", "✅ Разблокировать")}</button>
                ` : `
                  <button onclick="openBlockUserModal('${u.tgId}')" class="flex-1 fc-bg-danger text-white font-bold py-2 rounded-xl text-[11px]">${tr("🚫 Bloklash", "🚫 Заблокировать")}</button>
                `}
              </div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
    }

    // MODAL OPENERS & HANDLERS — universal variant tanlash.
    let selectedVariantQtys = {};
    function toggleVariantSelect(index) {
      const v = productVariants(selectedProductModal)[index];
      if (!v) return;
      const k = variantKey(v.size, v.color);
      if (selectedVariantQtys[k]) delete selectedVariantQtys[k];
      else selectedVariantQtys[k] = 1;
      renderModalContainer();
    }
    function setVariantQty(index, delta) {
      const v = productVariants(selectedProductModal)[index];
      if (!v) return;
      const k = variantKey(v.size, v.color);
      const next = (selectedVariantQtys[k] || 0) + delta;
      if (next <= 0) delete selectedVariantQtys[k];
      else selectedVariantQtys[k] = Math.min(next, Number(v.qty) || 0);
      renderModalContainer();
    }
    function addSelectedVariantsToCart(productId) {
      addVariantItemsToCart(productId, selectedVariantQtys);
      selectedVariantQtys = {};
    }

    // Legacy wrappers for old size-only calls.
    let selectedSizeQtys = {};
    function toggleSizeSelect(size) { selectedSizeQtys[size] = selectedSizeQtys[size] ? 0 : 1; renderModalContainer(); }
    function setSizeQty(size, delta, maxQty) { const n=(selectedSizeQtys[size]||0)+delta; if(n<=0) delete selectedSizeQtys[size]; else selectedSizeQtys[size]=Math.min(n,maxQty||n); renderModalContainer(); }
    function addSelectedSizesToCart(productId) { addSizedItemsToCart(productId, selectedSizeQtys); selectedSizeQtys={}; }

    function openProductDetailModal(id) {
      activePopupModal = null;
      selectedProductModal = products.find(p => p.id === id);
      selectedVariantQtys = {};
      selectedSizeQtys = {};
      renderModalContainer();
      // 18-band: faqat mijoz ko'rinishida (admin tahrirlash klikini "ko'rish"
      // sifatida hisoblamaymiz) — recentViewProductIds optimistik yangilanadi.
      if (!(isAdminMode && isUserAnAdmin) && selectedProductModal) recordProductView(id);
    }

    function openEditFieldModal(prodId, fieldName) {
      selectedProductModal = products.find(p => p.id === prodId);
      editingFieldData = fieldName;
      initializeTempImageEditor((fieldName === 'img' && selectedProductModal) ? selectedProductModal.img : null);
      if ((fieldName === 'variants' || fieldName === 'sizes') && selectedProductModal) hydrateVariantBuilderFromProduct(selectedProductModal);
      activePopupModal = 'EDIT_PROD_FIELD';
      render();
    }

    function openOrderModal(id) {
      selectedOrderModal = orders.find(o => o.id === id);
      renderModalContainer();
    }

    function deliverySnapshotLabel(order) {
      const delivery = order?.delivery || {};
      if (delivery.kind === 'FREE') return tr('Bepul yetkazib berish', 'Бесплатная доставка');
      if (delivery.kind === 'FIXED') return tr('Yetkazib berish', 'Доставка');
      if (delivery.kind === 'TAXI') return tr('Taksi orqali', 'На такси');
      if (delivery.kind === 'POST') return `${tr('Pochta orqali', 'Почтой')} · ${delivery.providerName || ''}`;
      return delivery.label || tr('Eski buyurtma yetkazishi', 'Доставка старого заказа');
    }

    // 5-band: "Tayyor"/"Tayyorlanmoqda" alohida bosqich sifatida BEKOR
    // qilindi (avvalgi noto'g'ri fix — nomini o'zgartirish emas, o'zini olib
    // tashlash kerak edi). READY hamon ICHKI boshlang'ich qiymat sifatida
    // saqlanadi (yangi buyurtma har doim shundan boshlanadi — create_order),
    // lekin admin uni endi tanlay olmaydi (shipment-status select'laridan
    // <option value="READY"> olib tashlandi) va bu yerda ham neytral
    // "hali harakat qilinmagan" matni ko'rsatiladi — "tayyor" so'zi umuman
    // ishlatilmaydi. Legacy buyurtmalar (eski READY qiymati) shu bilan
    // buzilmasdan ko'rsatiladi.
    function shipmentStatusLabel(status) {
      const labels = {
        READY: tr('— Hali harakat qilinmagan —', '— Действие ещё не выполнено —'), TAXI_ASSIGNED: tr('Taksi biriktirildi', 'Такси назначено'),
        HANDED_TO_CARRIER: tr('Pochtaga topshirildi', 'Передано почте'), IN_TRANSIT: tr("Yo'lda", 'В пути'), DELIVERED: tr('Yetkazildi', 'Доставлено')
      };
      return labels[status] || status || '-';
    }

    // 11-band: signed URL so'rovi tugaguncha UI "qotib qolgandek" ko'rinardi
    // (hech qanday feedback yo'q edi). Endi darhol spinner+matnli toast
    // chiqadi, natija/ xato kelgach yashiriladi.
    async function openOrderReceipt(orderId) {
      showActionToast('<span class="fc-spinner" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>' + tr("Chek ochilmoqda…", "Чек открывается…"), 'saving');
      try {
        const data = await callApi('get_payment_receipt_url', { orderId });
        hideActionToast();
        if (tg?.openLink) tg.openLink(data.url);
        else window.open(data.url, '_blank', 'noopener');
      } catch (e) {
        hideActionToast();
        alert(tr("Chekni ochib bo'lmadi: ", 'Не удалось открыть чек: ') + (e.message || e));
      }
    }

    // 1.10: chek Telegramga yuborilgandan keyin admin USTORE bot chatini
    // ochadi (aniq xabarga soxta deep-link yasalmaydi). Bot username hardcode
    // emas — boot() javobidan (server konfiguratsiyasidan) olinadi.
    function openReceiptInTelegram() {
      if (!botUsername) return;
      const url = `https://t.me/${encodeURIComponent(botUsername)}`;
      if (tg?.openTelegramLink) tg.openTelegramLink(url);
      else if (tg?.openLink) tg.openLink(url);
      else window.open(url, '_blank', 'noopener');
    }

    async function saveShipmentForOrder(orderId) {
      const order = orders.find(item => item.id === orderId);
      if (!order) return;
      const payload = { orderId, status: document.getElementById('shipment-status')?.value || 'READY' };
      if (order.delivery?.kind === 'TAXI') {
        payload.carNumber = document.getElementById('shipment-car')?.value.trim() || '';
        payload.driverPhone = document.getElementById('shipment-phone')?.value.trim() || '';
        payload.driverName = document.getElementById('shipment-driver')?.value.trim() || '';
      } else if (order.delivery?.kind === 'POST') {
        // 1.13: filial mijoz tomonidan checkout'da tanlanadi (order snapshot'da
        // saqlanadi) — admin uni qayta kiritmaydi, faqat tracking + status.
        payload.trackingNumber = document.getElementById('shipment-tracking')?.value.trim() || '';
      }
      showActionToast(tr('⏳ Yetkazish ma’lumoti saqlanmoqda...', '⏳ Данные доставки сохраняются...'), 'saving');
      try {
        const result = await callApi('update_shipment', payload);
        const updated = formatOrderForUi(result.order);
        const idx = orders.findIndex(item => item.id === orderId);
        if (idx >= 0) orders[idx] = updated;
        selectedOrderModal = updated;
        render();
        showActionToast(tr('✅ Yetkazish ma’lumoti saqlandi', '✅ Данные доставки сохранены'), 'success', 1300);
      } catch (e) {
        showActionToast(tr('❌ Yetkazish ma’lumoti saqlanmadi', '❌ Данные доставки не сохранены'), 'error', 1800);
        alert(tr('Xato: ', 'Ошибка: ') + (e.message || e));
      }
    }

    async function updateOrderStatus(id, newStatus) {
      const idx = orders.findIndex(o => o.id === id);
      if (idx < 0) return;
      const old = { ...orders[idx] };
      if (['DELIVERED','CANCELLED'].includes(old.status)) return;
      if (newStatus === 'CANCELLED' && !confirm(tr("Buyurtmani bekor qilasizmi?", "Отменить заказ?"))) return;

      // Optimistic UI: status bosilishi bilan darhol o'zgaradi.
      orders[idx] = { ...orders[idx], status: newStatus };
      selectedOrderModal = null;
      render();
      showActionToast(tr("⏳ Status saqlanmoqda...", "⏳ Статус сохраняется..."), 'saving');
      try {
        const result = await callApi('update_order_status', { orderId: id, newStatus });
        orders[idx] = formatOrderForUi(result.order);
        showActionToast(tr("✅ Status saqlandi", "✅ Статус сохранён"), 'success', 1000);
        render();
      } catch (e) {
        console.error(e);
        orders[idx] = old;
        render();
        showActionToast(tr("❌ Status saqlanmadi", "❌ Статус не сохранён"), 'error', 1600);
        alert(tr("❌ Statusni o'zgartirishda xatolik yuz berdi.", "❌ Ошибка изменения статуса."));
      }
    }

    // 14-band: chekni tasdiqlash — orders.status'ga to'g'ridan-to'g'ri
    // tegilmaydi, faqat mustaqil receiptReviewStatus (backend "PROCESSING"ga
    // o'tkazadi, agar order hali "NEW" bo'lsa — mavjud status qiymati).
    async function approvePaymentReceipt(orderId) {
      if (!confirm(tr("Chekni tasdiqlaysizmi?", "Подтвердить чек?"))) return;
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохранение..."), 'saving');
      try {
        const result = await callApi('approve_payment_receipt', { orderId });
        const updated = formatOrderForUi(result.order);
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) orders[idx] = updated;
        if (selectedOrderModal?.id === orderId) selectedOrderModal = updated;
        render();
        showActionToast(tr("✅ Chek tasdiqlandi", "✅ Чек подтверждён"), 'success', 1600);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 2000);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      }
    }
    function openRejectReceiptModal(orderId) {
      rejectReceiptOrderId = orderId;
      activePopupModal = 'REJECT_RECEIPT';
      render();
    }
    async function submitRejectReceipt() {
      const orderId = rejectReceiptOrderId;
      const reason = document.getElementById('rr-reason')?.value.trim() || '';
      if (!reason) return alert(tr("Rad etish sababini yozing.", "Укажите причину отклонения."));
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохранение..."), 'saving');
      try {
        const result = await callApi('reject_payment_receipt', { orderId, reason });
        const updated = formatOrderForUi(result.order);
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) orders[idx] = updated;
        selectedOrderModal = updated;
        rejectReceiptOrderId = null;
        activePopupModal = null;
        render();
        showActionToast(tr("✅ Chek rad etildi", "✅ Чек отклонён"), 'success', 1600);
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 2000);
        alert(tr("Xatolik: ", "Ошибка: ") + (e.message || e));
      }
    }

    // 15-band: rad etilgan chekni qayta yuborish — mavjud rasm pipeline
    // primitivlaridan (readBlobAsArrayBuffer/makeDetachedImageFile/
    // compressImageToLimit/fileToBase64) checkout oqimidagi bilan bir xil
    // tarzda foydalanadi, lekin alohida state/modal'da (checkout draft'ga
    // aralashmaydi). Checkout'dagi prepareReceiptImageUpload'dan farqli
    // o'laroq bu ALLAQACHON mavjud orderga bog'liq — shuning uchun o'z
    // alohida callApi('upload_payment_receipt', ...) chaqiruviga ega
    // (create_order bilan bitta so'rovda yuborilishi mumkin emas, chunki
    // order allaqachon yaratilgan).
    function openResubmitReceiptModal(orderId) {
      resubmitOrderId = orderId;
      resubmitReceiptFile = null;
      resubmitReceiptPreparing = null;
      resubmitReceiptPreviewUrl = null;
      activePopupModal = 'RESUBMIT_RECEIPT';
      render();
    }
    function closeResubmitReceiptModal() {
      if (resubmitReceiptPreviewUrl) { try { URL.revokeObjectURL(resubmitReceiptPreviewUrl); } catch (_) {} }
      resubmitOrderId = null;
      resubmitReceiptFile = null;
      resubmitReceiptPreparing = null;
      resubmitReceiptPreviewUrl = null;
      activePopupModal = null;
      render();
    }
    async function onResubmitReceiptPicked(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
        event.target.value = '';
        return alert(isLikelyHeicFile(file)
          ? tr("⚠️ HEIC/HEIF formati hali qo'llab-quvvatlanmaydi. Chekni JPG/PNG formatida yuklang.", "⚠️ Формат HEIC/HEIF пока не поддерживается. Загрузите чек в формате JPG/PNG.")
          : tr('Chek JPG, PNG yoki WebP bo‘lishi va 15MB dan oshmasligi kerak.', 'Чек должен быть JPG, PNG или WebP размером до 15 МБ.'));
      }
      const selectionVersion = ++resubmitReceiptSelectionVersion;
      resubmitReceiptFile = file;
      if (resubmitReceiptPreviewUrl) { try { URL.revokeObjectURL(resubmitReceiptPreviewUrl); } catch (_) {} }
      resubmitReceiptPreviewUrl = URL.createObjectURL(file);
      resubmitReceiptPreparing = captureAndPrepareImageV2(file, MAX_RECEIPT_BYTES, 1600, 0.85, (updated) => {
        if (selectionVersion !== resubmitReceiptSelectionVersion) return;
        try {
          const stableUrl = URL.createObjectURL(updated);
          const oldUrl = resubmitReceiptPreviewUrl;
          resubmitReceiptPreviewUrl = stableUrl;
          renderModalContainer();
          if (oldUrl && oldUrl !== stableUrl && oldUrl.startsWith('blob:')) { try { URL.revokeObjectURL(oldUrl); } catch (_) {} }
        } catch (previewErr) {
          imageIO.logStage('PREVIEW_FAILED', { message: previewErr?.message, level: 'warn' });
        }
      });
      renderModalContainer();
    }
    // 5-band/13-band: chekni qayta yuborish — endi signed URL PRIMARY
    // (get_payment_receipt_upload_url + finalize_payment_receipt, avval
    // yozilgan-lekin-ishlatilmagan actionlar jonlantirildi), base64
    // (upload_payment_receipt) ikkinchi darajali fallback sifatida saqlanadi.
    // Receipt approve/reject/resubmit/order-association business logikasi
    // (finalize_payment_receipt ichida) o'zgarishsiz qoladi — faqat transport.
    async function submitResubmitReceipt() {
      if (!resubmitOrderId || (!resubmitReceiptFile && !resubmitReceiptPreparing)) {
        return alert(tr("Iltimos, chek rasmini tanlang.", "Пожалуйста, выберите изображение чека."));
      }
      const orderId = resubmitOrderId;
      showActionToast(tr('⏳ Yuborilmoqda...', '⏳ Отправка...'), 'saving');
      try {
        const prepared = resubmitReceiptPreparing ? await resubmitReceiptPreparing : resubmitReceiptFile;
        if (!prepared || prepared.size > 6 * 1024 * 1024) throw new Error('receipt_too_large');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(prepared.type)) throw new Error('invalid_receipt_file');

        let signedOk = false;
        try {
          const extByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
          const ext = extByMime[prepared.type];
          const { path, token } = await callApi('get_payment_receipt_upload_url', { orderId, mimeType: prepared.type, size: prepared.size });
          const { error: upErr } = await sb.storage.from('payment-receipts').uploadToSignedUrl(path, token, prepared);
          if (upErr) throw upErr;
          await callApi('finalize_payment_receipt', { orderId, path });
          signedOk = true;
        } catch (signedErr) {
          console.warn('[receipt:SIGNED_URL_RESUBMIT_FAILED]', signedErr);
        }
        if (!signedOk) {
          const imageUpload = { base64: await fileToBase64(prepared), mimeType: prepared.type, fileName: prepared.name || 'payment-receipt.jpg' };
          await callApi('upload_payment_receipt', { orderId, imageUpload });
        }
        const patch = { hasReceipt: true, receiptReviewStatus: 'PENDING', receiptRejectReason: null };
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) orders[idx] = { ...orders[idx], ...patch };
        if (selectedOrderModal?.id === orderId) selectedOrderModal = { ...selectedOrderModal, ...patch };
        closeResubmitReceiptModal();
        showActionToast(tr('✅ Yangi chek yuborildi', '✅ Новый чек отправлен'), 'success', 2000);
      } catch (e) {
        console.error(e);
        showActionToast(tr('❌ Yuborilmadi', '❌ Не отправлено'), 'error', 2200);
        alert(tr('Xatolik: ', 'Ошибка: ') + (e.message || e));
      }
    }

    // MODAL SAVERS
    async function saveRegistrationFromModal() {
      const fn = document.getElementById('reg-fname').value.trim();
      const ln = document.getElementById('reg-lname').value.trim();
      const ph = document.getElementById('reg-phone').value.trim().replace(/\s+/g, '');

      if (!fn || !ph || ph === '+998') return alert(uiLang === 'ru' ? 'Введите имя и номер телефона.' : "Iltimos, ismingiz va telefon raqamingizni kiriting!");
      if (!isValidPhone(ph)) return alert(uiLang === 'ru' ? 'Введите телефон в формате +998901234567' : "Iltimos, telefon raqamini to'g'ri formatda kiriting: +998901234567");
      const requiredLegalDocs = (!registeredUser || legalConsentRequired) ? enabledLegalDocuments() : [];
      for (const doc of requiredLegalDocs) {
        const checkbox = document.getElementById(`reg-legal-${doc.type}`);
        if (!checkbox?.checked) return alert(tr(`${legalDocTitle(doc)}ni o‘qib, roziligingizni tasdiqlang.`, `Прочитайте документ «${legalDocTitle(doc)}» и подтвердите согласие.`));
      }
      const legalAcceptances = requiredLegalDocs.map(doc => ({ type: doc.type, version: Number(doc.version) || 1 }));

      // UI darhol yangilanadi; profil serverda ham saqlanadi va boshqa qurilmada tiklanadi.
      const old = registeredUser ? { ...registeredUser } : null;
      registeredUser = { firstName: fn, lastName: ln, phone: ph };
      localStorage.setItem(scopedKey('registeredUser'), JSON.stringify(registeredUser));
      currentUser.firstName = fn; currentUser.lastName = ln; currentUser.phone = ph;
      activePopupModal = null; render();
      try {
        await callApi('update_profile', { firstName: fn, lastName: ln, phone: ph, legalAcceptances });
        legalConsentRequired = false;
        alert(uiLang === 'ru' ? '✅ Данные сохранены.' : "✅ Ma'lumotlar saqlandi!");
      } catch (e) {
        console.error(e);
        if (old) {
          registeredUser = old;
          localStorage.setItem(scopedKey('registeredUser'), JSON.stringify(old));
        } else {
          registeredUser = null;
          localStorage.removeItem(scopedKey('registeredUser'));
        }
        if (e?.details?.error === 'legal_consent_required') {
          legalConsentRequired = true;
          render();
          return alert(tr('Huquqiy hujjat yangilangan. Joriy versiyani qayta o‘qib tasdiqlang.', 'Юридический документ обновлён. Прочитайте и подтвердите текущую версию.'));
        }
        render();
        alert(uiLang === 'ru' ? '⚠️ На сервере сохранить не удалось. Проверьте интернет.' : "⚠️ Serverda saqlab bo'lmadi. Internetni tekshiring.");
      }
    }

    async function saveProductFromModal() {
      const name = document.getElementById('m-prod-name').value.trim();
      const price = parseFloat(document.getElementById('m-prod-price').value);
      const oldPriceVal = parseFloat(document.getElementById('m-prod-oldprice').value);
      const stockVal = document.getElementById('m-prod-stock').value;
      const stock = stockVal === '' ? NaN : parseInt(stockVal, 10);
      const variants = resolveVariantBuilderRows(readVariantBuilderRowsFromDom());
      const desc = document.getElementById('m-prod-desc').value.trim();
      if (!name || isNaN(price) || (variants.length === 0 && isNaN(stock))) {
        return alert(tr("Iltimos, barcha majburiy maydonlarni to'ldiring!", "Заполните все обязательные поля!"));
      }
      const oldPrice = (!isNaN(oldPriceVal) && oldPriceVal > price) ? oldPriceVal : null;
      const imageSnap = takeTempImageSnapshot();
      const categoryId = adminCatParentId;

      // Formani server javobigacha ochiq qoldiramiz: rasm xatosida admin kiritgan
      // name/price/stock/description yo'qolmasligi kerak.
      showActionToast(tr("⏳ Tovar saqlanmoqda...", "⏳ Товар сохраняется..."), 'saving');
      try {
        const localImageWasSelected = !!(imageSnap?.file || imageSnap?.preparing);
        const imagePayload = await productImagePayloadFromSnapshot(imageSnap, localImageWasSelected);
        const result = await callApi('add_product', {
          name, price, oldPrice,
          stock: isNaN(stock) ? 0 : stock,
          variants: variants.length > 0 ? variants : null,
          desc, categoryId, img: imagePayload.img, imageUpload: imagePayload.imageUpload
        });
        upsertLocalProduct(result.product);
        saveCatalogCache();
        activePopupModal = null;
        showActionToast(`${tr("✅ Tovar qo'shildi. ID:", "✅ Товар добавлен. ID:")} ${result.product.sku}`, 'success', 1800);
        render();
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Tovar saqlanmadi", "❌ Товар не сохранён"), 'error', 1800);
        if (String(e.message).startsWith('product_limit_reached')) {
          const limit = String(e.message).split(':')[1];
          alert(`${tr('⚠️ Tovar soni chegarasiga yetdingiz','⚠️ Достигнут лимит количества товаров')} (${limit}). ${tr("Ko'proq tovar qo'shish uchun tarifingizni oshiring.",'Чтобы добавить больше товаров, увеличьте тариф.')}`);
        } else {
          alert(tr("❌ Tovarni saqlashda xatolik yuz berdi: ", "❌ Ошибка сохранения товара: ") + ((imageSnap?.file || imageSnap?.preparing || imageSnap?.url) ? friendlyImageError(e) : (e.message || e)));
        }
        // Input matnlari DOM'da qoladi. Rasm selection esa qayta tanlanishi uchun tozalanadi.
        clearTempImageSelection();
      } finally { releaseImageSnapshot(imageSnap); }
    }

    // 3.1/3.7: admin faqat UZ kiritadi — RU serverda avtomatik tarjima qilinadi.
    async function saveCategoryFromModal() {
      const name = document.getElementById('m-cat-name').value.trim();
      if (!name) return alert(tr("Katalog nomini kiriting!", "Введите название каталога!"));
      const imageSnap = takeTempImageSnapshot();
      const parentId = adminCatParentId;
      activePopupModal = null;
      render();
      showActionToast(tr("⏳ Katalog saqlanmoqda...", "⏳ Каталог сохраняется..."), 'saving');
      try {
        // 14-band: uploadImageSnapshot faqat FAYL yuklashni biladi
        // (snapshot.url'ni hech qachon o'qimaydi) — admin URL kiritib fayl
        // tanlamasa, bu chaqiruv jim ravishda null qaytarardi va katalog
        // rasmsiz saqlanardi. productImagePayloadFromSnapshot ikkalasini ham
        // (fayl VA URL) to'g'ri qayta ishlaydi — mahsulot rasmi shu orqali
        // ishlaydigan bir xil yo'l.
        const { img: imgUrl } = await productImagePayloadFromSnapshot(imageSnap, false);
        const result = await callApi('add_category', { name, img: imgUrl, parentId });
        upsertLocalCategory(result.category);
        saveCatalogCache();
        showActionToast(tr("✅ Katalog yaratildi", "✅ Каталог создан"), 'success', 1200);
        render();
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Katalog saqlanmadi", "❌ Каталог не сохранён"), 'error', 1800);
        alert(tr("❌ Katalogni saqlashda xatolik yuz berdi: ", "❌ Ошибка сохранения каталога: ") + ((imageSnap?.file || imageSnap?.preparing || imageSnap?.url) ? friendlyImageError(e) : (e.message || e)));
      } finally { releaseImageSnapshot(imageSnap); }
    }

    async function saveAdminFromModal() {
      const idVal = document.getElementById('m-admin-id').value.trim();
      if (!idVal || !/^\d+$/.test(idVal)) return alert(tr("To'g'ri Telegram ID kiriting!", "Введите корректный Telegram ID!"));
      const existed = adminsList.includes(idVal);
      if (!existed) adminsList.push(idVal);
      activePopupModal = null;
      render();
      showActionToast(tr("⏳ Admin saqlanmoqda...", "⏳ Администратор сохраняется..."), 'saving');
      try {
        await callApi('add_admin', { tgId: idVal });
        showActionToast(tr("✅ Admin qo'shildi", "✅ Администратор добавлен"), 'success', 1200);
      } catch (e) {
        console.error(e);
        if (!existed) adminsList = adminsList.filter(x => x !== idVal);
        render();
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 1800);
        alert(tr("❌ Adminni qo'shishda xatolik yuz berdi: ", "❌ Ошибка добавления администратора: ") + (e.message || e));
      }
    }

    async function saveFieldEdit(prodId, field) {
      const idx = products.findIndex(prod => prod.id === prodId);
      if (idx < 0) return;
      const p = products[idx];
      const old = cloneData(p);
      const payload = { productId: prodId, field };
      let imageSnap = null;

      if (field === 'name') {
        const val = document.getElementById('ef-val').value.trim();
        if (!val) { activePopupModal = null; render(); return; }
        payload.value = val;
        p.name = val;
      } else if (field === 'price') {
        const price = parseFloat(document.getElementById('ef-price').value);
        const oldVal = parseFloat(document.getElementById('ef-oldprice').value);
        if (isNaN(price)) { activePopupModal = null; render(); return; }
        const oldPrice = (!isNaN(oldVal) && oldVal > price) ? oldVal : null;
        payload.value = price; payload.oldPrice = oldPrice;
        p.price = price; p.oldPrice = oldPrice;
      } else if (field === 'stock') {
        const stock = parseInt(document.getElementById('ef-val').value, 10);
        if (isNaN(stock)) { activePopupModal = null; render(); return; }
        payload.value = stock;
        p.stock = stock; p.status = stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';
      } else if (field === 'desc') {
        const val = document.getElementById('ef-val').value.trim();
        payload.value = val;
        p.desc = val;
      } else if (field === 'img') {
        imageSnap = takeTempImageSnapshot();
        if (!imageSnap.file && !imageSnap.preparing && !imageSnap.url) { activePopupModal = null; render(); return; }
        // Tanlangan rasm kartochkada ham darhol ko'rinsin.
        if (imageSnap.preview || imageSnap.url) p.img = imageSnap.preview || imageSnap.url;
      } else if (field === 'sizes' || field === 'variants') {
        const vars = resolveVariantBuilderRows(readVariantBuilderRowsFromDom());
        payload.field = 'variants'; payload.value = vars;
        p.variants = vars;
        p.sizes = vars.length && !vars.some(v => v.color) ? vars.map(v => ({ size: v.size, qty: v.qty, sku: v.sku || null })) : null;
        if (vars.length) {
          p.stock = vars.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
          p.status = p.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';
        }
      }

      // Matn/son kabi tez maydonlar PIN kabi optimistik yopiladi. Rasm esa
      // Telegram WebView'da o'qish/yuklash xatosi bo'lsa admin qayta tanlay olishi
      // uchun edit modalini muvaffaqiyatli uploadgacha ochiq qoldiradi.
      if (field !== 'img') {
        activePopupModal = null;
        selectedProductModal = p;
        render();
      }
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохраняется..."), 'saving');

      try {
        if (field === 'img') {
          const imagePayload = await productImagePayloadFromSnapshot(imageSnap, true);
          payload.value = imagePayload.img;
          payload.imageUpload = imagePayload.imageUpload;
        }
        const result = await callApi('edit_product_field', payload);
        const current = products.find(prod => prod.id === prodId);
        if (current) Object.assign(current, mapProductFromDB(result.product));
        saveCatalogCache();
        if (field === 'img') {
          activePopupModal = null;
          selectedProductModal = current || p;
        }
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 1200);
        render();
      } catch (e) {
        console.error(e);
        const curIdx = products.findIndex(prod => prod.id === prodId);
        if (curIdx >= 0) products[curIdx] = old;
        selectedProductModal = products.find(prod => prod.id === prodId) || null;
        // Rasm xatosida edit oynasini yopmaymiz: forma va qayta tanlash imkoniyati qoladi.
        if (field !== 'img') render();
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 1800);
        alert(tr("❌ Saqlashda xatolik yuz berdi: ", "❌ Ошибка сохранения: ") + (field === 'img' ? friendlyImageError(e) : (e.message || e)));
      } finally {
        releaseImageSnapshot(imageSnap);
      }
    }

    async function saveMissingImageQueueItem(prodId) {
      if (missingImageQueueSaving) return;
      const product = products.find(p => p.id === prodId);
      if (!product || product.status === 'DELETED' || hasProductImage(product)) {
        renderModalContainer();
        return;
      }
      const imageSnap = takeTempImageSnapshot();
      missingImageQueueSaving = true;
      renderModalContainer();
      showActionToast(tr("⏳ Rasm saqlanmoqda...", "⏳ Изображение сохраняется..."), 'saving');
      try {
        const imagePayload = await productImagePayloadFromSnapshot(imageSnap, true);
        const result = await callApi('edit_product_field', {
          productId: prodId,
          field: 'img',
          value: imagePayload.img,
          imageUpload: imagePayload.imageUpload,
        });
        const current = products.find(p => p.id === prodId);
        if (current) Object.assign(current, mapProductFromDB(result.product));
        saveCatalogCache();
        const remaining = getMissingImageProducts();
        if (missingImageQueueIndex >= remaining.length) missingImageQueueIndex = Math.max(0, remaining.length - 1);
        initializeTempImageEditor(null);
        showActionToast(tr("✅ Rasm saqlandi", "✅ Изображение сохранено"), 'success', 1200);
      } catch (e) {
        console.error('Global rasmsiz navbatda rasm saqlash xatosi:', e);
        showActionToast(tr("❌ Rasm saqlanmadi", "❌ Изображение не сохранено"), 'error', 1800);
        alert(tr("❌ Rasm saqlanmadi. Eski ma'lumot o'zgarmadi: ", "❌ Изображение не сохранено. Старые данные не изменены: ") + friendlyImageError(e));
      } finally {
        releaseImageSnapshot(imageSnap);
        missingImageQueueSaving = false;
        render();
      }
    }

    function openAddProductModal() {
      initializeTempImageEditor(null);
      variantBuilderRows = [{ level1: '', level2: '', qty: '' }];
      activePopupModal = 'ADD_PROD';
      render();
    }

    function openAddCatModal() {
      clearTempImageSelection();
      activePopupModal = 'ADD_CAT';
      render();
    }

    // ============ EXCEL IMPORT (faqat admin ochganda lazy-load) ============
    let excelModulePromise = null;
    let excelOpening = false;
    function ensureScript(src) {
      return new Promise((resolve, reject) => {
        const old = document.querySelector(`script[data-src="${src}"]`);
        if (old) { if (old.dataset.loaded === '1') return resolve(); old.addEventListener('load', resolve, { once:true }); return; }
        const sc = document.createElement('script'); sc.src = src; sc.dataset.src = src; sc.async = true;
        sc.onload = () => { sc.dataset.loaded = '1'; resolve(); }; sc.onerror = reject; document.head.appendChild(sc);
      });
    }
    async function openExcelImportModal() {
      if (!isUserAnAdmin || excelOpening) return;
      excelOpening = true;
      render();
      try {
        if (!excelModulePromise) excelModulePromise = ensureScript('./excel-import.js?v=8');
        await excelModulePromise;
        if (!window.UstoreExcel) throw new Error('Excel moduli topilmadi');
        await window.UstoreExcel.prepare?.();
        activePopupModal = 'EXCEL_IMPORT';
      } catch (e) {
        console.error(e);
        alert(tr("❌ Excel modulini yuklab bo'lmadi: ", "❌ Не удалось загрузить модуль Excel: ") + (e.message || e));
      } finally {
        excelOpening = false;
        render();
      }
    }

    // Legacy qo'lda bulk forma olib tashlandi; faqat xavfsiz Excel import ishlatiladi.

    function openEditCategoryModal(id, e) {
      if (e) e.stopPropagation();
      const c = categories.find(cat => cat.id === id);
      if (!c) return;
      selectedCategoryModal = c;
      clearTempImageSelection();
      activePopupModal = 'EDIT_CAT';
      render();
    }

    async function saveCategoryEdit(id) {
      const idx = categories.findIndex(cat => cat.id === id);
      if (idx < 0) return;
      const c = categories[idx];
      const old = cloneData(c);
      const name = document.getElementById('ec-name').value.trim();
      if (!name) return alert(tr("Katalog nomini kiriting!", "Введите название каталога!"));
      const imageSnap = takeTempImageSnapshot();
      // 14-band: uploadImageSnapshot faqat FAYL yuklashni biladi, URL
      // maydonini hech qachon o'qimasdi — admin URL kiritsa, u yerga
      // yozilgan qiymat jim ravishda tashlab yuborilib, eski rasm (yoki
      // hech narsa) qaytaverardi. productImagePayloadFromSnapshot fayl VA
      // URL'ni bir xil to'g'ri yo'l bilan qayta ishlaydi (mahsulot rasmi
      // shu orqali ishlaydi) — admin hech narsa tanlamagan holatdagina
      // eski rasm saqlanib qoladi.
      const imageChanged = !!(imageSnap.file || imageSnap.preparing || imageSnap.url);

      c.name = name;
      if (imageSnap.preview) c.img = imageSnap.preview;
      activePopupModal = null;
      render();
      showActionToast(tr("⏳ Katalog saqlanmoqda...", "⏳ Каталог сохраняется..."), 'saving');

      try {
        const newImg = imageChanged ? (await productImagePayloadFromSnapshot(imageSnap, false)).img : old.img;
        const result = await callApi('edit_category', { categoryId: id, name, img: newImg });
        const current = categories.find(cat => cat.id === id);
        if (current) Object.assign(current, mapCategoryFromDB(result.category));
        saveCatalogCache();
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 1200);
        render();
      } catch (e2) {
        console.error(e2);
        const curIdx = categories.findIndex(cat => cat.id === id);
        if (curIdx >= 0) categories[curIdx] = old;
        render();
        showActionToast(tr("❌ Saqlanmadi", "❌ Не сохранено"), 'error', 1800);
        alert(tr("❌ Xatolik yuz berdi: ", "❌ Произошла ошибка: ") + (imageChanged ? friendlyImageError(e2) : (e2.message || e2)));
      } finally {
        releaseImageSnapshot(imageSnap);
      }
    }

    // ⬆️⬇️ tugmalari FAQAT joriy ko'rinib turgan ro'yxat (currentVisibleProductIds) ichida ishlaydi.
    async function moveProductSort(id, dir) {
      const list = currentVisibleProductIds;
      const idx = list.indexOf(id);
      if (idx < 0) return;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= list.length) return;

      const prodA = products.find(p => p.id === list[idx]);
      const prodB = products.find(p => p.id === list[targetIdx]);
      if (!prodA || !prodB) return;

      const oldA = prodA.sortOrder;
      const oldB = prodB.sortOrder;
      prodA.sortOrder = oldB;
      prodB.sortOrder = oldA;

      // Optimistic: tugma darhol ishlaydi, server javobi fon rejimida keladi.
      render();
      try {
        await callApi('move_sort', { idA: prodA.id, sortOrderA: prodA.sortOrder, idB: prodB.id, sortOrderB: prodB.sortOrder });
        saveCatalogCache();
      } catch (e) {
        prodA.sortOrder = oldA;
        prodB.sortOrder = oldB;
        render();
        console.error('Tartibni saqlashda xatolik:', e);
        alert(tr("❌ Tartibni saqlab bo'lmadi: ", "❌ Не удалось сохранить порядок: ") + (e.message || e));
      }
    }

    async function toggleProductFeatured(id) {
      const p = products.find(prod => prod.id === id);
      if (!p) return;
      const oldVal = !!p.isFeatured;
      const newVal = !oldVal;

      // OPTIMISTIC UI: pin darhol o'zgaradi, server fon rejimida saqlaydi.
      p.isFeatured = newVal;
      render();
      showActionToast(tr("⏳ Saqlanmoqda...", "⏳ Сохраняется..."), 'saving');
      try {
        await callApi('toggle_featured', { productId: id, value: newVal });
        saveCatalogCache();
        showActionToast(tr("✅ Saqlandi", "✅ Сохранено"), 'success', 800);
      } catch (e) {
        p.isFeatured = oldVal;
        render();
        console.error(e);
        alert(tr("❌ Pin holatini saqlab bo'lmadi: ", "❌ Не удалось сохранить закрепление: ") + (e.message || e));
      }
    }

    async function toggleProductVisibility(id) {
      if (!isUserAnAdmin || !isAdminMode) return;
      const p = products.find(prod => prod.id === id);
      if (!p || p.status === 'DELETED') return;
      const oldVal = p.isVisible !== false;
      const newVal = !oldVal;

      // Optimistic UI: ko'z holati darhol almashadi; server xatosida qaytariladi.
      p.isVisible = newVal;
      render();
      showActionToast(newVal ? tr("⏳ Userga ko‘rsatilmoqda...", "⏳ Показываем пользователю...") : tr("⏳ Userdan yashirilmoqda...", "⏳ Скрываем от пользователя..."), 'saving');
      try {
        await callApi('toggle_product_visibility', { productId: id, value: newVal });
        saveCatalogCache();
        showActionToast(newVal ? tr("✅ Userga ko‘rinadi", "✅ Видно пользователю") : tr("✅ Userdan yashirildi", "✅ Скрыто от пользователя"), 'success', 1100);
      } catch (e) {
        p.isVisible = oldVal;
        render();
        console.error(e);
        alert(tr("❌ Ko‘rinish holatini saqlab bo‘lmadi: ", "❌ Не удалось сохранить видимость: ") + (e.message || e));
      }
    }

    // 2.4/2.5: standalone product delete — 24 soat trash'da turadi, tiklash mumkin.
    async function deleteProduct(id) {
      if (!confirm(tr("Rostdan ham ushbu mahsulotni o'chirmoqchimisiz? (24 soat ichida Chiqindidan tiklash mumkin)", "Удалить этот товар? (В течение 24 часов его можно восстановить из корзины)"))) return;
      const idx = products.findIndex(prod => prod.id === id);
      if (idx < 0) return;
      const old = cloneData(products[idx]);
      products.splice(idx, 1);
      render();
      showActionToast(tr("⏳ O'chirilmoqda...", "⏳ Удаление..."), 'saving');
      try {
        await callApi('delete_product', { productId: id });
        saveCatalogCache();
        showActionToast(tr("✅ O'chirildi (24 soat Chiqindida)", "✅ Удалено (24 часа в корзине)"), 'success', 1800);
      } catch (e) {
        console.error(e);
        products.splice(Math.min(idx, products.length), 0, old);
        render();
        showActionToast(tr("❌ O'chirilmadi", "❌ Не удалено"), 'error', 1800);
        alert(tr("❌ O'chirishda xatolik yuz berdi: ", "❌ Ошибка удаления: ") + (e.message || e));
      }
    }

    // 2.4: o'chirishdan oldin ichki katalog/tovar sonini ko'rsatib tasdiq so'raladi.
    // 2.5: tasdiqlansa, butun subtree+tovarlar 24 soatlik trash'ga tushadi —
    // bu kaskad ko'p elementga ta'sir qilgani uchun aniqlik uchun butun
    // katalogni qayta yuklaymiz (optimistik qisman o'chirish emas).
    async function deleteCategory(id, e) {
      if (e) e.stopPropagation();
      let preview;
      showActionToast(tr('⏳ Tekshirilmoqda...', '⏳ Проверка...'), 'saving');
      try {
        preview = await callApi('get_category_delete_preview', { categoryId: id });
      } catch (err) {
        hideActionToast();
        return alert(tr('❌ Tekshirishda xatolik: ', '❌ Ошибка проверки: ') + (err.message || err));
      }
      hideActionToast();
      const msg = (preview.categoryCount > 0 || preview.productCount > 0)
        ? tr(
            `Bu katalog ichida:\n${preview.categoryCount} ta ichki katalog\n${preview.productCount} ta tovar\nbor.\n\nO'chirishga aminmisiz? (24 soat ichida Chiqindidan tiklash mumkin)`,
            `В этом каталоге:\n${preview.categoryCount} подкаталогов\n${preview.productCount} товаров\n\nУдалить? (В течение 24 часов можно восстановить из корзины)`
          )
        : tr("Katalog o'chirilsinmi? (24 soat ichida Chiqindidan tiklash mumkin)", 'Удалить каталог? (В течение 24 часов можно восстановить из корзины)');
      if (!confirm(msg)) return;
      showActionToast(tr("⏳ O'chirilmoqda...", "⏳ Удаление..."), 'saving');
      try {
        await callApi('delete_category', { categoryId: id });
        await loadCatalog();
        if (adminCatParentId === id) adminCatParentId = null;
        render();
        showActionToast(tr("✅ O'chirildi (24 soat Chiqindida)", "✅ Удалено (24 часа в корзине)"), 'success', 1800);
      } catch (e2) {
        console.error(e2);
        showActionToast(tr("❌ O'chirilmadi", "❌ Не удалено"), 'error', 1800);
        alert(tr("❌ O'chirishda xatolik yuz berdi: ", "❌ Ошибка удаления: ") + (e2.message || e2));
      }
    }

    // 2.6: mahsulotni nusxalash — yangi SKU, mustaqil rasm va original qoldiq/variant qty bilan.
    async function duplicateProduct(id) {
      showActionToast(tr('⏳ Nusxalanmoqda...', '⏳ Копирование...'), 'saving');
      try {
        const result = await callApi('duplicate_product', { productId: id });
        products.unshift(mapProductFromDB(result.product));
        saveCatalogCache();
        selectedProductModal = mapProductFromDB(result.product);
        render();
        showActionToast(tr('✅ Nusxa yaratildi', '✅ Копия создана'), 'success', 1800);
      } catch (e) {
        console.error(e);
        showActionToast(tr('❌ Nusxalab bo\'lmadi', '❌ Не удалось скопировать'), 'error', 1800);
        alert(tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e));
      }
    }

    // 2.8: narx tarixi ko'rish.
    async function openPriceHistoryModal(productId) {
      priceHistoryProductId = productId;
      priceHistoryList = null;
      activePopupModal = 'PRICE_HISTORY';
      render();
      try {
        const result = await callApi('get_product_price_history', { productId });
        priceHistoryList = result.history || [];
      } catch (e) {
        console.error(e);
        priceHistoryList = [];
      }
      if (activePopupModal === 'PRICE_HISTORY') renderModalContainer();
    }

    // 2.3: "Katalogni o'zgartirish" — tovarni boshqa kategoriyaga ko'chirish.
    function openMoveProductModal(productId) {
      moveProductId = productId; moveTargetCategoryId = ''; movePickerParentId = null; movePickerSearch = ''; activePopupModal = 'MOVE_PRODUCT_CATEGORY';
      render();
    }
    async function saveMoveProduct() {
      const newCategoryId = movePickerParentId || null;
      showActionToast(tr('⏳ Ko\'chirilmoqda...', '⏳ Перемещение...'), 'saving');
      try {
        const result = await callApi('edit_product_field', { productId: moveProductId, field: 'categoryId', value: newCategoryId });
        const idx = products.findIndex(p => p.id === moveProductId);
        if (idx >= 0) products[idx] = mapProductFromDB(result.product);
        saveCatalogCache();
        activePopupModal = null;
        selectedProductModal = idx >= 0 ? products[idx] : null;
        render();
        showActionToast(tr('✅ Katalog o\'zgartirildi', '✅ Каталог изменён'), 'success', 1500);
      } catch (e) {
        console.error(e);
        showActionToast(tr('❌ O\'zgartirilmadi', '❌ Не изменено'), 'error', 1800);
        alert(tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e));
      }
    }

    // 2.2: kategoriyani boshqa kategoriya ichiga ko'chirish (server cycle'ni ham tekshiradi).
    function categoryDescendantIds(id) {
      const result = new Set([String(id)]);
      const queue = [String(id)];
      while (queue.length) {
        const cur = queue.shift();
        for (const c of categories.filter(x => String(x.parentId || '') === cur)) {
          if (!result.has(String(c.id))) { result.add(String(c.id)); queue.push(String(c.id)); }
        }
      }
      return result;
    }
    function openMoveCategoryModal(categoryId, e) {
      if (e) e.stopPropagation();
      moveCategoryId = categoryId; moveCategoryTargetId = ''; movePickerParentId = null; movePickerSearch = ''; activePopupModal = 'MOVE_CATEGORY';
      render();
    }
    async function saveMoveCategory() {
      const newParentId = movePickerParentId || null;
      showActionToast(tr('⏳ Ko\'chirilmoqda...', '⏳ Перемещение...'), 'saving');
      try {
        await callApi('move_category', { categoryId: moveCategoryId, newParentId });
        await loadCatalog();
        activePopupModal = null;
        render();
        showActionToast(tr('✅ Katalog ko\'chirildi', '✅ Каталог перемещён'), 'success', 1500);
      } catch (e) {
        console.error(e);
        showActionToast(tr('❌ Ko\'chirilmadi', '❌ Не перемещено'), 'error', 1800);
        const msg = String(e.message || '').includes('cannot_move_into_own_descendant')
          ? tr("❌ Katalogni o'zining ichki kataloglaridan biriga ko'chirib bo'lmaydi.", '❌ Нельзя переместить каталог в его же подкаталог.')
          : tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e);
        alert(msg);
      }
    }

    // 2.1: tartib tugmalari — faqat bir xil ota-katalog ichidagi qo'shnilar bilan almashadi.
    async function moveCategoryOrder(categoryId, direction, e) {
      if (e) e.stopPropagation();
      const cat = categories.find(c => c.id === categoryId);
      if (!cat) return;
      const siblings = categories.filter(c => String(c.parentId || '') === String(cat.parentId || ''))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const idx = siblings.findIndex(c => c.id === categoryId);
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;
      const other = siblings[swapIdx];
      const catOrder = cat.sortOrder || 0, otherOrder = other.sortOrder || 0;
      cat.sortOrder = otherOrder; other.sortOrder = catOrder;

      // Optimistic: tugma darhol ishlaydi, server javobi fon rejimida keladi
      // (moveProductSort bilan bir xil sodda pattern — qo'shimcha guard yo'q).
      render();
      try {
        await callApi('reorder_categories', { items: [{ id: cat.id, sortOrder: cat.sortOrder }, { id: other.id, sortOrder: other.sortOrder }] });
        saveCatalogCache();
      } catch (err) {
        console.error(err);
        cat.sortOrder = catOrder; other.sortOrder = otherOrder;
        render();
        alert(tr('❌ Tartibni saqlab bo\'lmadi: ', '❌ Не удалось сохранить порядок: ') + (err.message || err));
      }
    }

    // 2.7: duplicate tovarlarni ANIQLASH (auto-merge yo'q — spec buni keyinga
    // qoldirishga ruxsat beradi: "Automatic merge qilmay turish mumkin").
    // excel-import.js'ning ichki (lazy-load qilinadigan, eksport qilinmagan)
    // Levenshtein funksiyasiga bog'lanmaslik uchun mustaqil kichik nusxa.
    function productNameSimilarity(a, b) {
      const an = normalizeText(a || '').latin, bn = normalizeText(b || '').latin;
      if (an === bn) return 1;
      const len = Math.max(an.length, bn.length, 1);
      const prev = Array.from({ length: bn.length + 1 }, (_, i) => i);
      const cur = new Array(bn.length + 1);
      for (let i = 1; i <= an.length; i++) {
        cur[0] = i;
        for (let j = 1; j <= bn.length; j++) cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (an[i - 1] === bn[j - 1] ? 0 : 1));
        for (let j = 0; j <= bn.length; j++) prev[j] = cur[j];
      }
      return 1 - prev[bn.length] / len;
    }
    function findDuplicateProductCandidates() {
      const active = products.filter(p => p.status !== 'DELETED');
      const pairs = [];
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i], b = active[j];
          if (a.categoryId !== b.categoryId) continue;
          const score = productNameSimilarity(a.name, b.name);
          if (score >= 0.82) pairs.push({ a, b, score });
        }
      }
      pairs.sort((x, y) => y.score - x.score);
      return pairs.slice(0, 50);
    }
    function openDuplicateProductsModal() {
      activePopupModal = 'DUPLICATE_PRODUCTS';
      render();
    }

    function cancelCatalogLongPress(){if(catalogLongPressTimer)clearTimeout(catalogLongPressTimer);catalogLongPressTimer=null;}
    function startProductLongPress(productId,event){if(!(isAdminMode&&isUserAnAdmin)||catalogDragState)return;cancelCatalogLongPress();catalogLongPressTimer=setTimeout(()=>{bulkProductSelectMode=true;bulkCategorySelectMode=false;bulkSelectedCategoryIds.clear();bulkSelectedProductIds.add(String(productId));suppressCatalogClickOnce=true;render();},450);}
    function handleProductCardClick(productId,event){if(suppressCatalogClickOnce){suppressCatalogClickOnce=false;return;}if(bulkProductSelectMode)return toggleBulkProductSelection(productId,event);openProductDetailModal(productId);}
    function startCategoryLongPress(categoryId,event){if(!(isAdminMode&&isUserAnAdmin)||catalogDragState)return;cancelCatalogLongPress();catalogLongPressTimer=setTimeout(()=>{bulkCategorySelectMode=true;bulkProductSelectMode=false;bulkSelectedProductIds.clear();bulkSelectedCategoryIds.add(String(categoryId));suppressCatalogClickOnce=true;render();},450);}
    function handleCategoryRowClick(categoryId,event){if(suppressCatalogClickOnce){suppressCatalogClickOnce=false;return;}if(bulkCategorySelectMode){event?.stopPropagation();const id=String(categoryId);if(bulkSelectedCategoryIds.has(id))bulkSelectedCategoryIds.delete(id);else bulkSelectedCategoryIds.add(id);return render();}adminCatParentId=categoryId;categoryPage=1;render();}
    function clearBulkCategorySelection(){bulkSelectedCategoryIds.clear();bulkCategorySelectMode=false;render();}
    function cleanupCatalogDragVisual(st){
      if(!st)return;
      st.handle?.classList.remove('is-dragging');
      st.source?.classList.remove('fc-drag-source');
      st.targetEl?.classList.remove('fc-drag-target');
      st.placeholder?.replaceWith?.(st.source);
      if (st.source && st.source.parentElement !== st.list) st.list?.appendChild?.(st.source);
      st.ghost?.remove?.();
      window.removeEventListener('pointermove', moveCatalogDrag);
      window.removeEventListener('pointerup', endCatalogDrag);
      window.removeEventListener('pointercancel', cancelCatalogDrag);
    }
    function beginCatalogDrag(kind,id,event){
      if(!(isAdminMode&&isUserAnAdmin))return;
      event.preventDefault();event.stopPropagation();cancelCatalogLongPress();cardActionMenu=null;
      const source=kind==='product'?event.currentTarget.closest('[data-product-card-id]'):event.currentTarget.closest('[data-category-row-id]');
      if(!source)return;
      try{event.currentTarget.setPointerCapture(event.pointerId);}catch(_){}
      const rect=source.getBoundingClientRect();
      const list=source.closest(`[data-catalog-drag-list="${kind}"]`)||source.parentElement;
      const ghost=source.cloneNode(true);
      ghost.removeAttribute('onclick');ghost.removeAttribute('onpointerdown');
      ghost.classList.add('fc-drag-ghost');
      Object.assign(ghost.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',zIndex:'9999',pointerEvents:'none'});
      const placeholder=document.createElement(source.tagName||'div');
      placeholder.className='fc-drag-placeholder';
      placeholder.style.height=`${rect.height}px`;
      placeholder.style.width=`${rect.width}px`;
      placeholder.dataset.dragPlaceholder='1';
      source.replaceWith(placeholder);
      document.body.appendChild(ghost);
      event.currentTarget.classList.add('is-dragging');
      // Handle DOM ichida ko‘chsa ham drag uzilmasligi uchun pointer eventlarni windowda ushlaymiz.
      window.addEventListener('pointermove', moveCatalogDrag, {passive:false});
      window.addEventListener('pointerup', endCatalogDrag);
      window.addEventListener('pointercancel', cancelCatalogDrag);
      const orderedIds = Array.from(list.children).filter(el=>el!==placeholder).map(el=>kind==='product'?el.dataset.productCardId:el.dataset.categoryRowId).filter(Boolean).map(String);
      const originalIndex = kind==='product' ? [...currentVisibleProductIds].map(String).indexOf(String(id)) : categories.filter(c=>String(c.parentId||'')===String(categories.find(x=>String(x.id)===String(id))?.parentId||'')).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(c=>String(c.id)).indexOf(String(id));
      catalogDragState={kind,id:String(id),pointerId:event.pointerId,handle:event.currentTarget,source,list,ghost,placeholder,targetEl:null,pointerOffsetX:event.clientX-rect.left,pointerOffsetY:event.clientY-rect.top,originalIndex,dropIndex:originalIndex,orderedIds};
    }
    function moveCatalogDrag(event){
      const st=catalogDragState;if(!st||st.pointerId!==event.pointerId)return;
      event.preventDefault();
      const listRect=st.list?.getBoundingClientRect?.()||{left:0,right:window.innerWidth,top:0,bottom:window.innerHeight};
      const ghostRect=st.ghost.getBoundingClientRect();
      const maxLeft=Math.max(listRect.left,listRect.right-ghostRect.width),maxTop=Math.max(listRect.top,listRect.bottom-ghostRect.height);
      const left=Math.min(maxLeft,Math.max(listRect.left,event.clientX-st.pointerOffsetX));
      const top=Math.min(maxTop,Math.max(listRect.top,event.clientY-st.pointerOffsetY));
      st.ghost.style.left=`${left}px`;st.ghost.style.top=`${top}px`;
      const edge=86;
      if(event.clientY<edge) window.scrollBy({top:-12,behavior:'auto'});
      else if(event.clientY>(window.innerHeight-edge)) window.scrollBy({top:12,behavior:'auto'});
      const items=Array.from(st.list.children).filter(el=>el!==st.placeholder && (st.kind==='product'?el.matches('[data-product-card-id]'):el.matches('[data-category-row-id]')));
      let inserted=false;
      for(const item of items){
        const r=item.getBoundingClientRect();
        const horizontal = st.kind==='product' && Math.abs(r.left - st.placeholder.getBoundingClientRect().left) > 8;
        const before = horizontal ? (event.clientY < r.top+r.height/2 || (event.clientY < r.bottom && event.clientX < r.left+r.width/2)) : event.clientY < r.top+r.height/2;
        if(before){ if(st.placeholder.nextSibling!==item) st.list.insertBefore(st.placeholder,item); inserted=true; break; }
      }
      if(!inserted) st.list.appendChild(st.placeholder);
      const slots=Array.from(st.list.children).filter(el=>el===st.placeholder || (st.kind==='product'?el.matches('[data-product-card-id]'):el.matches('[data-category-row-id]')));
      st.dropIndex=slots.indexOf(st.placeholder);
    }
    async function endCatalogDrag(event){
      if(!catalogDragState||catalogDragState.pointerId!==event.pointerId)return;
      event.preventDefault();event.stopPropagation();const st=catalogDragState;catalogDragState=null;suppressCatalogClickOnce=true;
      // Shu pointer-up'dan keyin brauzer sintetizatsiya qilishi mumkin bo'lgan
      // bitta clickni yutamiz, ammo keyingi real tap hech qachon bloklanmasin.
      setTimeout(() => { suppressCatalogClickOnce = false; }, 0);
      const to=st.dropIndex, from=st.originalIndex;
      cleanupCatalogDragVisual(st);
      if(from<0||to<0||from===to)return;
      if(st.kind==='product')await reorderProductToIndex(st.id,from,to);else await reorderCategoryToIndex(st.id,from,to);
    }
    function cancelCatalogDrag(event){if(!catalogDragState)return;const st=catalogDragState;catalogDragState=null;cleanupCatalogDragVisual(st);}
    async function reorderProductToIndex(id,from,to){
      const list=[...currentVisibleProductIds].map(String);
      if(from<0) from=list.indexOf(String(id));
      to=Math.max(0,Math.min(Number(to),list.length-1));
      if(from<0||to<0||from===to)return;

      // move_sort backend actioni ikki qo'shni tovarning sort_order qiymatini
      // almashtirish uchun ishlaydi. Drag UI esa birdan yakuniy joyni ko'rsatadi:
      // local tartib avval optimistik yangilanadi, keyin shu o'zgarish serverga
      // qo'shni swaplar ketma-ketligi sifatida persist qilinadi.
      const ordered=list.map(x=>products.find(p=>String(p.id)===x)).filter(Boolean);
      if(ordered.length!==list.length)return;
      const oldOrders=new Map(ordered.map(p=>[String(p.id),p.sortOrder]));
      const oldProductOrder=products.slice();
      const swaps=[];

      if(to>from){
        for(let i=from;i<to;i++){
          const a=ordered[i], b=ordered[i+1];
          const oldA=a.sortOrder, oldB=b.sortOrder;
          a.sortOrder=oldB; b.sortOrder=oldA;
          ordered[i]=b; ordered[i+1]=a;
          swaps.push({idA:a.id,sortOrderA:a.sortOrder,idB:b.id,sortOrderB:b.sortOrder});
        }
      }else{
        for(let i=from;i>to;i--){
          const a=ordered[i], b=ordered[i-1];
          const oldA=a.sortOrder, oldB=b.sortOrder;
          a.sortOrder=oldB; b.sortOrder=oldA;
          ordered[i]=b; ordered[i-1]=a;
          swaps.push({idA:a.id,sortOrderA:a.sortOrder,idB:b.id,sortOrderB:b.sortOrder});
        }
      }

      // Drop qilingach karta darhol yangi joyida ko'rinadi; serverni kutib
      // eski joyiga "sakrab" qaytmaydi.
      products.sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
      render();

      try{
        for(const swap of swaps) await callApi('move_sort',swap);
        saveCatalogCache();
      }catch(e){
        for(const p of products){
          if(oldOrders.has(String(p.id))) p.sortOrder=oldOrders.get(String(p.id));
        }
        products.splice(0,products.length,...oldProductOrder);
        render();
        console.error(e);
        alert(tr("❌ Tartibni saqlab bo'lmadi: ","❌ Не удалось сохранить порядок: ")+(e.message||e));
      }
    }
    async function reorderCategoryToIndex(id,from,to){
      const cat=categories.find(c=>String(c.id)===String(id));if(!cat)return;
      const siblings=categories.filter(c=>String(c.parentId||'')===String(cat.parentId||'')).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)); if(from<0)from=siblings.findIndex(c=>String(c.id)===String(id)); if(from<0||to<0||from===to)return;
      const old=new Map(siblings.map(c=>[String(c.id),c.sortOrder])); const [item]=siblings.splice(from,1); siblings.splice(Math.min(to,siblings.length),0,item); const orders=[...siblings].map(c=>Number(c.sortOrder||0)).sort((a,b)=>a-b); siblings.forEach((c,i)=>c.sortOrder=orders[i]??i); render();
      try{await callApi('reorder_categories',{items:siblings.map(c=>({id:c.id,sortOrder:c.sortOrder}))});saveCatalogCache();}
      catch(e){for(const c of siblings)if(old.has(String(c.id)))c.sortOrder=old.get(String(c.id));render();console.error(e);alert(tr("❌ Tartibni saqlab bo'lmadi: ","❌ Не удалось сохранить порядок: ")+(e.message||e));}
    }

    function openBulkMoveCategoriesModal(){if(!bulkSelectedCategoryIds.size)return;movePickerParentId=null;movePickerSearch='';activePopupModal='BULK_MOVE_CATEGORIES';render();}
    async function bulkTrashSelectedCategories(){const ids=[...bulkSelectedCategoryIds];if(!ids.length)return;let prods=0;try{for(const id of ids){const p=await callApi('get_category_delete_preview',{categoryId:id});prods+=Number(p.productCount||0);}}catch(e){return alert(tr('Tekshirishda xatolik: ','Ошибка проверки: ')+(e.message||e));}const ok=await fcConfirm(tr('Tanlangan kataloglar o‘chirilsinmi?','Удалить выбранные каталоги?'),tr(`${ids.length} ta katalog va ularning ichidagi ${prods} ta tovar 24 soatlik Chiqindiga o‘tadi.`,`${ids.length} каталог(ов) и ${prods} товар(ов) будут перемещены в корзину на 24 часа.`));if(!ok)return;showActionToast(tr('O‘chirilmoqda...','Удаление...'),'saving');try{for(const id of ids)await callApi('delete_category',{categoryId:id});await loadCatalog();bulkSelectedCategoryIds.clear();bulkCategorySelectMode=false;render();showActionToast(tr('Chiqindiga o‘tkazildi','Перемещено в корзину'),'success',1500);}catch(e){console.error(e);await loadCatalog();bulkSelectedCategoryIds.clear();bulkCategorySelectMode=false;render();alert(tr('O‘chirishda xatolik: ','Ошибка удаления: ')+(e.message||e));}}

    function toggleBulkProductSelectMode() {
      bulkProductSelectMode = !bulkProductSelectMode;
      bulkSelectedProductIds.clear();
      render();
    }
    function toggleBulkProductSelection(productId, event) {
      if (event) event.stopPropagation();
      const id = String(productId);
      if (bulkSelectedProductIds.has(id)) bulkSelectedProductIds.delete(id); else bulkSelectedProductIds.add(id);
      render();
    }
    function selectAllVisibleProducts() {
      for (const id of currentVisibleProductIds) bulkSelectedProductIds.add(String(id));
      render();
    }
    function clearBulkProductSelection() {
      bulkSelectedProductIds.clear();
      bulkProductSelectMode = false;
      render();
    }
    function openBulkMoveProductsModal() {
      if (!bulkSelectedProductIds.size) return;
      bulkMoveTargetCategoryId = ''; movePickerParentId = null; movePickerSearch = ''; activePopupModal = 'BULK_MOVE_PRODUCTS';
      render();
    }
    async function saveBulkMoveProducts() {
      const ids = [...bulkSelectedProductIds];
      if (!ids.length) return;
      showActionToast(tr('⏳ Ko‘chirilmoqda...','⏳ Перемещение...'), 'saving');
      try {
        const result = await callApi('bulk_move_products', { productIds: ids, categoryId: movePickerParentId || null });
        for (const row of result.products || []) upsertLocalProduct(row);
        saveCatalogCache();
        activePopupModal = null; bulkProductSelectMode = false; bulkSelectedProductIds.clear();
        render();
        showActionToast(tr('✅ Tovarlar ko‘chirildi','✅ Товары перемещены'), 'success', 1500);
      } catch (e) {
        console.error(e);
        alert(tr('❌ Ko‘chirishda xatolik: ','❌ Ошибка перемещения: ') + (e.message || e));
      }
    }
    async function bulkTrashSelectedProducts() {
      const ids = [...bulkSelectedProductIds];
      if (!ids.length) return;
      if (!confirm(`${ids.length} ${tr('ta tovar chiqindiga o‘tkazilsinmi?','товаров переместить в корзину?')}`)) return;
      showActionToast(tr('⏳ Chiqindiga o‘tkazilmoqda...','⏳ Перемещение в корзину...'), 'saving');
      try {
        await callApi('bulk_trash_products', { productIds: ids });
        products = products.filter(p => !bulkSelectedProductIds.has(String(p.id)));
        bulkSelectedProductIds.clear(); bulkProductSelectMode = false;
        saveCatalogCache(); render();
        showActionToast(tr('✅ Chiqindiga o‘tkazildi','✅ Перемещено в корзину'), 'success', 1500);
      } catch (e) { console.error(e); alert(tr('❌ Xatolik: ','❌ Ошибка: ') + (e.message || e)); }
    }
    async function purgeTrashBatchNow(batchId) {
      const ok = await fcConfirm(tr('Butunlay o‘chirilsinmi?', 'Удалить навсегда?'), tr('Bu elementlar darhol va qaytarib bo‘lmaydigan tarzda o‘chiriladi.', 'Эти элементы будут удалены немедленно и без возможности восстановления.'));
      if (!ok) return;
      showActionToast(tr('⏳ Butunlay o‘chirilmoqda...','⏳ Удаление навсегда...'), 'saving');
      try {
        await callApi('purge_trash_batch_now', { batchId });
        if (trashBatches) trashBatches = trashBatches.filter(b => String(b.id) !== String(batchId));
        await loadCatalog(); render();
        showActionToast(tr('✅ Butunlay o‘chirildi','✅ Удалено навсегда'), 'success', 1500);
      } catch (e) { console.error(e); alert(tr('❌ O‘chirishda xatolik: ','❌ Ошибка удаления: ') + (e.message || e)); }
    }
    async function openDashboardLite() {
      dashboardLiteData = null; dashboardLiteLoading = true; dashboardCustomerPage = 1;
      dashboardTab = 'UMUMIY'; dashboardPeriod = 'all'; dashboardCustomFrom = ''; dashboardCustomTo = '';
      openPage('DASHBOARD');
      try {
        dashboardLiteData = await callApi('get_dashboard_lite', { period: dashboardPeriod });
        // Dashboard javobi to'liq mijozlar ro'yxatini ham olib keladi —
        // Support/boshqa joylarda alohida get_users_summary so'rovi shart emas.
        if (dashboardLiteData?.customers?.all) { usersSummary = dashboardLiteData.customers.all; usersLoaded = true; }
      }
      catch (e) { console.error(e); dashboardLiteData = null; alert(tr('❌ Dashboard yuklanmadi: ','❌ Dashboard не загружен: ') + (e.message || e)); }
      finally { dashboardLiteLoading = false; if (activePage === 'DASHBOARD') render(); }
    }
    function setDashboardCustomerPage(p) { dashboardCustomerPage = p; render(); }

    // 28-30-band: bitta trash batch kartasi. CATEGORY-turdagi batch hozirgidek
    // BUTUN BATCH sifatida tiklanadi/o'chiriladi (kategoriyani "qisman"
    // tiklash struktura jihatidan mantiqsiz). PRODUCT-turdagi batch esa
    // mahsulot darajasida tanlab tiklash/o'chirish imkonini beradi.
    function trashBatchSearchText(b) {
      return normalizeText([
        b.rootCategoryName || '',
        ...(b.productNames || []),
        ...((b.productItems || []).map(p => `${p.name || ''} ${p.sku || ''}`))
      ].join(' ')).latin;
    }
    function setTrashSearchQuery(value) {
      trashSearchQuery = String(value || '');
      const q = normalizeText(trashSearchQuery).latin;
      document.querySelectorAll('.fc-trash-card[data-search]').forEach(card => {
        card.hidden = !!q && !String(card.dataset.search || '').includes(q);
      });
    }
    function cancelTrashLongPress() {
      if (trashLongPressTimer) clearTimeout(trashLongPressTimer);
      trashLongPressTimer = null;
    }
    function startTrashLongPress(batchId, event) {
      cancelTrashLongPress();
      trashLongPressTimer = setTimeout(() => {
        trashBulkSelectMode = true;
        trashSelectedBatchIds.add(String(batchId));
        suppressTrashClickOnce = true;
        render();
      }, 450);
    }
    function handleTrashBatchClick(batchId, event) {
      cancelTrashLongPress();
      if (suppressTrashClickOnce) { suppressTrashClickOnce = false; return; }
      if (!trashBulkSelectMode) return;
      event?.stopPropagation();
      const id = String(batchId);
      if (trashSelectedBatchIds.has(id)) trashSelectedBatchIds.delete(id); else trashSelectedBatchIds.add(id);
      render();
    }
    function clearTrashBulkSelection() {
      trashSelectedBatchIds.clear();
      trashBulkSelectMode = false;
      trashActionMenuBatchId = null;
      render();
    }
    function toggleTrashActionMenu(batchId, event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      cancelTrashLongPress();
      trashActionMenuBatchId = trashActionMenuBatchId === String(batchId) ? null : String(batchId);
      renderModalContainer();
      if (window.lucide) lucide.createIcons();
    }
    function closeTrashActionMenu() {
      if (trashActionMenuBatchId === null) return;
      trashActionMenuBatchId = null;
      renderModalContainer();
      if (window.lucide) lucide.createIcons();
    }
    async function restoreTrashBatchFromMenu(batchId, event) {
      event?.stopPropagation?.();
      trashActionMenuBatchId = null;
      await restoreTrashBatch(String(batchId));
    }
    async function purgeTrashBatchFromMenu(batchId, event) {
      event?.stopPropagation?.();
      trashActionMenuBatchId = null;
      await purgeTrashBatchNow(String(batchId));
    }
    async function restoreSelectedTrashBatches() {
      const ids = [...trashSelectedBatchIds];
      if (!ids.length) return;
      showActionToast(tr('Tiklanmoqda...', 'Восстановление...'), 'saving');
      try {
        for (const id of ids) await callApi('restore_trash_batch', { batchId: String(id) });
        await loadCatalog();
        trashBatches = (trashBatches || []).filter(b => !trashSelectedBatchIds.has(String(b.id)));
        clearTrashBulkSelection();
        showActionToast(tr('Tiklandi', 'Восстановлено'), 'success', 1500);
      } catch (e) {
        console.error(e);
        await openTrashModal();
        showActionToast(tr('Tiklanmadi', 'Не восстановлено'), 'error', 1800);
        alert(tr('Xatolik: ', 'Ошибка: ') + (e.message || e));
      }
    }
    async function purgeSelectedTrashBatches() {
      const ids = [...trashSelectedBatchIds];
      if (!ids.length) return;
      const ok = await fcConfirm(
        tr('Butunlay o‘chirilsinmi?', 'Удалить навсегда?'),
        tr(`${ids.length} ta tanlangan element qaytarib bo‘lmaydigan tarzda o‘chiriladi.`, `${ids.length} выбранных элементов будут удалены без возможности восстановления.`)
      );
      if (!ok) return;
      showActionToast(tr('Butunlay o‘chirilmoqda...', 'Удаление навсегда...'), 'saving');
      try {
        for (const id of ids) await callApi('purge_trash_batch_now', { batchId: String(id) });
        trashBatches = (trashBatches || []).filter(b => !trashSelectedBatchIds.has(String(b.id)));
        await loadCatalog();
        clearTrashBulkSelection();
        showActionToast(tr('Butunlay o‘chirildi', 'Удалено навсегда'), 'success', 1500);
      } catch (e) {
        console.error(e);
        await openTrashModal();
        alert(tr('O‘chirishda xatolik: ', 'Ошибка удаления: ') + (e.message || e));
      }
    }
    function renderTrashBatchHtml(b) {
      const selected = trashSelectedBatchIds.has(String(b.id));
      const isCategory = b.kind !== 'PRODUCT';
      const title = isCategory
        ? (b.rootCategoryName || ('#' + b.id))
        : ((b.productNames || [])[0] || (b.productItems || [])[0]?.name || ('#' + b.id));
      const extra = !isCategory && (b.productItems || []).length > 1 ? ` +${(b.productItems || []).length - 1}` : '';
      const countLine = isCategory
        ? `${b.categoryCount ? `${b.categoryCount} ${tr('katalog','кат.')} · ` : ''}${b.productCount || 0} ${tr('tovar','тов.')}`
        : `${(b.productItems || []).length || b.productCount || 1} ${tr('tovar','тов.')}`;
      return `
        <article data-trash-batch-id="${escapeHtml(String(b.id))}"
          onpointerdown="startTrashLongPress('${escapeHtml(String(b.id))}', event)"
          onpointerup="cancelTrashLongPress()" onpointercancel="cancelTrashLongPress()" onpointerleave="cancelTrashLongPress()"
          onclick="handleTrashBatchClick('${escapeHtml(String(b.id))}', event)"
          data-search="${escapeHtml(trashBatchSearchText(b))}" class="fc-trash-card ${selected ? 'is-selected' : ''} ${trashBulkSelectMode ? 'is-selecting' : ''} ${trashActionMenuBatchId === String(b.id) ? 'is-menu-open' : ''}">
          <div class="fc-trash-card-icon"><i data-lucide="${isCategory ? 'folder' : 'package'}" class="w-4 h-4"></i></div>
          <div class="fc-trash-card-main">
            <b>${escapeHtml(title)}${extra}</b>
            <small>${escapeHtml(countLine)} · ${tr('Muddati','Истекает')}: ${escapeHtml(new Date(b.expiresAt).toLocaleString())}</small>
          </div>
          ${trashBulkSelectMode ? `<span class="fc-select-dot ${selected ? 'is-selected' : ''}"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>` : `<div class="fc-trash-more-wrap" onclick="event.stopPropagation()"><button type="button" class="fc-trash-more-btn" aria-label="${tr('Amallar','Действия')}" onpointerdown="event.stopPropagation()" onclick="toggleTrashActionMenu('${escapeHtml(String(b.id))}',event)"><i data-lucide="ellipsis-vertical" class="w-4 h-4"></i></button>${trashActionMenuBatchId === String(b.id) ? `<div class="fc-trash-card-menu" onclick="event.stopPropagation()"><button type="button" onclick="restoreTrashBatchFromMenu('${escapeHtml(String(b.id))}',event)"><i data-lucide="rotate-ccw" class="w-4 h-4"></i><span>${tr('Tiklash','Восстановить')}</span></button><button type="button" class="is-danger" onclick="purgeTrashBatchFromMenu('${escapeHtml(String(b.id))}',event)"><i data-lucide="trash-2" class="w-4 h-4"></i><span>${tr('Butunlay o‘chirish','Удалить навсегда')}</span></button></div>` : ''}</div>`}
        </article>`;
    }

    // 2.5: Chiqindi (trash) ko'rinishi.
    async function openTrashModal() {
      trashActionMenuBatchId = null;
      trashBatches = null;
      activePopupModal = 'TRASH';
      render();
      try {
        const result = await callApi('get_trash', {});
        trashBatches = result.batches || [];
      } catch (e) {
        console.error(e);
        trashBatches = [];
      }
      if (activePopupModal === 'TRASH') { renderModalContainer(); if (window.lucide) lucide.createIcons(); }
    }
    async function restoreTrashBatch(batchId) {
      showActionToast(tr('⏳ Tiklanmoqda...', '⏳ Восстановление...'), 'saving');
      try {
        await callApi('restore_trash_batch', { batchId });
        await loadCatalog();
        if (trashBatches) trashBatches = trashBatches.filter(b => String(b.id) !== String(batchId));
        render();
        showActionToast(tr('✅ Tiklandi', '✅ Восстановлено'), 'success', 1500);
      } catch (e) {
        console.error(e);
        showActionToast(tr('❌ Tiklanmadi', '❌ Не восстановлено'), 'error', 1800);
        alert(tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e));
      }
    }

    async function saveBulkStock() {
      const input = document.getElementById('bulk-input').value.trim();
      if (!input) return alert(tr("Ma'lumot kiriting!", "Введите данные!"));

      const lines = input.split('\n');
      const updates = [];

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const sku = parts[0].toUpperCase();
          const stock = parseInt(parts[1], 10);
          if (!isNaN(stock)) updates.push({ sku, stock });
        }
      });

      if (updates.length === 0) return alert(tr("Hech qanday to'g'ri qator topilmadi!", "Не найдено ни одной корректной строки!"));

      try {
        const result = await callApi('bulk_stock_update', { updates });
        (result.products || []).forEach(row => {
          const mapped = mapProductFromDB(row);
          const idx = products.findIndex(p => p.id === mapped.id);
          if (idx >= 0) products[idx] = mapped;
        });
        const okCount = (result.products || []).length;
        const errs = result.errors || [];
        if (errs.length) {
          const sample = errs.slice(0, 5).map(x => `${x.sku || '?'}: ${x.error || 'xato'}`).join('\n');
          alert(`✅ ${okCount} ${tr("ta mahsulot qoldig'i yangilandi",'товаров: остатки обновлены')}\n⚠️ ${errs.length} ${tr('ta qator yangilanmadi','строк не обновлено')}\n${sample}`);
        } else {
          alert(`✅ ${okCount} ${tr("ta mahsulot qoldig'i yangilandi!",'товаров: остатки обновлены!')}`);
        }
        render();
      } catch (e) {
        console.error(e);
        alert(tr("❌ Xatolik yuz berdi: ", "❌ Произошла ошибка: ") + (e.message || e));
      }
    }

    // ============ FON YANGILANISHI (polling — pastga qarang) ============
    // Bu ikkita helper hozir ham ishlatiladi: shu clientning O'Z amali (masalan
    // admin add_product/edit_category chaqirgach) natijasini local state'ga
    // darhol yozish uchun — server javobidan olingan qatorni to'g'ridan-to'g'ri
    // qo'yadi, boshqa hech qanday kanal/signal orqali emas.
    function upsertLocalProduct(row) {
      const mapped = mapProductFromDB(row);
      if (mapped.status === 'DELETED') {
        products = products.filter(p => p.id !== mapped.id);
        return;
      }
      const idx = products.findIndex(p => p.id === mapped.id);
      if (idx >= 0) products[idx] = mapped; else products.push(mapped);
      products.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }

    // MUHIM: bu doim "yangilash yoki qo'shish" (upsert) tarzida ishlaydi —
    // to'g'ridan-to'g'ri push() ishlatmaymiz, chunki real-time signal ham
    // xuddi shu tovar/katalogni bir vaqtda qo'shib qo'yishi mumkin edi va
    // bitta tovar RO'YXATDA IKKI MARTA ko'rinib qolardi (haqiqiy bug edi).
    function upsertLocalCategory(row) {
      const mapped = mapCategoryFromDB(row);
      const idx = categories.findIndex(c => c.id === mapped.id);
      if (idx >= 0) categories[idx] = mapped; else categories.push(mapped);
    }

    // 3.2-band (Phase 2 security hardening): the old shop-events:<shopId>
    // Supabase Realtime broadcast channel was PUBLIC — any client holding
    // just the publishable key could subscribe to, or worse SEND on, any
    // shop's channel by knowing/guessing its UUID. Building real Realtime
    // Authorization (private channels + RLS on realtime.messages) is real
    // extra complexity for marginal benefit on a shop this size, so — as
    // explicitly permitted — this is now tenant-safe POLLING instead: no
    // channel exists at all, so there is nothing to spoof or eavesdrop on.
    // Every poll target still only fires if that data section is actually
    // loaded/visible (same "don't send needless requests" guard the old
    // orders-only poller already had) — this just generalizes that pattern
    // to catalog/admins/support too, on the same shared interval.
    //
    // This client's OWN edits still update local state immediately at each
    // call site (upsertLocalProduct/upsertLocalCategory etc.) — polling
    // only covers "someone ELSE (another admin, another session) changed
    // something," which is inherently a slower-than-instant, eventually-
    // consistent signal now, matching what the spec explicitly allowed.
    function setupPolling() {
      startBackgroundPolling();
    }

    let ordersSnapshot = JSON.stringify(orders.map(o => [o.id, o.status]));
    let pollTimer = null;
    // Phase 3 tuzatish: root cause — 90s fon polling har safar ishga
    // tushganda `render()` ni SO'ZSIZ chaqirardi, bu esa renderModalContainer()
    // orqali ochiq modal HTML'sini butunlay qayta yozib yuborardi (ADD_PROD'da
    // bo'sh inputlar bilan, EDIT_PROD_FIELD'da bazadagi eski qiymat bilan) —
    // admin hali Saqlash bosmagan, DOM'dagi .value'da yashab turgan matnni
    // yo'qotardi. Draft alohida JS state'da saqlanmagani uchun (mavjud
    // arxitektura shunday) yagona xavfsiz yechim — bu ochiq tovar/kategoriya
    // muharrirlari davomida fon poll'ning render() chaqiruvini o'tkazib
    // yuborish (ma'lumotning o'zi loadCatalog() orqali fonda baribir yangilanadi
    // — modal yopilganda ko'rinadigan holat allaqachon dolzarb bo'ladi).
    // 11-band: xuddi shu muammo (fon poll render()ni qayta yozib, saqlanmagan
    // matnni yo'qotib qo'yishi) mijoz checkout formasida ham bor edi — nom
    // "CatalogEditor" bo'lsa-da, bu funksiya allaqachon barcha poll/stale-
    // while-revalidate chaqiruv joylarida ishlatiladi, shuning uchun
    // CHECKOUT_FORM'ni shu yerga qo'shish yagona joydan barcha chaqiruv
    // nuqtalarini avtomatik himoya qiladi (funksiyani qayta nomlash/har bir
    // chaqiruv joyini alohida o'zgartirish shart emas).
    function isCatalogEditorModalOpen() {
      return activePopupModal === 'ADD_PROD' || activePopupModal === 'EDIT_PROD_FIELD'
        || activePopupModal === 'ADD_CAT' || activePopupModal === 'EDIT_CAT'
        || activePopupModal === 'CHECKOUT_FORM';
    }
    function startBackgroundPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (document.visibilityState !== 'visible') return;

        if (ordersLoaded) {
          try {
            const data = isUserAnAdmin && isAdminMode ? await callApi('get_all_orders', {}) : await callApi('get_my_orders', {});
            const freshOrders = (data.orders || []).map(formatOrderForUi);
            const freshSnapshot = JSON.stringify(freshOrders.map(o => [o.id, o.status]));
            if (freshSnapshot !== ordersSnapshot) {
              ordersSnapshot = freshSnapshot;
              orders = freshOrders;
              if (currentTab === 'orders') render();
            }
          } catch (e) { console.error('Buyurtmalarni fon tekshiruvi xatosi:', e); }
        }
        if (isUserAnAdmin && usersLoaded) {
          try { await loadUsersLazy(true); } catch (e) { console.error('Foydalanuvchilarni fon tekshiruvi xatosi:', e); }
        }
        if (currentTab === 'home' || currentTab === 'categories' || currentTab === 'warehouse' || selectedProductModal) {
          try { await loadCatalog(); if (!isCatalogEditorModalOpen()) render(); } catch (e) { console.error('Katalogni fon tekshiruvi xatosi:', e); }
        }
        // 7-band: warehouseSummaryData (Tugagan/Kam qolgan hisoblagichlari va
        // filtrlangan ro'yxatlari) yuqoridagi loadCatalog() bilan birga
        // yangilanmasdi — Omborga birinchi kirilgandagi eski holicha qolib
        // ketardi (masalan mijoz buyurtma berib tovar 0'ga tushsa ham).
        if (currentTab === 'warehouse' && warehouseSummaryLoaded) {
          try { await loadWarehouseSummary(true); } catch (e) { console.error('Ombor holatini fon tekshiruvi xatosi:', e); }
        }
        if (isSuperAdmin && adminsLoaded) {
          try { await loadAdminsLazy(true); } catch (e) { console.error('Adminlarni fon tekshiruvi xatosi:', e); }
        }
        if (isUserAnAdmin && adminSupportTicketsLoaded) {
          try { await loadAdminSupportTicketsLazy(true); } catch (e) { console.error('Support ro\'yxatini fon tekshiruvi xatosi:', e); }
        }
        if (supportTicketsLoaded) {
          try { await loadMySupportTicketsLazy(true); } catch (e) { console.error('Support ro\'yxatini fon tekshiruvi xatosi:', e); }
        }
        const activeTicketId = openSupportTicketId || adminSupportSelectedTicketId;
        if (activeTicketId) {
          try { await loadSupportMessages(activeTicketId, true); } catch (e) { console.error('Support xabarlarini fon tekshiruvi xatosi:', e); }
        }
        // Shop takomillashtirish, 10-band: admin Xodimlar sahifasida bo'lsa,
        // taklif qabul qilingani/status o'zgargani sahifani qayta ochmasdan ko'rinsin.
        if (activePage === 'STAFF' && staffListLoaded) {
          try { await loadStaffListLazy(true); } catch (e) { console.error('Xodimlar ro\'yxati fon tekshiruvi xatosi:', e); }
        }
        // 11-band: xodimning o'z huquqi (rol o'zgartirilgani) ilovani qayta
        // ochmasdan ko'rinishi uchun — yengil action, faqat isAdmin bo'lsa.
        if (isUserAnAdmin) {
          try {
            const permData = await callApi('get_my_permissions', {});
            const freshPerms = JSON.stringify([permData.staffRole, permData.myPermissions]);
            const curPerms = JSON.stringify([staffRole, myPermissions]);
            if (freshPerms !== curPerms) {
              staffRole = permData.staffRole; myPermissions = Array.isArray(permData.myPermissions) ? permData.myPermissions : [];
              render();
            }
          } catch (e) { console.error('Huquqlarni fon tekshiruvi xatosi:', e); }
        }
      }, 90000);
    }

    // ============ BOOT: TEZKOR / STALE-WHILE-REVALIDATE ============
    const CATALOG_CACHE_KEY = scopedKey('catalog_cache_v1');
    let catalogLoading = false;
    function hydrateCatalogCache() {
      try {
        const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
        if (!cached || !Array.isArray(cached.products) || !Array.isArray(cached.categories)) return false;
        products = cached.products; categories = cached.categories;
        return true;
      } catch { return false; }
    }
    function saveCatalogCache() {
      try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ products, categories, at: Date.now() })); } catch {}
    }
    async function loadCatalog() {
      const perfStarted = performance.now();
      catalogLoading = true;
      // 15-band: no more direct Supabase-client reads of products/categories —
      // the frontend's publishable key has no business-table read access at
      // all now (RLS is on with no permissive policies — see 001-005's RLS
      // notes); every shop's catalog comes back through this one
      // shop-scoped server action instead.
      const catalogRes = await callApi('get_catalog', {});
      products = (catalogRes.products || []).map(mapProductFromDB);
      categories = (catalogRes.categories || []).map(mapCategoryFromDB);
      saveCatalogCache();
      catalogLoading = false;
      const ms = Math.round(performance.now() - perfStarted);
      if (ms >= 500) console.info(`[USTORE perf] Catalog: ${ms}ms (${products.length} products, ${categories.length} categories)`);
      return true;
    }

    async function boot() {
      // MUHIM: ilova FAQAT Telegram orqali ochilganda ishlaydi. Bu ataylab
      // shunday qilingan — aks holda oddiy brauzerda ochib, admin bo'lib
      // olish mumkin bo'lardi (avvalgi versiyadagi xavfsizlik teshigi).
      if (!tg || !tg.initData) {
        document.getElementById('app-content').innerHTML = `
          <div class="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-4 rounded-2xl mt-10 text-center">
            ⚠️ Bu ilova faqat Telegram bot orqali ishlaydi.<br>Iltimos, Telegram'dagi bot/mini-app orqali oching.
          </div>`;
        return;
      }
      // 6-band: bitta origin barcha shop botlar uchun ishlaydi — ?bot_id=
      // bo'lmasa server qaysi do'kon ekanini bila olmaydi (bu holat menu
      // button URL noto'g'ri sozlangan bo'lsa yuz berishi mumkin).
      if (!BOT_ID) {
        document.getElementById('app-content').innerHTML = `
          <div class="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-4 rounded-2xl mt-10 text-center">
            ⚠️ Do'kon aniqlanmadi (bot_id yo'q).<br>Iltimos, botning Mini App havolasini tekshiring.
          </div>`;
        return;
      }

      const hadCache = hydrateCatalogCache();
      // Katalog cache darhol xotiraga olinadi, lekin ADMIN/USER roli aniqlanmaguncha
      // hech narsa render qilinmaydi. Shu bilan USER -> ADMIN sakrashi yo'qoladi.
      const catalogPromise = loadCatalog().then(() => {
        // 14-band: boot'ning stale-while-revalidate yangilanishi ham draft
        // yo'qolish bugiga hissa qo'shishi mumkin edi (juda kam uchraydigan
        // holat — admin modal ochishga ulgurgan bo'lsa) — shu poll bilan bir
        // xil himoya qo'yildi.
        if (authReady && (currentTab === 'home' || currentTab === 'categories' || currentTab === 'warehouse') && !isCatalogEditorModalOpen()) render();
      });

      try {
        // boot endi faqat auth + foydalanuvchi holati + shop settings. Orders/users/admins bu yerda yuklanmaydi.
        const bootData = await callApi('boot', {});
        currentTgId = bootData.tgId;
        isSuperAdmin = bootData.isSuperAdmin;
        staffRole = bootData.staffRole || null;
        myPermissions = Array.isArray(bootData.myPermissions) ? bootData.myPermissions : [];
        pendingStaffInvite = bootData.pendingStaffInvite || null;
        isUserAnAdmin = bootData.isAdmin;
        isAdminMode = isUserAnAdmin;
        currentUser.tgId = currentTgId;
        myStatus = {
          isBlocked: !!bootData.isBlocked, blockReason: bootData.blockReason || null,
          isWarned: !!bootData.isWarned, warnReason: bootData.warnReason || null,
        };
        shopLogoUrl = bootData.logoUrl || null;
        botUsername = bootData.botUsername || null;
        shopContact = bootData.shopContact || { name: null, address: null, addressRu: null, coordinates: null, phone: null, phone2: null, phone3: null, instagram: null, telegram: null, facebook: null, startMessage: null, workHours: null };
        shopLowStockThreshold = Number.isFinite(Number(bootData.lowStockThreshold)) ? Number(bootData.lowStockThreshold) : 5;
        billzAccessGranted = bootData.billzAccessGranted === true;
        clickAccessGranted = bootData.clickAccessGranted === true;
        mySubscribedProductIds = new Set((bootData.mySubscribedProductIds || []).map(String));
        ordersPaused = bootData.ordersPaused === true;
        ordersPausedNote = bootData.ordersPausedNote || '';
        activeBanners = Array.isArray(bootData.activeBanners) ? bootData.activeBanners : [];
        featuredCategories = Array.isArray(bootData.featuredCategories) ? bootData.featuredCategories : [];
        customerCancelCutoff = bootData.customerCancelCutoff || 'BEFORE_SHIPPED';
        returnRequestsEnabled = bootData.returnRequestsEnabled !== false;
        fulfillmentConfig = commerce.normalizeConfig(bootData.fulfillmentConfig, TOP_LEVEL_REGION_IDS);
        designSettings = bootData.designSettings || { themeId: 'minimal', colors: {} };
        legalDocuments = Array.isArray(bootData.legalDocuments) ? bootData.legalDocuments : [];
        legalConsentRequired = bootData.legalConsentRequired === true;
        applyDesignColors(designSettings.colors, designSettings.themeId);
        if (bootData.profile?.phone) {
          registeredUser = { firstName: bootData.profile.firstName || '', lastName: bootData.profile.lastName || '', phone: bootData.profile.phone };
          currentUser.firstName = registeredUser.firstName; currentUser.lastName = registeredUser.lastName; currentUser.phone = registeredUser.phone;
          localStorage.setItem(scopedKey('registeredUser'), JSON.stringify(registeredUser));
        }
        authReady = true;
        loadFavorites(); // 17-band: bir marta, fonda — heart iconlar to'g'ri holatda chiqishi uchun
        loadRecentViews(); // 18-band: bir marta, fonda
      } catch (e) {
        // Shop takomillashtirish round, 1-band: raw texnik xato (masalan
        // "Cannot read properties of null...") oddiy foydalanuvchiga
        // ko'rsatilmaydi — faqat konsolda (dev tools) qoladi. "Qayta
        // urinish" tugmasi ilovani to'liq yopib-ochish shart qilmaydi.
        console.error('Yuklashda xatolik:', e);
        document.getElementById('app-content').innerHTML = `
          <div class="fc-bg-danger-soft border fc-border-danger fc-text-danger text-xs p-4 rounded-2xl mt-10 text-center">
            ⚠️ ${tr("Ma'lumotlarni yuklab bo'lmadi.", 'Не удалось загрузить данные.')}<br>${tr('Internetni tekshiring va qayta urinib ko‘ring.', 'Проверьте интернет и попробуйте снова.')}<br><br>
            <button type="button" onclick="boot()" class="fc-btn fc-btn-primary">${tr('Qayta urinish', 'Повторить')}</button>
          </div>`;
        return;
      }

      setupPolling();
      switchTab('home');
      catalogPromise.catch(e => console.error('Katalogni yangilash xatosi:', e));

      // Eski versiyalarda FRESH deb noto'g'ri belgilangan yoki bo'sh qolgan RU
      // matnlarni bir sessiyada bir marta server fonida qayta tekshirtiramiz.
      // Bu boot'ni kutdirmaydi va oddiy foydalanuvchida umuman ishlamaydi.
      if (isUserAnAdmin && sessionStorage.getItem(scopedKey('ru-repair-v1')) !== '1') {
        sessionStorage.setItem(scopedKey('ru-repair-v1'), '1');
        callApi('retry_bad_translations', {}).then((r) => {
          if (Number(r?.scheduledProducts || 0) + Number(r?.scheduledCategories || 0) > 0) {
            console.info('[USTORE] RU translation repair scheduled', r);
          }
        }).catch((e) => console.warn('[USTORE] RU translation repair could not start', e));
      }
    }

    // INITIAL LAUNCH
    boot();
