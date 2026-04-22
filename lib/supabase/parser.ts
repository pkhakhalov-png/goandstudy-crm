import { createClient } from '@supabase/supabase-js'

const FALLBACK_URL = 'https://ymyzzdnmadtxzjuvpefq.supabase.co'
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlteXp6ZG5tYWR0eHpqdXZwZWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTA0NDUsImV4cCI6MjA5MjI4NjQ0NX0.sxprJdJuFisg7K_D2_wuhwOp9s3g4uloGm6ECYUJu7s'

const URL = process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL || FALLBACK_URL
const ANON = process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY || FALLBACK_ANON

export function createParserClient() {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createParserAdminClient() {
  return createClient(URL, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY || ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function schoolPhotoUrl(storagePath: string): string {
  return `${URL}/storage/v1/object/public/school-photos/${storagePath}`
}
