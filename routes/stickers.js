const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");

const STICKER_UPLOAD_DIR = path.join(__dirname, "../chatUploads/Stickers");
fs.mkdirSync(STICKER_UPLOAD_DIR, { recursive: true });

exports.uploadSticker = (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const form = new formidable.IncomingForm();
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Upload failed" }));
    }

    const file = files.file;

    if (!file) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing file" }));
    }

    // Get temp path & original filename
    const oldPath = Array.isArray(file) ? file[0].filepath : file.filepath;
    const originalName = Array.isArray(file) ? file[0].originalFilename : file.originalFilename;

    // Add extension
    const ext = path.extname(originalName) || ".png"; // default to .png
    const filename = `${Date.now()}${ext}`;
    const newPath = path.join(STICKER_UPLOAD_DIR, filename);

    // Move file from temp to upload folder
    fs.rename(oldPath, newPath, (err) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "File move failed" }));
      }

      const fileUrl = `/chatUploads/Stickers/${filename}`;

      // Generate sticker name automatically
      db.query("SELECT COUNT(*) AS count FROM stickers", (err, rows) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "DB query failed" }));
        }

        const count = rows[0].count || 0;
        const stickerName = `sticker${count + 1}`;

        // Save to database
        db.query("INSERT INTO stickers (name, url) VALUES (?, ?)", [stickerName, fileUrl], (err) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "DB insert failed" }));
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, url: fileUrl, name: stickerName }));
        });
      });
    });
  });
};

exports.getStickers = (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  db.query("SELECT * FROM stickers ORDER BY id DESC", (err, rows) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (err) return res.end(JSON.stringify({ error: "DB fetch failed" }));
    res.end(JSON.stringify(rows));
  });
};