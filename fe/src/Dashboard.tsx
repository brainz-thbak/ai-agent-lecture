import { ArrowRightIcon, ArrowUpRightIcon, CheckCircleIcon, ClipboardTextIcon, ClockIcon, HardDrivesIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import type { Workspace } from './api'
import { Status } from './Inspector'
import { paths, recordPath } from './paths'
import { ProcessingChart } from './ProcessingChart'

const number = new Intl.NumberFormat('ko-KR')

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${number.format(bytes)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length)
  return `${(bytes / 1024 ** power).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} ${units[power - 1]}`
}

export function Dashboard({ workspace, refreshedAt }: { workspace: Workspace; refreshedAt: Date }) {
  const { incidents, reports, usage, stats } = workspace
  const open = incidents.filter(({ closedAt }) => closedAt === null)
  const closed = incidents.filter(({ closedAt }) => closedAt !== null)
  const visibleIncidents = [...open, ...closed].slice(0, 4)
  const reportsPerIncident = new Map<string, number>()
  for (const { source } of reports) {
    if (!source) continue
    const { incidentId } = source
    reportsPerIncident.set(incidentId, (reportsPerIncident.get(incidentId) ?? 0) + 1)
  }

  return <div className="overview">
    <section className="dashboard-summary" aria-label="운영 요약">
      <dl className="metric-grid">
        <div className="panel metric-card">
          <dt>미처리 이벤트<ClockIcon className="metric-icon open" aria-hidden="true" /></dt>
          <dd>{number.format(open.length)}<span>건</span></dd>
        </div>
        <div className="panel metric-card">
          <dt>처리 완료 이벤트<CheckCircleIcon className="metric-icon complete" aria-hidden="true" /></dt>
          <dd>{number.format(closed.length)}<span>건</span></dd>
        </div>
        <div className="panel metric-card">
          <dt><Link className="metric-link" to={paths.reports}>감사 보고서<ArrowUpRightIcon size={13} aria-hidden="true" /></Link><ClipboardTextIcon className="metric-icon" aria-hidden="true" /></dt>
          <dd>{number.format(reports.length)}<span>건</span></dd>
        </div>
        <div className="panel metric-card">
          <dt>증빙 파일<HardDrivesIcon className="metric-icon" aria-hidden="true" /></dt>
          <dd>{usage ? <>{number.format(usage.files)}<span>개</span><small>{bytesLabel(usage.bytes)}</small></> : <small>저장소 조회 실패</small>}</dd>
          {stats && <dd className="metric-note">첨부 {number.format(stats.attachmentCount)}건 · 집계 {bytesLabel(stats.attachmentBytes)}</dd>}
        </div>
      </dl>
    </section>

    <ProcessingChart incidents={incidents} now={refreshedAt} />

    <section className="panel overview-alerts" aria-labelledby="dashboard-alerts-title">
      <header className="dashboard-section-header">
        <div className="overview-alert-heading">
          <h2 id="dashboard-alerts-title">이벤트 목록</h2>
          <span className="list-count">{number.format(incidents.length)}건</span>
        </div>
        <Link className="button secondary overview-link" to={paths.incidents}>전체 이벤트<ArrowRightIcon size={15} aria-hidden="true" /></Link>
      </header>
      {visibleIncidents.length ? <table className="overview-table" aria-labelledby="dashboard-alerts-title">
        <thead><tr><th scope="col">이벤트</th><th scope="col" className="table-filename">첨부파일</th><th scope="col" className="table-report-count">연결 보고서</th><th scope="col">상태</th></tr></thead>
        <tbody>{visibleIncidents.map((incident) => <tr key={incident.id}>
          <td>
            <Link className="overview-record-link" to={recordPath('incidents', incident.id)}>
              <span className="record-title" title={incident.title}>{incident.title}</span>
              <span className="record-id">{incident.id}</span>
            </Link>
          </td>
          <td className="table-filename"><span className="record-attachment" title={incident.attachment?.name}>{incident.attachment?.name ?? '—'}</span></td>
          <td className="table-report-count">{number.format(reportsPerIncident.get(incident.id) ?? 0)}건</td>
          <td><Status closed={incident.closedAt !== null} /></td>
        </tr>)}</tbody>
      </table> : <p className="overview-empty">이벤트가 없습니다. 예제 데이터를 추가해 시작하세요.</p>}
    </section>
  </div>
}
