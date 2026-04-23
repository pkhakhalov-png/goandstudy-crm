/**
 * Структура и seed-данные резюме. Перенесена один-в-один
 * со скриншотов resume.io (кейс Yulia Pozdnukhova) — чтобы
 * дать куратору / клиенту полный пример заполнения.
 *
 * Когда появится таблица `client_resumes` в Supabase — меняем
 * только источник, типы остаются.
 */

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'
export type LanguageLevel =
  | 'Beginner'
  | 'Intermediate'
  | 'Good command'
  | 'Very good command'
  | 'Highly proficient'
  | 'Native speaker'

export type PersonalDetails = {
  jobTitle: string
  firstName: string
  lastName: string
  email: string
  phone: string
  linkedIn: string
  postcode: string
  city: string
  country: string
  dateOfBirth: string
  profileSummary: string
}

export type LinkItem = { id: string; title: string; url: string }

export type EducationItem = {
  id: string
  school: string
  degree: string
  startDate: string
  endDate: string
  city: string
  description: string
}

export type CourseItem = {
  id: string
  title: string
  city?: string
  year?: string
  description?: string
}

export type SkillItem = { id: string; name: string; level: SkillLevel }

export type ConferenceItem = {
  id: string
  title: string
  city?: string
  date: string
  description: string
}

export type CustomSectionItem = {
  id: string
  title: string
  subtitle?: string
  date?: string
  description?: string
}

export type CustomSection = {
  id: string
  title: string
  items: CustomSectionItem[]
}

export type LanguageItem = { id: string; name: string; level: LanguageLevel }

export type AwardItem = { id: string; title: string; year?: string; description?: string }

export type VolunteeringItem = {
  id: string
  title: string
  city: string
  startDate: string
  endDate: string
  description: string
}

export type OlympiadItem = { id: string; title: string; year: string; description?: string }

export type Resume = {
  personal: PersonalDetails
  links: LinkItem[]
  education: EducationItem[]
  courses: CourseItem[]
  skills: SkillItem[]
  skillsShowLevel: boolean
  conferences: ConferenceItem[]
  customSections: CustomSection[]
  hobbies: string
  languages: LanguageItem[]
  awards: AwardItem[]
  volunteering: VolunteeringItem[]
  olympiads: OlympiadItem[]
}

