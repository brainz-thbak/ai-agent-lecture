export const paths = { overview: '/', incidents: '/incidents', reports: '/audit-reports' }

export type CollectionView = 'incidents' | 'reports'

export function recordPath(view: CollectionView, id: string) {
  return `${paths[view]}/${encodeURIComponent(id)}`
}
