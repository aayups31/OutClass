import React, { useEffect, useState, useRef } from "react";
import {
  Sparkles,
  Check,
  Loader2,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { DesktopAccount } from "./desktop-account";
import type { AIConfig } from "../server/ai-provider";
import type { AIUsage } from "../ai-contract";
type Api = <T>(route: string, body?: unknown) => Promise<T>;
type Access = AIConfig & {
  ready: boolean;
  account: { email: string } | null;
  securePersistence: boolean;
};
export function AIAccessSettings({
  api,
  onRefresh,
  enabled,
}: {
  api: Api;
  onRefresh: () => Promise<unknown>;
  enabled: boolean;
}) {
  const actionPending = useRef(false);
  const [access, setAccess] = useState<Access>(),
    [savedAccess, setSavedAccess] = useState<Access>(),
    [usage, setUsage] = useState<AIUsage>(),
    [usageNotice, setUsageNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = async () => {
    const a = await api<Access>("ai-access");
    setAccess(a);
    setSavedAccess(a);
    setUsage(undefined);
    setUsageNotice("");
    if (a.mode === "included" && a.account) {
      try {
        setUsage(await api<AIUsage>("ai-usage"));
      } catch (e) {
        setUsageNotice(
          e instanceof Error ? e.message : "Allowance could not be refreshed.",
        );
      }
    }
  };
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, []);
  const act = async (action: () => Promise<unknown>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
      await load();
      await onRefresh();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "This connection is unavailable.",
      );
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  };
  if (!access)
    return (
      <section className="setup-card ai-access">
        <h2>AI connections</h2>
        <p role="status">{notice || "Loading your saved connection…"}</p>
        {notice && (
          <button
            className="button secondary"
            onClick={() => void act(load)}
            disabled={busy}
          >
            Retry connection settings
          </button>
        )}
      </section>
    );
  const saved =
    !!savedAccess &&
    access.mode === savedAccess.mode &&
    access.service === savedAccess.service &&
    access.localEndpoint === savedAccess.localEndpoint &&
    access.localModel === savedAccess.localModel;
  const connected = saved && !!savedAccess?.ready;
  return (
    <section className="setup-card ai-access">
      <div className="setup-heading">
        <span className="setup-icon">
          <Sparkles size={23} />
        </span>
        <div>
          <h2>Your AI guides</h2>
          <p>
            Choose how your learning guides connect. Your projects and execution
            stay local.
          </p>
        </div>
      </div>
      <div
        className={`ai-connection-state ${connected && enabled ? "ready" : ""}`}
        role="status"
      >
        <span />
        {!saved
          ? "Unsaved connection changes"
          : connected
            ? enabled
              ? "AI guides are on"
              : "Connected · guides are off"
            : "Finish connecting your AI"}
      </div>
      <div className="ai-options" role="group" aria-label="AI connection type">
        {(
          [
            ["included", "Included AI"],
            ["personal", "My API key"],
            ["local", "Local model"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            className={access.mode === mode ? "selected" : ""}
            disabled={busy}
            aria-pressed={access.mode === mode}
            onClick={() => {
              setAccess({ ...access, mode });
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {access.mode === "included" ? (
        <>
          <p>Connect OffCourse and Architect with an OutClass account.</p>
          <details className="ai-service-details">
            <summary>Advanced service connection</summary>
            <label>
              Included AI service
              <input
                type="url"
                value={access.service}
                onChange={(e) =>
                  setAccess({ ...access, service: e.target.value })
                }
                placeholder="Default OutClass service"
                disabled={busy || !!access.account}
              />
            </label>
          </details>
          {access.account ? (
            <>
              <div className="ai-account-summary">
                <Check size={16} />
                <div>
                  Signed in<small>{access.account.email}</small>
                </div>
                <ShieldCheck size={16} />
              </div>
              {usage && (
                <div className="ai-allowance-summary">
                  <div>
                    <span>Included AI</span>
                    <span>
                      {usage.plan === "paid" ? "OutClass Plus" : "Free preview"}
                    </span>
                  </div>
                  <p>
                    <strong>{usage.remaining}</strong>{" "}
                    <span>of {usage.limit} answers remaining</span>
                  </p>
                  <progress
                    value={usage.remaining}
                    max={Math.max(1, usage.limit)}
                    aria-label="Monthly answers remaining"
                  />
                  <small>Calendar month: {usage.period} · resets in UTC</small>
                </div>
              )}
              {usageNotice && (
                <p role="status" className="hint">
                  {usageNotice}
                </p>
              )}
              <div className="onboarding-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void act(() => api("ai-sign-out", {}))}
                >
                  Sign out
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void act(load)}
                >
                  Refresh allowance
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const r = await api<{ url: string }>("ai-checkout", {});
                      const u = new URL(r.url);
                      if (
                        u.protocol !== "https:" ||
                        !["checkout.stripe.com", "billing.stripe.com"].includes(
                          u.hostname,
                        ) ||
                        u.username ||
                        u.password
                      )
                        throw new Error("The billing link was not valid.");
                      if (window.gitLearnDesktop)
                        await window.gitLearnDesktop.openExternal(u.href);
                      else window.open(u.href, "_blank", "noopener,noreferrer");
                    })
                  }
                >
                  <CreditCard size={13} />{" "}
                  {usage?.plan === "paid"
                    ? "Manage subscription"
                    : "Open billing"}
                </button>
              </div>
              <p className="hint">
                Stripe opens securely in your browser. Review the current plan
                and payment details before confirming.
              </p>
            </>
          ) : (
            <DesktopAccount
              api={api}
              configure={() => api("ai-config", access)}
              onRefresh={async () => { await load(); await onRefresh(); }}
            />
          )}
        </>
      ) : access.mode === "local" ? (
        <>
          <p>
            Use a model served on this computer by an OpenAI-compatible local
            server, such as Ollama. Install and start the model yourself; speed
            and answer quality depend on your device.
          </p>
          <label>
            Local endpoint
            <input
              value={access.localEndpoint}
              onChange={(e) =>
                setAccess({ ...access, localEndpoint: e.target.value })
              }
            />
          </label>
          <label>
            Installed model name
            <input
              value={access.localModel}
              onChange={(e) =>
                setAccess({ ...access, localModel: e.target.value })
              }
              placeholder="The exact model name on your local server"
            />
          </label>
        </>
      ) : (
        <p>
          Use your personal key below. OpenAI bills your API account directly.
          Included AI and local models do not require a personal key.
        </p>
      )}
      <div className="onboarding-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act(() => api("ai-config", access))}
        >
          {busy ? <Loader2 size={14} className="spin" /> : null} Save connection
        </button>
        <button
          className="button secondary"
          disabled={busy || (!connected && !enabled)}
          onClick={() =>
            void act(() => api("assistant-enable", { enabled: !enabled }))
          }
        >
          {enabled ? "Disable AI guides" : "Enable AI guides"}
        </button>
        <button
          className="button secondary"
          disabled={busy || !connected}
          onClick={() =>
            void act(async () => {
              const r = await api<{ message: string }>("ai-check", {});
              setNotice(r.message);
            })
          }
        >
          Check AI connection
        </button>
      </div>
      <p className="hint">
        Save the connection before enabling it. Only submitted questions,
        relevant excerpts and explicitly shared project notes are sent. Local
        retrieval and notebooks remain available without AI.
      </p>
      {notice && (
        <p role="status" className="hint">
          {notice}
        </p>
      )}
    </section>
  );
}
