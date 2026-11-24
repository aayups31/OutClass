import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import "./desktop-account.css";

type Api = <T>(route: string, body?: unknown) => Promise<T>;

export function DesktopAccount({
  api,
  onRefresh,
  configure,
  offerSync = false,
}: {
  api: Api;
  onRefresh: () => Promise<unknown>;
  configure?: () => Promise<unknown>;
  offerSync?: boolean;
}) {
  const [mode, setMode] = useState<"sign-in" | "create" | "verify">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const change = (next: typeof mode) => {
    setMode(next);
    setPassword("");
    setCode("");
    setError("");
    setMessage("");
  };
  const action = async (work: () => Promise<void>) => {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await work();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (authenticated)
    return (
      <div className="desktop-account">
        <p>
          <Check size={16} /> Signed in as {email}
        </p>
        {error && (
          <p className="account-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div className="desktop-account">
      <h3>{mode === "verify" ? "Check your inbox" : "OutClass account"}</h3>
      {mode !== "verify" && (
        <div className="desktop-account-choice" aria-label="Account action">
          <button
            type="button"
            className="text-button"
            aria-pressed={mode === "sign-in"}
            disabled={busy}
            onClick={() => change("sign-in")}
          >
            Sign in
          </button>
          <button
            type="button"
            className="text-button"
            aria-pressed={mode === "create"}
            disabled={busy}
            onClick={() => change("create")}
          >
            Create account
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void action(async () => {
            const address = email.trim().toLowerCase();
            if (mode !== "verify") await configure?.();
            if (mode === "create") {
              await api("account-register", { email: address, password });
              setEmail(address);
              setResendAfter(Date.now() + 60000);
              change("verify");
              return;
            }
            if (mode === "verify")
              await api("account-confirm", { email: address, code });
            else await api("account-password", { email: address, password });
            setPassword("");
            setCode("");
            setAuthenticated(true);
            try {
              await api("assistant-enable", { enabled: true });
              if (offerSync && sync)
                await api("account-progress", { enabled: true });
            } finally {
              await onRefresh();
            }
          });
        }}
      >
        {mode === "verify" ? (
          <>
            <p>
              Enter the code sent to <strong>{email}</strong>.
            </p>
            <label>
              Verification code
              <input
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6,8}"
                maxLength={8}
                required
                value={code}
                disabled={busy}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={
                  mode === "create" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "create" ? 8 : undefined}
                maxLength={128}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {mode === "create" && (
              <p className="hint">At least 8 characters.</p>
            )}
          </>
        )}
        {offerSync && mode !== "create" && (
          <label className="desktop-account-sync">
            <input
              type="checkbox"
              checked={sync}
              disabled={busy}
              onChange={(event) => setSync(event.target.checked)}
            />
            <span>Sync course progress and skills to my account</span>
          </label>
        )}
        {error && (
          <p className="account-field-error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button className="button primary" disabled={busy} type="submit">
          {busy
            ? "Please wait…"
            : mode === "verify"
              ? "Verify email"
              : mode === "create"
                ? "Send verification code"
                : "Sign in with password"}{" "}
          <ArrowRight size={15} />
        </button>
      </form>
      {mode === "verify" && (
        <div className="desktop-account-choice">
          <button
            className="text-button"
            disabled={busy}
            type="button"
            onClick={() => change("create")}
          >
            Change email
          </button>
          <button
            className="text-button"
            disabled={busy}
            type="button"
            onClick={() => {
              if (Date.now() < resendAfter) {
                setMessage("Wait a minute before requesting another code.");
                return;
              }
              void action(async () => {
                await api("account-resend", { email });
                setResendAfter(Date.now() + 60000);
                setMessage("Use the newest code in your inbox.");
              });
            }}
          >
            Send another code
          </button>
        </div>
      )}
    </div>
  );
}
