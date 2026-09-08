// Находки (M5): каннибализация, striking distance, orphan, broken link, stale,
// ctr opportunity, content gap, duplicate title. Считаются ночным джобом по разделу 8.
export default function SeoFindingsStub() {
  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Находки</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Восемь типов находок по формальным правилам (раздел 8 PRD): каннибализация,
        striking distance, orphan, битые ссылки, устаревание, CTR-возможности, пробелы,
        дубли title. Появятся на этапе <b>M5</b> после инвентаря и импорта GSC.
      </p>
    </div>
  )
}
