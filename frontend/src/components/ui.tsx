import type { ReactNode, CSSProperties } from 'react'

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>
}

export function Spinner() {
  return <span className="spinner" />
}

export function Loading({ label = '読み込み中…' }: { label?: string }) {
  return (
    <div className="empty" style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
      <Spinner /> {label}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  active: '運用中', onboarding: 'オンボーディング中', churn_risk: '解約リスク',
  churned: '解約済み', prospect: '見込み',
}
const STATUS_KIND: Record<string, string> = {
  active: 'low', onboarding: 'info', churn_risk: 'high', churned: 'neutral', prospect: 'neutral',
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge kind={STATUS_KIND[status] || 'neutral'}>{STATUS_LABELS[status] || status}</Badge>
}

const TICKET_STATUS_LABELS: Record<string, string> = {
  new: '新規', open: '対応中', pending: '保留', solved: '解決済み', closed: 'クローズ',
}
const TICKET_STATUS_KIND: Record<string, string> = {
  new: 'info', open: 'mid', pending: 'neutral', solved: 'low', closed: 'neutral',
}
export function TicketStatusBadge({ status }: { status: string }) {
  return <Badge kind={TICKET_STATUS_KIND[status] || 'neutral'}>{TICKET_STATUS_LABELS[status] || status}</Badge>
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '緊急', high: '高', normal: '中', low: '低',
}
const PRIORITY_KIND: Record<string, string> = {
  urgent: 'high', high: 'high', normal: 'mid', low: 'neutral',
}
export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge kind={PRIORITY_KIND[priority] || 'neutral'}>{PRIORITY_LABELS[priority] || priority}</Badge>
}
