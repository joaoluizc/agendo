import {
  runSearch,
  getLlmCache,
  setLlmCache,
  streamLlm,
} from "./discovaiService.js";
import { assertDiscovaiConfig } from "./lib/config.js";
import { resolveDataset } from "./lib/datasets.js";
import { genStream, sleep } from "./lib/utils.js";
import { StreamEvent } from "./lib/streamEvents.js";

/**
 * SSE controller for the DiscovAI search route. Owns the `res` object and
 * reproduces the exact event order of DiscovAI's POST /api/chat:
 *   begin-stream -> search-results -> text-chunk* -> more-results
 *   -> final-response -> stream-end   (or `error` on failure).
 * Wire format stays `data: {json}\n\n` (event name carried inside `.event`).
 */
const chat = async (req, res) => {
  const { query, debug = false, refreshCache = false, dataset: bodyDataset } = req.body || {};
  // Dataset comes from the URL (/discovai/:dataset/chat); /discovai/chat defaults to duda.
  const requestedDataset = req.params.dataset ?? bodyDataset;
  const dataset = resolveDataset(requestedDataset);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const writeEvent = (event, data) =>
    res.write(genStream({ event, data: { event_type: event, ...data } }));

  try {
    // Per-request config check — never crashes the server, just reports cleanly.
    assertDiscovaiConfig();

    if (!query || typeof query !== "string" || !query.trim()) {
      writeEvent(StreamEvent.ERROR, { detail: "query is required" });
      return res.end();
    }

    if (!dataset) {
      writeEvent(StreamEvent.ERROR, {
        detail: `unknown dataset "${requestedDataset ?? ""}"`,
      });
      return res.end();
    }

    writeEvent(StreamEvent.BEGIN_STREAM, { query });

    if (debug) {
      console.log(`[discovai] query=${query} refreshCache=${refreshCache}`);
    }

    const { searchResult, top5, moreResults } = await runSearch({
      query,
      dataset,
      refreshCache,
      debug,
    });

    writeEvent(StreamEvent.SEARCH_RESULTS, { results: searchResult });

    // LLM answer: replay a cached answer word-by-word, else stream fresh tokens.
    let gathered = "";
    const cached = await getLlmCache(dataset, query);

    if (cached) {
      gathered = cached;
      for (const word of cached.split(" ")) {
        await sleep(10);
        writeEvent(StreamEvent.TEXT_CHUNK, { text: word + " " });
      }
    } else {
      const stream = await streamLlm({ query, top5 });
      for await (const chunk of stream.textStream) {
        writeEvent(StreamEvent.TEXT_CHUNK, { text: chunk });
        gathered += chunk;
      }
    }

    await setLlmCache(dataset, query, gathered);

    writeEvent(StreamEvent.MORE_RESULTS, { more_results: moreResults });
    writeEvent(StreamEvent.FINAL_RESPONSE, { message: gathered });
    writeEvent(StreamEvent.STREAM_END, { thread_id: null });

    res.end();
  } catch (error) {
    console.error("[discovai] chat error:", error);
    try {
      writeEvent(StreamEvent.ERROR, { detail: error?.message || "Oops~" });
    } catch {
      // response already torn down — nothing more we can do
    }
    res.end();
  }
};

export default { chat };
