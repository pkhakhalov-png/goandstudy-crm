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

export type WorkExperienceItem = {
  id: string
  jobTitle: string
  company: string
  city: string
  startDate: string
  endDate: string
  description: string
}

export type OptionalSectionFlags = {
  hobbies?: boolean
  links?: boolean
  conferences?: boolean
  volunteering?: boolean
  olympiads?: boolean
  awards?: boolean
  workExperience?: boolean
  education?: boolean
  courses?: boolean
  skills?: boolean
  languages?: boolean
}

export type Resume = {
  personal: PersonalDetails
  links: LinkItem[]
  workExperience: WorkExperienceItem[]
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
  optional?: OptionalSectionFlags
}

export const INITIAL_RESUME: Resume = {
  personal: {
    jobTitle: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedIn: '',
    postcode: '',
    city: '',
    country: '',
    dateOfBirth: '',
    profileSummary: '',
  },
  workExperience: [],
  links: [],
  education: [
    {
      id: 'e1',
      school: '',
      degree: '',
      startDate: '',
      endDate: '',
      city: '',
      description: '',
    },
  ],
  courses: [],
  skills: [],
  skillsShowLevel: true,
  conferences: [],
  customSections: [],
  hobbies: '',
  languages: [],
  awards: [],
  volunteering: [],
  olympiads: [],
  // Только Education активна. Остальные секции добавляются клиентом
  // через кнопку «Add Section» внизу — внутри пусто, только пояснение.
  optional: {
    education: true,
    workExperience: false,
    courses: false,
    skills: false,
    languages: false,
    links: false,
    conferences: false,
    volunteering: false,
    olympiads: false,
    awards: false,
    hobbies: false,
  },
}

/* ─── Normalize loaded resume — backfill missing fields for old saved drafts ─── */

export function normalizeResume(input: any): Resume {
  const r = input || {}
  const personal = r.personal || {}
  return {
    personal: {
      jobTitle: personal.jobTitle ?? '',
      firstName: personal.firstName ?? '',
      lastName: personal.lastName ?? '',
      email: personal.email ?? '',
      phone: personal.phone ?? '',
      linkedIn: personal.linkedIn ?? '',
      postcode: personal.postcode ?? '',
      city: personal.city ?? '',
      country: personal.country ?? '',
      dateOfBirth: personal.dateOfBirth ?? '',
      profileSummary: personal.profileSummary ?? '',
    },
    links: Array.isArray(r.links) ? r.links : [],
    workExperience: Array.isArray(r.workExperience) ? r.workExperience : [],
    education: Array.isArray(r.education) ? r.education : [],
    courses: Array.isArray(r.courses) ? r.courses : [],
    skills: Array.isArray(r.skills) ? r.skills : [],
    skillsShowLevel: typeof r.skillsShowLevel === 'boolean' ? r.skillsShowLevel : true,
    conferences: Array.isArray(r.conferences) ? r.conferences : [],
    customSections: Array.isArray(r.customSections) ? r.customSections : [],
    hobbies: typeof r.hobbies === 'string' ? r.hobbies : '',
    languages: Array.isArray(r.languages) ? r.languages : [],
    awards: Array.isArray(r.awards) ? r.awards : [],
    volunteering: Array.isArray(r.volunteering) ? r.volunteering : [],
    olympiads: Array.isArray(r.olympiads) ? r.olympiads : [],
    optional: r.optional && typeof r.optional === 'object' ? r.optional : undefined,
  }
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
  { key: 'workExperience', title: 'Work Experience', emoji: '💼' },
  { key: 'education', title: 'Education', emoji: '🎓' },
  { key: 'courses', title: 'Courses', emoji: '📘' },
  { key: 'skills', title: 'Skills', emoji: '⭐' },
  { key: 'languages', title: 'Languages', emoji: '🗣️' },
  { key: 'links', title: 'Websites & Social Links', emoji: '🔗' },
  { key: 'conferences', title: 'Conferences', emoji: '📢' },
  { key: 'ted', title: 'TED Talks', emoji: '🎤' },
  { key: 'hobbies', title: 'Hobbies', emoji: '♟️' },
  { key: 'volunteering', title: 'Volunteering', emoji: '🤝' },
  { key: 'olympiads', title: 'Olympiads', emoji: '🏅' },
  { key: 'awards', title: 'Awards', emoji: '💎' },
  { key: 'extracurricular', title: 'Extracurricular Activities', emoji: '🌱' },
  { key: 'additional', title: 'Additional Experience', emoji: '💎' },
  { key: 'training', title: 'Professional Training', emoji: '🏆' },
  { key: 'references', title: 'References', emoji: '🔖' },
  { key: 'custom', title: 'Custom Section', emoji: '⚙️' },
  { key: 'header', title: 'Header & Footer', emoji: '📄', locked: true },
  { key: 'power', title: 'Power Statement', emoji: '⚡', locked: true },
  { key: 'affiliations', title: 'Affiliations', emoji: '🏛️', locked: true },
  { key: 'licenses', title: 'Licenses & Certifications', emoji: '📜', locked: true },
]
