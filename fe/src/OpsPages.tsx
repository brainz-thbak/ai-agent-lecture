import { ArrowClockwiseIcon, DownloadSimpleIcon, MagnifyingGlassIcon, PlayIcon, PlusIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { actionError, listExports, readAuditLog, readExportBundle, readOutbox, requestExport, runExport, searchAttachments } from './api'
import type { Workspace } from './api'
import { EmptyState } from './Inspector'
import { recordPath } from './paths'

const dateTime = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

function when(iso: string | null | undefined) {
  return iso ? dateTime.format(new Date(iso)) : '—'
}

function shortRef(ref: string | null | undefined) {
  return ref ? `${ref.slice(0, 10)}…` : '—'
}

function useRemote<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'failed'; error: string } | { kind: 'ready'; data: T }>({ kind: 'loading' })
  const reload = useCallback(() => {
    setState({ kind: 'loading' })
    load().then((data) => setState({ kind: 'ready', data }), (error) => setState({ kind: 'failed', error: actionError(error) }))
  }, [load])
  useEffect(() => { reload() }, [reload])
  return { state, reload }
}

function Panel({ title, count, actions, children }: { title: string; count?: number; actions?: ReactNode; children: ReactNode }) {
  return <section className="panel ops-panel">
    <header className="ops-heading">
      <div className="flex min-w-0 items-center gap-2"><h2>{title}</h2>{count !== undefined && <span className="list-count">{count}</span>}</div>
      {actions}
    </header>
    {children}
  </section>
}

function Remote<T>({ state, empty, children }: { state: ReturnType<typeof useRemote<T>>['state']; empty: string; children: (data: T) => ReactNode }) {
  if (state.kind === 'loading') return <div className="skeleton-stack" role="status" aria-label="불러오는 중"><div /></div>
  if (state.kind === 'failed') return <p className="inline-error" role="alert">{state.error}</p>
  if (Array.isArray(state.data) && state.data.length === 0) return <EmptyState title={empty} description="조건을 바꾸거나 잠시 후 다시 확인해 주세요." />
  return <>{children(state.data)}</>
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = query.trim()
    setSubmitted(value)
    setError('')
    if (!value) {
      setResults(null)
      return
    }
    try {
      setResults(await searchAttachments(value))
    } catch (failure) {
      setError(actionError(failure))
    }
  }

  return <Panel title="첨부 검색" count={results?.length}>
    <form className="ops-search" onSubmit={(event) => void submit(event)}>
      <label className="search"><MagnifyingGlassIcon size={17} /><input type="search" aria-label="첨부 검색어" placeholder="파일 이름이나 로그 내용" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="button primary" type="submit">검색</button>
    </form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {results === null
      ? <EmptyState title="검색어를 입력하세요." description="첨부 파일 이름과 로그 본문 앞부분에서 찾습니다." />
      : results.length === 0
        ? <EmptyState title={`"${submitted}"에 대한 결과가 없습니다.`} description="다른 검색어를 입력해 보세요." />
        : <table className="ops-table">
          <thead><tr><th scope="col">이벤트</th><th scope="col">첨부</th><th scope="col">내용</th><th scope="col">색인 시각</th></tr></thead>
          <tbody>{results.map((result, index) => <tr key={`${result.incidentId}-${result.attachmentHash}-${index}`}>
            <td><Link className="ops-link font-mono" to={recordPath('incidents', result.incidentId)}>{result.incidentId}</Link></td>
            <td>{result.name}</td>
            <td><code className="ops-snippet">{result.snippet}</code></td>
            <td>{when(result.indexedAt)}</td>
          </tr>)}</tbody>
        </table>}
  </Panel>
}

