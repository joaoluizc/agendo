import { getDnsInfo } from "../services/dnsService.js";

export async function lookup(req, res) {
  const { domain } = req.query;
  if (!domain) {
    return res.status(400).json({ error: "Missing domain query parameter." });
  }
  try {
    const result = await getDnsInfo(domain);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
