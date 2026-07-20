import { AtSign, BarChart3, Check, CheckCircle2, Flag, LockKeyhole, Mail, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { FormField } from "../../components/FormField";
import { ThemeToggle } from "../../components/ThemeToggle";
import { passwordRules, validateLogin, validateSignup } from "../../lib/validation";
import type { Theme } from "../../theme/theme";
import type { LoginInput, PublicUser, SignupInput } from "../../types";

type AuthPageProps = {
  theme: Theme;
  onToggleTheme: () => void;
  onLogin: (input: LoginInput) => Promise<PublicUser>;
  onSignup: (input: SignupInput) => Promise<PublicUser>;
};

type AuthMode = "login" | "signup";

export function AuthPage({ theme, onToggleTheme, onLogin, onSignup }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    login: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        const input = {
          firstName: form.firstName,
          lastName: form.lastName,
          username: form.username,
          email: form.email,
          password: form.password,
        };
        const validation = validateSignup(input);
        if (!validation.ok) throw new Error(validation.message);
        await onSignup(input);
      } else {
        const input = { login: form.login, password: form.password };
        const validation = validateLogin(input.login, input.password);
        if (!validation.ok) throw new Error(validation.message);
        await onLogin(input);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-shell">
        <aside className="auth-intro">
          <div className="brand">
            <div className="brand-mark">GX</div>
            <div>
              <strong>GoXPlan</strong>
              <span>Debt planning workspace</span>
            </div>
          </div>

          <div className="intro-stack">
            <div className="intro-copy">
              <p>A better way forward</p>
              <h1>A clear plan makes debt feel lighter.</h1>
              <span>
                GoXPlan is built to help you see the full picture, choose the next best move, and turn
                pressure into steady progress one decision at a time.
              </span>
            </div>

            <div className="payoff-preview" aria-hidden="true">
              <div className="preview-row active">
                <span>Priority 01</span>
                <strong>Protect today</strong>
                <em>Immediate</em>
              </div>
              <div className="preview-row">
                <span>Priority 02</span>
                <strong>Reduce pressure</strong>
                <em>Negotiate</em>
              </div>
              <div className="preview-row">
                <span>Priority 03</span>
                <strong>Build momentum</strong>
                <em>Track</em>
              </div>
              <div className="preview-meter">
                <span />
              </div>
            </div>

            <div className="intro-details">
              <div className="intro-point">
                <CheckCircle2 size={18} />
                <span>Know exactly where you stand before making the next move.</span>
              </div>
              <div className="intro-point">
                <Flag size={18} />
                <span>Focus on the debts that need attention first.</span>
              </div>
              <div className="intro-point">
                <BarChart3 size={18} />
                <span>Keep the work steady until the plan starts feeling possible.</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="auth-card">
          <div className="auth-theme-corner">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          <div className="auth-panel">
            <div className="auth-copy">
              <h1>{mode === "signup" ? "Create account" : "Login"}</h1>
            </div>

            <div className="segmented-control">
              <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>
                Login
              </button>
              <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
                Sign up
              </button>
            </div>

            <form className="auth-form" onSubmit={submit}>
              {mode === "signup" && (
                <>
                  <div className="form-grid two">
                    <FormField icon={<UserRound size={17} />} label="First name" autoComplete="given-name" value={form.firstName} onChange={(value) => setForm({ ...form, firstName: value })} />
                    <FormField icon={<UserRound size={17} />} label="Last name" autoComplete="family-name" value={form.lastName} onChange={(value) => setForm({ ...form, lastName: value })} />
                  </div>
                  <FormField icon={<AtSign size={17} />} label="Username" autoComplete="username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
                  <FormField icon={<Mail size={17} />} label="Email" type="email" autoComplete="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
                </>
              )}

              {mode === "login" && (
                <FormField icon={<AtSign size={17} />} label="Username or email" autoComplete="username" value={form.login} onChange={(value) => setForm({ ...form, login: value })} />
              )}

              <FormField icon={<LockKeyhole size={17} />} label="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={form.password} onChange={(value) => setForm({ ...form, password: value })} />

              {mode === "signup" && (
                <div className="password-rules">
                  {passwordRules(form.password).map((rule) => (
                    <span className={rule.done ? "done" : ""} key={rule.label}>
                      {rule.done && <Check size={12} />}
                      {rule.label}
                    </span>
                  ))}
                </div>
              )}

              {error && <div className="form-error">{error}</div>}

              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
              </button>
            </form>
          </div>
        </section>
      </section>
    </main>
  );
}
