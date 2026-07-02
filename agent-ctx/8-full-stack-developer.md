# Task 8 — full-stack-developer — AI Center view

## Deliverable
- `/home/z/my-project/src/components/indos/views/ai-view.tsx` exporting `AiView` (named export, `'use client'`).

## What was built
A local-first industrial AI copilot UI for IndOS with:

### Chat panel (left/main, full-height card)
- Header: Bot avatar (gradient + green `LiveDot`), "IndOS Assistant" title, `llama3.1:8b · self-hosted` mono badge, "Ollama online" status, ghost Clear button.
- Scrollable messages: user bubbles right-aligned `bg-primary/15`+ring, assistant bubbles left-bordered `bg-card` with Bot avatar. Timestamps under each.
- Markdown rendering via `react-markdown` with custom components (h1–h4, ul/ol, strong/em, inline code mono+primary, fenced code blocks in bordered `<pre>`, blockquote, hr→Separator, links, tables).
- Typing indicator: three staggered bouncing dots + "thinking…".
- Welcome message seeded on mount.
- Suggested prompt chips (5 from spec) shown on first load, hidden after first send/clear.
- Input: Textarea (rows=2) inside focus-ring wrapper + Send button (`Send` icon, swaps to spinning `RefreshCw` while loading). Enter to send, Shift+Enter newline. Disabled when empty/loading. Keyboard hint shown sm+.
- On send: append user msg → POST `messages` to `/api/indos/ai` → append assistant reply on success, or "⚠️ Local AI engine unreachable. Verify Ollama service." on error. Auto-scroll via `useRef + scrollIntoView`.
- State: `useState<ChatMessage[]>` (id/role/content/ts).

### Capabilities panel (right column, stacked)
1. **AI Capabilities** — 6 rows (Predictive Maintenance, Energy Forecast, Production Forecast, Root Cause Analysis, Natural Language Query, Anomaly Detection), color-coded icons.
2. **Local AI Stack** — Ollama / Qdrant / Frigate+YOLO with green `LiveDot` "running" + emerald banner "No OpenAI · No cloud · 100% local".
3. **Models** — llama3.1:8b (loaded), mistral:7b, phi3:mini, nomic-embed-text (loaded) with size + kind + cosmetic Load buttons.
4. **Recent Insights** — 4 clickable cards (INV-03 soiling, reflow oven vibration, peak demand forecast, GW-KKC-04 disconnect). Click fills the chat input with a related question and hides suggestions.

## Stack / conventions
- Only `@/` imports; `import ReactMarkdown from 'react-markdown'`.
- shadcn/ui: Card, Badge, Button, ScrollArea, Textarea, Separator.
- Shared: `ViewHeader`, `LiveDot`. Store: `useIndOS` (`setView` for cross-module nav).
- Icons: `lucide-react`.
- IndOS dark-theme tokens, `indos-scroll` scrollbar, responsive `lg:grid-cols-[1fr_360px]` → stacked on mobile.

## Validation
- `bun run lint` → 0 errors in `ai-view.tsx` (verified with `eslint` on the file directly).
- `bunx tsc --noEmit` (project-wide) → no errors attributable to ai-view.tsx.
- The 4 remaining project lint errors are in other agents' files (machines/route.ts, maintenance-view.tsx, projects-view.tsx, realtime.ts) — outside this task's scope.
- Did NOT modify page.tsx, layout.tsx, globals.css, schema.prisma, or any API route.
- Dev server currently 500s only because `settings-view.tsx` (another agent's task) is missing from the lazy import map in page.tsx. The `ai-view.tsx` module itself compiles and type-checks cleanly and will be navigable once that file lands.

## Notes for downstream agents
- The shell already lazy-imports `AiView` from `@/components/indos/views/ai-view` — no shell changes needed.
- The `/api/indos/ai` route already returns `{ reply: string }` Markdown and gracefully returns a fallback message on internal error (200 status), which the UI displays verbatim.
