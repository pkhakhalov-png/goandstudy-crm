import Script from 'next/script'

/**
 * Счётчики Метрики на странице записи.
 *
 * Зачем они здесь. Кнопка на сайте вела на crm.goandstudy.com, где счётчика не
 * было, — и с конца августа Метрика перестала видеть заявки вовсе: цель
 * «Отправка формы» считалась на домене сайта, а форма жила на другом. Отсюда же
 * росли выводы вроде «конверсия упала»: падала не конверсия, а видимость.
 *
 * Счётчики те же, что стоят на сайте, оба: страница записи — часть того же
 * пути, и разрывать статистику по доменам незачем.
 *
 * Скрипт грузится после отрисовки (`afterInteractive`): счётчик не должен
 * задерживать появление формы, ради которой человек сюда пришёл.
 */
const COUNTERS = [95947618, 96045895]

export function Metrika() {
  return (
    <Script id="ym-book" strategy="afterInteractive">
      {`
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
${COUNTERS.map((id) => `ym(${id}, "init", { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });`).join('\n')}
      `}
    </Script>
  )
}

/**
 * Отметить достижение цели.
 *
 * Вызывается из клиентского кода формы после успешной записи. Если счётчик не
 * загрузился — молча ничего не делаем: статистика не повод ломать запись.
 */
export function reachGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const ym = (window as any).ym
  if (typeof ym !== 'function') return
  for (const id of COUNTERS) {
    try { ym(id, 'reachGoal', goal, params) } catch { /* счётчик не должен мешать */ }
  }
}
