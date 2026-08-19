import reportsService from "./reportsService.js";

const MAX_NAME_LENGTH = 120;
const MAX_NAMES_PER_GROUP = 200;

const getGroups = async (req, res) => {
  try {
    const groups = await reportsService.getGroups();
    res.status(200).json(groups);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/** Returns an error string, or null when the group is well formed. */
const validateGroup = (group, index) => {
  const where = `groups[${index}]`;

  if (!group || typeof group !== "object") return `${where} must be an object`;
  if (group.name !== "Tickets" && group.name !== "Chats") {
    return `${where}.name must be "Tickets" or "Chats"`;
  }
  if (!Array.isArray(group.positionNames)) {
    return `${where}.positionNames must be an array`;
  }
  if (group.positionNames.length > MAX_NAMES_PER_GROUP) {
    return `${where}.positionNames must have at most ${MAX_NAMES_PER_GROUP} entries`;
  }
  const badName = group.positionNames.find(
    (name) => typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH,
  );
  if (badName !== undefined) {
    return `${where}.positionNames contains an invalid entry: ${JSON.stringify(badName)}`;
  }

  return null;
};

const replaceGroups = async (req, res) => {
  const groups = req.body?.groups;

  if (!Array.isArray(groups)) {
    return res.status(400).json({ message: "groups must be an array" });
  }

  for (let i = 0; i < groups.length; i++) {
    const error = validateGroup(groups[i], i);
    if (error) return res.status(400).json({ message: error });
  }

  try {
    const saved = await reportsService.replaceGroups(groups);
    res.status(200).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getHoursReport = async (req, res) => {
  const { start, end, groupByLocation } = req.query;

  if (!start || !end) {
    return res.status(400).json({ message: "start and end are required query parameters" });
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return res.status(400).json({ message: "start and end must be valid dates" });
  }
  if (rangeStart >= rangeEnd) {
    return res.status(400).json({ message: "start must be before end" });
  }

  try {
    const rows = await reportsService.getHoursReport({
      start,
      end,
      groupByLocation: groupByLocation === "true",
    });
    res.status(200).json(rows);
  } catch (error) {
    console.error(`[reports] getHoursReport failed: ${error.message}`);
    res.status(500).json({ message: `caught error: ${error.message}` });
  }
};

export default { getGroups, replaceGroups, getHoursReport };
