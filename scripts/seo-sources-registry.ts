// Реестр источников и утверждений, которые на них стоят.
//
// Зачем файл, а не строки прямо в базе. Решение «этот источник критичный»
// принимает человек, и принимает он его по причине, которую надо где-то
// написать. В базе для причины места нет — там есть булево поле. Поэтому
// причина живёт здесь, рядом с URL, и меняется вместе с ним через git, а не
// молча через UPDATE.
//
// Как выбирались страны. Не «все, куда возят», а те, где ошибка в факте стоит
// денег или отказа прямо сейчас. Смотрели на живой пайплайн (public.clients,
// public.client_universities) и на то, что уже опубликовано в блоге:
//
//   Канада      28 вузов в работе — больше всех, и деньги там считают до цента
//   Великобритания 19 вузов + 7 поданных заявок — единственная страна, где
//               заявки уже ушли, и где сумма на счёте проверяется буквально
//   Австрия     11 вузов + две опубликованные статьи — пишем о ней и продаём
//   США          5 клиентов + опубликованная статья про визу
//
// Италия, Венгрия, Китай и ОАЭ в пайплайне есть, но официальные страницы по
// ним роботу не отдаются (см. ОТКРЫТЫЕ_ВОПРОСЫ внизу) — заводить источник,
// который не читается, значит завести пустое место с галочкой «есть».
//
// Как выбиралось critical. Вопрос ровно один: что теряет читатель, если
// написанное у нас разошлось с источником. Отказ в визе или потерянные деньги
// — critical. Неудобство — нет. Одно и то же ведомство может держать обе
// страницы, поэтому решение принимается по странице, а не по домену.
//
// Как писать утверждение. Значение должно встречаться на странице ДОСЛОВНО:
// проверка ищет место в тексте, а не смысл. Отсюда два поля вместо одного:
//
//   valueNum + unit — когда число пишется цифрами и рядом стоит валюта:
//                     1529 gbp найдётся и как «1,529», и как «1 529»
//   value           — когда написание нестандартное: «726,72 Euro» через
//                     запятую не совпадёт ни с одной формой числа 726.72
//
// Единица обязательна везде, где она есть: число без единицы подтверждается
// чем угодно. Именно так однажды китайская стипендия в 2 500 юаней
// «подтвердилась» тайской страницей, где 2,500 стояло в долларах.

export type ClaimSpec = {
  kind: string
  subject: string
  statement: string
  /** Дословная строка со страницы. Для нестандартных написаний чисел. */
  value?: string
  valueNum?: number
  unit?: string
  qualifiers?: Record<string, string | number | boolean>
  /** Своё время жизни. По умолчанию берётся из seo.claim_policy. */
  ttlDays?: number
}

export type SourceSpec = {
  url: string
  /** Вид источника из seo.claim_policy.required_kinds. */
  kind: 'official_gov' | 'ministry' | 'university_general' | 'university_program' | 'internal_expert'
  lang: string
  owner: string
  subjectKey: string
  critical: boolean
  /** Почему critical именно такой. Читает человек, который придёт менять. */
  why: string
  /** Своё расписание. Без него: 6 ч критичным, 168 ч остальным. */
  recheckHours?: number
  claims: ClaimSpec[]
}

