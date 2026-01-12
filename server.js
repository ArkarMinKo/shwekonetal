const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const WebSocket = require("ws");
const { authUser, authOwner } = require("./middlewares/auth");

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
    auth()(req, res, () => {
      const id = pathName.split("/")[2];
      users.changeEmail(req, res, id);
    })
  }

  // -- email confrimation ---

  else if(pathName === "/request-email-confirmation" && method === "POST"){
    users.requestEmailConfirmation(req, res);
  }

  else if(pathName === "/verify-email-code" && method === "POST"){
    users.verifyEmailCodeBeforeCreate(req, res);
  }

  // --- ‌Admin CRUD ---
  else if (pathName === "/admin" && method === "POST") {
    if (!(await authOwner(req, res))) return;
    admin.createAdmin(req, res);
  }
  else if (pathName === "/admin" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    admin.getAdmins(req, res);
  }
  else if (pathName === "/admin" && method === "PUT") {
    if (!(await authOwner(req, res))) return;
    admin.updateAdminInfo(req, res);
  }
  else if (pathName.startsWith("/admin/") && method === "DELETE") {
    if (!(await authOwner(req, res))) return;
    const id = pathName.split("/")[2];
    admin.deleteAdmin(req, res, id);
  }

  else if (pathName.startsWith("/admin/") && method === "GET") {
    if (!(await authOwner(req, res))) return;
    const id = pathName.split("/")[2];
    admin.getAdminsById(req, res, id);
  }

  else if (pathName === "/admin/verify-admin-passcode" && method === "POST") {
    if (!(await authUser(req, res))) return;
    admin.verifyAdminPasscode(req, res)
  }
  else if (pathName === "/admin/verify-owner-passcode" && method === "POST") {
    if (!(await authOwner(req, res))) return;
    admin.verifyOwnerPasscode(req, res)
  }

  else if(pathName === "/admin/password" && method === "PATCH") {
    if (!(await authOwner(req, res))) return;
    admin.updateAdminPassword(req, res)
  }
  else if(pathName === "/admin/passcode" && method === "PATCH") {
    if (!(await authOwner(req, res))) return;
    admin.updateAdminPasscode(req, res)
  }

  // --- Agents CRUD ---
  else if (pathName === "/agents" && method === "POST") {
    if (!(await authUser(req, res))) return;
    admin.createAgent(req, res)
  }
  else if (pathName === "/agents" && method === "GET") {
    if (!(await authUser(req, res))) return;
    admin.getAgents(req, res)
  }
  else if (pathName.startsWith("/agents/") && method === "DELETE") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[2];
    admin.deleteAgent(req, res, id);
  }

  // --- Users CRUD ---
  else if (pathName === "/users" && method === "POST") users.createUser(req, res);
  else if (pathName === "/users" && method === "GET") {
    if (!(await authUser(req, res))) return;
    users.getUsers(req, res)
  }
  else if (pathName === "/users-summarys" && method === "GET") {
    if (!(await authUser(req, res))) return;
    users.usersSummarys(req, res)
  }

  else if (pathName.startsWith("/users/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[2];
    users.getUserById(req, res, id);
  }
  
  else if (pathName.startsWith("/users/") && method === "PUT") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[2];
    users.updateUser(req, res, id);
  }
  else if (pathName.startsWith("/users/approve/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    users.approveUser(req, res, id);
  }
  else if (pathName.startsWith("/users/reject/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    users.rejectUser(req, res, id);
  }
  else if (pathName.startsWith("/users/passcode/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    users.patchUserPasscode(req, res, id);
  }
  else if (pathName.startsWith("/users/password/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    users.patchUserPassword(req, res, id);
  }
  else if (pathName === "/users/password-with-OTP" && method === "PATCH") {
    users.patchUserPasswordWithOTP(req, res);
  }

  // --- Users PATCH update passcode routes ---
  else if (pathName.startsWith("/users/update-passcode/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    users.updatePasscode(req, res, id);
  }

  // --- Users POST check passcode routes ---
  else if (pathName.startsWith("/users/check-passcode/") && method === "POST") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    users.verifyPasscode(req, res, id);
  }

  // --- Get Open Stock ---
  else if (pathName === "/open-stock" && method === "GET"){
    if (!(await authOwner(req, res))) return;
    goldPrices.getOpenStock(req, res);
  }

  // --- Post Open Stock ---
  else if (pathName === "/open-stock" && method === "POST") {
    if (!(await authOwner(req, res))) return;
    goldPrices.postOpenStock(req, res);
  }

  // --- Post Open Server ---
  else if (pathName === "/open-server" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    goldPrices.getServer(req, res);
  }

  // --- Post Open Server ---
  else if (pathName === "/open-server" && method === "POST") {
    if (!(await authOwner(req, res))) return;
    goldPrices.openServer(req, res);
  }

  // --- Getting All Selling Price ---
  else if (pathName === "/selling-prices" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getAllSellingPrices(req, res);
  }

  // --- Getting Latest Selling Price ---
  else if (pathName === "/selling-prices/latest" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getLatestSellingPrice(req, res);
  }

  // --- Selling Price Update ---
  else if (pathName === "/selling-prices" && method === "POST") {
    if (!(await authUser(req, res))) return;
    goldPrices.getLatestSellingPrice(req, res);
  }

  // --- GET buying price Data
  else if (pathName === "/selling-prices-data" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getSellingPricesData(req, res);
  }

  // --- Getting All Buying Price ---
  else if (pathName === "/buying-prices" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getAllBuyingPrices(req, res);
  }

  // --- Getting Latest Buying Price ---
  else if (pathName === "/buying-prices/latest" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getLatestBuyingPrice(req, res);
  }

  // --- Buying Price Update ---
  else if (pathName === "/buying-prices" && method === "POST") {
    if (!(await authUser(req, res))) return;
    goldPrices.insertBuyingPrice(req, res);
  }

  // --- GET buying price Data
  else if (pathName === "/buying-prices-data" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getBuyingPricesData(req, res);
  }

  // --- Get Sales ---
  // --- Get all Sales By User ---
  else if (pathName.startsWith("/sales/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    sales.getAllSalesByUser(req, res, userid);
  }

  else if (pathName === "/approve" && method === "GET") {
    if (!(await authUser(req, res))) return;
    sales.getAllApprove(req,res)
  }

  else if (pathName === "/reject" && method === "GET") {
    if (!(await authUser(req, res))) return;
    sales.getAllReject(req,res)
  }

  // --- Get Date Filter Sales By User ---
  else if (pathName.startsWith("/sales/") && method === "POST") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    sales.getDateFilterByUser(req, res, userid);
  }

  // --- Get approve Sales By User ---
  else if (pathName.startsWith("/approve/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    sales.getApprovedSales(req, res, userid);
  }

  // --- Get reject Sales By User ---
  else if (pathName.startsWith("/reject/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    sales.getRejectedSales(req, res, userid);
  }

  // --- Get pending Sales By User ---
  else if (pathName.startsWith("/pending/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    sales.getPendingSales(req, res, userid);
  }

  // --- Get buying gold buy by times today ---
  else if (pathName === "/gold-times-today" && method === "GET") {
    if (!(await authUser(req, res))) return;
    sales.getTimesSalesByToday(req,res);
  }

  // --- Get All Sales
  else if (pathName === "/sales" && method === "GET") {
    if (!(await authUser(req, res))) return;
    sales.getAllSales(req,res)
  }

  else if (pathName.startsWith("/sales-by-id/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const saleid = pathName.split("/")[2];
    sales.getSalesById(req, res, saleid);
  }

  // --- Create Sales ---
  else if (pathName === "/sales" && method === "POST") {
    if (!(await authUser(req, res))) return;
    sales.createSale(req,res)
  }

  // --- Approve Sales ---
  else if (pathName.startsWith("/sales/approve/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    sales.approveSale(req, res, id);
  }

  // --- Reject Sales ---
  else if (pathName.startsWith("/sales/reject/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const id = pathName.split("/")[3];
    sales.rejectSale(req, res, id);
  }

  // --- Get Own Gold ---
  else if (pathName.startsWith("/own_gold/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    ownGold.getOwnGold(req, res, userid);
  }

  // --- Get Filter Date ---
  else if (pathName.startsWith("/own_gold/") && method === "POST"){
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    ownGold.getFilterDate(req, res, userid)
  }

  // --- Insert Formula ---
  else if (pathName === "/formula" && method === "POST"){
    if (!(await authUser(req, res))) return;
    goldPrices.insertFormula(req, res);
  }

  // --- Get All Formula ---
  else if (pathName === "/formula" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getAllFormula(req, res);
  }

  // --- Get Latest Formula ---
  else if (pathName === "/formula/latest" && method === "GET") {
    if (!(await authUser(req, res))) return;
    goldPrices.getLatestFormula(req, res);
  }

  // --- Get report buy and sell chart
  else if (pathName === "/report-buy-sell-chart" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    sales.compareBuyAndSellChart(req, res);
  }

  // --- Get buy table ---
  else if (pathName === "/buyTable" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    sales.buyTable(req, res);
  }

  // --- Get sell table ---
  else if (pathName === "/sellTable" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    sales.sellTable(req, res);
  }

  // --- Get deli table ---
  else if (pathName === "/deliTable" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    sales.deliTable(req, res);
  }

  // --- Get summarys dashboard ---
  else if (pathName === "/dashboard-summarys" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    dashboard.summarys(req, res);
  }

  // --- Get summarys Sales ---
  else if (pathName === "/sales-summarys" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    sales.salesSummarys(req, res);
  }

  // --- Get buying price chart ---
  else if (pathName === "/buying-prices-chart" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    dashboard.buyingPricesChart(req,res)
  }

  // --- Get revenue gold chart ----
  else if (pathName === "/revenue-gold-chart" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    dashboard.revenueGoldChart(req,res)
  }

  // --- Get top3 wallet ---
  else if (pathName === "/topWallet" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    dashboard.topWallet(req,res)
  }

  // --- Get buy vs sell ---
  else if (pathName === "/buy-vs-sell" && method === "GET") {
    if (!(await authOwner(req, res))) return;
    dashboard.buyVSsell(req,res)
  }

  // --- Get notification on mobile ---
  else if (pathName.startsWith("/mobile-noti/") && method === "GET") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    mobileNotification.getNoti(req, res, userid);
  }

  // --- Seen notification on mobile ---
  else if (pathName.startsWith("/mobile-noti/") && method === "PATCH") {
    if (!(await authUser(req, res))) return;
    const userid = pathName.split("/")[2];
    mobileNotification.seenNoti(req, res, userid);
  }

  // --- Sticker routes ---
  // --- Post stickers ---
  else if (pathName === "/stickers" && method === "POST") {
    if (!(await authUser(req, res))) return;
    return stickers.uploadSticker(req, res);
  }
  // --- Get stickers ---
  else if (pathName === "/stickers" && method === "GET") {
    if (!(await authUser(req, res))) return;
    return stickers.getStickers(req, res)
  }

  // --- Messages routes ---
  // --- POST Message ---
  else if (pathName === "/messages" && method === "POST") {
    if (!(await authUser(req, res))) return;
    return messages.createMessage(req, res)
  }
  // --- GET Message ---
  else if (pathName === "/messages" && method === "GET") {
    if (!(await authUser(req, res))) return;
    return messages.getMessages(req, res)
  }
  // --- GET Message For Admin ---
  else if (pathName === "/admin-messages" && method === "GET") {
    if (!(await authUser(req, res))) return;
    return messages.getMessagesForAdmin(req, res)
  }
  // --- Mark messages as seen ---
  else if (pathName === "/messages/mark-seen" && method === "POST") {
    if (!(await authUser(req, res))) return;
    return messages.markMessagesSeen(req, res)
  }

  // --- 404 fallback ---
  else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
  }
});

// --- WebSocket setup ---
const wss = new WebSocket.Server({ server });
const clients = {}; // store connected clients by userId

const jwtLib = require("jsonwebtoken");

wss.on("connection", (ws) => {
  ws.isAuthenticated = false;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      console.error("Invalid JSON message:", msg);
      return;
    }

    // ===============================
    // 🔐 AUTH HANDSHAKE (JWT)
    // ===============================
    if (data.type === "auth" && data.token) {
      try {
        const decoded = jwtLib.verify(data.token, process.env.JWT_SECRET);

        /**
         * decoded example:
         * {
         *   userId: 5,
         *   role: "owner",
         *   type: "admin",
         *   iat: ...,
         *   exp: ...
         * }
         */

        ws.user = decoded;
        ws._userId = decoded.userId;
        ws.isAuthenticated = true;

        if (!clients[decoded.userId]) clients[decoded.userId] = [];
        clients[decoded.userId].push(ws);

        ws.send(JSON.stringify({
          type: "auth_success",
          userId: decoded.userId,
          role: decoded.role
        }));

        console.log("✅ WS authenticated:", decoded.userId, decoded.role);
        return;

      } catch (err) {
        console.error("❌ WS auth failed:", err.message);

        ws.send(JSON.stringify({
          type: "auth_error",
          message: "Invalid or expired token"
        }));

        ws.close();
        return;
      }
    }

    // ===============================
    // ❌ BLOCK UNAUTHENTICATED
    // ===============================
    if (!ws.isAuthenticated) {
      console.error("WS message before auth");
      return;
    }

    // ===============================
    // 📨 MESSAGE HANDLING
    // ===============================

    let { receiver, type, content } = data;

    const sender = ws._userId;

    if (!receiver || !type) {
      console.error("Invalid message:", data);
      return;
    }

    const payload = {
      sender,
      receiver,
      type,
      content
    };

    // --- Send to receiver ---
    if (clients[receiver]) {
      clients[receiver].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      });
    }

    // --- Echo to sender ---
    if (clients[sender]) {
      clients[sender].forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      });
    }

    // --- Save to DB ---
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