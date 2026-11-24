import { platformName } from "../src/learning-source";

const statusEl = document.getElementById("status")!;
const details = document.getElementById("details")!;
async function update() {
  const result = await chrome.runtime.sendMessage({ type: "status" });
  statusEl.textContent = result.companion
    ? "Companion connected"
    : "Open your local companion";
  statusEl.className = result.companion ? "connected" : "disconnected";
  document.getElementById("pairing")!.hidden = !!result.companion;
  const latest = result.latest;
  details.replaceChildren();
  if (latest) {
    const label = document.createElement("small");
    label.textContent = platformName(new URL(latest.url));
    const heading = document.createElement("h2");
    heading.textContent = latest.title;
    const lesson = document.createElement("p");
    lesson.textContent =
      latest.lessons.find(
        (item: { id: string }) => item.id === latest.currentLessonId,
      )?.title || `${latest.lessons.length} lessons discovered`;
    details.append(label, heading, lesson);
  } else {
    const heading = document.createElement("h2");
    heading.textContent = "Your lesson, connected.";
    const paragraph = document.createElement("p");
    paragraph.textContent =
      "Open a lesson, tutorial, or coding challenge and capture it here.";
    details.append(heading, paragraph);
  }
  document.getElementById("pending")!.textContent =
    result.queueNotice ||
    (result.outbox?.length
      ? `${result.outbox.length} course updates waiting for the companion.`
      : "");
}
document
  .getElementById("pair-form")!
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await chrome.runtime.sendMessage({
      type: "pair",
      code: (document.getElementById("code") as HTMLInputElement).value,
    });
    document.getElementById("error")!.textContent = result.error || "";
    await update();
  });
document.getElementById("open")!.addEventListener("click", async () => {
  const result = await chrome.runtime
    .sendMessage({ type: "open-workspace" })
    .catch(() => null);
  if (!result?.opened)
    await chrome.tabs.create({ url: "http://127.0.0.1:47831" });
});
document.getElementById("retry")!.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "retry" });
  await update();
});
document.getElementById("transcript")!.addEventListener("click", async () => {
  const button = document.getElementById("transcript") as HTMLButtonElement;
  button.disabled = true;
  document.getElementById("error")!.textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({
      type: "capture-transcript",
    });
    if (result.error) throw new Error(result.error);
    document.getElementById("transcript-status")!.textContent =
      "Transcript saved. Open OutClass → Code & learn → Sources.";
  } catch (error) {
    document.getElementById("error")!.textContent =
      error instanceof Error
        ? error.message
        : "Could not import this transcript.";
  } finally {
    button.disabled = false;
  }
});
const capture = document.getElementById("capture") as HTMLButtonElement;
const preview = document.getElementById("capture-preview") as HTMLFormElement;
const titleInput = document.getElementById("capture-title") as HTMLInputElement;
const textInput = document.getElementById(
  "capture-text",
) as HTMLTextAreaElement;
const errorField = document.getElementById("error")!;
const captureStatus = document.getElementById("transcript-status")!;
const related = document.getElementById("related-lessons") as HTMLInputElement;
let capturePage:
  | { url: string; kind: string; links: { url: string; title: string }[] }
  | undefined;

capture.addEventListener("click", async () => {
  capture.disabled = true;
  errorField.textContent = "";
  captureStatus.textContent = "";
  preview.hidden = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "preview-page" });
    if (result.error) throw new Error(result.error);
    capturePage = { url: result.url, kind: result.kind, links: result.links };
    related.checked = false;
    document.getElementById("related-lessons-label")!.hidden =
      !result.links.length;
    document.getElementById("related-lessons-count")!.textContent =
      `Include ${result.links.length} visible lesson links`;
    titleInput.value = result.title;
    textInput.value = result.text;
    preview.hidden = false;
    titleInput.focus();
  } catch (error) {
    errorField.textContent =
      error instanceof Error
        ? error.message
        : "This page could not be captured.";
  } finally {
    capture.disabled = false;
  }
});
preview.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!capturePage) return;
  const submit = preview.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  submit.disabled = true;
  capture.disabled = true;
  errorField.textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({
      type: "save-page",
      ...capturePage,
      links: related.checked ? capturePage.links : [],
      title: titleInput.value,
      text: textInput.value,
    });
    if (result.error) throw new Error(result.error);
    preview.hidden = true;
    capturePage = undefined;
    textInput.value = "";
    captureStatus.textContent = "Saved to My courses in Learn.";
    await update();
  } catch (error) {
    errorField.textContent =
      error instanceof Error ? error.message : "Could not save the lesson.";
  } finally {
    submit.disabled = false;
    capture.disabled = false;
  }
});
document.getElementById("cancel-capture")!.addEventListener("click", () => {
  preview.hidden = true;
  capturePage = undefined;
  textInput.value = "";
  capture.focus();
});
update().catch(() => {
  statusEl.textContent = "Reload the extension to reconnect.";
});
