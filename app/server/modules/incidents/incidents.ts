import { context } from '../../core/context.ts'
import { publish } from '../../core/event-bus.ts'
import { evidenceService } from '../../services/evidence-service.ts'

const selectIncidents = `
  SELECT incidents.id, incidents.title, incidents.created_at, incidents.closed_at, incidents.legal_hold,
    incident_attachments.name, incident_attachments.file_id
  FROM incidents
  LEFT JOIN incident_attachments ON incident_attachments.incident_id = incidents.id
`

const pending = new Set<string>()

export function getIncident(id: string): any {
  const row = context.database.prepare(`${selectIncidents} WHERE incidents.id = ?`).get(id)
  return row ? evidenceService.buildIncidentView(row) : undefined
}

export function listIncidents(): any[] {
  return context.database.prepare(`${selectIncidents} ORDER BY incidents.rowid DESC`).all()
    .map((row) => evidenceService.buildIncidentView(row))
}

export async function createIncident(input: any) {
  if (pending.has(input.id) || getIncident(input.id)) return undefined
  pending.add(input.id)
  try {
    return await evidenceService.createIncidentWithAttachment(input)
  } finally {
    pending.delete(input.id)
  }
}

export async function closeIncident(id: string) {
  let closedAt = new Date().toISOString()
  let result = context.database.prepare('UPDATE incidents SET closed_at = ? WHERE id = ? AND closed_at IS NULL').run(closedAt, id)
  let notify = result.changes > 0
  if (notify && (result.changes === 1 || result.changes > 1)) await publish('incident.closed', { incidentId: id, closedAt })
  return getIncident(id)
}
