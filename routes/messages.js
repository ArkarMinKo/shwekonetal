const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");
const getNextImageName = require("../utils/chatImageNameGenerator");

const Image_UPLOAD_DIR = path.join(__dirname, "../chatUploads/Images");
if (!fs.existsSync(Image_UPLOAD_DIR)) fs.mkdirSync(Image_UPLOAD_DIR, { recursive: true });

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
    let type = fields.type;
    let content = fields.content || fields.text || "";

    if (!sender || !receiver) {
      res.writeHead(400);
      return res.end("Missing sender or receiver");
    }

    if (type === "image" && files.file) {
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (file && file.filepath && file.originalFilename && file.size > 0) {
        const ext = path.extname(file.originalFilename) || ".png";
        const filename = getNextImageName(ext);
        const newPath = path.join(Image_UPLOAD_DIR, filename);
        try {
          fs.renameSync(file.filepath, newPath);
          content = `/chatUploads/Images/${filename}`;
        } catch (e) {
          console.error("File move error:", e);
          res.writeHead(500);
          return res.end("File save error");
        }
      } else {
        res.writeHead(400);
        return res.end("Invalid file upload");
      }
    }

    db.query(
      "INSERT INTO messages (sender, receiver_id, type, content) VALUES (?, ?, ?, ?)",
      [sender, receiver, type, content || ""],
      (err, result) => {
        if (err) {
          console.error("DB Error:", err);
          res.writeHead(500);
          return res.end("DB error");
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, messageId: result.insertId, path: content }));
      }
    );
  });
};

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
