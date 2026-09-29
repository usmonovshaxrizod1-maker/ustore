// Presentation-only fallback for customer views that still emit Uzbek copy.
// Keep the source language and all business values unchanged.
const RU = Object.freeze({
  'Savatcha':'Корзина', 'Savatchani tozalash':'Очистить корзину', 'Savatcha yuklanmoqda':'Загрузка корзины',
  'Mahsulotlar tekshirilmoqda.':'Проверяем товары.', 'Savatchani ochib bo‘lmadi':'Не удалось открыть корзину',
  'Savatcha bo‘sh':'Корзина пуста', 'Katalogdan mahsulot tanlang.':'Выберите товар в каталоге.',
  'Aksiya':'Акция', 'Variant':'Вариант', 'Mahsulot':'Товар', 'Olib tashlash':'Удалить',
  'Promo-kod':'Промокод', 'Kod kiriting':'Введите код', 'Tekshirilmoqda…':'Проверка…',
  'Qo‘llash':'Применить', 'Amal bajarilmadi.':'Не удалось выполнить действие.',
  'Bosqichli chegirma':'Многоступенчатая скидка', 'Chegirma bosqichi progressi':'Прогресс скидки',
  'Tovarlar':'Товары', 'Mahsulotlar':'Товары', 'Chegirma':'Скидка', 'Jami':'Итого',
  'Hisob server tomonidan tekshirildi.':'Расчёт проверен сервером.',
  'Yakuniy narx checkoutda server tomonidan tekshiriladi.':'Окончательная сумма будет проверена сервером при оформлении.',
  'Buyurtmani rasmiylashtirish':'Оформление заказа', 'Narx yoki qoldiq o‘zgardi':'Цена или остаток изменились',
  'Hisobni yangilab bo‘lmadi':'Не удалось обновить расчёт', 'Qayta hisoblash':'Пересчитать',
  'Qayta urinib ko‘ring.':'Попробуйте ещё раз.', 'Kontakt':'Контактные данные',
  'Ism':'Имя', 'Familiya':'Фамилия', 'Telefon':'Телефон', 'Yetkazib berish':'Доставка',
  'Tanlang':'Выберите', 'Usul':'Способ', 'Manzil':'Адрес', 'Olib ketishda manzil talab qilinmaydi.':'При самовывозе адрес не нужен.',
  'To‘lov':'Оплата', 'To‘lov usuli':'Способ оплаты',
  'Buyurtma, yetkazib berish va qaytarish shartlariga roziman.':'Согласен с условиями заказа, доставки и возврата.',
  'Server hisobi':'Расчёт сервера', 'Hisoblanmoqda…':'Расчёт…',
  'Jami summa server quote’dan olinadi. Brauzerdagi eski narx yakuniy hisob hisoblanmaydi.':'Итоговая сумма берётся из расчёта сервера. Старая цена в браузере не является окончательной.',
  'Yakuniy hisob hali olinmagan.':'Окончательный расчёт ещё не получен.', 'Davom etish':'Продолжить',
  'Buyurtmani yuborishga o‘tish':'Перейти к отправке заказа', 'Buyurtmani yuborish':'Отправка заказа',
  'Natija aniq emas':'Результат неизвестен', 'Holatni qayta tekshirish':'Проверить статус ещё раз',
  'To‘lov holati tekshirilmoqda':'Проверяем статус оплаты', 'Amal tugamadi':'Действие не завершено',
  'Qayta urinish':'Повторить', 'To‘lov tekshirilmoqda':'Проверяем оплату',
  'Server javobi kutilmoqda.':'Ожидаем ответ сервера.', 'To‘lov kutilmoqda':'Ожидается оплата',
  'Mavjud buyurtma to‘lovini yakunlang.':'Завершите оплату существующего заказа.',
  'Holatni tekshirish':'Проверить статус', 'To‘lovga o‘tish':'Перейти к оплате',
  'Buyurtma qabul qilindi':'Заказ принят', 'Buyurtma serverda tasdiqlandi.':'Заказ подтверждён сервером.',
  'Yuborilmoqda…':'Отправка…', 'Buyurtma berish':'Оформить заказ',
  'To‘lov tasdiqlandi':'Оплата подтверждена', 'Server to‘lov holatini tasdiqladi.':'Сервер подтвердил оплату.',
  'Provider tasdig‘i hali kelmagan.':'Подтверждение платёжного сервиса ещё не получено.',
  'To‘lov amalga oshmadi':'Оплата не прошла', 'Holatni aniqlab bo‘lmadi':'Не удалось определить статус',
  'Qayta tekshirish':'Проверить ещё раз', 'Buyurtmalarim':'Мои заказы', 'Buyurtmalar yuklanmoqda':'Загрузка заказов',
  'Bir oz kuting.':'Подождите немного.', 'Buyurtmalarni ochib bo‘lmadi':'Не удалось открыть заказы',
  'Hali buyurtma yo‘q':'Заказов пока нет', 'Birinchi xaridingiz shu yerda ko‘rinadi.':'Ваша первая покупка появится здесь.',
  'Buyurtmani tanlang':'Выберите заказ', 'Tafsilot va amallar shu yerda ochiladi.':'Здесь появятся детали и действия.',
  'Buyurtma holati tarixi':'История статуса заказа', 'Qaytarish so‘rovi mavjud.':'Есть запрос на возврат.',
  'Bekor qilish':'Отменить', 'Qabul qildim':'Получил', 'Qaytarish / muammo':'Возврат / проблема',
  'Yangi':'Новый', 'Tayyorlanmoqda':'В обработке', 'Yo‘lda':'В пути', 'Yetkazildi':'Доставлен',
  'Qabul qilindi':'Получен', 'Bekor qilindi':'Отменён', 'Pul qaytarildi':'Возврат средств',
  'Noma’lum holat':'Неизвестный статус', 'Buyurtma yaratildi':'Заказ создан',
  'Profil':'Профиль', 'Profil yuklanmoqda':'Загрузка профиля', 'Profilni ochib bo‘lmadi':'Не удалось открыть профиль',
  'Profil ma’lumoti yo‘q':'Нет данных профиля', 'Profilni qayta yuklab ko‘ring.':'Попробуйте обновить профиль.',
  'Shaxsiy ma’lumotlar':'Личные данные', 'Saqlanmoqda…':'Сохранение…', 'Saqlash':'Сохранить',
  'Faol sessiyalar':'Активные сеансы', 'Bo‘limlar':'Разделы',
  'Aksiyalar va chegirmalar':'Акции и скидки', 'Qo‘llab-quvvatlash':'Поддержка',
  'Boshqaruv markazi':'Центр управления', 'Domen va manzil':'Домен и адрес',
  'Sevimlilar':'Избранное', 'Sevimlilar bo‘sh':'Избранное пусто',
  'Yoqtirgan mahsulotlaringiz shu yerda ko‘rinadi.':'Здесь появятся понравившиеся товары.',
  'Ochish':'Открыть', 'Chiqilmoqda…':'Выход…', 'Chiqish':'Выйти',
  'Sessiyalar yuklanmoqda':'Загрузка сеансов', 'Sessiyalarni ochib bo‘lmadi':'Не удалось открыть сеансы',
  'Joriy qurilma':'Текущее устройство', 'Boshqa sessiya':'Другой сеанс',
  'Faol sessiya topilmadi':'Активные сеансы не найдены',
  'Qayta kirish talab qilinishi mumkin.':'Возможно, потребуется войти снова.',
  'Boshqa barcha sessiyalarni bekor qilish':'Завершить все остальные сеансы',
  'Aksiya to‘plami':'Акционный набор', 'To‘plam tarkibi':'Состав набора',
  'Qo‘shilmoqda…':'Добавление…', 'To‘plamni savatga qo‘shish':'Добавить набор в корзину',
  'Aksiya topilmadi':'Акция не найдена', 'Bu aksiya hozir mavjud emas.':'Эта акция сейчас недоступна.',
  'Promo taklif':'Промопредложение', 'Nusxalash':'Скопировать',
  'Amal qilish muddati':'Срок действия', 'Minimal summa':'Минимальная сумма',
  'Maksimal summa':'Максимальная сумма', 'Cheklovsiz':'Без ограничений',
  'Qolgan foydalanish':'Осталось использований', 'Cheksiz':'Без ограничений',
  'Kim ishlata oladi':'Кто может использовать', 'Faqat yangi mijozlar':'Только новые клиенты',
  'Barcha mijozlar':'Все клиенты', 'Katalogga o‘tish':'Перейти в каталог',
  'Aksiyalar va promo-kodlar':'Акции и промокоды', 'Hozircha faol taklif yo‘q.':'Пока нет активных предложений.',
  'Aksiya to‘plamlari':'Акционные наборы', 'Promo-kodlar va kuponlar':'Промокоды и купоны',
});

