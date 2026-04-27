import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL!

/** Read-only клиент к проекту GS_apply (таблица scholarships_topuni, view v_scholarships_active). */
export function createScholarshipsClient() {
  return createClient(URL, process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
