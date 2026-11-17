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
        { rotateX: 8, scale: 0.97, y: 34 },
        {
          rotateX: 0,
          scale: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "bottom 59%",
            scrub: 0.22,
          },
        },
      );
    }
    const wideShowcase = matchMedia("(min-width: 931px)");
    const panelOffset = (x, y) => () =>
      wideShowcase.matches ? `${x}px ${y}px` : `0px ${Math.round(y * 0.32)}px`;
    for (const stage of document.querySelectorAll(".app-stage")) {
      const center = stage.querySelector(".app-window-main");
      const left = stage.querySelector(".app-window-left");
      const right = stage.querySelector(".app-window-right");
      const spread = stage.closest(".app-chapter-educator") ? 34 : -30;
      // Translate the panels directly so their contents and static tilt can be composited together.
      gsap
        .timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: stage,
            start: "top 96%",
            end: "bottom 12%",
            scrub: 0.2,
            invalidateOnRefresh: true,
            toggleClass: "app-stage-moving",
          },
        })
        .fromTo(
          center,
          { translate: panelOffset(0, 29) },
          { translate: panelOffset(0, -14) },
          0,
        )
        .fromTo(
          left,
          { translate: panelOffset(-spread, 49) },
          { translate: panelOffset(-16, -32) },
          0,
        )
        .fromTo(
          right,
          { translate: panelOffset(spread, 60) },
          { translate: panelOffset(16, -38) },
          0,
        );
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
