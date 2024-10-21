import { v4 as uuidv4 } from "uuid";

const addRequestId = (req, _res, next) => {
  req.requestId = uuidv4();
  next();
};

export default addRequestId;
