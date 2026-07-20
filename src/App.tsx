import { useEffect, useState } from "react";
import type { Database } from "sql.js";
import {
  clearSessionUserId,
  findUserById,
  getDashboardStats,
  getSessionUserId,
  loginUser,
  openDatabase,
  setSessionUserId,
  upsertUser,
} from "./db/localDatabase";
import { AuthPage } from "./features/auth/AuthPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { getInitialTheme, saveTheme, type Theme } from "./theme/theme";
import type { DashboardStats, LoginInput, PublicUser, SignupInput } from "./types";

const emptyStats: DashboardStats = { debts: 0, income: 0, payments: 0 };

export function App() {
  const [db, setDb] = useState<Database>();
  const [user, setUser] = useState<PublicUser>();
  const [stats, setStats] = useState(emptyStats);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [isLoading, setIsLoading] = useState(true);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const database = await openDatabase();
        const sessionUserId = getSessionUserId();
        const sessionUser = sessionUserId ? findUserById(database, sessionUserId) : undefined;

        if (cancelled) return;
        setDb(database);
        if (sessionUser) {
          setUser(sessionUser);
          setStats(getDashboardStats(database, sessionUser.id));
        }
      } catch (error) {
        if (!cancelled) {
          setStartupError(error instanceof Error ? error.message : "Could not start GoXPlan.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  async function handleSignup(input: SignupInput) {
    if (!db) throw new Error("GoXPlan is still starting. Please try again.");
    const nextUser = await upsertUser(db, input);
    setSessionUserId(nextUser.id);
    setUser(nextUser);
    setStats(getDashboardStats(db, nextUser.id));
    return nextUser;
  }

  async function handleLogin(input: LoginInput) {
    if (!db) throw new Error("GoXPlan is still starting. Please try again.");
    const nextUser = await loginUser(db, input);
    setSessionUserId(nextUser.id);
    setUser(nextUser);
    setStats(getDashboardStats(db, nextUser.id));
    return nextUser;
  }

  function handleLogout() {
    clearSessionUserId();
    setUser(undefined);
    setStats(emptyStats);
  }

  if (isLoading) {
    return (
      <main className="center-screen">
        <section className="loading-card">
          <strong>GoXPlan</strong>
          <span>Opening GoXPlan...</span>
        </section>
      </main>
    );
  }

  if (startupError) {
    return (
      <main className="center-screen">
        <section className="loading-card">
          <strong>GoXPlan</strong>
          <span>{startupError}</span>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    );
  }

  return (
    <DashboardPage
      user={user}
      stats={stats}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
    />
  );
}
