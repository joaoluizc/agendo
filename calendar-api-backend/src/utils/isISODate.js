import { parseISO, isValid } from "date-fns";

function isISODate(dateStr) {
  const date = parseISO(dateStr);
  const valid = isValid(date);
  return valid;
}

function isISORange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dateStr)) {
    return false;
  }

  const [start, end] = dateStr.split("/");

  const startDate = parseISO(start);
  const endDate = parseISO(end);

  const validStart = isValid(startDate);
  const validEnd = isValid(endDate);

  return validStart && validEnd;
}

console.log(isISORange("2025-05-16T00:00:00.000Z/2025-05-16T23:59:59.999Z"));
console.log(isISORange("2025-05-16T00:00:00.000Z"));

export default isISODate;
