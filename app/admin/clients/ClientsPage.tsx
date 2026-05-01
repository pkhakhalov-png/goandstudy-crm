'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { assignCurator, updatePaymentSum, updateClientTotal, getAvailableGroups, linkClientGroup, unlinkClientGroup, refundAndDeleteClient } from './actions'
import { InviteClientButton } from './InviteClientButton'

interface Props {
  clients: any[]
  salespersons: any[]
  curators: any[]
}

function getPaymentStatus(client: any) {
  if (client.status === 'refunded') return { label: 'Возврат', cls: 'po' }
  if (client.status === 'completed') return { label: 'Завершён', cls: 'pd' }
  const pays = client.payments ?? []
  const unpaid = pays.filter((p: any) => !p.is_paid)
  if (unpaid.length === 0) return { label: 'Завершён', cls: 'pd' }

  const hasOverdue = unpaid.some((p: any) => p.status === 'overdue')
  if (hasOverdue) return { label: 'Просрочка', cls: 'po' }

  const today = new Date()
  const in7 = new Date(today)
  in7.setDate(today.getDate() + 7)
  const hasSoon = unpaid.some((p: any) => {
    const d = new Date(p.plan_date)
    return d >= today && d <= in7
  })
  if (hasSoon) return { label: 'Скоро платёж', cls: 'ps' }

  return { label: 'В графике', cls: 'pa' }
}

