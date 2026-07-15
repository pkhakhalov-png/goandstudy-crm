'use client'

import { EditPanel, type EditableSection } from '@/app/_shared/CuratorEdit/EditPanel'
import { saveProgramOverride } from '@/lib/curator-edit-actions'
import { getEffective } from '@/lib/curator-overrides'

interface Props {
  programId: number
  program: any
  curatorData?: any
}

export function ProgramEditPanel({ programId, program, curatorData }: Props) {
  const rd = program.raw_data
  const attr = rd?.attributes || {}

  function eff(field: string, fallback: any): { value: string; isOverridden: boolean; by?: any } {
    const r = getEffective(rd, field, fallback ?? '')
    const str = r.value == null ? '' : String(r.value)
    return { value: str, isOverridden: r.isOverridden, by: r.by }
  }

  const description = attr.description
    ? String(attr.description).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    : program.description || ''

  const tuition = program.tuition != null ? String(program.tuition) : ''
  const appFee = (program.application_fee ?? attr.application_fee) != null
    ? String(program.application_fee ?? attr.application_fee) : ''
  const currency = attr.currency_of_fees?.code || attr.currency?.code || ''
  const levelText = program.degree_text || attr.level_text || program.program_level_text || ''
  const lengthText = curatorData?.program_length_text || program.duration_text || ''
  const minLength = attr.min_length != null ? String(attr.min_length) : ''
  const intakeText = curatorData?.earliest_intake_label || program.start_date_text || ''
  const deadline = attr.earliest_intake?.submission_deadline || ''
  const language = program.language_text || attr.language_of_instruction || program.language || ''
  const ieltsMin = curatorData?.ielts_min != null ? String(curatorData.ielts_min) : ''
  const toeflMin = curatorData?.toefl_min != null ? String(curatorData.toefl_min) : ''
  const pteMin = curatorData?.pte_min != null ? String(curatorData.pte_min) : ''
  const duolingoMin = curatorData?.duolingo_min != null ? String(curatorData.duolingo_min) : ''
  const minEducationLevel = curatorData?.min_education_level || ''
  const minGpaPercent = curatorData?.min_gpa_percent != null ? String(curatorData.min_gpa_percent) : ''
  const tuitionDeposit = attr.tuition_deposit?.amount != null ? String(attr.tuition_deposit.amount) : ''
  const curatorNote = program.curator_note || ''
  const entryRequirements = Array.isArray(program.entry_requirements) ? program.entry_requirements.join('\n') : ''

  const sections: EditableSection[] = [
    {
      title: 'Заметка куратора',
      fields: [
        {
          field: 'curator_note', label: 'Заметка куратора',
          type: 'textarea', placeholder: 'Ключевое про программу: сроки, нюансы поступления, на что обратить внимание',
          ...eff('curator_note', curatorNote),
        },
      ],
    },
    {
      title: 'Описание',
      fields: [
        {
          field: 'description', label: 'Описание программы',
          type: 'textarea', placeholder: 'О чём программа, для кого, что даёт',
          ...eff('description', description),
        },
      ],
    },
    {
      title: 'Сводка программы',
      fields: [
        { field: 'level_text', label: 'Уровень', type: 'text', placeholder: 'Bachelor / Master / PhD', ...eff('level_text', levelText) },
        { field: 'length_text', label: 'Длительность (текст)', type: 'text', placeholder: '3 года / 4 семестра', ...eff('length_text', lengthText) },
        { field: 'min_length_months', label: 'Длительность (мес)', type: 'number', ...eff('min_length_months', minLength) },
        { field: 'intake_text', label: 'Старт обучения', type: 'text', placeholder: 'Сентябрь 2026', ...eff('intake_text', intakeText) },
        { field: 'application_deadline', label: 'Дедлайн заявки', type: 'date', ...eff('application_deadline', deadline) },
        { field: 'language', label: 'Язык обучения', type: 'text', placeholder: 'English / Deutsch', ...eff('language', language) },
      ],
    },
    {
      title: 'Стоимость',
      fields: [
        { field: 'tuition', label: `Стоимость обучения (${currency || 'валюта'})`, type: 'number', ...eff('tuition', tuition), hint: 'За год' },
        { field: 'currency', label: 'Валюта', type: 'text', placeholder: 'EUR / GBP / USD', ...eff('currency', currency) },
        { field: 'application_fee', label: 'Application fee', type: 'number', ...eff('application_fee', appFee) },
        { field: 'tuition_deposit', label: 'Tuition deposit', type: 'number', ...eff('tuition_deposit', tuitionDeposit) },
      ],
    },
    {
      title: 'Требования к поступлению',
      fields: [
        {
          field: 'entry_requirements', label: 'Требования (списком)',
          type: 'textarea', placeholder: 'Аттестат о среднем образовании\nАнглийский: IELTS 6.0\nВступительный экзамен',
          hint: 'Каждая строка — отдельный пункт в списке на карточке',
          ...eff('entry_requirements', entryRequirements),
        },
        { field: 'min_education_level', label: 'Уровень образования', type: 'text', placeholder: 'High School / Bachelor', ...eff('min_education_level', minEducationLevel) },
        { field: 'min_gpa_percent', label: 'Минимальный GPA (%)', type: 'number', ...eff('min_gpa_percent', minGpaPercent) },
      ],
    },
    {
      title: 'Языковые требования',
      fields: [
        { field: 'ielts_min', label: 'IELTS min', type: 'number', placeholder: '6.5', ...eff('ielts_min', ieltsMin) },
        { field: 'toefl_min', label: 'TOEFL min', type: 'number', placeholder: '80', ...eff('toefl_min', toeflMin) },
        { field: 'pte_min', label: 'PTE min', type: 'number', placeholder: '58', ...eff('pte_min', pteMin) },
        { field: 'duolingo_min', label: 'Duolingo min', type: 'number', placeholder: '110', ...eff('duolingo_min', duolingoMin) },
      ],
    },
  ]

  return (
    <EditPanel
      title={program.name}
      sections={sections}
      onSave={async (field, value) => {
        return await saveProgramOverride({ programId, patch: { [field]: value } })
      }}
    />
  )
}
