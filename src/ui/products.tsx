import React, { useEffect, useRef, useState } from "react";
import { Plus, CheckCircle2, ArrowUpRight, Download } from "lucide-react";
import type {
  CreativeDraft,
  CampaignDraft,
  ExpansionState,
  Creative,
  Campaign,
} from "../expansion-contract";
import "./products.css";
import { CreatorDesign } from "./creator-design";
import { HandoffInbox } from "./agent-handoffs";
import { GTMStudioPanel } from "./gtm-studio";
import { GTMOperations } from "./gtm-operations";
import { CreatorMedia } from "./creator-media";
import { AgentPanel } from "./product-intelligence";
import { AcademyWorkbench } from "./academy-workbench";
type API = <T>(route: string, body?: unknown) => Promise<T>;
const creativeValues = (c: CreativeDraft): CreativeDraft => ({
  title: c.title,
  releaseId: c.releaseId,
  lessonIndex: c.lessonIndex,
  brief: c.brief,
  copy: c.copy,
  brandColor: c.brandColor,
  rightsConfirmed: c.rightsConfirmed,
});
const campaignValues = (c: CampaignDraft): CampaignDraft => ({
  title: c.title,
  creativeId: c.creativeId,
  destination: c.destination,
  source: c.source,
  medium: c.medium,
  goal: c.goal,
  budgetMinor: c.budgetMinor,
  currency: c.currency,
});
function exportFile(name: string, value: unknown) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function ProductWorkspace(props: {
  mode: "academy" | "creator" | "gtm";
  api: API;
  onCode: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  return props.mode === "academy" ? (
    <AcademyWorkbench
      api={props.api}
      onCode={props.onCode}
      onDirty={props.onDirty}
    />
  ) : (
    <StudioWorkspace
      mode={props.mode}
      api={props.api}
      onDirty={props.onDirty}
    />
  );
}
function StudioWorkspace({
  mode,
  api,
  onDirty,
}: {
  mode: "creator" | "gtm";
  api: API;
  onDirty: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<ExpansionState>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [creative, setCreative] = useState<CreativeDraft>({
    title: "",
    releaseId: "",
    lessonIndex: 0,
    brief: "",
    copy: "",
    brandColor: "#386bfa",
    rightsConfirmed: false,
  });
  const [selectedCreative, setSelectedCreative] = useState<Creative>();
  const [campaign, setCampaign] = useState<CampaignDraft>({
    title: "",
    creativeId: "",
    destination: "",
    source: "linkedin",
    medium: "organic",
    goal: "",
    budgetMinor: 0,
    currency: "CAD",
  });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign>();
  const [dirty, setDirty] = useState(false);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [promotionDirty, setPromotionDirty] = useState(false);
  const [composerDirty, setComposerDirty] = useState(false);
  const [composerSession, setComposerSession] = useState(0);
  const [creativeView, setCreativeView] = useState<
    "Brief" | "Design & media" | "Muse"
  >("Brief");
  const [gtmTab, setGtmTab] = useState<"create" | "campaigns">("create");
  const unsaved = useRef(false);
  unsaved.current = dirty || mediaDirty || promotionDirty || composerDirty;
  useEffect(
    () => onDirty(dirty || mediaDirty || promotionDirty || composerDirty),
    [dirty, mediaDirty, promotionDirty, composerDirty, onDirty],
  );
  const reload = async () => {
    const result = await api<ExpansionState>("expansion/state");
    setData(result);
    return result;
  };
  const workApplied = async () => {
    const result = await reload();
    if (unsaved.current) {
      setNotice(
        "The agent saved a new revision. Your unsaved edits are preserved; reload before saving them.",
      );
      return;
    }
    if (selectedCreative) {
      const next = result.creatives.find((c) => c.id === selectedCreative.id);
      if (next) {
        setSelectedCreative(next);
        setCreative(creativeValues(next));
      }
    }
    if (selectedCampaign) {
      const next = result.campaigns.find((c) => c.id === selectedCampaign.id);
      if (next) {
        setSelectedCampaign(next);
        setCampaign(campaignValues(next));
      }
    }
    setComposerSession((v) => v + 1);
    setNotice(
      "Agent work delivered. Review the updated draft and its next step.",
    );
  };
  useEffect(() => {
    let live = true;
    api<ExpansionState>("expansion/state")
      .then((value) => {
        if (live) {
          setData(value);
          if (mode === "gtm") {
            const last = value.campaigns.at(-1);
            if (last) {
              setSelectedCampaign(last);
              setCampaign(campaignValues(last));
            }
          }
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
      onDirty(false);
    };
  }, [api, onDirty]);
  function changed() {
    setDirty(true);
    onDirty(true);
  }
  function clean() {
    setDirty(false);
    onDirty(mediaDirty || promotionDirty || composerDirty);
  }
  function canSwitch() {
    return (
      !(dirty || mediaDirty || promotionDirty || composerDirty) ||
      confirm("Discard unsaved changes to this draft?")
    );
  }
  async function action(fn: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
      if (message) setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const source = data?.releases.find((r) => r.id === creative.releaseId);
  const currentLesson = source?.lessons[creative.lessonIndex];
  const names = { creator: "Creator Studio", gtm: "GTM" };
  if (!data)
    return (
      <div className="product-workspace">
        <p role={error ? "alert" : "status"}>
          {error || "Loading your local workspace…"}
        </p>
      </div>
    );
  return (
    <div className="product-workspace">
      <header className={`product-workspace-header ${mode}`}>
        <h1>{names[mode]}</h1>
      </header>
      {error && (
        <p className="product-message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="product-message" role="status">
          {notice}
        </p>
      )}
      <fieldset disabled={busy} className="product-fieldset">
        {mode === "gtm" && (
          <nav
            className="product-section-tabs"
            aria-label="GTM workspace sections"
          >
            <button
              type="button"
              className={gtmTab === "create" ? "selected" : ""}
              aria-pressed={gtmTab === "create"}
              onClick={() => setGtmTab("create")}
            >
              Promotion studio
            </button>
            <button
              type="button"
              className={gtmTab === "campaigns" ? "selected" : ""}
              aria-pressed={gtmTab === "campaigns"}
              onClick={() => setGtmTab("campaigns")}
            >
              Campaigns & insights
            </button>
          </nav>
        )}
        {mode === "gtm" && (
          <div hidden={gtmTab !== "create"}>
            <GTMStudioPanel
              postDirty={composerDirty}
              api={api}
              onDirty={setPromotionDirty}
              releases={data.releases}
              onCampaign={async (id) => {
                if (!canSwitch()) return;
                const next = await reload(),
                  found = next.campaigns.find((c) => c.id === id);
                if (found) {
                  setSelectedCampaign(found);
                  setComposerSession((v) => v + 1);
                  setCampaign(campaignValues(found));
                  setGtmTab("campaigns");
                  clean();
                }
              }}
            />
          </div>
        )}
        <HandoffInbox
          api={api}
          domain={mode === "gtm" ? "growth" : "creative"}
        />
        {mode === "creator" && (
          <div className="product-columns">
            <aside className="product-drafts">
              <h2>Creative drafts</h2>
              <button
                className="button"
                onClick={() => {
                  if (canSwitch()) {
                    setCreativeView("Brief");
                    setSelectedCreative(undefined);
                    setCreative({
                      title: "",
                      releaseId: "",
                      lessonIndex: 0,
                      brief: "",
                      copy: "",
                      brandColor: "#386bfa",
                      rightsConfirmed: false,
                    });
                    clean();
                  }
                }}
              >
                <Plus size={15} />
                New creative
              </button>
              {data.creatives.map((c) => (
                <button
                  className="product-item"
                  key={c.id}
                  onClick={() => {
                    if (canSwitch()) {
                      setSelectedCreative(c);
                      setCreative(creativeValues(c));
                      clean();
                    }
                  }}
                >
                  {c.title}
                  <small>
                    v{c.revision} · {c.approval ? "Copy approved" : "Draft"}
                  </small>
                </button>
              ))}
            </aside>
            <section className="product-editor">
              <nav
                className="product-section-tabs"
                aria-label="Creative workspace views"
              >
                {(["Brief", "Design & media", "Muse"] as const).map((view) => (
                  <button
                    type="button"
                    key={view}
                    aria-pressed={creativeView === view}
                    className={creativeView === view ? "selected" : ""}
                    onClick={() => setCreativeView(view)}
                  >
                    {view}
                  </button>
                ))}
              </nav>
              <div hidden={creativeView !== "Muse"}>
                <AgentPanel
                  onWorkApplied={workApplied}
                  domain="creative"
                  entity={selectedCreative}
                  dirty={dirty || mediaDirty || promotionDirty || composerDirty}
                  api={api}
                  onApply={(text) => {
                    setCreative({ ...creative, copy: text });
                    changed();
                  }}
                />
              </div>
              <div
                className="creative-writing"
                hidden={creativeView !== "Brief"}
              >
                <div className="product-panel-heading">
                  <h2>Writing & creative brief</h2>
                  <span>
                    {dirty
                      ? "Unsaved changes"
                      : selectedCreative?.approval
                        ? "Approved copy"
                        : "Draft"}
                  </span>
                </div>
                <label>
                  Creative title
                  <input
                    value={creative.title}
                    maxLength={200}
                    onChange={(e) => {
                      setCreative({ ...creative, title: e.target.value });
                      changed();
                    }}
                  />
                </label>
                <div className="product-input-row">
                  <label>
                    Course release
                    <select
                      aria-label="Course release"
                      value={creative.releaseId}
                      onChange={(e) => {
                        setCreative({
                          ...creative,
                          releaseId: e.target.value,
                          lessonIndex: 0,
                        });
                        changed();
                      }}
                    >
                      <option value="">Choose a local course release</option>
                      {data.releases.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} · v{r.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source lesson
                    <select
                      aria-label="Source lesson"
                      value={creative.lessonIndex}
                      disabled={!source}
                      onChange={(e) => {
                        setCreative({
                          ...creative,
                          lessonIndex: Number(e.target.value),
                        });
                        changed();
                      }}
                    >
                      {source?.lessons.map((l, i) => (
                        <option key={i} value={i}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {currentLesson && (
                  <div className="product-source">
                    <h3>Source evidence</h3>
                    <p>{currentLesson.objective}</p>
                    <details>
                      <summary>Read the actual lesson</summary>
                      <p className="product-preserve">
                        {currentLesson.content}
                      </p>
                    </details>
                  </div>
                )}
                <label>
                  Creative brief
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Audience, destination, tone and the single story to tell"
                    value={creative.brief}
                    onChange={(e) => {
                      setCreative({ ...creative, brief: e.target.value });
                      changed();
                    }}
                  />
                </label>
                <label>
                  Primary brand color
                  <input
                    type="color"
                    value={creative.brandColor}
                    onChange={(e) => {
                      setCreative({ ...creative, brandColor: e.target.value });
                      changed();
                    }}
                  />
                </label>
                <label>
                  Editable copy
                  <textarea
                    rows={7}
                    maxLength={8000}
                    value={creative.copy}
                    onChange={(e) => {
                      setCreative({ ...creative, copy: e.target.value });
                      changed();
                    }}
                  />
                </label>
                <button
                  className="button"
                  disabled={!currentLesson}
                  onClick={() => {
                    setCreative({
                      ...creative,
                      copy: `${source!.title}\n\n${currentLesson!.objective}\n\nPractice: ${currentLesson!.practice}`,
                    });
                    changed();
                  }}
                >
                  Use source objective as a starting draft
                </button>
                <label className="product-checkbox">
                  <input
                    type="checkbox"
                    checked={creative.rightsConfirmed}
                    onChange={(e) => {
                      setCreative({
                        ...creative,
                        rightsConfirmed: e.target.checked,
                      });
                      changed();
                    }}
                  />
                  I have rights to use this material and have reviewed the
                  claims.
                </label>
                <div className="product-actions">
                  <button
                    className="button primary"
                    disabled={!creative.title || !creative.releaseId}
                    onClick={() =>
                      void action(async () => {
                        const saved = await api<Creative>(
                          "expansion/creatives/save",
                          {
                            ...creative,
                            id: selectedCreative?.id,
                            expectedRevision: selectedCreative?.revision || 0,
                          },
                        );
                        setCreative(creativeValues(saved));
                        setSelectedCreative(saved);
                        clean();
                      }, "Creative draft saved.")
                    }
                  >
                    Save creative draft
                  </button>
                  <button
                    className="button"
                    disabled={!selectedCreative || dirty}
                    onClick={() => {
                      if (
                        confirm(
                          "Approve this exact copy revision for a campaign brief?",
                        )
                      )
                        void action(async () => {
                          const approved = await api<Creative>(
                            `expansion/creatives/${selectedCreative!.id}/approve`,
                            {
                              expectedRevision: selectedCreative!.revision,
                              approve: true,
                            },
                          );
                          setSelectedCreative(approved);
                          setCreative(creativeValues(approved));
                        }, "Copy approved. Further edits require new approval.");
                    }}
                  >
                    Approve copy
                  </button>
                  <button
                    className="button"
                    disabled={!selectedCreative || dirty}
                    onClick={() =>
                      exportFile(
                        `outclass-creative-${selectedCreative!.id}.json`,
                        selectedCreative,
                      )
                    }
                  >
                    Export editable brief
                  </button>
                </div>
              </div>
              <div hidden={creativeView !== "Design & media"}>
                <CreatorDesign
                  api={api}
                  creative={selectedCreative}
                  dirty={dirty}
                />
                <CreatorMedia
                  key={`${selectedCreative?.id || "new"}:${composerSession}`}
                  onTimelineDirty={setMediaDirty}
                  api={api}
                  creative={selectedCreative}
                  dirty={dirty}
                />
              </div>
            </section>
          </div>
        )}
        {mode === "gtm" && (
          <div className="product-columns" hidden={gtmTab !== "campaigns"}>
            <aside className="product-drafts">
              <h2>Campaign drafts</h2>
              <button
                className="button"
                onClick={() => {
                  if (canSwitch()) {
                    setSelectedCampaign(undefined);
                    setCampaign({
                      title: "",
                      creativeId: "",
                      destination: "",
                      source: "linkedin",
                      medium: "organic",
                      goal: "",
                      budgetMinor: 0,
                      currency: "CAD",
                    });
                    clean();
                  }
                }}
              >
                <Plus size={15} />
                New campaign
              </button>
              {data.campaigns.map((c) => (
                <button
                  key={c.id}
                  className="product-item"
                  onClick={() => {
                    if (canSwitch()) {
                      setCampaign(campaignValues(c));
                      setSelectedCampaign(c);
                      clean();
                    }
                  }}
                >
                  {c.title}
                  <small>Campaign plan · Draft v{c.revision}</small>
                </button>
              ))}
              <div className="product-data-health">
                <CheckCircle2 size={18} />
                <h3>Honest measurement</h3>
                <p>
                  No channels connected. Visits, enrollments and revenue are
                  unavailable, not zero.
                </p>
              </div>
            </aside>
            <section className="product-editor">
              <details className="agent-disclosure">
                <summary>Signal</summary>
                <AgentPanel
                  onWorkApplied={workApplied}
                  domain="growth"
                  entity={selectedCampaign}
                  dirty={dirty || mediaDirty || promotionDirty || composerDirty}
                  api={api}
                  onApply={(text) => {
                    setCampaign({ ...campaign, goal: text.slice(0, 2000) });
                    changed();
                  }}
                />
              </details>

              <h2>Campaign planner</h2>
              <label>
                Campaign title
                <input
                  value={campaign.title}
                  maxLength={200}
                  onChange={(e) => {
                    setCampaign({ ...campaign, title: e.target.value });
                    changed();
                  }}
                />
              </label>
              <label>
                Approved creative
                <select
                  aria-label="Approved creative"
                  value={campaign.creativeId}
                  onChange={(e) => {
                    setCampaign({ ...campaign, creativeId: e.target.value });
                    changed();
                  }}
                >
                  <option value="">Select reviewed copy</option>
                  {data.creatives
                    .filter((c) => c.approval)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} · v{c.revision}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Goal & hypothesis
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={campaign.goal}
                  placeholder="Who are you trying to reach, and what will you learn?"
                  onChange={(e) => {
                    setCampaign({ ...campaign, goal: e.target.value });
                    changed();
                  }}
                />
              </label>
              <label>
                Destination URL
                <input
                  type="url"
                  placeholder="https://your-course-page.example"
                  maxLength={2000}
                  value={campaign.destination}
                  onChange={(e) => {
                    setCampaign({ ...campaign, destination: e.target.value });
                    changed();
                  }}
                />
              </label>
              <div className="product-input-row">
                <label>
                  UTM source
                  <input
                    maxLength={100}
                    value={campaign.source}
                    onChange={(e) => {
                      setCampaign({ ...campaign, source: e.target.value });
                      changed();
                    }}
                  />
                </label>
                <label>
                  UTM medium
                  <input
                    maxLength={100}
                    value={campaign.medium}
                    onChange={(e) => {
                      setCampaign({ ...campaign, medium: e.target.value });
                      changed();
                    }}
                  />
                </label>
              </div>
              <div className="product-input-row">
                <label>
                  Proposed budget in cents
                  <input
                    type="number"
                    min="0"
                    max="10000000"
                    step="1"
                    value={campaign.budgetMinor}
                    onChange={(e) => {
                      setCampaign({
                        ...campaign,
                        budgetMinor: Number(e.target.value),
                      });
                      changed();
                    }}
                  />
                </label>
                <label>
                  Currency
                  <select
                    aria-label="Currency"
                    value={campaign.currency}
                    onChange={(e) => {
                      setCampaign({
                        ...campaign,
                        currency: e.target.value as CampaignDraft["currency"],
                      });
                      changed();
                    }}
                  >
                    {["CAD", "USD", "EUR", "GBP"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="product-actions">
                <button
                  className="button primary"
                  disabled={!campaign.title || !campaign.creativeId}
                  onClick={() =>
                    void action(async () => {
                      const saved = await api<Campaign>(
                        "expansion/campaigns/save",
                        {
                          ...campaign,
                          id: selectedCampaign?.id,
                          expectedRevision: selectedCampaign?.revision || 0,
                        },
                      );
                      setSelectedCampaign(saved);
                      setCampaign(campaignValues(saved));
                      clean();
                    }, "Campaign saved as a draft. Nothing has been published or spent.")
                  }
                >
                  Save campaign plan
                </button>
                <button
                  className="button"
                  disabled={!selectedCampaign || dirty}
                  onClick={() =>
                    exportFile(
                      `outclass-campaign-${selectedCampaign!.id}.json`,
                      selectedCampaign,
                    )
                  }
                >
                  Export manual handoff
                </button>
              </div>
              {selectedCampaign && !dirty && (
                <div className="product-source">
                  <h3>Tagged destination</h3>
                  <p className="product-preserve">
                    {selectedCampaign.trackedUrl}
                  </p>
                  <p>
                    UTMs label a link. They do not establish traffic tracking or
                    attribution.
                  </p>
                </div>
              )}
              <details className="agent-disclosure">
                <summary>Measurement plan</summary>
                <ol>
                  <li>
                    Review the course destination and consent requirements.
                  </li>
                  <li>
                    Review an exact post, then submit it or authorize its
                    scheduled publication.
                  </li>
                  <li>
                    Connect first-party enrollment events before evaluating
                    conversion.
                  </li>
                  <li>
                    Record real spend and verified orders before calculating
                    revenue or ROAS.
                  </li>
                </ol>
              </details>

              <GTMOperations
                key={`${selectedCampaign?.id || "new"}:${composerSession}`}
                onDirty={setComposerDirty}
                api={api}
                campaign={selectedCampaign}
                dirty={dirty}
              />
              <details className="agent-disclosure">
                <summary>Pulse</summary>
                <AgentPanel
                  onWorkApplied={workApplied}
                  domain="analytics"
                  entity={selectedCampaign}
                  dirty={dirty || mediaDirty || promotionDirty || composerDirty}
                  api={api}
                />
              </details>
              <p className="product-limit">
                Proposed budgets are plans, never spending instructions. Connect
                verified channels before publishing.
              </p>
            </section>
          </div>
        )}
      </fieldset>
    </div>
  );
}
