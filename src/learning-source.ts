const platformNames: Record<string, string> = {
  "udemy.com": "Udemy",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "youtube-nocookie.com": "YouTube",
  "vimeo.com": "Vimeo",
  "leetcode.com": "LeetCode",
  "freecodecamp.org": "freeCodeCamp",
  "codecademy.com": "Codecademy",
  "boot.dev": "Boot.dev",
  "coddy.tech": "Coddy",
};

export function learningUrl(raw: string) {
  if (raw.length > 2000) return null;
  try {
    const url = new URL(raw.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(
        url.hostname,
      ) ||
      /\.(?:localhost|local|internal|test|invalid|onion)$/i.test(url.hostname)
    )
      return null;
    const allowed = new URLSearchParams();
    if (platformName(url) === "YouTube") {
      for (const key of ["v", "list", "t", "start"]) {
        const value = url.searchParams.get(key);
        if (value && /^[\w-]{1,90}$/.test(value)) allowed.set(key, value);
      }
    }
    url.search = allowed.toString();
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function platformName(url: URL) {
  for (const [host, name] of Object.entries(platformNames))
    if (url.hostname === host || url.hostname.endsWith(`.${host}`)) return name;
  return url.hostname.replace(/^www\./, "");
}

function readableSlug(value: string) {
  try {
    value = decodeURIComponent(value);
  } catch {}
  return value
    .replace(/[-_]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function describeLearningPage(url: URL) {
  const provider = platformName(url);
  const parts = url.pathname.split("/").filter(Boolean);
  const [root, topic, chapter] = parts;
  let group = url.origin;
  let title = provider;
  let section = "Lessons";
  let lessonKey = url.origin + url.pathname.replace(/\/$/, "");

  if (provider === "Udemy" && root === "course" && topic) {
    const id = url.pathname.match(/\/lecture\/(\d+)/)?.[1];
    return {
      provider,
      group: topic,
      title: readableSlug(topic),
      section,
      lessonKey: id || lessonKey,
    };
  }
  if (provider === "YouTube") {
    const video =
      url.searchParams.get("v") ||
      (url.hostname === "youtu.be"
        ? root
        : /^(embed|shorts)$/.test(root)
          ? topic
          : null);
    const playlist = url.searchParams.get("list");
    group = playlist ? `youtube:playlist:${playlist}` : "youtube:videos";
    title = playlist ? "YouTube playlist" : "YouTube lessons";
    lessonKey = video ? `youtube:video:${video}` : url.href;
    section = playlist ? "Playlist" : "Videos";
  } else if (provider === "LeetCode") {
    group = "leetcode:practice";
    title = "LeetCode practice";
    section = "Problems";
    if (root === "problems" && topic) lessonKey = `leetcode:problem:${topic}`;
  } else if (provider === "freeCodeCamp" && root === "learn" && topic) {
    const versioned = /^\d{4}$/.test(topic);
    const curriculum = versioned ? chapter || topic : topic;
    const module = parts[versioned ? 3 : 2];
    group = `freecodecamp:${versioned ? `${topic}/` : ""}${curriculum}`;
    title = readableSlug(curriculum);
    section = module ? readableSlug(module) : "Lessons";
  } else if (
    provider === "Codecademy" &&
    (root === "courses" || root === "learn") &&
    topic
  ) {
    group = `codecademy:${topic}`;
    title = readableSlug(topic);
    const module = chapter === "lessons" ? parts[3] : chapter;
    section = module ? readableSlug(module) : "Lessons";
  } else if (provider === "Boot.dev" || provider === "Coddy") {
    if (
      (root === "courses" || (provider === "Coddy" && root === "learn")) &&
      topic
    ) {
      group = `${provider}:${topic}`;
      title = readableSlug(topic);
    } else {
      title = `${provider} lessons`;
    }
    section = chapter
      ? readableSlug(chapter)
      : root === "practice"
        ? "Practice"
        : "Lessons";
  } else if (root && topic) {
    group += `/${root}`;
    title = `${provider} · ${readableSlug(root)}`;
  }
  return { provider, group, title, section, lessonKey };
}

export function isCurriculumLesson(url: URL) {
  const pathname = url.pathname;
  switch (platformName(url)) {
    case "Udemy":
      return /^\/course\/[^/]+\/learn\/lecture\/\d+/.test(pathname);
    case "YouTube":
      return !!url.searchParams.get("list") && !!url.searchParams.get("v");
    case "LeetCode":
      return /^\/problems\/[^/]+\/(?:description\/?)?$/.test(pathname);
    case "freeCodeCamp":
      return /^\/learn\/(?:\d{4}\/)?[^/]+\/[^/]+\/[^/]+/.test(pathname);
    case "Codecademy":
      return pathname.includes("/exercises/");
    case "Coddy":
      return /^\/learn\/[^/]+\/[^/]+\/[^/]+/.test(pathname);
    case "Boot.dev":
      return /^\/lessons\/[^/]+/.test(pathname);
    default:
      return false;
  }
}

export async function webLearningId(
  prefix: "course" | "lesson",
  value: string,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `web-${prefix}-${Array.from(new Uint8Array(bytes).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
