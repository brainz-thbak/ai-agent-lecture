import { FileTextIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { actionError, createReport } from './api'
import type { Incident } from './api'

function createReportId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `AUD-${suffix.toUpperCase()}`
}

export function ReportDialog({ incident, attachment, dismiss, done }: {
  incident: Incident; attachment: NonNullable<Incident['attachment']>; dismiss: () => void; done: (id: string) => void
}) {
  const [id, setId] = useState(createReportId)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError('')
    setPending(true)
    try {
      await createReport(id, incident.id, attachment.id)
      done(id)
    } catch (error) {
      setError(actionError(error))
    } finally {
      setPending(false)
    }
  }

  return <dialog ref={ref} className="dialog" aria-labelledby="report-dialog-title" onCancel={(event) => {
    event.preventDefault()
    if (!pending) dismiss()
  }}>
    <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-5">
      <h2 className="text-lg font-semibold" id="report-dialog-title">감사 보고서 만들기</h2>
      <button type="button" className="icon-button" aria-label="닫기" disabled={pending} onClick={dismiss}><XIcon size={20} /></button>
    </div>
    <form onSubmit={(event) => void submit(event)} className="grid gap-5 px-6 py-6">
      <label className="field">보고서 ID<input className="text-field font-mono" value={id} onChange={(event) => setId(event.target.value)} pattern="[a-zA-Z0-9_\\-]{1,64}" maxLength={64} required autoFocus /></label>
      <div className="grid gap-2">
        <p className="field">연결할 증빙</p>
        <div className="file-summary"><FileTextIcon size={23} className="shrink-0 text-accent" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{attachment.name}</span><span className="mt-1 block truncate text-xs text-muted">{incident.title}</span></span></div>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button className="button secondary" type="button" disabled={pending} onClick={dismiss}>취소</button>
        <button className="button primary" type="submit" disabled={pending}>{pending ? '생성 중…' : '보고서 생성'}</button>
      </div>
    </form>
  </dialog>
}
