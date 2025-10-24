const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const WebSocket = require("ws");

// Upload folders
const USER_UPLOAD_DIR = path.join(__dirname, "uploads");

// Ensure folders exist
fs.mkdirSync(USER_UPLOAD_DIR, { recursive: true });

// Routes
const users = require("./routes/users");
const goldPrices = require("./routes/goldPrices"); 
const sales = require("./routes/sales");
const ownGold = require("./routes/getOwnGold");


// CORS helper
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathName = parsedUrl.pathname;
  const method = req.method;

  // --- Serve user uploads ---
  if (pathName.startsWith("/uploads/")) {
    const safePath = path.normalize(path.join(__dirname, pathName));
    if (!safePath.startsWith(USER_UPLOAD_DIR)) {
      res.writeHead(403);
      return res.end("Access denied");
    }
    fs.readFile(safePath, (err, data) => {
      if (err) return res.writeHead(404).end("File not found");
      const ext = path.extname(safePath).toLowerCase();
      const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(data);
    });
    return;
  }
  
  // --- Login ---
  if (pathName === "/login" && method === "POST") {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => users.loginUser(req, res, body));
    return;
  }

  // -- email confrimation ---

  else if(pathName === "/request-email-confirmation" && method === "POST"){
    users.requestEmailConfirmation(req, res);
  }

  else if(pathName === "/verify-email-code" && method === "POST"){
    users.verifyEmailCodeBeforeCreate(req, res);
  }

  // --- Users CRUD ---
  else if (pathName === "/users" && method === "POST") users.createUser(req, res);
  else if (pathName === "/users" && method === "GET") users.getUsers(req, res);

  else if (pathName.startsWith("/users/") && method === "GET") {
    const id = pathName.split("/")[2];
    users.getUserById(req, res, id);
  }
  
  else if (pathName.startsWith("/users/") && method === "PUT") {
    const id = pathName.split("/")[2];
    users.updateUser(req, res, id);
  }
  else if (pathName.startsWith("/users/") && method === "DELETE") {
    const id = pathName.split("/")[2];
    users.deleteUser(req, res, id);
  }
  else if (pathName.startsWith("/users/approve/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.approveUser(req, res, id);
  }
  else if (pathName.startsWith("/users/reject/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.rejectUser(req, res, id);
  }

  // --- Users PATCH update passcode routes ---
  else if (pathName.startsWith("/users/update-passcode/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.updatePasscode(req, res, id);
  }

  // --- Users POST check passcode routes ---
  else if (pathName.startsWith("/users/check-passcode/") && method === "POST") {
    const id = pathName.split("/")[3];
    users.verifyPasscode(req, res, id);
  }

  // --- Getting All Selling Price ---
  else if (pathName === "/selling-prices" && method === "GET") {
    goldPrices.getAllSellingPrices(req, res);
  }

  // --- Getting Latest Selling Price ---
  else if (pathName === "/selling-prices/latest" && method === "GET") {
    goldPrices.getLatestSellingPrice(req, res);
  }

  // --- Selling Price Update ---
  else if (pathName === "/selling-prices" && method === "POST") {
    goldPrices.insertSellingPrice(req, res);
  }

  // --- Getting All Buying Price ---
  else if (pathName === "/buying-prices" && method === "GET") {
    goldPrices.getAllBuyingPrices(req, res);
  }

  // --- Getting Latest Buying Price ---
  else if (pathName === "/buying-prices/latest" && method === "GET") {
    goldPrices.getLatestBuyingPrice(req, res);
  }

  // --- Buying Price Update ---
  else if (pathName === "/buying-prices" && method === "POST") {
    goldPrices.insertBuyingPrice(req, res);
  }

  // --- Get Sales ---
  else if (pathName.startsWith("/sales/approve/") && method === "GET") {
    const userid = pathName.split("/")[3];
    sales.getApprovedSales(req, res, userid);
  }

  else if (pathName === "/sales/pending" && method === "GET") {
    sales.getPendingSales(req,res)
  }
  else if (pathName === "/sales" && method === "GET") {
    sales.getAllSales(req,res)
  }

  // --- Create Sales ---
  else if (pathName === "/sales" && method === "POST") {
    sales.createSale(req,res)
  }

  // --- Approve Sales ---
  else if (pathName.startsWith("/sales/approve/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    sales.approveSale(req, res, id);
  }

  // --- Reject Sales ---
  else if (pathName.startsWith("/sales/reject/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    sales.rejectSale(req, res, id);
  }

  // --- Get Own Gold ---
  else if (pathName.startsWith("/own_gold/") && method === "GET") {
    const userid = pathName.split("/")[2];
    ownGold.getOwnGold(req, res, userid);
  }

  // --- 404 fallback ---
  else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});