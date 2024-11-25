import jwt from "jsonwebtoken";
import process from "process";

const verifyUserAuth = async (req, res, next) => {
  const token = req.cookies.jwt;
  console.log("[verifyUserAuth] token: ", token);
  if (!token) {
    console.log("[verifyUserAuth] user unauthorized");
    return res.status(401).send("Unauthorized");
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

export default verifyUserAuth;
