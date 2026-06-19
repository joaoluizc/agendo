# DiscovAI search (self-contained module)

A near-verbatim port of [DiscovAI-search](../../../DiscovAI-search)'s `server/` search
pipeline, exposed as an agendo backend route. Everything for the feature — route,
controller, service, ported helpers, and a test UI — lives in this one folder so it can be
added or removed without touching the rest of the backend.

## What it does

`POST /discovai/<dataset>/chat` runs a RAG pipeline (scoped to `<dataset>`) and streams the
result as Server-Sent Events:

1. translate the query to English if needed (`gpt-4o-mini`)
2. embed the query with Jina (`jina-embeddings-v2-base-en`, 768-dim)
3. vector-similarity search in Supabase (pgvector `match_embeddings` RPC, filtered to the dataset)
4. enrich matches with `support_articles` metadata, dedupe by URL
5. stream a cited `gpt-4o-mini` answer over the top 5 results
6. Upstash Redis caches search (24h) and answers (12h) — optional (see below)

SSE event order: `begin-stream → search-results → text-chunk* → more-results →
final-response → stream-end` (or `error`). Wire format is `data: {json}\n\n` with the
event name inside the JSON `event` field.

## Endpoints

| Method | Path             | Purpose                                  | Auth |
| ------ | ---------------- | ---------------------------------------- | ---- |
| GET    | `/discovai`      | Self-contained HTML test console (has a dataset selector) | none |
| POST   | `/discovai/chat` | SSE search stream, default `duda` dataset (`{ query, refreshCache?, debug? }`) | none |
| POST   | `/discovai/:dataset/chat` | Same, scoped to `:dataset` (unknown key → `error` event) | none |

The route is mounted **public** (no Clerk `requireAuth()`), like `/ada` and `/dns`. To
require auth, change the mount in `app.js` to `app.use("/discovai", requireAuth(), discovaiRouter)`.

## Datasets

Each knowledge base is a `dataset` (a column on `support_articles` / `support_article_chunks`).
`match_embeddings` filters by it and the Redis cache keys are namespaced by it, so datasets are
isolated — a white-label portal never surfaces another's content. The registry lives in
`lib/datasets.js`; bare `/discovai/chat` defaults to `duda`.

To add a white-label portal:
1. Apply the one-time DB migration `DiscovAI-search/src/db/migrations/2026-06-add-dataset.sql`
   (adds the `dataset` column + the RPC filter), if not already applied.
2. Import its articles tagged with a new key — e.g. `DiscovAI-search/src/scripts/import-paligo.ts`
   run with `DATASET=<key>`.
3. Add an entry to `DATASETS` in `lib/datasets.js`. Its endpoint is then `POST /discovai/<key>/chat`.

## Files

```
discovai/
├── discovaiRouter.js      GET / (test page) + POST /chat
├── discovaiController.js  SSE plumbing (owns res)
├── discovaiService.js     pipeline logic (no res)
├── public/index.html      vanilla test UI (no deps, no build)
└── lib/                   ported helpers
    ├── datasets.js        dataset registry + resolver (add white-label keys here)
    ├── config.js          reads env via getters (no zod/process.exit)
    ├── supabase.js        lazy Supabase client
    ├── redis.js           Upstash client + cache keys (optional, no-op fallback)
    ├── embedding.js       Jina embeddings via direct fetch
    ├── llm.js             OpenAI streaming + translate (ai + @ai-sdk/openai)
    ├── prompts.js         CHAT_PROMPT, TRANSLATE
    ├── streamEvents.js    StreamEvent string constants
    └── utils.js           genStream, addRefToUrl, sleep, containsChinese
```

## Configuration

These env vars are read from `calendar-api-backend/.env` (block fenced
`# === DiscovAI search ===`). Required: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `JINA_API_KEY`, `OPENAI_API_KEY`. Optional:
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (caching is skipped if absent),
`OPENAI_API_URL` (custom OpenAI base URL). Missing required vars produce a clean SSE
`error` event per request — they never crash the server.

> The search relies on the Supabase project already containing embeddings in
> `support_articles` / `support_article_chunks`. If empty, populate it with
> DiscovAI-search's `populate.ts`.

## Test it

```
cd calendar-api-backend && npm install && npm run dev
```

Open <http://localhost:3001/discovai> and search, or:

```
curl -N -X POST http://localhost:3001/discovai/duda/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"how do I reset my password"}'
```

## Remove it

1. Delete this folder (`calendar-api-backend/src/discovai/`).
2. In `app.js`, delete the `discovaiRouter` import and its `app.use("/discovai", ...)` line.
3. In `package.json`, remove `@ai-sdk/openai`, `ai`, `@supabase/supabase-js`,
   `@upstash/redis`, `ws`, then re-run `npm install`.
4. In `.env`, delete the `# === DiscovAI search ===` block.

Nothing else in agendo depends on this module.
