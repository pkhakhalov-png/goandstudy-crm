/**
 * Структура мотивационного письма (Personal Statement).
 * Перенесена один-в-один с UCAS Personal Statement Builder:
 * 3 секции, каждая с под-вопросами + textarea. Общий лимит 4000 символов.
 */

export type MotivationLetter = {
  /* Author */
  authorName?: string

  /* 1. Writing about the course */
  whyApplying: string
  whyInterest: string
  whySuitable: string
  studiesRelated: string

  /* 2. Skills and achievements */
  skills: string
  otherAchievements: string

  /* 3. Work experience and future plans */
  workExperience: string
  futurePlans: string
}

export const MAX_CHARS = 4000

export const INITIAL_LETTER: MotivationLetter = {
  authorName: 'Yulia Pozdnukhova',
  whyApplying:
    "I am applying for International Relations because the past four years of MUN, youth-diplomacy summits and a Final Statement at the UN CND in Vienna convinced me that the policy questions which fascinate me are best understood inside a rigorous academic programme rather than purely from the outside.",
  whyInterest:
    "What draws me to IR is the way a single negotiation table can compress economics, history and human psychology into a few hours of decision-making. Reading «Diplomacy» by Kissinger at fifteen rewired the way I watch the news — I started seeing structure where before I saw noise.",
  whySuitable:
    "Speaking Russian natively, English at C1 and French at B2 lets me read primary sources in three languages. Holding a 5.0 GPA at Primakov School while leading the school press club proved I can pair academic discipline with public output. Independent research on UN Sustainable Development Goal 17 sharpened my ability to defend a thesis under questioning.",
  studiesRelated:
    "Beyond the standard curriculum I completed the MGIMO School of Youth Diplomacy programme, two leadership academies in Switzerland, and a Gordonstoun creative-writing summer school. Each forced me to argue with people whose worldview was nothing like mine — exactly the muscle an IR degree trains every day.",
  skills:
    "Public speaking under time pressure, comparative reading across English and Russian sources, structured note-taking from live debate. I treat persuasion as a craft that improves with deliberate practice — every TED-Ed Student Talk recording goes back into my notes the same evening.",
  otherAchievements:
    "Prize-holder at the Lomonosov MSU English Olympiad and the National High School Olympiad in English; «Student of the Year» 2020-2023 at Primakov School; volunteer with the National Anti-Drug Union — running prevention lectures for younger students and helping coordinate the annual Moscow camp.",
  workExperience:
    "As a junior editor at the school press club I produced weekly English-language news roundups, interviewed visiting speakers and edited copy from younger students. Volunteering at rehab centres taught me to listen before forming an opinion — a habit I now apply to academic writing.",
  futurePlans:
    "After the bachelor's I want to specialise in international institutional reform — particularly how mid-sized states use the UN system to widen their negotiating room. The plan is a master's in international policy, then early-career work either at an embassy desk or inside a think tank that publishes in English.",
}

export type SectionKey = 'course' | 'skills' | 'work'

export type Question = {
  key: keyof MotivationLetter
  label: string
  intro?: string
  placeholder?: string
}

export const SECTION_TITLES: Record<SectionKey, string> = {
  course: 'Writing about the course',
  skills: 'Skills and achievements',
  work: 'Work experience and future plans',
}

export const SECTION_SUBTITLES: Record<SectionKey, string> = {
  course: 'О курсе и мотивации',
  skills: 'Навыки и достижения',
  work: 'Опыт и планы',
}

export const QUESTIONS: Record<SectionKey, Question[]> = {
  course: [
    {
      key: 'whyApplying',
      label: 'Why are you applying for your chosen course(s)?',
      placeholder: 'Почему вы подаёте заявку именно на эту программу? Что именно привлекло?',
    },
    {
      key: 'whyInterest',
      label: 'Why does the subject interest you?',
      placeholder: 'Что в этом предмете вас по-настоящему захватывает? Когда вы впервые им увлеклись?',
    },
    {
      key: 'whySuitable',
      label: "Why do you think you're suitable for the course(s)?",
      placeholder: 'Какие ваши качества и подготовка делают вас хорошим кандидатом для этой программы?',
    },
    {
      key: 'studiesRelated',
      label: 'Do your current or previous studies relate to the course(s) that you have chosen?',
      placeholder: 'Как текущие и прошлые занятия (школа, курсы, проекты) связаны с выбранной программой?',
    },
  ],
  skills: [
    {
      key: 'skills',
      label: 'Навыки для программы',
      intro:
        'Университеты хотят увидеть навыки, которые помогут вам на курсе и в университетской жизни. Перечислите навыки и подкрепите их доказательствами — почему вам так интересен выбранный курс.',
      placeholder: 'Аналитическое мышление, опыт работы с данными, знание Python, публичные выступления...',
    },
    {
      key: 'otherAchievements',
      label: 'Другие достижения',
      intro:
        'Включите любые достижения, которыми вы гордитесь: позиции ответственности в школе и вне, качества, которые делают вас интересным, особенным или уникальным.',
      placeholder: 'Капитан команды, волонтёрский проект, победа в олимпиаде, личный проект, роль в школьном совете...',
    },
  ],
  work: [
    {
      key: 'workExperience',
      label: 'Опыт работы и стажировок',
      intro:
        'Включите детали работ, стажировок, опыта (физического и виртуального) или волонтёрства — особенно если это относится к выбранному курсу. Попробуйте связать опыт с навыками или качествами, важными для программы.',
      placeholder: 'Стажировка в дизайн-студии, летняя подработка, волонтёрство в НКО, школьные проекты...',
    },
    {
      key: 'futurePlans',
      label: 'Будущие планы',
      intro:
        'Если вы уже знаете, чем хотели бы заниматься после окончания программы — объясните, как вы планируете использовать полученные знания и опыт.',
      placeholder: 'После программы планирую... Как эти знания помогут мне в будущей карьере...',
    },
  ],
}
