import { autoplay, showText, typeText } from "./workspace-motion.js";

const offcourse = document.querySelector("[data-offcourse]");
if (offcourse) {
  const code = offcourse.querySelector("[data-demo-code]");
  const line = code.querySelector(".offcourse-fix");
  const before = line.previousSibling;
  const after = line.nextSibling;
  const prefix = before.textContent;
  const suffix = after.textContent;
  const corrected = line.textContent;
  const original = "totals[day] += minutes";
  const question = offcourse.querySelector("[data-demo-question]");
  const draft = offcourse.querySelector("[data-offcourse-draft]");
  const hint = offcourse.querySelector("[data-demo-hint]");
  const questionText = question.textContent.trim();
  const hintText = hint.textContent.trim();
  const output = offcourse.querySelector("[data-demo-output]");
  const caption = offcourse.querySelector("[data-demo-caption]");

  autoplay(offcourse, "OffCourse", 15700, (time) => {
    const fixing = time >= 8650;
    const passed = time >= 11100;
    const failed = time >= 2250 && !fixing;
    showText(before, typeText(prefix, time, 70, 1050));
    showText(
      line,
      fixing
        ? typeText(corrected, time, 8650, 1150)
        : typeText(original, time, 1120, 480),
    );
    showText(after, typeText(suffix, time, 1650, 420));
    line.classList.toggle("is-corrected", fixing);

    offcourse.toggleAttribute("data-chat-active", time >= 3150 && !passed);
    offcourse.toggleAttribute("data-running", failed || (fixing && !passed));
    question.toggleAttribute("data-visible", time >= 4350);
    hint.toggleAttribute("data-visible", time >= 4800);
    showText(
      draft,
      time >= 3250 && time < 4350
        ? typeText(questionText, time, 3250, 920)
        : "Ask OffCourse",
    );
    showText(question, questionText);
    showText(hint, typeText(hintText, time, 4800, 1650));

    const result = passed ? "success" : failed ? "error" : "idle";
    if (output.dataset.result !== result) output.dataset.result = result;
    showText(
      output,
      passed
        ? "3 / 3 checks passed"
        : failed
          ? "KeyError: 'Mon'"
          : fixing
            ? "Checking the update…"
            : time >= 2050
              ? "Running lesson.py…"
              : "Ready to run",
    );

    let stage = "Writing the example";
    if (passed) stage = "Checks passed";
    else if (fixing) stage = "Applying the hint";
    else if (time >= 4800) stage = "OffCourse explains the error";
    else if (time >= 3170) stage = "Asking OffCourse";
    else if (failed) stage = "The first check fails";
    showText(caption, stage);
  });
}

const blueprint = document.querySelector("[data-blueprint]");
if (blueprint) {
  const prompt = blueprint.querySelector("[data-blueprint-prompt]");
  const response = blueprint.querySelector("[data-blueprint-response]");
  const idea = prompt.textContent.trim();
  const answer = response.textContent.trim();
  const tiles = [...blueprint.querySelectorAll(".blueprint-map [data-reveal]")];
  const caption = blueprint.querySelector("[data-demo-caption]");
  const milestones = [
    ...blueprint.querySelectorAll(".blueprint-milestones li"),
  ];
  const starts = [2250, 4100, 4650, 5200, 6850];

  autoplay(blueprint, "Blueprint", 14800, (time) => {
    showText(prompt, typeText(idea, time, 110, 1600));
    blueprint.toggleAttribute("data-chat-active", time >= 200 && time < 2800);
    response.toggleAttribute("data-visible", time >= 1770);
    showText(response, typeText(answer, time, 1800, 1330));
    tiles.forEach((tile, index) => {
      tile.toggleAttribute("data-visible", time >= starts[index]);
    });

    milestones.forEach((milestone, index) => {
      milestone.classList.toggle("is-current", time >= 7350 + index * 900);
    });

    let stage = "Describing the idea";
    if (time >= 9750) stage = "Project plan ready";
    else if (time >= 6850) stage = "Sequencing the build";
    else if (time >= 4100) stage = "Mapping the files";
    else if (time >= 2250) stage = "Setting the scope";
    showText(caption, stage);
  });
}
