// Инвентарь всех страниц сайта (M1). Наполняется после обхода/WP REST/GSC.
export default function SeoPagesStub() {
  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Страницы</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Единый инвентарь сайта (WordPress + Tilda + <code>/book</code>): платформа, индексация,
        клики/показы, лиды/сделки, находки. Наполняется на этапе <b>M1</b> после подключения
        обхода, WP REST и GSC — как только передашь доступы к сайту.
      </p>
    </div>
  )
}
