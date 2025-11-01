// ✅ routes/messages.js (Final version)
const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");
const getNextImageName = require("../utils/chatImageNameGenerator");

// Ensure image upload directory exists
const IMAGE_UPLOAD_DIR = path.join(__dirname, "../chatUploads/Images");
if (!fs.existsSync(IMAGE_UPLOAD_DIR)) fs.mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });

// Create message route
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
      return res.end("Form parse error");
    }

    const sender = fields.sender;
    const receiver = fields.receiver;
    let type = fields.type;
    let content = fields.content || "";

    if (!sender || !receiver) {
      res.writeHead(400);
      return res.end("Missing sender or receiver");
    }

    // 🟩 If message is image, move file to folder
    if (type === "image" && files.file) {
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file || !file.filepath || !file.originalFilename) {
        res.writeHead(400);
        return res.end("Invalid file upload");
      }

      const ext = path.extname(file.originalFilename) || ".png";
      const newName = getNextImageName(ext);
      const newPath = path.join(IMAGE_UPLOAD_DIR, newName);

      try {
        fs.renameSync(file.filepath, newPath);
        content = `/chatUploads/Images/${newName}`; // store relative path
      } catch (err) {
        console.error("File move error:", err);
        res.writeHead(500);
        return res.end("File move failed");
      }
    }

    // Insert message record
    db.query(
      "INSERT INTO messages (sender, receiver_id, type, content) VALUES (?, ?, ?, ?)",
      [sender, receiver, type, content],
      (err, result) => {
        if (err) {
          console.error("DB Error:", err);
          res.writeHead(500);
          return res.end("DB error");
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, path: content }));
      }
    );
  });
};

// Fetch messages
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

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
    }
  );
};