import { discovaiConfig } from "./config.js";

// Lightweight replacement for DiscovAI's @langchain/community JinaEmbeddings.
// This is exactly what that wrapper does under the hood: POST the input to Jina's
// REST API and return the embedding vectors. Same model => identical 768-dim output.
const JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings";
const JINA_MODEL = "jina-embeddings-v2-base-en";

async function embed(input) {
  const response = await fetch(JINA_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${discovaiConfig.jinaApiKey}`,
    },
    body: JSON.stringify({ model: JINA_MODEL, input }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Jina embeddings request failed (${response.status}): ${detail}`);
  }

  const json = await response.json();
  return (json.data ?? []).map((item) => item.embedding);
}

export async function generateQueryEmbedding(query) {
  const [embedding] = await embed([query]);
  return embedding;
}
