export const paths = {
  overview: '/',
  incidents: '/incidents',
  reports: '/audit-reports',
  search: '/search',
  exports: '/exports',
  auditLog: '/audit-log',
  notifications: '/notifications',
}

export type CollectionView = 'incidents' | 'reports'

export type OpsView = 'search' | 'exports' | 'audit-log' | 'notifications'

export function recordPath(view: CollectionView, id: string) {
  return `${paths[view]}/${encodeURIComponent(id)}`
}
