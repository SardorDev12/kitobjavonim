import type { Locale } from './i18n';

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

/**
 * Support address referenced by the legal pages below. Set up a real mailbox
 * at this address (or change it) before relying on these pages in
 * production — a policy that names an unmonitored address is worse than
 * naming none.
 */
export const SUPPORT_EMAIL = 'support@kitobjavonim.uz';

const LAST_UPDATED = '2026-08-13';

export const PRIVACY_POLICY: Record<Locale, LegalDoc> = {
  en: {
    title: 'Privacy Policy',
    updated: `Last updated: ${LAST_UPDATED}`,
    intro:
      'Kitobjavonim ("we", "the app") helps you catalog the books you own and, if you choose, exchange or sell copies with other readers. This page explains what information we collect, why, and who can see it.',
    sections: [
      {
        heading: 'Information we collect',
        body: [
          'Account information: your email address (or the identifier your Google/Telegram sign-in provides), display name, and avatar.',
          'Profile information you choose to add: bio, region/district, phone number, and Telegram username. Phone and Telegram are only ever shown to other users if you turn on "Show phone" / "Show Telegram" in your profile settings.',
          'Your library: the books you add, their reading status, your private ratings, reviews, and notes, and how you organize your shelves. This is private by default and never shown to anyone else.',
          'Listings: if you mark a book for exchange or sale, its condition, price, description, and any photos you add become visible to other users so they can find and consider it.',
          'Activity we need to run the service: when you request another user\'s contact details, that request is logged (who asked, for which listing, when) so we can enforce fair-use limits and so listing owners can see who has reached out. When you report a listing, the report and any details you add are stored so it can be reviewed.',
        ],
      },
      {
        heading: 'What other users can see',
        body: [
          'A stranger browsing Discover can see: the book, its condition, price or exchange terms, any photos you added to the listing, and your display name, avatar, approximate location (region/district), and — only if you opted in — your phone number and Telegram username.',
          'Your private library, ratings, reviews, and notes are never shown to anyone but you, even for books you have listed. Only the fields listed above travel with a listing.',
          'Your phone number and Telegram username are never visible in a public listing itself — they are only revealed to a signed-in user who taps "Contact owner" and completes a contact request, which is recorded.',
        ],
      },
      {
        heading: 'Third parties',
        body: [
          'We use Supabase to host our database, handle sign-in, and store uploaded photos. Supabase processes data on our behalf under its own security and privacy commitments.',
          'If you sign in with Google or Telegram, those providers share the basic profile information needed to create your account (name, email or Telegram ID, avatar) — we never see your password for those accounts.',
          'We do not sell your personal information, and we do not use advertising networks or third-party trackers.',
        ],
      },
      {
        heading: 'Data retention and deletion',
        body: [
          'We keep your data for as long as your account is active, so your library and listings stay available to you.',
          'To delete your account and personal data, contact us at the address below. We will remove your profile, library, listings, and photos, except where we are required to keep limited records (for example, to resolve an open report or dispute).',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Access to your private library, contact details, and account settings is restricted at the database level to your own account — no other user can read them directly, only what you choose to make public through a listing.',
        ],
      },
      {
        heading: "Children's privacy",
        body: [
          'Kitobjavonim is not directed at children under 13, and we do not knowingly collect information from them.',
        ],
      },
      {
        heading: 'Your choices',
        body: [
          'You can edit or remove your profile information, control whether your phone and Telegram are shown, and unlist or delete any book at any time from within the app.',
        ],
      },
      {
        heading: 'Changes to this policy',
        body: [
          'If we make a material change to how we handle your data, we will update this page and adjust the date above.',
        ],
      },
      {
        heading: 'Contact us',
        body: [`Questions about this policy or your data: ${SUPPORT_EMAIL}`],
      },
    ],
  },

  ru: {
    title: 'Политика конфиденциальности',
    updated: `Последнее обновление: ${LAST_UPDATED}`,
    intro:
      'Kitobjavonim («мы», «приложение») помогает вести каталог ваших книг и, по желанию, обмениваться или продавать экземпляры другим читателям. Здесь описано, какие данные мы собираем, зачем и кто их видит.',
    sections: [
      {
        heading: 'Какие данные мы собираем',
        body: [
          'Данные аккаунта: адрес электронной почты (или идентификатор, который передаёт вход через Google/Telegram), отображаемое имя и аватар.',
          'Данные профиля, которые вы указываете сами: биография, регион/район, номер телефона и имя пользователя Telegram. Телефон и Telegram показываются другим пользователям только если вы включили «Показывать телефон» / «Показывать Telegram» в настройках профиля.',
          'Ваша библиотека: добавленные книги, статус чтения, ваши личные оценки, рецензии и заметки, а также структура полок. По умолчанию это приватно и никому больше не показывается.',
          'Объявления: если вы отмечаете книгу как доступную для обмена или продажи, её состояние, цена, описание и добавленные фото становятся видны другим пользователям.',
          'Действия, необходимые для работы сервиса: когда вы запрашиваете контакты другого пользователя, запрос сохраняется (кто спросил, по какому объявлению, когда) — это нужно для ограничений добросовестного использования и чтобы владелец видел, кто обращался. Жалобы на объявления сохраняются вместе с указанными деталями для рассмотрения.',
        ],
      },
      {
        heading: 'Что видят другие пользователи',
        body: [
          'Посторонний в разделе «Обзор» видит: книгу, её состояние, цену или условия обмена, фото из объявления, а также ваше отображаемое имя, аватар, примерное местоположение (регион/район) и — только если вы включили это — номер телефона и имя в Telegram.',
          'Ваша личная библиотека, оценки, рецензии и заметки никогда никому не показываются, кроме вас, даже для книг, выставленных на обмен. С объявлением передаются только перечисленные выше поля.',
          'Телефон и Telegram никогда не видны прямо в объявлении — они раскрываются только вошедшему в систему пользователю, который нажал «Связаться с владельцем» и отправил запрос на контакт, который фиксируется.',
        ],
      },
      {
        heading: 'Третьи стороны',
        body: [
          'Мы используем Supabase для базы данных, входа в систему и хранения загруженных фото. Supabase обрабатывает данные от нашего имени в соответствии с собственными обязательствами по безопасности и конфиденциальности.',
          'Если вы входите через Google или Telegram, эти сервисы передают базовую информацию профиля, необходимую для создания аккаунта (имя, email или Telegram ID, аватар) — мы никогда не видим ваш пароль от этих аккаунтов.',
          'Мы не продаём ваши персональные данные и не используем рекламные сети или трекеры сторонних компаний.',
        ],
      },
      {
        heading: 'Хранение и удаление данных',
        body: [
          'Мы храним ваши данные, пока ваш аккаунт активен, чтобы библиотека и объявления оставались вам доступны.',
          'Чтобы удалить аккаунт и персональные данные, напишите нам по адресу ниже. Мы удалим профиль, библиотеку, объявления и фото, за исключением случаев, когда нам нужно сохранить ограниченные записи (например, для рассмотрения открытой жалобы или спора).',
        ],
      },
      {
        heading: 'Безопасность',
        body: [
          'Доступ к вашей личной библиотеке, контактным данным и настройкам аккаунта на уровне базы данных ограничен только вашим аккаунтом — никто другой не может прочитать их напрямую, кроме того, что вы сами делаете публичным через объявление.',
        ],
      },
      {
        heading: 'Конфиденциальность детей',
        body: [
          'Kitobjavonim не предназначен для детей младше 13 лет, и мы сознательно не собираем данные от них.',
        ],
      },
      {
        heading: 'Ваш выбор',
        body: [
          'Вы можете редактировать или удалять данные профиля, управлять видимостью телефона и Telegram, а также снимать с публикации или удалять любую книгу в любой момент прямо в приложении.',
        ],
      },
      {
        heading: 'Изменения этой политики',
        body: [
          'Если мы существенно изменим порядок обработки ваших данных, мы обновим эту страницу и дату выше.',
        ],
      },
      {
        heading: 'Связаться с нами',
        body: [`Вопросы об этой политике или ваших данных: ${SUPPORT_EMAIL}`],
      },
    ],
  },

  uz: {
    title: 'Maxfiylik siyosati',
    updated: `Oxirgi yangilanish: ${LAST_UPDATED}`,
    intro:
      'Kitobjavonim ("biz", "ilova") sizga oʻz kitoblaringiz katalogini yuritish va xohlasangiz, ularni boshqa oʻquvchilar bilan almashish yoki sotish imkonini beradi. Ushbu sahifada qanday maʼlumot yigʻishimiz, nima uchun va kim koʻra olishi tushuntirilgan.',
    sections: [
      {
        heading: 'Biz qanday maʼlumot yigʻamiz',
        body: [
          'Hisob maʼlumotlari: elektron pochta manzilingiz (yoki Google/Telegram orqali kirish beradigan identifikator), koʻrsatiladigan ism va profil surati.',
          'Siz oʻzingiz kiritgan profil maʼlumotlari: bio, viloyat/tuman, telefon raqami va Telegram foydalanuvchi nomi. Telefon va Telegram faqat profil sozlamalarida "Telefonni koʻrsatish" / "Telegramni koʻrsatish" yoqilgan boʻlsa, boshqa foydalanuvchilarga koʻrinadi.',
          'Kutubxonangiz: qoʻshgan kitoblaringiz, oʻqish holati, shaxsiy baholaringiz, sharhlaringiz va eslatmalaringiz, shuningdek javonlaringiz tuzilishi. Bular birlamchi holatda maxfiy boʻlib, boshqa hech kimga koʻrsatilmaydi.',
          'Eʼlonlar: agar kitobni almashish yoki sotish uchun belgilasangiz, uning holati, narxi, taʼrifi va qoʻshgan suratlaringiz boshqa foydalanuvchilarga koʻrinadigan boʻladi.',
          'Xizmatni ishga tushirish uchun zarur harakatlar: boshqa foydalanuvchining aloqa maʼlumotlarini soʻraganingizda, bu soʻrov qayd etiladi (kim, qaysi eʼlon boʻyicha, qachon soʻragani) — bu adolatli foydalanish chegaralarini taʼminlash va eʼlon egasi kim murojaat qilganini koʻrishi uchun zarur. Eʼlon haqida shikoyat qilinganda, shikoyat va unga qoʻshilgan tafsilotlar koʻrib chiqish uchun saqlanadi.',
        ],
      },
      {
        heading: 'Boshqa foydalanuvchilar nimani koʻra oladi',
        body: [
          '"Kashf etish" boʻlimini koʻrayotgan begona kishi quyidagilarni koʻradi: kitob, uning holati, narxi yoki almashish shartlari, eʼlonga qoʻshilgan suratlar, shuningdek koʻrsatiladigan ismingiz, profil suratingiz, taxminiy joylashuvingiz (viloyat/tuman) va — faqat yoqilgan boʻlsa — telefon raqamingiz va Telegram nomingiz.',
          'Shaxsiy kutubxonangiz, baholaringiz, sharhlaringiz va eslatmalaringiz hech qachon sizdan boshqa hech kimga koʻrsatilmaydi, hatto eʼlon qilingan kitoblar uchun ham. Eʼlon bilan faqat yuqorida sanab oʻtilgan maydonlar boradi.',
          'Telefon raqamingiz va Telegram nomingiz hech qachon eʼlonning oʻzida koʻrinmaydi — ular faqat tizimga kirgan va "Egasi bilan bogʻlanish"ni bosib, aloqa soʻrovini yuborgan foydalanuvchiga ochiladi, bu esa qayd etiladi.',
        ],
      },
      {
        heading: 'Uchinchi tomonlar',
        body: [
          'Maʼlumotlar bazasi, tizimga kirish va yuklangan suratlarni saqlash uchun Supabase\'dan foydalanamiz. Supabase maʼlumotlarni oʻzining xavfsizlik va maxfiylik majburiyatlariga muvofiq, biz nomimizdan qayta ishlaydi.',
          'Agar Google yoki Telegram orqali kirsangiz, bu xizmatlar hisob yaratish uchun zarur boʻlgan asosiy profil maʼlumotlarini (ism, email yoki Telegram ID, profil surati) taqdim etadi — biz hech qachon ushbu hisoblaringiz parolini koʻrmaymiz.',
          'Shaxsiy maʼlumotlaringizni sotmaymiz va reklama tarmoqlari yoki uchinchi tomon kuzatuvchilaridan foydalanmaymiz.',
        ],
      },
      {
        heading: 'Maʼlumotlarni saqlash va oʻchirish',
        body: [
          'Hisobingiz faol boʻlgan davrda maʼlumotlaringizni saqlaymiz, shunda kutubxonangiz va eʼlonlaringiz sizga doim ochiq boʻladi.',
          'Hisobingiz va shaxsiy maʼlumotlaringizni oʻchirish uchun quyidagi manzil orqali biz bilan bogʻlaning. Profilingiz, kutubxonangiz, eʼlonlaringiz va suratlaringizni oʻchiramiz, faqat ochiq shikoyat yoki nizoni koʻrib chiqish kabi hollarda cheklangan yozuvlarni saqlashimiz zarur boʻlgan holatlar bundan mustasno.',
        ],
      },
      {
        heading: 'Xavfsizlik',
        body: [
          'Shaxsiy kutubxonangiz, aloqa maʼlumotlaringiz va hisob sozlamalaringizga kirish maʼlumotlar bazasi darajasida faqat sizning hisobingiz bilan cheklangan — boshqa hech kim ularni bevosita oʻqiy olmaydi, faqat eʼlon orqali oʻzingiz ochiq qilgan narsalar bundan mustasno.',
        ],
      },
      {
        heading: 'Bolalar maxfiyligi',
        body: [
          'Kitobjavonim 13 yoshdan kichik bolalarga moʻljallanmagan va biz ulardan ataylab maʼlumot yigʻmaymiz.',
        ],
      },
      {
        heading: 'Sizning tanlovingiz',
        body: [
          'Profil maʼlumotlaringizni istalgan vaqtda ilova ichida tahrirlashingiz yoki oʻchirishingiz, telefon va Telegram koʻrinishini boshqarishingiz, shuningdek istalgan kitobni eʼlondan olib tashlashingiz yoki oʻchirishingiz mumkin.',
        ],
      },
      {
        heading: 'Ushbu siyosatdagi oʻzgarishlar',
        body: [
          'Maʼlumotlaringiz bilan ishlash tartibida sezilarli oʻzgarish qilsak, ushbu sahifani va yuqoridagi sanani yangilaymiz.',
        ],
      },
      {
        heading: 'Biz bilan bogʻlanish',
        body: [`Ushbu siyosat yoki maʼlumotlaringiz haqida savollar: ${SUPPORT_EMAIL}`],
      },
    ],
  },
};

