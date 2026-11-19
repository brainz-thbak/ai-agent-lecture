import { ChartBarIcon } from '@phosphor-icons/react'
import { useId } from 'react'
import type { Incident } from './api'

const dayFormat = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' })
const accessibleDayFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
})

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function CompletionChart({ incidents }: { incidents: readonly Incident[] }) {
  const headingId = useId()
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - 6 + index)
    return { date, key: localDateKey(date), count: 0 }
  })
  const daysByKey = new Map(days.map((day) => [day.key, day]))

  for (const { closedAt } of incidents) {
    if (closedAt === null) continue
    const day = daysByKey.get(localDateKey(new Date(closedAt)))
    if (day) day.count += 1
  }

  const total = days.reduce((sum, { count }) => sum + count, 0)
  const step = Math.max(1, Math.ceil(Math.max(...days.map(({ count }) => count)) / 3))
  const ceiling = step * 3

  return <section className="dashboard-card activity-card" aria-labelledby={headingId}>
    <header className="chart-heading">
      <span className="chart-icon" aria-hidden="true"><ChartBarIcon size={20} /></span>
      <div><h2 id={headingId}>처리 추이</h2></div>
      <span className="chart-period">최근 7일</span>
    </header>
    <p className="chart-total" aria-label={`최근 7일 처리 완료 ${total}건`}>
      <strong>{total.toLocaleString('ko-KR')}</strong><span>건</span>
    </p>
    <div className="activity-plot">
      <div className="activity-grid">
        <div className="activity-axis" aria-hidden="true">
          {[ceiling, step * 2, step, 0].map((tick) => <span key={tick}>{tick.toLocaleString('ko-KR')}</span>)}
        </div>
        <ol className="activity-bars" aria-label="일별 처리 완료 건수">
          {days.map(({ date, key, count }) => {
            const label = `${accessibleDayFormat.format(date)} 처리 완료 ${count}건`
            return <li className="activity-column" key={key}>
              <div className="activity-track" role="img" aria-label={label} title={label}>
                <span className="activity-bar" style={{ height: `${count / ceiling * 100}%` }} />
              </div>
              <time className="activity-date" dateTime={key} aria-hidden="true">{dayFormat.format(date)}</time>
            </li>
          })}
        </ol>
      </div>
    </div>
  </section>
}
