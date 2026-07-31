import { useEffect, useState } from 'react'
import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, AlertTriangle, Building2, LifeBuoy, CalendarDays,
  Rocket, MessageSquareText, Sparkles, Moon, Sun,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import ChurnRisk from './pages/ChurnRisk'
import Accounts from './pages/Accounts'
import Tickets from './pages/Tickets'
import Schedule from './pages/Schedule'
import Onboarding from './pages/Onboarding'
import Feedback from './pages/Feedback'
import Genie from './pages/Genie'

const NAV = [
  { to: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/churn', label: 'チャーンリスク', icon: AlertTriangle },
  { to: '/accounts', label: 'アカウント', icon: Building2 },
  { to: '/tickets', label: 'ヘルプデスク', icon: LifeBuoy },
  { to: '/schedule', label: 'スケジュール', icon: CalendarDays },
  { to: '/onboarding', label: 'オンボーディング', icon: Rocket },
  { to: '/feedback', label: 'フィードバック', icon: MessageSquareText },
  { to: '/genie', label: 'Genie', icon: Sparkles },
]

function useTheme() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'light')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }
}

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">OP</div>
          <div>
            <div className="title">OfficePulse</div>
            <div className="subtitle">CloudNest CS/CRM</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ fontWeight: 700, fontSize: 15 }}>OfficePulse ヘルプデスク CRM</div>
          <div className="topbar-right">
            <button className="icon-btn" onClick={toggle} title="テーマ切替" aria-label="テーマ切替">
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <div className="who">
              <div className="name">CS運用チーム</div>
              <div className="mail">cs-ops@cloudnest.example.com</div>
            </div>
            <div className="avatar">CS</div>
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/churn" element={<ChurnRisk />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/genie" element={<Genie />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
