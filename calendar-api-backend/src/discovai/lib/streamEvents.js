// Ported from DiscovAI-search/server/src/schema/chat.ts (the `StreamEvent` enum).
// TS enum -> frozen plain object; the string values are the SSE event identifiers
// the test UI switches on, so they must stay identical.
export const StreamEvent = Object.freeze({
  BEGIN_STREAM: "begin-stream",
  SEARCH_RESULTS: "search-results",
  TEXT_CHUNK: "text-chunk",
  RELATED_QUERIES: "related-queries",
  MORE_RESULTS: "more-results",
  STREAM_END: "stream-end",
  FINAL_RESPONSE: "final-response",
  ERROR: "error",
});