export function ExportsPage({ workspace }: { workspace: Workspace }) {
  const { state, reload } = useRemote(listExports)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [bundle, setBundle] = useState<{ id: string; text: string } | null>(null)
  const candidates = workspace.incidents.filter((incident) => incident.attachment)

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function create() {
    setMessage(null)
    try {
      const job = await requestExport(selected)
      setSelected([])
      setMessage({ kind: 'success', text: `${job.id} 작업을 만들었습니다.${job.skipped?.length ? ` 제외 ${job.skipped.length}건` : ''}` })
      reload()
    } catch (error) {
      setMessage({ kind: 'error', text: actionError(error) })
    }
  }

  async function run(id: string) {
    setMessage(null)
    try {
      const job = await runExport(id)
      setMessage(job.status === 'completed'
        ? { kind: 'success', text: `${id} 내보내기를 마쳤습니다.` }
        : { kind: 'error', text: job.result?.error ?? `${id} 내보내기에 실패했습니다.` })
      reload()
    } catch (error) {
      setMessage({ kind: 'error', text: actionError(error) })
    }
  }

  async function open(id: string) {
    try {
      setBundle({ id, text: await readExportBundle(id) })
    } catch (error) {
      setMessage({ kind: 'error', text: actionError(error) })
    }
  }

  return <div className="ops-stack">
    {message && <div className={`notice ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div>}
    <Panel title="내보낼 이벤트 선택" count={selected.length} actions={<button className="button primary" type="button" disabled={!selected.length} onClick={() => void create()}><PlusIcon size={16} />작업 만들기</button>}>
      {candidates.length === 0
        ? <EmptyState title="첨부가 있는 이벤트가 없습니다." description="이벤트를 등록한 뒤 다시 시도하세요." />
        : <ul className="ops-checklist">{candidates.map((incident) => <li key={incident.id}>
          <label><input type="checkbox" checked={selected.includes(incident.id)} onChange={() => toggle(incident.id)} />
            <span className="font-mono">{incident.id}</span><span className="truncate">{incident.title}</span><span className="text-muted truncate">{incident.attachment?.name}</span></label>
        </li>)}</ul>}
    </Panel>
    <Panel title="내보내기 작업" actions={<button className="icon-button" type="button" aria-label="새로고침" onClick={reload}><ArrowClockwiseIcon size={17} /></button>}>
      <Remote state={state} empty="내보내기 작업이 없습니다.">{(jobs: any[]) => <table className="ops-table">
        <thead><tr><th scope="col">작업</th><th scope="col">상태</th><th scope="col">증빙</th><th scope="col">요청</th><th scope="col">완료</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
        <tbody>{jobs.map((job) => <tr key={job.id}>
          <td className="font-mono">{job.id}</td>
          <td><span className={`ops-status ${job.status}`}>{job.status}</span></td>
          <td>{job.items.map((item: any) => item.caseNo).join(', ')}</td>
          <td>{when(job.requestedAt)}</td>
          <td>{when(job.completedAt)}</td>
          <td className="ops-actions">
            {job.status !== 'completed' && <button className="button secondary" type="button" onClick={() => void run(job.id)}><PlayIcon size={15} />실행</button>}
            {job.status === 'completed' && <button className="button secondary" type="button" onClick={() => void open(job.id)}><DownloadSimpleIcon size={15} />묶음 보기</button>}
          </td>
        </tr>)}</tbody>
      </table>}</Remote>
    </Panel>
    {bundle && <Panel title={`${bundle.id} 묶음`} actions={<button className="button secondary" type="button" onClick={() => setBundle(null)}>닫기</button>}>
      <pre className="ops-bundle" tabIndex={0}>{bundle.text}</pre>
    </Panel>}
  </div>
}

export function AuditLogPage() {
  const [subject, setSubject] = useState('')
  const load = useCallback(() => readAuditLog(subject.trim() || undefined), [subject])
  const { state, reload } = useRemote(load)

  return <Panel title="감사 로그" actions={<div className="flex items-center gap-2">
    <label className="search"><MagnifyingGlassIcon size={17} /><input type="search" aria-label="대상 필터" placeholder="이벤트·보고서·작업 ID" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
    <button className="icon-button" type="button" aria-label="새로고침" onClick={reload}><ArrowClockwiseIcon size={17} /></button>
  </div>}>
    <Remote state={state} empty="기록이 없습니다.">{(entries: any[]) => <table className="ops-table">
      <thead><tr><th scope="col">#</th><th scope="col">시각</th><th scope="col">동작</th><th scope="col">대상</th><th scope="col">증빙</th><th scope="col">내용</th></tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.seq}>
        <td className="tabular-nums">{entry.seq}</td>
        <td>{when(entry.at)}</td>
        <td><code>{entry.action}</code></td>
        <td className="font-mono">{entry.subject}</td>
        <td className="font-mono" title={entry.evidenceRef ?? undefined}>{shortRef(entry.evidenceRef)}</td>
        <td><code className="ops-snippet">{entry.detail ? JSON.stringify(entry.detail) : ''}</code></td>
      </tr>)}</tbody>
    </table>}</Remote>
  </Panel>
}

export function NotificationsPage() {
  const { state, reload } = useRemote(readOutbox)
  return <Panel title="알림 대기열" actions={<button className="icon-button" type="button" aria-label="새로고침" onClick={reload}><ArrowClockwiseIcon size={17} /></button>}>
    <Remote state={state} empty="대기 중인 알림이 없습니다.">{(messages: any[]) => <table className="ops-table">
      <thead><tr><th scope="col">#</th><th scope="col">생성</th><th scope="col">채널</th><th scope="col">토픽</th><th scope="col">내용</th><th scope="col">발송</th></tr></thead>
      <tbody>{messages.map((message) => <tr key={message.seq}>
        <td className="tabular-nums">{message.seq}</td>
        <td>{when(message.createdAt)}</td>
        <td>{message.channel}</td>
        <td><code>{message.topic}</code></td>
        <td><code className="ops-snippet">{JSON.stringify(message.payload)}</code></td>
        <td>{message.sentAt ? when(message.sentAt) : '대기'}</td>
      </tr>)}</tbody>
    </table>}</Remote>
  </Panel>
}
