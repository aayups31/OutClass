const showcaseLogo =
  '<img src="assets/orbital-logo.webp" alt="" width="40" height="28">';
const postText =
  "Your next project starts inside the lesson. Build a working activity report, test real inputs, and take the idea further. Meet OutClass.";
function socialComposer(platform) {
  return (
    '<div class="social-example social-' +
    platform +
    '"><div class="social-platform">' +
    (platform === "x" ? "𝕏" : '<b class="linkedin-mark">in</b> LinkedIn') +
    '<span>Example post</span></div><div class="social-author">' +
    showcaseLogo +
    "<div><strong>OutClass</strong><small>" +
    (platform === "x" ? "@OutClass · Everyone" : "Post to Anyone ▾") +
    '</small></div><span class="social-close">×</span></div><div class="social-copy" aria-label="' +
    postText +
    '"><span data-post-text></span><i class="typing-caret"></i></div>' +
    '<div class="social-media"><span>PYTHON FOUNDATIONS</span><strong>Your first API.<br>Built by you.</strong><div class="post-code">GET /activities<br>200 OK · 12 records<br>✓ All checks passed</div><small>Build along with OutClass</small></div>' +
    '<div class="social-replies">' +
    (platform === "x" ? "◎ Everyone can reply" : "Comments: Anyone") +
    '</div><div class="social-toolbar"><span aria-hidden="true">▧　☺　＋　◷</span><span class="demo-post">Post</span></div>' +
    '<div class="publish-feedback">✓ Published · demonstration</div></div>'
  );
}
for (const demo of document.querySelectorAll("[data-social-exploration]")) {
  demo.classList.add("social-stage");
  demo.innerHTML =
    '<div class="social-composers">' +
    socialComposer("x") +
    socialComposer("linkedin") +
    "</div>";
}
const reducedShowcaseMotion = matchMedia("(prefers-reduced-motion: reduce)");
const showcaseAnimations = new Map();
function playShowcase(element) {
  showcaseAnimations.get(element)?.kill();
  if (element.classList.contains("social-stage")) {
    const textNodes = element.querySelectorAll("[data-post-text]");
    textNodes.forEach((node) => {
      node.textContent = postText;
    });
    if (!window.gsap || reducedShowcaseMotion.matches) return;
    const state = { count: 0 };
    const timeline = gsap.timeline();
    timeline.set(element.querySelectorAll(".publish-feedback"), { opacity: 0 });
    timeline.set(element.querySelectorAll(".social-media"), {
      opacity: 0,
      y: 12,
    });
    timeline.to(state, {
      count: postText.length,
      duration: 3.2,
      ease: "none",
      onUpdate() {
        textNodes.forEach((node) => {
          node.textContent = postText.slice(0, Math.floor(state.count));
        });
      },
    });
    timeline.to(element.querySelectorAll(".social-media"), {
      opacity: 1,
      y: 0,
      duration: 0.6,
    });
    timeline.to(
      element.querySelectorAll(".demo-post"),
      { scale: 0.94, duration: 0.18, yoyo: true, repeat: 1 },
      "+=0.6",
    );
    timeline.to(element.querySelectorAll(".publish-feedback"), {
      opacity: 1,
      duration: 0.4,
    });
    showcaseAnimations.set(element, timeline);
  } else if (window.gsap && !reducedShowcaseMotion.matches) {
    const timeline = gsap
      .timeline()
      .fromTo(
        element.querySelectorAll(".walkthrough-step"),
        { opacity: 0.25, y: 8 },
        { opacity: 1, y: 0, stagger: 0.85, duration: 0.6 },
      );
    showcaseAnimations.set(element, timeline);
  }
}
const showcaseObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        playShowcase(entry.target);
        showcaseObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.3 },
);
for (const element of document.querySelectorAll(
  "[data-walkthrough], .social-stage",
)) {
  showcaseObserver.observe(element);
}
reducedShowcaseMotion.addEventListener("change", () => {
  for (const animation of showcaseAnimations.values())
    animation.progress(1).kill();
});

if (window.gsap && !reducedShowcaseMotion.matches) {
  gsap.utils.toArray(".agent-reveal").forEach((line) => {
    gsap.from(line, {
      opacity: 0.15,
      y: 8,
      duration: 0.8,
      scrollTrigger: { trigger: line, start: "top 94%", once: true },
    });
  });
}
