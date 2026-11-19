import { context } from '../../core/context.ts'
import { publish } from '../../core/event-bus.ts'
import { docIsServable } from '../documents/availability.ts'
import { fetchDoc, listDocs, registerDoc } from '../documents/doc-registry.ts'

function toReportView(doc: any) {
  return {
    id: doc.reportId,
    attachment: { name: doc.docName },
    source: doc.sourceRef === null ? null : { incidentId: doc.sourceRef, attachmentId: doc.docHash },
  }
}

export async function createReport({ id, incidentId, attachmentId }: any) {
  const result = registerDoc(id, incidentId, attachmentId)
  if (result === 'created') await publish('report.created', { reportId: id, sourceRef: incidentId, docHash: attachmentId })
  return result
}

export function getReport(id: string) {
  const doc = fetchDoc(id)
  return doc && toReportView(doc)
}

export function listReports() {
  return listDocs().map(toReportView)
}

export async function downloadReport(id: string) {
  const doc = fetchDoc(id)
  if (!docIsServable(doc)) return undefined
  const content = await context.files.read(doc.docHash)
  return content && { name: doc.docName, content }
}
