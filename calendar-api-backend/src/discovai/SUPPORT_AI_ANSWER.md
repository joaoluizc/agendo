# supportAiAnswer — Integration Guide

**supportAiAnswer** is a hosted "AI Answer" service for support portals. Give it a user's
search query and it streams back a concise, **cited answer** generated from your help-center
articles, plus the **source articles** it used. Drop it in above (or beside) your normal
search results so visitors get a direct answer before they start clicking.

It's a small RAG service: it embeds the query, runs a semantic search over the knowledge
base, and streams an LLM answer that cites the matched articles inline (`[1]`, `[2]`, …).

> **Naming note:** the product/feature name is **supportAiAnswer**. The deployed HTTP path
> still reads `/discovai/...` (that was the original codebase name) — treat it as the
> supportAiAnswer endpoint. Each knowledge base is a **dataset** with its own path:
> `https://backend.agendo.dmsupport.org/discovai/<dataset>/chat`. You'll be given your
> portal's `<dataset>` key (e.g. `acme`); the bare `/discovai/chat` defaults to Duda's KB.

---

## At a glance

| | |
|---|---|
| **Endpoint** | `POST https://backend.agendo.dmsupport.org/discovai/<dataset>/chat` (your portal's dataset key; bare `/discovai/chat` = Duda default) |
| **Auth** | None (public) |
| **Request** | JSON: `{ "query": string }` |
| **Response** | A **stream** (`text/event-stream`) of `data: {json}\n\n` frames |
| **Read it with** | `fetch()` + a `ReadableStream` reader — **not** `EventSource` (see below) |
| **Connect via** | A **same-origin proxy** on your portal's own server. Direct browser calls are blocked by CORS and per-origin allowlisting is *not* used (white-labeled → too many portals). See the CORS section. |
| **Live console** | <https://backend.agendo.dmsupport.org/discovai> — a working demo UI you can poke at and view-source for a reference implementation |

---

## Try it right now

```bash
# `duda` is the default KB; swap in your portal's dataset key once it's provisioned.
curl -N -X POST https://backend.agendo.dmsupport.org/discovai/duda/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"how do I reset my password"}'
```

You'll see a sequence of `data: …` lines stream in: first the search results, then the
answer one token at a time, then a final summary frame.

---

## Datasets

Each knowledge base is a separate **dataset**, selected by the URL path:
`POST /discovai/<dataset>/chat`. Your portal is wired to one dataset (you'll be given the
key); a query only ever retrieves and answers from that dataset's articles, so a white-label
portal never surfaces another tenant's content. Results and answers are **cached per
dataset**, so the same question against two datasets returns each one's own answer. The bare
`/discovai/chat` (no key) targets the default Duda KB; an unknown key returns an `error` event.

---

## API reference

### Request

```http
POST /discovai/<dataset>/chat HTTP/1.1
Host: backend.agendo.dmsupport.org
Content-Type: application/json

{
  "query": "how do I reset my password",
  "refreshCache": false      // optional — bypass the server cache for a fresh result
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | ✅ | The user's search text. Any language (it's auto-translated for retrieval). |
| `refreshCache` | boolean | — | `true` skips the server-side cache. Default `false`. |
| `debug` | boolean | — | Server-side logging only; does not change the response. |

### Response: a streamed event protocol

The response is **streamed**, not a single JSON body. Each event is one SSE-style frame:

```
data: {"event":"<name>","data":{ ...payload }}\n\n
```

Two things to know before you write a client:

1. **Use `fetch` + stream reading, not `EventSource`.** The browser's `EventSource` only
   does `GET` and dispatches on the SSE `event:` field — which this API does **not** send
   (the event name lives *inside* the JSON, in `event`). So read `response.body` yourself,
   split on the blank line (`\n\n`), strip the leading `data: `, and `JSON.parse` the rest.
   The reference code below does exactly this.
2. **The event name is `payload.event`** (e.g. `"text-chunk"`). `payload.data.event_type`
   carries the same value if you prefer.

### Events

| `event` | When | `data` payload |
|--------|------|----------------|
| `begin-stream` | First | `{ query }` |
| `search-results` | After retrieval | `{ results: SearchResult[] }` — the **top 5** sources |
| `text-chunk` | Many, in order | `{ text }` — append these to build the answer |
| `more-results` | After the answer | `{ more_results: { title, url }[] }` — extra related articles |
| `final-response` | Near the end | `{ message }` — the **full** answer text (handy if you didn't accumulate chunks) |
| `stream-end` | Last | `{ thread_id }` (currently always `null`; ignore) |
| `error` | On failure (replaces the normal flow) | `{ detail }` — a short error string |

```ts
type SearchResult = {
  title: string;        // article title
  url: string;          // article URL (may include ?ref=…&utm_… tracking params — see Gotchas)
  content: string;      // a short snippet from the matched section
  description: string;  // same value as `content`
};
```

**Real frame examples** (from the live endpoint):

```
data: {"event":"begin-stream","data":{"event_type":"begin-stream","query":"how do I reset my password"}}

data: {"event":"search-results","data":{"event_type":"search-results","results":[{"title":"Manage Team Members","url":"https://support.duda.co/hc/en-us/articles/26519392554775-Manage-Team-Members?ref=discovai-io&utm_source=discovai-io&utm_medium=referral","content":"If you lack a password or used Google for sign-in, click Forgot Password? …","description":"…"}]}}

data: {"event":"text-chunk","data":{"event_type":"text-chunk","text":"To reset"}}

data: {"event":"final-response","data":{"event_type":"final-response","message":"To reset your password, follow these steps: …[2]"}}

data: {"event":"stream-end","data":{"event_type":"stream-end","thread_id":null}}
```

### Event order

```
begin-stream → search-results → text-chunk × N → more-results → final-response → stream-end
                                     (or, on failure, a single `error` frame, then the stream ends)
```

You can render `search-results` immediately (they arrive before the answer), then let the
answer stream in for a responsive feel.

---

## ⚠️ Connecting from a browser (CORS) — proxy through your own backend

supportAiAnswer powers a **white-labeled** support platform: each customer runs their own
portal on its own domain, and new portals come online continuously. So the supportAiAnswer
backend deliberately **does not maintain a per-origin CORS allowlist** — that can't scale to
an open-ended, ever-growing set of portal domains, and allowlisting each new portal by hand
would be an operational dead end. A browser calling the endpoint **directly** from a portal's
origin is therefore **blocked by CORS** (verified: a preflight from an arbitrary origin
returns `Access-Control-Allow-Origin: https://agendo-navy.vercel.app`, not the caller).

**The supported pattern is to proxy.** Each portal already has its own server/origin, so it
exposes a **same-origin** route that forwards the request to supportAiAnswer and pipes the
stream straight back to the browser. This scales by construction — every new portal brings
its own proxy, and the supportAiAnswer backend never has to know any portal origins. It also
keeps the upstream URL out of the client bundle and gives you a natural place to add auth,
rate limiting, or logging per portal later.

```
Browser (portal origin) ──POST /api/support-ai-answer──▶ Portal's own server ──POST──▶ supportAiAnswer
        ▲                       (same-origin: no CORS)                          (server-to-server: no CORS)
        └──────────────────  streamed SSE frames piped straight back  ──────────────────────┘
```

Server-to-server requests aren't subject to CORS, so the proxy works regardless of the
portal's domain — which is exactly why it scales for a white-labeled fleet.

**Next.js (App Router) — `app/api/support-ai-answer/route.ts`:**

```ts
export const runtime = "nodejs"; // node runtime streams reliably

const DATASET = "duda"; // your portal's dataset key
const UPSTREAM = `https://backend.agendo.dmsupport.org/discovai/${DATASET}/chat`;

export async function POST(req: Request) {
  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });
  // Pipe the upstream stream straight back to the browser (same-origin → no CORS).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
