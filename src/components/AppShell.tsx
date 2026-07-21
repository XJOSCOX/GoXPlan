import { Banknote, BarChart3, Building2, CreditCard, DatabaseBackup, Handshake, LayoutDashboard, LogOut, ReceiptText, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../theme/theme";
import type { DashboardStats, PublicUser } from "../types";

export type AppPage = "dashboard" | "debts" | "debtDetail" | "accounts" | "income" | "negotiations" | "payments" | "reports" | "payoff" | "backup";

type AppShellProps = {
  activePage: AppPage;
  children: ReactNode;
  stats: DashboardStats;
  theme: Theme;
  user: PublicUser;
  onLogout: () => void;
  onNavigate: (page: AppPage) => void;
  onToggleTheme: () => void;
};

const pageContent: Record<AppPage, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: "Overview", title: "Dashboard" },
  debts: { eyebrow: "Planning", title: "Debts" },
  debtDetail: { eyebrow: "Planning", title: "Debt detail" },
  accounts: { eyebrow: "Workspace", title: "Accounts" },
  income: { eyebrow: "Cash flow", title: "Income" },
  negotiations: { eyebrow: "Activity", title: "Negotiations" },
  payments: { eyebrow: "Progress", title: "Payments" },
  reports: { eyebrow: "History", title: "Reports" },
  payoff: { eyebrow: "Strategy", title: "Payoff plan" },
  backup: { eyebrow: "Safety", title: "Backup" },
};

export function AppShell({
  activePage,
  children,
  stats,
  theme,
  user,
  onLogout,
  onNavigate,
  onToggleTheme,
}: AppShellProps) {
  const current = pageContent[activePage];

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">GX</div>
          <div>
            <strong>GoXPlan</strong>
            <span>Debt command center</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <button className={activePage === "dashboard" ? "active" : ""} type="button" onClick={() => onNavigate("dashboard")}>
            <LayoutDashboard size={18} />
            Dashboard
          </button>
          <button className={activePage === "debts" || activePage === "debtDetail" ? "active" : ""} type="button" onClick={() => onNavigate("debts")}>
            <WalletCards size={18} />
            Debts
            <span>{stats.debts}</span>
          </button>
          <button className={activePage === "accounts" ? "active" : ""} type="button" onClick={() => onNavigate("accounts")}>
            <Building2 size={18} />
            Accounts
          </button>
          <button className={activePage === "income" ? "active" : ""} type="button" onClick={() => onNavigate("income")}>
            <Banknote size={18} />
            Income
            <span>{stats.income}</span>
          </button>
          <button className={activePage === "negotiations" ? "active" : ""} type="button" onClick={() => onNavigate("negotiations")}>
            <Handshake size={18} />
            Negotiations
            <span>{stats.negotiations}</span>
          </button>
          <button className={activePage === "payments" ? "active" : ""} type="button" onClick={() => onNavigate("payments")}>
            <ReceiptText size={18} />
            Payments
            <span>{stats.payments}</span>
          </button>
          <button className={activePage === "reports" ? "active" : ""} type="button" onClick={() => onNavigate("reports")}>
            <BarChart3 size={18} />
            Reports
          </button>
          <button className={activePage === "payoff" ? "active" : ""} type="button" onClick={() => onNavigate("payoff")}>
            <CreditCard size={18} />
            Payoff plan
          </button>
          <button className={activePage === "backup" ? "active" : ""} type="button" onClick={() => onNavigate("backup")}>
            <DatabaseBackup size={18} />
            Backup
          </button>
        </nav>

        <div className="sidebar-footer">
          <span>Signed in as</span>
          <strong>{user.firstName} {user.lastName}</strong>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-topbar">
          <div>
            <p>{current.eyebrow}</p>
            <h1>{current.title}</h1>
          </div>

          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button className="icon-text-button danger" onClick={onLogout} type="button">
              <LogOut size={17} />
              Logout
            </button>
          </div>
        </header>

        <main className="app-main">{children}</main>

        <footer className="app-footer">
          <span>GoXPlan workspace</span>
          <span>{new Date().getFullYear()}</span>
        </footer>
      </section>
    </div>
  );
}
