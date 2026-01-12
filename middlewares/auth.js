const { verifyJWT } = require("../utils/jwtToken");

/**
 * Normal user (login ဖြစ်ထားရုံ)
 */
async function authUser(req, res) {
  try {
    await verifyJWT(req);
    return true;
  } catch (err) {
    res.writeHead(err.status || 401, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({ message: err.message }));
    return false;
  }
}

/**
 *  Owner only
 */
async function authOwner(req, res) {
  try {
    const user = await verifyJWT(req);

    if (user.role !== "owner") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Owner only access" }));
      return false;
    }

    return true;
  } catch (err) {
    res.writeHead(err.status || 401, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({ message: err.message }));
    return false;
  }
}

module.exports = { authUser, authOwner };
