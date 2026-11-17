import { autoplay, showText, typeText } from "./workspace-motion.js?v=clean-playback";

for (const demo of document.querySelectorAll("[data-educator-demo]")) {
  const name = demo.dataset.educatorDemo;
  const draft = demo.querySelector("[data-educator-draft]");
  const question = demo.querySelector("[data-educator-question]");
  const answer = demo.querySelector("[data-educator-answer]");
  const caption = demo.querySelector("[data-demo-caption]");
  const prompt = question.textContent.trim();
  const reply = answer.textContent.trim();
  const beats = [...demo.querySelectorAll("[data-beat]")];
  const checkpoints = [2900, 4650, 6450, 8750];
  const posts = [...demo.querySelectorAll("[data-educator-post]")].map(
    (post) => ({
      post,
      text: post.textContent.trim().replace(/\s+/g, " "),
    }),
  );
  const playhead = demo.querySelector("[data-educator-playhead]");

  autoplay(demo, name, 12600, (time) => {
    const typing = time >= 250 && time < 1750;
    showText(draft, typing ? typeText(prompt, time, 250, 1250) : `Ask ${name}`);
    question.toggleAttribute("data-visible", time >= 1750);
    answer.toggleAttribute("data-visible", time >= 2180);
    showText(answer, typeText(reply, time, 2180, 1850));
    demo.toggleAttribute("data-chat-active", time >= 250 && time < 4950);
    posts.forEach(({ post, text }, index) => {
      showText(post, typeText(text, time, checkpoints[index], 1350));
    });
    const samplePosted = posts.length > 0 && time >= checkpoints[3];
    if (posts.length) demo.toggleAttribute("data-sample-posted", samplePosted);
    if (playhead) {
      const progress = Math.max(0, Math.min(1, (time - 2900) / 5250));
      playhead.style.left = `${progress * 100}%`;
    }

    let label = "Workspace ready";
    if (typing) label = `Asking ${name}`;
    beats.forEach((beat) => {
      const step = Number(beat.dataset.beat);
      const active =
        time >= checkpoints[step - 1] && !(step === 3 && samplePosted);
      beat.toggleAttribute("data-visible", active);
      if (active && beat.dataset.caption) label = beat.dataset.caption;
    });
    showText(caption, label);
  });
}
