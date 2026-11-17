const motion = matchMedia("(prefers-reduced-motion: no-preference)");

export function showText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

export function typeText(text, time, start, duration) {
  const progress = Math.max(0, Math.min(1, (time - start) / duration));
  return text.slice(0, Math.floor(progress * text.length));
}

export function autoplay(demo, name, duration, render) {
  if (!("IntersectionObserver" in window)) return;

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
