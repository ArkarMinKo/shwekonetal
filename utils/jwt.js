const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;

exports.generateToken = (payload, expiresIn = "7d") => {
  return jwt.sign(payload, SECRET, { expiresIn });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};