```

**Express:**

```js
router.post("/api/support-ai-answer", express.json(), async (req, res) => {
  const DATASET = "duda"; // your portal's dataset key
  const upstream = await fetch(`https://backend.agendo.dmsupport.org/discovai/${DATASET}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(dec.decode(value, { stream: true }));
  }
  res.end();
});
```

Then point the client at your own path (`/api/support-ai-answer`).

> **Not supported: direct browser calls / per-origin allowlisting.** Because the platform is
> white-labeled with an open-ended set of portal domains, the backend won't allowlist portal
> origins — so a browser can't hit `https://backend.agendo.dmsupport.org/discovai/chat`
> directly (CORS will block it). Always route through your portal's same-origin proxy.

---

## Reference implementation

Set `ENDPOINT` to your portal's same-origin proxy route (see the CORS section above).

### 1. Framework-agnostic core (vanilla JS / TS)

```js
const ENDPOINT = "/api/support-ai-answer"; // your portal's same-origin proxy route (see CORS section)

/**
 * Streams a supportAiAnswer response, invoking handlers as events arrive.
 * Resolves when the stream ends. Pass an AbortSignal to cancel.
 */
export async function streamSupportAiAnswer(query, handlers = {}, { refreshCache = false, signal } = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, refreshCache }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`supportAiAnswer failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (frame) => {
    const line = frame.trim();
    if (!line.startsWith("data:")) return;
    let payload;
    try { payload = JSON.parse(line.replace(/^data:\s*/, "")); } catch { return; }
    const { event, data = {} } = payload;
    switch (event) {
      case "begin-stream":   handlers.onBegin?.(data.query); break;
      case "search-results": handlers.onResults?.(data.results || []); break;
      case "text-chunk":     handlers.onChunk?.(data.text || ""); break;
      case "more-results":   handlers.onMoreResults?.(data.more_results || []); break;
      case "final-response": handlers.onFinal?.(data.message || ""); break;
      case "stream-end":     handlers.onEnd?.(); break;
      case "error":          handlers.onError?.(data.detail || "unknown error"); break;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf("\n\n")) !== -1) {
      dispatch(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
    }
  }
  if (buffer.trim()) dispatch(buffer); // flush any tail
}
```

### 2. React hook

```jsx
import { useCallback, useRef, useState } from "react";

const ENDPOINT = "/api/support-ai-answer"; // your portal's same-origin proxy route (see CORS section)

export function useSupportAiAnswer() {
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);       // SearchResult[]
  const [moreSources, setMoreSources] = useState([]); // { title, url }[]
  const [status, setStatus] = useState("idle");      // idle | streaming | done | error
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const ask = useCallback(async (query, { refreshCache = false } = {}) => {
    if (!query?.trim()) return;
    abortRef.current?.abort();                       // cancel any in-flight request
    const controller = new AbortController();
    abortRef.current = controller;

    setAnswer(""); setSources([]); setMoreSources([]); setError(null); setStatus("streaming");

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, refreshCache }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (frame) => {
        const line = frame.trim();
        if (!line.startsWith("data:")) return;
        let p; try { p = JSON.parse(line.replace(/^data:\s*/, "")); } catch { return; }
        const d = p.data || {};
        if (p.event === "search-results") setSources(d.results || []);
        else if (p.event === "text-chunk") setAnswer((a) => a + (d.text || ""));
        else if (p.event === "more-results") setMoreSources(d.more_results || []);
        else if (p.event === "stream-end") setStatus("done");
        else if (p.event === "error") { setError(d.detail || "error"); setStatus("error"); }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf("\n\n")) !== -1) { handle(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
      }
      setStatus((s) => (s === "streaming" ? "done" : s));
    } catch (e) {
      if (e.name !== "AbortError") { setError(e.message); setStatus("error"); }
    }
  }, []);

  return { ask, answer, sources, moreSources, status, error };
}
```

### 3. React component (the AI Answer UI)

```jsx
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useSupportAiAnswer } from "./useSupportAiAnswer";

