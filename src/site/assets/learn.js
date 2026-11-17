const learnMotion = matchMedia("(prefers-reduced-motion: no-preference)");

const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

async function typeExample(element, text, interval = 13) {
  if (!learnMotion.matches) {
    element.textContent = text;
    return;
  }

  element.textContent = "";
  for (let index = 2; index < text.length; index += 2) {
    element.textContent = text.slice(0, index);
    await wait(interval);
  }
  element.textContent = text;
}

const offcourse = document.querySelector("[data-offcourse]");
if (offcourse) {
  const next = offcourse.querySelector("[data-offcourse-next]");
  const status = offcourse.querySelector("[data-offcourse-status]");
  const code = offcourse.querySelector("[data-demo-code]");
  const output = offcourse.querySelector("[data-demo-output]");
  const question = offcourse.querySelector("[data-demo-question]");
  const hint = offcourse.querySelector("[data-demo-hint]");
  const example = [
    "def summarize(records):",
    "    totals = {}",
    "    for day, minutes in records:",
    "        totals[day] += minutes",
    "    return totals",
  ];
  const steps = [
    {
      nextLabel: "Ask OffCourse",
      async show() {
        status.textContent = "Running the example…";
        await typeExample(code, example.join("\n"), 17);
        output.textContent = "KeyError: 'Mon'  ·  1 / 3 checks passed";
        output.dataset.result = "error";
        status.textContent = "The first day has no starting total.";
      },
    },
    {
      nextLabel: "Apply the hint",
      async show() {
        status.textContent = "Asking OffCourse…";
        question.hidden = false;
        await typeExample(question, "Why does this fail on the first Monday?");
        hint.hidden = false;
        await typeExample(
          hint,
          "On the first Monday, the dictionary has no 'Mon' key. The dictionary lesson uses .get() with a default. Start at zero when the day is missing, then add the minutes.",
          8,
        );
        status.textContent = "Hint from Lesson 4 · Python dictionaries";
      },
    },
    {
      nextLabel: "Run checks",
      async show() {
        status.textContent = "Updating lesson.py…";
        const fixedLine = document.createElement("span");
        fixedLine.className = "offcourse-fix";
        code.replaceChildren(example.slice(0, 3).join("\n") + "\n", fixedLine);
        await typeExample(
          fixedLine,
          "        totals[day] = totals.get(day, 0) + minutes",
        );
        code.append("\n" + example[4]);
        output.textContent = "Code updated. Ready to check.";
        delete output.dataset.result;
        status.textContent = "The learner adds a starting value.";
      },
    },
    {
      nextLabel: "Checks passed",
      async show() {
        output.textContent =
          "3 / 3 passed · First day, repeated day, empty week";
        output.dataset.result = "success";
        status.textContent = "Example complete.";
      },
    },
  ];

  let step = 0;
  next.hidden = false;
  next.addEventListener("click", async () => {
    if (next.getAttribute("aria-disabled") === "true") return;
    next.setAttribute("aria-disabled", "true");
    const action = steps[step++];
    await action.show();
    next.textContent = action.nextLabel;
    if (step < steps.length) next.removeAttribute("aria-disabled");
  });
}

const blueprint = document.querySelector("[data-blueprint]");
if (blueprint) {
  const generate = blueprint.querySelector("[data-blueprint-generate]");
  const status = blueprint.querySelector("[data-blueprint-status]");
  const prompt = blueprint.querySelector("[data-blueprint-prompt]");
  const promptText = prompt.textContent.trim();
  const plan = blueprint.querySelector("[data-blueprint-plan]");
  const sections = [...plan.querySelectorAll("details")];

  prompt.textContent = "Describe a project you want to build…";
  plan.hidden = true;
  generate.hidden = false;
  generate.addEventListener(
    "click",
    async () => {
      generate.setAttribute("aria-disabled", "true");
      status.textContent = "Sending the study tracker idea…";
      await typeExample(prompt, promptText);

      status.textContent = "Blueprint is outlining the project…";
      plan.hidden = false;
      sections[0].open = true;
      if (learnMotion.matches) {
        sections.forEach((section, index) => {
          section.animate(
            [{ opacity: 0, transform: "translateY(9px)" }, { opacity: 1 }],
            {
              duration: 360,
              delay: index * 120,
              fill: "backwards",
              easing: "ease-out",
            },
          );
        });
        await wait(600);
      }
      generate.textContent = "Plan ready";
      status.textContent =
        "Open Architecture or Milestones to explore the plan.";
    },
    { once: true },
  );
}
