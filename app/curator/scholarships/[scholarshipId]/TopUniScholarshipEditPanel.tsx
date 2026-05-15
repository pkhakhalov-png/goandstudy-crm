'use client'

import { EditPanel, type EditableSection } from '@/app/_shared/CuratorEdit/EditPanel'
import { saveTopUniScholarshipOverride } from '@/lib/curator-edit-actions'
import { getEffective } from '@/lib/curator-overrides'

interface Props {
  scholarshipId: string
  row: any
}

export function TopUniScholarshipEditPanel({ scholarshipId, row }: Props) {
  const rd = row.raw_data

  function eff(field: string, fallback: any): { value: string; isOverridden: boolean; by?: any } {
    const r = getEffective(rd, field, fallback ?? '')
    const str = r.value == null ? '' : String(r.value)
    return { value: str, isOverridden: r.isOverridden, by: r.by }
  }

  const sections: EditableSection[] = [
    {
      title: 'Описание',
      fields: [
        { field: 'title', label: 'Название', type: 'text', ...eff('title', row.title || '') },
        { field: 'description', label: 'Описание', type: 'textarea', ...eff('description', row.description || '') },
        { field: 'institution_title', label: 'Вуз', type: 'text', ...eff('institution_title', row.institution_title || '') },
      ],
    },
    {
      title: 'Финансы и сроки',
      fields: [
        { field: 'amount_text', label: 'Сумма (текст)', type: 'text', placeholder: '£5,000 / Полное', ...eff('amount_text', row.amount_text || '') },
        { field: 'amount_type', label: 'Тип суммы', type: 'text', placeholder: 'fixed / partial / full', ...eff('amount_type', row.amount_type || '') },
        { field: 'deadline', label: 'Дедлайн', type: 'date', ...eff('deadline', row.deadline || '') },
        { field: 'study_levels', label: 'Уровни обучения', type: 'text', placeholder: 'Bachelor, Master, PhD', ...eff('study_levels', Array.isArray(row.study_levels) ? row.study_levels.join(', ') : (row.study_levels || '')) },
      ],
    },
    {
      title: 'Подача',
      fields: [
        { field: 'application_type', label: 'Тип подачи', type: 'text', placeholder: 'External / Internal', ...eff('application_type', row.application_type || '') },
        { field: 'application_url', label: 'URL подачи', type: 'text', placeholder: 'https://...', ...eff('application_url', row.application_url || '') },
        { field: 'institution_url', label: 'URL вуза', type: 'text', placeholder: 'https://...', ...eff('institution_url', row.institution_url || '') },
      ],
    },
  ]

  return (
    <EditPanel
      title={row.title}
      sections={sections}
      onSave={async (field, value) => {
        return await saveTopUniScholarshipOverride({ scholarshipId, patch: { [field]: value } })
      }}
    />
  )
}
