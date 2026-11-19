import { ArrowClockwiseIcon, BellSimpleRingingIcon, CheckCircleIcon, ClipboardTextIcon, MagnifyingGlassIcon, PlusIcon, PulseIcon, SquaresFourIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router'
import { actionError, ApiError, closeIncident, readWorkspace, resetExamples, seedExamples } from './api'
import type { Incident, Workspace } from './api'
import { Dashboard } from './Dashboard'
import { EmptyState, IncidentInspector, ReportInspector, Status } from './Inspector'
import { paths, recordPath } from './paths'
import type { CollectionView } from './paths'
import { ReportDialog } from './ReportDialog'

type View = 'overview' | CollectionView | 'not-found'
type Filter = 'all' | 'open' | 'closed'
type LoadState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; workspace: Workspace; refreshedAt: Date }
type ReportSource = { incident: Incident; attachment: NonNullable<Incident['attachment']> }
type Action = 'refresh' | 'seed' | 'reset' | 'close'

const time = new Intl.DateTimeFormat('ko-KR', { timeStyle: 'medium', hourCycle: 'h23' })
const navigation = [
  { to: paths.overview, label: '대시보드', icon: SquaresFourIcon },
  { to: paths.incidents, label: '운영 알림', icon: BellSimpleRingingIcon },
  { to: paths.reports, label: '감사 보고서', icon: ClipboardTextIcon },
]
const pageTitles: Record<View, string> = {
  overview: '운영 대시보드',
  incidents: '운영 알림',
  reports: '감사 보고서',
  'not-found': '페이지를 찾을 수 없습니다.',
}
const scrollToRecord = 'scroll-to-record'

