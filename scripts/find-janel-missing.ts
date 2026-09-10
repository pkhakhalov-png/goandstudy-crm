import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const TERMS = ['таисия','федченко','мия','линников','самира','чикуров','малика','жантуа','жантуе','диана']
const norm = (s:string)=> (s||'').toLowerCase().replace(/ё/g,'е')
async function main(){
  const { data: curs } = await sb.from('curators').select('id,name')
  const cmap = new Map((curs??[]).map(c=>[c.id,c.name]))
  const { data: cl } = await sb.from('clients').select('id, name, status, curator_id')
  for (const term of TERMS){
    const hits = (cl??[]).filter(c=> norm(c.name).includes(term))
    console.log(`«${term}»: ${hits.length? hits.map(h=>`#${h.id} ${h.name} [${h.status}] (${cmap.get(h.curator_id)||'—'})`).join(' ; ') : 'нет'}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
