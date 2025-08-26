import fetch from "node-fetch";

async function lookupDomain(domain) {
  const url = `https://networkcalc.com/api/dns/lookup/${domain}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch DNS info for ${domain}`);
  return res.json();
}

export async function getDnsInfo(domain) {
  const naked = domain.replace(/^www\./, "");
  const www = naked.startsWith("www.") ? naked : `www.${naked}`;
  const [nakedInfo, wwwInfo] = await Promise.all([
    lookupDomain(naked),
    lookupDomain(www),
  ]);
  return { naked: nakedInfo, www: wwwInfo };
}
