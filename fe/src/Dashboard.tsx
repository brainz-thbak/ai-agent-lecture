import { BellSimpleRingingIcon, CaretRightIcon, CheckCircleIcon, ClipboardTextIcon, DatabaseIcon, LinkSimpleIcon, ListDashesIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { Workspace } from './api'
import { CompletionChart } from './CompletionChart'
import { EmptyState, Status } from './Inspector'

const number = new Intl.NumberFormat('ko-KR')

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${number.format(bytes)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length)
  return `${(bytes / 1024 ** power).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} ${units[power - 1]}`
}

function Metric({ label, value, context, icon, accent = false }: {
  label: string; value: number; context: string; icon: ReactNode; accent?: boolean
}) {
  return <div className={`metric-card ${accent ? 'metric-accent' : ''}`}>
    <div className="metric-heading"><dt>{label}</dt><span className="chart-icon" aria-hidden="true">{icon}</span></div>
    <div className="metric-readout"><dd>{number.format(value)}</dd><span>{context}</span></div>
  </div>
}

export function Dashboard({ workspace, openIncident, browseIncidents, browseReports }: {
  workspace: Workspace; openIncident: (id: string) => void; browseIncidents: () => void; browseReports: () => void
}) {
  const { incidents, reports, usage } = workspace
  const total = incidents.length
  const closed = incidents.filter(({ closedAt }) => closedAt !== null).length
  const open = total - closed
  const withAttachments = incidents.filter(({ attachment }) => attachment !== null).length
  const share = total ? closed * 100 / total : 0
  const completion = Math.round(share)
  const evidenceSources = new Set(reports.flatMap(({ source }) => source ? [source.incidentId] : [])).size

  return <div className="overview">
    <dl className="metric-grid" aria-label="핵심 지표">
      <Metric label="전체 알림" value={total} context={`첨부 포함 ${number.format(withAttachments)}건`} icon={<BellSimpleRingingIcon size={19} />} />
      <Metric label="미처리" value={open} context={total ? `전체의 ${Math.round(open * 100 / total)}%` : '알림 없음'} icon={<WarningCircleIcon size={20} />} accent />
      <Metric label="처리 완료" value={closed} context={total ? `전체의 ${completion}%` : '알림 없음'} icon={<CheckCircleIcon size={20} />} />
      <Metric label="감사 보고서" value={reports.length} context={`출처 알림 ${number.format(evidenceSources)}건`} icon={<ClipboardTextIcon size={20} />} />
    </dl>

    <div className="overview-charts">
      <CompletionChart incidents={incidents} />
      <section className="dashboard-card status-card" aria-labelledby="status-chart-title">
        <div className="chart-heading">
          <div className="chart-heading-title"><span className="chart-icon" aria-hidden="true"><ListDashesIcon size={19} /></span><h2 id="status-chart-title">알림 처리 현황</h2></div>
          <span className="chart-period">전체</span>
        </div>
        <div className="status-chart-body">
          <div className="ratio-ring" aria-hidden="true" style={{ background: total ? `conic-gradient(var(--dashboard-mint) ${share}%, var(--dashboard-ring-rest) 0)` : 'var(--dashboard-ring-rest)' }}>
            <div className="ratio-center"><strong>{total ? `${completion}%` : '—'}</strong><span>완료율</span></div>
          </div>
          <dl className="ratio-legend" aria-label={total ? `완료율 ${completion}%` : '등록된 알림 없음'}>
            <div><dt><span className="legend-dot complete" />처리 완료</dt><dd>{number.format(closed)}</dd></div>
            <div><dt><span className="legend-dot remaining" />미처리</dt><dd>{number.format(open)}</dd></div>
          </dl>
        </div>
      </section>
    </div>

    <div className="overview-charts">
      <section className="dashboard-card recent-card" aria-labelledby="dashboard-recent-title">
        <div className="chart-heading">
          <div className="chart-heading-title"><span className="chart-icon" aria-hidden="true"><BellSimpleRingingIcon size={19} /></span><h2 id="dashboard-recent-title">최근 알림</h2></div>
          <button type="button" className="text-button" onClick={browseIncidents}>전체 목록<CaretRightIcon size={15} /></button>
        </div>
        {incidents.length > 0 ? <ul className="recent-list">{incidents.slice(0, 4).map((incident) => <li key={incident.id}>
          <button className="recent-row" type="button" onClick={() => openIncident(incident.id)}>
            <span className="recent-title"><span className="record-title">{incident.title}</span><span className="record-id">{incident.id}</span></span>
            <span className="record-attachment">{incident.attachment?.name ?? '—'}</span>
            <Status closed={incident.closedAt !== null} />
          </button>
        </li>)}</ul> : <EmptyState title="등록된 알림이 없습니다." description="예제 데이터를 추가하면 알림과 보고서를 시연할 수 있습니다." />}
      </section>

      <section className="dashboard-card store-card" aria-labelledby="dashboard-store-title">
        <div className="chart-heading">
          <div className="chart-heading-title"><span className="chart-icon" aria-hidden="true"><DatabaseIcon size={19} /></span><h2 id="dashboard-store-title">증빙 저장소</h2></div>
          <span className="chart-period font-mono">file-store</span>
        </div>
        <dl className="store-metrics">
          <div><dt>보관 중인 파일</dt><dd>{usage ? number.format(usage.files) : '—'}</dd></div>
          <div><dt>사용량</dt><dd>{usage ? bytesLabel(usage.bytes) : '—'}</dd></div>
        </dl>
        {usage === null && <p className="store-unavailable">파일 저장소를 조회할 수 없습니다.</p>}
        <button type="button" className="text-button store-link" onClick={browseReports}><LinkSimpleIcon size={18} />감사 보고서 목록<CaretRightIcon size={15} /></button>
      </section>
    </div>
  </div>
}
