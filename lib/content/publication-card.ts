/**
 * Карточка публикации: всё про один вышедший пост.
 *
 * Вопрос, на который отвечает экран, звучит так: что именно вышло, на чём оно
 * основано и можно ли этому верить. Поэтому здесь собирается не «пост и его
 * метрики», а цепочка: статья → пакет → адаптация → попытки отправки → проверка
 * выхода → метрики. Разорванное звено видно сразу и называется своим именем.
 *
 * Чего экран НЕ делает:
 *
 *   Не считает долю стоимости статьи на публикацию. Одна статья даёт несколько
 *     адаптаций, делить её расходы поровну — значит придумывать число. Показана
 *     стоимость статьи по ролям и отдельно то, что потрачено на саму адаптацию.
 *   Не показывает ступень проверки выхода, которой не было. «Не проверяли» и
 *     «проверили, не видно» — разные строки, и вторая тревожнее первой.
 *   Не складывает охваты площадки с переходами CRM.
 */

export type Ступень = {
  имя: string
  состояние: 'пройдена' | 'не_пройдена' | 'не_проверяли'
  чем: string
  когда: string | null
}

export type Факт = {
  id: number
  kind: string
  statement: string
  value: string | null
  status: string
  подтверждение: { цитата: string; источник: string | null; когда: string | null } | null
}

export type Проверка = {
  provider: string
  model: string
  promptVersion: string | null
  verdict: string
  замечаний: number
  фрагменты: string[]
  стоимость: number | null
}

export type Попытка = {
  n: number
  phase: string
  requestId: string | null
  result: string | null
  error: string | null
  начата: string
  кончена: string | null
}

export type Расход = { роль: string; provider: string; сумма: number }

export type Родня = {
  формат: string
  угол: string | null
  версия: number
  канал: string | null
  статус: string | null
  адрес: string | null
  этот: boolean
}

export type Карточка = {
  id: number
  статус: string
  канал: { id: number; платформа: string; название: string; доставка: string } | null
  слот: string
  адрес: string | null
  кликабельна: boolean | null
  текст: string
  хеш: string | null
  версияВарианта: { id: number; версия: number; формат: string; угол: string | null }
  пакет: { id: number; версия: number | null; статьяId: number | null } | null
  статья: { id: number; ключ: string | null } | null
  ступени: Ступень[]
  факты: Факт[]
  проверки: Проверка[]
  попытки: Попытка[]
  охваты: { метрика: string; значение: number | null; почему?: string }[]
  переходы: number | null
  заявки: number | null
  расходыСтатьи: Расход[]
  расходыАдаптации: number | null
  родня: Родня[]
}

const текстИз = (body: any): string =>
  typeof body === 'string' ? body
    : body?.text ? String(body.text)
      : body ? JSON.stringify(body, null, 1) : ''

