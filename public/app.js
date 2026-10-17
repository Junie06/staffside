const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let workspace = { staff: [], tasks: [], payments: [], documents: [] };
let activeView = "overview";
let noticeTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function prettyDate(date) {
  if (!date) return "No date set";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function notify(message, isError = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle("error", isError);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4200);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function refresh() {
  workspace = await request("/api/state");
  render();
}

function render() {
  $("#stat-people").textContent = workspace.staff.length;
  $("#stat-tasks").textContent = workspace.tasks.filter((task) => !task.done).length;
  $("#stat-payments").textContent = workspace.payments.filter((payment) => payment.status === "pending").length;
  $("#stat-documents").textContent = workspace.documents.length;
  $("#people-count").textContent = workspace.staff.length;
  $("#task-count").textContent = workspace.tasks.filter((task) => task.staffId === $("#onboarding-person").value && !task.done).length;
  $("#payment-count").textContent = workspace.payments.length;
  $("#welcome-banner").hidden = workspace.staff.length > 0 || workspace.documents.length > 0;
  renderOverview();
  renderPeople();
  renderStaffSelectors();
  renderTasks();
  renderDocuments();
  renderPayments();
}

function renderOverview() {
  const people = workspace.staff.slice(0, 5);
  $("#overview-people").innerHTML = people.length
    ? people.map((person) => `<div class="compact-person"><span class="person-avatar">${escapeHtml(initials(person.name))}</span><span class="person-info"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)}</small></span></div>`).join("")
    : `<div class="empty-state"><span>♡</span><p>Your team's story starts here.<br>Add your first teammate to get going.</p></div>`;
  const tasks = workspace.tasks.filter((task) => !task.done).slice(0, 5);
  $("#overview-tasks").innerHTML = tasks.length
    ? tasks.map((task) => {
      const person = workspace.staff.find((entry) => entry.id === task.staffId);
      return `<div class="compact-task"><input class="task-check" type="checkbox" data-task-toggle="${escapeHtml(task.id)}" aria-label="Complete ${escapeHtml(task.title)}"><span class="compact-task-title">${escapeHtml(task.title)}</span><span class="task-meta">${escapeHtml(person?.name || "Teammate")}${task.dueDate ? ` · ${escapeHtml(prettyDate(task.dueDate))}` : ""}</span></div>`;
    }).join("")
    : '<div class="empty-state"><span>✧</span><p>Nothing on the list just yet.<br>That sounds like a good start.</p></div>';
}

function renderPeople() {
  $("#people-list").innerHTML = workspace.staff.length
    ? workspace.staff.map((person) => `<div class="person-row">
        <span class="person-avatar">${escapeHtml(initials(person.name))}</span>
        <span class="person-info"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.email)} · ${escapeHtml(person.role)}${person.startDate ? ` · Starts ${escapeHtml(prettyDate(person.startDate))}` : ""}</small></span>
        <span class="row-actions"><button class="small-button" data-onboard="${escapeHtml(person.id)}">Onboarding</button><button class="icon-button" data-remove-person="${escapeHtml(person.id)}" aria-label="Remove ${escapeHtml(person.name)}">×</button></span>
      </div>`).join("")
    : '<div class="empty-state"><span>♡</span><p>No teammates yet. Add one using the form.</p></div>';
}

function renderStaffSelectors() {
  const onboarding = $("#onboarding-person");
  const payments = $("#payment-person");
  const priorOnboarding = onboarding.value;
  const priorPayment = payments.value;
  const choices = workspace.staff.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} · ${escapeHtml(person.role)}</option>`).join("");
  onboarding.innerHTML = choices || '<option value="">Add a teammate first</option>';
  payments.innerHTML = choices || '<option value="">Add a teammate first</option>';
  if (workspace.staff.some((person) => person.id === priorOnboarding)) onboarding.value = priorOnboarding;
  if (workspace.staff.some((person) => person.id === priorPayment)) payments.value = priorPayment;
  $("#task-form").querySelector("button[type=submit]").disabled = workspace.staff.length === 0;
  $("#payment-form").querySelector("button[type=submit]").disabled = workspace.staff.length === 0;
  $("#generate-checklist").disabled = workspace.staff.length === 0 || workspace.documents.length === 0;
}

function renderTasks() {
  const staffId = $("#onboarding-person").value;
  const tasks = workspace.tasks.filter((task) => task.staffId === staffId);
  $("#task-count").textContent = tasks.filter((task) => !task.done).length;
  $("#task-list").innerHTML = tasks.length
    ? tasks.map((task) => `<div class="task-row">
        <input class="task-check" type="checkbox" data-task-toggle="${escapeHtml(task.id)}" ${task.done ? "checked" : ""} aria-label="Mark ${escapeHtml(task.title)} ${task.done ? "not done" : "done"}">
        <span class="task-title ${task.done ? "done" : ""}">${escapeHtml(task.title)}</span>
        <span class="task-due">${task.dueDate ? escapeHtml(prettyDate(task.dueDate)) : ""}</span>
        <button class="icon-button" data-remove-task="${escapeHtml(task.id)}" aria-label="Remove task">×</button>
      </div>`).join("")
    : '<div class="empty-state"><span>✓</span><p>No onboarding tasks here yet.<br>Add one or draft a checklist with AI.</p></div>';
}

function renderDocuments() {
  $("#document-list").innerHTML = workspace.documents.length
    ? workspace.documents.map((document) => `<div class="document-row"><span class="doc-icon">▤</span><span class="person-info"><strong>${escapeHtml(document.title)}</strong><small>Added ${escapeHtml(new Date(document.updatedAt).toLocaleDateString())}</small></span><button class="icon-button" data-remove-document="${escapeHtml(document.id)}" aria-label="Remove ${escapeHtml(document.title)}">×</button></div>`).join("")
    : '<div class="empty-state"><p>No handbook docs yet. Add a guide to power grounded answers.</p></div>';
}

function renderPayments() {
  const payments = [...workspace.payments].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  $("#payment-list").innerHTML = payments.length
    ? payments.map((payment) => {
      const person = workspace.staff.find((entry) => entry.id === payment.staffId);
      const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency }).format(payment.amount);
      return `<div class="payment-row">
        <div class="person-info"><strong>${escapeHtml(person?.name || "Teammate")} · ${escapeHtml(payment.period)}</strong><div class="payment-meta">${payment.dueDate ? `Due ${escapeHtml(prettyDate(payment.dueDate))}` : "No due date"}</div></div>
        <span class="payment-amount">${escapeHtml(amount)}</span>
        <select class="status-select ${payment.status === "paid" ? "paid" : ""}" data-payment-status="${escapeHtml(payment.id)}" aria-label="Payment status">
          <option value="pending" ${payment.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="paid" ${payment.status === "paid" ? "selected" : ""}>Paid</option>
        </select>
        <button class="icon-button" data-remove-payment="${escapeHtml(payment.id)}" aria-label="Remove payment record">×</button>
      </div>`;
    }).join("")
    : '<div class="empty-state"><span>＄</span><p>No payment records yet.<br>Track status without storing bank details.</p></div>';
}

function navigate(view) {
  activeView = view;
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const label = { overview: "Overview", people: "People", onboarding: "Onboarding", documents: "Handbook AI", payments: "Payment tracker" }[view];
  $("#current-section").textContent = label;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function submitForm(form, endpoint, transform, successMessage) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await request(endpoint, { method: "POST", body: JSON.stringify(transform ? transform(data) : data) });
    form.reset();
    if (form.id === "payment-form") form.elements.currency.value = "USD";
    await refresh();
    notify(successMessage);
  } catch (error) {
    notify(error.message, true);
  }
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) navigate(nav.dataset.view);
  const go = event.target.closest("[data-go]");
  if (go) navigate(go.dataset.go);
  const onboard = event.target.closest("[data-onboard]");
  if (onboard) {
    navigate("onboarding");
    $("#onboarding-person").value = onboard.dataset.onboard;
    renderTasks();
  }
  const removePerson = event.target.closest("[data-remove-person]");
  if (removePerson) {
    const person = workspace.staff.find((entry) => entry.id === removePerson.dataset.removePerson);
    if (!person || !confirm(`Remove ${person.name}? Their onboarding tasks and payment records will also be deleted.`)) return;
    try {
      await request(`/api/staff/${encodeURIComponent(person.id)}`, { method: "DELETE" });
      await refresh();
      notify("Teammate and their related records removed.");
    } catch (error) { notify(error.message, true); }
  }
  const removeTask = event.target.closest("[data-remove-task]");
  if (removeTask) {
    try {
      await request(`/api/tasks/${encodeURIComponent(removeTask.dataset.removeTask)}`, { method: "DELETE" });
      await refresh();
      notify("Task removed.");
    } catch (error) { notify(error.message, true); }
  }
  const removePayment = event.target.closest("[data-remove-payment]");
  if (removePayment) {
    try {
      await request(`/api/payments/${encodeURIComponent(removePayment.dataset.removePayment)}`, { method: "DELETE" });
      await refresh();
      notify("Payment record removed.");
    } catch (error) { notify(error.message, true); }
  }
  const removeDocument = event.target.closest("[data-remove-document]");
  if (removeDocument) {
    const document = workspace.documents.find((entry) => entry.id === removeDocument.dataset.removeDocument);
    if (!document || !confirm(`Remove "${document.title}" from handbook search?`)) return;
    try {
      await request(`/api/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
      await refresh();
      notify("Handbook document removed.");
    } catch (error) { notify(error.message, true); }
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "onboarding-person") {
    renderTasks();
    return;
  }
  if (event.target.matches("[data-task-toggle]")) {
    try {
      await request(`/api/tasks/${encodeURIComponent(event.target.dataset.taskToggle)}`, { method: "PATCH", body: JSON.stringify({ done: event.target.checked }) });
      await refresh();
    } catch (error) { notify(error.message, true); }
  }
  if (event.target.matches("[data-payment-status]")) {
    try {
      await request(`/api/payments/${encodeURIComponent(event.target.dataset.paymentStatus)}`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) });
      await refresh();
      notify("Payment status updated.");
    } catch (error) { notify(error.message, true); }
  }
});

