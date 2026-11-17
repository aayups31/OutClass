const motion = matchMedia("(prefers-reduced-motion: no-preference)");

function showText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function typeText(text, time, start, duration) {
  const progress = Math.max(0, Math.min(1, (time - start) / duration));
  return text.slice(0, Math.floor(progress * text.length));
}

function autoplay(demo, name, duration, render) {
  const control = demo.querySelector("[data-demo-pause]");
  const icon = control.firstElementChild;
  const label = control.lastElementChild;
  const progress = demo.querySelector(".demo-progress > i");
  let inView = false;
  let paused = false;
  let frame = 0;
  let previous = null;
  let elapsed = 0;

  function paint(time) {
    render(time);
    progress.style.transform = `scaleX(${time / duration})`;
  }

  function tick(now) {
    if (previous !== null) elapsed = (elapsed + now - previous) % duration;
    previous = now;
    paint(elapsed);
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    previous = null;
    if (inView && !document.hidden && !paused && motion.matches) {
      frame = requestAnimationFrame(tick);
    }
  }

  function updateMotion() {
    control.hidden = !motion.matches;
    demo.classList.toggle("demo-animated", motion.matches);
    if (!motion.matches) paint(duration);
    sync();
  }

  control.addEventListener("click", () => {
    paused = !paused;
    icon.textContent = paused ? "▷" : "Ⅱ";
    label.textContent = `${paused ? "Resume" : "Pause"} ${name} demo`;
    sync();
  });

  const observer = new IntersectionObserver(
    ([entry]) => {
      inView = entry.intersectionRatio >= 0.15;
      sync();
    },
    { threshold: 0.15 },
  );
  observer.observe(demo);
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", updateMotion);
  updateMotion();
}

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

    question.toggleAttribute("data-visible", time >= 3170);
    hint.toggleAttribute("data-visible", time >= 4800);
    showText(question, typeText(questionText, time, 3250, 1040));
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
            : "Running lesson.py…",
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
  const idea = prompt.textContent.trim();
  const tiles = [...blueprint.querySelectorAll("[data-reveal]")];
  const caption = blueprint.querySelector("[data-demo-caption]");
  const milestones = [
    ...blueprint.querySelectorAll(".blueprint-milestones li"),
  ];
  const starts = [2250, 4100, 4650, 5200, 6850];

  autoplay(blueprint, "Blueprint", 14800, (time) => {
    showText(prompt, typeText(idea, time, 110, 1600));
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