export const ИСТОЧНИКИ: SourceSpec[] = [
  // ─────────────────────────────────────────────────────────── Великобритания
  {
    url: 'https://www.gov.uk/student-visa',
    kind: 'official_gov',
    lang: 'en',
    owner: 'GOV.UK, Home Office',
    subjectKey: 'gb',
    critical: true,
    why: 'Сбор и сроки подачи. Ошибка в сроке — пропущенное окно подачи, ошибка в сборе — деньги, которые клиент не отложил.',
    // Пошлины меняются приказом раз в год и объявляются заранее — шести часов
    // эта страница не требует, но и неделю ждать нельзя: объявление приходит
    // в рабочий день и попадает в статьи в тот же день.
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Студенческая виза Великобритании',
        statement: 'Заявление на Student visa из-за рубежа стоит £558',
        valueNum: 558,
        unit: 'gbp',
      },
      {
        kind: 'deadline',
        subject: 'Студенческая виза Великобритании',
        statement: 'Подать на визу из-за рубежа можно не раньше чем за 6 месяцев до начала курса',
        valueNum: 6,
        unit: 'months',
        qualifiers: { откуда: 'из-за рубежа' },
      },
      {
        kind: 'eligibility',
        subject: 'Студенческая виза Великобритании',
        statement: 'На Student visa подают с 16 лет; в 16 и 17 нужно согласие родителей',
        valueNum: 16,
        unit: 'years',
      },
    ],
  },
  {
    url: 'https://www.gov.uk/student-visa/money',
    kind: 'official_gov',
    lang: 'en',
    owner: 'GOV.UK, Home Office',
    subjectKey: 'gb',
    critical: true,
    why: 'Финансовое требование — самая частая причина отказа. Сумма и срок, который деньги пролежали на счёте, проверяются буквально.',
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Финансовое требование Student visa',
        statement: 'На курс в Лондоне нужно показать £1 529 в месяц, но не больше чем за 9 месяцев',
        valueNum: 1529,
        unit: 'gbp',
        qualifiers: { где: 'Лондон', период: 'месяц' },
      },
      {
        kind: 'visa_requirement',
        subject: 'Финансовое требование Student visa',
        statement: 'На курс вне Лондона нужно показать £1 171 в месяц, но не больше чем за 9 месяцев',
        valueNum: 1171,
        unit: 'gbp',
        qualifiers: { где: 'вне Лондона', период: 'месяц' },
      },
      {
        kind: 'document_req',
        subject: 'Финансовое требование Student visa',
        statement: 'Деньги должны пролежать на счёте не меньше 28 дней подряд',
        valueNum: 28,
        unit: 'days',
      },
    ],
  },
  {
    url: 'https://www.gov.uk/healthcare-immigration-application/how-much-pay',
    kind: 'official_gov',
    lang: 'en',
    owner: 'GOV.UK, Home Office',
    subjectKey: 'gb',
    critical: true,
    why: 'Медицинский сбор платят до подачи и за все годы сразу. Недосчитаться здесь — значит не подать вовремя.',
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Immigration health surcharge (IHS)',
        statement: 'Медицинский сбор для студентов и их иждивенцев — £776 за год визы',
        valueNum: 776,
        unit: 'gbp',
        qualifiers: { кто: 'студенты и иждивенцы', период: 'год' },
      },
      {
        kind: 'visa_requirement',
        subject: 'Immigration health surcharge (IHS)',
        statement: 'За двухлетнюю визу студент платит медицинский сбор £1 552 сразу',
        valueNum: 1552,
        unit: 'gbp',
        qualifiers: { срок: '2 года' },
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────── США
  {
    url: 'https://www.ice.gov/sevis/i901',
    kind: 'official_gov',
    lang: 'en',
    owner: 'U.S. Immigration and Customs Enforcement',
    subjectKey: 'us',
    critical: true,
    why: 'Сбор I-901 платится до записи на собеседование. Без квитанции визу не выдадут, и это отдельные деньги сверх визового сбора.',
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Сбор I-901 SEVIS',
        statement: 'Сбор I-901 SEVIS для виз F и M — $350',
        valueNum: 350,
        unit: 'usd',
        qualifiers: { виза: 'F, M' },
      },
      {
        kind: 'visa_requirement',
        subject: 'Сбор I-901 SEVIS',
        statement: 'Для виз J сбор I-901 SEVIS — $220',
        valueNum: 220,
        unit: 'usd',
        qualifiers: { виза: 'J' },
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────── Канада
  {
    url: 'https://ircc.canada.ca/english/information/fees/fees.asp',
    kind: 'official_gov',
    lang: 'en',
    owner: 'Immigration, Refugees and Citizenship Canada',
    subjectKey: 'ca',
    critical: true,
    why: 'Пошлина за разрешение на учёбу. Платится при подаче, ошибка в сумме останавливает подачу.',
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Разрешение на учёбу в Канаде',
        statement: 'Разрешение на учёбу, включая продление, — 150 канадских долларов с человека',
        valueNum: 150,
        unit: 'cad',
      },
    ],
  },
  {
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/apply.html',
    kind: 'official_gov',
    lang: 'en',
    owner: 'Immigration, Refugees and Citizenship Canada',
    subjectKey: 'ca',
    critical: true,
    why: 'Биометрия платится отдельно от пошлины, и без неё заявление стоит. Про этот сбор забывают чаще всего.',
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Биометрия для разрешения на учёбу',
        statement: 'Биометрия — 85 канадских долларов с человека',
        valueNum: 85,
        unit: 'cad',
        qualifiers: { кто: 'один заявитель' },
      },
      {
        kind: 'visa_requirement',
        subject: 'Биометрия для разрешения на учёбу',
        statement: 'Для семьи, подающей одновременно, биометрия стоит не больше 170 канадских долларов',
        valueNum: 170,
        unit: 'cad',
        qualifiers: { кто: 'семья' },
      },
    ],
  },
  {
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html',
    kind: 'official_gov',
    lang: 'en',
    owner: 'Immigration, Refugees and Citizenship Canada',
    subjectKey: 'ca',
    critical: true,
    why: 'Подтверждение средств. Сумма пересматривается каждый год и в 2026-м уже менялась: старая цифра в статье — это отказ.',
    // Таблица переписывается раз в год, но дата ввода новой суммы известна
    // заранее и приходит сменой строки на этой же странице. Сутки — компромисс
    // между «узнать в тот же день» и «не долбить страницу без повода».
    recheckHours: 24,
    claims: [
      {
        kind: 'visa_requirement',
        subject: 'Подтверждение средств для учёбы в Канаде',
        statement: 'Заявитель без сопровождающих показывает 23 448 канадских долларов на год жизни (кроме Квебека)',
        valueNum: 23448,
        unit: 'cad',
        qualifiers: { подача: 'с 1 сентября 2026', семья: '1 человек', регион: 'кроме Квебека' },
      },
      {
        kind: 'visa_requirement',
        subject: 'Подтверждение средств для учёбы в Канаде',
        statement: 'На заявителя с двумя членами семьи нужно 35 888 канадских долларов на год (кроме Квебека)',
        valueNum: 35888,
        unit: 'cad',
        qualifiers: { подача: 'с 1 сентября 2026', семья: '3 человека', регион: 'кроме Квебека' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────── Австрия
  {
    url: 'https://www.oeh.ac.at/service/studienbeitrag',
    kind: 'official_gov',
    lang: 'de',
    owner: 'Österreichische Hochschüler_innenschaft (ÖH)',
    subjectKey: 'at',
    critical: true,
    why: 'Двойной взнос для студентов из третьих стран — 1 453 евро в год, которых нет ни в одном «бесплатное образование в Австрии». Ошибка вдвое стоит клиенту годового бюджета.',
    claims: [
      {
        kind: 'tuition_fee',
        subject: 'Studienbeitrag в австрийских университетах',
        statement: 'Студенты из третьих стран с видом на жительство для учёбы платят двойной взнос 726,72 евро за семестр',
        value: '726,72 Euro',
        qualifiers: { кто: 'третьи страны', период: 'семестр' },
      },
      {
        kind: 'tuition_fee',
        subject: 'Studienbeitrag в австрийских университетах',
        statement: 'Обычный Studienbeitrag — 363,36 евро за семестр; его платят, превысив нормативный срок обучения больше чем на два семестра',
        value: '363,36 Euro',
        qualifiers: { кто: 'приравненные к австрийцам', период: 'семестр' },
      },
    ],
  },
  {
    url: 'https://www.oeh.ac.at/service/oeh-beitrag',
    kind: 'official_gov',
    lang: 'de',
    owner: 'Österreichische Hochschüler_innenschaft (ÖH)',
    subjectKey: 'at',
    critical: false,
    why: 'Взнос обязательный, но 26 евро. Ошибка в нём читателю ничего не стоит — предупредить достаточно раз в неделю.',
    claims: [
      {
        kind: 'tuition_fee',
        subject: 'ÖH-Beitrag',
        statement: 'Взнос студенческого союза ÖH — 26,20 евро за семестр, платят все',
        value: 'EUR 26,20',
        qualifiers: { период: 'семестр' },
      },
    ],
  },
]

/**
 * Чего не хватает и почему решает человек, а не скрипт.
 *
 * Список печатается в конце каждого прогона: вопрос, который не видно,
 * перестаёт быть вопросом и становится дырой.
 */
export const ОТКРЫТЫЕ_ВОПРОСЫ: string[] = [
  'Италия — первая страна по числу клиентов, а источника нет. studiare-in-italia.it (MUR) читается, но лежащая там процедура — за 2023/2024 учебный год: срок подачи на визу «до 30 ноября 2023». Заводить её значит заводить прошлогодний дедлайн. universitaly.it отдаёт роботу пустой каркас под JavaScript, esteri.it по прямым адресам — 404. Нужен адрес действующей процедуры на текущий год. Пока про итальянские сроки и сборы в статьях не должно быть ни одного числа.',
  'Китай — 10 утверждений про CSC (стипендии 2 500/3 000/3 500 ¥, возраст 25/35/40/45) висят неподтверждёнными с самого начала. csc.edu.cn и campuschina.org отвечают 412 на любой заголовок: так отвечает защита от ботов. Вопрос Павлу: берём ли подтверждение со страницы конкретного китайского вуза, который перепечатывает сетку CSC (это university_general, политике для scholarship соответствует), или ждём доступа к первоисточнику.',
  'Венгрия — Stipendium Hungaricum: официальный сайт отдаёт ленту новостей, последняя запись 2024 года. Дедлайн подачи оттуда брать нельзя. Нужен адрес страницы с текущим набором.',
  'ОАЭ и Словения — в пайплайне есть, официальные точки входа (u.ae, gov.si) по прямым адресам не открылись. Нужен человек, который назовёт правильную страницу.',
  'США — визовый сбор MRV ($185) остался неподтверждённым: travel.state.gov отвечает 403 роботу. Подтверждён только сбор I-901. Пока в статьях про США можно называть 350 и 220 долларов, но не визовый сбор.',
]
