// Ported verbatim from DiscovAI-search/server/src/lib/utils.ts (types dropped).

/** Serialize a stream event into an SSE frame. Wire format: `data: {json}\n\n`. */
export const genStream = (o) => `data: ${JSON.stringify(o)}\n\n`;

export function containsChinese(str) {
  const chineseRegex = /[一-龥]/;
  return chineseRegex.test(str);
}

function addQueryParams(url, params) {
  const urlObj = new URL(url);
  Object.keys(params).forEach((key) => urlObj.searchParams.append(key, params[key]));
  return urlObj.toString();
}

const refParams = {
  ref: "discovai-io",
  utm_source: "discovai-io",
  utm_medium: "referral",
};

export function addRefToUrl(url) {
  if (!url || typeof url !== "string") return url;
  try {
    return addQueryParams(url, refParams);
  } catch {
    return url;
  }
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