export const INITIAL_RESUME: Resume = {
  personal: {
    jobTitle: '',
    firstName: 'Yulia',
    lastName: 'Pozdnukhova',
    email: 'j.pozdnukhova@gmail.com',
    phone: '+7 985 433 41 14',
    linkedIn: '',
    postcode: '',
    city: '',
    country: '',
    dateOfBirth: '19.05.2006',
    profileSummary: '',
  },
  links: [
    { id: 'l1', title: 'TED Ed (Speech)', url: 'https://youtu.be/c6C27CCVa6Q' },
    { id: 'l2', title: 'UN Speech', url: 'https://media.un.org/en/asset/k1e/k1e7dh9qbk' },
  ],
  education: [
    {
      id: 'e1',
      school: 'Primakov School',
      degree: 'High School Diploma',
      startDate: '2019',
      endDate: 'Present',
      city: 'Odintsovo',
      description:
        "Top 10 schools in Spear's Magazine's Second Annual Global Schools Index\n\nReceived educational grant (100%) from 2022/2023 and 2023/2024 academic years\n\nCurrent GPA 5.0 out of 5.0",
    },
    {
      id: 'e2',
      school: 'Odintsovo Linguistic Gymnasium',
      degree: '',
      startDate: '2013',
      endDate: '2019',
      city: 'Odintsovo',
      description: 'GPA 5.0 out of 5.0',
    },
  ],
  courses: [
    { id: 'c1', title: 'Swiss International Leadership Camp and Academy', city: 'Lausanne', description: 'Leadership program. Attended twice in 2022 and 2023' },
    { id: 'c2', title: 'International School of Youth Diplomacy (MGIMO University)', city: 'Moscow', year: '2021', description: 'Program: Introduction to International Relations and International Politics' },
    { id: 'c3', title: 'Gordonstoun International Summer School', city: 'Elgin', year: '2019', description: 'English as an Additional Language program, Literature and Creative Writing program. Attended in 2017, 2018 and 2019' },
    { id: 'c4', title: 'Caterham School', city: 'Surrey', year: '2016', description: 'English and Performing Arts program' },
  ],
  skills: [
    { id: 's1', name: 'Leadership and Teamwork', level: 'Expert' },
    { id: 's2', name: 'Communication Skills', level: 'Expert' },
    { id: 's3', name: 'Language Proficiency', level: 'Expert' },
    { id: 's4', name: 'Critical Thinking', level: 'Expert' },
    { id: 's5', name: 'Cross-Cultural Competence', level: 'Expert' },
    { id: 's6', name: 'Public Speaking and Presentation Skills', level: 'Expert' },
    { id: 's7', name: 'Computer and Technological Skills', level: 'Expert' },
  ],
  skillsShowLevel: true,
  conferences: [
    {
      id: 'cf1',
      title: 'UNODC Youth Forum',
      city: 'Vienna',
      date: 'Mar 2023',
      description:
        'Participant; Speaker of the Final Statement at the 66th Session of the Commission on Narcotic Drugs (CND).\nLink to the speech (from 45:51 min): https://media.un.org/en/asset/k1e/k1e7dh9qbk',
    },
    {
      id: 'cf2',
      title: 'Conferences from Diplomatic Academy of the Ministry of Foreign Affairs of Russia',
      date: 'Mar 2023 – Apr 2023',
      description:
        '• Visit to the Cuban Embassy\n• Visit to the UN Information Centre in Moscow, learning about its tasks and functions\n• UN Model topic: "Migration and World Development"',
    },
    {
      id: 'cf3',
      title: 'Briefing with the former minister of Foreign Affairs of Austria during her visit to Primakov School',
      date: 'Dec 2021',
      description: '',
    },
    {
      id: 'cf4',
      title: 'Conferences: The role of the Russian youth in international cooperation',
      city: 'Berlin',
      date: 'Nov 2021',
      description:
        '• Visit to the Reichstag (meeting with party representatives)\n• Visit to the Russian Embassy (meeting with the ambassador)\n• Visit to the Russian House',
    },
    {
      id: 'cf5',
      title: "International Model UN Impact's Global Summit 2.0",
      date: 'Oct 2020',
      description: 'Topic: Driving Action and Impact for the SDG',
    },
    {
      id: 'cf6',
      title: 'International Model UN (MUN Impact)',
      date: 'Jul 2020',
      description: 'Topic: SDG 17, Target 17.7. Promote sustainable technologies to developing countries',
    },
  ],
  customSections: [
    {
      id: 'cs1',
      title: 'TED Ed Student Talks',
      items: [
        {
          id: 'ted1',
          title: 'Topic: How to Find Your Fulcrum',
          date: 'Jun 2023',
          description: 'Certificate of Achievement.\nLink to YouTube: https://youtu.be/c6C27CCVa6Q',
        },
      ],
    },
  ],
  hobbies: 'Ballet, modern contemporary art.\n\nVolleyball, basketball, extreme sports (wakeboarding, paragliding, gorge walking).',
  languages: [
    { id: 'lang1', name: 'Russian', level: 'Native speaker' },
    { id: 'lang2', name: 'English', level: 'Highly proficient' },
    { id: 'lang3', name: 'French', level: 'Very good command' },
  ],
  awards: [
    { id: 'a1', title: '«Student of the Year» — excellent academic results', year: '2020 – 2023' },
    { id: 'a2', title: '«Leader of the Year» — positive attitude in life and active participation in school social events', year: '2021 / 2023' },
    { id: 'a3', title: '«Olympic Star» — high performance in scholarships', year: '2022 / 2023' },
    { id: 'a4', title: '«Champion of the Year» — sports performance leader', year: '2022 / 2023' },
  ],
  volunteering: [
    {
      id: 'v1',
      title: 'Volunteer',
      city: 'Moscow',
      startDate: '2021',
      endDate: 'Present',
      description:
        'A volunteer of the National Anti-Drug Union in Russia.\n• Lectures on drug use prevention for junior schoolchildren\n• Organisation of the annual anti-drug camp in Moscow\n• Visits to rehab centres',
    },
  ],
  olympiads: [
    { id: 'o1', title: 'Prize holder of the Lomonosov Moscow State University Olympiad in English', year: '2023' },
    { id: 'o2', title: 'Prize holder of the regional stage of the National High School Olympiad in French', year: '2022' },
    { id: 'o3', title: 'Winner of the High School of Economics Olympiad «The Highest Standard» (English)', year: '2022' },
    { id: 'o4', title: 'Prize holder of the final (national) stage of the National High School Olympiad in English', year: '2022' },
    { id: 'o5', title: 'Winner of the Moscow Olympiad for school students in English', year: '2021' },
  ],
}

/* ─── Available add-section templates ─── */

export type SectionTemplate = {
  key: string
  title: string
  emoji: string
  locked?: boolean
  hint?: string
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  { key: 'custom', title: 'Custom Section', emoji: '⚙️' },
  { key: 'header', title: 'Header & Footer', emoji: '📄', locked: true },
  { key: 'training', title: 'Professional Training', emoji: '🎓' },
  { key: 'extracurricular', title: 'Extracurricular Activities', emoji: '🌱' },
  { key: 'additional', title: 'Additional Experience', emoji: '💼' },
  { key: 'conferences', title: 'Conferences', emoji: '📢', locked: true, hint: 'уже в резюме' },
  { key: 'volunteering', title: 'Volunteering', emoji: '🤝', locked: true, hint: 'уже в резюме' },
  { key: 'hobbies', title: 'Hobbies', emoji: '♟️', locked: true, hint: 'уже в резюме' },
  { key: 'languages', title: 'Languages', emoji: '🗣️', locked: true, hint: 'уже в резюме' },
  { key: 'references', title: 'References', emoji: '🔖' },
  { key: 'power', title: 'Power Statement', emoji: '⚡', locked: true },
  { key: 'awards', title: 'Awards', emoji: '💎', locked: true, hint: 'уже в резюме' },
  { key: 'affiliations', title: 'Affiliations', emoji: '🏛️', locked: true },
  { key: 'licenses', title: 'Licenses & Certifications', emoji: '📜', locked: true },
]
