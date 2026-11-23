const section = document.querySelector("#catalog"),
  catalog = document.querySelector("#academy-catalog"),
  notice = document.querySelector("#catalog-message");
async function request(route, body, browser = false) {
  const response = await fetch(
    `/v1/${browser ? "browser/" : ""}academy/${route}`,
    {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "Academy is temporarily unavailable.");
  return result;
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function action(button, fn) {
  button.addEventListener("click", async () => {
    button.disabled = true;
    notice.textContent = "";
    try {
      await fn();
    } catch (error) {
      notice.textContent = error.message;
      notice.focus();
    } finally {
      button.disabled = false;
    }
  });
}
async function load() {
  try {
    const courseId = new URLSearchParams(location.search).get("course");
    if (courseId && !/^[0-9a-f-]{36}$/i.test(courseId))
      throw Error("This course link is invalid.");
    const courses = courseId
      ? [await request(`courses/${encodeURIComponent(courseId)}`)]
      : (await request("catalog")).courses;
    catalog.replaceChildren();
    notice.textContent = "";
    if (!courses.length) return;
    for (const c of courses) {
      const card = element("article", null, "suite-course"),
        title = element("h3", c.title);
      card.append(
        element("span", `FREE COURSE · V${c.revision}`),
        title,
        element("p", c.outcome),
        element("p", c.audience),
      );
      const preview = element("details"),
        summary = element("summary", "Preview the curriculum");
      preview.append(summary, element("p", c.preview));
      for (const l of c.lessons)
        preview.append(
          element("h4", l.title),
          element("p", l.objective),
          element("p", l.practice),
        );
      card.append(preview);
      const enroll = element("button", "Enroll free", "button primary"),
        lesson = element("select");
      lesson.setAttribute("aria-label", `Choose lesson in ${c.title}`);
      c.lessons.forEach((l, i) => {
        const option = element("option", l.title);
        option.value = String(i);
        lesson.append(option);
      });
      const launch = element("button", "Create Learn launch code", "button"),
        output = element("input");
      output.readOnly = true;
      output.hidden = true;
      output.setAttribute("aria-label", "One-use Learn launch code");
      action(enroll, async () => {
        await request(`courses/${c.id}/enroll`, {}, true);
        enroll.textContent = "Enrolled";
        notice.textContent =
          "Choose a lesson and create a launch code. In OutClass Learn, sign in and go to My courses → Open an Academy course. In earlier OutClass apps, use the Academy page.";
      });
      action(launch, async () => {
        const result = await request(
          `courses/${c.id}/grant`,
          { lessonIndex: Number(lesson.value) },
          true,
        );
        output.value = result.grant;
        output.hidden = false;
        output.focus();
        output.select();
        notice.textContent =
          "Copy this one-use code into OutClass → Academy. It expires in five minutes. No code or progress is uploaded.";
      });
      card.append(enroll, lesson, launch, output);
      catalog.append(card);
    }
    section.hidden = false;
  } catch (error) {
    notice.textContent = error.message;
  }
}
void load();
