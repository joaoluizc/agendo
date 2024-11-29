export function validateObjFields(obj, fields) {
  // check if the fields are in the object
  const objKeys = Object.keys(obj);
  const missingFields = fields.filter((field) => !objKeys.includes(field));
  if (missingFields.length > 0) {
    throw new Error(`Missing fields: ${missingFields.join(", ")}`);
  }

  // check if there are any extra fields. if so, delete them. must returned cleaned object
  const extraFields = objKeys.filter((key) => !fields.includes(key));
  if (extraFields.length > 0) {
    extraFields.forEach((field) => delete obj[field]);
  }
  return obj;
}
