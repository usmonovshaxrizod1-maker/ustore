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
        isFeatured: r.is_featured, sortOrder: r.sort_order,
        sizes: legacySizes, variants,
        soldCount: r.sold_count || 0, createdAt: r.created_at || null,
        importBatchId: r.import_batch_id || null
      };
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
      return { ...o, date: new Date(o.createdAt).toLocaleString() };
    }

    // STATE VARIABLES (bo'sh boshlanadi, Supabase/Edge Function'dan yuklanadi)
    let products = [];
    let categories = [];
    let adminsList = [];
    let orders = [];
    let ordersLoaded = false, ordersLoading = false;
    let usersLoaded = false, usersLoading = false;
    let adminsLoaded = false, adminsLoading = false;
    // 2-10-band (2026-08-17): qo'llab-quvvatlash — cheksiz xabarlashuvli
    // thread, admin tomonda user->chatlar->chat bo'ylab guruhlangan.
    let supportTickets = [];
    let supportTicketsLoaded = false, supportTicketsLoading = false;
    let adminSupportTickets = [];
    let adminSupportTicketsLoaded = false, adminSupportTicketsLoading = false;
    let supportTicketOrderId = null; // openSupportModal(orderId) orqali kelgan kontekst
    let supportMessages = []; // hozir ochiq chatning xabarlari
    let supportMessagesLoading = false;
    let openSupportTicketId = null; // mijoz tomonda hozir ochiq chat
    let supportReplyTarget = null; // {id, body, sender} — "shu xabarga javob" preview
    let supportSendingMessage = false; // 41-band: ikki marta yuborishni oldini olish
    let adminSupportSelectedUser = null; // admin: Support -> User bosqichi
    let adminSupportSelectedTicketId = null; // admin: User -> Chat bosqichi
    let cart = JSON.parse(localStorage.getItem(scopedKey('cart')) || "{}");
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
    let categoryFilter = { search: '', minPrice: '', maxPrice: '', sortPrice: null, sortNew: null, sortSold: null, inStockOnly: false };
    // 23-band: Bosh sahifa qidiruv matni — search-input DOM elementi qayta
    // chizilganda (masalan product detaildan orqaga qaytilganda) yo'qolmasin.
    let homeSearchQuery = '';
    let ordersPage = 1;
    let userOrderFilter = 'ALL';
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
    // 'MENU' (A/B tanlash) | 'DELIVERY' | 'PAYMENTS' — 1.1 talabiga ko'ra
    // "Yetkazib berish va to'lov" endi ikkita alohida bo'limga bo'lingan.
    let fulfillmentSettingsSection = 'MENU';
    let fulfillmentDeliveryKind = 'FREE'; // FREE | FIXED | TAXI | POST (faqat DELIVERY bo'limida)
    let fulfillmentExpandedPayment = null; // CASH | CARD | null (faqat PAYMENTS bo'limida, 1.2: yonma-yon + inline ochilish)
    let selectedDeliveryMethodId = checkoutDraft.deliveryMethodId || null;
    let selectedPayMethod = checkoutDraft.paymentMethodId || null;
    let selectedQrProviderId = null;
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
        if (product.status === 'DELETED' || product.categoryId === null || product.categoryId === undefined) continue;
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
    function searchProducts(query) {
      const activeProducts = products.filter(p => p.status !== 'DELETED').sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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
        if (nameMatch || skuMatch || descMatch || descRuMatch || variantSkuMatch || variantTextMatch) {
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
        if (currentTab === 'profile' && !isCatalogEditorModalOpen()) render();
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
    function openSupportModal(orderId) {
      supportTicketOrderId = orderId || null;
      openSupportTicketId = null;
      supportMessages = [];
      supportReplyTarget = null;
      openPage('SUPPORT', 'nav-support-btn');
      loadMySupportTicketsLazy().then(resolveActiveSupportTicket);
    }
    // Shu order (yoki umumiy) uchun yopilmagan ticket bo'lsa, to'g'ridan-
    // to'g'ri o'sha chatni ochadi — bo'lmasa yangi xabar yozish ko'rinishi qoladi.
    function resolveActiveSupportTicket() {
      const active = supportTickets.find(t => t.status !== 'CLOSED' && (t.orderId || null) === supportTicketOrderId);
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
          const data = await callApi('create_support_ticket', { message: body, orderId: supportTicketOrderId });
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
      openPage('SUPPORT', 'nav-support-btn');
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
      const count = Object.values(cart).reduce((a, b) => a + (b.qty || 0), 0);
      const badge = document.getElementById('cart-badge');
      if (count > 0) {
        badge.innerText = count;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
      } else {
        badge.classList.add('hidden');
      }
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
      if (pickerButton) pickerButton.textContent = `🖼 ${tr('Rasm tanlash', 'Выбрать фото')}`;

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
        // 6-band: logotip tahrirlash endi shu asosiy header logotipining
        // o'zida — "Do'kon haqida"dagi alohida logotip bo'limi olib
        // tashlandi (openShopLogoManager() pastda).
        const canEditLogo = isUserAnAdmin && isAdminMode;
        logoImg.onclick = canEditLogo ? openShopLogoManager : null;
        logoImg.classList.toggle('cursor-pointer', canEditLogo);
      }
      // 6-band: logotip hali umuman qo'yilmagan bo'lsa, yuqoridagi
      // #shop-logo-img yashirin qoladi — o'sha holatda bosadigan joy
      // qolmasligi uchun ADMIN belgisi yonidagi bu tugma DOIM ko'rinadi
      // (admin+admin rejimida), logotip bor-yo'qligidan qat'iy nazar.
      const logoEditBtn = document.getElementById('header-logo-edit-btn');
      if (logoEditBtn) {
        logoEditBtn.classList.toggle('hidden', !(isUserAnAdmin && isAdminMode));
        logoEditBtn.onclick = openShopLogoManager;
      }
      const flagBtn = document.getElementById('lang-flag-btn');
      if (flagBtn) flagBtn.innerText = uiLang === 'uz' ? '🇷🇺' : '🇺🇿';
      const cartBtn = document.getElementById('header-cart-btn');
      if (cartBtn) cartBtn.classList.toggle('hidden', isAdminMode && isUserAnAdmin);
      const personBtn = document.getElementById('header-person-btn');
      if (personBtn) personBtn.onclick = isUserAnAdmin ? togglePersonMenu : (() => switchTab('profile'));
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
      if (!popover || popover.classList.contains('hidden')) return;
      if (popover.contains(event.target) || (personBtn && personBtn.contains(event.target))) return;
      popover.classList.add('hidden');
    });

    function render() {
      updateCartBadge();
      updateNavLabels();
      updateHeaderChrome();

      if (authReady && !registeredUser && !isAdminMode && activePopupModal !== 'REGISTRATION') {
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
      const root = document.createElement('div');
      root.id = 'fc-picker-sheet-root';
      root.innerHTML = `
        <div class="fc-sheet-overlay" onclick="if(event.target===this) closeImagePickerSheet();">
          <div class="fc-sheet">
            <div class="fc-sheet-handle"></div>
            <div class="fc-sheet-header">
              <div class="fc-sheet-title">${tr('Rasm tanlash', 'Выбор фото')}</div>
              <button type="button" onclick="closeImagePickerSheet()" aria-label="${tr('Yopish', 'Закрыть')}" class="fc-btn fc-btn-icon" style="min-width:2.25rem;min-height:2.25rem"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="fc-sheet-body space-y-2">
              <button type="button" onclick="closeImagePickerSheet(); document.getElementById('${galleryInputId}').click();" class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left active:bg-gray-100">
                <span class="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-blue-600 shrink-0"><i data-lucide="image" class="w-5 h-5"></i></span>
                <span class="min-w-0"><span class="block font-bold text-sm">${tr('Galereyadan tanlash', 'Выбрать из галереи')}</span><span class="block text-xs text-gray-400">${tr('Telefon rasmlaridan tanlash', 'Выбрать из фото телефона')}</span></span>
              </button>
              ${filesInputId ? `
              <button type="button" onclick="closeImagePickerSheet(); document.getElementById('${filesInputId}').click();" class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left active:bg-gray-100">
                <span class="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-blue-600 shrink-0"><i data-lucide="folder" class="w-5 h-5"></i></span>
                <span class="min-w-0"><span class="block font-bold text-sm">${tr('Fayllardan tanlash', 'Выбрать из файлов')}</span><span class="block text-xs text-gray-400">${tr('Qurilmadagi fayllardan tanlash', 'Выбрать файл на устройстве')}</span></span>
              </button>` : ''}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      lucide.createIcons();
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
        case 'SETTINGS': renderSettingsPage(container); break;
        case 'DASHBOARD': renderDashboardPage(container); break;
        case 'FAVORITES': renderFavoritesPage(container); break;
        case 'RECENT': renderRecentPage(container); break;
        case 'BILLZ': renderBillzPage(container); break;
        case 'ORDER_INFO': renderOrderInfoPage(container); break;
        case 'DESIGN_SETTINGS': renderDesignSettingsPage(container); break;
        case 'DELIVERY_SETTINGS': renderDeliverySettingsPage(container); break;
        case 'PAYMENT_SETTINGS': renderPaymentSettingsPage(container); break;
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

    // ---- Do'kon sozlamalari sahifasi (POLISH ROUND 1-bosqich, 5/6-band) ----
    // Ichidagi 3 bo'lim (Buyurtma ma'lumotlari/Yetkazib berish/Dizayn) hozirgidek
    // modal bo'lib ochiladi (murakkab mavjud mantiqqa tegilmadi) — yopilganda
    // ostidagi shu sahifa qayta ko'rinadi. Bot /start endi shu yerda, alohida
    // qatordan boshqa joyga ko'chirilmagan.
    function renderSettingsPage(container) {
      const body = `
        <div class="space-y-2">
          <button type="button" onclick="openOrderInfoSettings()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="receipt" class="w-4 h-4"></i>${tr("Buyurtma ma'lumotlari", "Информация о заказе")}</span><span>›</span></button>
          <button type="button" onclick="openDeliverySettingsPage()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="truck" class="w-4 h-4"></i>${tr("Yetkazib berish parametrlari", "Параметры доставки")}</span><span>›</span></button>
          <button type="button" onclick="openPaymentSettingsPage()" class="fc-card w-full flex items-center justify-between text-left"><span class="font-bold flex items-center gap-2"><i data-lucide="credit-card" class="w-4 h-4"></i>${tr("To'lov parametrlari", "Параметры оплаты")}</span><span>›</span></button>
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
      const activeColors = designColorsWithDefaults(draft.colors);
      const issues = findContrastIssues(draft.colors);
      const body = `
        <div class="space-y-3 text-xs">
          <div>
            <p class="font-bold text-gray-600 mb-1.5">${tr("Tayyor mavzular", "Готовые темы")}</p>
            <div class="grid grid-cols-3 gap-2">
              ${Object.entries(DESIGN_THEMES).map(([id, theme]) => `
                <button type="button" onclick="pickDesignTheme('${id}')" class="rounded-xl border-2 p-2 text-center ${draft.themeId === id ? 'border-blue-600' : 'border-transparent'}" style="background:${theme.colors.pageBg}">
                  <div class="flex justify-center gap-1 mb-1">
                    <span class="w-3.5 h-3.5 rounded-full inline-block" style="background:${theme.colors.button}"></span>
                    <span class="w-3.5 h-3.5 rounded-full inline-block border" style="background:${theme.colors.cardBg}"></span>
                  </div>
                  <span class="font-bold text-[10px]" style="color:${theme.colors.text}">${theme.label}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="space-y-2 pt-2 border-t">
            <p class="font-bold text-gray-600 pt-2">${tr("Qo'lda rang tanlash", "Ручной выбор цвета")}</p>
            ${DESIGN_COLOR_KEYS.map(key => `
              <div class="flex items-center justify-between gap-2">
                <label class="font-bold text-gray-600">${DESIGN_COLOR_LABELS[key]}</label>
                <div class="flex items-center gap-2">
                  <input type="color" value="${activeColors[key]}" onchange="setDesignColor('${key}', this.value)" class="w-9 h-9 border rounded-lg cursor-pointer">
                  <span class="font-mono text-[10px] text-gray-400 w-14">${activeColors[key]}</span>
                </div>
              </div>
            `).join('')}
          </div>

          ${issues.length ? `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-900 space-y-1">
              <p class="font-bold">⚠️ ${tr("O'qilishi qiyin bo'lishi mumkin:", 'Может быть трудно читать:')}</p>
              ${issues.map(i => `<p>${i.pair}: ${i.ratio.toFixed(1)}:1 (${tr('kerak','нужно')} ${WCAG_AA_RATIO}:1)</p>`).join('')}
            </div>
          ` : ''}

          <div class="flex gap-2 pt-2 sticky bottom-0 bg-white">
            <button onclick="saveDesignSettings()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">✅ ${tr("Saqlash", "Сохранить")}</button>
            <button onclick="closeDesignSettings()" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
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
          <div class="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
            <button onclick="saveFulfillmentSettings()" class="bg-blue-600 text-white font-black py-3 rounded-xl">✅ ${tr('Saqlash','Сохранить')}</button>
            <button onclick="closeFulfillmentSettingsPage()" class="bg-gray-100 text-gray-700 font-bold py-3 rounded-xl">${tr('Bekor qilish','Отмена')}</button>
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
    function renderHome(container) {
      const homeFilterActive = isCategoryFilterActive();
      container.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <input type="text" id="search-input" value="${escapeHtml(homeSearchQuery)}" oninput="handleSearchDebounced()" placeholder="${escapeHtml(searchPlaceholderText())}"
                class="w-full bg-white pl-10 pr-4 py-3 rounded-2xl border border-gray-200 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <i data-lucide="search" class="w-5 h-5 text-gray-400 absolute left-3 top-3.5"></i>
            </div>
            <button onclick="openCategoryFilterModal()" title="${tr('Filtr','Фильтр')}" class="shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl border shadow-sm ${homeFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}">
              🔍${homeFilterActive ? '•' : ''}
            </button>
          </div>
          ${renderActiveFilterChipsHtml()}

          ${(isAdminMode && isUserAnAdmin) ? `
            <div class="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-xs font-bold text-amber-900 shadow-sm flex items-center justify-between">
              <span>${tr("🛡️ Admin rejimi: Bosh sahifa", "🛡️ Режим администратора: Главная")}</span>
            </div>
          ` : ''}

          <div id="products-grid" class="grid grid-cols-2 gap-3"></div>
        </div>
      `;
      handleSearch();
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
    function setFavoritesPage(p) { favoritesPage = p; render(); }
    function renderFavoritesPage(container) {
      const list = products.filter(p => p.status !== 'DELETED' && favoriteProductIds.has(p.id));
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
      const list = recentViewProductIds.map(id => byId.get(id)).filter(p => p && p.status !== 'DELETED');
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

    function renderProductCardHTML(p, idx, totalLen) {
      const inCart = cart[p.id];
      const vars = productVariants(p);
      const variantSizes = [...new Set(vars.map(v => v.size).filter(Boolean))];
      const variantColors = [...new Set(vars.map(v => v.color).filter(Boolean))];
      const hasDiscount = p.oldPrice && p.oldPrice > p.price;
      const bulkSelecting = isAdminMode && isUserAnAdmin && bulkProductSelectMode;
      const cardClick = bulkSelecting ? `toggleBulkProductSelection('${p.id}', event)` : `openProductDetailModal('${p.id}')`;

      return `
        <div data-product-card-id="${escapeHtml(p.id)}" onclick="${cardClick}" class="bg-white rounded-2xl p-3 shadow-sm border ${bulkSelecting && bulkSelectedProductIds.has(String(p.id)) ? 'ustore-selected-card border-blue-500' : 'border-gray-100'} flex flex-col justify-between relative cursor-pointer hover:shadow-md transition-all">
          ${bulkSelecting ? `<div class="absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center font-black ${bulkSelectedProductIds.has(String(p.id)) ? 'bg-blue-600 text-white' : 'bg-white/95 text-gray-400 border'}">${bulkSelectedProductIds.has(String(p.id)) ? '✓' : '○'}</div>` : ''}
          <div>
            <div class="relative">
              <div class="w-full h-32 rounded-xl mb-2 bg-gray-50 overflow-hidden flex items-center justify-center p-1.5">
                <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-full h-full object-contain" loading="lazy">
              </div>
              ${!(isAdminMode && isUserAnAdmin) ? `<div class="absolute top-1 left-1">${favoriteHeartHtml(p.id)}</div>` : ''}
            </div>
            ${(isAdminMode && isUserAnAdmin) ? `<span class="text-[10px] bg-gray-100 font-mono text-gray-500 px-1.5 py-0.5 rounded">${escapeHtml(p.sku)}</span>` : ''}
            <h4 class="font-bold text-sm text-gray-800 mt-1 leading-tight line-clamp-2">${escapeHtml(productName(p))}</h4>

            <div class="mt-1">
              ${hasDiscount ? `
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs fc-text-danger font-black">${money(p.price)}</span>
                  <span class="text-[10px] bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded-md">-${discountPercent(p)}%</span>
                </div>
                <p class="text-[10px] text-gray-400 line-through font-bold mt-0.5">${money(p.oldPrice)}</p>
              ` : `
                <p class="text-xs text-blue-600 font-black">${money(p.price)}</p>
              `}
            </div>
            ${variantSizes.length ? `<p class="text-[9px] text-gray-400 mt-0.5">${tr("O'lcham", "Размер")}: ${variantSizes.map(escapeHtml).join(', ')}</p>` : ''}
            ${variantColors.length ? `<p class="text-[9px] text-gray-400 mt-0.5">${tr("Rang", "Цвет")}: ${variantColors.map(escapeHtml).join(', ')}</p>` : ''}
            ${productDesc(p) ? `<p class="text-[10px] text-gray-400 italic mt-0.5 line-clamp-1">${escapeHtml(truncateText(productDesc(p), 40))}</p>` : ''}
          </div>

          <!-- ADMIN CONTROLS -->
          ${(isAdminMode && isUserAnAdmin && !bulkSelecting) ? `
            <div class="mt-2 pt-2 border-t flex flex-col space-y-1" onclick="event.stopPropagation()">
              <div class="flex justify-between items-center text-[10px]">
                <button onclick="moveProductSort('${p.id}', -1)" ${idx === 0 ? 'disabled' : ''} aria-label="${tr('Yuqoriga', 'Вверх')}" class="px-1.5 py-0.5 bg-gray-100 rounded font-bold">${ICON_UP}</button>
                <button onclick="moveProductSort('${p.id}', 1)" ${idx === totalLen - 1 ? 'disabled' : ''} aria-label="${tr('Pastga', 'Вниз')}" class="px-1.5 py-0.5 bg-gray-100 rounded font-bold">${ICON_DOWN}</button>
                <button onclick="toggleProductFeatured('${p.id}')" aria-label="${tr('Pin', 'Закрепить')}" class="px-1.5 py-0.5 ${p.isFeatured ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'} rounded font-bold">${ICON_PIN}</button>
                <button onclick="openProductDetailModal('${p.id}')" class="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-bold">${ICON_EDIT}</button>
                <button onclick="deleteProduct('${p.id}')" aria-label="${tr("O'chirish", 'Удалить')}" class="px-1.5 py-0.5 fc-bg-danger-soft fc-text-danger rounded font-bold">${ICON_TRASH}</button>
              </div>
            </div>
          ` : `
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
      const catProdsRaw = products.filter(p => p.categoryId === adminCatParentId && p.status !== 'DELETED');
      const catProds = applyCategoryFilter(catProdsRaw);
      const globalMissingImageCount = getMissingImageProducts().length;
      const filterActive = isCategoryFilterActive();

      const totalPages = Math.ceil(catProds.length / 10) || 1;
      if (categoryPage > totalPages) categoryPage = 1;
      const paginatedProds = catProds.slice((categoryPage - 1) * 10, categoryPage * 10);
      currentVisibleProductIds = paginatedProds.map(p => p.id);

      const catAncestors = categoryAncestorChain(adminCatParentId);
      const breadcrumbHtml = [
        `<span onclick="adminCatParentId = null; categoryPage=1; render();" class="cursor-pointer hover:underline ${catAncestors.length ? 'text-gray-500' : 'text-blue-600'}">${escapeHtml(uiLang === 'ru' ? 'Главные каталоги' : 'Bosh Kataloglar')}</span>`,
        ...catAncestors.map((a, i) => `<span class="text-gray-300">/</span><span onclick="adminCatParentId = '${a.id}'; categoryPage=1; render();" class="cursor-pointer hover:underline ${i === catAncestors.length - 1 ? 'text-blue-600' : 'text-gray-500'}">${escapeHtml(a.name)}</span>`)
      ].join(' ');

      container.innerHTML = `
        <div class="space-y-4">
          <div class="bg-white p-3 rounded-2xl border space-y-2 shadow-sm">
            <div class="flex items-center justify-between text-xs gap-2">
              <span class="font-bold flex flex-wrap items-center gap-x-1 gap-y-0.5"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-gray-400 shrink-0"></i> ${breadcrumbHtml}</span>
              ${adminCatParentId ? `
                <div class="flex space-x-1 shrink-0">
                  <button onclick="goBackCatLevel()" class="fc-cat-nav-btn"><i data-lucide="chevron-left" class="w-3 h-3"></i>${tr("Orqaga", "Назад")}</button>
                  <button onclick="adminCatParentId = null; categoryPage=1; render();" class="fc-cat-nav-btn"><i data-lucide="home" class="w-3 h-3"></i>${tr("Boshiga", "В начало")}</button>
                </div>
              ` : ''}
            </div>

            ${(isAdminMode && isUserAnAdmin) ? `
              <!-- 23-band: Katalog/Tovar/Excel bitta ixcham qatorda, zamonaviy
                   (Lucide) iconlar bilan — eski emoji emas. -->
              <div class="flex space-x-2 pt-1 border-t">
                <button onclick="openAddCatModal()" class="flex-1 flex items-center justify-center gap-1 bg-blue-600 text-white font-bold py-1.5 rounded-xl text-xs"><i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>${tr("Katalog", "Каталог")}</button>
                <button onclick="openAddProductModal()" class="flex-1 flex items-center justify-center gap-1 bg-emerald-600 text-white font-bold py-1.5 rounded-xl text-xs"><i data-lucide="package-plus" class="w-3.5 h-3.5"></i>${tr("Tovar", "Товар")}</button>
                <button onclick="openExcelImportModal()" class="flex-1 flex items-center justify-center gap-1 bg-slate-800 text-white font-bold py-1.5 rounded-xl text-xs"><i data-lucide="table" class="w-3.5 h-3.5"></i>Excel</button>
              </div>
              <div class="flex flex-wrap gap-1.5 pt-1">
                <button onclick="toggleBulkProductSelectMode()" title="${bulkProductSelectMode ? tr('Tanlashni tugatish','Завершить выбор') : tr('Tovarlarni tanlash','Выбрать товары')}" aria-label="${tr('Tovarlarni tanlash','Выбрать товары')}" class="flex items-center justify-center gap-1 min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold ${bulkProductSelectMode ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700'}">${ICON_CHECK_SQUARE}</button>
                <button onclick="openMissingImageQueue()" title="${tr('Rasmsiz tovarlar','Товары без фото')} · ${globalMissingImageCount}" aria-label="${tr('Rasmsiz tovarlar','Товары без фото')}" class="flex items-center justify-center gap-1 min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">${ICON_IMAGE}${globalMissingImageCount > 0 ? `<span>${globalMissingImageCount}</span>` : ''}</button>
                <button onclick="openTrashModal()" title="${tr('Chiqindi (24 soat)','Корзина (24 часа)')}" aria-label="${tr('Chiqindi', 'Корзина')}" class="flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-white border fc-text-danger">${ICON_TRASH}</button>
                <button onclick="openDuplicateProductsModal()" title="${tr('Duplicate tovarlarni tekshirish','Проверить дубликаты товаров')}" aria-label="${tr('Duplicate tovarlarni tekshirish','Проверить дубликаты товаров')}" class="flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-white border text-gray-600">${ICON_COPY_CHECK}</button>
                ${billzAccessGranted ? `<button onclick="openBillzBrowse('${adminCatParentId || ''}')" title="${tr("Billz'dan tovar tortib olish", 'Импорт товаров из Billz')}" aria-label="${tr("Billz'dan tovar tortib olish", 'Импорт товаров из Billz')}" class="flex items-center justify-center gap-1 min-h-[2.5rem] px-2.5 rounded-xl text-[11px] font-bold bg-white border text-gray-600">${ICON_DOWNLOAD}Billz</button>` : ''}
              </div>
            ` : ''}
          </div>

          <!-- SUBCATEGORIES LIST -->
          <div class="space-y-2">
            ${subCats.map((sub, subIdx) => `
              <div data-category-row-id="${sub.id}" onclick="adminCatParentId = '${sub.id}'; categoryPage=1; render();" class="ustore-cat-row p-3.5 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm cursor-pointer">
                <div class="flex items-center space-x-3">
                  ${sub.img && (sub.img.startsWith('http') || sub.img.startsWith('data:')) ?
                    `<img src="${escapeHtml(sub.img)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-8 h-8 object-cover rounded-lg" loading="lazy">` :
                    `<span class="text-xl">${escapeHtml(sub.img) || '📁'}</span>`
                  }
                  <div>
                    <h5 class="font-bold text-sm text-gray-800">${escapeHtml(categoryName(sub))}</h5>
                    <p class="text-[10px] text-gray-400">${categories.filter(c => c.parentId === sub.id).length} ${tr('katalog','кат.')} | ${recursiveProductCounts.get(String(sub.id)) || 0} ${tr('tovar','тов.')}</p>
                  </div>
                </div>
                <div class="flex items-center space-x-1">
                  ${(isAdminMode && isUserAnAdmin) ? `
                    <button onclick="moveCategoryOrder('${sub.id}', -1, event)" ${subIdx === 0 ? 'disabled' : ''} aria-label="${tr('Yuqoriga', 'Вверх')}" class="px-1.5 py-0.5 bg-gray-100 rounded font-bold">${ICON_UP}</button>
                    <button onclick="moveCategoryOrder('${sub.id}', 1, event)" ${subIdx === subCats.length - 1 ? 'disabled' : ''} aria-label="${tr('Pastga', 'Вниз')}" class="px-1.5 py-0.5 bg-gray-100 rounded font-bold">${ICON_DOWN}</button>
                    <button onclick="openMoveCategoryModal('${sub.id}', event)" title="${tr("Boshqa katalogga ko'chirish", "Переместить в другой каталог")}" class="p-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">📁⇢</button>
                    <button onclick="openEditCategoryModal('${sub.id}', event)" class="p-1 bg-blue-100 text-blue-600 rounded text-xs font-bold">${ICON_EDIT}</button>
                    <button onclick="deleteCategory('${sub.id}', event)" aria-label="${tr("O'chirish", 'Удалить')}" class="p-1 fc-bg-danger-soft fc-text-danger rounded text-xs font-bold">${ICON_TRASH}</button>
                  ` : ''}
                  <i data-lucide="chevron-right" class="w-5 h-5 text-gray-400"></i>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- PRODUCTS LIST -->
          <div class="space-y-2 pt-2">
            <div class="flex items-center justify-between px-1">
              <h4 class="font-bold text-xs text-gray-500 uppercase">${tr("📦 Tovarlar", "📦 Товары")} (${catProds.length})</h4>
              <div class="flex gap-1">
                ${catProdsRaw.length > 0 ? `
                  ${bulkProductSelectMode ? `<button onclick="selectAllVisibleProducts()" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">${tr('Barchasini tanlash','Выбрать все')}</button>` : ''}
                  <button onclick="openCategoryFilterModal()" class="text-[11px] font-bold px-2.5 py-1 rounded-lg ${filterActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">
                    🔍 ${tr('Filtr','Фильтр')}${filterActive ? ' •' : ''}
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
              <div class="grid grid-cols-2 gap-3">
                ${paginatedProds.map((p, idx) => renderProductCardHTML(p, idx, paginatedProds.length)).join('')}
              </div>
            `}

            ${bulkProductSelectMode ? `<div class="sticky bottom-20 z-30 bg-slate-900 text-white rounded-2xl p-2.5 shadow-xl flex flex-wrap items-center gap-2"><b class="text-xs flex-1 min-w-[90px]">${bulkSelectedProductIds.size} ${tr('ta tanlandi','выбрано')}</b><button onclick="openBulkMoveProductsModal()" ${bulkSelectedProductIds.size ? '' : 'disabled'} class="px-3 py-2 rounded-xl bg-blue-600 disabled:opacity-40 text-[11px] font-bold flex items-center gap-1">${fcIcon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>')} ${tr('Ko‘chirish','Переместить')}</button><button onclick="bulkTrashSelectedProducts()" ${bulkSelectedProductIds.size ? '' : 'disabled'} class="px-3 py-2 rounded-xl fc-bg-danger disabled:opacity-40 text-[11px] font-bold flex items-center gap-1">${ICON_TRASH} ${tr('Chiqindiga','В корзину')}</button><button onclick="clearBulkProductSelection()" class="px-3 py-2 rounded-xl bg-white/10 text-[11px] font-bold">✕</button></div>` : ''}

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
        </div>
      `;
    }

    function isCategoryFilterActive() {
      return !!(categoryFilter.search || categoryFilter.minPrice || categoryFilter.maxPrice || categoryFilter.sortPrice || categoryFilter.sortNew || categoryFilter.sortSold || categoryFilter.inStockOnly);
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
      categoryFilter = { search: '', minPrice: '', maxPrice: '', sortPrice: null, sortNew: null, sortSold: null, inStockOnly: false };
      categoryPage = 1;
      render();
    }
    function toggleInStockOnlyFilter() {
      categoryFilter.inStockOnly = !categoryFilter.inStockOnly;
      categoryPage = 1;
      render();
    }
    // 22-band: bitta faol filtrni olib tashlaydi (chip'dagi ✕ orqali).
    function removeCategoryFilterKey(key) {
      if (key === 'search') categoryFilter.search = '';
      else if (key === 'price') { categoryFilter.minPrice = ''; categoryFilter.maxPrice = ''; }
      else if (key === 'inStockOnly') categoryFilter.inStockOnly = false;
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
        return p ? { ...p, key, qty: itemData.qty, size: itemData.size || null, color: itemData.color || null } : null;
      }).filter(Boolean);

      let total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);

      if (items.length === 0) {
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
          <div class="bg-white rounded-2xl p-4 shadow-sm divide-y">
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
                  <button onclick="removeCartItem('${item.key}')" class="w-7 h-7 flex items-center justify-center rounded-lg fc-text-danger fc-bg-danger-soft" aria-label="${tr("O'chirish", 'Удалить')}" title="${tr("O'chirish", 'Удалить')}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                  <div class="flex items-center gap-2">
                    <button onclick="changeCartQty('${item.key}', -1)" class="w-9 h-9 bg-gray-100 rounded-lg font-bold text-sm">-</button>
                    <span class="font-bold text-sm w-5 text-center">${item.qty}</span>
                    <button onclick="changeCartQty('${item.key}', 1)" ${item.qty >= available ? 'disabled' : ''} class="w-9 h-9 bg-blue-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm">+</button>
                  </div>
                </div>
              </div>
            `; }).join('')}
          </div>
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
      return Object.entries(cart).reduce((sum, [key, itemData]) => {
        const productId = cartEntryProductId(key, itemData);
        const product = products.find(item => item.id === productId);
        return sum + (product ? product.price * (Number(itemData.qty) || 0) : 0);
      }, 0);
    }

    function deliveryOptionLabel(option) {
      if (option.kind === 'FREE') return tr('🆓 Bepul yetkazib berish', '🆓 Бесплатная доставка');
      if (option.kind === 'FIXED') return `${tr('🚚 Uyigacha', '🚚 До дома')} · ${money(option.fee)}`;
      if (option.kind === 'TAXI') {
        if (option.exactFee !== null && option.exactFee !== undefined) return `${tr('🚕 Taksi orqali', '🚕 На такси')} · ${formatNumber(option.exactFee)} ${tr("so'm", 'сум')}`;
        if (option.minFee !== null && option.minFee !== undefined && option.maxFee !== null && option.maxFee !== undefined) return `${tr('🚕 Taksi orqali', '🚕 На такси')} · ${formatNumber(option.minFee)}–${formatNumber(option.maxFee)} ${tr("so'm", 'сум')}`;
        return tr('🚕 Taksi orqali', '🚕 На такси');
      }
      return `📦 ${escapeHtml(option.providerName || tr('Pochta', 'Почта'))}`;
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
          <button type="button" onclick="openImagePickerSheet('chk-receipt','chk-receipt-files')" class="fc-btn fc-btn-primary"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Chekni tanlash', 'Выбрать чек')}</button>
          ${galleryInput}${filesInput}
        </div>`;
    }

    function rerenderReceiptPicker() {
      const wrap = document.getElementById('chk-receipt-wrap');
      if (!wrap) return;
      const regionKey = document.getElementById('chk-region-key')?.value || checkoutDraft.regionKey || 'tashkent_city';
      const selectedPayment = commerce.paymentOptions(fulfillmentConfig, regionKey).find(m => m.id === selectedPayMethod);
      wrap.innerHTML = renderReceiptPicker(!!selectedPayment?.receiptRequired || selectedPayment?.id === 'QR');
    }

    function openCheckoutForm() {
      if (Object.keys(cart).length === 0) return;
      clearCheckoutReceipt();
      selectedDeliveryMethodId = checkoutDraft.deliveryMethodId || selectedDeliveryMethodId;
      selectedPayMethod = checkoutDraft.paymentMethodId || selectedPayMethod;
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
      el.innerHTML = `<b>✅ ${escapeHtml(branchNameLabel(checkoutSelectedBranch))}</b><br>${escapeHtml(branchDistrictLabel(checkoutSelectedBranch))} — ${escapeHtml(branchAddressLabel(checkoutSelectedBranch))}`;
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
      const deliveryOptions = commerce.deliveryOptions(fulfillmentConfig, regionKey);
      const paymentOptions = commerce.paymentOptions(fulfillmentConfig, regionKey);
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

      const districtValue = document.getElementById('chk-district')?.value || '';
      const deliveryWrap = document.getElementById('delivery-method-wrap');
      if (deliveryWrap) deliveryWrap.innerHTML = deliveryOptions.length ? deliveryOptions.map(option => {
        // 5.6: provider tugmalari tuman tanlanmaguncha bosilmaydigan
        // ko'rinishda ko'rsatiladi — lekin onclick faol qoladi, shunda
        // bosilsa selectDelivery o'zi aniq ogohlantirish ko'rsatadi.
        const disabledLook = option.kind === 'POST' && !districtValue;
        return `
        <button type="button" onclick="selectDelivery('${escapeHtml(option.id)}')" class="p-2.5 border rounded-xl font-bold text-xs leading-snug ${option.id === selectedDeliveryMethodId ? 'border-blue-600 bg-blue-50 text-blue-700' : 'bg-white text-gray-700'} ${disabledLook ? 'opacity-40' : ''}">
          ${deliveryOptionLabel(option)}
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
        const estimatedTimeVal = selectedDelivery?.estimatedTime ? escapeHtml(selectedDelivery.estimatedTime) : '';
        const estimatedTime = estimatedTimeVal
          ? `${(noticeText || comment) ? '<br>' : ''}⏱ ${tr(`${estimatedTimeVal} ichida yetkazib beriladi.`, `Доставка в течение ${estimatedTimeVal}.`)}` : '';
        notice.innerHTML = noticeText + comment + estimatedTime;
        notice.classList.toggle('hidden', !selectedDelivery);
      }
      // 2-band: POST (BTS/EMU) uchun faqat manzil maydoni yashiriladi (uning
      // o'rniga filial tanlash ro'yxati ko'rsatiladi) — tuman maydoni endi
      // BARCHA yetkazib berish usullari uchun umumiy va doim ko'rinadi.
      const isPost = selectedDelivery?.kind === 'POST';
      const addressField = document.getElementById('chk-address-field');
      if (addressField) addressField.classList.toggle('hidden', isPost);
      const branchWrap = document.getElementById('chk-branch-wrap');
      if (branchWrap) branchWrap.classList.toggle('hidden', !isPost);
      if (isPost) renderBranchPicker();

      const payWrap = document.getElementById('pay-method-wrap');
      if (payWrap) payWrap.innerHTML = paymentOptions.length ? paymentOptions.map(method => `
        <button type="button" onclick="selectPayment('${method.id}')" class="p-2.5 border rounded-xl font-bold text-xs ${method.id === selectedPayMethod ? 'border-blue-600 bg-blue-50 text-blue-700' : 'bg-white text-gray-700'}">
          ${method.id === 'CASH' ? '💵' : method.id === 'CARD' ? '💳' : method.id === 'CLICK' ? '⚡' : '🔳'} ${escapeHtml(method.id === 'CASH' ? tr('Naqd','Наличные') : method.id === 'CARD' ? tr('Karta orqali','Картой') : method.id === 'QR' ? tr('QR orqali', 'По QR') : method.name)}
        </button>`).join('') : `<div class="col-span-2 fc-bg-danger-soft border fc-border-danger fc-text-danger p-3 rounded-xl font-bold">${tr("Bu hudud uchun to'lov usuli yoqilmagan.", 'Для этого региона способы оплаты не настроены.')}</div>`;

      const cardDetails = document.getElementById('card-payment-details');
      if (cardDetails) {
        if (selectedPayment?.id === 'CARD') {
          cardDetails.classList.remove('hidden');
          cardDetails.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-1">
              <p class="font-bold text-blue-900">${tr("Pul o'tkaziladigan karta", 'Карта для перевода')}</p>
              <div class="flex items-center gap-2">
                <p id="chk-card-number-display" class="font-mono text-sm font-black">${escapeHtml(selectedPayment.cardNumber || '')}</p>
                <button type="button" onclick="copyCardNumber(document.getElementById('chk-card-number-display').textContent)" class="text-[10px] font-bold text-blue-700 bg-white border border-blue-300 px-2 py-0.5 rounded-lg shrink-0">📋 ${tr('Nusxalash', 'Копировать')}</button>
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
              <div class="grid grid-cols-2 gap-2">
                ${enabledProviders.map(p => `<button type="button" onclick="selectQrProvider('${p.id}')" class="p-2.5 border rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 ${p.id === selectedQrProviderId ? 'border-blue-600 bg-blue-50 text-blue-700' : 'bg-white text-gray-700'}">🔳 ${escapeHtml(p.name)}</button>`).join('')}
              </div>
              ${!enabledProviders.length ? `<p class="text-[11px] fc-text-danger font-bold">${tr("Hozircha QR provayder sozlanmagan.", "QR-провайдер пока не настроен.")}</p>` : ''}
              ${activeProvider ? `
                <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-2 text-center">
                  ${activeProvider.qrImageUrl ? `<img src="${escapeHtml(activeProvider.qrImageUrl)}" class="w-40 h-40 object-contain rounded-xl border bg-white mx-auto">` : ''}
                  <p class="font-bold text-blue-900">${escapeHtml(activeProvider.name)}</p>
                  <button type="button" onclick="openSafeExternalUrl('${escapeHtml(activeProvider.paymentUrl)}')" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">🔗 ${tr("To'lov sahifasiga o'tish", "Перейти к оплате")}</button>
                </div>
                <div id="chk-receipt-wrap">${renderReceiptPicker(true)}</div>
              ` : ''}
            </div>`;
        } else if (selectedPayment?.id === 'CLICK') {
          cardDetails.classList.remove('hidden');
          cardDetails.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-1 text-center">
              <p class="font-bold text-blue-900">⚡ ${tr("Click orqali avtomatik to'lov", "Автоматическая оплата через Click")}</p>
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
      if (subtotalEl) subtotalEl.textContent = money(totals.subtotal);
      if (deliveryFeeEl) deliveryFeeEl.textContent = selectedDelivery?.kind === 'FIXED' ? money(totals.deliveryFee) : (selectedDelivery?.kind === 'TAXI' ? tr('Alohida', 'Отдельно') : (selectedDelivery?.kind === 'POST' && selectedDelivery.payer === 'CUSTOMER' ? tr('Pochta tarifida', 'По тарифу почты') : money(0)));
      if (payableEl) payableEl.textContent = money(totals.payableTotal);
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
      if (myStatus.isBlocked) {
        return alert(`${tr("🚫 Siz botdan foydalanish huquqidan mahrum qilingansiz", "🚫 Доступ к оформлению заказов заблокирован")}.\n${tr('Sabab','Причина')}: ${myStatus.blockReason || tr("ko'rsatilmagan",'не указана')}\n\n${tr("Batafsil ma'lumot uchun Profil bo'limiga qarang.",'Подробности смотрите в разделе «Профиль».')}`);
      }

      const fullname = document.getElementById('chk-fullname').value.trim();
      const phone = document.getElementById('chk-phone').value.trim();
      const regionKey = document.getElementById('chk-region-key').value;
      const deliveryOptions = commerce.deliveryOptions(fulfillmentConfig, regionKey);
      const paymentOptions = commerce.paymentOptions(fulfillmentConfig, regionKey);
      const selectedDelivery = deliveryOptions.find(option => option.id === selectedDeliveryMethodId);
      const selectedPayment = paymentOptions.find(method => method.id === selectedPayMethod);
      const isPostDelivery = selectedDelivery?.kind === 'POST';

      // 1.13/1.14: BTS/EMU uchun mijoz qo'lda tuman/manzil yozmaydi — ro'yxatdan
      // tanlangan filial manzili ishlatiladi.
      const tuman = isPostDelivery ? (checkoutSelectedBranch?.district_or_city || '') : document.getElementById('chk-district').value.trim();
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
        if (!p) return alert(tr('❌ Savatchadagi mahsulot topilmadi. Savatchani yangilang.', '❌ Товар из корзины не найден. Обновите корзину.'));
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
          items: itemsPayload, fullname, phone, regionKey, district, address,
          deliveryMethodId: selectedDeliveryMethodId,
          paymentMethodId: selectedPayment.id === 'QR' ? `QR:${selectedQrProvider.id}` : selectedPayMethod,
          receiptImageUpload, branchId: isPostDelivery ? checkoutSelectedBranch?.id : undefined,
        });
        const newOrder = formatOrderForUi(result.order);
        orders.unshift(newOrder);
        ordersLoaded = true;
        cart = {};
        localStorage.setItem(scopedKey('cart'), JSON.stringify(cart));
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
    function renderOrders(container) {
      if (ordersLoading || !ordersLoaded) {
        container.innerHTML = `<div class="py-16 text-center text-sm text-gray-500"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>${tr("Buyurtmalar yuklanmoqda...", "Заказы загружаются...")}</div>`;
        return;
      }
      if (isAdminMode && isUserAnAdmin) {
        // ADMIN ORDERS VIEW
        let filteredOrders = orders.filter(o => {
          const matchStatus = adminOrderFilters.status === 'ALL' || o.status === adminOrderFilters.status;
          const matchRegion = adminOrderFilters.region === 'ALL' || o.region === adminOrderFilters.region;
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
              <input type="text" id="adm-ord-search" oninput="adminOrderFilters.search = this.value; render();" placeholder="${tr('Mijoz ismi yoki tel raqami...','Имя клиента или номер телефона...')}" value="${escapeHtml(adminOrderFilters.search)}" class="w-full p-2 border rounded-xl">

              <div class="flex gap-1 flex-wrap">
                <button onclick="setAdminStatusFilter('ALL')" class="px-2.5 py-1 rounded-lg font-bold text-[10px] ${adminOrderFilters.status === 'ALL' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600'}">${tr("Barchasi", "Все")}</button>
                ${['NEW', 'PROCESSING', 'DELIVERED', 'CANCELLED'].map(st => `
                  <button onclick="setAdminStatusFilter('${st}')" class="px-2.5 py-1 rounded-lg font-bold text-[10px] ${adminOrderFilters.status === st ? statusColorClass(st) + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500'}">
                    ${statusLabel(st)}
                  </button>
                `).join('')}
              </div>

              <div class="grid grid-cols-2 gap-2">
                <select onchange="adminOrderFilters.region = this.value; render();" class="p-2 border rounded-xl bg-gray-50 font-bold">
                  <option value="ALL" ${adminOrderFilters.region === 'ALL' ? 'selected' : ''}>${tr("Barcha hududlar", "Все регионы")}</option>
                  <option value="TASHKENT" ${adminOrderFilters.region === 'TASHKENT' ? 'selected' : ''}>${tr("Toshkent shahri", "Город Ташкент")}</option>
                  <option value="PROVINCE" ${adminOrderFilters.region === 'PROVINCE' ? 'selected' : ''}>${tr("Viloyatlar", "Области")}</option>
                </select>

                <select onchange="adminOrderFilters.payment = this.value; render();" class="p-2 border rounded-xl bg-gray-50 font-bold">
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
                    <p class="text-[10px] text-gray-400">${escapeHtml(regionLabel(o.region))} | ${escapeHtml(payMethodLabel(o.payMethod))}</p>
                    <p class="text-[10px] text-gray-500">${escapeHtml(deliverySnapshotLabel(o))} · ${escapeHtml(effectiveShipmentStatusLabel(o))}</p>
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
      let userOrders = orders.filter(o => userOrderFilter === 'ALL' || o.status === userOrderFilter);

      container.innerHTML = `
        <div class="space-y-3">
          <h2 class="text-lg font-bold text-slate-800">${t('my_orders')}</h2>

          <div class="flex space-x-1 overflow-x-auto pb-1 text-xs">
            <button onclick="userOrderFilter='ALL'; render();" class="px-2.5 py-1 rounded-xl font-bold ${userOrderFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white border text-gray-600'}">${tr("Barchasi", "Все")}</button>
            ${['NEW', 'PROCESSING', 'DELIVERED', 'CANCELLED'].map(st => `
              <button onclick="userOrderFilter='${st}'; render();" class="px-2.5 py-1 rounded-xl font-bold ${userOrderFilter === st ? statusColorClass(st) + ' ring-2 ring-offset-1 ring-current' : 'bg-white border text-gray-500'}">${statusLabel(st)}</button>
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
              <p class="text-xs text-gray-600">🚚 ${escapeHtml(deliverySnapshotLabel(o))} · <b>${escapeHtml(effectiveShipmentStatusLabel(o))}</b></p>
              ${o.shipment?.kind === 'TAXI' && o.shipment?.carNumber ? `<div class="bg-blue-50 border border-blue-200 p-2 rounded-xl text-[11px]">🚕 ${tr('Mashina','Машина')}: <b>${escapeHtml(o.shipment.carNumber)}</b><br>${tr('Haydovchi','Водитель')}: ${escapeHtml(o.shipment.driverPhone || '')}${o.shipment.driverName ? ` · ${escapeHtml(o.shipment.driverName)}` : ''}</div>` : ''}
              ${o.shipment?.kind === 'POST' && o.shipment?.trackingNumber ? `<div class="bg-blue-50 border border-blue-200 p-2 rounded-xl text-[11px]">📦 ${escapeHtml(o.shipment.providerName || o.delivery?.providerName || '')}<br>${tr("Jo'natma raqami",'Трек-номер')}: <b>${escapeHtml(o.shipment.trackingNumber)}</b>${o.shipment.originBranch ? `<br>${tr('Filial','Филиал')}: ${escapeHtml(o.shipment.originBranch)}` : ''}</div>` : ''}
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
                  <button onclick="cancelUserOrder(${o.id}, event)" class="text-xs fc-bg-danger-soft fc-text-danger border fc-border-danger px-2.5 py-1 rounded-lg font-bold">
                    ❌ ${tr("Bekor qilish", "Отмена")}
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    async function cancelUserOrder(orderId, e) {
      if (e) e.stopPropagation();
      if (!confirm(tr("Rostdan ham ushbu buyurtmani bekor qilmoqchimisiz?", "Вы действительно хотите отменить этот заказ?"))) return;
      try {
        const result = await callApi('cancel_order', { orderId });
        const updated = formatOrderForUi(result.order);
        const idx = orders.findIndex(o => o.id === updated.id);
        if (idx >= 0) orders[idx] = updated;
        alert(tr("✅ Buyurtmangiz bekor qilindi!", "✅ Заказ отменён!"));
        render();
      } catch (e2) {
        console.error(e2);
        alert(tr("❌ Xatolik yuz berdi, qayta urinib ko'ring.", "❌ Произошла ошибка. Попробуйте ещё раз."));
      }
    }

    function setAdminStatusFilter(st) {
      adminOrderFilters.status = st;
      render();
    }

    // 5. WAREHOUSE TAB — 11-16-band: uch sub-bo'lim (Holat / Qoldiqni yangilash / Kirim).
    // 9-band: Ombor — 4 ta aniq bo'lim: Holat / Qoldiq / Kirim / Harakatlar.
    function renderWarehouse(container) {
      const tabs = [
        { key: 'HOLAT', label: tr('Holat', 'Состояние') },
        { key: 'QOLDIQ', label: tr('Qoldiq', 'Остаток') },
        { key: 'KIRIM', label: tr('Kirim', 'Приход') },
        { key: 'HARAKATLAR', label: tr('Harakatlar', 'Движения') },
      ];
      container.innerHTML = `
        <div class="space-y-4">
          <h2 class="text-lg font-bold text-slate-800">${t('warehouse_title')}</h2>
          <div class="grid grid-cols-4 gap-1.5">
            ${tabs.map(tb => `<button onclick="switchWarehouseSubTab('${tb.key}')" class="py-2 rounded-xl text-[11px] font-bold ${warehouseSubTab === tb.key ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600'}">${tb.label}</button>`).join('')}
          </div>
          ${warehouseSubTab === 'HOLAT' ? renderWarehouseHolatHtml()
            : warehouseSubTab === 'QOLDIQ' ? renderWarehouseUpdateHtml()
            : warehouseSubTab === 'KIRIM' ? renderWarehouseKirimHtml()
            : renderWarehouseHarakatlarHtml()}
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
      return `
        ${(isUserAnAdmin && isAdminMode) ? `
          <button type="button" onclick="activePopupModal='LOW_STOCK_SETTINGS'; render();" class="w-full flex items-center justify-between text-[11px] text-gray-500 bg-white px-3 py-2 rounded-xl border mb-2">
            <span>⚙️ ${tr("Kam qolgan chegarasi", "Порог «заканчивается»")}: <b class="text-gray-800">${Number.isFinite(s.lowStockThreshold) ? s.lowStockThreshold : shopLowStockThreshold}</b></span>
            <span class="text-blue-600 font-bold">${tr("O'zgartirish", "Изменить")}</span>
          </button>
        ` : ''}
        <div class="grid grid-cols-2 gap-2">
          <button type="button" onclick="openWarehouseStockFilter('LOW')" class="fc-card fc-border-warning text-left"><p class="text-gray-500 text-[11px]">${tr('Kam qolgan', 'Заканчивается')}</p><b class="text-xl block fc-text-warning">${s.lowStock}</b></button>
          <button type="button" onclick="openWarehouseStockFilter('OUT')" class="fc-card fc-border-danger text-left"><p class="text-gray-500 text-[11px]">${tr('Tugagan', 'Нет в наличии')}</p><b class="text-xl block fc-text-danger">${s.outOfStock}</b></button>
          <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Rasmsiz', 'Без фото')}</p><b class="text-xl block">${missingImageCount}</b></div>
          <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Import rasmsiz', 'Импорт без фото')}</p><b class="text-xl block">${importMissingImageCount}</b></div>
          <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Jami mahsulot', 'Всего товаров')}</p><b class="text-xl block">${s.totalProducts}</b></div>
          <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Jami qoldiq', 'Всего на складе')}</p><b class="text-xl block">${s.totalStock}</b></div>
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
        <div class="fc-card flex items-center gap-3">
          <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-12 h-12 object-cover rounded-xl flex-shrink-0">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-xs text-gray-800 truncate">${escapeHtml(productName(p))}</p>
            <p class="text-[10px] text-gray-400">ID: ${escapeHtml(p.sku)}${catLabel ? ` · ${escapeHtml(catLabel)}` : ''}</p>
            ${variantSummary ? `<p class="text-[10px] text-gray-500 mt-0.5 truncate">${variantSummary}</p>` : `<p class="text-[10px] text-gray-500 mt-0.5">${tr('Qoldiq', 'Остаток')}: ${p.stock}</p>`}
          </div>
        </div>
      `;
    }

    // 14-16-band: "Qoldiqni yangilash" — mavjud daraxt + tezkor SKU/ID
    // yangilash, O'ZGARISHSIZ saqlangan (faqat Holatdan alohida sub-tabga ko'chdi).
    function renderWarehouseUpdateHtml() {
      const topCats = categories.filter(c => !c.parentId);
      return `
        <div class="space-y-4">
          <div class="fc-sticky-below-header bg-white p-4 rounded-2xl border space-y-3 shadow-sm">
            <h3 class="font-bold text-sm text-gray-800">${tr("⚡ ID orqali ko'p tovar qoldig'ini yangilash", "⚡ Массовое обновление остатков по ID")}</h3>
            <p class="text-[10px] text-gray-500">${tr("SKU va sonini kiriting (Masalan:", "Введите SKU и количество (Например:")} <b>111001 35</b>)</p>
            <textarea id="bulk-input" rows="4" class="w-full p-2.5 font-mono text-xs border rounded-xl bg-gray-50" placeholder="111001 35&#10;111002 20"></textarea>
            <button onclick="saveBulkStock()" class="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs">${tr("💾 Barchasini saqlash", "💾 Сохранить все")}</button>
          </div>

          <div class="flex items-center justify-end gap-2">
            <div class="flex gap-1"><button onclick="warehouseMissingImageOnly=!warehouseMissingImageOnly; if(warehouseMissingImageOnly)warehouseImportedMissingImageOnly=false; render();" class="px-2 py-1.5 rounded-xl text-[10px] font-bold ${warehouseMissingImageOnly ? 'bg-amber-500 text-white' : 'bg-white border text-amber-700'}">🖼 ${tr('Rasmsiz', 'Без фото')} (${getMissingImageProducts().length})</button><button onclick="warehouseImportedMissingImageOnly=!warehouseImportedMissingImageOnly; if(warehouseImportedMissingImageOnly)warehouseMissingImageOnly=false; render();" class="px-2 py-1.5 rounded-xl text-[10px] font-bold ${warehouseImportedMissingImageOnly ? 'bg-blue-600 text-white' : 'bg-white border text-blue-700'}">📊 ${tr('Import rasmsiz', 'Импорт без фото')} (${products.filter(p => p.status !== 'DELETED' && !hasProductImage(p) && p.importBatchId).length})</button></div>
          </div>

          <p class="text-[10px] text-gray-400 -mb-2">${tr("Daraxtdan mahsulotni bosib to'g'ridan-to'g'ri qoldig'ini tahrirlang.", "Нажмите на товар в дереве, чтобы сразу изменить остаток.")}</p>
          <div class="bg-white p-4 rounded-2xl border space-y-3 shadow-sm font-mono text-xs">
            ${topCats.map(parent => renderCategoryTreeNodeHTML(parent, 0)).join('')}
          </div>
        </div>
      `;
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
        <div class="fc-card space-y-2">
          <label class="font-bold text-xs text-gray-700">${tr('Mahsulot qidirish', 'Поиск товара')}</label>
          <input type="text" id="kirim-search-input" value="${escapeHtml(warehouseKirimSearch)}" oninput="handleKirimSearchDebounced()" placeholder="${tr('Nomi, SKU yoki ID', 'Название, SKU или ID')}" class="w-full p-2.5 border rounded-xl text-xs">
          <div id="kirim-search-results">${renderKirimSearchResultsHtml()}</div>
          <div class="pt-2 border-t">
            <button onclick="warehouseKirimShowCatalog=!warehouseKirimShowCatalog; render();" class="text-[11px] font-bold text-blue-600">${warehouseKirimShowCatalog ? '▾' : '▸'} ${tr('Katalog orqali topish', 'Найти через каталог')}</button>
            ${warehouseKirimShowCatalog ? `
              <div class="mt-2 bg-gray-50 p-3 rounded-xl border space-y-3 font-mono text-xs max-h-64 overflow-y-auto">
                ${categories.filter(c => !c.parentId).map(parent => renderCategoryTreeNodeHTML(parent, 0, true)).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      ` : `
        <div class="fc-card space-y-3">
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
          <button onclick="submitKirim()" ${warehouseKirimSaving ? 'disabled' : ''} class="fc-btn fc-btn-success w-full">${warehouseKirimSaving ? tr('Saqlanmoqda...', 'Сохранение...') : '✅ ' + tr('Kirimni saqlash', 'Сохранить приход')}</button>
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
      warehouseSubTab = tabName;
      warehouseStockFilter = null;
      render();
      if (tabName === 'HARAKATLAR') loadWarehouseMovements();
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
      const indent = "&nbsp;&nbsp;".repeat(depth * 2);

      return `
        <div class="space-y-1">
          <div class="font-bold text-blue-900">
            ${indent}${depth === 0 ? '📂' : '└─ 📁'} ${escapeHtml(categoryName(cat))}
          </div>
          ${catProds.map(p => {
            const vars = productVariants(p);
            const rowClick = pickMode ? `pickKirimProduct('${p.id}')` : null;
            if (vars.length > 0) {
              // 14-band: variantli mahsulotning istalgan variant qatorini bosish
              // to'liq mahsulot tahrirlash oynasini ochadi (variant qty'lari shu yerda) —
              // pickMode'da esa mahsulotni Kirim uchun tanlaydi.
              return vars.map(v => `
                <div onclick="${rowClick || `openProductDetailModal('${p.id}')`}" class="pl-4 text-[11px] text-gray-700 flex justify-between border-b pb-1 gap-2 cursor-pointer hover:bg-blue-50 -mx-1 px-1 rounded">
                  <span>${indent}&nbsp;&nbsp;* [ID: ${escapeHtml(v.sku)}] ${escapeHtml(productName(p))} ${escapeHtml(variantLabel(v))}</span>
                  <b class="${v.qty > 0 ? 'text-green-600' : 'fc-text-danger'}">${v.qty} ${tr('ta','шт.')}</b>
                </div>
              `).join('');
            }
            // 14-band: oddiy (variantsiz) mahsulot qatorini bosish to'g'ridan-to'g'ri
            // qoldiq (stock) tezkor tahrirlash oynasini ochadi — daraxt orqali topish.
            return `
              <div onclick="${rowClick || `openEditFieldModal('${p.id}','stock')`}" class="pl-4 text-[11px] text-gray-700 flex justify-between border-b pb-1 cursor-pointer hover:bg-blue-50 -mx-1 px-1 rounded">
                <span>${indent}&nbsp;&nbsp;* [ID: ${escapeHtml(p.sku)}] ${escapeHtml(productName(p))}</span>
                <b class="${p.stock > 0 ? 'text-green-600' : 'fc-text-danger'}">${p.stock} ${tr('ta','шт.')}</b>
              </div>
            `;
          }).join('')}
          ${children.map(child => renderCategoryTreeNodeHTML(child, depth + 1, pickMode)).join('')}
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
        renderPageShell(container, tr('Dashboard / Hisobot', 'Dashboard / Отчёт'), `<div class="fc-empty-state"><div class="fc-spinner"></div><p>${tr('Yuklanmoqda...', 'Загрузка...')}</p></div>`);
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
      const body = `
        <div class="space-y-4">
          <div class="grid grid-cols-5 gap-1">
            ${tabs.map(tb => `<button onclick="switchDashboardTab('${tb.key}')" class="py-2 rounded-xl text-[10px] font-bold ${dashboardTab === tb.key ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600'}">${tb.label}</button>`).join('')}
          </div>
          ${showPeriodFilter ? `
            <div class="flex gap-1.5 flex-wrap">
              ${periodChips.map(c => `<button onclick="setDashboardPeriod('${c.key}')" class="fc-badge ${dashboardPeriod === c.key ? 'fc-badge-primary' : 'fc-badge-muted'}">${c.label}</button>`).join('')}
            </div>
            ${dashboardPeriod === 'custom' ? `
              <div class="flex gap-2 items-center">
                <input type="date" value="${escapeHtml(dashboardCustomFrom)}" onchange="dashboardCustomFrom=this.value; reloadDashboardRange();" class="flex-1 p-2 border rounded-xl text-xs">
                <span class="text-gray-400 text-xs">—</span>
                <input type="date" value="${escapeHtml(dashboardCustomTo)}" onchange="dashboardCustomTo=this.value; reloadDashboardRange();" class="flex-1 p-2 border rounded-xl text-xs">
              </div>
            ` : ''}
          ` : ''}
          ${renderDashboardTabBodyHtml(d)}
        </div>
      `;
      renderPageShell(container, tr('Dashboard / Hisobot', 'Dashboard / Отчёт'), body);
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
          <h3 class="font-bold text-sm text-gray-700 mb-2">💰 ${tr('Savdo', 'Продажи')}</h3>
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
          <h3 class="font-bold text-sm text-gray-700 mb-2">📦 ${tr('Buyurtmalar', 'Заказы')}</h3>
          <div class="grid grid-cols-2 gap-2">
            ${orderStatusBadge(tr('Yangi', 'Новые'), d.orders.NEW, 'warning', 'NEW')}
            ${orderStatusBadge(tr('Tayyorlanmoqda', 'В обработке'), d.orders.PROCESSING, 'primary', 'PROCESSING')}
            ${orderStatusBadge(tr('Yetkazilgan', 'Доставлены'), d.orders.DELIVERED, 'success', 'DELIVERED')}
            ${orderStatusBadge(tr('Bekor/rad', 'Отменены/откл.'), d.orders.CANCELLED + d.orders.REJECTED, 'danger', 'CANCELLED')}
          </div>
        </section>

        <section>
          <h3 class="font-bold text-sm text-gray-700 mb-2">🏷️ ${tr('Tovarlar', 'Товары')}</h3>
          <div class="grid grid-cols-2 gap-2">
            <div class="fc-card"><p class="text-gray-500 text-[11px]">${tr('Jami mahsulot', 'Всего товаров')}</p><b class="text-lg block">${d.products.total}</b></div>
            <div onclick="dashboardGoToWarehouseFilter('LOW')" class="fc-card fc-border-warning cursor-pointer hover:bg-gray-50"><p class="text-gray-500 text-[11px]">${tr('Kam qolgan', 'Заканчивается')}</p><b class="text-lg block fc-text-warning">${d.products.lowStock}</b></div>
            <div onclick="dashboardGoToWarehouseFilter('OUT')" class="fc-card fc-border-danger col-span-2 cursor-pointer hover:bg-gray-50"><p class="text-gray-500 text-[11px]">${tr('Tugagan', 'Нет в наличии')}</p><b class="text-lg block fc-text-danger">${d.products.outOfStock}</b></div>
          </div>
        </section>

        ${d.regions.length ? `
          <section>
            <h3 class="font-bold text-sm text-gray-700 mb-2">📍 ${tr('Hududlar', 'Регионы')}</h3>
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

          <h3 class="font-bold text-sm text-gray-700 mb-2 mt-3">🏆 ${tr('Eng ko‘p sotilgan (hammasi)', 'Самые продаваемые (всё время)')}</h3>
          ${d.products.bestSellers.length ? `
            <div class="fc-card">
              ${d.products.bestSellers.map((p, i) => `<div class="flex items-center justify-between py-1 ${i ? 'border-t' : ''}"><span class="text-xs truncate">${i + 1}. ${escapeHtml(p.name)}</span><b class="text-xs shrink-0">${p.soldCount}</b></div>`).join('')}
            </div>
          ` : `<div class="fc-empty-state"><p>${tr('Ma’lumot yo‘q', 'Нет данных')}</p></div>`}

          <h3 class="font-bold text-sm text-gray-700 mb-2 mt-3">💵 ${tr('Tanlangan davrda tushum (mahsulot bo‘yicha)', 'Выручка за период (по товарам)')}</h3>
          ${revenueByProduct.length ? `
            <div class="fc-card">
              ${revenueByProduct.map((r, i) => `<div class="flex items-center justify-between py-1 ${i ? 'border-t' : ''}"><span class="text-xs truncate flex-1">${i + 1}. ${escapeHtml(r.name)}${r.sku ? ` <span class="text-gray-400">(${escapeHtml(r.sku)})</span>` : ''}</span><b class="text-xs shrink-0 ml-2">${money(r.revenue)}</b></div>`).join('')}
            </div>
          ` : `<div class="fc-empty-state"><p>${tr('Tanlangan davrda savdo yo‘q', 'Нет продаж за выбранный период')}</p></div>`}

          ${topCategories.length ? `
            <h3 class="font-bold text-sm text-gray-700 mb-2 mt-3">📂 ${tr('Yetakchi kategoriyalar (tanlangan davr)', 'Топ категорий (за период)')}</h3>
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
    const DESIGN_COLOR_KEYS = ['primary', 'accent', 'button', 'pageBg', 'cardBg', 'headerBg', 'bottomNavBg', 'text'];
    const DESIGN_COLOR_LABELS = {
      primary: tr('Asosiy rang', 'Основной цвет'), accent: tr('Urg\'u rangi', 'Акцентный цвет'),
      button: tr('Tugma rangi', 'Цвет кнопок'), pageBg: tr('Sahifa foni', 'Фон страницы'),
      cardBg: tr('Karta foni', 'Фон карточек'), headerBg: tr('Header foni', 'Фон шапки'),
      bottomNavBg: tr("Pastki panel foni", 'Фон нижней панели'), text: tr('Matn rangi', 'Цвет текста'),
    };
    // 4.1: kamida 5 ta tayyor mavzu. Har biri barcha 8 rolni belgilaydi.
    const DESIGN_THEMES = {
      minimal: { label: tr('Minimal', 'Минимал'), colors: { primary: '#2563eb', accent: '#2563eb', button: '#2563eb', pageBg: '#f6f8fb', cardBg: '#ffffff', headerBg: '#ffffff', bottomNavBg: '#ffffff', text: '#1f2937' } },
      dark: { label: tr('Dark', 'Тёмная'), colors: { primary: '#60a5fa', accent: '#818cf8', button: '#2563eb', pageBg: '#0f172a', cardBg: '#1e293b', headerBg: '#111827', bottomNavBg: '#111827', text: '#f1f5f9' } },
      sport: { label: tr('Sport', 'Спорт'), colors: { primary: '#ea580c', accent: '#f59e0b', button: '#ea580c', pageBg: '#f1f5f9', cardBg: '#ffffff', headerBg: '#111827', bottomNavBg: '#111827', text: '#111827' } },
      elegant: { label: tr('Elegant', 'Элегант'), colors: { primary: '#6d28d9', accent: '#7c3aed', button: '#6d28d9', pageBg: '#faf5ff', cardBg: '#ffffff', headerBg: '#1e1b4b', bottomNavBg: '#1e1b4b', text: '#2e1065' } },
      bright: { label: tr('Bright', 'Яркая'), colors: { primary: '#db2777', accent: '#0891b2', button: '#db2777', pageBg: '#fff7ed', cardBg: '#ffffff', headerBg: '#ffffff', bottomNavBg: '#ffffff', text: '#7c2d12' } },
    };

    // ---- 4.3: WCAG kontrast hisoblash ----
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
    // 4.3: tugma/header/pastki panel uchun avtomatik o'qiladigan matn rangi.
    function readableTextColor(bgHex) {
      const white = contrastRatio(bgHex, '#ffffff');
      const black = contrastRatio(bgHex, '#000000');
      return white >= black ? '#ffffff' : '#000000';
    }
    const WCAG_AA_RATIO = 4.5;

    function designColorsWithDefaults(colors) {
      const base = DESIGN_THEMES.minimal.colors;
      const merged = {};
      for (const key of DESIGN_COLOR_KEYS) merged[key] = (colors && colors[key]) || base[key];
      return merged;
    }

    // 4.3: saqlashdan oldin o'qilmaydigan kombinatsiyalarni topadi (masalan
    // oq tugma + oq matn). Matn/fon juftlari WCAG AA (4.5:1) bo'yicha tekshiriladi.
    function findContrastIssues(colors) {
      const c = designColorsWithDefaults(colors);
      const issues = [];
      if (contrastRatio(c.text, c.pageBg) < WCAG_AA_RATIO) issues.push({ pair: tr("Matn / Sahifa foni", 'Текст / Фон страницы'), ratio: contrastRatio(c.text, c.pageBg) });
      if (contrastRatio(c.text, c.cardBg) < WCAG_AA_RATIO) issues.push({ pair: tr('Matn / Karta foni', 'Текст / Фон карточек'), ratio: contrastRatio(c.text, c.cardBg) });
      return issues;
    }

    // 4.6: bitta joyda qo'llanadi — Telegram Mini App va oddiy web'da bir xil
    // ishlaydi, chunki bu faqat CSS custom property'larni yangilaydi.
    function applyDesignColors(colors) {
      const c = designColorsWithDefaults(colors);
      const root = document.documentElement.style;
      root.setProperty('--ustore-primary', c.primary);
      root.setProperty('--ustore-accent', c.accent);
      root.setProperty('--ustore-button', c.button);
      root.setProperty('--ustore-button-text', readableTextColor(c.button));
      root.setProperty('--ustore-page-bg', c.pageBg);
      root.setProperty('--ustore-card-bg', c.cardBg);
      root.setProperty('--ustore-header-bg', c.headerBg);
      root.setProperty('--ustore-bottomnav-bg', c.bottomNavBg);
      root.setProperty('--ustore-text', c.text);
    }

    function openDesignSettings() {
      if (!isUserAnAdmin || !isAdminMode) return;
      designDraft = { themeId: designSettings.themeId, colors: { ...designSettings.colors } };
      openPage('DESIGN_SETTINGS');
    }
    function closeDesignSettings() {
      applyDesignColors(designSettings.colors); // bekor qilinsa — saqlangan holatga qaytariladi
      designDraft = null;
      closePage();
    }
    function pickDesignTheme(themeId) {
      const theme = DESIGN_THEMES[themeId];
      if (!theme) return;
      designDraft.themeId = themeId;
      designDraft.colors = { ...theme.colors };
      applyDesignColors(designDraft.colors); // 4.1: tugmani bosganda darhol preview
      renderModalContainer();
    }
    function setDesignColor(key, value) {
      if (!DESIGN_COLOR_KEYS.includes(key)) return;
      designDraft.themeId = 'custom';
      designDraft.colors = { ...designDraft.colors, [key]: value };
      applyDesignColors(designDraft.colors);
      renderModalContainer();
    }
    async function saveDesignSettings() {
      const issues = findContrastIssues(designDraft.colors);
      if (issues.length) {
        const msg = issues.map(i => `${i.pair}: ${i.ratio.toFixed(1)}:1 (kerak ${WCAG_AA_RATIO}:1)`).join('\n');
        if (!confirm(tr(`⚠️ Ba'zi rang juftlari o'qilishi qiyin bo'lishi mumkin:\n${msg}\n\nBaribir saqlaysizmi?`, `⚠️ Некоторые сочетания цветов трудно читать:\n${msg}\n\nВсё равно сохранить?`))) return;
      }
      showActionToast(tr('⏳ Dizayn saqlanmoqda...', '⏳ Дизайн сохраняется...'), 'saving');
      try {
        const result = await callApi('set_design_settings', { themeId: designDraft.themeId, colors: designDraft.colors });
        designSettings = result.designSettings;
        applyDesignColors(designSettings.colors);
        designDraft = null;
        closePage();
        showActionToast(tr('✅ Dizayn saqlandi', '✅ Дизайн сохранён'), 'success', 1500);
      } catch (e) {
        console.error(e);
        applyDesignColors(designSettings.colors);
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
      fulfillmentSettingsSection = 'PAYMENTS';
      fulfillmentExpandedPayment = fulfillmentExpandedPayment || 'CASH';
      openPage('PAYMENT_SETTINGS');
    }

    function closeFulfillmentSettingsPage() {
      fulfillmentDraft = null;
      closePage();
    }

    // Faqat #fulfillment-panel (sarlavha/Saqlash tugmalaridan tashqari ichki
    // navigatsiya: MENU/DELIVERY/PAYMENTS) qayta chiziladi — tashqi scroll
    // konteyner hech qachon almashtirilmaydi.
    function rerenderFulfillmentPanel() {
      const el = document.getElementById('fulfillment-panel');
      if (el) el.innerHTML = renderFulfillmentPanel();
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
    }

    function setFulfillmentSettingsSection(section) {
      fulfillmentSettingsSection = section;
      if (section === 'DELIVERY' && !fulfillmentDeliveryKind) fulfillmentDeliveryKind = 'FREE';
      if (section === 'PAYMENTS' && !fulfillmentExpandedPayment) fulfillmentExpandedPayment = 'CASH';
      rerenderFulfillmentPanel();
    }

    function setFulfillmentDeliveryKind(kind) {
      fulfillmentDeliveryKind = kind;
      rerenderFulfillmentPanel();
    }

    // 1.2: Naqd/Karta yonma-yon; birini bosganda sozlamasi pastda ochiladi
    // (accordion) — ikkinchisini bossa birinchisi yopiladi, sahifa uzun
    // ro'yxatga aylanmaydi.
    function setFulfillmentExpandedPayment(methodId) {
      fulfillmentExpandedPayment = fulfillmentExpandedPayment === methodId ? null : methodId;
      rerenderFulfillmentPanel();
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
      if (enabled) fulfillmentDraft.delivery[key].regions[regionId] = { ...(fulfillmentDraft.delivery[key].regions[regionId] || defaultRegionSetting(kind)), enabled: true };
      else delete fulfillmentDraft.delivery[key].regions[regionId];
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
      if (enabled) provider.regions[regionId] = { ...(provider.regions[regionId] || { payer: 'CUSTOMER' }), enabled: true };
      else delete provider.regions[regionId];
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
      if (enabled) method.regions[regionId] = { enabled: true };
      else delete method.regions[regionId];
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

    function renderDeliveryRegionRows(kind) {
      const key = DELIVERY_CONFIG_KEYS[kind], regions = fulfillmentDraft.delivery[key].regions;
      return TOP_LEVEL_REGIONS.map(region => {
        const entry = regions[region.id], encoded = encodedRegionId(region.id);
        return `<div class="border rounded-xl p-2.5 space-y-2">
          <label class="flex items-center justify-between gap-2 font-bold"><span>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</span><input type="checkbox" ${entry?.enabled ? 'checked' : ''} onchange="setDeliveryRegionEnabled('${kind}','${encoded}',this.checked)"></label>
          ${entry?.enabled && kind === 'FIXED' ? `<div class="flex items-center gap-2"><input type="number" min="0" value="${entry.fee || ''}" oninput="setDeliveryRegionNumber('FIXED','${encoded}','fee',this.value)" class="flex-1 p-2 border rounded-xl"><span>${tr("so'm",'сум')}</span></div>` : ''}
          ${entry?.enabled && kind === 'TAXI' ? `
            <input type="number" min="0" value="${entry.exactFee ?? ''}" oninput="setDeliveryRegionNumber('TAXI','${encoded}','exactFee',this.value)" placeholder="${tr('Aniq narx (ixtiyoriy)', 'Точная цена (необязательно)')}" class="w-full p-2 border rounded-xl">
            <div class="grid grid-cols-2 gap-2"><input type="number" min="0" value="${entry.minFee ?? ''}" oninput="setDeliveryRegionNumber('TAXI','${encoded}','minFee',this.value)" placeholder="Min" class="p-2 border rounded-xl"><input type="number" min="0" value="${entry.maxFee ?? ''}" oninput="setDeliveryRegionNumber('TAXI','${encoded}','maxFee',this.value)" placeholder="Max" class="p-2 border rounded-xl"></div>
            <p class="text-[9px] text-gray-400">${tr("Bo'sh qoldirilsa, umumiy qiymat yoki standart matn ishlatiladi.", "Если оставить пустым, используется общее значение или стандартный текст.")}</p>
          ` : ''}
          ${entry?.enabled ? `<input type="text" value="${escapeHtml(entry.comment || '')}" oninput="setDeliveryRegionComment('${kind}','${encoded}',this.value)" placeholder="${tr('Izoh (ixtiyoriy)','Комментарий (необязательно)')}" maxlength="200" class="w-full p-2 border rounded-xl text-[11px]">` : ''}
          ${entry?.enabled ? `<input type="text" value="${escapeHtml(entry.estimatedTime || '')}" oninput="setDeliveryRegionEstimatedTime('${kind}','${encoded}',this.value)" placeholder="${tr("Yetkazib berish vaqti (ixtiyoriy, masalan: 30-60 daqiqa)","Время доставки (необязательно, например: 30-60 минут)")}" maxlength="60" class="w-full p-2 border rounded-xl text-[11px]">` : ''}
        </div>`;
      }).join('');
    }

    function renderPostProviderSettings(provider) {
      return `<div class="border rounded-2xl p-3 space-y-3">
        <label class="flex items-center justify-between font-black"><span>📦 ${escapeHtml(provider.name)}</span><input type="checkbox" ${provider.enabled ? 'checked' : ''} onchange="setPostProviderEnabled('${provider.id}',this.checked)"></label>
        ${provider.id === 'OTHER' ? `<input type="text" value="${escapeHtml(provider.name)}" oninput="setPostProviderName('OTHER',this.value)" placeholder="${tr('Pochta nomi','Название почты')}" class="w-full p-2 border rounded-xl">` : ''}
        ${provider.enabled ? `${settingsBulkButtons(`bulkPostRegions('${provider.id}',true)`, `bulkPostRegions('${provider.id}',false)`)}<div class="space-y-2">${TOP_LEVEL_REGIONS.map(region => {
          const entry = provider.regions[region.id], encoded = encodedRegionId(region.id);
          return `<div class="border rounded-xl p-2 space-y-2"><label class="flex justify-between gap-2 font-bold"><span>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</span><input type="checkbox" ${entry?.enabled ? 'checked' : ''} onchange="setPostRegionEnabled('${provider.id}','${encoded}',this.checked)"></label>${entry?.enabled ? `<select onchange="setPostRegionPayer('${provider.id}','${encoded}',this.value)" class="w-full p-2 border rounded-xl bg-gray-50"><option value="CUSTOMER" ${entry.payer !== 'SELLER' ? 'selected' : ''}>${tr('Pochta xarajati mijoz hisobidan','Почта за счёт клиента')}</option><option value="SELLER" ${entry.payer === 'SELLER' ? 'selected' : ''}>${tr('Pochta xarajati sotuvchi hisobidan','Почта за счёт продавца')}</option></select><input type="text" value="${escapeHtml(entry.comment || '')}" oninput="setPostRegionComment('${provider.id}','${encoded}',this.value)" placeholder="${tr('Izoh (ixtiyoriy)','Комментарий (необязательно)')}" maxlength="200" class="w-full p-2 border rounded-xl text-[11px]"><input type="text" value="${escapeHtml(entry.estimatedTime || '')}" oninput="setPostRegionEstimatedTime('${provider.id}','${encoded}',this.value)" placeholder="${tr("Yetkazib berish vaqti (ixtiyoriy)","Время доставки (необязательно)")}" maxlength="60" class="w-full p-2 border rounded-xl text-[11px]">` : ''}</div>`;
        }).join('')}</div>` : ''}
      </div>`;
    }

    function qrProvidersOf() {
      return fulfillmentDraft?.payments.methods.find(m => m.id === 'QR')?.providers || [];
    }
    function setQrProviderEnabled(providerId, enabled) {
      const p = qrProvidersOf().find(x => x.id === providerId);
      if (p) p.enabled = !!enabled;
      rerenderFulfillmentBody();
    }
    function setQrProviderPaymentUrl(providerId, value) {
      const p = qrProvidersOf().find(x => x.id === providerId);
      if (p) p.paymentUrl = String(value || '').trim().slice(0, 2048) || null;
    }
    // 17-band: brauzer-native BarcodeDetector mavjud bo'lsa, yuklangan QR
    // rasmdagi linkni avtomatik o'qishga urinadi — mavjud bo'lmasa yoki
    // decode qila olmasa, jim o'tkazib yuboriladi (admin qo'lda kiritadi,
    // hech narsa bloklanmaydi).
    async function tryAutoFillQrPaymentUrlFromFile(providerId, file) {
      try {
        if (typeof BarcodeDetector === 'undefined') return;
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(file);
        let results;
        try { results = await detector.detect(bitmap); } finally { bitmap.close?.(); }
        const raw = results && results[0] && results[0].rawValue;
        if (!raw) return;
        let url;
        try { url = new URL(raw); } catch (_) { return; }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
        const p = qrProvidersOf().find(x => x.id === providerId);
        if (p && !p.paymentUrl) { p.paymentUrl = url.href; rerenderFulfillmentBody(); }
      } catch (_) { /* decode ishlamasa ham upload rad etilmaydi */ }
    }
    async function pickQrProviderImage(event, providerId) {
      const file = event.target.files?.[0];
      if (!file) return;
      try { validatePickedImageFile(file); }
      catch (e) { event.target.value = ''; return alert(pickedImageErrorMessage(e, file)); }
      let prepared;
      try { prepared = await captureAndPrepareImageV2(file, TARGET_PRODUCT_IMAGE_BYTES, 800, 0.85); }
      catch (e) { event.target.value = ''; return alert(tr("Rasmni o'qib bo'lmadi. Qaytadan tanlang.", "Не удалось прочитать изображение. Попробуйте снова.")); }
      showActionToast(tr("⏳ QR rasm yuklanmoqda...", "⏳ QR-изображение загружается..."), 'saving');
      try {
        const url = await uploadImageSnapshot({ file: prepared, preparing: Promise.resolve(prepared), url: null }, null, true);
        const p = qrProvidersOf().find(x => x.id === providerId);
        if (p) p.qrImageUrl = url;
        await tryAutoFillQrPaymentUrlFromFile(providerId, file);
        showActionToast(tr("✅ Yuklandi", "✅ Загружено"), 'success', 1200);
        rerenderFulfillmentBody();
      } catch (e) {
        console.error(e);
        showActionToast(tr("❌ Yuklanmadi", "❌ Не загружено"), 'error', 1800);
        alert(tr("QR rasmni yuklab bo'lmadi: ", "Не удалось загрузить QR-изображение: ") + (e.message || e));
      } finally {
        event.target.value = '';
      }
    }
    function renderQrProviderSettings(provider) {
      return `<div class="border rounded-xl p-2.5 space-y-2 bg-white">
        <label class="flex items-center justify-between font-bold"><span>${escapeHtml(provider.name)}</span><input type="checkbox" ${provider.enabled ? 'checked' : ''} onchange="setQrProviderEnabled('${provider.id}',this.checked)"></label>
        ${provider.enabled ? `
          <div class="flex items-center gap-3">
            ${provider.qrImageUrl ? `<img src="${escapeHtml(provider.qrImageUrl)}" class="w-16 h-16 object-contain rounded-lg border bg-white">` : ''}
            <input id="qr-img-input-${provider.id}" type="file" accept="image/*" class="hidden" onchange="pickQrProviderImage(event,'${provider.id}')">
            <input id="qr-img-input-files-${provider.id}" type="file" class="hidden" onchange="pickQrProviderImage(event,'${provider.id}')">
            <button type="button" onclick="openImagePickerSheet('qr-img-input-${provider.id}','qr-img-input-files-${provider.id}')" class="fc-btn fc-btn-secondary" style="padding:.5rem .75rem;min-height:auto;font-size:.6875rem"><i data-lucide="image-plus" class="w-3.5 h-3.5"></i>${provider.qrImageUrl ? tr('QR almashtirish', 'Заменить QR') : tr('QR rasm yuklash', 'Загрузить QR')}</button>
          </div>
          <input type="url" inputmode="url" value="${escapeHtml(provider.paymentUrl || '')}" oninput="setQrProviderPaymentUrl('${provider.id}',this.value)" placeholder="${tr("To'lov sahifasi/link URL", "URL страницы оплаты")}" class="w-full p-2 border rounded-xl text-[11px]">
          <p class="text-[9px] text-gray-400">${tr("QR rasm yuklaganda link avtomatik topilsa to'ldiriladi — topilmasa qo'lda kiriting.", "При загрузке QR ссылка заполнится автоматически, если распознается — иначе введите вручную.")}</p>
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
        ${method.enabled ? `${method.id === 'CARD' ? `<div class="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-2"><input type="text" value="${escapeHtml(method.cardNumber || '')}" oninput="setCardSetting('cardNumber',this.value)" placeholder="8600 0000 0000 0000" class="w-full p-2 border rounded-xl font-mono"><input type="text" value="${escapeHtml(method.cardHolder || '')}" oninput="setCardSetting('cardHolder',this.value)" placeholder="${tr('Karta egasi','Владелец карты')}" class="w-full p-2 border rounded-xl"><label class="flex items-center gap-2 font-bold"><input type="checkbox" ${method.receiptRequired ? 'checked' : ''} onchange="setCardSetting('receiptRequired',this.checked)">${tr('Chek yuklash majburiy','Загрузка чека обязательна')}</label><p class="text-[10px] text-blue-700">${tr('Faqat xaridorga ko‘rsatiladigan karta raqami va egasi. CVV/PIN/SMS saqlanmaydi.','Только номер и владелец карты для показа покупателю. CVV/PIN/SMS не сохраняются.')}</p></div>` : ''}${method.id === 'QR' ? `<div class="space-y-2">${(method.providers || []).map(renderQrProviderSettings).join('')}</div>` : ''}${settingsBulkButtons(`bulkPaymentRegions('${method.id}',true)`, `bulkPaymentRegions('${method.id}',false)`)}<div class="divide-y border rounded-xl overflow-hidden">${TOP_LEVEL_REGIONS.map(region => `<label class="flex items-center justify-between px-3 py-2 text-xs font-bold bg-white"><span>${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</span><span class="fc-toggle"><input type="checkbox" ${method.regions[region.id]?.enabled ? 'checked' : ''} onchange="setPaymentRegionEnabled('${method.id}','${encodedRegionId(region.id)}',this.checked)"><span class="fc-toggle-track"></span></span></label>`).join('')}</div>` : ''}
      </div>`;
    }

    function renderFulfillmentDeliveryBody() {
      const kind = fulfillmentDeliveryKind;
      if (kind === 'POST') return `<div class="space-y-3"><label class="flex items-center justify-between font-black"><span>${tr('Pochta orqali yetkazib berishni yoqish','Включить доставку почтой')}</span><input type="checkbox" ${fulfillmentDraft.delivery.post.enabled ? 'checked' : ''} onchange="setPostEnabled(this.checked)"></label><p class="text-[10px] text-gray-500">${tr('BTS va EMU filiallari bazadan olinadi: mijoz viloyat → tuman/shahar → provider → filialni tanlaydi.','Филиалы BTS и EMU берутся из базы: клиент выбирает регион → район/город → службу → отделение.')}</p>${fulfillmentDraft.delivery.post.enabled ? fulfillmentDraft.delivery.post.providers.map(renderPostProviderSettings).join('') : ''}</div>`;
      const key = DELIVERY_CONFIG_KEYS[kind], method = fulfillmentDraft.delivery[key];
      const descriptions = {
        FREE: tr('Tanlangan hududlarda checkoutda faqat bepul variant chiqadi.', 'В выбранных регионах появится бесплатный вариант.'),
        FIXED: tr('Har tanlangan hudud uchun uyigacha aniq narx kiriting.', 'Укажите точную стоимость доставки до дома для каждого региона.'),
        TAXI: tr("Aniq narx yoki min/max diapazon — ikkalasi ham ixtiyoriy, informatsion; buyurtma summasiga qo‘shilmaydi.", "Точная цена или диапазон min/max — оба необязательны, информационные; не включаются в сумму заказа."),
      };
      const taxiGeneralHtml = kind === 'TAXI' ? (() => {
        const g = fulfillmentDraft.delivery.taxi.general || { exactFee: null, minFee: null, maxFee: null, comment: null };
        return `<div class="border-2 border-dashed rounded-xl p-2.5 space-y-2 bg-white">
          <p class="font-bold text-gray-700">⚙️ ${tr('Umumiy qiymat (barcha viloyatlar uchun)', 'Общее значение (для всех регионов)')}</p>
          <input type="number" min="0" value="${g.exactFee ?? ''}" oninput="setTaxiGeneralNumber('exactFee',this.value)" placeholder="${tr('Aniq narx (ixtiyoriy)', 'Точная цена (необязательно)')}" class="w-full p-2 border rounded-xl">
          <div class="grid grid-cols-2 gap-2"><input type="number" min="0" value="${g.minFee ?? ''}" oninput="setTaxiGeneralNumber('minFee',this.value)" placeholder="Min" class="p-2 border rounded-xl"><input type="number" min="0" value="${g.maxFee ?? ''}" oninput="setTaxiGeneralNumber('maxFee',this.value)" placeholder="Max" class="p-2 border rounded-xl"></div>
          <input type="text" value="${escapeHtml(g.comment || '')}" oninput="setTaxiGeneralComment(this.value)" placeholder="${tr('Umumiy izoh (ixtiyoriy)', 'Общий комментарий (необязательно)')}" maxlength="200" class="w-full p-2 border rounded-xl text-[11px]">
          <input type="text" value="${escapeHtml(g.estimatedTime || '')}" oninput="setTaxiGeneralEstimatedTime(this.value)" placeholder="${tr("Umumiy yetkazib berish vaqti (ixtiyoriy)","Общее время доставки (необязательно)")}" maxlength="60" class="w-full p-2 border rounded-xl text-[11px]">
          <p class="text-[9px] text-gray-400">${tr("Bu qiymat faqat o'z narxini kiritmagan viloyatlar uchun ishlatiladi.", "Это значение применяется только к регионам, где своя цена не указана.")}</p>
        </div>`;
      })() : '';
      return `<div class="space-y-3"><label class="flex items-center justify-between font-black"><span>${tr('Usulni yoqish','Включить способ')}</span><input type="checkbox" ${method.enabled ? 'checked' : ''} onchange="setDeliveryMethodEnabled('${kind}',this.checked)"></label><p class="text-[10px] text-gray-500">${descriptions[kind]}</p>${method.enabled ? `${taxiGeneralHtml}${settingsBulkButtons(`bulkDeliveryRegions('${kind}',true)`, `bulkDeliveryRegions('${kind}',false)`)}<div class="space-y-2">${renderDeliveryRegionRows(kind)}</div>` : ''}</div>`;
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
        ['FREE', tr('🆓 Bepul', '🆓 Бесплатно')],
        ['FIXED', tr('🚚 Aniq narx', '🚚 Фикс. цена')],
        ['TAXI', tr('🚕 Taksi', '🚕 Такси')],
        ['POST', tr('📦 Pochta', '📦 Почта')],
      ];
      return `<div class="space-y-3">
        <div class="flex gap-1 flex-wrap">${kinds.map(([id, label]) => `<button type="button" onclick="setFulfillmentDeliveryKind('${id}')" class="px-2.5 py-1.5 rounded-xl font-bold ${fulfillmentDeliveryKind === id ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600'}">${label}</button>`).join('')}</div>
        <div id="fulfillment-body" class="bg-gray-50 border rounded-2xl p-3">${renderFulfillmentDeliveryBody()}</div>
      </div>`;
    }

    // 1.2: Naqd va Karta yonma-yon tugma; bosilgan usul pastda ochiladi.
    function renderFulfillmentPaymentsPanel() {
      // CLICK — faqat platforma ruxsat bergan do'konlarda ko'rinadi (Billz
      // bilan bir xil naqsh); ruxsatsiz do'kon uchun ishlatib bo'lmaydigan
      // tugmani ko'rsatib chalkashtirmaslik uchun ro'yxatdan olib tashlanadi.
      const methods = fulfillmentDraft.payments.methods.filter(m => m.id !== 'CLICK' || clickAccessGranted);
      return `<div class="space-y-3">
        <div class="grid grid-cols-3 gap-2">${methods.map(m => `
          <button type="button" onclick="setFulfillmentExpandedPayment('${m.id}')" class="p-3 rounded-2xl border font-black flex flex-col items-center gap-1 ${fulfillmentExpandedPayment === m.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 border-gray-200'}">
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
      const checked = commerce.validateConfig(fulfillmentDraft, TOP_LEVEL_REGION_IDS);
      if (checked.issues.length) {
        const first = checked.issues[0];
        if (first.code === 'CARD_DETAILS_REQUIRED') return alert(tr('Karta raqami va karta egasi nomini to‘g‘ri kiriting.', 'Правильно укажите номер карты и имя владельца.'));
        if (first.code === 'FIXED_FEE_REQUIRED') return alert(`${topLevelRegionLabel(first.regionId)}: ${tr('aniq yetkazish narxini kiriting.', 'укажите стоимость доставки.')}`);
        if (first.code === 'QR_PROVIDER_REQUIRED') return alert(tr("Kamida bitta QR provayderni yoqing va to'lov URL manzilini kiriting.", "Включите хотя бы один QR-провайдер и укажите URL страницы оплаты."));
        return alert(`${first.regionId === null ? tr('Umumiy qiymat', 'Общее значение') : topLevelRegionLabel(first.regionId)}: ${tr('taksi min/max diapazonini tekshiring.', 'проверьте диапазон такси min/max.')}`);
      }
      const qrEnabledForWarning = checked.config.payments.methods.find(m => m.id === 'QR')?.enabled;
      const old = fulfillmentConfig;
      fulfillmentConfig = checked.config;
      fulfillmentDraft = null;
      closePage();
      showActionToast(tr('⏳ Yetkazib berish sozlamalari saqlanmoqda...', '⏳ Настройки доставки сохраняются...'), 'saving');
      try {
        const result = await callApi('set_fulfillment_config', { config: fulfillmentConfig });
        fulfillmentConfig = commerce.normalizeConfig(result.fulfillmentConfig, TOP_LEVEL_REGION_IDS);
        showActionToast(tr('✅ Yetkazib berish va to‘lov sozlamalari saqlandi', '✅ Настройки доставки и оплаты сохранены'), 'success', 1600);
        // 17-band, "QR SAVE WARNING": faqat admin ko'radi, faqat QR yoqilgan
        // holatda, saqlangandan KEYIN — mablag' haqiqatan tushishini o'zi
        // sinab ko'rishi kerakligini eslatadi.
        if (qrEnabledForWarning) {
          alert(tr("⚠️ Avval o'zingiz to'lovni sinab ko'ring va mablag' to'g'ri hisobga tushayotganini tekshiring.", "⚠️ Сначала протестируйте оплату сами и убедитесь, что средства поступают правильно."));
        }
      } catch (e) {
        fulfillmentConfig = old;
        render();
        showActionToast(tr('❌ Sozlamalar saqlanmadi', '❌ Настройки не сохранены'), 'error', 1800);
        alert(tr('Sozlamalarni saqlashda xato: ', 'Ошибка сохранения настроек: ') + (e.message || e));
      }
    }

    function renderProfile(container) {
      const phones = [shopContact.phone, shopContact.phone2, shopContact.phone3].filter(Boolean);
      const instagramNick = cleanSocialNick(shopContact.instagram);
      const telegramNick = cleanSocialNick(shopContact.telegram);
      const facebookNick = cleanSocialNick(shopContact.facebook);
      const coords = String(shopContact.coordinates || '').trim();
      const mapsUrl = coords ? `https://www.google.com/maps?q=${encodeURIComponent(coords)}` : null;

      container.innerHTML = `
        <div class="space-y-4">
          <div class="bg-white p-5 rounded-2xl shadow-sm flex items-center space-x-4 border">
            <div class="bg-blue-100 p-3 rounded-full text-blue-600">
              <i data-lucide="user" class="w-8 h-8"></i>
            </div>
            <div>
              <h2 class="text-lg font-bold">${escapeHtml(currentUser.firstName)} ${escapeHtml(currentUser.lastName)}</h2>
              <p class="text-xs text-gray-500">${tr("Tel:", "Тел:")} ${escapeHtml(currentUser.phone)}</p>
              <button onclick="activePopupModal='REGISTRATION'; render();" class="mt-1 text-[10px] text-blue-600 font-bold underline">${tr("Ma'lumotlarni tahrirlash", "Изменить данные")}</button>
            </div>
          </div>

          ${!(isAdminMode && isUserAnAdmin) ? `
          <div class="grid grid-cols-2 gap-2">
            <button onclick="openPage('FAVORITES')" class="fc-card flex items-center gap-2 text-left">
              <svg class="w-5 h-5 fc-text-danger shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"></path></svg>
              <span class="font-bold text-xs">${tr('Sevimlilar', 'Избранное')}</span>
            </button>
            <button onclick="openPage('RECENT')" class="fc-card flex items-center gap-2 text-left">
              <i data-lucide="history" class="w-5 h-5 text-blue-500 shrink-0"></i>
              <span class="font-bold text-xs">${tr('Yaqinda ko‘rilgan', 'Недавно просмотренные')}</span>
            </button>
          </div>
          ` : ''}

          ${myStatus.isBlocked ? `
            <div class="fc-bg-danger-soft border fc-border-danger p-4 rounded-2xl text-xs">
              <p class="font-bold fc-text-danger">${tr("🚫 Siz botdan foydalanish huquqidan mahrum qilingansiz", "🚫 Доступ к оформлению заказов заблокирован")}</p>
              <p class="fc-text-danger mt-1">${tr("Sabab", "Причина")}: ${escapeHtml(myStatus.blockReason || tr("ko'rsatilmagan", "не указана"))}</p>
              <p class="fc-text-danger mt-1 text-[10px]">${tr("Buyurtma berish imkoni yopilgan. Savol bo'lsa, do'kon bilan bog'laning.", "Оформление заказов недоступно. По вопросам свяжитесь с магазином.")}</p>
            </div>
          ` : myStatus.isWarned ? `
            <div class="bg-amber-50 border border-amber-300 p-4 rounded-2xl text-xs">
              <p class="font-bold text-amber-800">${tr("⚠️ Sizga ogohlantirish berilgan", "⚠️ Вам вынесено предупреждение")}</p>
              <p class="text-amber-700 mt-1">${tr("Sabab", "Причина")}: ${escapeHtml(myStatus.warnReason || tr("ko'rsatilmagan", "не указана"))}</p>
              <p class="text-amber-600 mt-1 text-[10px]">${tr("Takrorlansa, hisobingiz bloklanishi mumkin.", "При повторении аккаунт может быть заблокирован.")}</p>
            </div>
          ` : ''}

          <div class="shop-about-card bg-white p-4 rounded-2xl shadow-sm border space-y-3">
            <!-- 6-band: LOGOTIP endi bu yerda YO'Q — u faqat yuqoridagi
                 header'da (STORE/ADMIN qatorida) tahrirlanadi, takrorlanmaydi. -->
            <div class="flex items-center gap-3 border-b pb-3">
              <h3 class="font-bold text-base text-gray-900 truncate flex-1 min-w-0">📍 ${escapeHtml(shopDisplayName())}</h3>
              ${(isUserAnAdmin && isAdminMode) ? `
                <button onclick="activePopupModal='SHOP_INFO'; render();" class="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">${ICON_EDIT} ${tr("Tahrirlash", "Изменить")}</button>
              ` : ''}
            </div>

            <div class="space-y-2.5">
              ${shopContact.address ? `
                <div class="flex items-start space-x-3 rounded-xl p-1 -m-1">
                  <i data-lucide="map-pin" class="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"></i>
                  <p class="text-xs font-bold text-gray-800">${escapeHtml((uiLang === 'ru' && shopContact.addressRu) ? shopContact.addressRu : shopContact.address)}</p>
                </div>
              ` : ''}

              ${mapsUrl ? `
                <a href="${escapeHtml(mapsUrl)}" target="_blank" class="flex items-center space-x-3 active:bg-gray-50 rounded-xl p-1 -m-1">
                  <i data-lucide="navigation" class="w-4 h-4 text-blue-600 flex-shrink-0"></i>
                  <p class="text-xs font-bold text-blue-700">${tr("Joylashuv", "Местоположение")} →</p>
                </a>
              ` : ''}

              ${shopContact.workHours ? `
                <div class="flex items-center space-x-3 rounded-xl p-1 -m-1">
                  <i data-lucide="clock" class="w-4 h-4 text-blue-600 flex-shrink-0"></i>
                  <p class="text-xs font-bold text-gray-800">${tr("Ish vaqti", "Время работы")}: ${escapeHtml(shopContact.workHours)}</p>
                </div>
              ` : ''}

              ${phones.map(phone => `
                <a href="tel:${escapeHtml(String(phone).replace(/[^\d+]/g, ''))}" class="flex items-center space-x-3 active:bg-gray-50 rounded-xl p-1 -m-1">
                  <i data-lucide="phone" class="w-4 h-4 text-blue-600 flex-shrink-0"></i>
                  <p class="text-xs font-bold text-gray-800">${escapeHtml(phone)}</p>
                </a>
              `).join('')}
            </div>

            ${(instagramNick || telegramNick || facebookNick) ? `
              <div class="flex items-center gap-2 pt-2.5 border-t">
                ${instagramNick ? `<a href="https://instagram.com/${encodeURIComponent(instagramNick)}" target="_blank" title="Instagram" class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-600"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>` : ''}
                ${telegramNick ? `<a href="https://t.me/${encodeURIComponent(telegramNick)}" target="_blank" title="Telegram" class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-600"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22 11 13 2 9z"></path></svg></a>` : ''}
                ${facebookNick ? `<a href="https://facebook.com/${encodeURIComponent(facebookNick)}" target="_blank" title="Facebook" class="w-7 h-7 flex items-center justify-center rounded-full bg-blue-600 text-white"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h2.6l.4-4H14V7a1 1 0 0 1 1-1h3z"></path></svg></a>` : ''}
              </div>
            ` : ''}

            ${shopInfoIsEmpty() ? `
              <p class="text-[11px] text-gray-400 text-center py-2">${(isUserAnAdmin && isAdminMode) ? tr("Do'kon ma'lumotlarini ✏️ Tahrirlash orqali kiriting.", "Заполните данные магазина через ✏️ Изменить.") : ''}</p>
            ` : ''}
          </div>

          ${(isUserAnAdmin && isAdminMode) ? `
            <button onclick="openDashboardLite()" class="w-full bg-white text-slate-800 p-4 rounded-2xl flex items-center justify-between font-bold shadow-sm border border-slate-200 text-xs">
              <span>📊 ${tr("Dashboard / Hisobot", 'Dashboard / Отчёт')}</span>
              <span>›</span>
            </button>
          ` : ''}


          <!-- BOSH ADMINGA VA ADMINLARGA KO'RINADIGAN BO'LIM -->
          ${(isSuperAdmin && isAdminMode) ? `
            <div class="bg-white p-4 rounded-2xl border space-y-3 shadow-sm">
              <div class="flex justify-between items-center border-b pb-2">
                <h3 class="font-bold text-xs text-amber-900">${tr("👑 Adminlarni boshqarish (Bosh Admin)", "👑 Управление администраторами (Главный админ)")}</h3>
                <button onclick="activePopupModal='ADD_ADMIN'; render();" title="${tr("Yangi admin qo'shish", "Добавить администратора")}" class="bg-amber-600 hover:bg-amber-700 text-white font-bold w-7 h-7 flex items-center justify-center rounded-xl text-sm shadow-sm">
                  ➕
                </button>
              </div>

              <div class="space-y-1 text-xs">
                ${adminsList.map(admId => `
                  <div class="flex justify-between items-center p-2 bg-gray-50 rounded-xl border">
                    <span class="font-mono text-gray-700">ID: ${escapeHtml(admId)} ${admId === currentTgId && isSuperAdmin ? `<b>${tr("(Bosh Admin)", "(Главный админ)")}</b>` : ''}</span>
                    ${!(admId === currentTgId && isSuperAdmin) ? `
                      <button onclick="removeAdmin('${admId}')" aria-label="${tr("O'chirish", 'Удалить')}" class="fc-text-danger font-bold px-2 py-0.5 fc-bg-danger-soft rounded-lg">${ICON_TRASH}</button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    async function saveShopContact() {
      const next = {
        name: document.getElementById('sc-name').value.trim() || null,
        address: document.getElementById('sc-address').value.trim() || null,
        addressRu: document.getElementById('sc-address-ru').value.trim() || null,
        coordinates: document.getElementById('sc-coordinates').value.trim() || null,
        workHours: document.getElementById('sc-work-hours').value.trim() || null,
        phone: document.getElementById('sc-phone1').value.trim() || null,
        phone2: document.getElementById('sc-phone2').value.trim() || null,
        phone3: document.getElementById('sc-phone3').value.trim() || null,
        instagram: cleanSocialNick(document.getElementById('sc-instagram').value) || null,
        telegram: cleanSocialNick(document.getElementById('sc-telegram').value) || null,
        facebook: cleanSocialNick(document.getElementById('sc-facebook').value) || null,
      };

      if (next.coordinates && !/^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/.test(next.coordinates)) {
        return alert(tr("Kordinatani '41.217408,69.211225' ko'rinishida yozing.", "Введите координаты в формате '41.217408,69.211225'."));
      }

      const old = { ...shopContact };
      shopContact = { ...next, startMessage: shopContact.startMessage };
      activePopupModal = null;
      render(); // optimistic UI — darhol ko'rinadi
      try {
        await callApi('set_shop_contact', next);
      } catch (e) {
        console.error(e);
        shopContact = old;
        render();
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
      imageIO.logStage('FILE_SELECTED', { mime: file.type, size: file.size });
      try { validatePickedImageFile(file); }
      catch (e) {
        event.target.value = '';
        return alert(pickedImageErrorMessage(e, file));
      }

      // 5.3 root cause (hamon amal qiladi): bu picker render()ni chaqirishdan
      // OLDIN mustaqil nusxa tayyorlaydi — render() <input type=file>ni
      // DOM'dan qayta yaratishi mumkin, shu orada Telegram WebView native File
      // handle'ni yaroqsiz qilib qo'yardi. V2: captureAndPrepareImageV2
      // FileReader/ArrayBuffer orqali oldindan o'qishga hojatsiz — to'g'ridan-
      // to'g'ri createImageBitmap(file) orqali xavfsiz dekodlaydi.
      const old = shopLogoUrl;
      let prepared;
      try {
        prepared = await captureAndPrepareImageV2(file, TARGET_PRODUCT_IMAGE_BYTES, 1000, 0.8);
      } catch (e) {
        console.error('[logo:READ_ORIGINAL_FAILED]', e);
        event.target.value = '';
        return alert(tr("Logotip faylini o'qib bo'lmadi. Qaytadan tanlab ko'ring.", "Не удалось прочитать файл логотипа. Попробуйте выбрать заново."));
      }

      const localPreview = URL.createObjectURL(prepared);
      shopLogoUrl = localPreview;
      render(); // darhol preview
      try {
        const url = await uploadImageSnapshot({ file: prepared, preparing: Promise.resolve(prepared), url: null }, old, true);
        await callApi('set_shop_logo', { logoUrl: url });
        shopLogoUrl = url;
        render();
      } catch (e) {
        console.error(e);
        shopLogoUrl = old;
        render();
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
      const old = shopLogoUrl;
      activePopupModal = null;
      shopLogoUrl = validUrl;
      render();
      showActionToast(tr("⏳ Logotip saqlanmoqda...", "⏳ Логотип сохраняется..."), 'saving');
      try {
        await callApi('set_shop_logo', { logoUrl: validUrl });
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
        if (billzBrowsePageSize === 'ALL') {
          // "Barchasi" — bitta so'rovda emas (Billz'ning o'zi bitta so'rovda
          // qaytaradigan eng katta hajmi 100), balki 100 tadan qilib bir necha
          // sahifani ketma-ket so'rab, natijalarni birlashtiramiz. 200 sahifa
          // (20 000 tovar) — cheksiz tsiklga qarshi xavfsizlik chegarasi.
          let all = [];
          let total = Infinity;
          let page = 1;
          while (all.length < total && page <= 200) {
            const result = await callApi('billz_browse_products', {
              billzCategoryId: billzBrowseSelectedCatId || undefined,
              search: billzBrowseSearch || undefined,
              page, limit: 100,
            });
            const items = result.items || [];
            total = result.count || 0;
            all = all.concat(items);
            if (!items.length) break;
            page++;
          }
          billzBrowseItems = all;
          billzBrowseCount = total;
          billzBrowsePage = 1;
        } else {
          const result = await callApi('billz_browse_products', {
            billzCategoryId: billzBrowseSelectedCatId || undefined,
            search: billzBrowseSearch || undefined,
            page: targetPage,
            limit: billzBrowsePageSize,
          });
          billzBrowseItems = result.items || [];
          billzBrowseCount = result.count || 0;
          billzBrowsePage = targetPage;
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
        <label class="fc-card flex items-center gap-3 cursor-pointer">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleBillzItemSelected('${escapeHtml(item.billzProductId)}')">
          <div class="flex-1 min-w-0">
            <p class="font-bold text-xs truncate">${escapeHtml(item.name)}</p>
            <p class="text-[10px] text-gray-500">${money(item.price)} · ${tr('Qoldiq', 'Остаток')}: ${totalStock}${item.isVariative ? ` (${(item.variants || []).length} ${tr('variant', 'вариант')})` : ''}</p>
          </div>
        </label>
      `;
    }
    function renderBillzPage(container) {
      const tabsBar = `
        <div class="flex gap-2">
          <button onclick="setBillzSubTab('IMPORT')" class="flex-1 py-2 rounded-xl text-xs font-bold ${billzSubTab === 'IMPORT' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${tr('Import', 'Импорт')}</button>
          <button onclick="setBillzSubTab('IMPORTED')" class="flex-1 py-2 rounded-xl text-xs font-bold ${billzSubTab === 'IMPORTED' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${tr('Import qilinganlar', 'Импортированные')}${billzImportedItems.length ? ` (${billzImportedItems.length})` : ''}</button>
          <button onclick="setBillzSubTab('DELETED')" class="flex-1 py-2 rounded-xl text-xs font-bold ${billzSubTab === 'DELETED' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${tr("O'chirilganlar", "Удалённые")}${billzDeletedItems.length ? ` (${billzDeletedItems.length})` : ''}</button>
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
          <select onchange="setBillzBrowsePageSize(this.value)" class="flex-1 p-1.5 border rounded-lg bg-gray-50 text-xs">
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
          <button onclick="showAllUnimportedBillzItems()" class="w-full py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🆕 ${tr("Hali import qilinmaganlar (hammasi)", "Ещё не импортированные (все)")}</button>
          <select id="billz-browse-cat-select" onchange="setBillzBrowseCategory(this.value)" class="w-full p-2 border rounded-xl bg-gray-50 text-xs">
            <option value="">${tr("Barcha kategoriyalar (Billz)", "Все категории (Billz)")}</option>
            ${(billzBrowseCategories || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === billzBrowseSelectedCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <input id="billz-browse-search-input" type="text" value="${escapeHtml(billzBrowseSearch)}" oninput="handleBillzBrowseSearchDebounced(this.value)" placeholder="${tr('Qidirish...', 'Поиск...')}" class="w-full p-2 border rounded-xl text-xs">
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
      const body = `<div class="space-y-3">${tabsBar}${bodyBySubTab[billzSubTab] || importBody}</div>`;
      renderPageShell(container, '🔳 Billz', body);
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

    function renderModalContainer() {
      const container = document.getElementById('modal-container');
      installModalEscapeHandlers();

      // REGISTRATION MODAL
      if (activePopupModal === 'REGISTRATION') {
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
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
              <div class="pt-2">
                <button onclick="saveRegistrationFromModal()" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr("✅ Saqlash", "✅ Сохранить")}</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (activePopupModal === 'SHOP_INFO') {
        // 6-band: butun forma bir xil "bo'lim-kartochka" naqshiga o'tkazildi
        // (gray-50 fon, rounded-2xl, ichida bir xil space-y-2 oraliq, har bir
        // input bir xil p-2.5/border/rounded-xl/bg-white) — avvalgi versiyada
        // ba'zi maydonlar bevosita tashqi space-y-3'ga, ba'zilari ichki
        // grid gap-2'ga bog'liq edi, shu sabab oraliqlar notekis ko'rinardi.
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2 flex items-center gap-1.5">${ICON_EDIT} ${tr("Do'kon haqida", "О магазине")}</h3>

              <div class="bg-gray-50 rounded-2xl p-3 space-y-2">
                <label class="font-bold text-gray-600 block">${tr("Do'kon nomi", "Название магазина")}</label>
                <input type="text" id="sc-name" value="${escapeHtml(shopContact.name || '')}" placeholder="${tr("Do'kon nomi", "Название магазина")}" class="w-full p-2.5 border rounded-xl bg-white">
                <p class="text-[9px] text-gray-400">${tr("Bo'sh qoldirilsa, standart \"Do'kon\" nomi ishlatiladi.", "Если оставить пустым, используется название \"Магазин\" по умолчанию.")}</p>
              </div>

              <div class="bg-gray-50 rounded-2xl p-3 space-y-2">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-wide">📍 ${tr("Manzil", "Адрес")}</p>
                <div class="space-y-2">
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">${tr("Manzil", "Адрес")}</label>
                    <input type="text" id="sc-address" value="${escapeHtml(shopContact.address || '')}" placeholder="Sergeli tumani, ..." class="w-full p-2.5 border rounded-xl bg-white">
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">${tr("Manzil (ruscha, ixtiyoriy)", "Адрес (по-русски, необязательно)")}</label>
                    <input type="text" id="sc-address-ru" value="${escapeHtml(shopContact.addressRu || '')}" placeholder="Сергелийский район, ..." class="w-full p-2.5 border rounded-xl bg-white">
                    <p class="text-[9px] text-gray-400 mt-1">${tr("Bo'sh qoldirilsa, ruscha rejimda ham o'zbekcha manzil ko'rsatiladi.", "Если оставить пустым, в русском режиме тоже отображается узбекский адрес.")}</p>
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">${tr("Kordinata", "Координаты")}</label>
                    <input type="text" id="sc-coordinates" value="${escapeHtml(shopContact.coordinates || '')}" placeholder="41.217408,69.211225" class="w-full p-2.5 border rounded-xl bg-white font-mono">
                    <p class="text-[9px] text-gray-400 mt-1">${tr("Google Maps'dan koordinatani nusxa qilib qo'ying.", "Вставьте координаты из Google Maps.")}</p>
                  </div>
                </div>
              </div>

              <div class="bg-gray-50 rounded-2xl p-3 space-y-2">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-wide">🕐 ${tr("Ish vaqti", "Часы работы")}</p>
                <input type="text" id="sc-work-hours" value="${escapeHtml(shopContact.workHours || '')}" placeholder="${tr('Masalan: 09:00–22:00 yoki Du–Yak 09:00–22:00','Например: 09:00–22:00 или Пн–Вс 09:00–22:00')}" class="w-full p-2.5 border rounded-xl bg-white">
              </div>

              <div class="bg-gray-50 rounded-2xl p-3 space-y-2">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-wide">📞 ${tr("Aloqa", "Контакты")}</p>
                <div class="space-y-2">
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">${tr("Telefon 1", "Телефон 1")}</label>
                    <input type="text" id="sc-phone1" value="${escapeHtml(shopContact.phone || '')}" placeholder="+998 90 123 45 67" class="w-full p-2.5 border rounded-xl bg-white font-mono">
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">${tr("Telefon 2 (ixtiyoriy)", "Телефон 2 (необязательно)")}</label>
                    <input type="text" id="sc-phone2" value="${escapeHtml(shopContact.phone2 || '')}" placeholder="+998 90 123 45 67" class="w-full p-2.5 border rounded-xl bg-white font-mono">
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">${tr("Telefon 3 (ixtiyoriy)", "Телефон 3 (необязательно)")}</label>
                    <input type="text" id="sc-phone3" value="${escapeHtml(shopContact.phone3 || '')}" placeholder="+998 90 123 45 67" class="w-full p-2.5 border rounded-xl bg-white font-mono">
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">Instagram ${tr("nickname", "никнейм")}</label>
                    <div class="flex items-center rounded-xl border bg-white overflow-hidden">
                      <span class="px-2.5 py-2.5 bg-slate-50 text-gray-500 border-r flex-shrink-0">@</span>
                      <input type="text" id="sc-instagram" value="${escapeHtml(cleanSocialNick(shopContact.instagram))}" placeholder="mystore.uz" class="flex-1 min-w-0 p-2.5">
                    </div>
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">Telegram ${tr("nickname", "никнейм")}</label>
                    <div class="flex items-center rounded-xl border bg-white overflow-hidden">
                      <span class="px-2.5 py-2.5 bg-slate-50 text-gray-500 border-r flex-shrink-0">@</span>
                      <input type="text" id="sc-telegram" value="${escapeHtml(cleanSocialNick(shopContact.telegram))}" placeholder="mystore_uz" class="flex-1 min-w-0 p-2.5">
                    </div>
                  </div>
                  <div>
                    <label class="font-bold text-gray-600 block mb-1">Facebook ${tr("nickname", "никнейм")}</label>
                    <div class="flex items-center rounded-xl border bg-white overflow-hidden">
                      <span class="px-2.5 py-2.5 bg-slate-50 text-gray-500 border-r flex-shrink-0">@</span>
                      <input type="text" id="sc-facebook" value="${escapeHtml(cleanSocialNick(shopContact.facebook))}" placeholder="mystore.uz" class="flex-1 min-w-0 p-2.5">
                    </div>
                  </div>
                </div>
              </div>

              <p class="text-[10px] text-gray-400">${tr("Bo'sh qoldirilgan maydonlar foydalanuvchiga umuman ko'rinmaydi.", "Пустые поля вообще не показываются пользователю.")}</p>
              <div class="flex gap-2 pt-1">
                <button onclick="saveShopContact()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">✅ ${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
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
          <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">🤖 ${tr("Bot /start xabari", "Сообщение бота /start")}</h3>
              <div>
                <label class="font-bold text-gray-600">${tr("Xabar matni", "Текст сообщения")}</label>
                <textarea id="sm-text" rows="8" placeholder="${tr('Standart matn ishlatiladi...', 'Используется стандартный текст...')}" class="w-full mt-1 p-2.5 border rounded-xl font-mono text-[11px]">${escapeHtml(currentStartMessage)}</textarea>
                <p class="text-[9px] text-gray-400 mt-1">${tr("Bo'sh qoldirilsa, standart xabar matni ishlatiladi. HTML teglar (masalan <b>...</b>) qo'llab-quvvatlanadi.", "Если оставить пустым, используется стандартный текст. Поддерживаются HTML-теги (например <b>...</b>).")}</p>
                <button onclick="saveStartMessage()" class="w-full mt-2 bg-blue-600 text-white font-bold py-2.5 rounded-xl">✅ ${tr("Matnni saqlash", "Сохранить текст")}</button>
              </div>
              <div class="border-t pt-3">
                <button onclick="setupBotWebhook()" class="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5">🔗 ${tr("Webhookni ulash", "Подключить webhook")}</button>
                <p class="text-[9px] text-gray-400 mt-1">${tr("Bu tugma faqat botni Supabase'ga ulaydi — bir marta bosish yetarli.", "Эта кнопка только подключает бота к Supabase — достаточно нажать один раз.")}</p>
              </div>
              <button onclick="activePopupModal=null; render();" class="w-full bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
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
                <button id="m-prod-image-button" type="button" onclick="openImagePickerSheet('m-prod-image-input','m-prod-image-input-files')" class="fc-btn fc-btn-secondary w-full mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr("Rasm tanlash", "Выбрать фото")}</button>
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
                  <button id="m-cat-image-button" type="button" onclick="openImagePickerSheet('m-cat-image-input','m-cat-image-input-files')" class="fc-btn fc-btn-secondary"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Rasm tanlash', 'Выбрать фото')}</button>
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
                  <button id="ec-image-button" type="button" onclick="openImagePickerSheet('ec-image-input','ec-image-input-files')" class="fc-btn fc-btn-secondary"><i data-lucide="image-plus" class="w-4 h-4"></i>${(c.img && (c.img.startsWith('http') || c.img.startsWith('data:'))) ? tr('Almashtirish', 'Заменить') : tr('Rasm tanlash', 'Выбрать фото')}</button>
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
                <div><h3 class="font-black text-base">🖼 ${tr('Rasmsiz tovarlar','Товары без фото')}</h3><p class="text-[10px] text-gray-400">${tr('Barcha kataloglar bo‘yicha global navbat','Общая очередь по всем каталогам')}</p></div>
                <button onclick="clearTempImageSelection(); activePopupModal=null; render();" class="bg-gray-100 rounded-xl px-3 py-1.5 font-bold">✕</button>
              </div>
              ${p ? `
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="font-black text-sm text-gray-900">${escapeHtml(productName(p))}</p>
                    <p class="mt-1 text-[10px] text-blue-700 font-bold break-words">📁 ${escapeHtml(categoryPathForProduct(p))}</p>
                    <p class="mt-1 text-[10px] font-mono text-gray-500">SKU: ${escapeHtml(p.sku || '—')}</p>
                  </div>
                  <span class="flex-shrink-0 bg-slate-100 text-slate-700 font-black px-2.5 py-1 rounded-xl">${missingImageQueueIndex + 1} / ${queue.length}</span>
                </div>
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <img id="miq-img-prev" src="" class="hidden w-full h-48 object-contain rounded-xl bg-white">
                  <div id="miq-empty-preview" class="h-32 flex items-center justify-center text-center text-gray-400 font-bold">🖼<br>${tr('Rasm preview','Предпросмотр фото')}</div>
                </div>
                <input id="miq-image-input" type="file" accept="image/*" onchange="document.getElementById('miq-empty-preview')?.classList.add('hidden'); onImagePicked(event, 'miq-img-prev', 'miq-image-button', 'miq-image-url', 'miq-image-url-error')" class="hidden">
                <input id="miq-image-input-files" type="file" onchange="document.getElementById('miq-empty-preview')?.classList.add('hidden'); onImagePicked(event, 'miq-img-prev', 'miq-image-button', 'miq-image-url', 'miq-image-url-error')" class="hidden">
                <button id="miq-image-button" type="button" onclick="openImagePickerSheet('miq-image-input','miq-image-input-files')" class="fc-btn fc-btn-secondary w-full"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Rasm tanlash','Выбрать фото')}</button>
                <input id="miq-image-url" type="url" inputmode="url" oninput="document.getElementById('miq-empty-preview')?.classList.toggle('hidden', !!this.value.trim()); onImageUrlInput(this.value, 'miq-img-prev', 'miq-image-url-error', 'miq-image-button')" placeholder="${tr('Rasm URL (ixtiyoriy)','URL изображения (необязательно)')}" class="w-full p-2.5 border rounded-xl">
                <p id="miq-image-url-error" class="hidden text-[10px] fc-text-danger"></p>
                <button onclick="saveMissingImageQueueItem('${p.id}')" ${missingImageQueueSaving ? 'disabled' : ''} class="w-full ${missingImageQueueSaving ? 'bg-gray-300 text-gray-500' : 'bg-emerald-600 text-white'} font-black py-3 rounded-xl">${missingImageQueueSaving ? tr('⏳ Saqlanmoqda…','⏳ Сохранение…') : tr('✅ Saqlash','✅ Сохранить')}</button>
                <div class="grid grid-cols-2 gap-2 sticky bottom-0 bg-white pt-2">
                  <button onclick="moveMissingImageQueue(-1)" ${missingImageQueueSaving || missingImageQueueIndex === 0 ? 'disabled' : ''} class="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl disabled:opacity-40">⬅️ ${tr('Oldingi','Предыдущий')}</button>
                  <button onclick="moveMissingImageQueue(1)" ${missingImageQueueSaving || missingImageQueueIndex >= queue.length - 1 ? 'disabled' : ''} class="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl disabled:opacity-40">${tr('Keyingi','Следующий')} ➡️</button>
                </div>
              ` : `
                <div class="py-10 text-center space-y-3"><div class="text-5xl">✅</div><p class="font-black text-emerald-700">${tr('Rasmsiz tovar qolmadi.','Товаров без фото не осталось.')}</p><button onclick="clearTempImageSelection(); activePopupModal=null; render();" class="bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl">${tr('Yopish','Закрыть')}</button></div>
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

      // 2.3: tovarni boshqa katalogga ko'chirish.
      if (activePopupModal === 'MOVE_PRODUCT_CATEGORY') {
        const flatCats = categories.slice().sort((a, b) => categoryName(a).localeCompare(categoryName(b)));
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("Katalogni o'zgartirish", "Изменить каталог")}</h3>
              <select id="move-product-target" onchange="moveTargetCategoryId=this.value" class="w-full p-2.5 border rounded-xl bg-gray-50">
                <option value="">${tr("— Katalogsiz —", "— Без каталога —")}</option>
                ${flatCats.map(c => `<option value="${c.id}">${escapeHtml(categoryName(c))}</option>`).join('')}
              </select>
              <div class="flex gap-2 pt-2">
                <button onclick="saveMoveProduct()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">✅ ${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>`;
        return;
      }

      // 2.2: katalogni boshqa katalog ichiga ko'chirish (o'ziga/o'z ichki
      // kataloglariga ko'chirish variantlari ro'yxatdan chiqarib tashlanadi;
      // server baribir mustaqil tekshiradi).
      if (activePopupModal === 'MOVE_CATEGORY') {
        const forbidden = categoryDescendantIds(moveCategoryId);
        const validTargets = categories.filter(c => !forbidden.has(String(c.id))).sort((a, b) => categoryName(a).localeCompare(categoryName(b)));
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("Katalogni ko'chirish", "Переместить каталог")}</h3>
              <select id="move-category-target" onchange="moveCategoryTargetId=this.value" class="w-full p-2.5 border rounded-xl bg-gray-50">
                <option value="">${tr("— Bosh katalog (root) —", "— Корневой каталог —")}</option>
                ${validTargets.map(c => `<option value="${c.id}">${escapeHtml(categoryName(c))}</option>`).join('')}
              </select>
              <div class="flex gap-2 pt-2">
                <button onclick="saveMoveCategory()" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl">✅ ${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
              </div>
            </div>
          </div>`;
        return;
      }

      // 2.8: narx tarixi.
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
        const selectedCount = bulkSelectedProductIds.size;
        const options = categories.filter(c => !c.deletedAt).map(c => `<option value="${escapeHtml(c.id)}" ${String(bulkMoveTargetCategoryId)===String(c.id)?'selected':''}>${escapeHtml(categoryName(c))}</option>`).join('');
        container.innerHTML = `<div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null; render();"><div class="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[90dvh] flex flex-col overflow-hidden" onclick="event.stopPropagation()"><div class="p-4 border-b flex justify-between items-center"><h3 class="font-bold">📁 ${tr('Tovarlarni ko‘chirish','Перемещение товаров')}</h3><button onclick="activePopupModal=null; render();" class="bg-gray-100 px-3 py-1.5 rounded-xl font-bold">✕</button></div><div class="p-4 overflow-y-auto space-y-3"><p class="text-xs text-gray-500">${selectedCount} ${tr('ta tovar tanlandi','товаров выбрано')}</p><select onchange="bulkMoveTargetCategoryId=this.value" class="w-full border rounded-xl p-2.5"><option value="">${tr('Bosh katalog','Главный каталог')}</option>${options}</select><button onclick="saveBulkMoveProducts()" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl">${tr('Ko‘chirish','Переместить')}</button></div></div></div>`;
        return;
      }

      // POLISH ROUND 1-bosqich: Dashboard endi modal emas — renderDashboardPage()
      // (activePage='DASHBOARD') ga ko'chirildi, sezilarli kengaytirilgan.

      // 2.5: Chiqindi (24 soatlik trash) ko'rinishi.
      if (activePopupModal === 'TRASH') {
        const batches = trashBatches || [];
        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="activePopupModal=null; render();">
            <div class="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[90dvh] flex flex-col shadow-2xl text-xs overflow-hidden" onclick="event.stopPropagation()">
              <div class="sticky top-0 z-10 bg-white flex items-center justify-between border-b p-4">
                <h3 class="font-bold text-sm text-gray-900 flex items-center gap-1.5">${ICON_TRASH} ${tr("Chiqindi", "Корзина")}</h3>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 px-3 py-1.5 rounded-xl font-bold">✕</button>
              </div>
              <div class="overflow-y-auto p-4 space-y-3"><p class="text-[10px] text-gray-400">${tr("O'chirilgan kataloglar/tovarlar shu yerda 24 soat turadi, keyin butunlay o'chadi.", "Удалённые каталоги/товары хранятся здесь 24 часа, затем удаляются навсегда.")}</p>
              ${trashBatches === null ? `<p class="text-center text-gray-400 py-6">${tr('Yuklanmoqda...', 'Загрузка...')}</p>`
                : batches.length === 0 ? `<div class="fc-empty-state"><i data-lucide="trash-2" class="w-8 h-8"></i><p>${tr("Chiqindi bo'sh.", 'Корзина пуста.')}</p></div>`
                : `<div class="space-y-2">${batches.map(b => renderTrashBatchHtml(b)).join('')}</div>`}
              </div>
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
          <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-xs">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("👑 Yangi admin qo'shish", "👑 Добавить администратора")}</h3>
              <div>
                <label class="font-bold text-gray-600">${tr("Telegram ID raqami *", "Telegram ID *")}</label>
                <input type="number" id="m-admin-id" placeholder="Masalan: 123456789" class="w-full mt-1 p-2 border rounded-xl font-mono">
              </div>
              <div class="flex space-x-2 pt-2">
                <button onclick="saveAdminFromModal()" class="flex-1 bg-amber-600 text-white font-bold py-2.5 rounded-xl">${tr("Saqlash", "Сохранить")}</button>
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Yopish", "Закрыть")}</button>
              </div>
            </div>
          </div>
        `;
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
                <button id="ef-image-button" type="button" onclick="openImagePickerSheet('ef-image-input','ef-image-input-files')" class="fc-btn fc-btn-secondary w-full mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${hasProductImage(p) ? tr("Almashtirish", "Заменить") : tr("Rasm tanlash", "Выбрать фото")}</button>
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
                <button type="button" onclick="openImagePickerSheet('shop-logo-input','shop-logo-input-files')" class="fc-btn fc-btn-primary"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Rasm tanlash', 'Выбрать фото')}</button>
                <button onclick="activePopupModal='SHOP_LOGO_URL'; render();" class="fc-btn fc-btn-secondary"><i data-lucide="link" class="w-4 h-4"></i>${tr('URL orqali', 'По URL')}</button>
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
                <button onclick="activePopupModal=null; render();" class="bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl">${tr("Bekor qilish", "Отмена")}</button>
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

      // CHECKOUT FORM MODAL (savatchadan "Buyurtma berish" bosilganda ochiladi)
      if (activePopupModal === 'CHECKOUT_FORM') {
        const items = Object.entries(cart).map(([key, itemData]) => {
          const productId = cartEntryProductId(key, itemData);
          const p = products.find(prod => prod.id === productId);
          return p ? { ...p, key, qty: itemData.qty, size: itemData.size || null, color: itemData.color || null } : null;
        }).filter(Boolean);

        container.innerHTML = `
          <div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="closeCheckoutForm();">
            <div class="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-2xl text-xs" onclick="event.stopPropagation()">
              <h3 class="font-bold text-sm text-gray-900 border-b pb-2">${tr("📍 Buyurtmani rasmiylashtirish", "📍 Оформление заказа")}</h3>

              <div>
                <label class="text-xs font-bold text-gray-600">${tr("Ism va familiyangiz *", "Имя и фамилия *")}</label>
                <input type="text" id="chk-fullname" oninput="saveCheckoutDraft()" placeholder="Ali Valiyev" class="w-full mt-1 p-2.5 border rounded-xl text-xs">
              </div>

              <div>
                <label class="text-xs font-bold text-gray-600">${tr("Telefon raqamingiz *", "Номер телефона *")}</label>
                <input type="text" id="chk-phone" oninput="saveCheckoutDraft()" placeholder="+998 90 123 45 67" class="w-full mt-1 p-2.5 border rounded-xl text-xs font-mono">
              </div>

              <div>
                <label class="text-xs font-bold text-gray-600">${tr("Hududni tanlang *", "Выберите регион *")}</label>
                <select id="chk-region-key" onchange="handleRegionChange()" class="w-full mt-1 p-2.5 border rounded-xl text-xs bg-gray-50 font-bold">
                  ${TOP_LEVEL_REGIONS.map(region => `<option value="${escapeHtml(region.id)}">${escapeHtml(uiLang === 'ru' ? region.nameRu : region.nameUz)}</option>`).join('')}
                </select>
              </div>

              <div id="chk-district-field">
                <label class="text-xs font-bold text-gray-600">${tr("Tumanni tanlang *", "Выберите район *")}</label>
                <select id="chk-district" onchange="handleDistrictChange()" class="w-full mt-1 p-2.5 border rounded-xl text-xs bg-gray-50 font-bold">
                  <option value="">${tr("— Tanlang —", "— Выберите —")}</option>
                </select>
              </div>

              <!-- 19-band: Yetkazib berish usuli endi Viloyat/Tuman'dan KEYIN,
                   Manzil/Filial'dan OLDIN chiqadi (to'g'ri tartib: Viloyat →
                   Tuman/Shahar → Usul → Filial). 2-band: #chk-district endi
                   BARCHA usullar uchun bitta umumiy maydon — renderCheckoutOptions
                   uni yashirmaydi, faqat manzil/filial maydonlari almashadi. -->
              <div>
                <label class="text-xs font-bold text-gray-600">${tr("Yetkazib berish usuli *", "Способ доставки *")}</label>
                <div id="delivery-method-wrap" class="grid grid-cols-2 gap-2 mt-1"></div>
              </div>

              <div id="delivery-notice" class="hidden bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-[11px] text-amber-900"></div>

              <div id="chk-address-field">
                <label id="chk-address-label" class="text-xs font-bold text-gray-600">${tr("Manzil *", "Адрес *")}</label>
                <input type="text" id="chk-address" oninput="saveCheckoutDraft()" placeholder="${tr("Ko'cha, mahalla va uy raqami",'Улица, махалля и номер дома')}" class="w-full mt-1 p-2.5 border rounded-xl text-xs">
              </div>

              <div id="chk-branch-wrap" class="hidden space-y-2">
                <label class="text-xs font-bold text-gray-600">${tr("Filialni tanlang *", "Выберите филиал *")}</label>
                <input type="text" id="chk-branch-search" oninput="filterBranchList(this.value)" placeholder="${tr('Filial yoki tuman nomi bilan qidirish', 'Поиск по названию филиала или района')}" class="w-full p-2.5 border rounded-xl text-xs">
                <div id="chk-branch-list" class="max-h-56 overflow-y-auto border rounded-xl divide-y text-xs"></div>
                <div id="chk-branch-selected" class="hidden bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs"></div>
              </div>

              <div>
                <label class="text-xs font-bold text-gray-600">${tr("To'lov turi *", "Способ оплаты *")}</label>
                <div id="pay-method-wrap" class="grid grid-cols-2 gap-2 mt-1"></div>
              </div>

              <div id="card-payment-details" class="hidden space-y-2"></div>

              <div class="border-t pt-3 space-y-1.5">
                <div class="flex justify-between"><span>${tr('Tovarlar summasi', 'Сумма товаров')}:</span><b id="checkout-subtotal"></b></div>
                <div class="flex justify-between"><span>${tr('Yetkazib berish', 'Доставка')}:</span><b id="checkout-delivery-fee"></b></div>
                <div class="flex justify-between items-center text-base font-black"><span>${tr("Hozir to'lanadigan jami", 'Итого к оплате сейчас')}:</span><span id="checkout-payable-total" class="text-green-600"></span></div>
              </div>

              <button onclick="submitOrder()" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">
                ✅ ${tr('Rasmiylashtirish', 'Оформить')}
              </button>
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
          const catBase = products.filter(p => p.categoryId === adminCatParentId && p.status !== 'DELETED');
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
                  )) : `<button disabled class="w-full bg-gray-100 text-gray-400 font-bold py-3 rounded-2xl text-sm">${tr("❌ Mahsulot tugagan", "❌ Товар закончился")}</button>`}
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
                  <button type="button" onclick="openImagePickerSheet('resubmit-receipt-input','resubmit-receipt-input-files')" class="fc-btn fc-btn-primary mt-1"><i data-lucide="image-plus" class="w-4 h-4"></i>${tr('Chekni tanlash', 'Выбрать чек')}</button>
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
              <div class="border-b pb-2 flex items-center justify-between gap-2">
                <h3 class="font-black text-sm text-blue-600">${tr("Buyurtma", "Заказ")} #${o.id}</h3>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColorClass(orderDisplayStatus(o))}">${statusLabel(orderDisplayStatus(o))}</span>
              </div>

              <div class="space-y-1">
                <p>👤 <b>${tr("Mijoz:", "Клиент:")}</b> ${escapeHtml(o.user)}</p>
                <p>📞 <b>${tr("Tel:", "Тел:")}</b> ${escapeHtml(o.phone)}</p>
                <p>📍 <b>${tr("Hudud:", "Регион:")}</b> ${escapeHtml(o.delivery?.regionLabel || regionLabel(o.region))} (${escapeHtml(districtLabelForUi(o.district))})</p>
                <p>🏠 <b>${tr("Manzil:", "Адрес:")}</b> ${escapeHtml(o.address)}</p>
                <p>🚚 <b>${tr("Yetkazib berish:", "Доставка:")}</b> ${escapeHtml(deliverySnapshotLabel(o))}</p>
                <p>💳 <b>${tr("To'lov:", "Оплата:")}</b> ${escapeHtml(o.payment?.label || payMethodLabel(o.payMethod))}</p>
                <p>📅 <b>${tr("Sana:", "Дата:")}</b> ${escapeHtml(o.date)}</p>
              </div>

              <div class="border-t pt-2 space-y-1.5">
                <b>${tr("📦 Tovar:", "📦 Товары:")}</b>
                ${o.items.map(i => `
                  <div class="flex items-center gap-2">
                    ${i.img ? `<img src="${escapeHtml(i.img)}" onerror="this.style.display='none'" class="w-7 h-7 object-cover rounded-lg flex-shrink-0" loading="lazy">` : ''}
                    <p>• ${escapeHtml(orderItemName(i))} ${i.size ? `<span class="text-gray-500 font-mono">[${escapeHtml(i.size)}]</span>` : ''} ${i.color ? `<span class="text-gray-500">[${escapeHtml(i.color)}]</span>` : ''} ${(i.sku && isAdminMode && isUserAnAdmin) ? `<span class="text-gray-400 font-mono">(ID: ${escapeHtml(i.sku)})</span>` : ''} x ${i.qty} = ${money(i.price * i.qty)}</p>
                  </div>
                `).join('')}
              </div>

              <div class="border-t pt-2 space-y-1">
                <div class="flex justify-between"><span>${tr('Tovarlar summasi','Сумма товаров')}:</span><b>${money(o.subtotal ?? o.totalPrice)}</b></div>
                <div class="flex justify-between"><span>${tr('Yetkazib berish','Доставка')}:</span><b>${(o.delivery?.kind === 'TAXI' || (o.delivery?.kind === 'POST' && o.delivery?.payer === 'CUSTOMER')) ? tr("Mijoz to'laydi", 'Оплачивает клиент') : (Number(o.deliveryFee) > 0 ? money(o.deliveryFee) : money(0))}</b></div>
                <div class="flex justify-between font-black text-sm"><span>${tr("Hozir to'lanadigan jami",'Итого к оплате сейчас')}:</span><span class="text-green-600">${money(o.payableTotal ?? o.totalPrice)}</span></div>
              </div>

              ${!isAdminMode ? `<button onclick="reorderFromOrder(${o.id})" class="fc-btn fc-btn-secondary w-full"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>${tr('Qayta buyurtma', 'Повторить заказ')}</button>` : ''}

              ${o.delivery?.warning ? `<div class="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-[11px] text-amber-900">ℹ️ ${escapeHtml(o.delivery.warning)}</div>` : ''}
              ${o.delivery?.comment ? `<div class="bg-blue-50 border border-blue-200 p-2.5 rounded-xl text-[11px] text-blue-900">💬 ${escapeHtml(o.delivery.comment)}</div>` : ''}

              <div class="bg-slate-50 border rounded-xl p-2.5 space-y-1">
                <p class="font-bold">🚚 ${tr('Jo‘natma holati','Статус отправления')}: ${escapeHtml(effectiveShipmentStatusLabel(o))}</p>
                ${o.shipment?.kind === 'TAXI' && o.shipment?.carNumber ? `<p>${tr('Mashina','Машина')}: <b>${escapeHtml(o.shipment.carNumber)}</b></p><p>${tr('Haydovchi','Водитель')}: ${escapeHtml(o.shipment.driverPhone || '')}${o.shipment.driverName ? ` · ${escapeHtml(o.shipment.driverName)}` : ''}</p>` : ''}
                ${o.shipment?.kind === 'POST' && o.shipment?.trackingNumber ? `<p>${tr("Jo'natma raqami",'Трек-номер')}: <b>${escapeHtml(o.shipment.trackingNumber)}</b></p>${o.shipment.originBranch ? `<p>${tr('Yuborilgan filial','Филиал отправки')}: ${escapeHtml(o.shipment.originBranch)}</p>` : ''}` : ''}
              </div>

              ${(isAdminMode && isUserAnAdmin && o.hasReceipt) ? `<button onclick="openOrderReceipt(${o.id})" class="w-full bg-blue-50 text-blue-700 border border-blue-200 py-2 rounded-xl font-bold">🧾 ${tr("To'lov chekini ochish", 'Открыть чек оплаты')}</button>` : ''}
              ${(isAdminMode && isUserAnAdmin && o.receiptSentToTelegram && botUsername) ? `<button onclick="openReceiptInTelegram()" class="w-full bg-sky-50 text-sky-700 border border-sky-200 py-2 rounded-xl font-bold">✈️ ${tr("Telegramda ko'rish", 'Смотреть в Telegram')}</button>` : ''}
              ${(isAdminMode && isUserAnAdmin && o.hasReceipt && o.status !== 'CANCELLED' && (o.receiptReviewStatus || 'PENDING') === 'PENDING') ? `
                <div class="grid grid-cols-2 gap-2">
                  <button onclick="approvePaymentReceipt(${o.id})" class="bg-emerald-600 text-white font-bold py-2 rounded-xl text-[11px]">✅ ${tr('Tasdiqlash', 'Подтвердить')}</button>
                  <button onclick="openRejectReceiptModal(${o.id})" class="fc-bg-danger text-white font-bold py-2 rounded-xl text-[11px]">❌ ${tr('Rad etish', 'Отклонить')}</button>
                </div>
              ` : ''}

              ${(isAdminMode && isUserAnAdmin && o.delivery?.kind === 'TAXI' && o.status !== 'CANCELLED') ? `
                <div class="border-t pt-2 space-y-2">
                  <p class="font-black">🚕 ${tr('Taksi ma’lumoti','Данные такси')}</p>
                  <input id="shipment-car" value="${escapeHtml(o.shipment?.carNumber || '')}" placeholder="01 A 123 BC" class="w-full p-2 border rounded-xl uppercase">
                  <input id="shipment-phone" value="${escapeHtml(o.shipment?.driverPhone || '')}" placeholder="+998 90 123 45 67" class="w-full p-2 border rounded-xl font-mono">
                  <input id="shipment-driver" value="${escapeHtml(o.shipment?.driverName || '')}" placeholder="${tr('Haydovchi ismi (ixtiyoriy)','Имя водителя (необязательно)')}" class="w-full p-2 border rounded-xl">
                  <select id="shipment-status" class="w-full p-2 border rounded-xl bg-gray-50">${o.shipment?.status === 'READY' || !o.shipment?.status ? `<option value="READY" selected disabled hidden>${tr('— Hali harakat qilinmagan —','— Действие ещё не выполнено —')}</option>` : ''}<option value="TAXI_ASSIGNED" ${o.shipment?.status === 'TAXI_ASSIGNED' ? 'selected' : ''}>${tr('Taksi biriktirildi','Такси назначено')}</option><option value="IN_TRANSIT" ${o.shipment?.status === 'IN_TRANSIT' ? 'selected' : ''}>${tr("Yo'lga chiqdi",'В пути')}</option><option value="DELIVERED" ${o.shipment?.status === 'DELIVERED' ? 'selected' : ''}>${tr('Yetkazildi','Доставлено')}</option></select>
                  <button onclick="saveShipmentForOrder(${o.id})" class="w-full bg-slate-800 text-white py-2.5 rounded-xl font-bold">💾 ${tr('Jo‘natmani saqlash','Сохранить отправление')}</button>
                </div>` : ''}

              ${(isAdminMode && isUserAnAdmin && o.delivery?.kind === 'POST' && o.status !== 'CANCELLED') ? `
                <div class="border-t pt-2 space-y-2">
                  <p class="font-black">📦 ${escapeHtml(o.delivery.providerName || tr('Pochta','Почта'))}</p>
                  ${o.delivery.branchName ? `<p class="text-[11px] text-gray-600">${tr('Mijoz tanlagan filial','Филиал, выбранный клиентом')}: <b>${escapeHtml(o.delivery.branchName)}</b></p>` : ''}
                  <input id="shipment-tracking" value="${escapeHtml(o.shipment?.trackingNumber || '')}" placeholder="${tr("Tracking/jo'natma raqami",'Трек-номер')}" class="w-full p-2 border rounded-xl font-mono">
                  <select id="shipment-status" class="w-full p-2 border rounded-xl bg-gray-50">${o.shipment?.status === 'READY' || !o.shipment?.status ? `<option value="READY" selected disabled hidden>${tr('— Hali harakat qilinmagan —','— Действие ещё не выполнено —')}</option>` : ''}<option value="HANDED_TO_CARRIER" ${o.shipment?.status === 'HANDED_TO_CARRIER' ? 'selected' : ''}>${tr('Pochtaga topshirildi','Передано почте')}</option></select>
                  <button onclick="saveShipmentForOrder(${o.id})" class="w-full bg-slate-800 text-white py-2.5 rounded-xl font-bold">💾 ${tr('Jo‘natmani saqlash','Сохранить отправление')}</button>
                </div>` : ''}

              ${o.status === 'CANCELLED' && o.cancelReason ? `
                <div class="fc-bg-danger-soft border fc-border-danger p-2.5 rounded-xl text-[11px] fc-text-danger">
                  ❌ Bekor qilindi (${o.cancelledBy === 'ADMIN' ? "do'kon tomonidan" : 'mijoz tomonidan'}): ${escapeHtml(o.cancelReason)}
                </div>
              ` : ''}

              ${o.receiptReviewStatus === 'REJECTED' ? `
                <div class="fc-bg-danger-soft border fc-border-danger p-2.5 rounded-xl text-[11px] fc-text-danger space-y-2">
                  <p>❌ ${tr('Chek rad etildi', 'Чек отклонён')}${o.receiptRejectReason ? `: ${escapeHtml(o.receiptRejectReason)}` : ''}</p>
                  ${!isAdminMode ? `
                    <div class="flex gap-2">
                      <button onclick="openResubmitReceiptModal(${o.id})" class="flex-1 bg-blue-600 text-white font-bold py-2 rounded-xl text-[11px]">📎 ${tr('Yangi chek yuborish', 'Отправить новый чек')}</button>
                      <button onclick="openSupportModal(${o.id})" class="flex-1 bg-white border fc-border-danger fc-text-danger font-bold py-2 rounded-xl text-[11px]">💬 ${tr("Qo'llab-quvvatlash", 'Поддержка')}</button>
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              ${(isAdminMode && isUserAnAdmin && !['DELIVERED','CANCELLED'].includes(o.status)) ? `
                <div class="border-t pt-2 space-y-2">
                  <label class="font-bold text-gray-700">${tr("Tezkor status o'zgartirish:", "Быстро изменить статус:")}</label>
                  <div class="grid grid-cols-2 gap-2">
                    ${o.status === 'NEW' ? `<button onclick="updateOrderStatus(${o.id}, 'PROCESSING')" class="bg-blue-600 text-white font-bold py-2 rounded-xl text-[11px]">${tr("⏳ Jarayonda", "⏳ В обработке")}</button>` : ''}
                    <button onclick="updateOrderStatus(${o.id}, 'DELIVERED')" class="bg-green-600 text-white font-bold py-2 rounded-xl text-[11px] ${o.status === 'PROCESSING' ? 'col-span-2' : ''}">${tr("✅ Yetkazib berilgan", "✅ Доставлен")}</button>
                    <button onclick="updateOrderStatus(${o.id}, 'CANCELLED')" class="fc-bg-danger text-white font-bold py-2 rounded-xl text-[11px] col-span-2">❌ ${tr("Bekor qilish", "Отмена")}</button>
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
      if (delivery.kind === 'FIXED') return tr('Pullik uyigacha', 'Платная доставка до дома');
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

      // UI darhol yangilanadi; profil serverda ham saqlanadi va boshqa qurilmada tiklanadi.
      const old = registeredUser ? { ...registeredUser } : null;
      registeredUser = { firstName: fn, lastName: ln, phone: ph };
      localStorage.setItem(scopedKey('registeredUser'), JSON.stringify(registeredUser));
      currentUser.firstName = fn; currentUser.lastName = ln; currentUser.phone = ph;
      activePopupModal = null; render();
      try {
        await callApi('update_profile', { firstName: fn, lastName: ln, phone: ph });
        alert(uiLang === 'ru' ? '✅ Данные сохранены.' : "✅ Ma'lumotlar saqlandi!");
      } catch (e) {
        console.error(e);
        if (old) { registeredUser = old; localStorage.setItem(scopedKey('registeredUser'), JSON.stringify(old)); }
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
    function ensureScript(src) {
      return new Promise((resolve, reject) => {
        const old = document.querySelector(`script[data-src="${src}"]`);
        if (old) { if (old.dataset.loaded === '1') return resolve(); old.addEventListener('load', resolve, { once:true }); return; }
        const sc = document.createElement('script'); sc.src = src; sc.dataset.src = src; sc.async = true;
        sc.onload = () => { sc.dataset.loaded = '1'; resolve(); }; sc.onerror = reject; document.head.appendChild(sc);
      });
    }
    async function openExcelImportModal() {
      if (!isUserAnAdmin) return;
      try {
        if (!excelModulePromise) excelModulePromise = ensureScript('./excel-import.js?v=7');
        await excelModulePromise;
        if (!window.UstoreExcel) throw new Error('Excel moduli topilmadi');
        activePopupModal = 'EXCEL_IMPORT';
        await window.UstoreExcel.prepare?.();
        render();
      } catch (e) {
        console.error(e);
        alert(tr("❌ Excel modulini yuklab bo'lmadi: ", "❌ Не удалось загрузить модуль Excel: ") + (e.message || e));
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
      moveProductId = productId;
      moveTargetCategoryId = '';
      activePopupModal = 'MOVE_PRODUCT_CATEGORY';
      render();
    }
    async function saveMoveProduct() {
      const newCategoryId = moveTargetCategoryId || null;
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
      moveCategoryId = categoryId;
      moveCategoryTargetId = '';
      activePopupModal = 'MOVE_CATEGORY';
      render();
    }
    async function saveMoveCategory() {
      const newParentId = moveCategoryTargetId || null;
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
      bulkMoveTargetCategoryId = '';
      activePopupModal = 'BULK_MOVE_PRODUCTS';
      render();
    }
    async function saveBulkMoveProducts() {
      const ids = [...bulkSelectedProductIds];
      if (!ids.length) return;
      showActionToast(tr('⏳ Ko‘chirilmoqda...','⏳ Перемещение...'), 'saving');
      try {
        const result = await callApi('bulk_move_products', { productIds: ids, categoryId: bulkMoveTargetCategoryId || null });
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
        if (trashBatches) trashBatches = trashBatches.filter(b => Number(b.id) !== Number(batchId));
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
    function renderTrashBatchHtml(b) {
      if (b.kind !== 'PRODUCT') {
        return `
          <div class="border rounded-xl p-2.5 space-y-1">
            <p class="font-bold">📁 ${escapeHtml(b.rootCategoryName || ('#' + b.id))}</p>
            <p class="text-[10px] text-gray-500">${b.categoryCount ? `${b.categoryCount} ${tr('katalog', 'кат.')} · ` : ''}${b.productCount} ${tr('tovar', 'тов.')}</p>
            <p class="text-[10px] text-gray-400">${tr("Muddati", "Истекает")}: ${new Date(b.expiresAt).toLocaleString()}</p>
            <div class="grid grid-cols-2 gap-1.5">
              <button onclick="restoreTrashBatch(${b.id})" class="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold py-1.5 rounded-lg">${tr("♻️ Tiklash", "♻️ Восстановить")}</button>
              <button onclick="purgeTrashBatchNow(${b.id})" class="fc-bg-danger-soft fc-text-danger border fc-border-danger font-bold py-1.5 rounded-lg flex items-center justify-center gap-1">${ICON_TRASH} ${tr("Butunlay", "Навсегда")}</button>
            </div>
          </div>
        `;
      }

      const items = b.productItems || [];
      const selecting = !!trashSelectMode[b.id];
      const selectedSet = trashSelectedProductIds[b.id] || new Set();
      const selectedCount = selectedSet.size;

      return `
        <div class="border rounded-xl p-2.5 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold truncate">📦 ${escapeHtml((b.productNames || [])[0] || ('#' + b.id))}${items.length > 1 ? ` +${items.length - 1}` : ''}</p>
              <p class="text-[10px] text-gray-500">${items.length} ${tr('tovar', 'тов.')} · ${tr("Muddati", "Истекает")}: ${new Date(b.expiresAt).toLocaleString()}</p>
            </div>
            <button onclick="toggleTrashSelectMode(${b.id})" class="fc-badge ${selecting ? 'fc-badge-primary' : 'fc-badge-muted'} shrink-0">${selecting ? tr('Yopish', 'Закрыть') : tr('Tanlash', 'Выбрать')}</button>
          </div>

          ${!selecting ? `
            <div class="text-[10px] text-gray-500 space-y-0.5">
              ${items.slice(0, 5).map(p => `<p class="truncate">• ${escapeHtml(p.name)} ${p.sku ? `(ID: ${escapeHtml(p.sku)})` : ''}</p>`).join('')}
              ${items.length > 5 ? `<p class="text-gray-400">… ${tr('va yana', 'и ещё')} ${items.length - 5}</p>` : ''}
            </div>
          ` : `
            <div class="space-y-1.5 max-h-48 overflow-y-auto">
              ${items.map(p => `
                <div onclick="toggleTrashProductSelection(${b.id}, '${p.id}')" class="flex items-center gap-2 p-1.5 rounded-lg cursor-pointer ${selectedSet.has(p.id) ? 'ustore-selected-card border border-blue-500' : 'border border-transparent hover:bg-gray-50'}">
                  <div class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selectedSet.has(p.id) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}">${selectedSet.has(p.id) ? '✓' : ''}</div>
                  <img src="${escapeHtml(p.img || FALLBACK_IMG)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" class="w-8 h-8 object-cover rounded-lg shrink-0">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold">${escapeHtml(p.name)}</p>
                    ${p.sku ? `<p class="text-[9px] text-gray-400">ID: ${escapeHtml(p.sku)}</p>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="flex items-center justify-between text-[10px]">
              <button onclick="selectAllTrashProducts(${b.id})" class="font-bold text-blue-600">${tr('Barchasini tanlash', 'Выбрать все')}</button>
              <button onclick="clearTrashSelection(${b.id})" class="font-bold text-gray-500">${tr('Tanlovni bekor qilish', 'Снять выбор')}</button>
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <button onclick="restoreSelectedTrashItems(${b.id})" ${selectedCount ? '' : 'disabled'} class="bg-emerald-50 text-emerald-700 border border-emerald-200 disabled:opacity-40 font-bold py-1.5 rounded-lg">${tr("♻️ Tiklash", "♻️ Восстановить")} ${selectedCount ? `(${selectedCount})` : ''}</button>
              <button onclick="purgeSelectedTrashItems(${b.id})" ${selectedCount ? '' : 'disabled'} class="fc-bg-danger-soft fc-text-danger border fc-border-danger disabled:opacity-40 font-bold py-1.5 rounded-lg flex items-center justify-center gap-1">${ICON_TRASH} ${tr("Butunlay", "Навсегда")} ${selectedCount ? `(${selectedCount})` : ''}</button>
            </div>
          `}
        </div>
      `;
    }

    function toggleTrashSelectMode(batchId) {
      trashSelectMode[batchId] = !trashSelectMode[batchId];
      if (!trashSelectMode[batchId]) trashSelectedProductIds[batchId] = new Set();
      render();
    }
    function toggleTrashProductSelection(batchId, productId) {
      if (!trashSelectedProductIds[batchId]) trashSelectedProductIds[batchId] = new Set();
      const set = trashSelectedProductIds[batchId];
      if (set.has(productId)) set.delete(productId); else set.add(productId);
      render();
    }
    function selectAllTrashProducts(batchId) {
      const batch = (trashBatches || []).find(b => b.id === batchId);
      if (!batch) return;
      trashSelectedProductIds[batchId] = new Set((batch.productItems || []).map(p => p.id));
      render();
    }
    function clearTrashSelection(batchId) {
      trashSelectedProductIds[batchId] = new Set();
      render();
    }
    // Batch to'liq hal qilingandan keyin (barcha itemlar tiklandi/o'chirildi)
    // uni ro'yxatdan olib tashlaydi — 029 migratsiyasidagi RPC ham xuddi shu
    // holatda trash_batches.restored_at/purged_at'ni belgilaydi.
    function removeResolvedTrashItemsFromState(batchId, resolvedIds) {
      const batch = (trashBatches || []).find(b => b.id === batchId);
      if (!batch) return;
      batch.productItems = (batch.productItems || []).filter(p => !resolvedIds.includes(p.id));
      if (!batch.productItems.length) trashBatches = (trashBatches || []).filter(b => b.id !== batchId);
      trashSelectedProductIds[batchId] = new Set();
      trashSelectMode[batchId] = false;
    }
    async function restoreSelectedTrashItems(batchId) {
      const ids = [...(trashSelectedProductIds[batchId] || [])];
      if (!ids.length) return alert(tr('Kamida bitta mahsulot tanlang.', 'Выберите хотя бы один товар.'));
      showActionToast(tr('⏳ Tiklanmoqda...', '⏳ Восстановление...'), 'saving');
      try {
        await callApi('restore_trash_items', { batchId, productIds: ids });
        await loadCatalog();
        removeResolvedTrashItemsFromState(batchId, ids);
        render();
        showActionToast(tr('✅ Tiklandi', '✅ Восстановлено'), 'success', 1500);
      } catch (e) {
        console.error(e);
        if (String(e.message || '').includes('product_set_changed')) {
          alert(tr("Tanlangan mahsulotlar ro'yxati o'zgargan (boshqa admin ham amal qilgan bo'lishi mumkin). Ro'yxat yangilanadi.", 'Список выбранных товаров изменился (возможно, другой админ тоже действовал). Список обновится.'));
          openTrashModal();
        } else {
          showActionToast(tr('❌ Tiklanmadi', '❌ Не восстановлено'), 'error', 1800);
          alert(tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e));
        }
      }
    }
    async function purgeSelectedTrashItems(batchId) {
      const ids = [...(trashSelectedProductIds[batchId] || [])];
      if (!ids.length) return alert(tr('Kamida bitta mahsulot tanlang.', 'Выберите хотя бы один товар.'));
      const ok = await fcConfirm(tr('Butunlay o‘chirilsinmi?', 'Удалить навсегда?'), tr(`${ids.length} ta mahsulot darhol va qaytarib bo'lmaydigan tarzda o'chiriladi.`, `${ids.length} товар(ов) будут удалены немедленно и без возможности восстановления.`));
      if (!ok) return;
      showActionToast(tr('⏳ Butunlay o‘chirilmoqda...', '⏳ Удаление навсегда...'), 'saving');
      try {
        await callApi('purge_trash_items', { batchId, productIds: ids });
        removeResolvedTrashItemsFromState(batchId, ids);
        render();
        showActionToast(tr('✅ Butunlay o‘chirildi', '✅ Удалено навсегда'), 'success', 1500);
      } catch (e) {
        console.error(e);
        if (String(e.message || '').includes('product_set_changed')) {
          alert(tr("Tanlangan mahsulotlar ro'yxati o'zgargan (boshqa admin ham amal qilgan bo'lishi mumkin). Ro'yxat yangilanadi.", 'Список выбранных товаров изменился (возможно, другой админ тоже действовал). Список обновится.'));
          openTrashModal();
        } else {
          showActionToast(tr('❌ O‘chirilmadi', '❌ Не удалено'), 'error', 1800);
          alert(tr('❌ Xatolik: ', '❌ Ошибка: ') + (e.message || e));
        }
      }
    }

    // 2.5: Chiqindi (trash) ko'rinishi.
    async function openTrashModal() {
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
      if (activePopupModal === 'TRASH') renderModalContainer();
    }
    async function restoreTrashBatch(batchId) {
      showActionToast(tr('⏳ Tiklanmoqda...', '⏳ Восстановление...'), 'saving');
      try {
        await callApi('restore_trash_batch', { batchId });
        await loadCatalog();
        if (trashBatches) trashBatches = trashBatches.filter(b => b.id !== batchId);
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
        fulfillmentConfig = commerce.normalizeConfig(bootData.fulfillmentConfig, TOP_LEVEL_REGION_IDS);
        designSettings = bootData.designSettings || { themeId: 'minimal', colors: {} };
        applyDesignColors(designSettings.colors);
        if (bootData.profile?.phone) {
          registeredUser = { firstName: bootData.profile.firstName || '', lastName: bootData.profile.lastName || '', phone: bootData.profile.phone };
          currentUser.firstName = registeredUser.firstName; currentUser.lastName = registeredUser.lastName; currentUser.phone = registeredUser.phone;
          localStorage.setItem(scopedKey('registeredUser'), JSON.stringify(registeredUser));
        }
        authReady = true;
        loadFavorites(); // 17-band: bir marta, fonda — heart iconlar to'g'ri holatda chiqishi uchun
        loadRecentViews(); // 18-band: bir marta, fonda
      } catch (e) {
        console.error('Yuklashda xatolik:', e);
        document.getElementById('app-content').innerHTML = `
          <div class="fc-bg-danger-soft border fc-border-danger fc-text-danger text-xs p-4 rounded-2xl mt-10 text-center">
            ⚠️ Ma'lumotlarni yuklashda xatolik yuz berdi.<br>Internetni tekshirib, ilovani qayta oching.<br><br>
            <span class="font-mono text-[10px]">${escapeHtml(e.message || String(e))}</span>
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
