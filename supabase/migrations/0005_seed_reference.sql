-- =============================================================================
-- 0005_seed_reference.sql — locations and categories
--
-- Locations cover all 14 first-level divisions of Uzbekistan. Tashkent city is
-- broken out into all 12 of its districts, because "Tashkent" alone is useless
-- for deciding whether a book handoff is convenient. Other regions list their
-- principal cities — enough to make the location filter meaningful without
-- inventing 200 tuman names. Add more with a data-only insert; nothing in the
-- app hard-codes this list.
--
-- Idempotent: safe to re-run.
-- =============================================================================

insert into locations (id, parent_id, level, name_uz, name_ru, name_en, sort_order) values
  -- Regions ------------------------------------------------------------------
  ('tashkent-city',  null, 'region', 'Toshkent shahri',              'город Ташкент',            'Tashkent City',        1),
  ('tashkent-region', null, 'region', 'Toshkent viloyati',           'Ташкентская область',      'Tashkent Region',      2),
  ('samarqand',      null, 'region', 'Samarqand viloyati',           'Самаркандская область',    'Samarkand Region',     3),
  ('bukhara',        null, 'region', 'Buxoro viloyati',              'Бухарская область',        'Bukhara Region',       4),
  ('andijan',        null, 'region', 'Andijon viloyati',             'Андижанская область',      'Andijan Region',       5),
  ('fergana',        null, 'region', 'Farg''ona viloyati',           'Ферганская область',       'Fergana Region',       6),
  ('namangan',       null, 'region', 'Namangan viloyati',            'Наманганская область',     'Namangan Region',      7),
  ('qashqadaryo',    null, 'region', 'Qashqadaryo viloyati',         'Кашкадарьинская область',  'Kashkadarya Region',   8),
  ('surxondaryo',    null, 'region', 'Surxondaryo viloyati',         'Сурхандарьинская область', 'Surkhandarya Region',  9),
  ('jizzakh',        null, 'region', 'Jizzax viloyati',              'Джизакская область',       'Jizzakh Region',      10),
  ('sirdaryo',       null, 'region', 'Sirdaryo viloyati',            'Сырдарьинская область',    'Sirdarya Region',     11),
  ('navoiy',         null, 'region', 'Navoiy viloyati',              'Навоийская область',       'Navoiy Region',       12),
  ('khorezm',        null, 'region', 'Xorazm viloyati',              'Хорезмская область',       'Khorezm Region',      13),
  ('karakalpakstan', null, 'region', 'Qoraqalpog''iston Respublikasi','Республика Каракалпакстан','Karakalpakstan',      14)
on conflict (id) do update set
  name_uz = excluded.name_uz,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order;

