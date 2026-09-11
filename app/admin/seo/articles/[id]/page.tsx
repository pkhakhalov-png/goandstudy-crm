import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { FactGate } from './FactGate'
import { VersionRow } from './VersionRow'
import { ArticleActions } from '../ArticleActions'

async function load(id: number) {
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { data: article } = await seo.from('articles')
    .select('id, topic_id, status, current_version_id, primary_keyword, published_at, created_at').eq('id', id).single()
  if (!article) return null

  const { data: versions } = await seo.from('article_versions')
    .select('id, version_no, origin, title, body, meta, qa_report, model, created_at')
    .eq('article_id', id).order('version_no', { ascending: true })

  const { data: changes } = await seo.from('change_sets')
    .select('id, kind, reason, status, applied_at').eq('article_id', id).order('id', { ascending: false })

  const { data: links } = await seo.from('link_suggestions')
    .select('id, from_page_id, anchor, reason, score, status').eq('to_topic_id', article.topic_id)

  const fromIds = (links ?? []).map((l: any) => l.from_page_id)
  const { data: donorPages } = fromIds.length
    ? await seo.from('pages').select('id, url, title').in('id', fromIds)
    : { data: [] as any[] }
  const donorById = new Map((donorPages ?? []).map((p: any) => [p.id, p]))

  return { article, versions: versions ?? [], changes: changes ?? [], links: links ?? [], donorById }
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await load(Number(id))

  // Ворота достоверности считаем здесь: в них смысл экрана вычитки — человек
  // должен видеть, что мешает выпуску, до того как жмёт «Утвердить».
  const { createAdminClient } = await import('@/lib/supabase/server')
  const { checkFactsFor } = await import('../actions')
  const gate = await checkFactsFor((await createAdminClient()).schema('seo'), Number(id))
    .catch(() => ({ blocking: [], warnings: [], checked: 0 }))
  if (!data) return <div style={{ fontSize: 13 }}>Статья не найдена. <Link href="/admin/seo/articles">К списку</Link></div>

  const { article, versions, changes, links, donorById } = data
  const current: any = versions.find((v: any) => v.id === article.current_version_id) ?? versions[versions.length - 1]
  const meta: any = current?.meta ?? {}
  const brief: any = meta.brief ?? {}
  const report: any = current?.qa_report ?? {}
  const checks: any[] = report.checks ?? []
  const issues: any[] = report.issues ?? []
  const failedB = checks.filter((c) => c.level === 'B' && !c.ok)
  const failedW = checks.filter((c) => c.level === 'W' && !c.ok)

  const postId: number | null = meta.publish?.post_id ?? null
  const warnings: string[] = []
  // Обложка карточки блога лежит в meta.cover (480×320 JPEG). Старое место
  // meta.images.cover осталось от прежнего формата с обложкой 1200×630.
  const hasCover = Boolean(meta.cover?.base64 || meta.images?.cover?.url)
  if (!hasCover) warnings.push('§9.1: нет обложки карточки')

  // Выдуманный факт дороже любой стилистики: §14 требует, чтобы в статье не было
  // вымышленных вузов, программ, цен и сроков. Такие замечания держим как блокирующие,
  // хотя это и суждение модели — цена ошибки здесь выше цены лишней проверки человеком.
  const factIssues = issues.filter((i: any) => (i.kind === 'facts' || i.kind === 'promise') && i.severity !== 'minor')
  if (factIssues.length) warnings.push(`§14: непроверенных фактов и обещаний — ${factIssues.length}, нужно снять или подтвердить`)
  const plannedLinks = links.filter((l: any) => l.status === 'proposed' || l.status === 'waiting_target').length
  if (plannedLinks < 2) warnings.push('§8.9: меньше двух входящих ссылок — статья выйдет сиротой')

  const box = { border: '1px solid var(--bor)', borderRadius: 10, padding: 14, background: 'var(--surf)', marginBottom: 14 }

  return (
    <div>
      <Link href="/admin/seo/articles" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← Все статьи</Link>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>{current?.title ?? '(без заголовка)'}</h2>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Запрос «{article.primary_keyword}» · статус {article.status} · версий {versions.length} · модель {current?.model ?? '—'}
        {postId && <> · в WordPress: <a href={`https://goandstudy.com/wp-admin/post.php?post=${postId}&action=edit`} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>черновик {postId}</a></>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(320px,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          {/* Что обещали */}
          <div style={box}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Чем отличается от типовой статьи</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{brief.unique_value || '—'}</div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Адрес: {meta.publish?.post_type === 'page'
                ? `goandstudy.com/${meta.publish?.slug ?? meta.slug}/`
                : `goandstudy.com/blog/${meta.slug}/`} · description {String(meta.description ?? '').length} симв.
            </div>
          </div>

          {/* Обложка карточки */}
          {meta.cover?.base64 && (
            <div style={box}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Обложка карточки · {meta.cover.width}×{meta.cover.height}, {Math.round(meta.cover.bytes / 1024)} КБ
              </div>
              <img src={`data:image/jpeg;base64,${meta.cover.base64}`} alt="Обложка карточки статьи"
                style={{ width: 240, borderRadius: 8, border: '1px solid var(--bor)' }} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Заглушка: по стандарту на обложке не бывает текста и логотипов. Настоящие фотографии — отдельная задача.
              </div>
            </div>
          )}

          {/* Текст */}
          <div style={box}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Текст статьи</div>
            <div className="seo-article-body" style={{ fontSize: 14, lineHeight: 1.7, maxHeight: 620, overflowY: 'auto', paddingRight: 8 }}
              dangerouslySetInnerHTML={{ __html: current?.body ?? '' }} />
          </div>

          {/* История версий */}
          <div style={box}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Версии</div>
            {versions.map((v: any) => (
              <VersionRow key={v.id} version={v} articleId={article.id}
                isCurrent={v.id === article.current_version_id}
                snapshot={!!v.meta?.snapshot} />
            ))}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Возврат делает выбранный текст текущим и заводит новую версию — история
              не переписывается. На сайте останется прежний текст, пока не нажмёте
              «Опубликовать» в режиме обновления.
            </div>
          </div>
        </div>

        <div>
          <ArticleActions articleId={article.id} status={article.status} blockers={failedB.length} warnings={warnings} />

          {/* Существенные утверждения */}
          <FactGate blocking={gate.blocking} warnings={gate.warnings} checked={gate.checked} />

          {/* Индексация */}
          {(meta.indexnow || meta.index_check) && (
            <div style={{ ...box, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Индексация</div>
              {meta.index_check && (
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <b style={{ color: meta.index_check.verdict === 'PASS' ? 'var(--green)' : 'var(--muted)' }}>
                    Google: {meta.index_check.note}
                  </b>
                  <div style={{ color: 'var(--muted)' }}>
                    {meta.index_check.coverage}
                    {meta.index_check.last_crawl ? ` · обход ${String(meta.index_check.last_crawl).slice(0, 10)}` : ''}
                    {` · проверено ${new Date(meta.index_check.at).toLocaleString('ru')}`}
                  </div>
                </div>
              )}
              {meta.indexnow && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Яндекс, Bing, Seznam, Naver: {meta.indexnow.note} · {new Date(meta.indexnow.at).toLocaleString('ru')}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                Google нельзя попросить проиндексировать страницу: их приём заявок закрыт в 2023,
                а отдельный интерфейс для этого предназначен вакансиям и трансляциям. Он придёт
                по sitemap сам, а кнопка «Проверить индекс» показывает настоящий ответ Search Console.
              </div>
            </div>
          )}

          {/* Проверки */}
          <div style={{ ...box, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Проверки стандарта — пройдено {checks.length - failedB.length - failedW.length} из {checks.length}
            </div>
            {failedB.length === 0 && failedW.length === 0 && <div style={{ fontSize: 12, color: 'var(--green)' }}>Все проверки пройдены.</div>}
            {failedB.map((c: any, i: number) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: 'var(--red)', fontWeight: 700 }}>B</span> {c.id}
                <div style={{ color: 'var(--muted)' }}>{c.detail}</div>
              </div>
            ))}
            {failedW.map((c: any, i: number) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 700 }}>W</span> {c.id}
                <div style={{ color: 'var(--muted)' }}>{c.detail}</div>
              </div>
            ))}
          </div>

          {/* Замечания модели */}
          <div style={box}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Что нашла проверка фактов ({issues.length})</div>
            {issues.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Замечаний нет.</div>}
            {issues.map((it: any, i: number) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--bor)' }}>
                <span style={{ color: it.severity === 'blocker' ? 'var(--red)' : it.severity === 'major' ? 'var(--purple)' : 'var(--muted)', fontWeight: 700 }}>
                  {it.severity}
                </span> · {it.kind}
                <div>{it.why}</div>
                <div style={{ color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>«{it.quote}»</div>
              </div>
            ))}
          </div>

          {/* Входящие ссылки */}
          <div style={box}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Входящие ссылки ({links.length})</div>
            {links.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>План не построен.</div>}
            {links.map((l: any) => {
              const p: any = donorById.get(l.from_page_id)
              return (
                <div key={l.id} style={{ fontSize: 12, marginBottom: 6 }}>
                  {p ? String(p.url).replace('https://goandstudy.com', '') : `page ${l.from_page_id}`}
                  <div style={{ color: 'var(--muted)' }}>анкор «{l.anchor}» · {l.status}</div>
                </div>
              )
            })}
          </div>

          {/* История действий */}
          <div style={box}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>История</div>
            {changes.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Пока ничего.</div>}
            {changes.map((c: any) => (
              <div key={c.id} style={{ fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>{c.applied_at ? new Date(c.applied_at).toLocaleString('ru') : c.status}</span>
                <div>{c.reason}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
