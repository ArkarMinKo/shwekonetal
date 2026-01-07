const jwt = require("../utils/jwt");

module.exports = function auth(requiredRole = null) {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.writeHead(401).end("No token provided");

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verifyToken(token);
      req.user = decoded;

      if (requiredRole && decoded.role !== requiredRole) {
        return res.writeHead(403).end("Access denied");
      }

      next();
    } catch (err) {
      res.writeHead(401);
      res.end("Invalid or expired token");
    }
  };
};
