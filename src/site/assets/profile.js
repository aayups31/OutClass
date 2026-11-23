const el = (id) => document.getElementById(id);
let session,
  resetAt,
  refreshing = false;
async function api(path, body) {
  const response = await fetch(`/v1/browser/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "This information is temporarily unavailable.");
  return result;
}
function countdown() {
  if (!resetAt) return;
  const minutes = Math.max(0, Math.ceil((resetAt - Date.now()) / 60000));
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60);
  el("usage-countdown").textContent =
    minutes === 0
      ? "Reset due · refresh usage"
      : `${days ? `${days}d ` : ""}${hours}h ${minutes % 60}m`;
}
function renderUsage(usage) {
  const limit = Math.max(0, Number(usage.limit) || 0),
    used = Math.max(0, Number(usage.used) || 0),
    remaining = Math.max(0, Math.min(limit, Number(usage.remaining) || 0));
  const percent = limit ? Math.round((100 * remaining) / limit) : 0;
  el("usage-percent").textContent = percent;
  el("usage-left").textContent = remaining.toLocaleString();
  el("usage-used").textContent = used.toLocaleString();
  el("usage-limit").textContent = limit.toLocaleString();
  el("profile-progress").value = percent;
  el("usage-arc").setAttribute("stroke-dashoffset", String(100 - percent));
  el("usage-arc").setAttribute("stroke-opacity", percent ? "1" : "0");
  el("profile-plan").textContent =
    usage.plan === "paid" ? "OUTCLASS PLUS" : "FREE PREVIEW";
  const [year, month] = String(usage.period).split("-").map(Number);
  resetAt = new Date(usage.resetsAt || Date.UTC(year, month, 1));
  if (Number.isNaN(resetAt.getTime())) {
    resetAt = null;
    el("usage-reset-time").textContent = "unavailable";
  } else {
    el("usage-reset-time").dateTime = resetAt.toISOString();
    el("usage-reset-time").textContent = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(resetAt);
  }
  countdown();
}
function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function renderCourses(kind, courses) {
  const container = el(`courses-${kind}`);
  container.replaceChildren();
  el(`${kind}-count`).textContent =
    courses.length === 100 ? "100+" : String(courses.length);
  if (!courses.length) {
    const empty = node("div", null, "profile-empty"),
      link = node(
        "a",
        kind === "enrolled"
          ? "Find your next course ↗"
          : "Explore OutClass Educator ↗",
      );
    link.href = kind === "enrolled" ? "academy.html#catalog" : "download.html";
    empty.append(
      node(
        "h3",
        kind === "enrolled"
          ? "A fresh page. A new possibility."
          : "Your expertise could be someone’s beginning.",
      ),
      node(
        "p",
        kind === "enrolled"
          ? "Courses you enroll in will appear here."
          : "Your published Academy courses will appear here.",
      ),
      link,
    );
    container.append(empty);
    return;
  }
  courses.forEach((course, index) => {
    const row = node("article", null, "profile-course-row"),
      detail = node("div"),
      link = node("a", "View ↗");
    link.href = `academy.html?course=${encodeURIComponent(course.id)}#catalog`;
    link.setAttribute("aria-label", `View ${course.title}`);
    detail.append(
      node("h3", course.title),
      node(
        "p",
        `Version ${course.revision} · ${course.status === "withdrawn" ? "Withdrawn" : kind === "created" ? "Published" : "Enrolled"}`,
      ),
    );
    row.append(
      node("span", String(index + 1).padStart(2, "0")),
      detail,
      course.status === "withdrawn" ? node("span", "—") : link,
    );
    container.append(row);
  });
}
async function library() {
  try {
    const result = await api("academy/library");
    if (!Array.isArray(result.enrolled) || !Array.isArray(result.created))
      throw Error("Your courses could not be loaded.");
    renderCourses("enrolled", result.enrolled);
    renderCourses("created", result.created);
    el("courses-status").textContent = "";
  } catch {
    el("courses-status").textContent =
      "Your courses couldn’t be loaded. Refresh to try again.";
  }
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  el("profile-refresh").disabled = true;
  try {
    session = await api("session");
    if (!session.authenticated) {
      location.replace("account.html");
      return;
    }
    renderUsage(session.usage);
    el("profile-email").textContent = session.email;
    el("profile-name").textContent = session.email.split("@")[0];
    el("profile-avatar").textContent = session.email[0].toUpperCase();
    if (window.OutClassAccount) window.OutClassAccount.render(session);
    el("profile-content").hidden = false;
    el("profile-status").textContent = "";
    try {
      const { profile } = await api("profile");
      if (profile?.name) {
        el("profile-name").textContent = profile.name;
        el("profile-avatar").textContent = profile.name.trim()[0].toUpperCase();
      }
      if (window.OutClassAccount) {
        window.OutClassAccount.avatar(el("profile-avatar"), {
          ...session,
          name: profile?.name,
        });
        window.OutClassAccount.render({ ...session, name: profile?.name });
      }
    } catch {
      /* Identity and usage remain usable if preferences are unavailable. */
    }
    await library();
  } catch {
    el("profile-status").textContent =
      "Your profile couldn’t be loaded. Refresh to try again.";
  } finally {
    refreshing = false;
    el("profile-refresh").disabled = false;
  }
}
el("profile-refresh").addEventListener("click", refresh);
el("profile-signout").addEventListener("click", async () => {
  el("profile-signout").disabled = true;
  try {
    await api("sign-out", {});
    if (window.OutClassAccount)
      window.OutClassAccount.render({ authenticated: false });
    location.replace("account.html");
  } catch {
    el("profile-status").textContent =
      "Sign-out couldn’t be completed. Try again.";
    el("profile-signout").disabled = false;
  }
});
setInterval(countdown, 60000);
void refresh();
