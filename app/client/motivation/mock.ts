/**
 * Структура мотивационного письма (Personal Statement).
 * Перенесена один-в-один с UCAS Personal Statement Builder:
 * 3 секции, каждая с под-вопросами + textarea. Общий лимит 4000 символов.
 */

export type MotivationLetter = {
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
  whyApplying: '',
  whyInterest: '',
  whySuitable: '',
  studiesRelated: '',
  skills: '',
  otherAchievements: '',
  workExperience: '',
  futurePlans: '',
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
