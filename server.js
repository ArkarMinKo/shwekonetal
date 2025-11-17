const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const WebSocket = require("ws");

// Upload folders
const USER_UPLOAD_DIR = path.join(__dirname, "uploads");
const STICKER_UPLOAD_DIR = path.join(__dirname, "chatUploads/Stickers");

// Ensure folders exist
fs.mkdirSync(USER_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(STICKER_UPLOAD_DIR, { recursive: true });

// Routes
const admin = require('./routes/admin')
const users = require("./routes/users");
const goldPrices = require("./routes/goldPrices"); 
const sales = require("./routes/sales");
const ownGold = require("./routes/getOwnGold");
const stickers = require('./routes/stickers');
const messages = require('./routes/messages');
const dashboard = require('./routes/dashboard');
const mobileNotification = require('./routes/mobileNotification')


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

  // --- Serve sticker uploads ---
  if (pathName.startsWith("/chatUploads/Stickers/")) {
    const filename = path.basename(pathName);
    const safePath = path.join(STICKER_UPLOAD_DIR, filename);
    return fs.readFile(safePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end("File not found"); }
      const ext = path.extname(safePath).toLowerCase();
      const mimeTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif" };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(data);
    });
  }
  
  // --- Login ---
  if (pathName === "/login" && method === "POST") {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => users.loginUser(req, res, body));
    return;
  }
  else if (pathName === "/login-admin" && method === "POST"){
    admin.loginAdmin(req, res)
  }

  // --- Change Email ---
  else if (pathName.startsWith("/change-email/") && method === "PATCH") {
    const id = pathName.split("/")[2];
    users.changeEmail(req, res, id);
  }

  // -- email confrimation ---

  else if(pathName === "/request-email-confirmation" && method === "POST"){
    users.requestEmailConfirmation(req, res);
  }

  else if(pathName === "/verify-email-code" && method === "POST"){
    users.verifyEmailCodeBeforeCreate(req, res);
  }

  // --- ‌Admin CRUD ---
  else if (pathName === "/admin" && method === "POST") admin.createAdmin(req, res);
  else if (pathName === "/admin" && method === "GET") admin.getAdmins(req, res);
  else if (pathName === "/admin" && method === "PUT") admin.updateAdminInfo(req, res);
  else if (pathName.startsWith("/admin/") && method === "DELETE") {
    const id = pathName.split("/")[2];
    admin.deleteAdmin(req, res, id);
  }

  else if (pathName.startsWith("/admin/") && method === "GET") {
    const id = pathName.split("/")[2];
    admin.getAdminsById(req, res, id);
  }

  else if (pathName === "/admin/verify-admin-passcode" && method === "POST") admin.verifyAdminPasscode(req, res);
  else if (pathName === "/admin/verify-owner-passcode" && method === "POST") admin.verifyOwnerPasscode(req, res);

  else if(pathName === "/admin/password" && method === "PATCH") admin.updateAdminPassword(req, res);
  else if(pathName === "/admin/passcode" && method === "PATCH") admin.updateAdminPasscode(req, res);

  // --- Agents CRUD ---
  else if (pathName === "/agents" && method === "POST") admin.createAgent(req, res);
  else if (pathName === "/agents" && method === "GET") admin.getAgents(req, res);
  else if (pathName.startsWith("/agents/") && method === "DELETE") {
    const id = pathName.split("/")[2];
    admin.deleteAgent(req, res, id);
  }

  // --- Users CRUD ---
  else if (pathName === "/users" && method === "POST") users.createUser(req, res);
  else if (pathName === "/users" && method === "GET") users.getUsers(req, res);
  else if (pathName === "/users-summarys" && method === "GET") users.usersSummarys(req, res);

  else if (pathName.startsWith("/users/") && method === "GET") {
    const id = pathName.split("/")[2];
    users.getUserById(req, res, id);
  }
  
  else if (pathName.startsWith("/users/") && method === "PUT") {
    const id = pathName.split("/")[2];
    users.updateUser(req, res, id);
  }
  else if (pathName.startsWith("/users/approve/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.approveUser(req, res, id);
  }
  else if (pathName.startsWith("/users/reject/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.rejectUser(req, res, id);
  }
  else if (pathName.startsWith("/users/passcode/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.patchUserPasscode(req, res, id);
  }
  else if (pathName.startsWith("/users/password/") && method === "PATCH") {
    const id = pathName.split("/")[3];
    users.patchUserPassword(req, res, id);
  }
  else if (pathName === "/users/password-with-OTP" && method === "PATCH") {
    users.patchUserPasswordWithOTP(req, res);
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

  // --- Get Open Stock ---
  else if (pathName === "/open-stock" && method === "GET"){
    goldPrices.getOpenStock(req, res);
  }

  // --- Post Open Stock ---
  else if (pathName === "/open-stock" && method === "POST") {
    goldPrices.postOpenStock(req, res);
  }

  // --- Post Open Server ---
  else if (pathName === "/open-server" && method === "GET") {
    goldPrices.getServer(req, res);
  }

  // --- Post Open Server ---
  else if (pathName === "/open-server" && method === "POST") {
    goldPrices.openServer(req, res);
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

  // --- GET buying price Data
  else if (pathName === "/selling-prices-data" && method === "GET") {
    goldPrices.getSellingPricesData(req, res);
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

  // --- GET buying price Data
  else if (pathName === "/buying-prices-data" && method === "GET") {
    goldPrices.getBuyingPricesData(req, res);
  }

  // --- Get Sales ---
  // --- Get all Sales By User ---
  else if (pathName.startsWith("/sales/") && method === "GET") {
    const userid = pathName.split("/")[2];
    sales.getAllSalesByUser(req, res, userid);
  }

  else if (pathName === "/approve" && method === "GET") {
    sales.getAllApprove(req,res)
  }

  // --- Get Date Filter Sales By User ---
  else if (pathName.startsWith("/sales/") && method === "POST") {
    const userid = pathName.split("/")[2];
    sales.getDateFilterByUser(req, res, userid);
  }

  // --- Get approve Sales By User ---
  else if (pathName.startsWith("/approve/") && method === "GET") {
    const userid = pathName.split("/")[2];
    sales.getApprovedSales(req, res, userid);
  }

  // --- Get reject Sales By User ---
  else if (pathName.startsWith("/reject/") && method === "GET") {
    const userid = pathName.split("/")[2];
    sales.getRejectedSales(req, res, userid);
  }

  // --- Get pending Sales By User ---
  else if (pathName.startsWith("/pending/") && method === "GET") {
    const userid = pathName.split("/")[2];
    sales.getPendingSales(req, res, userid);
  }

  // --- Get buying gold buy by times today ---
  else if (pathName === "/gold-times-today" && method === "GET") {
    sales.getTimesSalesByToday(req,res);
  }

  // --- Get All Sales
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

  // --- Get Filter Date ---
  else if (pathName.startsWith("/own_gold/") && method === "POST"){
    const userid = pathName.split("/")[2];
    ownGold.getFilterDate(req, res, userid)
  }

  // --- Insert Formula ---
  else if (pathName === "/formula" && method === "POST"){
    goldPrices.insertFormula(req, res);
  }

  // --- Get All Formula ---
  else if (pathName === "/formula" && method === "GET") {
    goldPrices.getAllFormula(req, res);
  }

  // --- Get Latest Formula ---
  else if (pathName === "/formula/latest" && method === "GET") {
    goldPrices.getLatestFormula(req, res);
  }

  // --- Get report buy and sell chart
  else if (pathName === "/report-buy-sell-chart" && method === "GET") {
    sales.compareBuyAndSellChart(req, res);
  }

  // --- Get buy table ---
  else if (pathName === "/buyTable" && method === "GET") {
    sales.buyTable(req, res);
  }

  // --- Get sell table ---
  else if (pathName === "/sellTable" && method === "GET") {
    sales.sellTable(req, res);
  }

  // --- Get deli table ---
  else if (pathName === "/deliTable" && method === "GET") {
    sales.deliTable(req, res);
  }

  // --- Get summarys dashboard ---
  else if (pathName === "/dashboard-summarys" && method === "GET") {
    dashboard.summarys(req, res);
  }

  // --- Get buying price chart ---
  else if (pathName === "/buying-prices-chart" && method === "GET") {
    dashboard.buyingPricesChart(req,res)
  }

  // --- Get revenue gold chart ----
  else if (pathName === "/revenue-gold-chart" && method === "GET") {
    dashboard.revenueGoldChart(req,res)
  }

  // --- Get top3 wallet ---
  else if (pathName === "/topWallet" && method === "GET") {
    dashboard.topWallet(req,res)
  }

  // --- Get buy vs sell ---
  else if (pathName === "/buy-vs-sell" && method === "GET") {
    dashboard.buyVSsell(req,res)
  }

  // --- Get notification on mobile ---
  else if (pathName.startsWith("/mobile-noti/") && method === "GET") {
    const userid = pathName.split("/")[2];
    mobileNotification.getNoti(req, res, userid);
  }

  // --- Seen notification on mobile ---
  else if (pathName.startsWith("/mobile-noti/") && method === "PATCH") {
    const userid = pathName.split("/")[2];
    mobileNotification.seenNoti(req, res, userid);
  }

  // --- Sticker routes ---
  // --- Post stickers ---
  else if (pathName === "/stickers" && method === "POST") return stickers.uploadSticker(req, res);
  // --- Get stickers ---
  else if (pathName === "/stickers" && method === "GET") return stickers.getStickers(req, res);

  // --- Messages routes ---
  // --- POST Message ---
  else if (pathName === "/messages" && method === "POST") return messages.createMessage(req, res);
  // --- GET Message ---
  else if (pathName === "/messages" && method === "GET") return messages.getMessages(req, res);
  // --- Mark messages as seen ---
  else if (pathName === "/messages/mark-seen" && method === "POST") return messages.markMessagesSeen(req, res);

  // --- 404 fallback ---
  else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
  }
});

// --- WebSocket setup ---
const wss = new WebSocket.Server({ server });
const clients = {}; // store connected clients by userId

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      console.error("Invalid JSON message:", msg);
      return;
    }

    // --- Handle init handshake ---
    if (data.type === "init" && data.userId) {
      if (!clients[data.userId]) clients[data.userId] = [];
      clients[data.userId].push(ws);
      ws._userId = data.userId;
      console.log("WS init from:", data.userId);
      return;
    }

    // --- Extract message fields ---
    let { sender, receiver, type, content } = data;

    // --- Fallback sender if missing ---
    if (!sender) {
      if (ws._userId) {
        sender = ws._userId;
        console.log("Sender missing; using ws._userId:", ws._userId);
      } else {
        console.error("No sender and no ws._userId; message ignored");
        return;
      }
    }

    if (!receiver || !type) {
      console.error("Invalid message, missing receiver/type:", data);
      return;
    }

    const payload = { sender, receiver, type, content };

    // --- Send to receiver if online ---
    if (clients[receiver]) {
      clients[receiver].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      });
      console.log(`Sent message to receiver [${receiver}]`);
    } else {
      console.log(`Receiver [${receiver}] not online`);
    }

    // --- Echo to sender (so their UI also updates immediately) ---
    if (clients[sender]) {
      clients[sender].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      });
    }

    // --- Save message to DB ---
    const imageValue = type === "image" ? content : null;
    const contentValue = type !== "image" ? content : null;

    db.query(
      "INSERT INTO messages (sender, receiver_id, type, content, image, seen) VALUES (?, ?, ?, ?, ?, 0)",
      [sender, receiver, type, contentValue, imageValue],
      (err) => {
        if (err) {
          console.error("DB insert error:", err.sqlMessage || err.message);
        }
      }
    );
  });

  ws.on("close", () => {
    const id = ws._userId;
    if (id && clients[id]) {
      clients[id] = clients[id].filter((s) => s !== ws);
      if (clients[id].length === 0) delete clients[id];
      console.log("WS disconnected:", id);
    } else {
      console.log("WS disconnected (no id)");
    }
  });

  ws.on("error", (err) => {
    console.error("WS error:", err.message);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});