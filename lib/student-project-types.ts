// Типы и константы «Проект студента». Не содержат server-only импортов
// → можно использовать в client components без webpack-ошибок.

export const STUDENT_PROJECT_FIELDS = [
  { key: 'level',      label: 'Уровень',       multiline: false, placeholder: 'Бакалавриат / Магистратура / PhD' },
  { key: 'specialty',  label: 'Специальность', multiline: true,  placeholder: 'product design, product management…' },
  { key: 'location',   label: 'Локация',       multiline: true,  placeholder: 'Италия, Австрия, Нидерланды…' },
  { key: 'budget',     label: 'Бюджет',        multiline: false, placeholder: 'до 17 000 € в год' },
  { key: 'start_date', label: 'Начало учёбы',  multiline: false, placeholder: 'осень 2027' },
  { key: 'english',    label: 'Английский',    multiline: false, placeholder: 'IELTS примерно 7.0' },
  { key: 'education',  label: 'Образование',   multiline: true,  placeholder: 'Вуз, направление, GPA' },
  { key: 'other',      label: 'Иное',          multiline: true,  placeholder: 'Дополнительные обстоятельства, портфолио, ограничения' },
] as const

export type StudentProjectFieldKey = typeof STUDENT_PROJECT_FIELDS[number]['key']

export type StudentProjectData = Partial<Record<StudentProjectFieldKey, string>> & {
  note?: string
  updated_at?: string
  updated_by_name?: string
}
