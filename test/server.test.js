const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDirPromise = fs.mkdtemp(path.join(os.tmpdir(), "staffside-test-"));
let app;
let baseUrl;
let ollama;
let ollamaUrl;
let capturedModelRequest;

before(async () => {
  const tempDir = await tempDirPromise;
  process.env.STAFFSIDE_DATA_FILE = path.join(tempDir, "staff-data.json");
  ollama = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    capturedModelRequest = JSON.parse(body);
    const system = capturedModelRequest.messages.find((message) => message.role === "system").content;
    const content = system.includes("checklist")
      ? JSON.stringify({ tasks: [{ title: "Read the team guide" }, { title: "Meet your onboarding buddy" }, { title: "Review product principles" }] })
      : JSON.stringify({ answer: "Your first-day welcome includes a manager chat. [New teammate guide]" });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: { content } }));
  });
  await new Promise((resolve) => ollama.listen(0, "127.0.0.1", resolve));
  ollamaUrl = `http://127.0.0.1:${ollama.address().port}`;
  process.env.OLLAMA_URL = ollamaUrl;
  app = require("../server");
  await app.start(0);
  baseUrl = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => app.server.close(resolve));
  await new Promise((resolve) => ollama.close(resolve));
  const tempDir = await tempDirPromise;
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function api(route, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test("serves the app and starts with an empty local workspace", async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Staffside/);
  assert.deepEqual((await api("/api/state")).body, { staff: [], tasks: [], payments: [], documents: [] });
});

test("validates and persists staff, tasks, payment status, and handbook documents", async () => {
  assert.equal((await api("/api/staff", { method: "POST", body: { name: "Bad Date", email: "bad@example.test", role: "Designer", startDate: "2026-02-31" } })).status, 400);
  const created = await api("/api/staff", { method: "POST", body: { name: "Rae Example", email: "rae@example.test", role: "Designer", startDate: "2026-10-17" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.email, "rae@example.test");
  const duplicate = await api("/api/staff", { method: "POST", body: { name: "Rae Again", email: "RAE@example.test", role: "Designer" } });
  assert.equal(duplicate.status, 409);
  const task = await api("/api/tasks", { method: "POST", body: { staffId: created.body.id, title: "Read the team guide" } });
  assert.equal(task.status, 201);
  const payment = await api("/api/payments", { method: "POST", body: { staffId: created.body.id, period: "October 2026", amount: 1250.5, currency: "USD" } });
  assert.equal(payment.status, 201);
  assert.equal((await api(`/api/payments/${payment.body.id}`, { method: "PATCH", body: { status: "paid" } })).body.status, "paid");
  const document = await api("/api/documents", { method: "POST", body: { title: "New teammate guide", content: "On the first day, meet your manager for a welcome chat. In your first week, read the product principles." } });
  assert.equal(document.status, 201);
  assert.equal("content" in document.body, false);

  const state = (await api("/api/state")).body;
  assert.equal(state.tasks[0].staffId, created.body.id);
  assert.equal(state.payments[0].status, "paid");
  assert.equal(state.documents[0].content.includes("welcome chat"), true);
  const savedFile = JSON.parse(await fs.readFile(process.env.STAFFSIDE_DATA_FILE, "utf8"));
  assert.equal(savedFile.staff[0].email, "rae@example.test");
});

test("grounds AI answers and checklist drafts in handbook text only", async () => {
  const state = (await api("/api/state")).body;
  const staff = state.staff[0];
  const answer = await api("/api/chat", { method: "POST", body: { question: "What happens on the first day?" } });
  assert.equal(answer.status, 200);
  assert.match(answer.body.answer, /manager chat/);
  assert.deepEqual(answer.body.sources.map((source) => source.title), ["New teammate guide"]);
  const userMessage = capturedModelRequest.messages.find((message) => message.role === "user").content;
  assert.match(userMessage, /New teammate guide/);
  assert.doesNotMatch(userMessage, /rae@example\.test|1250\.5/);
  assert.equal(capturedModelRequest.think, false);
  assert.equal(capturedModelRequest.options.num_ctx, 8192);

  const checklist = await api("/api/checklist", { method: "POST", body: { staffId: staff.id } });
  assert.equal(checklist.status, 200);
  assert.equal(checklist.body.tasks.length, 3);
  assert.deepEqual(checklist.body.sources.map((source) => source.title), ["New teammate guide"]);
  const added = await api("/api/tasks/batch", { method: "POST", body: { staffId: staff.id, tasks: checklist.body.tasks } });
  assert.equal(added.status, 201);
  assert.equal(added.body.length, 3);
});

test("deletes a staff member together with their related operational records", async () => {
  const state = (await api("/api/state")).body;
  const staffId = state.staff[0].id;
  assert.equal((await api(`/api/staff/${staffId}`, { method: "DELETE" })).status, 200);
  const afterDelete = (await api("/api/state")).body;
  assert.equal(afterDelete.staff.length, 0);
  assert.equal(afterDelete.tasks.length, 0);
  assert.equal(afterDelete.payments.length, 0);
});

test("deletes a handbook document from future AI retrieval", async () => {
  const state = (await api("/api/state")).body;
  const document = state.documents.find((entry) => entry.title === "New teammate guide");
  assert.ok(document);
  assert.equal((await api(`/api/documents/${document.id}`, { method: "DELETE" })).status, 200);
  const afterDelete = (await api("/api/state")).body;
  assert.equal(afterDelete.documents.some((entry) => entry.id === document.id), false);
  const answer = await api("/api/chat", { method: "POST", body: { question: "What happens on the first day?" } });
  assert.equal(answer.status, 422);
});

test("returns explicit errors when AI has no matching handbook context", async () => {
  const result = await api("/api/chat", { method: "POST", body: { question: "What is our travel reimbursement limit?" } });
  assert.equal(result.status, 422);
  assert.match(result.body.error, /No handbook passages matched/);
});
