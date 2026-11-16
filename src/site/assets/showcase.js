// Illustrative walkthroughs. These never call account or publishing APIs.
const showcaseLogo = '<img src="assets/orbital-logo.webp" alt="" width="40" height="28">';
const walkthroughs = {
  learn: ["OffCourse", "Reviewing the lesson and your attempt", "Try an empty list. What should the result be?", "Run your changes and compare the result."],
  academy: ["Project Forge", "Reading the section objectives", "Drafting a capstone with milestones and acceptance checks.", "Starter files and teaching notes are ready to review."],
  "creator-studio": ["Creative Director", "Selecting the demonstration", "Building the preview, captions, and a clear opening.", "Preview ready for GTM to adapt."],
  gtm: ["Growth Strategist", "Using the Creator Studio preview", "Adapting the caption for each audience.", "Review the post before publishing."],
};
function walkthrough(kind) {
  const [name, ...steps] = walkthroughs[kind];
  return '<div class="agent-walkthrough" data-walkthrough><div class="walkthrough-heading">' + showcaseLogo +
    '<strong>' + name + '</strong><span>Example workflow</span></div>' +
    steps.map((step, i) => '<p class="walkthrough-step" data-step="' + i + '"><span>✓</span>' + step + '</p>').join("") +
    '<button type="button" class="walkthrough-replay">Replay demo ↺</button></div>';
}
for (const demo of document.querySelectorAll(".demo-learn")) {
  const grid = demo.querySelector(".glass-grid");
  if (!grid) continue;
  demo.classList.add("workspace-preview");
  grid.insertAdjacentHTML("afterbegin", '<aside class="preview-explorer"><strong>Courses</strong><span>Python foundations</span><strong>Files</strong><span class="selected">activity.py</span><span>test_activity.py</span><span>README.md</span></aside>');
}
const postText = "Your next project starts inside the lesson. Build a working activity report, test real inputs, and take the idea further. Meet OutClass.";
function socialComposer(platform) {
  return '<div class="social-example social-' + platform + '"><div class="social-platform">' +
    (platform === "x" ? "𝕏" : '<b class="linkedin-mark">in</b> LinkedIn') +
    '<span>Example post</span></div><div class="social-author">' + showcaseLogo +
    '<div><strong>OutClass</strong><small>' + (platform === "x" ? "@OutClass · Everyone" : "Post to Anyone ▾") +
    '</small></div><span class="social-close">×</span></div><div class="social-copy" aria-label="' + postText + '"><span data-post-text></span><i class="typing-caret"></i></div>' +
    '<div class="social-media"><span>OUTCLASS</span><strong>From lesson.<br>To your first build.</strong><small>Course preview · Creator Studio</small></div>' +
    '<div class="social-replies">' + (platform === "x" ? "◎ Everyone can reply" : "Comments: Anyone") +
    '</div><div class="social-toolbar"><span aria-hidden="true">▧　☺　＋　◷</span><span class="demo-post">Post</span></div>' +
    '<div class="publish-feedback">✓ Published · demonstration</div></div>';
}
for (const demo of document.querySelectorAll(".demo-gtm")) {
  demo.classList.add("social-stage");
  demo.innerHTML = '<div class="handoff-label">' + showcaseLogo + '<span>Creator Studio <b>→</b> Growth Strategist</span></div>' +
    '<div class="social-composers">' + socialComposer("x") + socialComposer("linkedin") + '</div>' +
    '<p class="social-caption">An illustrative publishing walkthrough.</p><button type="button" class="walkthrough-replay">Replay demo ↺</button>';
}
for (const section of document.querySelectorAll(".glass-detail-hero")) {
  const kind = Object.keys(walkthroughs).find(key => section.classList.contains("glass-" + key));
  if (kind) section.insertAdjacentHTML("afterend", '<section class="agent-stage wrap">' + walkthrough(kind) + '</section>');
}
for (const panel of document.querySelectorAll(".glass-agent-panel")) {
  const tab = panel.getAttribute("aria-labelledby") || "";
  const kind = tab.includes("academy") ? "academy" : tab.includes("creator") ? "creator-studio" : tab.includes("gtm") ? "gtm" : "learn";
  panel.querySelector(".glass-conversation")?.insertAdjacentHTML("beforeend", walkthrough(kind));
}
const reducedShowcaseMotion = matchMedia("(prefers-reduced-motion: reduce)");
const showcaseAnimations = new Map();
function playShowcase(element) {
  showcaseAnimations.get(element)?.kill();
  if (element.classList.contains("social-stage")) {
    const textNodes = element.querySelectorAll("[data-post-text]");
    textNodes.forEach(node => { node.textContent = postText; });
    if (!window.gsap || reducedShowcaseMotion.matches) return;
    const state = { count: 0 };
    const timeline = gsap.timeline();
    timeline.set(element.querySelectorAll(".publish-feedback"), { opacity: 0 });
    timeline.set(element.querySelectorAll(".social-media"), { opacity: 0, y: 12 });
    timeline.to(state, { count: postText.length, duration: 3.2, ease: "none", onUpdate() {
      textNodes.forEach(node => { node.textContent = postText.slice(0, Math.floor(state.count)); });
    }});
    timeline.to(element.querySelectorAll(".social-media"), { opacity: 1, y: 0, duration: 0.6 });
    timeline.to(element.querySelectorAll(".demo-post"), { scale: 0.94, duration: 0.18, yoyo: true, repeat: 1 }, "+=0.6");
    timeline.to(element.querySelectorAll(".publish-feedback"), { opacity: 1, duration: 0.4 });
    showcaseAnimations.set(element, timeline);
  } else if (window.gsap && !reducedShowcaseMotion.matches) {
    const timeline = gsap.timeline().fromTo(element.querySelectorAll(".walkthrough-step"),
      { opacity: 0.25, y: 8 }, { opacity: 1, y: 0, stagger: 0.85, duration: 0.6 });
    showcaseAnimations.set(element, timeline);
  }
}
const showcaseObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      playShowcase(entry.target);
      showcaseObserver.unobserve(entry.target);
    }
  }
}, { threshold: 0.3 });
for (const element of document.querySelectorAll("[data-walkthrough], .social-stage")) {
  showcaseObserver.observe(element);
  element.querySelector(".walkthrough-replay")?.addEventListener("click", () => playShowcase(element));
}
reducedShowcaseMotion.addEventListener("change", () => {
  for (const animation of showcaseAnimations.values()) animation.progress(1).kill();
});
