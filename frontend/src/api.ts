const BASE = '/api'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = j.detail || detail
    } catch { /* noop */ }
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  meta: () => req<any>('/meta'),
  dashboardKpis: () => req<any>('/dashboard/kpis'),
  kpiTrend: () => req<any>('/dashboard/kpi-trend'),
  churnHistory: () => req<any>('/dashboard/churn-history'),
  accounts: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString()
    return req<any>('/accounts' + (qs ? `?${qs}` : ''))
  },
  accountDetail: (id: string) => req<any>(`/accounts/${id}`),
  atRisk: () => req<any>('/churn/at-risk'),
  recommend: (id: string) => req<any>(`/accounts/${id}/recommend`, { method: 'POST' }),
  tickets: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString()
    return req<any>('/tickets' + (qs ? `?${qs}` : ''))
  },
  ticketStats: () => req<any>('/tickets/stats'),
  ticketDetail: (id: string) => req<any>(`/tickets/${id}`),
  updateTicket: (id: string, body: any) => req<any>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  replyTicket: (id: string, body: any) => req<any>(`/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(body) }),
  createTicket: (body: any) => req<any>('/tickets', { method: 'POST', body: JSON.stringify(body) }),
  schedule: () => req<any>('/schedule'),
  createSchedule: (body: any) => req<any>('/schedule', { method: 'POST', body: JSON.stringify(body) }),
  updateSchedule: (id: string, body: any) => req<any>(`/schedule/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSchedule: (id: string) => req<any>(`/schedule/${id}`, { method: 'DELETE' }),
  feedback: () => req<any>('/feedback'),
  addFeedback: (body: any) => req<any>('/feedback', { method: 'POST', body: JSON.stringify(body) }),
  updateFeedback: (id: string, status: string) => req<any>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  genieStatus: () => req<any>('/genie/status'),
  genieHistory: () => req<any>('/genie/history'),
  clearGenieHistory: () => req<any>('/genie/history', { method: 'DELETE' }),
  genieAsk: (message: string, conversation_id?: string) =>
    req<any>('/genie/ask', { method: 'POST', body: JSON.stringify({ message, conversation_id }) }),
}

export function yen(n: number | null | undefined): string {
  if (n == null) return '—'
  return '¥' + n.toLocaleString('ja-JP')
}

export function bandClass(band: string): string {
  return band === '高' ? 'high' : band === '中' ? 'mid' : 'low'
}
