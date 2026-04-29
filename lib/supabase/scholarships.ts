import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL!

/** Read-only клиент к проекту GS_apply (таблица scholarships_topuni, view v_scholarships_active). */
export function createScholarshipsClient() {
  return createClient(URL, process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Admin-клиент к проекту GS_apply — для записи (UPDATE government_scholarships, scholarships_topuni). */
export function createScholarshipsAdminClient() {
  const key = process.env.SCHOLARSHIPS_SERVICE_ROLE_KEY
  if (!key) throw new Error('SCHOLARSHIPS_SERVICE_ROLE_KEY not configured')
  return createClient(URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type GovernmentScholarship = {
  id: number
  name: string
  short_name: string | null
  country_code: string | null
  country_name: string | null
  provider: string | null
  type: string | null
  description: string | null
  eligibility: string | null
  benefits: string | null
  duration: string | null
  coverage: string | null
  monthly_stipend: number | null
  monthly_stipend_currency: string | null
  tuition_covered: boolean | null
  travel_covered: boolean | null
  insurance_covered: boolean | null
  accommodation_covered: boolean | null
  levels: string[] | null
  required_languages: string[] | null
  required_language_tests: Record<string, string> | null
  required_gpa: number | null
  age_limit: number | null
  work_experience_required: number | null
  cis_eligible: boolean | null
  required_documents: any
  application_deadline: string | null
  application_period: string | null
  intake_starts: string | null
  next_round_year: number | null
  official_url: string | null
  application_url: string | null
  info_url: string | null
  contact_email: string | null
  difficulty: string | null
  success_rate_estimate: number | null
  notes: string | null
  is_active: boolean
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

export type IdpScholarship = {
  id: number
  idp_url: string
  name: string
  university_name: string | null
  school_id: number | null
  country_code: string | null
  level: string | null
  funding_type: string | null
  value_amount: number | null
  value_currency: string | null
  value_text: string | null
  application_deadline: string | null
  description: string | null
  eligibility: string | null
  raw_data: any
  scraped_at: string
  updated_at: string
}

export type Scholarship = {
  scholarship_id: number
  title: string
  description: string | null
  institution_title: string | null
  institution_url: string | null
  institution_logo_url: string | null
  institution_logo_url_local: string | null
  profile_core_id: number | null
  study_levels: string[] | null
  audience: string | null
  amount_text: string | null
  amount_value: number | null
  amount_type: 'Monetary' | 'Percentage' | null
  amount_currency: string | null
  deadline: string | null
  status: 'Open' | 'Expired' | null
  number_of_recipients: number | null
  application_type: 'External' | 'Other' | null
  application_url: string | null
  application_text: string | null
  apply_link_qs: string | null
  detail_url: string | null
  requirements: string | null
  entry_requirements: string | null
  other_criteria: string | null
  is_exclusive: boolean | null
  countries: string[] | null
  archived: boolean
  first_seen_at: string
  last_seen_at: string
  updated_at: string
}
