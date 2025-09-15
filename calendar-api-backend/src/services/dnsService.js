import dns from "dns/promises";
import { compareDNSRecordsToDuda } from "../utils/compareDNSRecords.js";

async function lookupDomain(domain) {
  const result = {};
  try {
    result.A = await dns.resolve(domain, "A");
  } catch (e) {
    result.A = [];
  }
  try {
    result.AAAA = await dns.resolve(domain, "AAAA");
  } catch (e) {
    result.AAAA = [];
  }
  try {
    result.CNAME = await dns.resolve(domain, "CNAME");
  } catch (e) {
    result.CNAME = [];
  }
  try {
    result.MX = await dns.resolve(domain, "MX");
  } catch (e) {
    result.MX = [];
  }
  try {
    result.TXT = await dns.resolve(domain, "TXT");
  } catch (e) {
    result.TXT = [];
  }
  try {
    result.CAA = await dns.resolve(domain, "CAA");
  } catch (e) {
    result.CAA = [];
  }
  return result;
}

export async function getDnsInfo(domain) {
  const naked = domain.replace(/^www\./, "");
  const www = naked.startsWith("www.") ? naked : `www.${naked}`;
  const [nakedInfo, wwwInfo] = await Promise.all([
    lookupDomain(naked),
    lookupDomain(www),
  ]);
  const diagnoses = compareDNSRecordsToDuda(nakedInfo, wwwInfo);
  return { naked: nakedInfo, www: wwwInfo, diagnoses };
}
