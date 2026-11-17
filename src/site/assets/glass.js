const glassAgentTabs = document.querySelector(".glass-tabs");
const fromHash = () => {
  const id = location.hash.slice(1);
  const legacy = { offcourse: "tab-learn", architect: "tab-learn" };
  const target = document.getElementById(legacy[id] || id);
  if (glassAgentTabs?.contains(target)) target.click();
};
if (glassAgentTabs) {
  const details = document.getElementById("glass-agent-details");
  glassAgentTabs.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    history.replaceState(null, "", "#" + tab.id);
    if (details) details.hash = tab.id;
    if (
      window.gsap &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      gsap.killTweensOf(panel);
      gsap.fromTo(
        panel,
        { y: 17, opacity: 0.65 },
        {
          y: 0,
          opacity: 1,
          duration: 0.45,
          ease: "power3.out",
          clearProps: "transform,opacity",
        },
      );
    }
  });
  fromHash();
  window.addEventListener("hashchange", fromHash);
}
if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const headlines = document.querySelectorAll(
      ".glass-detail-hero .glass-scene-copy, .glass-agent-page > h1",
    );
    if (headlines.length) {
      gsap.from(headlines, {
        opacity: 0.65,
        y: 14,
        duration: 0.55,
        ease: "power3.out",
      });
    }
    const hero = document.querySelector(".glass-hero");
    if (hero) {
      gsap.fromTo(
        hero.querySelector(".glass-demo"),
        { rotateX: 11, scale: 0.94, y: 26 },
        {
          rotateX: 0,
          scale: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "bottom 59%",
            scrub: 0.65,
          },
        },
      );
      gsap.to(".glass-float", {
        y: -38,
        ease: "none",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "bottom 38%",
          scrub: 0.7,
        },
      });
    }
    for (const stage of document.querySelectorAll(".app-stage")) {
      gsap.from(stage.querySelectorAll(".app-window"), {
        opacity: 0.64,
        y: 32,
        duration: 0.9,
        stagger: { each: 0.1, from: "center" },
        ease: "power3.out",
        clearProps: "opacity,transform",
        scrollTrigger: { trigger: stage, start: "top 87%", once: true },
      });
    }
    const motions = {
      lift: { y: 56, scale: 0.95 },
      wipe: { clipPath: "inset(0% 0% 38% 0% round 24px)", y: 17 },
      pan: { xPercent: 7, clipPath: "inset(0% 25% 0% 0% round 24px)" },
      stack: { y: 36, rotate: -2, scale: 0.97 },
      band: { clipPath: "inset(13% 0% 0% 0% round 12px)" },
    };
    for (const section of document.querySelectorAll(
      "[data-glass]:not([data-glass=hero])",
    )) {
      const effect = motions[section.dataset.glass];
      if (!effect) continue;
      const visual = section.querySelector(".glass-demo") || section;
      gsap.fromTo(visual, effect, {
        y: 0,
        xPercent: 0,
        scale: 1,
        rotate: 0,
        clipPath: "inset(0% -3% -7% -3% round 0px)",
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top 94%",
          end: "top 42%",
          scrub: 0.65,
        },
      });
    }
  });
}
