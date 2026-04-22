import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!

export function createParserClient() {
  return createClient(URL, process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createParserAdminClient() {
  return createClient(URL, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function schoolPhotoUrl(storagePath: string): string {
  return `${URL}/storage/v1/object/public/school-photos/${storagePath}`
}
