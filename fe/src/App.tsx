import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, BellSimpleRingingIcon, CheckCircleIcon, ClipboardTextIcon, FlaskIcon, MagnifyingGlassIcon, PulseIcon, SquaresFourIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { actionError, ApiError, closeIncident, readWorkspace, resetExamples, seedExamples } from './api'
import type { Incident, Workspace } from './api'
import { Dashboard } from './Dashboard'
import { EmptyState, IncidentInspector, ReportInspector, Status } from './Inspector'
import { ReportDialog } from './ReportDialog'

type View = 'overview' | 'incidents' | 'reports'
type Filter = 'all' | 'open' | 'closed'
type LoadState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; workspace: Workspace; refreshedAt: Date }
type ReportSource = { incident: Incident; attachment: NonNullable<Incident['attachment']> }
type Action = 'refresh' | 'seed' | 'reset' | 'close'

const time = new Intl.DateTimeFormat('ko-KR', { timeStyle: 'medium', hourCycle: 'h23' })
const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' })
const navigation = [
  { view: 'overview', label: '대시보드', icon: SquaresFourIcon },
  { view: 'incidents', label: '운영 알림', icon: BellSimpleRingingIcon },
  { view: 'reports', label: '감사 보고서', icon: ClipboardTextIcon },
] satisfies { view: View; label: string; icon: typeof SquaresFourIcon }[]