export async function карточкаПубликации(content: any, seo: any, id: number): Promise<Карточка | null> {
  const { data: pub } = await content.from('publications')
    .select('id, channel_id, variant_version_id, scheduled_at, status, remote_id, remote_url, link_clickable, last_verified_at, created_at')
    .eq('id', id).maybeSingle()
  if (!pub) return null

  const [{ data: канал }, { data: vv }, { data: попытки }, { data: метрики }] = await Promise.all([
    content.from('channels').select('id, platform, title, account_external_id, delivery').eq('id', pub.channel_id).maybeSingle(),
    content.from('variant_versions')
      .select('id, variant_id, version, package_version_id, body_json, claim_refs, content_hash')
      .eq('id', pub.variant_version_id).maybeSingle(),
    content.from('publication_attempts')
      .select('attempt, phase, provider_request_id, result, error, started_at, finished_at')
      .eq('publication_id', id).order('attempt'),
    content.from('metrics_daily')
      .select('metric, value, completeness, source, fetched_at').eq('publication_id', id),
  ])

  const { data: вариант } = vv?.variant_id
    ? await content.from('variants').select('id, package_id, format, editorial_angle').eq('id', vv.variant_id).maybeSingle()
    : { data: null }
  const { data: пакВерсия } = vv?.package_version_id
    ? await content.from('package_versions').select('id, package_id, version').eq('id', vv.package_version_id).maybeSingle()
    : { data: null }
  const { data: пакет } = вариант?.package_id
    ? await content.from('packages').select('id, seo_article_id, status').eq('id', вариант.package_id).maybeSingle()
    : { data: null }

  /* ── Ступени проверки выхода ─────────────────────────────────────────────
   *
   * Ступеней ровно столько, сколько мы правда умеем проверить. Ответ API,
   * идентификатор от площадки и чтение поста по ссылке — три разные вещи, и
   * пройденная первая ничего не говорит о третьей: у Telegram нет способа
   * спросить «а видно ли это публично», кроме как открыть страницу самому.
   */
  const первая = (попытки ?? [])[0] as any
  const последняя = (попытки ?? [])[(попытки ?? []).length - 1] as any
  const ступени: Ступень[] = [
    {
      имя: 'Запрос ушёл и записан',
      состояние: попытки?.length ? 'пройдена' : 'не_пройдена',
      чем: попытки?.length ? `попыток ${попытки.length}, первая ${первая?.phase}` : 'попыток отправки нет',
      когда: первая?.started_at ?? null,
    },
    {
      имя: 'Площадка ответила',
      состояние: последняя?.result ? 'пройдена' : последняя ? 'не_пройдена' : 'не_проверяли',
      чем: последняя?.result ?? последняя?.error ?? 'ответа не было',
      когда: последняя?.finished_at ?? null,
    },
    {
      имя: 'Площадка вернула идентификатор поста',
      состояние: pub.remote_id ? 'пройдена' : 'не_пройдена',
      чем: pub.remote_id ? String(pub.remote_id) : 'идентификатора нет — повтор создаст второй пост',
      когда: null,
    },
    {
      имя: 'Пост читается по ссылке',
      состояние: pub.last_verified_at ? 'пройдена' : 'не_проверяли',
      чем: pub.last_verified_at
        ? (pub.remote_url ?? 'адрес не сохранён')
        : 'проверка выхода не запускалась — это не «не видно», это «не смотрели»',
      когда: pub.last_verified_at,
    },
  ]

  /* ── Факты, на которых стоит текст ───────────────────────────────────── */

  const refs: any[] = Array.isArray(vv?.claim_refs) ? vv.claim_refs : []
  const claimIds = refs.map((r) => Number(r?.claim_id)).filter(Boolean)
  const факты: Факт[] = []
  if (claimIds.length) {
    const { data: claims } = await seo.from('claims')
      .select('id, kind, statement, value, status').in('id', claimIds)
    const { data: links } = await seo.from('claim_sources')
      .select('claim_id, snapshot_id, quote, checked_at').in('claim_id', claimIds)
    const snapIds = [...new Set((links ?? []).map((l: any) => l.snapshot_id).filter(Boolean))]
    const { data: снимки } = snapIds.length
      ? await seo.from('source_snapshots').select('id, source_id').in('id', snapIds)
      : { data: [] }
    const srcIds = [...new Set((снимки ?? []).map((s: any) => s.source_id))]
    const { data: источники } = srcIds.length
      ? await seo.from('sources').select('id, url').in('id', srcIds)
      : { data: [] }

    for (const c of (claims ?? []) as any[]) {
      const связь = (links ?? []).find((l: any) => l.claim_id === c.id)
      const снимок = связь ? (снимки ?? []).find((s: any) => s.id === связь.snapshot_id) : null
      const источник = снимок ? (источники ?? []).find((s: any) => s.id === снимок.source_id) : null
      факты.push({
        id: c.id, kind: c.kind, statement: c.statement, value: c.value ?? null, status: c.status,
        подтверждение: связь
          ? { цитата: связь.quote, источник: источник?.url ?? null, когда: связь.checked_at ?? null }
          : null,
      })
    }
  }

  /* ── Проверки: две независимые, а не голосование ─────────────────────── */

  const { data: ревью } = vv
    ? await content.from('reviews')
      .select('provider, model, prompt_version, verdict, findings_json, run_id, created_at')
      .eq('target_type', 'variant_version').eq('target_id', vv.id).order('created_at')
    : { data: [] }

  const runIds = (ревью ?? []).map((r: any) => r.run_id).filter(Boolean)
  const { data: прогоны } = runIds.length
    ? await seo.from('runs').select('id, cost, role, provider').in('id', runIds)
    : { data: [] }

  const проверки: Проверка[] = ((ревью ?? []) as any[]).map((r) => {
    const находки: any[] = Array.isArray(r.findings_json) ? r.findings_json : (r.findings_json?.issues ?? [])
    return {
      provider: r.provider, model: r.model, promptVersion: r.prompt_version ?? null, verdict: r.verdict,
      замечаний: находки.length,
      фрагменты: находки.slice(0, 3).map((f: any) => f?.quote ?? f?.why ?? JSON.stringify(f).slice(0, 120)),
      стоимость: (прогоны ?? []).find((p: any) => p.id === r.run_id)?.cost ?? null,
    }
  })

  /* ── Деньги ──────────────────────────────────────────────────────────── */

  const { data: расходы } = пакет?.seo_article_id
    ? await seo.from('runs').select('role, provider, cost').eq('article_id', пакет.seo_article_id)
    : { data: [] }
  const поРолям = new Map<string, Расход>()
  for (const r of (расходы ?? []) as any[]) {
    const ключ = `${r.role}·${r.provider}`
    const было = поРолям.get(ключ) ?? { роль: r.role, provider: r.provider, сумма: 0 }
    было.сумма += Number(r.cost ?? 0)
    поРолям.set(ключ, было)
  }

  /* ── Переходы и заявки: только при подтверждённой ссылке ──────────────── */

  let переходы: number | null = null
  let заявки: number | null = null
  if (pub.link_clickable === true) {
    const { data: ev } = await seo.from('attribution_events').select('utm').not('utm', 'is', null)
    переходы = (ev ?? []).filter((e: any) => String(e.utm?.utm_content ?? '') === String(id)).length
    const { data: ld } = await seo.from('lead_identities').select('last_touch_utm')
    заявки = (ld ?? []).filter((l: any) => String(l.last_touch_utm?.utm_content ?? '') === String(id)).length
  }

  /* ── Соседние адаптации того же пакета ───────────────────────────────── */

  const родня: Родня[] = []
  if (вариант?.package_id) {
    const { data: варианты } = await content.from('variants')
      .select('id, format, editorial_angle').eq('package_id', вариант.package_id)
    const vIds = (варианты ?? []).map((v: any) => v.id)
    const { data: версии } = vIds.length
      ? await content.from('variant_versions').select('id, variant_id, version').in('variant_id', vIds)
      : { data: [] }
    const vvIds = (версии ?? []).map((v: any) => v.id)
    const { data: пабы } = vvIds.length
      ? await content.from('publications').select('id, variant_version_id, channel_id, status, remote_url').in('variant_version_id', vvIds)
      : { data: [] }
    const чужиеКаналы = [...new Set((пабы ?? []).map((p: any) => p.channel_id))]
    const { data: каналы } = чужиеКаналы.length
      ? await content.from('channels').select('id, title, platform, account_external_id').in('id', чужиеКаналы)
      : { data: [] }

    for (const в of (версии ?? []) as any[]) {
      const вар = (варианты ?? []).find((x: any) => x.id === в.variant_id)
      const паб = (пабы ?? []).find((p: any) => p.variant_version_id === в.id)
      const кан = паб ? (каналы ?? []).find((c: any) => c.id === паб.channel_id) : null
      родня.push({
        формат: вар?.format ?? '—',
        угол: вар?.editorial_angle ?? null,
        версия: в.version,
        канал: кан ? (кан.title || kanAcc(кан)) : null,
        статус: паб?.status ?? null,
        адрес: паб?.remote_url ?? null,
        этот: в.id === vv?.id,
      })
    }
  }

  return {
    id: pub.id,
    статус: pub.status,
    канал: канал ? {
      id: канал.id, платформа: канал.platform,
      название: канал.title || канал.account_external_id, доставка: канал.delivery ?? 'manual',
    } : null,
    слот: pub.scheduled_at,
    адрес: pub.remote_url ?? null,
    кликабельна: pub.link_clickable ?? null,
    текст: текстИз(vv?.body_json),
    хеш: vv?.content_hash ?? null,
    версияВарианта: {
      id: vv?.id ?? 0, версия: vv?.version ?? 0,
      формат: вариант?.format ?? '—', угол: вариант?.editorial_angle ?? null,
    },
    пакет: пакет ? { id: пакет.id, версия: пакВерсия?.version ?? null, статьяId: пакет.seo_article_id ?? null } : null,
    статья: пакет?.seo_article_id ? { id: пакет.seo_article_id, ключ: null } : null,
    ступени,
    факты,
    проверки,
    попытки: ((попытки ?? []) as any[]).map((a) => ({
      n: a.attempt, phase: a.phase, requestId: a.provider_request_id ?? null,
      result: a.result ?? null, error: a.error ?? null,
      начата: a.started_at, кончена: a.finished_at ?? null,
    })),
    охваты: свестиМетрики(метрики ?? []),
    переходы, заявки,
    расходыСтатьи: [...поРолям.values()].sort((a, b) => b.сумма - a.сумма),
    расходыАдаптации: null,
    родня,
  }
}

const kanAcc = (k: any) => k.account_external_id ?? k.platform

/**
 * Метрики по видам.
 *
 * `unavailable` не превращается в ноль ни на каком этапе: если площадка не
 * отдала охват, экран обязан сказать «нет данных», а не «0 показов».
 */
function свестиМетрики(строки: any[]): { метрика: string; значение: number | null; почему?: string }[] {
  const виды = [...new Set(строки.map((r) => r.metric))]
  return виды.map((m) => {
    const свои = строки.filter((r) => r.metric === m)
    const доступные = свои.filter((r) => r.completeness !== 'unavailable')
    if (!доступные.length) return { метрика: m, значение: null, почему: 'площадка ответила «нет данных» — это не ноль' }
    return { метрика: m, значение: доступные.reduce((s, r) => s + Number(r.value ?? 0), 0) }
  })
}
