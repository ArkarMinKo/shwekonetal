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
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { sender, receiver, type } = fields;
    let content = "";

    if (type[0] === "image" && files.image) {
      const file = files.image[0]; // formidable v3+ => array
      const filePath = "/chatUploads/Images/" + file.newFilename;
      content = filePath;
    } else if (type[0] === "text") {
      content = fields.message?.[0] || "";
    } else if (type[0] === "sticker") {
      content = fields.sticker?.[0] || "";
    }

    console.log("✅ Message saved:", { sender, receiver, type, content });

    db.query(
      "INSERT INTO messages (sender, receiver_id, type, content) VALUES (?, ?, ?, ?)",
      [sender[0], receiver[0], type[0], content],
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