import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Play, CheckCircle2, Download } from "lucide-react";
import type { CompiledProject } from "../server/academy-compiler";
import type { ProductAgentRun } from "../server/product-agents";
import { ShareProposal } from "./agent-handoffs";
import { AgentWorkPanel } from "./agent-work";
type API = <T>(route: string, body?: unknown) => Promise<T>;
export function AgentPanel({
  domain,
  entity,
  dirty,
  api,
  onApply,
  onWorkApplied,
}: {
  domain: "academy" | "creative" | "growth" | "analytics";
  entity?: { id: string; revision: number };
  dirty: boolean;
  api: API;
  onApply?: (text: string) => void;
  onWorkApplied?: () => Promise<void>;
}) {
  const [run, setRun] = useState<ProductAgentRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(entity?.id);
  current.current = entity?.id;
  useEffect(() => {
    let active = true;
    setRun(undefined);
    setError("");
    if (entity)
      api<ProductAgentRun[]>("expansion/agents")
        .then((rows) => {
          if (active)
            setRun(
              rows
                .filter((r) => r.entityId === entity.id && r.domain === domain)
                .at(-1),
            );
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [entity?.id, api, domain]);
  const name =
    domain === "academy"
      ? "Academy Architect"
      : domain === "creative"
        ? "Creative Director"
        : domain === "analytics"
          ? "Analytics specialist"
          : "Growth Strategist";
  return (
    <>
      <AgentWorkPanel
        domain={domain}
        entity={entity}
        dirty={dirty}
        api={api}
        onApplied={onWorkApplied}
      />
      <details className="agent-quick-review">
        <summary>Quick review & specialist handoff</summary>
        <section className="product-intelligence">
          <div className="product-panel-heading">
            <h3>
              <Sparkles size={16} /> {name}
            </h3>
            <span>One bounded model call</span>
          </div>
          <p>
            A source-aware proposal for this saved revision. You review the
            changes.
          </p>
          <button
            className="button"
            disabled={busy || !entity || dirty}
            onClick={async () => {
              if (
                !entity ||
                !confirm(
                  "Send this saved creator draft and selected lesson excerpts to your configured AI provider? This uses one bounded model call and may consume allowance or provider credits. No learner code is included.",
                )
              )
                return;
              const target = entity.id;
              setBusy(true);
              setError("");
              try {
                const result = await api<ProductAgentRun>(
                  "expansion/agents/run",
                  {
                    domain,
                    entityId: target,
                    expectedRevision: entity.revision,
                    approveProvider: true,
                  },
                );
                if (current.current === target) setRun(result);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "The run failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkles size={14} />
            {busy ? "Developing the proposal…" : `Ask ${name}`}
          </button>
          {error && <p role="alert">{error}</p>}
          {run?.state === "failed" && <p role="alert">{run.error}</p>}
          {run?.answer && (
            <div className="product-agent-proposal">
              <h4>{run.answer.summary}</h4>
              {run.answer.steps.map((s, i) => (
                <article key={i}>
                  <strong>{s.title}</strong>
                  <p>{s.detail}</p>
                  <small>
                    {s.sourceIds
                      .map(
                        (id) =>
                          run.sources.find((x) => x.id === id)?.title || id,
                      )
                      .join(" · ")}
                  </small>
                </article>
              ))}
              <details>
                <summary>Editable draft text</summary>
                <p className="product-preserve">{run.answer.draftText}</p>
              </details>
              {run.answer.limitations.map((l, i) => (
                <p className="product-limit" key={i}>
                  {l}
                </p>
              ))}
              <ShareProposal
                api={api}
                runId={run.id}
                from={domain}
                disabled={dirty || entity?.revision !== run.revision}
              />
              <div className="product-actions">
                {onApply && (
                  <button
                    className="button"
                    disabled={dirty || entity?.revision !== run.revision}
                    onClick={() => onApply(run.answer!.draftText)}
                  >
                    Use draft text
                  </button>
                )}
                <button
                  className="button"
                  onClick={() => {
                    const href = URL.createObjectURL(
                      new Blob([JSON.stringify(run, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const a = document.createElement("a");
                    a.href = href;
                    a.download = `outclass-agent-${run.id}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(href), 1000);
                  }}
                >
                  <Download size={14} />
                  Export proposal & sources
                </button>
              </div>
            </div>
          )}
          {!entity && <small>Save a draft to enable this agent.</small>}
          {dirty && (
            <small>
              Save your changes before asking for or applying a proposal.
            </small>
          )}
        </section>
      </details>
    </>
  );
}
export function CompilerPanel({
  course,
  dirty,
  api,
}: {
  course?: { id: string; revision: number };
  dirty: boolean;
  api: API;
}) {
  const [report, setReport] = useState<CompiledProject>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReport(undefined);
    if (course)
      api<CompiledProject | null>(`expansion/courses/${course.id}/project`)
        .then((r) => {
          if (active) setReport(r || undefined);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [course?.id, course?.revision, api]);
  return (
    <section className="product-intelligence">
      <div className="product-panel-heading">
        <h3>
          <CheckCircle2 size={16} /> Executable project laboratory
        </h3>
        <span>Python · Standard library</span>
      </div>
      <p>
        Compile the four-stage Activity API template: validate, accumulate,
        query, and design an HTTP boundary. This tests a vetted template, not
        arbitrary code in your lessons.
      </p>
      <button
        className="button"
        disabled={!course || dirty || busy}
        onClick={async () => {
          if (
            !course ||
            !confirm(
              "Run the built-in Python reference and starter in a temporary folder? This executes only OutClass's vetted template with 10-second limits and does not install packages.",
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            setReport(
              await api(`expansion/courses/${course.id}/compile`, {
                expectedRevision: course.revision,
                approveExecution: true,
              }),
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Validation failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Play size={14} />
        {busy
          ? "Running reference and starter checks…"
          : "Compile & validate Python project"}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <div className="product-ci-report">
          <strong>
            {report.revision === course?.revision
              ? "Verified template for this revision"
              : "Stale report — compile this revision again"}
          </strong>
          <p>
            Reference: {report.reference.passed}/{report.reference.tests} checks
            passed. Starter: {report.starter.passed}/{report.starter.tests}{" "}
            passed, intentionally incomplete.
          </p>
          <small>
            Executed on Python {report.reference.python} ·{" "}
            {new Date(report.validatedAt).toLocaleString()}
          </small>
          <ol>
            {report.milestones.map((m) => (
              <li key={m.title}>
                <strong>{m.title}</strong>
                <p>
                  {m.objective} · Checks {m.checks}
                </p>
              </li>
            ))}
          </ol>
          <p>
            Approve a new local course release to attach this project. Opening
            it in Learn creates starter and visible tests without overwriting
            existing files.
          </p>
        </div>
      )}
    </section>
  );
}
