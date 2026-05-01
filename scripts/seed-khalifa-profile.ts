/**
 * Сид паспорта Khalifa University Bachelor.
 * Источник данных: ku.ac.ae/undergraduate-admissions, ugapply.ku.ac.ae/apply
 * Дата сбора: 2026-05-01
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const PROFILE_FIELDS = [
  // Базовая идентификация
  { key: 'first_name_latin', label: 'Имя (латиница)', type: 'text', required: true, group: 'identity', notes: 'Точно как в паспорте' },
  { key: 'last_name_latin', label: 'Фамилия (латиница)', type: 'text', required: true, group: 'identity', notes: 'Точно как в паспорте' },
  { key: 'middle_name_latin', label: 'Отчество (латиница)', type: 'text', required: false, group: 'identity' },
  { key: 'date_of_birth', label: 'Дата рождения', type: 'date', required: true, group: 'identity' },
  { key: 'gender', label: 'Пол', type: 'select', options: ['Male', 'Female'], required: true, group: 'identity' },
  { key: 'nationality', label: 'Гражданство', type: 'text', required: true, group: 'identity' },
  { key: 'place_of_birth', label: 'Место рождения (город, страна)', type: 'text', required: true, group: 'identity' },

  // Паспорт
  { key: 'passport_number', label: 'Номер паспорта', type: 'text', required: true, group: 'passport' },
  { key: 'passport_issued_country', label: 'Страна выдачи паспорта', type: 'text', required: true, group: 'passport' },
  { key: 'passport_issue_date', label: 'Дата выдачи паспорта', type: 'date', required: true, group: 'passport' },
  { key: 'passport_expiry_date', label: 'Срок действия паспорта', type: 'date', required: true, group: 'passport', notes: 'Должен быть действителен минимум 6 месяцев на момент въезда' },

  // Контакты
  { key: 'phone', label: 'Телефон (с кодом страны)', type: 'phone', required: true, group: 'contact' },
  { key: 'home_address', label: 'Домашний адрес (на английском)', type: 'textarea', required: true, group: 'contact' },
  { key: 'home_city', label: 'Город', type: 'text', required: true, group: 'contact' },
  { key: 'home_country', label: 'Страна', type: 'text', required: true, group: 'contact' },
  { key: 'home_postal_code', label: 'Почтовый индекс', type: 'text', required: false, group: 'contact' },

  // Школа
  { key: 'high_school_name', label: 'Название школы (на английском)', type: 'text', required: true, group: 'education' },
  { key: 'high_school_country', label: 'Страна школы', type: 'text', required: true, group: 'education' },
  { key: 'curriculum_type', label: 'Учебный план', type: 'select', options: ['UAE General Secondary', 'American', 'British (A-Level)', 'British (IGCSE/GCSE)', 'International Baccalaureate (IB)', 'CBSE (India)', 'SABIS', 'Pakistani', 'Russian', 'Other'], required: true, group: 'education' },
  { key: 'graduation_year', label: 'Год выпуска', type: 'number', required: true, group: 'education' },
  { key: 'gpa_or_grade', label: 'GPA / средний балл', type: 'text', required: true, group: 'education', notes: 'UAE: 80%+ для Advanced, 90%+ для General. American/CBSE/SABIS: 80%+. A-Level: C+. IB: 24+' },

  // Английский
  { key: 'english_test_type', label: 'Тип теста по английскому', type: 'select', options: ['IELTS Academic', 'TOEFL iBT', 'Не сдан'], required: true, group: 'english', notes: 'IELTS ≥ 6.0 или TOEFL iBT ≥ 79' },
  { key: 'english_test_score_overall', label: 'Общий балл', type: 'text', required: true, group: 'english' },
  { key: 'english_test_date', label: 'Дата сдачи теста', type: 'date', required: false, group: 'english' },

  // Стандартизированные тесты (опционально)
  { key: 'sat_total', label: 'SAT total (опционально)', type: 'number', required: false, group: 'standardized' },
  { key: 'sat_math', label: 'SAT Math (опционально, ≥700 рекомендуется)', type: 'number', required: false, group: 'standardized' },

  // Программа
  { key: 'intended_major', label: 'Желаемая специальность', type: 'text', required: true, group: 'program', notes: 'Основной выбор. Можно указать второй и третий ниже' },
  { key: 'intended_major_2', label: 'Второй вариант (опционально)', type: 'text', required: false, group: 'program' },
  { key: 'intended_major_3', label: 'Третий вариант (опционально)', type: 'text', required: false, group: 'program' },
]

const DOCUMENTS_REQUIRED = [
  { key: 'passport', label: 'Копия паспорта', format: 'pdf', max_mb: 5, language: 'EN', required: true, notes: 'Страница с фото + страница с подписью' },
  { key: 'passport_photo', label: 'Фото на паспорт', format: 'jpg|png', max_mb: 2, required: true, notes: 'Белый фон, лицо в центре, без головных уборов кроме религиозных' },
  { key: 'high_school_diploma_attested', label: 'Аттестат школы (заверенный)', format: 'pdf', max_mb: 10, language: 'EN', required: true, notes: 'Должен быть переведён на английский и заверен (apostille для не-UAE документов)' },
  { key: 'high_school_transcript', label: 'Транскрипт оценок', format: 'pdf', max_mb: 10, language: 'EN', required: true, notes: 'Полные оценки по всем годам обучения' },
  { key: 'english_test_certificate', label: 'Сертификат IELTS / TOEFL', format: 'pdf', max_mb: 5, language: 'EN', required: true, notes: 'IELTS ≥ 6.0 или TOEFL iBT ≥ 79' },
  { key: 'good_conduct_certificate', label: 'Справка о благонадёжности (Good Conduct Certificate)', format: 'pdf', max_mb: 5, language: 'EN', required: true, notes: 'Из полиции страны проживания, переведённая на английский' },
  { key: 'video_interview', label: 'Видео-интервью', format: 'mp4|mov', max_mb: 200, required: true, notes: '2–3 минуты на английском: представься, расскажи почему Khalifa и почему именно эта специальность' },
  { key: 'sat_certificate', label: 'Сертификат SAT (опционально)', format: 'pdf', max_mb: 3, required: false, notes: 'Усиливает заявку, особенно SAT Math 700+' },
  { key: 'emirates_id', label: 'Emirates ID', format: 'pdf', max_mb: 3, required: false, notes: 'Только для граждан/резидентов UAE' },
]

const ESSAYS_REQUIRED = [
  {
    key: 'personal_statement',
    label: 'Personal Statement',
    prompt: 'Why Khalifa University? Why this major? How does this fit your career goals?',
    min_words: 300,
    max_words: 500,
    required: true,
    notes: 'Стандартное эссе для UG-приёма. Видео-интервью не заменяет — нужны оба',
  },
]

const EXTERNAL_STEPS = [
  {
    key: 'moe_equivalency',
    label: 'MOE Equivalency (приравнивание аттестата)',
    url: 'https://www.moe.gov.ae/Ar/EServices/Pages/EquivalencyCertificate.aspx',
    required: true,
    notes: 'Министерство образования UAE приравнивает иностранный аттестат к локальному. Делается онлайн, занимает 1–4 недели. Без этого Khalifa не примет документы',
  },
]

const INTAKES = [
  {
    name: 'Fall 2026',
    deadline_intl: '2026-03-02',
    deadline_uae: '2026-03-02',
    start_date: '2026-09-01',
    status: 'closed',
    notes: 'Приём закрыт 2 марта 2026',
  },
  {
    name: 'Fall 2027',
    deadline_intl: '2027-03-02',
    deadline_uae: '2027-03-02',
    start_date: '2027-09-01',
    status: 'opens_oct_2026',
    notes: 'Откроется примерно в ноябре 2026 для иностранцев',
  },
]

async function main() {
  const profile = {
    school_name: 'Khalifa University of Science and Technology',
    country_code: 'AE',
    level: 'bachelor' as const,
    portal_url: 'https://ugapply.ku.ac.ae/apply',
    registration_url: 'https://ugapply.ku.ac.ae/apply',
    application_fee_amount: 0,
    application_fee_currency: 'AED',
    profile_fields_required: PROFILE_FIELDS,
    documents_required: DOCUMENTS_REQUIRED,
    essays_required: ESSAYS_REQUIRED,
    external_steps: EXTERNAL_STEPS,
    intakes: INTAKES,
    is_active: true,
  }

  const { data: existing } = await sb
    .from('school_application_profiles')
    .select('id, school_name, level')
    .eq('school_name', profile.school_name)
    .eq('level', profile.level)
    .maybeSingle()

  if (existing) {
    const { error } = await sb
      .from('school_application_profiles')
      .update({ ...profile, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
    console.log('updated existing profile:', existing.id)
  } else {
    const { data, error } = await sb
      .from('school_application_profiles')
      .insert(profile)
      .select('id')
      .single()
    if (error) throw error
    console.log('created new profile:', data.id)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
