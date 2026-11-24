// This function is injected into the active tab. It uses the rendered page and
// does not inspect its application state, private APIs, or cookies.
export function readLearningPage(provider: string) {
  const clean = (value: string, limit: number, preserveSpacing = false) => {
    const lines = value.replace(/\r/g, "");
    return (preserveSpacing ? lines : lines.replace(/[ \t]+/g, " "))
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, limit);
  };
  const visible = (element: HTMLElement) => {
    if (
      element.closest(
        '[hidden],[aria-hidden="true"],form,[contenteditable],.monaco-editor,.cm-editor',
      )
    )
      return false;
    const style = getComputedStyle(element);
    // A display:contents container can expose fully rendered lesson text.
    return (
      style.visibility === "visible" &&
      (element.getClientRects().length > 0 || style.display === "contents")
    );
  };
  const first = (selectors: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selectors)).find(visible);
  const heading =
    provider === "YouTube"
      ? first("ytd-watch-metadata h1, #title h1, h1")
      : provider === "LeetCode"
        ? first(
            'a[href^="/problems/"][class*="text-title"], [data-track-load="description_content"] h1, main h1, h1',
          )
        : first("main h1, article h1, [role=main] h1, h1");
  const title = clean(heading?.innerText || document.title || provider, 260);
  const links: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    "a[href]",
  )) {
    if (seen.has(anchor.href) || !visible(anchor)) continue;
    const label = clean(
      anchor.innerText || anchor.getAttribute("aria-label") || "",
      240,
    );
    if (!label) continue;
    seen.add(anchor.href);
    links.push({ title: label, url: anchor.href });
    if (links.length >= 300) break;
  }
  const result = (
    text: string,
    kind: "web-page" | "transcript" = "web-page",
  ) => ({ title, text, kind, url: location.href, links });
  const selection = window.getSelection();
  const selectionNode = selection?.anchorNode;
  const selectionElement =
    selectionNode instanceof Element
      ? selectionNode
      : selectionNode?.parentElement;
  if (
    selection?.toString().trim() &&
    selectionElement?.closest("input, textarea, [contenteditable], form")
  )
    return result("");
  const selected = clean(selection?.toString() || "", 12000, true);
  if (selected) return result(selected);
  if (
    provider === "LeetCode" &&
    /\/(editorial|solutions|submissions)(?:\/|$)/.test(location.pathname)
  )
    return result("");

  if (provider === "YouTube") {
    const segments = Array.from(
      document.querySelectorAll<HTMLElement>("ytd-transcript-segment-renderer"),
    )
      .filter(visible)
      .slice(0, 350)
      .map((segment) => clean(segment.innerText, 350))
      .filter(Boolean);
    if (segments.length)
      return result(clean(segments.join("\n"), 12000), "transcript");
  }

  const selectors: Record<string, string> = {
    YouTube:
      "ytd-watch-metadata #description-inline-expander, ytd-watch-metadata #description",
    LeetCode:
      '[data-track-load="description_content"], [data-testid="question-content"]',
    freeCodeCamp:
      "#description, #instructions, .challenge-description, .challenge-instructions",
    Codecademy:
      '[data-testid="instructions-panel"], [data-testid="narrative-content"]',
    "Boot.dev": "article, .prose",
    Coddy: "article, .prose",
  };
  const region =
    first(selectors[provider] || "article, main, [role=main]") ||
    (provider === "YouTube" ? undefined : first("article, main, [role=main]"));
  if (!region) return result("");
  const paragraphs: string[] = [];
  let length = 0;
  for (const element of region.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,p,pre,li,blockquote,dd",
  )) {
    if (
      element === heading ||
      !visible(element) ||
      element.parentElement?.closest(
        "li, pre, blockquote, nav, footer, aside, [role=navigation]",
      )
    )
      continue;
    const line = clean(element.innerText, 3000, element.tagName === "PRE");
    if (!line) continue;
    paragraphs.push(line);
    length += line.length;
    if (length >= 12000) break;
  }
  return result(clean(paragraphs.join("\n\n"), 12000));
}