$("#staff-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, "/api/staff", null, "Teammate added to your team.");
});

$("#task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const staffId = $("#onboarding-person").value;
  submitForm(event.currentTarget, "/api/tasks", (data) => ({ ...data, staffId }), "Onboarding task added.");
});

$("#payment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, "/api/payments", null, "Payment record added.");
});

$("#document-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, "/api/documents", null, "Handbook document saved.");
});

$("#document-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 30_000) {
    notify("Choose a text or Markdown file smaller than 30 KB.", true);
    event.target.value = "";
    return;
  }
  try {
    const content = await file.text();
    if (content.includes("\u0000")) throw new Error("Only plain text or Markdown files are supported.");
    $("#document-form").elements.title.value = file.name.replace(/\.(md|txt)$/i, "").slice(0, 120);
    $("#document-form").elements.content.value = content;
    notify("File loaded. Review its contents, then save the document.");
  } catch (error) {
    notify(error.message, true);
    event.target.value = "";
  }
});

$("#question-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = $("#question").value.trim();
  const answerArea = $("#answer");
  answerArea.innerHTML = '<div class="answer-card">Looking through your handbook…</div>';
  try {
    const result = await request("/api/chat", { method: "POST", body: JSON.stringify({ question }) });
    answerArea.innerHTML = `<div class="answer-card">${escapeHtml(result.answer)}</div><div class="source-list">${result.sources.map((source) => `<span class="source-chip">${escapeHtml(source.title)}</span>`).join("")}</div>`;
  } catch (error) {
    answerArea.innerHTML = `<p class="assistant-error">${escapeHtml(error.message)}</p>`;
  }
});