function WorkspacePage({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  useEffect(() => { window.scrollTo({ top: 0 }) }, [])

  return <>{heading}<main id="workspace" className="workspace route-content">{children}</main></>
}

function Collection({ view, workspace, busy, close, createReport }: {
  view: CollectionView
  workspace: Workspace
  busy: boolean
  close: (id: string) => void
  createReport: (source: ReportSource) => void
}) {
  const { id } = useParams<'id'>()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase('ko-KR')
  const incidents = workspace.incidents.filter((incident) => (
    (filter === 'all' || (filter === 'open' ? incident.closedAt === null : incident.closedAt !== null))
    && [incident.title, incident.id, incident.attachment?.name].some((text) => text?.toLocaleLowerCase('ko-KR').includes(search))
  ))
  const reports = workspace.reports.filter((report) => (
    [report.id, report.attachment.name, report.source?.incidentId].some((text) => text?.toLocaleLowerCase('ko-KR').includes(search))
  ))
  const incident = id === undefined ? incidents[0] : workspace.incidents.find((item) => item.id === id)
  const report = id === undefined ? reports[0] : workspace.reports.find((item) => item.id === id)
  const source = workspace.incidents.find((item) => item.id === report?.source?.incidentId)
  const isIncidents = view === 'incidents'
  const hasRecord = Boolean(isIncidents ? incident : report)

  useEffect(() => {
    if (location.state === scrollToRecord && navigationType !== 'POP' && window.matchMedia('(max-width: 690px)').matches) {
      document.getElementById('record-detail')?.scrollIntoView({ block: 'start' })
    }
  }, [location.key, location.state, navigationType])

  return <div className="dashboard-grid">
    <section className="panel list-panel" aria-label={isIncidents ? '알림 목록' : '감사 보고서 목록'}>
      <div className="list-heading"><div className="flex min-w-0 items-center gap-2"><h2>{isIncidents ? '알림 목록' : '보고서 목록'}</h2><span className="list-count">{isIncidents ? incidents.length : reports.length}</span></div>
        <label className="search"><MagnifyingGlassIcon size={17} /><input type="search" aria-label={isIncidents ? '알림 검색' : '보고서 검색'} placeholder={isIncidents ? '제목, ID, 파일명 검색' : '보고서 ID, 파일명 검색'} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {isIncidents && <div className="filters" aria-label="알림 상태 필터">
        {(['all', 'open', 'closed'] satisfies Filter[]).map((option) => <button type="button" key={option} className={filter === option ? 'active' : ''} aria-pressed={filter === option} onClick={() => setFilter(option)}>{option === 'all' ? '전체' : option === 'open' ? '미처리' : '처리 완료'}</button>)}
      </div>}
      {isIncidents && incidents.length > 0 && <>
        <div className="record-labels incident-row" aria-hidden="true"><span>알림</span><span>첨부파일</span><span>상태</span></div>
        <div className="records">{incidents.map((item) => <Link className="record incident-row" key={item.id}
          to={recordPath('incidents', item.id)} state={scrollToRecord} aria-current={incident?.id === item.id ? 'page' : undefined}>
          <span className="min-w-0"><span className="record-title" title={item.title}>{item.title}</span><span className="record-id">{item.id}</span></span>
          <span className="record-attachment" title={item.attachment?.name}>{item.attachment?.name ?? '—'}</span>
          <Status closed={item.closedAt !== null} />
        </Link>)}</div>
      </>}
      {!isIncidents && reports.length > 0 && <>
        <div className="record-labels report-row" aria-hidden="true"><span>보고서 ID</span><span>첨부 증빙</span></div>
        <div className="records">{reports.map((item) => <Link className="record report-row" key={item.id}
          to={recordPath('reports', item.id)} state={scrollToRecord} aria-current={report?.id === item.id ? 'page' : undefined}>
          <span className="record-title font-mono" title={item.id}>{item.id}</span><span className="record-attachment" title={item.attachment.name}>{item.attachment.name}</span>
        </Link>)}</div>
      </>}
      {(isIncidents ? incidents.length === 0 : reports.length === 0) && <EmptyState
        title={search || filter !== 'all' ? '조건에 맞는 항목이 없습니다.' : isIncidents ? '등록된 알림이 없습니다.' : '감사 보고서가 없습니다.'}
        description={search || filter !== 'all' ? '다른 검색어나 상태를 선택해 보세요.' : isIncidents ? '예제 데이터를 추가해 알림을 확인하세요.' : '운영 알림에서 첨부파일을 선택해 보고서를 만드세요.'}
      />}
    </section>

    {isIncidents && incident && <IncidentInspector key={incident.id} incident={incident}
      reportTotal={workspace.reports.filter(({ source }) => source?.incidentId === incident.id).length}
      busy={busy} close={() => close(incident.id)}
      createReport={() => { if (incident.attachment) createReport({ incident, attachment: incident.attachment }) }} />}
    {!isIncidents && report && <ReportInspector key={report.id} report={report} source={source} />}
    {!hasRecord && <div className={`panel detail-empty${id === undefined ? ' detail-placeholder' : ''}`}>
      {id === undefined
        ? <EmptyState title="상세 정보" description="목록에서 항목을 선택하면 여기에 표시됩니다." />
        : <EmptyState title={isIncidents ? '알림을 찾을 수 없습니다.' : '감사 보고서를 찾을 수 없습니다.'}
          description="목록에서 조회할 항목을 선택해 주세요." />}
    </div>}
  </div>
}

export default function App() {
  const navigate = useNavigate()
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
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

  function renderPage(view: View) {
    return <WorkspacePage key={view} heading={
      <header className="topbar">
        <h1>{pageTitles[view]}</h1>
        {view !== 'not-found' && <div className="topbar-actions">
          <button type="button" className="icon-button refresh-button" aria-label="새로고침" title="새로고침" disabled={Boolean(busy)} onClick={() => void refreshOnDemand()}><ArrowClockwiseIcon size={17} /></button>
          <button type="button" className="button secondary" title="예제 알림과 연결된 보고서 초기화" disabled={!workspace || Boolean(busy)} onClick={() => void run('reset', resetExamples, '예제 데이터를 초기화했습니다.')}>{busy === 'reset' ? '초기화 중…' : '예제 초기화'}</button>
          <button type="button" className="button primary" disabled={!workspace || Boolean(busy)} onClick={() => void run('seed', seedExamples, '예제 데이터를 준비했습니다.')}><PlusIcon size={16} aria-hidden="true" />{busy === 'seed' ? '추가 중…' : '예제 데이터 추가'}</button>
        </div>}
      </header>
    }>
      {view === 'not-found' ? <div className="panel load-error">
        <Link className="button secondary" to={paths.overview}>대시보드로 이동</Link>
      </div> : <>
        {message && <div className={`notice ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.kind === 'success' && <CheckCircleIcon size={19} />}{message.text}</div>}
        {load.kind === 'loading' && <div className="skeleton-stack" role="status" aria-label="목록을 불러오는 중"><div /><div /></div>}
        {load.kind === 'failed' && <div className="panel load-error" role="alert">
          <p className="font-semibold">데모 API에 연결할 수 없습니다.</p><p className="text-sm text-muted">백엔드 서버를 실행한 뒤 다시 시도해 주세요.</p>
          <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void refreshOnDemand()}><ArrowClockwiseIcon size={18} />{busy ? '연결 중…' : '다시 시도'}</button>
        </div>}

        {load.kind === 'ready' && (view === 'overview'
          ? <Dashboard workspace={load.workspace} refreshedAt={load.refreshedAt} />
          : <Collection view={view} workspace={load.workspace} busy={Boolean(busy)}
              close={(id) => void run('close', () => closeIncident(id), '알림을 처리 완료했습니다.')}
              createReport={setReportSourceSelection} />)}
      </>}
    </WorkspacePage>
  }

  return <div className="app-shell">
    <a className="skip-link" href="#workspace">본문으로 이동</a>
    <aside className="sidebar" aria-label="주 메뉴">
      <Link className="brand" to={paths.overview}><span className="brand-mark"><PulseIcon size={18} weight="bold" aria-hidden="true" /></span><span className="brand-name">Console</span></Link>
      <nav className="sidebar-nav" aria-label="업무 메뉴">
        {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === paths.overview}
          className={({ isActive }) => isActive ? 'nav-item current' : 'nav-item'}><Icon size={20} />{label}</NavLink>)}
      </nav>
      <div className="sidebar-connection">
        <span className="connection-label"><span className={`connection-dot ${load.kind}`} aria-hidden="true" />{load.kind === 'ready' ? '데모 API 연결됨' : load.kind === 'failed' ? '데모 API 연결 실패' : '데모 API 연결 중'}</span>
        {load.kind === 'ready' && <span className="last-updated">마지막 조회 <time dateTime={load.refreshedAt.toISOString()}>{time.format(load.refreshedAt)}</time></span>}
      </div>
    </aside>

    <div className="min-w-0">
      <Routes>
        <Route path={paths.overview} element={renderPage('overview')} />
        <Route path={paths.incidents} element={renderPage('incidents')} />
        <Route path={`${paths.incidents}/:id`} element={renderPage('incidents')} />
        <Route path={paths.reports} element={renderPage('reports')} />
        <Route path={`${paths.reports}/:id`} element={renderPage('reports')} />
        <Route path="*" element={renderPage('not-found')} />
      </Routes>
    </div>

    {reportSourceSelection && <ReportDialog incident={reportSourceSelection.incident} attachment={reportSourceSelection.attachment} dismiss={() => setReportSourceSelection(null)} done={(id) => {
      setReportSourceSelection(null)
      setLoad({ kind: 'loading' })
      void navigate(recordPath('reports', id))
      setMessage({ kind: 'success', text: '감사 보고서를 생성했습니다.' })
      void refresh()
    }} />}
  </div>
}