export default function App() {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [view, setView] = useState<View>('overview')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedIncident, setSelectedIncident] = useState('')
  const [selectedReport, setSelectedReport] = useState('')
  const [reportSourceSelection, setReportSourceSelection] = useState<ReportSource | null>(null)
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const requestVersion = useRef(0)
  const workspace = load.kind === 'ready' ? load.workspace : null

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    try {
      const workspace = await readWorkspace()
      if (version === requestVersion.current) setLoad({ kind: 'ready', workspace, refreshedAt: new Date() })
    } catch {
      if (version === requestVersion.current) setLoad({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { requestVersion.current += 1 }
  }, [refresh])

  async function run(name: Exclude<Action, 'refresh'>, action: () => Promise<void>, success: string) {
    setBusy(name)
    setMessage(null)
    try {
      await action()
      setMessage({ kind: 'success', text: success })
    } catch (error) {
      const demoBusy = name !== 'close' && error instanceof ApiError && error.status === 409
      setMessage({ kind: 'error', text: demoBusy ? '예제 데이터 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.' : actionError(error) })
    } finally {
      await refresh()
      setBusy(null)
    }
  }

  async function refreshOnDemand() {
    setBusy('refresh')
    setMessage(null)
    await refresh()
    setBusy(null)
  }

  function selectRecord(select: (id: string) => void, id: string) {
    select(id)
    if (window.matchMedia('(max-width: 690px)').matches) {
      requestAnimationFrame(() => document.getElementById('record-detail')?.scrollIntoView({ block: 'start' }))
    }
  }

  function switchView(next: View) {
    setView(next)
    setFilter('all')
    setQuery('')
    window.scrollTo({ top: 0 })
  }

  function showIncident(id: string) {
    switchView('incidents')
    setSelectedIncident(id)
  }

  function showReport(id: string) {
    switchView('reports')
    setSelectedReport(id)
  }

  const search = query.trim().toLocaleLowerCase('ko-KR')
  const incidents = (workspace?.incidents ?? []).filter((incident) => (
    (filter === 'all' || (filter === 'open' ? incident.closedAt === null : incident.closedAt !== null))
    && [incident.title, incident.id, incident.attachment?.name].some((text) => text?.toLocaleLowerCase('ko-KR').includes(search))
  ))
  const reports = (workspace?.reports ?? []).filter((report) => (
    [report.id, report.attachment.name, report.source?.incidentId].some((text) => text?.toLocaleLowerCase('ko-KR').includes(search))
  ))
  const incident = incidents.find(({ id }) => id === selectedIncident) ?? incidents[0]
  const report = reports.find(({ id }) => id === selectedReport) ?? reports[0]
  const reportSource = workspace?.incidents.find(({ id }) => id === report?.source?.incidentId)
  const isIncidents = view === 'incidents'
  const section = view === 'overview' ? '운영 대시보드' : isIncidents ? '운영 알림' : '감사 보고서'

  return <div className="app-shell">
    <a className="skip-link" href="#workspace">본문으로 이동</a>
    <aside className="sidebar" aria-label="주 메뉴">
      <div className="brand"><span className="brand-mark"><PulseIcon size={23} weight="bold" /></span><span className="brand-name">증빙 콘솔</span></div>
      <nav className="sidebar-nav" aria-label="업무 메뉴">
        {navigation.map(({ view: item, label, icon: Icon }) => <button type="button" key={item} className={`nav-item ${view === item ? 'current' : ''}`} aria-current={view === item ? 'page' : undefined} onClick={() => switchView(item)}><Icon size={20} />{label}</button>)}
      </nav>
      <div className="sidebar-footer"><span className={`connection-dot ${load.kind}`} /><div><span className="block font-medium">데모 API</span><span className="mt-0.5 block text-xs text-slate-400">{load.kind === 'ready' ? '연결됨' : load.kind === 'failed' ? '연결 실패' : '연결 중'}</span></div></div>
    </aside>

    <div className="min-w-0">
      <header className="topbar"><span className="topbar-label">운영 관제 <span aria-hidden="true">/</span> <strong>{section}</strong></span>
        <div className="topbar-actions">{load.kind === 'ready' && <span className="last-updated">마지막 조회 <time dateTime={load.refreshedAt.toISOString()}>{time.format(load.refreshedAt)}</time></span>}
          <button type="button" className="icon-button" aria-label="새로고침" title="새로고침" disabled={Boolean(busy)} onClick={() => void refreshOnDemand()}><ArrowClockwiseIcon size={19} /></button></div>
      </header>
      <main id="workspace" className="workspace panel-entrance">
        <div className="page-heading">
          <div><h1>{section}</h1><p>{view === 'overview' ? date.format(new Date()) : isIncidents ? '알림을 처리하고 첨부파일을 감사 증빙으로 연결합니다.' : '연결한 증빙을 확인하고 출처 알림을 추적합니다.'}</p></div>
          <div className="heading-actions">
            <button type="button" className="button secondary" title="예제 알림과 연결된 보고서 초기화" disabled={!workspace || Boolean(busy)} onClick={() => void run('reset', resetExamples, '예제 데이터를 초기화했습니다.')}><ArrowCounterClockwiseIcon size={19} />{busy === 'reset' ? '초기화 중…' : '초기화'}</button>
            <button type="button" className="button primary" disabled={!workspace || Boolean(busy)} onClick={() => void run('seed', seedExamples, '예제 데이터를 준비했습니다.')}><FlaskIcon size={19} />{busy === 'seed' ? '추가 중…' : '예제 데이터 추가'}</button>
          </div>
        </div>

        {message && <div className={`notice ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.kind === 'success' && <CheckCircleIcon size={19} />}{message.text}</div>}
        {load.kind === 'loading' && <div className="skeleton-stack" role="status" aria-label="목록을 불러오는 중"><div /><div /></div>}
        {load.kind === 'failed' && <div className="panel load-error" role="alert">
          <p className="font-semibold">데모 API에 연결할 수 없습니다.</p><p className="text-sm text-muted">백엔드 서버를 실행한 뒤 다시 시도해 주세요.</p>
          <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void refreshOnDemand()}><ArrowClockwiseIcon size={18} />{busy ? '연결 중…' : '다시 시도'}</button>
        </div>}

        {workspace && view === 'overview' && <Dashboard workspace={workspace} openIncident={showIncident}
          browseIncidents={() => switchView('incidents')} browseReports={() => switchView('reports')} />}
        {workspace && view !== 'overview' && <>
          <div className="dashboard-grid">
            <section className="panel list-panel" aria-label={isIncidents ? '알림 목록' : '감사 보고서 목록'}>
              <div className="list-heading"><div className="flex min-w-0 items-center gap-2"><h2>{isIncidents ? '알림 목록' : '보고서 목록'}</h2><span className="list-count">{isIncidents ? incidents.length : reports.length}</span></div>
                <label className="search"><MagnifyingGlassIcon size={17} /><input type="search" aria-label={isIncidents ? '알림 검색' : '보고서 검색'} placeholder="제목, ID, 파일명 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              </div>
              {isIncidents && <div className="filters" aria-label="알림 상태 필터">
                {(['all', 'open', 'closed'] satisfies Filter[]).map((option) => <button type="button" key={option} className={filter === option ? 'active' : ''} aria-pressed={filter === option} onClick={() => setFilter(option)}>{option === 'all' ? '전체' : option === 'open' ? '미처리' : '처리 완료'}</button>)}
              </div>}
              {isIncidents && incidents.length > 0 && <>
                <div className="record-labels incident-row" aria-hidden="true"><span>알림</span><span>첨부파일</span><span>상태</span></div>
                <div className="records">{incidents.map((item) => <button className="record incident-row" type="button" key={item.id} aria-pressed={incident?.id === item.id} onClick={() => selectRecord(setSelectedIncident, item.id)}>
                  <span className="min-w-0"><span className="record-title" title={item.title}>{item.title}</span><span className="record-id">{item.id}</span></span>
                  <span className="record-attachment" title={item.attachment?.name}>{item.attachment?.name ?? '—'}</span>
                  <Status closed={item.closedAt !== null} />
                </button>)}</div>
              </>}
              {!isIncidents && reports.length > 0 && <>
                <div className="record-labels report-row" aria-hidden="true"><span>보고서 ID</span><span>첨부 증빙</span></div>
                <div className="records">{reports.map((item) => <button className="record report-row" type="button" key={item.id} aria-pressed={report?.id === item.id} onClick={() => selectRecord(setSelectedReport, item.id)}>
                  <span className="record-title font-mono" title={item.id}>{item.id}</span><span className="record-attachment" title={item.attachment.name}>{item.attachment.name}</span>
                </button>)}</div>
              </>}
              {(isIncidents ? incidents.length === 0 : reports.length === 0) && <EmptyState
                title={search || filter !== 'all' ? '조건에 맞는 항목이 없습니다.' : isIncidents ? '등록된 알림이 없습니다.' : '감사 보고서가 없습니다.'}
                description={search || filter !== 'all' ? '다른 검색어나 상태를 선택해 보세요.' : isIncidents ? '예제 데이터를 추가해 알림을 확인하세요.' : '운영 알림에서 첨부파일을 선택해 보고서를 만드세요.'}
              />}
            </section>

            {isIncidents && incident && <IncidentInspector key={incident.id} incident={incident}
              reportTotal={workspace.reports.filter(({ source }) => source?.incidentId === incident.id).length}
              busy={Boolean(busy)} close={() => void run('close', () => closeIncident(incident.id), '알림을 처리 완료했습니다.')}
              createReport={() => { if (incident.attachment) setReportSourceSelection({ incident, attachment: incident.attachment }) }} />}
            {!isIncidents && report && <ReportInspector key={report.id} report={report} sourceTitle={reportSource?.title}
              openSource={reportSource ? () => showIncident(reportSource.id) : undefined} />}
            {(isIncidents ? !incident : !report) && <div className="panel detail-empty"><EmptyState title="상세 정보" description="목록에서 항목을 선택하면 여기에 표시됩니다." /></div>}
          </div>
        </>}
      </main>
    </div>

    {reportSourceSelection && <ReportDialog incident={reportSourceSelection.incident} attachment={reportSourceSelection.attachment} dismiss={() => setReportSourceSelection(null)} done={(id) => {
      setReportSourceSelection(null)
      showReport(id)
      setMessage({ kind: 'success', text: '감사 보고서를 생성했습니다.' })
      void refresh()
    }} />}
  </div>
}