insert into locations (id, parent_id, level, name_uz, name_ru, name_en, sort_order) values
  -- Tashkent city districts --------------------------------------------------
  ('tc-bektemir',     'tashkent-city', 'district', 'Bektemir',      'Бектемир',       'Bektemir',      1),
  ('tc-chilonzor',    'tashkent-city', 'district', 'Chilonzor',     'Чиланзар',       'Chilanzar',     2),
  ('tc-mirobod',      'tashkent-city', 'district', 'Mirobod',       'Мирабад',        'Mirobod',       3),
  ('tc-mirzo-ulugbek','tashkent-city', 'district', 'Mirzo Ulug''bek','Мирзо-Улугбек', 'Mirzo Ulugbek', 4),
  ('tc-olmazor',      'tashkent-city', 'district', 'Olmazor',       'Алмазар',        'Olmazor',       5),
  ('tc-sergeli',      'tashkent-city', 'district', 'Sergeli',       'Сергели',        'Sergeli',       6),
  ('tc-shayxontohur', 'tashkent-city', 'district', 'Shayxontohur',  'Шайхантахур',    'Shaykhantakhur',7),
  ('tc-uchtepa',      'tashkent-city', 'district', 'Uchtepa',       'Учтепа',         'Uchtepa',       8),
  ('tc-yakkasaroy',   'tashkent-city', 'district', 'Yakkasaroy',    'Яккасарай',      'Yakkasaray',    9),
  ('tc-yashnobod',    'tashkent-city', 'district', 'Yashnobod',     'Яшнабад',        'Yashnobod',    10),
  ('tc-yunusobod',    'tashkent-city', 'district', 'Yunusobod',     'Юнусабад',       'Yunusobod',    11),
  ('tc-yangihayot',   'tashkent-city', 'district', 'Yangihayot',    'Янгихаёт',       'Yangihayot',   12),

  -- Tashkent region ----------------------------------------------------------
  ('tr-nurafshon', 'tashkent-region', 'district', 'Nurafshon',   'Нурафшан', 'Nurafshon',  1),
  ('tr-chirchiq',  'tashkent-region', 'district', 'Chirchiq',    'Чирчик',   'Chirchik',   2),
  ('tr-olmaliq',   'tashkent-region', 'district', 'Olmaliq',     'Алмалык',  'Olmaliq',    3),
  ('tr-angren',    'tashkent-region', 'district', 'Angren',      'Ангрен',   'Angren',     4),
  ('tr-bekobod',   'tashkent-region', 'district', 'Bekobod',     'Бекабад',  'Bekobod',    5),
  ('tr-yangiyol',  'tashkent-region', 'district', 'Yangiyo''l',  'Янгиюль',  'Yangiyul',   6),
  ('tr-parkent',   'tashkent-region', 'district', 'Parkent',     'Паркент',  'Parkent',    7),

  -- Samarkand ----------------------------------------------------------------
  ('sa-samarqand',    'samarqand', 'district', 'Samarqand',       'Самарканд',   'Samarkand',    1),
  ('sa-kattaqorgon',  'samarqand', 'district', 'Kattaqo''rg''on', 'Каттакурган', 'Kattakurgan',  2),
  ('sa-urgut',        'samarqand', 'district', 'Urgut',           'Ургут',       'Urgut',        3),
  ('sa-jomboy',       'samarqand', 'district', 'Jomboy',          'Джамбай',     'Jomboy',       4),

  -- Bukhara ------------------------------------------------------------------
  ('bu-buxoro',    'bukhara', 'district', 'Buxoro',      'Бухара',    'Bukhara',   1),
  ('bu-kogon',     'bukhara', 'district', 'Kogon',       'Каган',     'Kogon',     2),
  ('bu-gijduvon',  'bukhara', 'district', 'G''ijduvon',  'Гиждуван',  'Gijduvan',  3),

  -- Andijan ------------------------------------------------------------------
  ('an-andijon',   'andijan', 'district', 'Andijon',    'Андижан',   'Andijan',    1),
  ('an-asaka',     'andijan', 'district', 'Asaka',      'Асака',     'Asaka',      2),
  ('an-xonobod',   'andijan', 'district', 'Xonobod',    'Ханабад',   'Khonobod',   3),
  ('an-shahrixon', 'andijan', 'district', 'Shahrixon',  'Шахрихан',  'Shahrikhan', 4),

  -- Fergana ------------------------------------------------------------------
  ('fa-fargona',   'fergana', 'district', 'Farg''ona',   'Фергана',  'Fergana',   1),
  ('fa-qoqon',     'fergana', 'district', 'Qo''qon',     'Коканд',   'Kokand',    2),
  ('fa-margilon',  'fergana', 'district', 'Marg''ilon',  'Маргилан', 'Margilan',  3),
  ('fa-quva',      'fergana', 'district', 'Quva',        'Кува',     'Quva',      4),

  -- Namangan -----------------------------------------------------------------
  ('na-namangan',   'namangan', 'district', 'Namangan',       'Наманган',   'Namangan',   1),
  ('na-chust',      'namangan', 'district', 'Chust',          'Чуст',       'Chust',      2),
  ('na-pop',        'namangan', 'district', 'Pop',            'Пап',        'Pop',        3),
  ('na-toraqorgon', 'namangan', 'district', 'To''raqo''rg''on','Туракурган', 'Turakurgan', 4),

  -- Kashkadarya --------------------------------------------------------------
  ('qa-qarshi',      'qashqadaryo', 'district', 'Qarshi',      'Карши',      'Karshi',      1),
  ('qa-shahrisabz',  'qashqadaryo', 'district', 'Shahrisabz',  'Шахрисабз',  'Shakhrisabz', 2),
  ('qa-kitob',       'qashqadaryo', 'district', 'Kitob',       'Китаб',      'Kitob',       3),
  ('qa-muborak',     'qashqadaryo', 'district', 'Muborak',     'Мубарек',    'Muborak',     4),

  -- Surkhandarya -------------------------------------------------------------
  ('su-termiz',   'surxondaryo', 'district', 'Termiz',     'Термез', 'Termez',   1),
  ('su-denov',    'surxondaryo', 'district', 'Denov',      'Денау',  'Denov',    2),
  ('su-shorchi',  'surxondaryo', 'district', 'Sho''rchi',  'Шурчи',  'Shorchi',  3),

  -- Jizzakh ------------------------------------------------------------------
  ('ji-jizzax',    'jizzakh', 'district', 'Jizzax',        'Джизак',    'Jizzakh',   1),
  ('ji-gallaorol', 'jizzakh', 'district', 'G''allaorol',   'Галляарал', 'Gallaorol', 2),
  ('ji-zomin',     'jizzakh', 'district', 'Zomin',         'Зомин',     'Zomin',     3),

  -- Sirdarya -----------------------------------------------------------------
  ('si-guliston', 'sirdaryo', 'district', 'Guliston',  'Гулистан', 'Gulistan', 1),
  ('si-yangiyer', 'sirdaryo', 'district', 'Yangiyer',  'Янгиер',   'Yangiyer', 2),
  ('si-shirin',   'sirdaryo', 'district', 'Shirin',    'Ширин',    'Shirin',   3),

  -- Navoiy -------------------------------------------------------------------
  ('nv-navoiy',    'navoiy', 'district', 'Navoiy',     'Навои',     'Navoiy',    1),
  ('nv-zarafshon', 'navoiy', 'district', 'Zarafshon',  'Зарафшан',  'Zarafshan', 2),
  ('nv-karmana',   'navoiy', 'district', 'Karmana',    'Кармана',   'Karmana',   3),

  -- Khorezm ------------------------------------------------------------------
  ('kh-urganch',  'khorezm', 'district', 'Urganch',   'Ургенч',    'Urgench',  1),
  ('kh-xiva',     'khorezm', 'district', 'Xiva',      'Хива',      'Khiva',    2),
  ('kh-hazorasp', 'khorezm', 'district', 'Hazorasp',  'Хазарасп',  'Hazorasp', 3),

  -- Karakalpakstan -----------------------------------------------------------
  ('kk-nukus',    'karakalpakstan', 'district', 'Nukus',       'Нукус',    'Nukus',    1),
  ('kk-xojayli',  'karakalpakstan', 'district', 'Xo''jayli',   'Ходжейли', 'Khojayli', 2),
  ('kk-chimboy',  'karakalpakstan', 'district', 'Chimboy',     'Чимбай',   'Chimboy',  3),
  ('kk-beruniy',  'karakalpakstan', 'district', 'Beruniy',     'Беруни',   'Beruniy',  4)
