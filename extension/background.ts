import { observationSchema, type Observation } from "../src/shared";
import {
  describeLearningPage,
  isCurriculumLesson,
  learningUrl,
  webLearningId,
} from "../src/learning-source";
import { readLearningPage } from "./read-learning-page";
const origin = "http://127.0.0.1:47831";
let flushing: Promise<void> | undefined;
let storageQueue: Promise<unknown> = Promise.resolve();
function stored<T>(action: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(action);
  storageQueue = result.catch(() => {});
  return result;
}
function outbox(value: unknown): Observation[] {
  return Array.isArray(value) ? value : [];
}
async function relatedLessons(current: URL, candidates: unknown) {
  if (!Array.isArray(candidates)) return [];
  const page = describeLearningPage(current);
  const lessons = new Map<string, Observation["lessons"][number]>();
  for (const item of candidates.slice(0, 300)) {
    if (typeof item?.url !== "string" || typeof item.title !== "string")
      continue;
    const url = learningUrl(item.url);
    if (!url || !isCurriculumLesson(url)) continue;
    const target = describeLearningPage(url);
    if (
      target.provider !== page.provider ||
      target.group !== page.group ||
      target.lessonKey === page.lessonKey
    )
      continue;
    const id =
      target.provider === "Udemy"
        ? target.lessonKey
        : await webLearningId("lesson", target.lessonKey);
    const title = item.title.trim().slice(0, 240);
    if (!title || lessons.has(id)) continue;
    lessons.set(id, {
      id,
      title,
      section: target.section.slice(0, 300),
      url: url.href,
      order: lessons.size,
    });
    if (lessons.size >= 100) break;
  }
  return [...lessons.values()];
}
async function send(route: string, body?: unknown) {
  const { token } = await chrome.storage.local.get("token");
  const response = await fetch(`${origin}/api/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(typeof token === "string"
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Open the companion to reconnect.");
  return result;
}
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const snapshot = await stored(() =>
      chrome.storage.local.get(["token", "outbox"]),
    );
    if (!snapshot.token) return;
    for (const item of outbox(snapshot.outbox)) {
      await send("observations", item);
      await stored(async () => {
        const current = await chrome.storage.local.get("outbox");
        await chrome.storage.local.set({
          outbox: outbox(current.outbox).filter(
            (event) => event.eventId !== item.eventId,
          ),
        });
      });
    }
    const remaining = await chrome.storage.local.get("outbox");
    await chrome.action.setBadgeText({
      text: outbox(remaining.outbox).length ? "•" : "",
    });
  })()
    .catch(async () => {
      await chrome.action.setBadgeText({ text: "•" });
      await chrome.action.setBadgeBackgroundColor({ color: "#c49651" });
    })
    .finally(() => {
      flushing = undefined;
    });
  return flushing;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message.type === "observation" &&
    sender.tab?.url &&
    /^https:\/\/(?:[a-z0-9-]+\.)*udemy\.com\/course\//.test(sender.tab.url)
  ) {
    const parsed = observationSchema.safeParse(message.payload);
    if (!parsed.success) {
      respond({ ok: false });
      return false;
    }
    stored(async () => {
      const snapshot = await chrome.storage.local.get("outbox");
      const current = outbox(snapshot.outbox);
      if (current.length >= 100) {
        await chrome.storage.local.set({
          queueNotice:
            "Too many pending observations. Open the companion before continuing.",
        });
        return false;
      }
      await chrome.storage.local.set({
        outbox: [...current, parsed.data],
        latest: parsed.data,
        queueNotice: "",
      });
      return true;
    }).then(
      (ok) => {
        respond({ ok });
        void flush();
      },
      () => respond({ ok: false }),
    );
    return true;
  }
  if (
    sender.id !== chrome.runtime.id ||
    (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL("")))
  )
    return false;
  (async () => {
    if (message.type === "open-workspace") return send("open-desktop", {});
    if (message.type === "preview-page" || message.type === "save-page") {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const url = learningUrl(tab?.url || "");
      if (!tab?.id || !url)
        throw new Error("Open an HTTPS learning page in this tab first.");
      const page = describeLearningPage(url);
      if (message.type === "preview-page") {
        const [frame] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: readLearningPage,
          args: [page.provider],
        });
        const result = frame?.result;
        if (!result || learningUrl(result.url)?.href !== url.href)
          throw new Error(
            "The page changed during capture. Try again on the lesson.",
          );
        return {
          ...result,
          url: url.href,
          links: await relatedLessons(url, result.links),
        };
      }
      if (message.url !== url.href)
        throw new Error(
          "The tab changed. Preview the current page before saving.",
        );
      const udemy =
        page.provider === "Udemy" && url.pathname.startsWith("/course/");
      const courseId = udemy
        ? page.group
        : await webLearningId("course", page.group);
      const lessonId =
        udemy && /^\d+$/.test(page.lessonKey)
          ? page.lessonKey
          : await webLearningId("lesson", page.lessonKey);
      const title =
        typeof message.title === "string"
          ? message.title.trim().slice(0, 260)
          : "";
      const lessonTitle = title || page.title;
      const related = await relatedLessons(url, message.links);
      const observation = observationSchema.parse({
        eventId: crypto.randomUUID(),
        courseId,
        title: page.title.slice(0, 300),
        preserveTitle: true,
        url: url.href,
        currentLessonId: lessonId,
        lessons: [
          {
            id: lessonId,
            title: lessonTitle,
            section: page.section.slice(0, 300),
            url: url.href,
          },
          ...related,
        ],
      });
      const text =
        typeof message.text === "string"
          ? message.text.trim().slice(0, 12000)
          : "";
      if (text)
        await send("course-material", {
          courseId,
          lessonId,
          title: lessonTitle.slice(0, 200),
          content: text,
          kind: message.kind === "transcript" ? "transcript" : "web-page",
          observation,
        });
      else await send("observations", observation);
      await stored(() => chrome.storage.local.set({ latest: observation }));
      return { ok: true };
    }
    if (message.type === "capture-transcript") {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs.find(
        (item) =>
          item.id &&
          /^https:\/\/(?:[a-z0-9-]+\.)*udemy\.com\/course\//.test(
            item.url || "",
          ),
      );
      if (!tab?.id)
        throw new Error("Open your Udemy lesson in the current tab first.");
      const result = await chrome.tabs
        .sendMessage(tab.id, { type: "read-transcript" })
        .catch(() => {
          throw new Error(
            "Reload your Udemy course after updating the extension, then open its Transcript panel.",
          );
        });
      if (result.error) throw new Error(result.error);
      const observation = observationSchema.parse(result.observation);
      await send("course-material", {
        courseId: observation.courseId,
        title: result.title,
        content: result.content,
        kind: "transcript",
        lessonId: result.lessonId || "",
        observation,
      });
      return { ok: true };
    }
    if (message.type === "pair") {
      const result = await send("pair", { code: message.code });
      await stored(() => chrome.storage.local.set({ token: result.token }));
      await flush();
      return { ok: true };
    }
    if (message.type === "status") {
      const local = await chrome.storage.local.get([
        "latest",
        "outbox",
        "token",
        "queueNotice",
      ]);
      let companion = null;
      try {
        companion = await send("extension-status");
      } catch {}
      return { ...local, token: !!local.token, companion };
    }
    if (message.type === "retry") {
      await flush();
      return { ok: true };
    }
    if (message.type === "disconnect") {
      await chrome.storage.local.remove("token");
      return { ok: true };
    }
    throw new Error("Unknown action");
  })().then(
    (result) => respond(result),
    (error) =>
      respond({
        error: error.message || "Open the local companion and try again.",
      }),
  );
  return true;
});
chrome.alarms.create("flush", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => void flush());
chrome.runtime.onStartup.addListener(() => void flush());
