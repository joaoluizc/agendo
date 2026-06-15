import {
  embeddingVectorCacheKey,
  llmResultCacheKey,
  getRedis,
} from "./lib/redis.js";
import { getSupabase } from "./lib/supabase.js";
import { generateQueryEmbedding } from "./lib/embedding.js";
import { genLLMTextChunk, translate } from "./lib/llm.js";
import { addRefToUrl } from "./lib/utils.js";

/**
 * The DiscovAI search pipeline, ported from
 * DiscovAI-search/server/src/routes/chat.ts (lines 12-236), with all `res`
 * (HTTP/SSE) handling removed — that lives in the controller. This layer only
 * returns data, matching agendo's router -> controller -> service convention.
 */

/**
 * Run the vector-search half of the pipeline.
 * @returns {Promise<{ searchResult: object[], top5: object[], moreResults: object[], source: string }>}
 *   - searchResult: top-5 results shaped for the UI ({title,url,content,description})
 *   - top5: the top-5 *raw* documents (with chunk_text/metadata) fed to the LLM
 *   - moreResults: remaining results as {title,url}
 */
export async function runSearch({ query, refreshCache = false, debug = false }) {
  const redis = getRedis();
  const supabase = getSupabase();
  const cacheKey = embeddingVectorCacheKey(query);

  const cacheResult = refreshCache ? null : await redis.get(cacheKey);

  let documents = [];
  let queryEmbeddingError = null;
  let source = "supabase";

  if (cacheResult && typeof cacheResult === "string") {
    source = "cache";
    try {
      documents = JSON.parse(cacheResult);
    } catch {
      documents = [];
      source = "supabase";
    }
  }

  if (!documents.length) {
    const translatedQuery = await translate({ query });
    const embedding = await generateQueryEmbedding(translatedQuery);

    if (debug) {
      console.log("[discovai] query embedding generated", {
        query,
        translatedQuery,
        embeddingLength: Array.isArray(embedding) ? embedding.length : null,
      });
    }

    const result = await supabase.rpc("match_embeddings", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 15,
    });
    documents = result.data ?? [];
    queryEmbeddingError = result.error;
    source = "supabase";

    if (documents.length > 0) {
      const articleIds = [...new Set(documents.map((doc) => doc.article_id))];
      const { data: articles } = await supabase
        .from("support_articles")
        .select("id, title, url")
        .in("id", articleIds);

      const articleMap = new Map(articles?.map((a) => [a.id, a]) || []);
      documents = documents.map((doc) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          title: doc.metadata?.title || articleMap.get(doc.article_id)?.title,
          url: doc.metadata?.url || articleMap.get(doc.article_id)?.url,
        },
      }));
    }
  }

  if (queryEmbeddingError) {
    console.error("[discovai] query embedding error", queryEmbeddingError);
    throw new Error("error on query embeddings");
  }

  if (source === "supabase") {
    await redis.setex(cacheKey, 60 * 60 * 24, JSON.stringify(documents));
  }

  if (!Array.isArray(documents)) documents = [];

  const validDocuments = documents.filter((article) => {
    const hasUrl =
      article?.metadata?.url &&
      typeof article.metadata.url === "string" &&
      article.metadata.url.trim().length > 0;
    const hasTitle =
      article?.metadata?.title &&
      typeof article.metadata.title === "string" &&
      article.metadata.title.trim().length > 0;
    return hasUrl && hasTitle;
  });

  const uniqueDocuments = [
    ...new Set(validDocuments.map((article) => article.metadata.url)),
  ].map((url) => validDocuments.find((article) => article.metadata.url === url));

  if (debug) {
    console.log("[discovai] matched documents", {
      query,
      source,
      rawCount: documents.length,
      validCount: validDocuments.length,
      uniqueCount: uniqueDocuments.length,
    });
  }

  for (const doc of uniqueDocuments) {
    if (doc?.metadata?.url) {
      doc.metadata.url = addRefToUrl(doc.metadata.url);
    }
  }

  const top5 = uniqueDocuments.slice(0, 5);

  const searchResult = top5.map((d) => {
    const safeContent = d.chunk_text.includes("DESCRIPTION")
      ? d.chunk_text?.split("---")?.[0]?.split("DESCRIPTION:")?.[1]
      : d.chunk_text;
    return {
      title: d.metadata.title,
      url: d.metadata.url,
      content: safeContent,
      description: safeContent,
    };
  });

  const moreResults = uniqueDocuments.slice(5).map((d) => ({
    title: d.metadata.title,
    url: d.metadata.url,
  }));

  return { searchResult, top5, moreResults, source };
}

/** Returns a cached LLM answer string, or null on miss. */
export async function getLlmCache(query) {
  const redis = getRedis();
  const raw = await redis.get(llmResultCacheKey(query));
  return raw && typeof raw === "string" ? raw : null;
}

/** Cache the generated LLM answer (12h TTL, matching DiscovAI). */
export async function setLlmCache(query, text) {
  const redis = getRedis();
  await redis.setex(llmResultCacheKey(query), 60 * 60 * 12, text);
}

/** Returns the streaming LLM result (has a `.textStream` async iterable). */
export async function streamLlm({ query, top5 }) {
  return genLLMTextChunk({ query, contexts: top5 });
}
