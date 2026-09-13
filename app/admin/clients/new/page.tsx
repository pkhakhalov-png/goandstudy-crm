import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { createClient_action } from './actions'
import { SubmitButton } from '@/app/_shared/SubmitButton'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: curators } = await supabase
    .from('curators')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const { data: salespersons } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'salesperson')
    .eq('is_active', true)
    .order('name')

  const countries = [
    'Великобритания','Германия','США','Франция','ОАЭ',
    'Южная Корея','Италия','Китай','Австрия','Чехия','Нидерланды','Венгрия'
  ]

  return (
    <div className="main">
      <div className="topbar">
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <Link href="/admin/clients" style={{color:'var(--muted)', fontSize:13, textDecoration:'none'}}>
            ← Клиенты
          </Link>
          <div className="pt">Новый клиент</div>
        </div>
      </div>

      <div className="cnt">
        <form action={createClient_action}>
          <div style={{
            background:'var(--surf)', border:'1px solid var(--bor)',
            borderRadius:16, padding:'28px 32px', maxWidth:720,
            boxShadow:'var(--sh)'
          }}>

            {/* Личная информация */}
            <div style={{fontSize:11, fontWeight:700, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'0.08em', paddingBottom:6, borderBottom:'2px solid var(--pl)', marginBottom:16}}>
              Личная информация
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Имя *</div>
                <input name="first_name" required placeholder="Алина" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Фамилия *</div>
                <input name="last_name" required placeholder="Петрова" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Телефон *</div>
                <input name="phone" required placeholder="+7 999 000-00-00" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Email</div>
                <input name="email" type="email" placeholder="student@mail.ru" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Telegram / WhatsApp</div>
                <input name="telegram" placeholder="@username" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
            </div>

            {/* Направление */}
            <div style={{fontSize:11, fontWeight:700, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'0.08em', paddingBottom:6, borderBottom:'2px solid var(--pl)', marginBottom:16}}>
              Направление
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginBottom:16}}>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Страна *</div>
                <select name="country" required style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)', cursor:'pointer'}}>
                  <option value="">Выбрать</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Вуз / программа</div>
                <input name="university" placeholder="University College London · Computer Science" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
            </div>

            {/* Финансы */}
            <div style={{fontSize:11, fontWeight:700, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'0.08em', paddingBottom:6, borderBottom:'2px solid var(--pl)', marginBottom:16}}>
              Финансовые условия
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16}}>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Стоимость договора *</div>
                <input name="total_amount" required type="number" placeholder="290000" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Рассрочка (мес.) *</div>
                <select name="months" required style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)', cursor:'pointer'}}>
                  <option value="">Выбрать</option>
                  {[1,2,3,4,6,9,12,18,24].map(m => <option key={m} value={m}>{m} мес.</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Дата 1-го платежа *</div>
                <input name="first_pay_date" required type="date" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
              </div>
            </div>

            {/* Куратор и продажник */}
            <div style={{fontSize:11, fontWeight:700, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'0.08em', paddingBottom:6, borderBottom:'2px solid var(--pl)', marginBottom:16}}>
              Назначение
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Куратор *</div>
                <select name="curator_id" required style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)', cursor:'pointer'}}>
                  <option value="">Выбрать куратора</option>
                  {curators?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Продажник *</div>
                <select name="salesperson_id" required style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)', cursor:'pointer'}}>
                  <option value="">Выбрать продажника</option>
                  {salespersons?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Примечания */}
            <div>
              <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Примечания</div>
              <textarea name="notes" placeholder="Источник лида, особые условия..." rows={3} style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)', resize:'vertical'}}/>
            </div>

            {/* Кнопки */}
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:20, paddingTop:20, borderTop:'1px solid var(--bor)'}}>
              <Link href="/admin/clients" style={{padding:'9px 18px', background:'var(--surf)', color:'var(--muted)', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontWeight:500, textDecoration:'none', display:'inline-flex', alignItems:'center'}}>
                Отмена
              </Link>
              <SubmitButton className="btn-p" pendingText="Добавление…">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
                  <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                </svg>
                Добавить клиента
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}