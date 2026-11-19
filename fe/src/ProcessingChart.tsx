import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Incident } from './api'

const dayCount = 30
const lastDay = dayCount - 1
const tickCount = 4
const shortDate = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' })
const longDate = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
const dateLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
const number = new Intl.NumberFormat('ko-KR')

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function dailyCounts(incidents: readonly Incident[], now: Date) {
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() - lastDay + index)
    return { date, key: localDateKey(date), open: 0, complete: 0 }
  })
  const daysByKey = new Map(days.map((day) => [day.key, day]))
  const totals = { open: 0, complete: 0, undated: 0 }

  for (const { createdAt, closedAt } of incidents) {
    const status = closedAt === null ? 'open' : 'complete'
    const timestamp = closedAt ?? createdAt
    if (!timestamp) {
      totals.undated += 1
      continue
    }

    const date = new Date(timestamp)
    const day = date <= now ? daysByKey.get(localDateKey(date)) : undefined
    if (day) {
      day[status] += 1
      totals[status] += 1
    }
  }

  return { days, totals }
}

export function ProcessingChart({ incidents, now }: { incidents: readonly Incident[]; now: Date }) {
  const headingId = useId()
  const descriptionId = useId()
  const [selected, setSelected] = useState(lastDay)
  const [hovered, setHovered] = useState<number | null>(null)
  const dayButtons = useRef<Array<HTMLButtonElement | null>>([])
  const { days, totals } = dailyCounts(incidents, now)
  const highest = Math.max(...days.map(({ open, complete }) => open + complete))
  const tickStep = Math.max(1, Math.ceil(highest / tickCount))
  const scale = tickStep * tickCount
  const activeIndex = hovered ?? selected
  const activeDay = days[activeIndex]

  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    switch (event.key) {
      case 'ArrowLeft': next = Math.max(0, index - 1); break
      case 'ArrowRight': next = Math.min(lastDay, index + 1); break
      case 'Home': next = 0; break
      case 'End': next = lastDay; break
      default: return
    }
    event.preventDefault()
    setHovered(null)
    dayButtons.current[next]?.focus()
  }

  return <section className="panel processing-chart" aria-labelledby={headingId} aria-describedby={descriptionId}>
    <header className="dashboard-section-header">
      <div>
        <h2 id={headingId}>최근 30일 처리 현황</h2>
        <p>{longDate.formatRange(days[0].date, days[lastDay].date)}</p>
      </div>
      <dl className="chart-legend">
        <div><dt><span className="chart-key open" aria-hidden="true" />미처리</dt><dd>{number.format(totals.open)}건</dd></div>
        <div><dt><span className="chart-key complete" aria-hidden="true" />처리 완료</dt><dd>{number.format(totals.complete)}건</dd></div>
      </dl>
    </header>

    <div className="chart-frame">
      <div className="chart-y-axis" aria-hidden="true">
        {Array.from({ length: tickCount + 1 }, (_, index) => <span key={index}>{number.format(scale - index * tickStep)}</span>)}
      </div>
      <div className="chart-plot">
        <div className="chart-grid" aria-hidden="true">
          {Array.from({ length: tickCount + 1 }, (_, index) => <span key={index} />)}
        </div>
        <div className="chart-days" role="group" aria-label="일별 미처리 및 처리 완료 건수" onMouseLeave={() => setHovered(null)}>
          {days.map(({ date, key, open, complete }, index) => (
            <button type="button" className="chart-day" key={key}
              ref={(node) => { dayButtons.current[index] = node }}
              tabIndex={selected === index ? 0 : -1}
              data-highlighted={index === activeIndex}
              aria-label={`${longDate.format(date)}, 미처리 ${number.format(open)}건, 처리 완료 ${number.format(complete)}건`}
              onMouseEnter={() => setHovered(index)}
              onFocus={() => { setHovered(null); setSelected(index) }}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => selectWithKeyboard(event, index)}>
              <span className="chart-bar" aria-hidden="true">
                <span className="chart-segment open" style={{ height: `${open / scale * 100}%` }} />
                <span className="chart-segment complete" style={{ height: `${complete / scale * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="chart-x-axis" aria-hidden="true">
        {[0, 7, 14, 21, lastDay].map((index) => <time key={days[index].key} dateTime={days[index].key} style={{ gridColumn: index + 1 }}>
          {shortDate.format(days[index].date)}
        </time>)}
      </div>
    </div>

    <footer className="chart-footer">
      <p id={descriptionId}>미처리는 접수일, 처리 완료는 완료일 기준{totals.undated > 0 && ` · 접수일 미기록 ${number.format(totals.undated)}건 제외`}</p>
      <p className="chart-readout" aria-hidden="true">
        <time dateTime={activeDay.key}>{dateLabel.format(activeDay.date)}</time>
        <span>미처리 <b>{number.format(activeDay.open)}건</b></span>
        <span>처리 완료 <b>{number.format(activeDay.complete)}건</b></span>
      </p>
    </footer>
  </section>
}
