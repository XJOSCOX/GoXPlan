import { Database, LogOut, PiggyBank, ReceiptText, WalletCards } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";
import type { Theme } from "../../theme/theme";
import type { DashboardStats, PublicUser } from "../../types";

type DashboardPageProps = {
  user: PublicUser;
  stats: DashboardStats;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
};

export function DashboardPage({ user, stats, theme, onToggleTheme, onLogout }: DashboardPageProps) {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <div className="brand-mark">GX</div>
          <div>
            <strong>GoXPlan</strong>
            <span>Dashboard</span>
          </div>
        </div>
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="icon-text-button danger" onClick={onLogout} type="button">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <p>Local SQL workspace</p>
        <h1>Welcome, {user.firstName}.</h1>
        <span>
          Your account is active. Next we will build each page one by one, and every record will save into your local SQL database.
        </span>
      </section>

      <section className="stat-grid">
        <article>
          <WalletCards size={22} />
          <span>Debts</span>
          <strong>{stats.debts}</strong>
        </article>
        <article>
          <PiggyBank size={22} />
          <span>Income</span>
          <strong>{stats.income}</strong>
        </article>
        <article>
          <ReceiptText size={22} />
          <span>Payments</span>
          <strong>{stats.payments}</strong>
        </article>
      </section>

      <section className="panel next-panel">
        <Database size={24} />
        <div>
          <h2>Foundation is ready.</h2>
          <p>Login, signup, session persistence, theme persistence, and local SQL storage are in place.</p>
        </div>
      </section>
    </main>
  );
}
