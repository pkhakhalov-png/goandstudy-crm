'use client'

import { EditableField } from './EditableField'
import { saveSchoolOverride, saveProgramOverride, saveIdpScholarshipOverride, saveTopUniScholarshipOverride } from '@/lib/curator-edit-actions'
import type { OverrideMeta } from '@/lib/curator-overrides'

type CommonProps = {
  value: string
  isOverridden: boolean
  by?: OverrideMeta
  field: string
  label: string
  multiline?: boolean
  placeholder?: string
  inputType?: 'text' | 'number' | 'date'
  renderDisplay?: (v: string) => React.ReactNode
  style?: React.CSSProperties
}

export function SchoolField({ schoolId, value, isOverridden, by, field, label, multiline, placeholder, inputType, renderDisplay, style }: CommonProps & { schoolId: number }) {
  return (
    <EditableField
      field={label}
      value={value}
      isOverridden={isOverridden}
      by={by}
      multiline={multiline}
      placeholder={placeholder}
      inputType={inputType}
      renderDisplay={renderDisplay}
      style={style}
      onSave={async (v) => await saveSchoolOverride({ schoolId, patch: { [field]: v } })}
    />
  )
}

export function ProgramField({ programId, value, isOverridden, by, field, label, multiline, placeholder, inputType, renderDisplay, style }: CommonProps & { programId: number }) {
  return (
    <EditableField
      field={label}
      value={value}
      isOverridden={isOverridden}
      by={by}
      multiline={multiline}
      placeholder={placeholder}
      inputType={inputType}
      renderDisplay={renderDisplay}
      style={style}
      onSave={async (v) => await saveProgramOverride({ programId, patch: { [field]: v } })}
    />
  )
}

export function IdpScholarshipField({ id, value, isOverridden, by, field, label, multiline, placeholder, inputType, renderDisplay, style }: CommonProps & { id: number }) {
  return (
    <EditableField
      field={label}
      value={value}
      isOverridden={isOverridden}
      by={by}
      multiline={multiline}
      placeholder={placeholder}
      inputType={inputType}
      renderDisplay={renderDisplay}
      style={style}
      onSave={async (v) => await saveIdpScholarshipOverride({ id, patch: { [field]: v } })}
    />
  )
}

export function TopUniScholarshipField({ scholarshipId, value, isOverridden, by, field, label, multiline, placeholder, inputType, renderDisplay, style }: CommonProps & { scholarshipId: string }) {
  return (
    <EditableField
      field={label}
      value={value}
      isOverridden={isOverridden}
      by={by}
      multiline={multiline}
      placeholder={placeholder}
      inputType={inputType}
      renderDisplay={renderDisplay}
      style={style}
      onSave={async (v) => await saveTopUniScholarshipOverride({ scholarshipId, patch: { [field]: v } })}
    />
  )
}
