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
  const element = byId("account-message");
  element.textContent = text;
  element.classList.toggle("is-error", error);
  const form =
    error &&
    [...document.querySelectorAll(".account-panel form")].find(
      (form) => form.getClientRects().length,
    );
  (form || document.querySelector(".account-panel")).append(element);
};
const fields = [
  ...document.querySelectorAll(
    ".account-panel input:not([type=checkbox]), .account-panel textarea",
  ),
];
function fieldError(field, text = "") {
  const hint = byId(`${field.id}-error`);
  hint.textContent = text;
  hint.hidden = !text;
  if (text) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
}
function validationMessage(field) {
  const label =
    document
      .querySelector(`label[for="${field.id}"]`)
      ?.textContent.trim()
      .toLowerCase() || "this field";
  if (field.validity.valueMissing) {
    if (["confirm-password", "recovery-confirm"].includes(field.id))
      return "Confirm your new password.";
    return `Enter ${label === "your name" ? "your name" : `your ${label}`}.`;
  }
  if (field.validity.typeMismatch) return "Use a valid email address.";
  if (
    field.validity.tooShort ||
    (field.type === "password" &&
      field.minLength > 0 &&
      field.value.length < field.minLength)
  )
    return `Use at least ${field.minLength} characters.`;
  if (field.validity.tooLong)
    return `Use no more than ${field.maxLength} characters.`;
  if (field.validity.patternMismatch)
    return "Enter the 6–8 digit code from your email.";
  const original =
    field.id === "confirm-password"
      ? "new-password"
      : field.id === "recovery-confirm"
        ? "recovery-password"
        : null;
  if (original && field.value !== byId(original).value)
    return "The new passwords don’t match.";
  return "";
}
for (const field of fields) {
  const hint = document.createElement("p");
  hint.id = `${field.id}-error`;
  hint.className = "account-field-error";
  hint.hidden = true;
  field.after(hint);
  field.setAttribute(
    "aria-describedby",
    [field.getAttribute("aria-describedby"), hint.id].filter(Boolean).join(" "),
  );
  field.addEventListener("input", () => {
    if (field.hasAttribute("aria-invalid"))
      fieldError(field, validationMessage(field));
    if (byId("account-message").classList.contains("is-error")) message();
  });
}
for (const form of document.querySelectorAll(".account-panel form")) {
  form.noValidate = true;
  form.addEventListener(
    "submit",
    (event) => {
      let first;
      for (const field of fields.filter(
        (field) =>
          field.form === form && !field.disabled && !field.closest("[hidden]"),
      )) {
        const error = validationMessage(field);
        fieldError(field, error);
        if (error && !first) first = field;
      }
      if (first) {
        event.preventDefault();
        event.stopImmediatePropagation();
        message();
        first.focus();
      }
    },
    true,
  );
}
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
  const recovery = authMode === "recovery";
  byId("recovery-passwords").hidden = !recovery;
  for (const id of ["recovery-password", "recovery-confirm"]) {
    byId(id).required = recovery;
    byId(id).value = "";
  }
  byId("verify-submit").textContent = recovery
    ? "Reset password"
    : "Verify email";
}
function showEmail() {
  for (const field of fields) fieldError(field);
  byId("password-form").reset();
  byId("recovery-password").value = "";
  byId("recovery-confirm").value = "";
  document.body.classList.remove("account-onboarding");
  byId("auth-flow").hidden = false;
  byId("account-dashboard").hidden = true;
  byId("email-step").hidden = false;
  byId("code-step").hidden = true;
  byId("account-code").value = "";
  pendingEmail = "";
}
function showProfile(visible) {
  byId("profile-step").hidden = !visible;
  byId("account-summary").hidden = visible;
  document.body.classList.toggle("account-onboarding", visible);
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
      if (authMode === "recovery") await request("recover", { email });
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
    message();
  }).then(() => {
    if (pendingEmail) byId("account-code").focus();
  });
});
function chooseAuth(mode) {
  authMode = mode;
  showEmail();
  message();
  const password = byId("account-password");
  password.hidden = mode === "recovery";
  password.required = mode !== "recovery";
  password.previousElementSibling.hidden = mode === "recovery";
  byId("password-help").hidden = mode !== "signup";
  password.autocomplete =
    mode === "signup" ? "new-password" : "current-password";
  password.value = "";
  byId("auth-title").textContent =
    mode === "signup"
      ? "Create your account."
      : mode === "recovery"
        ? "Reset your password."
        : "Welcome back.";
  byId("credentials-submit").textContent =
    mode === "signup"
      ? "Create account"
      : mode === "recovery"
        ? "Send recovery code"
        : "Sign in";
  byId("choose-signup").hidden = mode === "signup";
  byId("choose-signin").hidden = mode === "signin";
  byId("forgot-password").hidden = mode === "recovery";
}
byId("forgot-password").addEventListener("click", () => chooseAuth("recovery"));
byId("choose-signup").addEventListener("click", () => chooseAuth("signup"));
byId("choose-signin").addEventListener("click", () => chooseAuth("signin"));
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
    showProfile(!profile?.name);
  } catch {
    if (profileEmail === email) profileEmail = undefined;
    /* Existing account/allowance remains available during a profile-service failure. */
  }
}
byId("edit-profile").addEventListener("click", () => {
  showProfile(true);
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
    showProfile(false);
    message("Your learning profile is saved. You can update it anytime.");
  });
});
byId("code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void act(async () => {
    const code = byId("account-code").value;
    if (!/^\d{6,8}$/.test(code))
      throw Error("Enter the 6–8 digit code from your latest email.");
    if (authMode === "recovery") {
      const password = byId("recovery-password").value;
      if (password !== byId("recovery-confirm").value)
        throw Error("The new passwords don’t match.");
      try {
        await request("reset-password", {
          email: pendingEmail,
          code,
          password,
        });
        renderAccount(await request("session"));
        message("Password reset. Use your new password next time you sign in.");
      } finally {
        byId("recovery-password").value = "";
        byId("recovery-confirm").value = "";
        byId("account-code").value = "";
      }
      return;
    }
    const account = await request("verify", { email: pendingEmail, code });
    byId("account-code").value = "";
    showProfile(true);
    renderAccount(account);
    renderAccount(await request("session"));
    message();
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
    await request(authMode === "recovery" ? "recover" : "resend-verification", {
      email: pendingEmail,
    });
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
byId("password-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void act(async () => {
    const password = byId("new-password").value;
    if (password !== byId("confirm-password").value)
      throw Error("The new passwords don’t match.");
    try {
      await request("change-password", {
        currentPassword: byId("current-password").value,
        password,
      });
      byId("password-form").closest("details").open = false;
      message("Your password has been updated.");
    } finally {
      byId("password-form").reset();
    }
  });
});
void load();
