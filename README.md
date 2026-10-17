# Staffside

Staffside is a small, local-first people-ops workspace for startup teams. It keeps staff profiles, onboarding tasks, payment-status records, and handbook documents on the machine running the app. An open-weight model served by [Ollama](https://ollama.com) drafts onboarding checklists and answers questions using retrieved handbook excerpts.

## Run locally

Requirements: Node.js 20 or later. The staff directory, tasks, documents, and payment tracker work without an AI model.

```powershell
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Workspace data is saved unencrypted in `data/staff-data.json`. The app binds to loopback only; it is a single-user local prototype, not a multi-user hosted service.

## Enable the local AI

Install Ollama, then download and start the default model:

```powershell
ollama pull qwen3:4b
```

Keep Ollama running, then start or refresh Staffside. The default model is `qwen3:4b`; set `OLLAMA_MODEL` to use another Ollama model. If Ollama runs at a non-default local URL, set `OLLAMA_URL` (for example, `http://localhost:11434`). Non-loopback model URLs are rejected so handbook excerpts cannot be sent to a remote service accidentally.

The AI features need both Ollama and relevant handbook documents. When you ask a question or draft a checklist, Staffside sends the local model the question or role plus matching excerpts from saved documents. Those excerpts are given to the AI for processing on this machine; don't upload documents you don't want the AI to process. Staff profiles and payment records are not included. Delete a document in the workspace to remove it from future AI searches. Answers include the documents used, and checklist suggestions require explicit review before being added. Keyword retrieval is intentionally simple for this MVP; it can miss relevant wording that does not share terms with a question.


## MVP scope

- Staff directory with name, work email, role, and optional start date.
- Per-person onboarding tasks with optional dates and completion status.
- Plain-text or Markdown handbook documents, stored locally.
- Local-model handbook Q&A with retrieved source documents, plus AI-drafted onboarding checklists.
- Payment-period records with amount, currency, due date, and pending/paid status.

The payment tracker is for status tracking only. It does not process payroll, calculate taxes, move money, or store bank details. The app is unauthenticated and intended only for local single-user use; do not expose it to a network. Records are not encrypted at rest, so use synthetic data until access controls and encryption are added, and do not enter real employee data on a shared or untrusted machine.

## Tests

```powershell
npm test
```

The integration tests use a local mock Ollama endpoint and temporary data files; they do not download a model or contact an external service.
