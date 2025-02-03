import { parseISO, isValid } from "date-fns";

function isISODate(dateStr) {
  const date = parseISO(dateStr);
  return isValid(date);
}

export default isISODate;
