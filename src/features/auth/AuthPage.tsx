import { AtSign, LockKeyhole, Mail, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { FormField } from "../../components/FormField";
import { ThemeToggle } from "../../components/ThemeToggle";
import { validateLogin, validateSignup, passwordRules } from "../../lib/validation";
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
      const user =
        mode === "signup"
          ? await submitSignup()
          : await submitLogin();
      void user;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitSignup() {
    const input = {
      firstName: form.firstName,
      lastName: form.lastName,
      username: form.username,
      email: form.email,
      password: form.password,
    };
    const validation = validateSignup(input);
    if (!validation.ok) throw new Error(validation.message);
    return onSignup(input);
  }

  async function submitLogin() {
    const input = { login: form.login, password: form.password };
    const validation = validateLogin(input.login, input.password);
    if (!validation.ok) throw new Error(validation.message);
    return onLogin(input);
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <header className="auth-header">
          <div className="brand">
            <div className="brand-mark">GX</div>
            <div>
              <strong>GoXPlan</strong>
              <span>Debt planning workspace</span>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </header>

        <div className="auth-copy">
          <p>{mode === "signup" ? "Create account" : "Welcome back"}</p>
          <h1>{mode === "signup" ? "Create your workspace." : "Login to GoXPlan."}</h1>
          <span>Plan debts, track priorities, and build your payoff strategy.</span>
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
                <span className={rule.done ? "done" : ""} key={rule.label}>{rule.label}</span>
              ))}
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
