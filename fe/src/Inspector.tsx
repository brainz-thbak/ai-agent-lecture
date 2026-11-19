import { ArchiveIcon, CheckCircleIcon, DownloadSimpleIcon, FileMagnifyingGlassIcon, FileTextIcon, LinkSimpleIcon, ListChecksIcon, TerminalWindowIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { actionError, attachmentPath, downloadAttachment, readAttachment } from './api'
import type { Incident, Report } from './api'

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short',
})

export function Status({ closed }: { closed: boolean }) {
  return <span className={`status ${closed ? 'complete' : 'open'}`}><span aria-hidden="true" />{closed ? '처리 완료' : '미처리'}</span>
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state">
    <div className="empty-icon"><FileMagnifyingGlassIcon size={27} /></div>
    <p className="font-semibold text-ink">{title}</p>
    <p className="max-w-64 text-sm leading-relaxed text-muted">{description}</p>
  </div>
}

function Evidence({ name, path }: { name: string; path: string }) {
  const [preview, setPreview] = useState<{ kind: 'loading' | 'failed' } | { kind: 'ready'; text: string }>({ kind: 'loading' })
  const [download, setDownload] = useState({ pending: false, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    void readAttachment(path, controller.signal).then((text) => setPreview({ kind: 'ready', text }), () => {
      if (!controller.signal.aborted) setPreview({ kind: 'failed' })
    })
    return () => controller.abort()
  }, [path])

  async function save() {
    setDownload({ pending: true, error: '' })
    try {
      await downloadAttachment(path, name)
      setDownload({ pending: false, error: '' })
    } catch (error) {
      setDownload({ pending: false, error: actionError(error) })
    }
  }

  return <section aria-label="첨부파일" className="grid gap-3">
    <h3 className="detail-label">첨부파일</h3>
    <div className="file-summary justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3"><span className="file-icon"><FileTextIcon size={22} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold" title={name}>{name}</span><span className="mt-0.5 block text-xs text-muted">증빙 파일</span></span></div>
      <button className="icon-button shrink-0" type="button" title="첨부파일 다운로드" aria-label="첨부파일 다운로드" disabled={download.pending} onClick={() => void save()}><DownloadSimpleIcon size={20} /></button>
    </div>
    {download.error && <div className="inline-error" role="alert">{download.error}</div>}
    <div className="log-window">
      <div className="log-heading"><TerminalWindowIcon size={16} /> 로그 미리보기</div>
      {preview.kind === 'ready'
        ? <pre tabIndex={0} aria-label="로그 본문">{preview.text.length ? preview.text.slice(0, 1200) + (preview.text.length > 1200 ? '\n…' : '') : '빈 파일입니다.'}</pre>
        : <p className="px-3 py-4 text-xs text-white/70" role="status">{preview.kind === 'loading' ? '파일을 읽는 중…' : '파일을 읽을 수 없습니다.'}</p>}
    </div>
  </section>
}

function Inspector({ label, title, id, children, footer }: {
  label: string; title: string; id: string; children: ReactNode; footer?: ReactNode
}) {
  return <aside id="record-detail" className="panel inspector panel-entrance" aria-label={label}>
    <div className="panel-cap"><ArchiveIcon size={17} />{label}</div>
    <div className="grid gap-5 p-5 sm:p-6">
      <div className="min-w-0">
        <p className="record-id mb-1.5">{id}</p>
        <h2 className="wrap-anywhere text-xl leading-snug font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
    {footer && <div className="inspector-footer">{footer}</div>}
  </aside>
}

export function IncidentInspector({ incident, reportTotal, busy, close, createReport }: {
  incident: Incident; reportTotal: number; busy: boolean; close: () => void; createReport: () => void
}) {
  return <Inspector label="알림 상세" title={incident.title} id={incident.id} footer={<>
    <button type="button" className="button secondary" disabled={busy || incident.closedAt !== null} onClick={close}><CheckCircleIcon size={18} />{incident.closedAt ? '처리 완료됨' : '처리 완료'}</button>
    <button type="button" className="button primary" disabled={busy || !incident.attachment} onClick={createReport}><ListChecksIcon size={18} />보고서 만들기</button>
  </>}>
    <dl className="detail-meta">
      <div><dt>처리 상태</dt><dd><Status closed={incident.closedAt !== null} /></dd></div>
      <div><dt>완료 시각</dt><dd>{incident.closedAt ? dateFormat.format(new Date(incident.closedAt)) : '—'}</dd></div>
      <div><dt>연결 보고서</dt><dd className="tabular-nums">{reportTotal}건</dd></div>
    </dl>
    {incident.attachment
      ? <Evidence key={incident.attachment.id} name={incident.attachment.name} path={attachmentPath('incidents', incident.id)} />
      : <p className="empty-attachment"><FileTextIcon size={21} /> 조회할 수 있는 첨부파일이 없습니다.</p>}
  </Inspector>
}

export function ReportInspector({ report, sourceTitle, openSource }: {
  report: Report; sourceTitle: string | undefined; openSource: (() => void) | undefined
}) {
  return <Inspector label="보고서 상세" title="감사 보고서" id={report.id}>
    <div className="grid gap-2">
      <p className="detail-label">출처 알림</p>
      {openSource
        ? <button className="source-link" type="button" onClick={openSource}><LinkSimpleIcon size={19} className="shrink-0" /><span className="min-w-0 truncate">{sourceTitle}</span></button>
        : <p className="text-sm text-muted">{report.source?.incidentId ?? '기록된 출처가 없습니다.'}</p>}
    </div>
    <Evidence key={report.id} name={report.attachment.name} path={attachmentPath('audit-reports', report.id)} />
  </Inspector>
}
