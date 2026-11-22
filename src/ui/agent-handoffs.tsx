import React, { useEffect, useState } from "react";
import type { AgentDomain, AgentHandoff } from "../server/agent-handoffs";
type API = <T>(route: string, body?: unknown) => Promise<T>;
export const agentNames: Record<AgentDomain, string> = {
  academy: "Atlas",
  creative: "Creative Director",
  growth: "Growth Strategist",
  analytics: "Analytics specialist",
};
export function ShareProposal({
  api,
  runId,
  from,
  disabled,
}: {
  api: API;
  runId: string;
  from: AgentDomain;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="agent-share">
      <span>Hand this proposal to another specialist</span>
      <div className="product-actions">
        {(Object.keys(agentNames) as AgentDomain[])
          .filter((d) => d !== from)
          .map((to) => (
            <button
              type="button"
              className="button small"
              disabled={disabled}
              key={to}
              onClick={async () => {
                try {
                  await api("expansion/handoffs/offer", { runId, to });
                  setMessage(
                    `Shared with ${agentNames[to]}. Accept it in the shared-context inbox to include it in that specialist’s next run.`,
                  );
                  window.dispatchEvent(new Event("outclass:handoffs"));
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              {agentNames[to]}
            </button>
          ))}
      </div>
      <p>{message}</p>
    </div>
  );
}
export function HandoffInbox({
  api,
  domain,
}: {
  api: API;
  domain: "academy" | "creative" | "growth";
}) {
  const [rows, setRows] = useState<AgentHandoff[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void api<AgentHandoff[]>("expansion/handoffs")
        .then((r) => {
          if (live)
            setRows(
              r.filter(
                (h) =>
                  h.to === domain ||
                  (domain === "growth" && h.to === "analytics"),
              ),
            );
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    refresh();
    window.addEventListener("outclass:handoffs", refresh);
    return () => {
      live = false;
      window.removeEventListener("outclass:handoffs", refresh);
    };
  }, [api, domain]);
  return (
    <details className="agent-handoff-inbox">
      <summary>
        Shared context · {rows.filter((r) => !r.acceptedAt).length} proposals to
        review
      </summary>
      <p>
        Accepted proposals become source-labeled context for the receiving
        specialist. They do not change a course, create a post or upload learner
        work.
      </p>
      {rows.length === 0 && (
        <p>No handoffs yet. Share a completed proposal from an agent below.</p>
      )}
      {rows.map((row) => (
        <article key={row.id}>
          <h4>
            {agentNames[row.from]} → {agentNames[row.to]}
          </h4>
          <small>
            Released course {row.releaseId.slice(0, 8)} · source revision{" "}
            {row.sourceRevision}
          </small>
          <p>{row.summary}</p>
          <details>
            <summary>Review proposal</summary>
            <p className="product-preserve">{row.proposal}</p>
          </details>
          <button
            className="button small"
            disabled={!!row.acceptedAt}
            onClick={async () => {
              try {
                await api(`expansion/handoffs/${row.id}/accept`, {
                  hash: row.hash,
                  approve: true,
                });
                window.dispatchEvent(new Event("outclass:handoffs"));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {row.acceptedAt
              ? "Included in next agent context"
              : "Accept shared context"}
          </button>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