// `query` should be the (debounced) text the user searched for.
export function SupportAiAnswer({ query }) {
  const { ask, answer, sources, moreSources, status, error } = useSupportAiAnswer();

  useEffect(() => {
    if (query?.trim()) ask(query);
  }, [query, ask]);

  if (status === "idle") return null;
  if (status === "error") return null; // fail quietly — your normal search results still show

  return (
    <section className="support-ai-answer">
      <header>
        <h3>AI Answer</h3>
        {status === "streaming" && <span className="spinner" aria-label="Generating…" />}
      </header>

      {/* Answer streams in as markdown with inline [n] citations */}
      <ReactMarkdown>{answer}</ReactMarkdown>

      {sources.length > 0 && (
        <>
          <h4>Sources</h4>
          <ol>
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
              </li>
            ))}
          </ol>
        </>
      )}

      {moreSources.length > 0 && (
        <details>
          <summary>More related articles</summary>
          <ul>
            {moreSources.map((m) => (
              <li key={m.url}><a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

---

## Rendering the answer & citations

- The answer is **markdown** (bullets, bold) with inline citations like `[1]`, `[2]`.
- **Citations map to `sources` by position:** `[1]` → `sources[0]`, `[2]` → `sources[1]`, …
  Rendering sources as an ordered list (`<ol>`) makes the numbers line up. The model only
  cites the articles it actually used, so the numbers may not be contiguous.
- Want clickable citations? Post-process the text, replacing `[n]` with a link to
  `sources[n-1].url`.
- Use a markdown renderer that escapes HTML (e.g. `react-markdown` is safe by default). Don't
  inject the answer as raw `innerHTML` without sanitizing.

---

## Recommended UX

- **Trigger** on the search the user already performs. **Debounce** ~300–500 ms so you don't
  fire on every keystroke; fire on submit or when typing pauses.
- Show `search-results` as soon as they arrive, then let the answer stream below them.
- Show a **loading indicator** until the first `text-chunk` (first token typically lands in
  ~1–3 s: embedding + search + LLM warm-up).
- **Cancel** the previous request when a new query starts (the hook does this via
  `AbortController`).
- On `error`, **fail quietly** — hide the AI panel and let your normal search results stand.

---

## Behavior & gotchas

- **Caching.** Answers and search results are cached server-side (results ~24 h, answers
  ~12 h), so repeat queries return fast. A cached answer is replayed token-by-token so the
  streaming UX looks identical. Pass `refreshCache: true` to force a fresh run.
- **Latency.** Uncached queries take a couple of seconds before the first token; cached ones
  are near-instant.
- **Language.** The answer matches the language of the question; non-English queries are
  translated internally for retrieval.
- **Result URLs include tracking params.** Article URLs come back with
  `?ref=discovai-io&utm_source=discovai-io&utm_medium=referral` appended (a legacy default).
  Use them as-is, or strip the query string client-side if you want clean links. (If you want
  the default changed/removed, that's a one-line backend tweak — ask the backend owner.)
- **Empty knowledge base match.** If nothing relevant is found, `search-results` may be empty
  and the answer may say it can't help. Handle the empty `sources` case gracefully.
- **`thread_id`** is reserved and currently always `null` — no multi-turn/conversation state.

---

## Quick checklist

- [ ] Stand up a same-origin proxy route on your portal's server (required — direct browser calls are blocked by CORS, and per-origin allowlisting isn't used because the platform is white-labeled).
- [ ] Wire `ENDPOINT` to that proxy route.
- [ ] Read the stream with `fetch` + reader (not `EventSource`); switch on `payload.event`.
- [ ] Render `search-results` immediately; append `text-chunk`s into the answer.
- [ ] Debounce the trigger; show a loading state; cancel stale requests.
- [ ] Render the answer as markdown; map `[n]` citations to `sources[n-1]`.
- [ ] Fail quietly on `error` so normal search still works.