export const TERMS_OF_SERVICE: Record<Locale, LegalDoc> = {
  en: {
    title: 'Terms of Service',
    updated: `Last updated: ${LAST_UPDATED}`,
    intro:
      'These terms govern your use of Kitobjavonim. By creating an account or using the app, you agree to them.',
    sections: [
      {
        heading: 'The service',
        body: [
          'Kitobjavonim lets you catalog the books you own and, if you choose, list copies for exchange or sale so other readers can find and contact you about them.',
          'We connect readers to each other. We are not a party to any exchange, sale, or payment between users, we do not process payments, and we do not verify the condition, authenticity, or ownership of any book listed. Any transaction you make with another user is between you and them — use judgment, and meet safely.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'You must provide accurate account information and keep your login credentials secure. You are responsible for activity on your account.',
          'One account per person. You must be old enough to enter into an agreement like this one under the laws that apply to you.',
        ],
      },
      {
        heading: 'Acceptable use',
        body: [
          'Do not list stolen, illegal, or counterfeit books, misrepresent a book\'s condition, harass or spam other users, or attempt to scrape, resell access to, or abuse the service.',
          'Do not use the contact system to send anything other than genuine interest in a listed book.',
        ],
      },
      {
        heading: 'Content you provide',
        body: [
          'You keep ownership of the reviews, notes, descriptions, and photos you add. By posting a listing, you grant us the license needed to display it to other users as part of the service — the fields your listing carries, and no more, as described in our Privacy Policy.',
          'You are responsible for what you post and confirm you have the right to post it.',
        ],
      },
      {
        heading: 'Reporting and moderation',
        body: [
          'If a listing looks wrong — misrepresented, unavailable, spam, or offensive — you can report it from the listing page. We review reports and may remove a listing or restrict an account that abuses the service. To limit abuse of the reporting feature itself, we cap how many reports one account can file in a day.',
        ],
      },
      {
        heading: 'Free and Pro plans',
        body: [
          'The free plan includes a limit on how many books you can actively list at once and how many owners you can contact per month; these limits are shown in the app and may change. A Pro plan, if and when offered, would raise or remove these limits.',
        ],
      },
      {
        heading: 'Termination',
        body: [
          'You may stop using the app at any time and request deletion of your account as described in our Privacy Policy. We may suspend or terminate an account that violates these terms.',
        ],
      },
      {
        heading: 'Disclaimers',
        body: [
          'The service is provided "as is." We do not guarantee it will be uninterrupted, error-free, or that any listing is accurate — you are responsible for verifying details with the other party before any exchange.',
        ],
      },
      {
        heading: 'Limitation of liability',
        body: [
          'To the extent permitted by law, we are not liable for disputes, losses, or damages arising from a transaction or interaction between users, or from your use of the service.',
        ],
      },
      {
        heading: 'Changes to these terms',
        body: ['We may update these terms as the app changes. Continuing to use the app after an update means you accept the revised terms.'],
      },
      {
        heading: 'Contact us',
        body: [`Questions about these terms: ${SUPPORT_EMAIL}`],
      },
    ],
  },

  ru: {
    title: 'Условия использования',
    updated: `Последнее обновление: ${LAST_UPDATED}`,
    intro:
      'Эти условия регулируют использование Kitobjavonim. Создавая аккаунт или используя приложение, вы соглашаетесь с ними.',
    sections: [
      {
        heading: 'Сервис',
        body: [
          'Kitobjavonim позволяет вести каталог ваших книг и, по желанию, выставлять экземпляры на обмен или продажу, чтобы другие читатели могли найти их и связаться с вами.',
          'Мы соединяем читателей друг с другом. Мы не являемся стороной какого-либо обмена, продажи или платежа между пользователями, не обрабатываем платежи и не проверяем состояние, подлинность или право собственности на указанные книги. Любая сделка с другим пользователем — дело между вами и им; действуйте осмотрительно и встречайтесь безопасно.',
        ],
      },
      {
        heading: 'Ваш аккаунт',
        body: [
          'Вы обязаны предоставлять достоверные данные аккаунта и хранить учётные данные в безопасности. Вы несёте ответственность за действия в своём аккаунте.',
          'Один аккаунт на человека. Вы должны быть достаточно взрослым, чтобы заключать подобные соглашения по законам, применимым к вам.',
        ],
      },
      {
        heading: 'Допустимое использование',
        body: [
          'Не выставляйте краденые, незаконные или поддельные книги, не искажайте состояние книги, не преследуйте и не спамьте других пользователей, не пытайтесь парсить сервис, перепродавать доступ к нему или злоупотреблять им.',
          'Не используйте систему контактов для чего-либо, кроме искреннего интереса к выставленной книге.',
        ],
      },
      {
        heading: 'Контент, который вы предоставляете',
        body: [
          'Вы сохраняете права на добавленные вами рецензии, заметки, описания и фото. Публикуя объявление, вы предоставляете нам лицензию, необходимую для показа его другим пользователям в рамках сервиса — только те поля, что входят в объявление, как описано в нашей Политике конфиденциальности.',
          'Вы несёте ответственность за то, что публикуете, и подтверждаете, что имеете на это право.',
        ],
      },
      {
        heading: 'Жалобы и модерация',
        body: [
          'Если объявление выглядит неправильным — искажённым, недоступным, спамом или оскорбительным, — вы можете пожаловаться прямо со страницы объявления. Мы рассматриваем жалобы и можем удалить объявление или ограничить аккаунт, злоупотребляющий сервисом. Чтобы ограничить злоупотребление самой функцией жалоб, мы ограничиваем число жалоб, которые один аккаунт может подать за день.',
        ],
      },
      {
        heading: 'Тарифы Free и Pro',
        body: [
          'Бесплатный тариф включает ограничение на число одновременно активных объявлений и число владельцев, с которыми можно связаться за месяц; эти лимиты показаны в приложении и могут меняться. Тариф Pro, если и когда будет предложен, повысит или снимет эти ограничения.',
        ],
      },
      {
        heading: 'Прекращение использования',
        body: [
          'Вы можете прекратить использование приложения в любой момент и запросить удаление аккаунта, как описано в нашей Политике конфиденциальности. Мы можем приостановить или удалить аккаунт, нарушающий эти условия.',
        ],
      },
      {
        heading: 'Отказ от гарантий',
        body: [
          'Сервис предоставляется «как есть». Мы не гарантируем его бесперебойную работу, отсутствие ошибок или достоверность объявлений — вы обязаны проверять детали с другой стороной до совершения обмена.',
        ],
      },
      {
        heading: 'Ограничение ответственности',
        body: [
          'В пределах, допустимых законом, мы не несём ответственности за споры, убытки или ущерб, возникшие из сделки или взаимодействия между пользователями, либо из использования вами сервиса.',
        ],
      },
      {
        heading: 'Изменения условий',
        body: ['Мы можем обновлять эти условия по мере развития приложения. Продолжение использования приложения после обновления означает согласие с изменёнными условиями.'],
      },
      {
        heading: 'Связаться с нами',
        body: [`Вопросы об этих условиях: ${SUPPORT_EMAIL}`],
      },
    ],
  },

  uz: {
    title: 'Foydalanish shartlari',
    updated: `Oxirgi yangilanish: ${LAST_UPDATED}`,
    intro:
      'Ushbu shartlar Kitobjavonim\'dan foydalanishingizni tartibga soladi. Hisob yaratish yoki ilovadan foydalanish orqali siz ularga rozilik bildirasiz.',
    sections: [
      {
        heading: 'Xizmat',
        body: [
          'Kitobjavonim sizga oʻz kitoblaringiz katalogini yuritish va xohlasangiz, boshqa oʻquvchilar topib, siz bilan bogʻlanishi uchun nusxalarni almashish yoki sotishga qoʻyish imkonini beradi.',
          'Biz oʻquvchilarni bir-biri bilan bogʻlaymiz. Biz foydalanuvchilar oʻrtasidagi hech qanday almashish, sotish yoki toʻlovning tarafi emasmiz, toʻlovlarni qayta ishlamaymiz va eʼlon qilingan kitobning holati, asliligi yoki egaligini tekshirmaymiz. Boshqa foydalanuvchi bilan qilgan har qanday bitimingiz sizlar oʻrtangizdagi ish — ehtiyot boʻling va xavfsiz joyda uchrashing.',
        ],
      },
      {
        heading: 'Hisobingiz',
        body: [
          'Aniq hisob maʼlumotlarini taqdim etishingiz va kirish maʼlumotlaringizni xavfsiz saqlashingiz shart. Hisobingizdagi harakatlar uchun siz javobgarsiz.',
          'Har bir shaxsga bitta hisob. Sizga tegishli qonunlarga koʻra shunday kelishuvga kirish uchun yetarlicha katta yoshda boʻlishingiz kerak.',
        ],
      },
      {
        heading: 'Ruxsat etilgan foydalanish',
        body: [
          'Oʻgʻirlangan, gʻayriqonuniy yoki soxta kitoblarni eʼlon qilmang, kitob holatini notoʻgʻri koʻrsatmang, boshqa foydalanuvchilarni bezovta qilmang yoki ularga spam yubormang, xizmatni skanerlashga, unga kirishni qayta sotishga yoki undan suiisteʼmol qilishga urinmang.',
          'Aloqa tizimidan eʼlon qilingan kitobga chinakam qiziqishdan boshqa maqsadda foydalanmang.',
        ],
      },
      {
        heading: 'Siz taqdim etadigan kontent',
        body: [
          'Qoʻshgan sharhlar, eslatmalar, taʼriflar va suratlaringizga egalik huquqi sizda qoladi. Eʼlon joylashtirish orqali siz bizga uni Maxfiylik siyosatimizda taʼriflanganidek, faqat eʼlon tarkibiga kiruvchi maydonlarni, xizmat doirasida boshqa foydalanuvchilarga koʻrsatish uchun zarur litsenziya berasiz.',
          'Joylashtirgan narsalaringiz uchun siz javobgarsiz va uni joylashtirish huquqiga ega ekanligingizni tasdiqlaysiz.',
        ],
      },
      {
        heading: 'Shikoyat va moderatsiya',
        body: [
          'Agar eʼlon notoʻgʻri koʻrinsa — notoʻgʻri taʼriflangan, mavjud boʻlmagan, spam yoki haqoratli boʻlsa — uni eʼlon sahifasidan shikoyat qilishingiz mumkin. Biz shikoyatlarni koʻrib chiqamiz va xizmatdan suiisteʼmol qilgan eʼlonni olib tashlashimiz yoki hisobni cheklashimiz mumkin. Shikoyat funksiyasining oʻzidan suiisteʼmol qilishning oldini olish uchun bitta hisob kuniga necha marta shikoyat qila olishini cheklaymiz.',
        ],
      },
      {
        heading: 'Bepul va Pro rejalar',
        body: [
          'Bepul reja bir vaqtning oʻzida nechta kitobni faol eʼlon qila olishingiz va oyiga nechta egasi bilan bogʻlana olishingiz boʻyicha chegaraga ega; bu chegaralar ilovada koʻrsatiladi va oʻzgarishi mumkin. Pro reja, taklif etilsa, ushbu chegaralarni oshiradi yoki olib tashlaydi.',
        ],
      },
      {
        heading: 'Toʻxtatish',
        body: [
          'Istalgan vaqtda ilovadan foydalanishni toʻxtatishingiz va Maxfiylik siyosatimizda taʼriflanganidek hisobingizni oʻchirishni soʻrashingiz mumkin. Biz ushbu shartlarni buzgan hisobni toʻxtatishimiz yoki oʻchirishimiz mumkin.',
        ],
      },
      {
        heading: 'Javobgarlikni istisno qilish',
        body: [
          'Xizmat "boʻlgani kabi" taqdim etiladi. Uning uzluksiz, xatosiz ishlashini yoki har qanday eʼlonning aniqligini kafolatlamaymiz — har qanday almashinuvdan oldin tafsilotlarni boshqa taraf bilan tekshirish sizning zimmangizda.',
        ],
      },
      {
        heading: 'Javobgarlikni cheklash',
        body: [
          'Qonun ruxsat bergan darajada, foydalanuvchilar oʻrtasidagi bitim yoki oʻzaro aloqadan, yoxud xizmatdan foydalanishingizdan kelib chiqadigan nizolar, yoʻqotishlar yoki zararlar uchun javobgar emasmiz.',
        ],
      },
      {
        heading: 'Ushbu shartlardagi oʻzgarishlar',
        body: ['Ilova rivojlanishi bilan ushbu shartlarni yangilashimiz mumkin. Yangilanishdan keyin ilovadan foydalanishni davom ettirish yangilangan shartlarga rozilik bildirishni anglatadi.'],
      },
      {
        heading: 'Biz bilan bogʻlanish',
        body: [`Ushbu shartlar haqida savollar: ${SUPPORT_EMAIL}`],
      },
    ],
  },
};