export function ClientsPage({ clients, salespersons, curators }: Props) {
  const [selected, setSelected] = useState<any>(null)
  const [, startTransition] = useTransition()
  const [assigningCurator, setAssigningCurator] = useState(false)
  const [groups, setGroups] = useState<any[]>([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [linkingGroup, setLinkingGroup] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null)
  const [paymentDraft, setPaymentDraft] = useState<string>('')
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalDraft, setTotalDraft] = useState<string>('')
  const [search, setSearch] = useState('')
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [filterCurator, setFilterCurator] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [drawerTab, setDrawerTab] = useState<'info' | 'payments' | 'expenses' | 'invoices'>('info')

  const filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.phone?.includes(search) && !c.email?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterSalesperson && c.salesperson?.id !== filterSalesperson) return false
    if (filterCurator && c.curator?.id !== filterCurator) return false
    if (filterStatus && c.status !== filterStatus) return false
    if (filterPayment === 'overdue' && !c.payments?.some((p: any) => p.status === 'overdue')) return false
    if (filterPayment === 'soon' && !c.payments?.some((p: any) => { const d = new Date(p.plan_date); const now = new Date(); const in7 = new Date(); in7.setDate(now.getDate() + 7); return !p.is_paid && d >= now && d <= in7 })) return false
    if (filterPayment === 'clean' && c.payments?.some((p: any) => p.status === 'overdue')) return false
    return true
  })

  const totalClients = clients.length
  const totalPlan = clients.reduce((s,c) => s + (c.payments?.reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0), 0)
  const totalPaid = clients.reduce((s,c) => s + (c.payments?.filter((p:any)=>p.is_paid).reduce((ps:number,p:any)=>ps+Number(p.fact_sum ?? p.plan_sum),0)??0), 0)
  const totalOverdue = clients.reduce((s,c) => s + (c.payments?.filter((p:any)=>p.status==='overdue').reduce((ps:number,p:any)=>ps+Number(p.plan_sum),0)??0), 0)
  const paidPct = totalPlan>0 ? Math.round(totalPaid/totalPlan*100) : 0

  const sel = selected
  const selPayments = sel?.payments ?? []
  // Paid uses fact_sum when available (actual money received), so the remaining
  // is correctly based on what was really paid, not what was planned.
  const selPaidSum = selPayments.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.fact_sum ?? p.plan_sum),0)
  const selTotalSum = selPayments.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
  const selDebt = selTotalSum - selPaidSum
  const selPct = selPayments.length>0 ? Math.round(selPayments.filter((p:any)=>p.is_paid).length/selPayments.length*100) : 0

  return (
    <>
      {/* Overlay */}
      {sel && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)',
            zIndex: 40, backdropFilter: 'blur(1px)'
          }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400,
        background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
        zIndex: 50,
        transform: sel ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {sel && (() => {
          const selExpenses = sel.expenses ?? []
          const selInvoices = sel.invoices ?? []
          const expTotal = selExpenses.reduce((s: number, e: any) => s + Number(e.plan_sum), 0)
          const expPaid = selExpenses.filter((e: any) => e.is_paid).reduce((s: number, e: any) => s + Number(e.fact_sum || e.plan_sum), 0)
          const nextPayment = selPayments.filter((p: any) => !p.is_paid).sort((a: any, b: any) => a.plan_date.localeCompare(b.plan_date))[0]
          const statusMap: Record<string, { label: string; cls: string }> = { CONFIRMED: { label: 'Оплачен', cls: 'pa' }, NEW: { label: 'Новый', cls: 'pw' }, REJECTED: { label: 'Отклонён', cls: 'po' }, CANCELED: { label: 'Отменён', cls: 'po' }, DEADLINE_EXPIRED: { label: 'Истёк', cls: 'po' } }

          return <>
            {/* Header */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--bor2)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{sel.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {sel.country}{sel.university ? ` · ${sel.university}` : ''}
                </div>
                {nextPayment && (
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: nextPayment.status === 'overdue' ? 'rgba(255,59,48,.08)' : 'rgba(255,149,0,.08)', border: `1px solid ${nextPayment.status === 'overdue' ? 'rgba(255,59,48,.2)' : 'rgba(255,149,0,.2)'}`, fontSize: 11, fontWeight: 600 }}>
                    <span style={{ color: nextPayment.status === 'overdue' ? 'var(--red)' : 'var(--gold)' }}>
                      {nextPayment.status === 'overdue' ? 'Просрочен' : 'Следующий'}: {new Date(nextPayment.plan_date).toLocaleDateString('ru-RU')} · {Number(nextPayment.plan_sum).toLocaleString('ru')} ₽
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', padding: '0 4px', lineHeight: 1 }}>×</button>
            </div>

            {/* Mini stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--bor2)' }}>
              <div style={{ textAlign: 'center' }}>
                {editingTotal ? (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={totalDraft}
                      onChange={e => setTotalDraft(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Escape') setEditingTotal(false) }}
                      style={{ width: 90, fontSize: 13, fontWeight: 700, padding: '2px 6px', border: '1px solid var(--purple)', borderRadius: 6, textAlign: 'center', outline: 'none' }}
                    />
                    <button
                      onClick={() => {
                        const v = Number(totalDraft)
                        if (!(v >= 0)) { setEditingTotal(false); return }
                        startTransition(async () => {
                          const res = await updateClientTotal(sel.id, v)
                          setEditingTotal(false)
                          if (res?.error) alert(res.error)
                        })
                      }}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 5, border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer' }}
                    >✓</button>
                    <button onClick={() => setEditingTotal(false)} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--bor2)', background: 'var(--surf)', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <div
                    onClick={() => { setTotalDraft(String(selTotalSum)); setEditingTotal(true) }}
                    style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}
                    title="Клик — редактировать сумму договора"
                  >{selTotalSum.toLocaleString('ru')} ₽</div>
                )}
                <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Договор</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{selPaidSum.toLocaleString('ru')} ₽</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Оплачено</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: selDebt > 0 ? 'var(--gold)' : 'var(--green)' }}>{selDebt.toLocaleString('ru')} ₽</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Остаток</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--bor2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>
                <span>Прогресс оплаты</span><span style={{ color: 'var(--purple)' }}>{selPct}%</span>
              </div>
              <div style={{ height: 5, background: 'rgba(0,0,0,.06)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${selPct}%`, background: 'linear-gradient(90deg,var(--purple),#d47aff)', borderRadius: 20 }} />
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--bor2)', padding: '0 20px' }}>
              {([['info', 'Инфо'], ['payments', `Платежи (${selPayments.length})`], ['expenses', `Расходы (${selExpenses.length})`], ['invoices', `Счета (${selInvoices.length})`]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setDrawerTab(key)}
                  style={{ padding: '10px 12px', fontSize: 11, fontWeight: drawerTab === key ? 700 : 500, color: drawerTab === key ? 'var(--purple)' : 'var(--muted)', background: 'none', border: 'none', borderBottom: drawerTab === key ? '2px solid var(--purple)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>

              {/* Info tab */}
              {drawerTab === 'info' && <>
                {sel.phone && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Телефон</span>
                  <a href={`tel:${sel.phone}`} style={{ fontWeight: 600, color: 'var(--purple)', textDecoration: 'none' }}>{sel.phone}</a>
                </div>}
                {sel.email && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Email</span>
                  <a href={`mailto:${sel.email}`} style={{ fontWeight: 600, color: 'var(--purple)', textDecoration: 'none' }}>{sel.email}</a>
                </div>}
                {sel.telegram && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Telegram</span>
                  <a href={`https://t.me/${sel.telegram.replace('@', '')}`} target="_blank" rel="noopener" style={{ fontWeight: 600, color: 'var(--purple)', textDecoration: 'none' }}>{sel.telegram}</a>
                </div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Продажник</span>
                  <span className="stag">{sel.salesperson?.name ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Куратор</span>
                  {sel.curator?.name ? (
                    <span className="ctag">{sel.curator.name}</span>
                  ) : (
                    <select
                      defaultValue=""
                      disabled={assigningCurator}
                      onChange={(e) => {
                        const curatorId = e.target.value
                        if (!curatorId) return
                        setAssigningCurator(true)
                        startTransition(async () => {
                          const res = await assignCurator(sel.id, curatorId)
                          setAssigningCurator(false)
                          if (res?.error) {
                            alert(res.error)
                            return
                          }
                          const picked = curators.find((c: any) => c.id === curatorId)
                          if (picked) setSelected({ ...sel, curator: picked, curator_id: picked.id })
                        })
                      }}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.12)', background: '#fff', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      <option value="">Назначить…</option>
                      {curators.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>TG группа</span>
                  {sel.tg_group_title ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#0088cc', fontSize: 11 }}>{sel.tg_group_title}</span>
                      <button
                        onClick={() => {
                          setLinkingGroup(true)
                          startTransition(async () => {
                            await unlinkClientGroup(sel.id)
                            setSelected({ ...sel, tg_group_chat_id: null, tg_group_title: null })
                            setLinkingGroup(false)
                          })
                        }}
                        disabled={linkingGroup}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}
                        title="Отвязать">×</button>
                    </div>
                  ) : (
                    <select
                      defaultValue=""
                      disabled={linkingGroup}
                      onClick={async () => {
                        if (!groupsLoaded) {
                          const g = await getAvailableGroups()
                          setGroups(g)
                          setGroupsLoaded(true)
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value
                        if (!val) return
                        const [chatId, ...titleParts] = val.split('|')
                        const title = titleParts.join('|')
                        setLinkingGroup(true)
                        startTransition(async () => {
                          const res = await linkClientGroup(sel.id, chatId, title)
                          setLinkingGroup(false)
                          if (res?.error) { alert(res.error); return }
                          setSelected({ ...sel, tg_group_chat_id: Number(chatId), tg_group_title: title })
                        })
                      }}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.12)', background: '#fff', color: 'var(--text)', cursor: 'pointer', maxWidth: 160 }}
                    >
                      <option value="">Привязать…</option>
                      {groups.filter(g => !g.already_linked).map((g: any) => (
                        <option key={g.chat_id} value={`${g.chat_id}|${g.title}`}>{g.title}</option>
                      ))}
                      {groupsLoaded && groups.filter(g => !g.already_linked).length === 0 && (
                        <option disabled>Нет доступных групп</option>
                      )}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Рассрочка</span>
                  <span style={{ fontWeight: 600 }}>{sel.months} мес.</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.04)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Добавлен</span>
                  <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{new Date(sel.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                {selExpenses.length > 0 && <>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted2)', fontWeight: 700, margin: '16px 0 6px' }}>Расходы по клиенту</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>Всего расходов</span>
                    <span style={{ fontWeight: 600, color: 'var(--red)' }}>{expTotal.toLocaleString('ru')} ₽</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>Оплачено</span>
                    <span style={{ fontWeight: 600 }}>{expPaid.toLocaleString('ru')} ₽</span>
                  </div>
                </>}

                <InviteClientButton client={sel} />

                {sel.status !== 'refunded' && (
                  <RefundClientButton client={sel} onDone={() => { setSelected(null) }} />
                )}
                {sel.status === 'refunded' && (
                  <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(255,59,48,.06)', border: '1px solid rgba(255,59,48,.2)', borderRadius: 10, fontSize: 12, color: 'var(--red)' }}>
                    Возврат оформлен — приход аннулирован, будущие платежи и неоплаченные расходы удалены.
                  </div>
                )}
              </>}

              {/* Payments tab */}
              {drawerTab === 'payments' && <>
                {selPayments.map((p: any) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    borderRadius: 9, marginBottom: 5,
                    border: `1px solid ${p.status === 'paid' ? 'rgba(22,163,97,.2)' : p.status === 'overdue' ? 'rgba(220,53,69,.2)' : p.status === 'soon' ? 'rgba(201,125,0,.2)' : 'var(--bor2)'}`,
                    background: p.status === 'paid' ? 'rgba(22,163,97,.05)' : p.status === 'overdue' ? 'rgba(220,53,69,.05)' : p.status === 'soon' ? 'rgba(201,125,0,.05)' : 'var(--surf2)'
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', width: 14, fontWeight: 700 }}>{p.num}</div>
                    <div style={{ fontSize: 11, flex: 1, color: p.status === 'overdue' ? 'var(--red)' : p.status === 'soon' ? 'var(--gold)' : 'var(--muted)', fontWeight: (p.status === 'overdue' || p.status === 'soon') ? 600 : 400 }}>
                      {new Date(p.plan_date).toLocaleDateString('ru-RU')}
                    </div>
                    {editingPaymentId === p.id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="number"
                          value={paymentDraft}
                          autoFocus
                          onChange={e => setPaymentDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingPaymentId(null) }}
                          style={{ width: 80, fontSize: 11, padding: '2px 6px', border: '1px solid var(--purple)', borderRadius: 5, outline: 'none', textAlign: 'right' }}
                        />
                        <button
                          onClick={() => {
                            const v = Number(paymentDraft)
                            if (!(v >= 0)) { setEditingPaymentId(null); return }
                            startTransition(async () => {
                              const res = await updatePaymentSum(p.id, v)
                              setEditingPaymentId(null)
                              if (res?.error) alert(res.error)
                            })
                          }}
                          style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer' }}
                        >✓</button>
                        <button onClick={() => setEditingPaymentId(null)} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid var(--bor2)', background: 'var(--surf)', cursor: 'pointer' }}>×</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setPaymentDraft(String(p.plan_sum)); setEditingPaymentId(p.id) }}
                        style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.status === 'paid' ? 'var(--green)' : p.status === 'overdue' ? 'var(--red)' : p.status === 'soon' ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer' }}
                        title="Клик — редактировать сумму платежа"
                      >
                        {Number(p.plan_sum).toLocaleString('ru')} ₽
                      </div>
                    )}
                    <div style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, background: p.is_paid ? 'var(--green)' : 'transparent', border: p.is_paid ? 'none' : '1.5px solid var(--bor2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.is_paid && <svg viewBox="0 0 9 7" fill="none" stroke="white" strokeWidth="2" width="9" height="9"><polyline points="1,3.5 3.5,6 8,1" /></svg>}
                    </div>
                  </div>
                ))}
                {selPayments.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 12 }}>Нет платежей</div>}
              </>}

              {/* Expenses tab */}
              {drawerTab === 'expenses' && <>
                {selExpenses.map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 9, marginBottom: 5, border: '1px solid var(--bor2)', background: 'var(--surf2)' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{e.article}</div>
                      {e.plan_date && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(e.plan_date).toLocaleDateString('ru-RU')}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: e.is_paid ? 'var(--green)' : 'var(--muted)' }}>{Number(e.plan_sum).toLocaleString('ru')} ₽</div>
                      <span className={`pill ${e.is_paid ? 'pa' : 'pw'}`} style={{ fontSize: 9 }}><span className="dot"></span>{e.is_paid ? 'Оплачен' : 'Ожидает'}</span>
                    </div>
                  </div>
                ))}
                {selExpenses.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 12 }}>Нет расходов</div>}
              </>}

              {/* Invoices tab */}
              {drawerTab === 'invoices' && <>
                {selInvoices.map((inv: any) => {
                  const st = statusMap[inv.status] || { label: inv.status, cls: 'pw' }
                  return (
                    <div key={inv.id} style={{ padding: '10px 12px', borderRadius: 9, marginBottom: 5, border: '1px solid var(--bor2)', background: 'var(--surf2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{Number(inv.amount).toLocaleString('ru')} ₽</span>
                        <span className={`pill ${st.cls}`} style={{ fontSize: 9 }}><span className="dot"></span>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{inv.description}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(inv.created_at).toLocaleDateString('ru-RU')}</span>
                        {inv.payment_url && <a href={inv.payment_url} target="_blank" rel="noopener" style={{ fontSize: 10, color: 'var(--purple)', fontWeight: 600, textDecoration: 'none' }}>Ссылка на оплату →</a>}
                      </div>
                    </div>
                  )
                })}
                {selInvoices.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 12 }}>Нет счетов</div>}
                <Link href="/admin/invoices" style={{ display: 'block', textAlign: 'center', marginTop: 8, padding: '9px', background: 'var(--pl)', border: '1px solid var(--pb)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--purple)', textDecoration: 'none' }}>
                  Выставить счёт →
                </Link>
              </>}
            </div>
          </>
        })()}
      </div>

      {/* KPI */}
      <div className="kw">
        <div className="kg k5" style={{ marginBottom: 14 }}>
          <div className="kc">
            <div className="kl">Клиентов</div>
            <div className="kv p">{totalClients}</div>
            <div className="ks">всего в системе</div>
          </div>
          <div className="kc">
            <div className="kl">Продано (план)</div>
            <div className="kv" style={{ fontSize: 17 }}>{totalPlan.toLocaleString('ru')} ₽</div>
            <div className="ks">по договорам</div>
          </div>
          <div className="kc">
            <div className="kl">Оплачено</div>
            <div className="kv g" style={{ fontSize: 17 }}>{totalPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">{paidPct}% от плана</div>
            <div style={{ marginTop: 8, height: 4, background: 'rgba(0,0,0,.08)', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${paidPct}%`, background: 'linear-gradient(90deg,#B15ECC,#d47aff)', borderRadius: 20 }} />
            </div>
          </div>
          <div className="kc">
            <div className="kl">Просрочено</div>
            <div className="kv r" style={{ fontSize: 17 }}>{totalOverdue.toLocaleString('ru')} ₽</div>
            <div className="ks">{clients.filter(c=>c.payments?.some((p:any)=>p.status==='overdue')).length} клиентов</div>
          </div>
          <div className="kc">
            <div className="kl">Активных</div>
            <div className="kv p">{clients.filter(c=>c.status==='active').length}</div>
            <div className="ks">{clients.filter(c=>c.status==='completed').length} завершено</div>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="cnt">
        <div className="ctrl">
          <div className="sl">Список клиентов</div>
          <div className="cr">
            <select className="si" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="active">Активные</option>
              <option value="completed">Завершённые</option>
              <option value="frozen">Замороженные</option>
              <option value="refunded">Возвраты</option>
            </select>
            <select className="si" value={filterSalesperson} onChange={e=>setFilterSalesperson(e.target.value)}>
              <option value="">Все продажники</option>
              {salespersons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="si" value={filterCurator} onChange={e=>setFilterCurator(e.target.value)}>
              <option value="">Все кураторы</option>
              {curators.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setFilterPayment(filterPayment === 'overdue' ? '' : 'overdue')}
              style={{ padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1px solid ${filterPayment === 'overdue' ? 'rgba(220,53,69,.25)' : 'var(--bor2)'}`, background: filterPayment === 'overdue' ? 'rgba(220,53,69,.08)' : 'var(--surf)', color: filterPayment === 'overdue' ? 'var(--red)' : 'var(--muted)', fontFamily: 'inherit' }}>
              Просрочка
            </button>
            <button onClick={() => setFilterPayment(filterPayment === 'soon' ? '' : 'soon')}
              style={{ padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1px solid ${filterPayment === 'soon' ? 'rgba(201,125,0,.25)' : 'var(--bor2)'}`, background: filterPayment === 'soon' ? 'rgba(201,125,0,.08)' : 'var(--surf)', color: filterPayment === 'soon' ? 'var(--gold)' : 'var(--muted)', fontFamily: 'inherit' }}>
              Скоро
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(0,0,0,.12)', borderRadius: 9, padding: '7px 13px' }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#8a8796" strokeWidth="1.6"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/></svg>
              <input
                placeholder="Имя, телефон, email..."
                value={search}
                onChange={e=>setSearch(e.target.value)}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: 170, fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </div>

        <div className="tw" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 750 }}>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Продажник</th>
                <th>Куратор</th>
                <th>Договор</th>
                <th>Оплачено</th>
                <th>Остаток</th>
                <th>Прогресс</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => {
                const pays = c.payments ?? []
                const paidS = pays.filter((p:any)=>p.is_paid).reduce((s:number,p:any)=>s+Number(p.fact_sum ?? p.plan_sum),0)
                const totalS = pays.reduce((s:number,p:any)=>s+Number(p.plan_sum),0)
                const debt = totalS - paidS
                const pct = pays.length>0 ? Math.round(pays.filter((p:any)=>p.is_paid).length/pays.length*100) : 0
                const isSel = sel?.id === c.id
                const { label, cls } = getPaymentStatus(c)

                return (
                  <tr key={c.id}
                    onClick={() => setSelected(c)}
                    style={{ background: isSel ? 'rgba(177,94,204,.07)' : 'transparent', cursor: 'pointer' }}>
                    <td>
                      <div className="cn">{c.name}</div>
                      {c.country && <div className="cs">{c.country}{c.university ? ` · ${c.university}` : ''}</div>}
                    </td>
                    <td><span className="stag">{c.salesperson?.name ?? '—'}</span></td>
                    <td><span className="ctag">{c.curator?.name ?? '—'}</span></td>
                    <td><span className="num">{totalS.toLocaleString('ru')} ₽</span></td>
                    <td><span className="num g">{paidS.toLocaleString('ru')} ₽</span></td>
                    <td><span className={`num ${debt>0?'o':'m'}`}>{debt.toLocaleString('ru')} ₽</span></td>
                    <td>
                      <div className="tp">
                        <div className="tpb"><div className="tpf" style={{ width: `${pct}%` }}></div></div>
                        <div className="tpp">{pct}%</div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${cls}`}>
                        <span className="dot"></span>
                        {label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#8a8796', padding: 32 }}>
                    {clients.length === 0
                      ? <span>Клиентов пока нет — <Link href="/admin/clients/new" style={{ color: '#B15ECC' }}>добавить первого</Link></span>
                      : 'Нет клиентов по фильтру'
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
function RefundClientButton({ client, onDone }: { client: any; onDone: () => void }) {
  const [stage, setStage] = useState<'idle' | 'confirm'>('idle')
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const paidPayments = (client.payments ?? []).filter((p: any) => p.is_paid)
  const totalPaid = paidPayments.reduce((s: number, p: any) => s + Number(p.fact_sum ?? p.plan_sum), 0)
  const futurePayments = (client.payments ?? []).filter((p: any) => !p.is_paid)
  const futureExpenses = (client.expenses ?? []).filter((e: any) => !e.is_paid)

  function execute() {
    setError(null)
    startTransition(async () => {
      const res = await refundAndDeleteClient(client.id, reason || undefined)
      if (res?.error) {
        setError(res.error)
      } else {
        onDone()
      }
    })
  }

  if (stage === 'idle') {
    return (
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed rgba(255,59,48,.25)' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--red)', fontWeight: 700, marginBottom: 6 }}>Опасная зона</div>
        <button
          onClick={() => setStage('confirm')}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: '#fff',
            border: '1px solid rgba(255,59,48,.35)',
            borderRadius: 10,
            color: 'var(--red)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ↺ Возврат и удаление клиента
        </button>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          Клиент уйдёт в архив со статусом «Возврат», приход аннулируется зеркальными минусами в payments, неоплаченные платежи и расходы удалятся.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,59,48,.06)', border: '1px solid rgba(255,59,48,.3)', borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>Подтверди возврат</div>

      <div style={{ display: 'grid', gap: 6, fontSize: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Аннулируется приход:</span>
          <b>{totalPaid.toLocaleString('ru')} ₽</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Оплаченных платежей:</span>
          <b>{paidPayments.length}</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Будущих платежей удалится:</span>
          <b>{futurePayments.length}</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Будущих расходов удалится:</span>
          <b>{futureExpenses.length}</b>
        </div>
      </div>

      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина возврата (необязательно)"
        style={{ width: '100%', padding: '8px 10px', fontSize: 12, border: '1px solid rgba(0,0,0,.12)', borderRadius: 8, marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' }}
      />

      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={execute}
          disabled={pending}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: 'var(--red)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            cursor: pending ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {pending ? 'Оформляем...' : 'Подтвердить возврат'}
        </button>
        <button
          onClick={() => { setStage('idle'); setError(null) }}
          disabled={pending}
          style={{ padding: '10px 14px', background: '#fff', border: '1px solid rgba(0,0,0,.15)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
