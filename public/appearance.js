// Apply the saved appearance before the page paints. Kept external for the app's CSP.
(() => {
  let theme;
  try {
    theme = localStorage.getItem("gitlearn-theme");
  } catch {}
  if (theme !== "light" && theme !== "dark") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b0e17" : "#f6f7ff");
})();