on conflict (id) do update set
  parent_id = excluded.parent_id,
  name_uz = excluded.name_uz,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------

insert into categories (id, name_uz, name_ru, name_en, sort_order) values
  ('fiction',        'Badiiy adabiyot',     'Художественная литература', 'Fiction',            1),
  ('non-fiction',    'Badiiy bo''lmagan',   'Нон-фикшн',                 'Non-fiction',        2),
  ('business',       'Biznes',              'Бизнес',                    'Business',           3),
  ('psychology',     'Psixologiya',         'Психология',                'Psychology',         4),
  ('self-help',      'Shaxsiy rivojlanish', 'Саморазвитие',              'Self-development',   5),
  ('history',        'Tarix',               'История',                   'History',            6),
  ('science',        'Fan',                 'Наука',                     'Science',            7),
  ('technology',     'Texnologiya',         'Технологии',                'Technology',         8),
  ('biography',      'Biografiya',          'Биография',                 'Biography',          9),
  ('children',       'Bolalar adabiyoti',   'Детская литература',        'Children',          10),
  ('education',      'Darsliklar',          'Учебники',                  'Textbooks',         11),
  ('languages',      'Til o''rganish',      'Изучение языков',           'Language learning', 12),
  ('religion',       'Din',                 'Религия',                   'Religion',          13),
  ('poetry',         'She''riyat',          'Поэзия',                    'Poetry',            14),
  ('art',            'San''at',             'Искусство',                 'Art',               15),
  ('health',         'Sog''liq',            'Здоровье',                  'Health',            16),
  ('cooking',        'Pazandachilik',       'Кулинария',                 'Cooking',           17),
  ('travel',         'Sayohat',             'Путешествия',               'Travel',            18),
  ('law',            'Huquq',               'Право',                     'Law',               19),
  ('other',          'Boshqa',              'Другое',                    'Other',             99)
on conflict (id) do update set
  name_uz = excluded.name_uz,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order;
