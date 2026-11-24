const providers = [
  "udemy.com",
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "vimeo.com",
  "coursera.org",
  "edx.org",
  "ocw.mit.edu",
  "khanacademy.org",
  "freecodecamp.org",
];

export function courseViewUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      providers.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      return url;
  } catch {}
  return null;
}

export function lessonViewUrl(value: string, lessonId?: string) {
  const url = courseViewUrl(value);
  if (!url) return "";
  const course = url.pathname.match(/^\/course\/([^/]+)/);
  if (
    course &&
    (url.hostname === "udemy.com" || url.hostname.endsWith(".udemy.com")) &&
    lessonId &&
    /^\d+$/.test(lessonId)
  ) {
    url.pathname = `/course/${course[1]}/learn/lecture/${lessonId}`;
    url.search = "";
    url.hash = "";
  }
  if (url.hostname === "youtu.be" || url.hostname.endsWith("youtube.com")) {
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v") ||
          url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) {
      const player = new URL(`https://www.youtube.com/embed/${id}`);
      const start = url.searchParams.get("start") || url.searchParams.get("t");
      if (start && /^\d+s?$/.test(start))
        player.searchParams.set("start", start.replace(/s$/, ""));
      return player.href;
    }
  }
  const vimeo = url.pathname.match(/^\/(\d+)\/?$/);
  if (
    vimeo &&
    (url.hostname === "vimeo.com" || url.hostname === "www.vimeo.com")
  )
    return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url.href;
}
