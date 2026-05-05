import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient_action } from './actions'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

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

  const initials = (profile?.name || user.email || 'АБ')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const countries = [
    'Великобритания','Германия','США','Франция','ОАЭ',
    'Южная Корея','Италия','Китай','Австрия','Чехия','Нидерланды','Венгрия'
  ]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="lw">
          <div className="lr">
            <div className="li">
              <svg viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8" width="15" height="15">
                <circle cx="7" cy="5" r="3"/><path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
              </svg>
            </div>
            <div className="lt">GoAndStudy</div>
          </div>
          <div className="ls">CRM система</div>
        </div>
        <div className="rp">
          <div className="rd"></div>
          <div className="rt2">{profile?.name || user.email}</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/admin/clients" className="ni active">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/><line x1="5" y1="7" x2="11" y2="7"/><line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Клиенты
          </Link>
          <Link href="/admin/payments" className="ni">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="4" width="14" height="9" rx="2"/><line x1="1" y1="8" x2="15" y2="8"/>
            </svg>
            Платежи
          </Link>
          <div className="ns">Система</div>
          <Link href="/admin" className="ni">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/>
              <rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/>
            </svg>
            Главная
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av">{initials}</div>
            <div>
              <div className="un">{profile?.name || user.email}</div>
              <div className="us">Администратор</div>
            </div>
          </div>
        </div>
      </aside>

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
                  <div style={{fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4}}>Имя и фамилия *</div>
                  <input name="name" required placeholder="Алина Петрова" style={{width:'100%', padding:'10px 13px', border:'1px solid var(--bor2)', borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--surf)', color:'var(--text)'}}/>
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
                <button type="submit" className="btn-p">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
                    <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                  </svg>
                  Добавить клиента
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}