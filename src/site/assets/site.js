document.documentElement.classList.add("enhanced");
const menu = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#site-navigation");
function closeMenu() {
  menu?.setAttribute("aria-expanded", "false");
  menu?.setAttribute("aria-label", "Open navigation");
  navigation?.classList.remove("is-open");
}
menu?.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
  navigation.classList.toggle("is-open", open);
});
navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menu?.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menu.focus();
  }
});
for (const link of navigation?.querySelectorAll("a") || []) {
  if (
    new URL(link.href).pathname.replace(/\.html$/, "") ===
    location.pathname.replace(/\.html$/, "")
  )
    link.setAttribute("aria-current", "page");
}
// The bundled guide opens hosted account management on the public website.
if (location.pathname.startsWith("/welcome/")) {
  document.querySelectorAll('a[href="account.html"]').forEach((link) => {
    link.href = "https://git-learn-black.vercel.app/account";
  });
}
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  const group = tab.closest('[role="tablist"]');
  for (const item of group.querySelectorAll('[role="tab"]')) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden =
      !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const group = [
      ...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'),
    ];
    const next =
      event.key === "Home"
        ? group[0]
        : event.key === "End"
          ? group.at(-1)
          : group[
              (group.indexOf(tab) +
                (event.key === "ArrowLeft" ? -1 : 1) +
                group.length) %
                group.length
            ];
    next.click();
    next.focus();
  });
}
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let journeyScroll = null;
const track = document.querySelector(".journey-track");
if (track) {
  const cards = [...track.querySelectorAll(".journey-card")];
  const prev = document.querySelector("[data-carousel-prev]");
  const next = document.querySelector("[data-carousel-next]");
  const count = document.querySelector(".carousel-count");
  const step = () => cards[1].offsetLeft - cards[0].offsetLeft;
  const active = () =>
    Math.min(
      cards.length - 1,
      Math.max(0, Math.round(track.scrollLeft / step())),
    );
  const update = () => {
    prev.disabled = track.scrollLeft < 2;
    next.disabled =
      track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    count.textContent = `${String(active() + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
  };
  const moveTo = (left) => {
    if (journeyScroll) {
      const maximum = track.scrollWidth - track.clientWidth;
      window.scrollTo({
        top:
          journeyScroll.start +
          Math.min(1, Math.max(0, left / maximum)) *
            (journeyScroll.end - journeyScroll.start),
        behavior: "smooth",
      });
    } else {
      track.scrollTo({
        left,
        behavior: reduceMotion.matches ? "instant" : "smooth",
      });
    }
  };
  const move = (direction) => moveTo((active() + direction) * step());
  prev.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  track.addEventListener("keydown", (event) => {
    if (event.target !== track) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveTo(event.key === "Home" ? 0 : track.scrollWidth);
    }
  });
  let timer;
  track.addEventListener(
    "scroll",
    () => {
      clearTimeout(timer);
      timer = setTimeout(update, 100);
    },
    { passive: true },
  );
  new ResizeObserver(update).observe(track);
  update();
}
// Progressive enhancement: native scrolling, readable content without GSAP,
// and reversible animation when motion preferences change while browsing.
if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add(
    "(min-width: 1000px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)",
    () => {
      const section = document.querySelector(".journey-section");
      if (!section || !track) return;
      section.classList.add("journey-scroll-pinned");
      track.setAttribute(
        "aria-label",
        "Learning journey. Scroll down through three steps, or use the arrow keys.",
      );
      const tween = gsap.to(track, {
        scrollLeft: () => track.scrollWidth - track.clientWidth,
        ease: "none",
        scrollTrigger: {
          id: "learning-journey",
          trigger: section,
          start: "top 80px",
          end: () =>
            "+=" +
            Math.max(innerHeight * 1.6, track.scrollWidth - track.clientWidth),
          pin: true,
          scrub: 0.65,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
      journeyScroll = tween.scrollTrigger;
      return () => {
        journeyScroll = null;
        section.classList.remove("journey-scroll-pinned");
        track.setAttribute(
          "aria-label",
          "Learning journey. Scroll horizontally for three steps.",
        );
      };
    },
  );
  media.add("(prefers-reduced-motion: no-preference)", () => {
    document.body.classList.add("motion-ready");
    if (document.querySelector(".hero") && scrollY < 80 && !document.hidden) {
      gsap.from(".hero-word", {
        yPercent: 105,
        duration: 1.2,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "transform",
      });
      gsap.from(".hero-enter", {
        y: 15,
        opacity: 0,
        duration: 0.9,
        stagger: 0.07,
        delay: 0.2,
        ease: "power2.out",
        clearProps: "all",
      });
    }
    for (const el of document.querySelectorAll("[data-reveal]")) {
      gsap.from(el, {
        y: 24,
        duration: 0.95,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 94%",
          toggleActions: "play none none reverse",
        },
      });
    }
    for (const el of document.querySelectorAll(".agent-sphere")) {
      gsap.fromTo(
        el,
        { y: 28, rotate: -8 },
        {
          y: -22,
          rotate: 10,
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        },
      );
    }
    for (const canvas of document.querySelectorAll(".architecture-canvas")) {
      gsap.from(
        canvas.querySelectorAll(
          ".architecture-root,.architecture-branches>div,.architecture-decision",
        ),
        {
          y: 20,
          opacity: 0.25,
          stagger: 0.14,
          duration: 0.95,
          ease: "power3.out",
          scrollTrigger: {
            trigger: canvas,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        },
      );
    }
    for (const element of document.querySelectorAll(
      ".practice-invite,.milestone.active,.contribution-steps",
    )) {
      gsap.fromTo(
        element,
        { y: 18 },
        {
          y: -8,
          ease: "none",
          scrollTrigger: {
            trigger: ".journey-section",
            start: "top bottom",
            end: "bottom 40%",
            scrub: 1,
          },
        },
      );
    }
    return () => document.body.classList.remove("motion-ready");
  });
  media.add(
    "(min-width: 901px) and (prefers-reduced-motion: no-preference)",
    () => {
      const hero = document.querySelector(".hero");
      if (!hero) return;
      // Pin the opening only. The next surface naturally rises over it from
      // below, so wheels, anchors, touch, and browser history keep native behavior.
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: () => `+=${hero.offsetHeight}`,
        pin: true,
        pinSpacing: false,
        anticipatePin: 1,
      });
      gsap.from(".hero-orbit", {
        opacity: 0,
        duration: 1.5,
        delay: 0.15,
        ease: "power3.out",
        clearProps: "opacity",
      });
      gsap.fromTo(
        ".hero-art-stage",
        { y: 0, scale: 1, rotate: -2 },
        {
          y: -90,
          scale: 1.12,
          rotate: 2,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: 0,
            end: () => hero.offsetHeight - 120,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        },
      );
      gsap.fromTo(
        ".hero-copy",
        { y: 0, scale: 1, opacity: 1 },
        {
          y: -60,
          scale: 0.93,
          opacity: 0.12,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: 0,
            end: () => Math.max(400, hero.offsetHeight - 140),
            scrub: 0.7,
            invalidateOnRefresh: true,
          },
        },
      );
      gsap.to(".showcase-surface", {
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        ease: "none",
        scrollTrigger: {
          trigger: ".showcase-surface",
          start: "top 80%",
          end: "top top",
          scrub: 0.7,
        },
      });
      gsap.fromTo(
        ".home-page .workspace-frame",
        { rotateX: 8, y: 70, scale: 0.93 },
        {
          rotateX: 0,
          y: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: ".workspace-frame",
            start: "top 96%",
            end: "top 20%",
            scrub: 0.8,
          },
        },
      );
      const orbital = document.querySelector(".hero-orbit");
      const finePointer = matchMedia("(pointer: fine)");
      if (orbital && finePointer.matches) {
        const rotateX = gsap.quickTo(orbital, "rotationX", {
          duration: 1.3,
          ease: "power3.out",
        });
        const rotateY = gsap.quickTo(orbital, "rotationY", {
          duration: 1.3,
          ease: "power3.out",
        });
        const move = (event) => {
          const rect = hero.getBoundingClientRect();
          rotateX(((event.clientY - rect.top) / rect.height - 0.5) * -5);
          rotateY(((event.clientX - rect.left) / rect.width - 0.5) * 7);
        };
        const leave = () => {
          rotateX(0);
          rotateY(0);
        };
        hero.addEventListener("pointermove", move, { passive: true });
        hero.addEventListener("pointerleave", leave);
        return () => {
          hero.removeEventListener("pointermove", move);
          hero.removeEventListener("pointerleave", leave);
        };
      }
    },
  );
  window.addEventListener("load", () => ScrollTrigger.refresh(), {
    once: true,
  });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  document
    .querySelectorAll("details")
    .forEach((el) =>
      el.addEventListener("toggle", () => ScrollTrigger.refresh()),
    );
}
function pauseMotion() {
  document.body.classList.toggle("motion-paused", document.hidden);
}
document.addEventListener("visibilitychange", pauseMotion);
pauseMotion();
// Public download URLs remain useful without scripts; refresh only known assets.
const releaseUrl = new URL(
  "release.json",
  document.currentScript?.src || new URL("assets/site.js", location.href),
);
if (
  document.querySelector(
    "#learn-download, #educator-download, #windows-download, #extension-download, #editor-download",
  )
) {
  fetch(releaseUrl)
    .then((response) => {
      if (!response.ok) throw Error();
      return response.json();
    })
    .then((release) => {
      for (const id of ["learn", "educator", "windows", "extension", "editor"]) {
        const link = document.getElementById(`${id}-download`);
        const asset = release[id];
        if (!link || !asset?.url) continue;
        const url = new URL(asset.url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "github.com" ||
          !url.pathname.startsWith("/aayups31/OutClass/releases/download/")
        )
          continue;
        link.href = url.href;
        if (id === "windows")
          document.getElementById("windows-status").textContent =
            `Windows x64 · ${release.productName || "OutClass"} v${release.version} · ${asset.size || "Preview installer"} · Unsigned preview`;
      }
      if (release.chromeStoreUrl) {
        const url = new URL(release.chromeStoreUrl);
        const link = document.getElementById("extension-download");
        if (
          link &&
          url.protocol === "https:" &&
          url.hostname === "chromewebstore.google.com"
        ) {
          link.href = url.href;
          document.getElementById("extension-status").textContent =
            "Install from the Chrome Web Store, then pair in the app.";
        }
      }
    })
    .catch(() => {});
}
