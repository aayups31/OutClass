const byId = (id) => document.getElementById(id);
let pendingEmail = "",
  authMode = "signup",
  busy = false,
  accountConfig,
  currentUsage,
  profileEmail,
  cooldown = 0,
  cooldownTimer;
const message = (text = "", error = false) => {
  byId("account-message").textContent = text;
  byId("account-message").classList.toggle("is-error", error);
};
async function request(route, body) {
  const response = await fetch(`/v1/browser/${route}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error(
      "The account service is unavailable. Please try again shortly.",
    );
  }
  if (!response.ok)
    throw Error(
      typeof result.error === "string"
        ? result.error
        : "This request could not be completed.",
    );
  return result;
}
function setBusy(value) {
  busy = value;
  document
    .querySelector(".account-panel")
    .setAttribute("aria-busy", String(value));
  for (const element of document.querySelectorAll(
    ".account-panel button,.account-panel input,.account-panel textarea",
  ))
    element.disabled = value;
  byId("resend-code").disabled = value || cooldown > 0;
  byId("open-billing").disabled = value || !accountConfig?.plan;
}
async function act(task) {
  if (busy) return;
  setBusy(true);
  message();
  try {
    await task();
  } catch (error) {
    message(
      error instanceof Error ? error.message : "Please try again shortly.",
      true,
    );
  } finally {
    setBusy(false);
  }
}
function startCooldown() {
  clearInterval(cooldownTimer);
  cooldown = 60;
  const update = () => {
    byId("resend-code").disabled = busy || cooldown > 0;
    byId("resend-code").textContent =
      cooldown > 0 ? `Send another code in ${cooldown}s` : "Send another code";
  };
  update();
  cooldownTimer = setInterval(() => {
    cooldown = Math.max(0, cooldown - 1);
    update();
    if (!cooldown) clearInterval(cooldownTimer);
  }, 1000);
}
function showCode() {
  byId("email-step").hidden = true;
  byId("code-step").hidden = false;
  byId("pending-email").textContent = pendingEmail;
  byId("account-code").value = "";
}
function showEmail() {
  byId("auth-flow").hidden = false;
  byId("account-dashboard").hidden = true;
  byId("email-step").hidden = false;
  byId("code-step").hidden = true;
  byId("account-code").value = "";
  pendingEmail = "";
}
function renderBilling() {
  const paid = currentUsage?.plan === "paid";
  byId("billing-title").textContent = paid
    ? "Your subscription."
    : "More room to explore.";
  const plan = accountConfig?.plan;
  if (!plan) {
    byId("billing-mode").textContent = "Not available yet";
    byId("billing-description").textContent =
      "Subscription details are temporarily unavailable. Your current allowance is still shown above.";
    byId("billing-detail").textContent =
      "You can also manage your connection from the desktop app.";
    return;
  }
  const price = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(plan.amount / 100);
  byId("billing-mode").textContent =
    plan.mode === "test" ? "Stripe test mode" : "Monthly subscription";
  byId("billing-description").textContent =
    `${price} ${plan.currency.toUpperCase()} / month · ${accountConfig.paidLimit} bounded AI answers per calendar month.`;
  byId("open-billing").textContent = paid
    ? "Manage subscription"
    : plan.mode === "test"
      ? "Preview test checkout"
      : "Upgrade with Stripe";
  byId("billing-detail").textContent =
    plan.mode === "test"
      ? "No real payment is collected. This checkout is for integration testing."
      : "Stripe handles payment details. Review the total and subscription terms before confirming.";
}
function renderAccount(result) {
  byId("auth-loading").hidden = true;
  if (!result.authenticated) {
    profileEmail = undefined;
    showEmail();
    return;
  }
  byId("auth-flow").hidden = true;
  byId("account-dashboard").hidden = false;
  byId("signed-in-email").textContent = result.email;
  currentUsage = result.usage;
  if (currentUsage) {
    const limit = Math.max(1, Number(currentUsage.limit) || 1);
    const remaining = Math.min(
      limit,
      Math.max(0, Number(currentUsage.remaining) || 0),
    );
    byId("plan-name").textContent =
      currentUsage.plan === "paid" ? "OutClass Plus" : "Free preview";
    byId("answers-left").textContent = String(remaining);
    byId("allowance-progress").max = limit;
    byId("allowance-progress").value = remaining;
    byId("allowance-detail").textContent =
      `${currentUsage.used} of ${limit} used · ${currentUsage.period} · resets each calendar month (UTC).`;
  }
  renderBilling();
  if (profileEmail !== result.email) {
    profileEmail = result.email;
    void loadProfile(result.email);
  }
}
byId("email-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void act(async () => {
    const email = byId("account-email").value.trim();
    const password = byId("account-password").value;
    try {
      if (authMode === "code") await request("email", { email });
      else if (authMode === "signup")
        await request("register", { email, password });
      else {
        await request("password", { email, password });
        renderAccount(await request("session"));
        message("Welcome back.");
        return;
      }
    } finally {
      byId("account-password").value = "";
    }
    pendingEmail = email;
    showCode();
    startCooldown();
    message("Your sign-in code has been requested. Check your inbox.");
  }).then(() => {
    if (pendingEmail) byId("account-code").focus();
  });
});
function chooseAuth(mode) {
  authMode = mode;
  showEmail();
  const password = byId("account-password");
  password.hidden = mode === "code";
  password.required = mode !== "code";
  password.previousElementSibling.hidden = mode === "code";
  byId("password-help").hidden = mode === "code";
  password.autocomplete =
    mode === "signup" ? "new-password" : "current-password";
  password.value = "";
  byId("auth-title").textContent =
    mode === "signup" ? "Create your account." : "Welcome back.";
  byId("auth-description").textContent =
    mode === "code"
      ? "We’ll email you a one-time sign-in code."
      : mode === "signup"
        ? "Create your credentials, verify your email, then make OutClass yours."
        : "Sign in with your email and password.";
  byId("credentials-submit").textContent =
    mode === "signup"
      ? "Create account"
      : mode === "code"
        ? "Send sign-in code"
        : "Sign in";
  byId("choose-signup").hidden = mode === "signup";
  byId("choose-signin").hidden = mode === "signin";
}
byId("choose-signup").addEventListener("click", () => chooseAuth("signup"));
byId("choose-signin").addEventListener("click", () => chooseAuth("signin"));
byId("choose-code").addEventListener("click", () => chooseAuth("code"));
const interests = [
    "Programming",
    "AI & machine learning",
    "Data & analytics",
    "Design",
    "Business",
    "Product management",
    "Science",
    "Creative technology",
  ],
  industries = [
    "Technology",
    "Education",
    "Healthcare",
    "Finance",
    "Climate & energy",
    "Media & entertainment",
    "Manufacturing",
    "Entrepreneurship",
  ];
for (const [id, values] of [
  ["interest-choices", interests],
  ["industry-choices", industries],
])
  for (const value of values) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    label.append(input, document.createTextNode(value));
    byId(id).append(label);
  }
async function loadProfile(email) {
  try {
    const { profile } = await request("profile");
    if (profileEmail !== email) return;
    byId("profile-name").value = profile?.name || "";
    byId("profile-goals").value = (profile?.learningGoals || []).join("\n");
    for (const [id, key] of [
      ["interest-choices", "interests"],
      ["industry-choices", "industries"],
    ])
      for (const input of byId(id).querySelectorAll("input"))
        input.checked = profile?.[key]?.includes(input.value) || false;
    byId("profile-step").hidden = !!profile?.name;
  } catch {
    if (profileEmail === email) profileEmail = undefined;
    /* Existing account/allowance remains available during a profile-service failure. */
  }
}
byId("edit-profile").addEventListener("click", () => {
  byId("profile-step").hidden = false;
  byId("profile-name").focus();
});
byId("profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void act(async () => {
    await request("profile", {
      name: byId("profile-name").value.trim(),
      interests: [
        ...byId("interest-choices").querySelectorAll("input:checked"),
      ].map((x) => x.value),
      industries: [
        ...byId("industry-choices").querySelectorAll("input:checked"),
      ].map((x) => x.value),
      learningGoals: byId("profile-goals")
        .value.split(/\n/)
        .map((x) => x.trim())
        .filter(Boolean),
    });
    byId("profile-step").hidden = true;
    message("Your learning profile is saved. You can update it anytime.");
  });
});
byId("code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void act(async () => {
    const code = byId("account-code").value;
    if (!/^\d{6,8}$/.test(code))
      throw Error("Enter the 6–8 digit code from your latest email.");
    const account = await request("verify", { email: pendingEmail, code });
    byId("account-code").value = "";
    renderAccount(account);
    renderAccount(await request("session"));
    message("You’re signed in. Your next step is in the desktop app.");
  });
});
byId("account-code").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 8);
});
byId("change-email").addEventListener("click", () => {
  showEmail();
  message();
  byId("account-email").focus();
});
byId("resend-code").addEventListener("click", () => {
  void act(async () => {
    await request("email", { email: pendingEmail });
    startCooldown();
    message("A new code has been requested. Use the latest email.");
  });
});
byId("refresh-allowance").addEventListener("click", () => {
  void act(async () => {
    renderAccount(await request("session"));
    message("Your allowance is up to date.");
  });
});
byId("sign-out").addEventListener("click", () => {
  void act(async () => {
    const result = await request("sign-out", {});
    showEmail();
    currentUsage = undefined;
    profileEmail = undefined;
    message(
      result.revoked
        ? "You’re signed out."
        : "Signed out of this browser. The provider session could not be revoked during a connection error.",
    );
  });
});
byId("open-billing").addEventListener("click", () => {
  void act(async () => {
    const { url } = await request("checkout", {});
    const target = new URL(url);
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      !["checkout.stripe.com", "billing.stripe.com"].includes(target.hostname)
    )
      throw Error("The billing link could not be verified.");
    location.assign(target.href);
  });
});
async function load() {
  const config = request("config")
    .then((result) => {
      accountConfig = result;
      renderBilling();
    })
    .catch(() => {});
  try {
    renderAccount(await request("session"));
  } catch {
    byId("auth-loading").hidden = true;
    showEmail();
    message(
      "The account service could not be reached. Try again shortly, or connect through the desktop app.",
      true,
    );
  }
  setBusy(false);
  await config;
  setBusy(false);
}
void load();
