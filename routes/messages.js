const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");

// ===== CREATE MESSAGE =====
exports.createMessage = (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }

  const form = new formidable.IncomingForm();
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.writeHead(500);
      return res.end("Upload error");
    }

    const sender = fields.sender;
    const receiver = fields.receiver;
    const type = fields.type;
    let content = fields.content || fields.text || null;
    let image = null;

    if (!sender || !receiver || !type) {
      res.writeHead(400);
      return res.end("Missing sender, receiver or type");
    }

    // --- Handle image upload ---
    if (type === "image" && files.file) {
      const uploadDir = path.join(__dirname, "../uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const file = files.file[0] || files.file;
      const newPath = path.join(uploadDir, file.originalFilename);
      fs.renameSync(file.filepath, newPath);
      image = `/uploads/${file.originalFilename}`;
    }

    // ✅ Insert message into DB
    db.query(
      "INSERT INTO messages (sender, receiver_id, type, content, image, seen) VALUES (?, ?, ?, ?, ?, 0)",
      [sender, receiver, type, content, image],
      (err, result) => {
        if (err) {
          console.error("DB Error:", err);
          res.writeHead(500);
          return res.end("DB error");
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, messageId: result.insertId }));
      }
    );
  });
};

// ===== GET MESSAGES =====
exports.getMessages = (req, res) => {
  const userId = req.url.split("?userId=")[1];
  if (!userId) {
    res.writeHead(400);
    return res.end("Missing userId");
  }

  db.query(
    "SELECT * FROM messages WHERE (sender='admin' AND receiver_id=?) OR (sender=? AND receiver_id='admin') ORDER BY id ASC",
    [userId, userId],
    (err, rows) => {
      if (err) {
        console.error("DB Fetch Error:", err);
        res.writeHead(500);
        return res.end("DB error");
      }

      // ✅ Frontend-safe transformation
      const messages = rows.map((msg) => {
        if (msg.type === "image" && msg.image) {
          // return image path as content (frontend auto displays)
          return { ...msg, content: msg.image };
        }
        return msg;
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(messages));
    }
  );
};

// ===== MARK SEEN =====
exports.markMessagesSeen = (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { userId } = JSON.parse(body);
      if (!userId) {
        res.writeHead(400);
        return res.end("Missing userId");
      }

      db.query(
        "UPDATE messages SET seen = 1 WHERE sender = ? AND receiver_id = 'admin'",
        [userId],
        (err) => {
          if (err) {
            console.error("DB Seen Update Error:", err);
            res.writeHead(500);
            return res.end("DB error");
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        }
      );
    } catch (e) {
      console.error("Parse Error:", e);
      res.writeHead(400);
      res.end("Invalid JSON");
    }
  });
};