export function translateCustomerText(value, locale = 'uz') {
  const original = String(value ?? '');
  if (locale !== 'ru' || !original.trim()) return original;
  const match = /^(\s*)(.*?)(\s*)$/s.exec(original);
  const [, before, text, after] = match;
  const exact = RU[text];
  if (exact) return before + exact + after;
  let translated = text
    .replace(/\bso‘m\b/g, 'сум')
    .replace(/^Buyurtma #(\S+)/, 'Заказ #$1')
    .replace(/^Buyurtma: (\S+)/, 'Заказ: $1')
    .replace(/^Mahsulotlar \((\d+)\)/, 'Товары ($1)')
    .replace(/^Tugaydi: /, 'До: ')
    .replace(/^Tejaysiz: /, 'Экономия: ')
    .replace(/^Tejash: /, 'Экономия: ')
    .replace(/^Aksiya narxi: /, 'Цена акции: ')
    .replace(/^Kod: /, 'Код: ')
    .replace(/^Qo‘shilgan: /, 'Добавлено: ')
    .replace(/^Oxirgi faollik: /, 'Последняя активность: ')
    .replace(/^Qaytarish: /, 'Возврат: ')
    .replace(/ dona$/, ' шт.')
    .replace(/ ta$/, ' шт.')
    .replace(/ chegirma$/, ' скидка');
  return before + translated + after;
}

export function localizeCustomerDom(root, locale = 'uz') {
  if (locale !== 'ru' || !root?.ownerDocument?.createTreeWalker) return root;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4);
  let current;
  while ((current = walker.nextNode())) {
    const translated = translateCustomerText(current.nodeValue, locale);
    if (translated !== current.nodeValue) current.nodeValue = translated;
  }
  if (root.querySelectorAll) for (const element of root.querySelectorAll('[placeholder],[aria-label],[title]')) {
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, translateCustomerText(value, locale));
    }
  }
  return root;
}
