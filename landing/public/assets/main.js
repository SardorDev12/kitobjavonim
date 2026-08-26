document.getElementById('year').textContent = new Date().getFullYear();

var nav = document.getElementById('nav');
var menuBtn = document.getElementById('menuBtn');
menuBtn.addEventListener('click', function () {
  var open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
});
document.getElementById('mobilePanel').addEventListener('click', function (e) {
  if (e.target.tagName === 'A') nav.classList.remove('open');
});

// ---------- Theme ----------
// theme-init.js (blocking, in <head>) already applied any stored explicit
// choice before first paint. This just wires the toggle buttons — with no
// stored choice, styles.css's prefers-color-scheme media query is already
// governing the page, so "current" theme is read from that when no
// data-theme attribute is set yet.
function currentTheme() {
  var attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
document.querySelectorAll('.theme-toggle').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('kj-theme', next); } catch (e) {}
  });
});

// ---------- Language ----------
// Plain object, no i18n library — this page has no build step (see
// landing/README.md), so a flat dictionary + textContent swap is simpler
// than pulling in a framework for three languages' worth of static copy.
var STRINGS = {
  uz: {
    'meta.title': 'Kitobjavonim — kitob javoningiz raqamli dunyoda',
    'meta.description': 'Kitoblaringizni roʻyxatga oling, oʻqish jarayonini kuzating va keraksiz kitoblarni boshqa kitobxonlar bilan almashing yoki soting. iOS, Android va veb uchun bepul.',
    'nav.library': 'Kutubxona',
    'nav.exchange': 'Almashuv',
    'nav.howItWorks': 'Qanday ishlaydi',
    'nav.contact': 'Bogʻlanish',
    'nav.signIn': 'Kirish',
    'nav.start': 'Boshlash',
    'nav.menuAriaLabel': 'Menyu',
    'controls.langAriaLabel': 'Til',
    'controls.themeAriaLabel': 'Mavzuni almashtirish',
    'hero.eyebrow': 'Kitobxonlar uchun',
    'hero.title': 'Kutubxonangiz — choʻntagingizda.',
    'hero.subtitle': 'Oʻzingizdagi kitoblarni roʻyxatga oling, oʻqish jarayonini kuzating — va keraksiz boʻlib qolganlarini boshqa kitobxonlarga bering yoki soting. Bittasi ikkinchisiz ham ishlaydi.',
    'hero.ctaPrimary': 'Bepul boshlash',
    'hero.ctaSecondary': 'Qanday ishlashini koʻring',
    'hero.note': 'iOS, Android va veb uchun — oʻzbek, rus va ingliz tillarida.',
    'phone.title': 'Mutolaam',
    'phone.subtitle': 'Hozir oʻqiyotgan kitoblaringiz va ulardagi jarayoningiz.',
    'phone.statReading': 'oʻqilmoqda',
    'phone.statFinished': 'shu oy tugatilgan',
    'phone.searchPlaceholder': 'Kitoblaringizni qidiring',
    'phone.continueReading': 'Oʻqishni davom ettirish',
    'phone.pagesUnit': 'sahifa',
    'phone.pace': "Shu sur'atda — yana ~9 kun",
    'phone.updateProgress': 'Jarayonni yangilash',
    'phone.finishBook': 'Kitobni tugatish',
    'phone.listedForExchange': 'Almashuvga qoʻyilgan',
    'features.eyebrow': 'Shaxsiy kutubxona',
    'features.title': 'Kitoblaringizni tartibga soling',
    'features.subtitle': 'Har bir kitob qayerda turgani, qancha oʻqilgani va nimani xohlayotganingiz — bittasi ham esdan chiqmaydi.',
    'features.card1.title': 'Bir necha soniyada qoʻshing',
    'features.card1.body': 'Shtrix-kodni skanerlang yoki nomi boʻyicha qidiring — muallif, muqova va sahifalar soni avtomatik toʻldiriladi.',
    'features.card2.title': 'Oʻqish jarayonini kuzating',
    'features.card2.body': "Qaysi sahifada ekaningizni belgilang — ilova shu sur'atda qachon tugatishingizni taxmin qiladi.",
    'features.card3.title': 'Javonga joylashtiring',
    'features.card3.body': 'Har bir kitobni qaysi javon va qatorda turganini belgilang — endi qidirib yurishga hojat yoʻq.',
    'features.card4.title': 'Istaklar roʻyxati',
    'features.card4.body': 'Xohlagan, lekin hali sizda yoʻq kitoblarni yozib qoʻying — topganingizda darrov eslaysiz.',
    'exchange.title': 'Keraksiz kitobga — yangi uy',
    'exchange.subtitle': 'Javoningizda turgan, lekin endi ochilmaydigan kitoblar bormi? Ularni boshqa kitobxonlarga bering yoki soting — yoki oʻzingizga kerakli kitobni shu yerdan toping.',
    'exchange.card1.title': 'Eʼlon joylashtiring',
    'exchange.card1.body': 'Kitobni almashuvga yoki sotuvga qoʻying, holatini (yangi, yaxshi, oʻrtacha) belgilang.',
    'exchange.card2.title': 'Hududingizdan qidiring',
    'exchange.card2.body': 'Viloyat va tuman boʻyicha filtrlang — yaqin-atrofdagi kitobxonlar bilan almashish osonroq.',
    'exchange.card3.title': 'Xavfsiz aloqa',
    'exchange.card3.body': 'Aloqa maʼlumotlaringiz faqat "Egasi bilan bogʻlanish" tugmasini bosgan odamgagina koʻrsatiladi.',
    'exchange.card4.title': 'Nazorat ostida',
    'exchange.card4.body': 'Nomaqbul eʼlonlarni shikoyat qiling — jamoamiz koʻrib chiqib, kerak boʻlsa oʻchiradi.',
    'how.title': 'Uch qadamda kutubxonangiz jonlanadi',
    'how.step1.title': 'Qoʻshing',
    'how.step1.body': 'Shtrix-kodni skanerlang yoki nomi boʻyicha qidiring — kitob bir necha soniyada kutubxonangizga qoʻshiladi.',
    'how.step2.title': 'Belgilang',
    'how.step2.body': 'Shaxsiy saqlang, oʻqish jarayonini kuzating yoki almashuv/sotuvga chiqaring — istalgan vaqtda oʻzgartirasiz.',
    'how.step3.title': 'Bogʻlaning',
    'how.step3.body': 'Qiziqqan kitobxon sizga yozadi — javonlaringiz shunchaki roʻyxat emas, haqiqiy tarmoqqa aylanadi.',
    'trust.languages': 'Oʻzbek, rus va ingliz tillarida',
    'trust.platforms': 'iOS, Android va veb',
    'trust.free': 'Bepul boshlanadi',
    'cta.title': 'Javoningizni raqamlashtirishga tayyormisiz?',
    'cta.body': 'Birinchi kitobingizni qoʻshish bir necha soniya oladi. Karta va roʻyxatdan oʻtish shart emas — Google yoki Telegram bilan ham kirishingiz mumkin.',
    'cta.button': 'Kitobjavonimni ochish',
    'footer.tagline': 'Shaxsiy kutubxonangizni tartibga soluvchi va kitobxonlarni bir-biri bilan bogʻlovchi ilova.',
    'footer.appHeading': 'Ilova',
    'footer.openApp': 'Ilovani ochish',
    'footer.legalHeading': 'Huquqiy',
    'footer.privacy': 'Maxfiylik siyosati',
    'footer.terms': 'Foydalanish shartlari',
    'footer.location': 'Toshkent, Oʻzbekiston'
  },
  ru: {
    'meta.title': 'Kitobjavonim — ваша книжная полка в цифровом мире',
    'meta.description': 'Ведите каталог своих книг, отслеживайте процесс чтения и обменивайтесь или продавайте ненужные книги другим читателям. Бесплатно для iOS, Android и веб.',
    'nav.library': 'Библиотека',
    'nav.exchange': 'Обмен',
    'nav.howItWorks': 'Как это работает',
    'nav.contact': 'Контакты',
    'nav.signIn': 'Войти',
    'nav.start': 'Начать',
    'nav.menuAriaLabel': 'Меню',
    'controls.langAriaLabel': 'Язык',
    'controls.themeAriaLabel': 'Переключить тему',
    'hero.eyebrow': 'Для читателей',
    'hero.title': 'Ваша библиотека — в кармане.',
    'hero.subtitle': 'Заносите свои книги в каталог, следите за процессом чтения — а те, что стали не нужны, отдавайте или продавайте другим читателям. Одно прекрасно работает и без другого.',
    'hero.ctaPrimary': 'Начать бесплатно',
    'hero.ctaSecondary': 'Посмотреть, как это работает',
    'hero.note': 'Для iOS, Android и веб — на узбекском, русском и английском.',
    'phone.title': 'Моё чтение',
    'phone.subtitle': 'Книги, которые вы сейчас читаете, и ваш прогресс по ним.',
    'phone.statReading': 'в процессе',
    'phone.statFinished': 'завершено в этом месяце',
    'phone.searchPlaceholder': 'Поиск по вашим книгам',
    'phone.continueReading': 'Продолжить чтение',
    'phone.pagesUnit': 'страниц',
    'phone.pace': 'В таком темпе — ещё ~9 дней',
    'phone.updateProgress': 'Обновить прогресс',
    'phone.finishBook': 'Завершить книгу',
    'phone.listedForExchange': 'Выставлено на обмен',
    'features.eyebrow': 'Личная библиотека',
    'features.title': 'Приведите свои книги в порядок',
    'features.subtitle': 'Где стоит каждая книга, сколько вы уже прочитали и что хотите прочитать — ничего не забудется.',
    'features.card1.title': 'Добавляйте за пару секунд',
    'features.card1.body': 'Отсканируйте штрих-код или найдите по названию — автор, обложка и количество страниц заполнятся автоматически.',
    'features.card2.title': 'Отслеживайте процесс чтения',
    'features.card2.body': 'Отмечайте, на какой странице вы находитесь, — приложение подскажет, когда вы закончите книгу в таком темпе.',
    'features.card3.title': 'Расставьте по полкам',
    'features.card3.body': 'Укажите, на какой полке и в каком ряду стоит каждая книга, — больше не придётся её искать.',
    'features.card4.title': 'Список желаний',
    'features.card4.body': 'Записывайте книги, которые хотите, но пока не купили, — и сразу вспомните о них, когда найдёте.',
    'exchange.title': 'Ненужной книге — новый дом',
    'exchange.subtitle': 'На полке стоят книги, которые вы давно не открываете? Отдайте или продайте их другим читателям — или найдите здесь нужную вам книгу.',
    'exchange.card1.title': 'Разместите объявление',
    'exchange.card1.body': 'Выставьте книгу на обмен или продажу, укажите её состояние (новая, хорошая, среднее).',
    'exchange.card2.title': 'Ищите рядом с собой',
    'exchange.card2.body': 'Фильтруйте по области и району — обмениваться с читателями поблизости проще.',
    'exchange.card3.title': 'Безопасный контакт',
    'exchange.card3.body': 'Ваши контактные данные видны только тому, кто нажал кнопку «Связаться с владельцем».',
    'exchange.card4.title': 'Под контролем',
    'exchange.card4.body': 'Жалуйтесь на неприемлемые объявления — наша команда рассмотрит их и удалит при необходимости.',
    'how.title': 'Три шага — и ваша библиотека оживает',
    'how.step1.title': 'Добавьте',
    'how.step1.body': 'Отсканируйте штрих-код или найдите по названию — книга добавится в вашу библиотеку за пару секунд.',
    'how.step2.title': 'Отметьте',
    'how.step2.body': 'Оставьте себе, отслеживайте чтение или выставьте на обмен/продажу — вы можете изменить это в любой момент.',
    'how.step3.title': 'Свяжитесь',
    'how.step3.body': 'Заинтересованный читатель напишет вам — ваша полка перестаёт быть просто списком и становится настоящей сетью.',
    'trust.languages': 'На узбекском, русском и английском',
    'trust.platforms': 'iOS, Android и веб',
    'trust.free': 'Начинается бесплатно',
    'cta.title': 'Готовы оцифровать свою полку?',
    'cta.body': 'Добавить первую книгу займёт пару секунд. Карта и долгая регистрация не нужны — можно войти через Google или Telegram.',
    'cta.button': 'Открыть Kitobjavonim',
    'footer.tagline': 'Приложение, которое приводит в порядок вашу личную библиотеку и связывает читателей друг с другом.',
    'footer.appHeading': 'Приложение',
    'footer.openApp': 'Открыть приложение',
    'footer.legalHeading': 'Правовая информация',
    'footer.privacy': 'Политика конфиденциальности',
    'footer.terms': 'Условия использования',
    'footer.location': 'Ташкент, Узбекистан'
  },
  en: {
    'meta.title': 'Kitobjavonim — your bookshelf, in the digital world',
    'meta.description': 'Catalog your books, track your reading, and exchange or sell the ones you no longer need with other readers. Free for iOS, Android, and web.',
    'nav.library': 'Library',
    'nav.exchange': 'Exchange',
    'nav.howItWorks': 'How it works',
    'nav.contact': 'Contact',
    'nav.signIn': 'Sign in',
    'nav.start': 'Get started',
    'nav.menuAriaLabel': 'Menu',
    'controls.langAriaLabel': 'Language',
    'controls.themeAriaLabel': 'Toggle theme',
    'hero.eyebrow': 'For readers',
    'hero.title': 'Your library — in your pocket.',
    'hero.subtitle': "Catalog the books you own, track your reading — and give away or sell the ones you no longer need to other readers. Either one works fine on its own.",
    'hero.ctaPrimary': 'Start for free',
    'hero.ctaSecondary': 'See how it works',
    'hero.note': 'For iOS, Android, and web — in Uzbek, Russian, and English.',
    'phone.title': 'My reading',
    'phone.subtitle': "The books you're reading right now, and your progress in each.",
    'phone.statReading': 'in progress',
    'phone.statFinished': 'finished this month',
    'phone.searchPlaceholder': 'Search your books',
    'phone.continueReading': 'Continue reading',
    'phone.pagesUnit': 'pages',
    'phone.pace': 'At this pace — about 9 more days',
    'phone.updateProgress': 'Update progress',
    'phone.finishBook': 'Finish book',
    'phone.listedForExchange': 'Listed for exchange',
    'features.eyebrow': 'Personal library',
    'features.title': 'Get your books organized',
    'features.subtitle': "Where every book sits, how far you've read, and what you still want — nothing slips through the cracks.",
    'features.card1.title': 'Add books in seconds',
    'features.card1.body': 'Scan the barcode or search by title — author, cover, and page count fill in automatically.',
    'features.card2.title': 'Track your reading',
    'features.card2.body': "Mark what page you're on — the app estimates when you'll finish at that pace.",
    'features.card3.title': 'Place them on a shelf',
    'features.card3.body': "Note which shelf and row each book sits on — no more hunting for it later.",
    'features.card4.title': 'Wishlist',
    'features.card4.body': "Note the books you want but don't have yet — you'll remember the moment you spot them.",
    'exchange.title': "A new home for the books you don't need",
    'exchange.subtitle': 'Books sitting on your shelf that you never open anymore? Give them away or sell them to other readers — or find the one you\'re looking for right here.',
    'exchange.card1.title': 'Post a listing',
    'exchange.card1.body': 'List a book for exchange or sale, and note its condition (new, good, fair).',
    'exchange.card2.title': 'Search near you',
    'exchange.card2.body': 'Filter by region and district — exchanging with readers nearby is simpler.',
    'exchange.card3.title': 'Contact stays private',
    'exchange.card3.body': 'Your contact details are only shown to someone who taps "Contact owner."',
    'exchange.card4.title': 'Moderated',
    'exchange.card4.body': "Report a listing that shouldn't be there — our team reviews it and takes it down if needed.",
    'how.title': 'Three steps and your library comes alive',
    'how.step1.title': 'Add',
    'how.step1.body': 'Scan the barcode or search by title — the book joins your library in seconds.',
    'how.step2.title': 'Mark it',
    'how.step2.body': 'Keep it for yourself, track your reading, or list it for exchange or sale — change your mind anytime.',
    'how.step3.title': 'Connect',
    'how.step3.body': 'An interested reader reaches out — your shelf stops being just a list and becomes a real network.',
    'trust.languages': 'In Uzbek, Russian, and English',
    'trust.platforms': 'iOS, Android, and web',
    'trust.free': 'Free to start',
    'cta.title': 'Ready to digitize your shelf?',
    'cta.body': 'Adding your first book takes a few seconds. No card, no lengthy sign-up — you can sign in with Google or Telegram too.',
    'cta.button': 'Open Kitobjavonim',
    'footer.tagline': 'The app that organizes your personal library and connects readers with each other.',
    'footer.appHeading': 'App',
    'footer.openApp': 'Open the app',
    'footer.legalHeading': 'Legal',
    'footer.privacy': 'Privacy policy',
    'footer.terms': 'Terms of use',
    'footer.location': 'Tashkent, Uzbekistan'
  }
};

function setActiveLangButtons(lang) {
  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    if (btn.getAttribute('data-lang') === lang) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  });
}

function applyLanguage(lang) {
  var dict = STRINGS[lang] || STRINGS.uz;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
    el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
      var parts = pair.split(':');
      var attr = parts[0].trim();
      var key = parts[1] && parts[1].trim();
      if (key && dict[key] != null) el.setAttribute(attr, dict[key]);
    });
  });
  setActiveLangButtons(lang);
  try { localStorage.setItem('kj-lang', lang); } catch (e) {}
}

function detectInitialLang() {
  try {
    var stored = localStorage.getItem('kj-lang');
    if (stored && STRINGS[stored]) return stored;
  } catch (e) {}
  var nav = (navigator.language || '').toLowerCase();
  if (nav.indexOf('ru') === 0) return 'ru';
  if (nav.indexOf('en') === 0) return 'en';
  return 'uz';
}

document.querySelectorAll('.lang-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    applyLanguage(btn.getAttribute('data-lang'));
  });
});

applyLanguage(detectInitialLang());
