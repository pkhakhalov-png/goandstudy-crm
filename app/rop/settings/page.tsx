import { createClient, createAdminClient } from '@/lib/supabase/server'
import { RopSettings } from './RopSettings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const { data: settings } = await admin.from('rop_settings').select('key, value')
  const { data: stages } = await admin.from('pipeline_stages').select('id, name, position, stage_type, weight').eq('is_active', true).order('position')
  return (
    <div className="main">
      <div className="topbar"><div className="pt">Настройки РОП</div></div>
      <div style={{ padding: '20px 24px', maxWidth: 700 }}>
        <RopSettings settings={settings ?? []} stages={stages ?? []} />
      </div>
    </div>
  )
}
