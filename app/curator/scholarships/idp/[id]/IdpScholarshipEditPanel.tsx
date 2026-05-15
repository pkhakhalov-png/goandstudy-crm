'use client'

import { EditPanel, type EditableSection } from '@/app/_shared/CuratorEdit/EditPanel'
import { saveIdpScholarshipOverride } from '@/lib/curator-edit-actions'
import { getEffective } from '@/lib/curator-overrides'

interface Props {
  id: number
  row: any
}

export function IdpScholarshipEditPanel({ id, row }: Props) {
  const rd = row.raw_data
  const extras = rd?.curator_extras || {}

  function eff(field: string, fallback: any): { value: string; isOverridden: boolean; by?: any } {
    const r = getEffective(rd, field, fallback ?? '')
    const str = r.value == null ? '' : String(r.value)
    return { value: str, isOverridden: r.isOverridden, by: r.by }
  }

  const sections: EditableSection[] = [
    {
      title: 'Описание стипендии',
      fields: [
        { field: 'name', label: 'Название', type: 'text', ...eff('name', row.name || '') },
        { field: 'description', label: 'Описание', type: 'textarea', placeholder: 'Цель стипендии, кому подходит', ...eff('description', row.description || '') },
        { field: 'eligibility', label: 'Кто может подать (eligibility)', type: 'textarea', ...eff('eligibility', row.eligibility || '') },
      ],
    },
    {
      title: 'Финансы и сроки',
      fields: [
        { field: 'value_amount', label: 'Сумма', type: 'number', ...eff('value_amount', row.value_amount != null ? String(row.value_amount) : '') },
        { field: 'value_currency', label: 'Валюта', type: 'text', placeholder: 'GBP / EUR / USD', ...eff('value_currency', row.value_currency || '') },
        { field: 'value_text', label: 'Сумма (текст)', type: 'text', placeholder: 'Полное / частичное / £5,000', ...eff('value_text', row.value_text || '') },
        { field: 'funding_type', label: 'Тип финансирования', type: 'text', placeholder: 'Cash / Fee waiver', ...eff('funding_type', row.funding_type || '') },
        { field: 'application_deadline', label: 'Дедлайн', type: 'date', ...eff('application_deadline', row.application_deadline || '') },
        { field: 'level', label: 'Уровень', type: 'text', placeholder: 'Undergraduate / Masters / PhD', ...eff('level', row.level || '') },
      ],
    },
    {
      title: 'Требования',
      fields: [
        { field: 'gpa_requirement', label: 'GPA / средний балл', type: 'text', placeholder: '4.5 / 5.0', ...eff('gpa_requirement', extras.gpa_requirement || '') },
        { field: 'language_requirement', label: 'Языковые требования', type: 'text', placeholder: 'IELTS 6.5+', ...eff('language_requirement', extras.language_requirement || '') },
      ],
    },
    {
      title: 'Процесс подачи',
      fields: [
        { field: 'application_process', label: 'Как подать', type: 'textarea', placeholder: 'Шаги, документы, ссылки', ...eff('application_process', extras.application_process || '') },
        { field: 'official_url', label: 'Официальный URL', type: 'text', placeholder: 'https://...', ...eff('official_url', extras.official_url || '') },
      ],
    },
  ]

  return (
    <EditPanel
      title={row.name}
      sections={sections}
      onSave={async (field, value) => {
        return await saveIdpScholarshipOverride({ id, patch: { [field]: value } })
      }}
    />
  )
}
