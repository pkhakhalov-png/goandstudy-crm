'use client'

import { EditPanel, type EditableSection } from '@/app/_shared/CuratorEdit/EditPanel'
import { saveSchoolOverride } from '@/lib/curator-edit-actions'
import { getEffective } from '@/lib/curator-overrides'

interface Props {
  schoolId: number
  school: any
}

export function SchoolEditPanel({ schoolId, school }: Props) {
  const rd = school.raw_data
  const raw = rd?.attributes || {}
  const extras = rd?.curator_extras || {}

  // Helper: resolve effective value as string
  function eff(field: string, fallback: any): { value: string; isOverridden: boolean; by?: any } {
    const r = getEffective(rd, field, fallback ?? '')
    const str = r.value == null ? '' : String(r.value)
    return { value: str, isOverridden: r.isOverridden, by: r.by }
  }

  const aiDescription = school.description || ''
  const curatorNote = school.curator_note || ''
  const foundedIn = school.founded_in || raw.founded_in || ''
  const institutionType = school.institution_type || raw.institution_type || ''
  const avgTuition = school.avg_tuition != null ? String(school.avg_tuition) : ''
  const costOfLiving = school.cost_of_living != null ? String(school.cost_of_living) : ''
  const tuitionCurrency = extras.tuition_currency || raw.currency_of_fees?.code || school.currency_of_fees?.code || school.currency || ''
  const applicationFee = (() => {
    const fee = school.application_fee_range || raw.application_fee_range
    if (!fee) return ''
    if (typeof fee === 'object' && fee.value != null) return String(fee.value)
    return String(fee)
  })()
  const intakesSummary = school.intakes_summary || raw.intakes_summary || ''
  const processingTime = school.processing_time || raw.processing_time
  const processingTimeStr = (() => {
    if (typeof processingTime === 'number') return String(processingTime)
    if (typeof processingTime === 'string') return processingTime
    return ''
  })()
  const undergradLen = school.avg_program_length?.undergraduate || raw.avg_program_length?.undergraduate || ''
  const gradLen = school.avg_program_length?.graduate || raw.avg_program_length?.graduate || ''
  const videoLink = school.video_link || raw.video_link || ''
  const websiteUrl = school.website || raw.website || ''
  const address = school.address || ''
  const city = school.city || ''

  const sections: EditableSection[] = [
    {
      title: 'Тексты для клиента',
      fields: [
        {
          field: 'curator_note', label: 'Краткое описание (тизер)',
          type: 'textarea', placeholder: '1-2 предложения о вузе',
          ...eff('curator_note', curatorNote),
          hint: 'Отображается в шапке карточки вуза',
        },
        {
          field: 'description', label: 'Полное описание',
          type: 'textarea', placeholder: 'Длинное описание (можно с Markdown — ## Заголовки)',
          ...eff('description', aiDescription),
          hint: '8-15 предложений · поддерживает ## заголовки в Markdown',
        },
      ],
    },
    {
      title: 'Основное',
      fields: [
        { field: 'founded_in', label: 'Год основания', type: 'number', ...eff('founded_in', foundedIn) },
        { field: 'institution_type', label: 'Тип учреждения', type: 'text', placeholder: 'Государственный / Частный', ...eff('institution_type', institutionType) },
        { field: 'website', label: 'Сайт', type: 'text', placeholder: 'https://...', ...eff('website', websiteUrl) },
      ],
    },
    {
      title: 'Стоимость',
      fields: [
        { field: 'avg_tuition', label: `Обучение (${tuitionCurrency || 'валюта'} / год)`, type: 'number', ...eff('avg_tuition', avgTuition), hint: 'Сумма в год' },
        { field: 'tuition_currency', label: 'Валюта', type: 'text', placeholder: 'EUR / GBP / USD', ...eff('tuition_currency', tuitionCurrency) },
        { field: 'application_fee', label: 'Взнос за заявку', type: 'number', ...eff('application_fee', applicationFee) },
        { field: 'cost_of_living', label: `Жильё / жизнь (${tuitionCurrency || 'валюта'} / год)`, type: 'number', ...eff('cost_of_living', costOfLiving) },
      ],
    },
    {
      title: 'Длительность и сроки',
      fields: [
        { field: 'undergrad_length_months', label: 'Бакалавриат (мес)', type: 'number', ...eff('undergrad_length_months', undergradLen) },
        { field: 'grad_length_months', label: 'Магистратура (мес)', type: 'number', ...eff('grad_length_months', gradLen) },
        { field: 'processing_time', label: 'Обработка документов', type: 'text', placeholder: 'Например: 4-6 недель', ...eff('processing_time', processingTimeStr) },
      ],
    },
    {
      title: 'Приёмная кампания',
      fields: [
        { field: 'intakes_summary', label: 'Intake (поток)', type: 'text', placeholder: 'Сентябрь, Январь', ...eff('intakes_summary', intakesSummary) },
      ],
    },
    {
      title: 'Локация',
      fields: [
        { field: 'address', label: 'Адрес', type: 'text', ...eff('address', address) },
        { field: 'city', label: 'Город', type: 'text', ...eff('city', city) },
      ],
    },
    {
      title: 'Медиа',
      fields: [
        {
          field: 'video_link', label: 'Видео-тур (YouTube embed)', type: 'text',
          placeholder: 'https://www.youtube.com/embed/...',
          ...eff('video_link', videoLink),
          hint: 'Формат: youtube.com/embed/VIDEO_ID',
        },
      ],
    },
  ]

  return (
    <EditPanel
      title={school.name}
      sections={sections}
      onSave={async (field, value) => {
        return await saveSchoolOverride({ schoolId, patch: { [field]: value } })
      }}
    />
  )
}