$("#generate-checklist").addEventListener("click", async (event) => {
  const staffId = $("#onboarding-person").value;
  if (!staffId) return notify("Add a teammate before drafting a checklist.", true);
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Drafting checklist…";
  try {
    const result = await request("/api/checklist", { method: "POST", body: JSON.stringify({ staffId }) });
    const sources = result.sources.map((source) => source.title).join(", ");
    const approved = confirm(`AI-drafted checklist for ${workspace.staff.find((person) => person.id === staffId)?.name}:\n\n${result.tasks.map((task, index) => `${index + 1}. ${task}`).join("\n")}\n\nBased on: ${sources}\n\nAdd these suggested tasks?`);
    if (!approved) return;
    await request("/api/tasks/batch", { method: "POST", body: JSON.stringify({ staffId, tasks: result.tasks }) });
    await refresh();
    notify(`${result.tasks.length} checklist tasks added. Please review them.`);
  } catch (error) {
    notify(error.message, true);
  } finally {
    button.textContent = "✧ Draft checklist with AI";
    button.disabled = workspace.staff.length === 0 || workspace.documents.length === 0;
  }
});

$("#load-demo").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const person = await request("/api/staff", {
      method: "POST",
      body: JSON.stringify({ name: "Jordan Lee", email: "jordan@example.test", role: "Product designer", startDate: new Date().toISOString().slice(0, 10) }),
    });
    await request("/api/documents", {
      method: "POST",
      body: JSON.stringify({
        title: "New teammate first-week guide",
        content: "Welcome to the team! On your first day, meet your manager for a welcome chat and get access to the design workspace. In your first week, read the product principles, meet your product and engineering partners, and set up a short introduction with your onboarding buddy. Your manager will help you choose a first project. For time off, share dates with your manager and add approved leave to the team calendar. For help with tools, ask your onboarding buddy or post in the team help channel.",
      }),
    });
    await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ staffId: person.id, title: "Meet your onboarding buddy" }),
    });
    await request("/api/payments", {
      method: "POST",
      body: JSON.stringify({ staffId: person.id, period: "October 2026", amount: 2500, currency: "USD" }),
    });
    await refresh();
    notify("Sample workspace ready. All sample details are fictional.");
  } catch (error) {
    notify(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
refresh().catch((error) => notify(`Could not load workspace: ${error.message}`, true));
