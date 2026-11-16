const scenes = [...document.querySelectorAll(".launch-scene")];
const chapters = [...document.querySelectorAll("[data-chapter]")];

if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const previews = gsap.utils.toArray(
      ".launch-download-card, .launch-detail-image",
    );
    for (const preview of previews) {
      gsap.fromTo(
        preview,
        { y: 26, opacity: 0.74 },
        {
          y: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: preview,
            start: "top 92%",
            end: "top 60%",
            scrub: 0.55,
          },
        },
      );
    }
    if (!scenes.length) return;
    if (scrollY < 60) {
      gsap.from(".launch-copy > *", {
        opacity: 0,
        y: 19,
        stagger: 0.075,
        duration: 0.8,
        ease: "power3.out",
      });
    }
    const device = document.querySelector(".launch-window");
    gsap.fromTo(
      device,
      { rotateX: 8, scale: 0.95, y: 12 },
      {
        rotateX: 0,
        scale: 1,
        y: 0,
        ease: "none",
        scrollTrigger: {
          trigger: ".launch-hero",
          start: "top top",
          end: "bottom 56%",
          scrub: 0.75,
        },
      },
    );

    const setChapter = (id) => {
      for (const link of chapters) {
        if (link.dataset.chapter === id)
          link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    };
    for (const scene of scenes) {
      const frame = scene.querySelector(".launch-frame");
      gsap.fromTo(
        frame,
        { y: 48, scale: 0.93, clipPath: "inset(11% 7% 11% 7% round 14px)" },
        {
          y: 0,
          scale: 1,
          clipPath: "inset(0% -8% -12% -8% round 0px)",
          ease: "none",
          scrollTrigger: {
            trigger: frame,
            start: "top 95%",
            end: "top 48%",
            scrub: 0.65,
          },
        },
      );
      ScrollTrigger.create({
        trigger: scene,
        start: "top 56%",
        end: "bottom 56%",
        onEnter: () => setChapter(scene.id),
        onEnterBack: () => setChapter(scene.id),
      });
    }
    return () =>
      chapters.forEach((link) => link.removeAttribute("aria-current"));
  });
}
