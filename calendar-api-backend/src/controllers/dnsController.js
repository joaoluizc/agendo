import { getDnsInfo } from "../services/dnsService.js";

export async function lookup(req, res) {
  const { domain } = req.query;
  if (!domain) {
    console.error("Missing domain query parameter.");
    return res.status(400).json({ error: "Missing domain query parameter." });
  }
  try {
    console.log(`Looking up DNS information for domain: ${domain}`);
    const result = await getDnsInfo(domain);
    res.json(result);
  } catch (err) {
    console.error(
      `Error occurred while looking up DNS information for domain ${domain}:`,
      err
    );
    res.status(500).json({ error: err.message });
  }
}
