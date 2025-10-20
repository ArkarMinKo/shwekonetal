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

  // --- Users CRUD ---
  else if (pathName === "/users" && method === "POST") users.createUser(req, res);
  else if (pathName === "/users" && method === "GET") users.getUsers(req, res);
  else if (pathName.startsWith("/users/") && method === "GET") {
    const id = pathName.split("/")[2];
    users.getUser(req, res, id);
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