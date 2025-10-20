const db = require("../db");
const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const { generateId } = require("../utils/idUserGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");
const { generateIdFrontPhotoName } = require("../utils/idFrontPhotoNameGenerator");
const { generateIdBackPhotoName } = require("../utils/idBackPhotoNameGenerator");
const sendMail = require("../utils/mailer");
const filepath = 'http://38.60.244.74:3000/uploads/'
// Ensure uploads folder exists
const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Get all users
function getUsers(req, res) {
  db.query("SELECT * FROM users", (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const result = rows.map((r) => ({
      ...r,
      profile: r.photo ? `${filepath}${r.photo}` : null,
      id_front: r.id_front_photo
        ? `${filepath}${r.id_front_photo}`
        : null,
      id_back: r.id_back_photo
        ? `${filepath}${r.id_back_photo}`
        : null,
    }));

    res.end(JSON.stringify(result));
  });
}

// Create new user
function createUser(req, res) {
  const form = new formidable.IncomingForm();
  form.multiples = false;
  form.uploadDir = UPLOAD_DIR;
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // generate unique ID
    generateId(db, (err, id) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let photoFile = null;
      let frontFile = null;
      let backFile = null;

      // Profile Photo
      const photo = Array.isArray(files.photo) ? files.photo[0] : files.photo;
      if (photo && photo.filepath && photo.originalFilename && photo.size > 0) {
        const photoName = generatePhotoName(id, photo.originalFilename);
        const newPath = path.join(UPLOAD_DIR, photoName);
        fs.renameSync(photo.filepath, newPath);
        photoFile = photoName;
      }

      // Front Photo
      const front = Array.isArray(files.id_front_photo)
        ? files.id_front_photo[0]
        : files.id_front_photo;
      if (front && front.filepath && front.originalFilename && front.size > 0) {
        const frontName = generateIdFrontPhotoName(id, front.originalFilename);
        const newFrontPath = path.join(UPLOAD_DIR, frontName);
        fs.renameSync(front.filepath, newFrontPath);
        frontFile = frontName;
      }

      // Back Photo
      const back = Array.isArray(files.id_back_photo)
        ? files.id_back_photo[0]
        : files.id_back_photo;
      if (back && back.filepath && back.originalFilename && back.size > 0) {
        const backName = generateIdBackPhotoName(id, back.originalFilename);
        const newBackPath = path.join(UPLOAD_DIR, backName);
        fs.renameSync(back.filepath, newBackPath);
        backFile = backName;
      }

      db.query(
        `INSERT INTO users 
        (id, fullname, gender, id_type, id_number, photo, id_front_photo, id_back_photo, email, phone, state, city, address, password, status, gold, member_point, passcode, level, promoter)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          fields.fullname,
          fields.gender,
          fields.id_type,
          fields.id_number,
          photoFile || null,
          frontFile || null,
          backFile || null,
          fields.email,
          fields.phone,
          fields.state,
          fields.city,
          fields.address,
          fields.password,
          "pending",
          fields.gold || 0,
          fields.member_point || 0,
          fields.passcode || null,
          fields.level || null,
          fields.promoter || "Normal",
        ],
        (err) => {
          if (err) {
            console.error("Server error:", err);

            if (err.code === "ER_DUP_ENTRY") {
              if (err.message.includes("email")) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "Email already exists" }));
              }
              if (err.message.includes("phone")) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "Phone number already exists" }));
              }
            }

            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          // send pending mail
          sendMail(
            fields.email,
            fields.fullname,
            "Account Pending",
            "Your account is pending approval. We’ll notify you once it’s approved."
          );

          res.end(
            JSON.stringify({
              message: "User created",
              id,
              photo: photoFile,
              id_front_photo: frontFile,
              id_back_photo: backFile,
            })
          );
        }
      );
    });
  });
}

// Update user
function updateUser(req, res) {
  const id = req.url.split("/")[2];
  const form = new formidable.IncomingForm();
  form.multiples = false;
  form.uploadDir = UPLOAD_DIR;
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const photo = Array.isArray(files.photo) ? files.photo[0] : files.photo;
    const front = Array.isArray(files.id_front_photo)
      ? files.id_front_photo[0]
      : files.id_front_photo;
    const back = Array.isArray(files.id_back_photo)
      ? files.id_back_photo[0]
      : files.id_back_photo;

    db.query("SELECT photo, id_front_photo, id_back_photo FROM users WHERE id=?", [id], (err, rows) => {
      if (err || rows.length === 0) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "User not found" }));
      }

      let photoFile = rows[0].photo;
      let frontFile = rows[0].id_front_photo;
      let backFile = rows[0].id_back_photo;

      // Replace and delete old photo
      if (photo && photo.filepath && photo.originalFilename && photo.size > 0) {
        if (photoFile && fs.existsSync(path.join(UPLOAD_DIR, photoFile))) {
          fs.unlinkSync(path.join(UPLOAD_DIR, photoFile));
        }
        const photoName = generatePhotoName(id, photo.originalFilename);
        const newPath = path.join(UPLOAD_DIR, photoName);
        fs.renameSync(photo.filepath, newPath);
        photoFile = photoName;
      }

      if (front && front.filepath && front.originalFilename && front.size > 0) {
        if (frontFile && fs.existsSync(path.join(UPLOAD_DIR, frontFile))) {
          fs.unlinkSync(path.join(UPLOAD_DIR, frontFile));
        }
        const frontName = generateIdFrontPhotoName(id, front.originalFilename);
        const newFrontPath = path.join(UPLOAD_DIR, frontName);
        fs.renameSync(front.filepath, newFrontPath);
        frontFile = frontName;
      }

      if (back && back.filepath && back.originalFilename && back.size > 0) {
        if (backFile && fs.existsSync(path.join(UPLOAD_DIR, backFile))) {
          fs.unlinkSync(path.join(UPLOAD_DIR, backFile));
        }
        const backName = generateIdBackPhotoName(id, back.originalFilename);
        const newBackPath = path.join(UPLOAD_DIR, backName);
        fs.renameSync(back.filepath, newBackPath);
        backFile = backName;
      }

      db.query(
        `UPDATE users SET fullname=?, gender=?, id_type=?, id_number=?, email=?, phone=?, state=?, city=?, address=?, password=?, status=?, gold=?, member_point=?, passcode=?, level=?, promoter=?, photo=?, id_front_photo=?, id_back_photo=? WHERE id=?`,
        [
          fields.fullname,
          fields.gender,
          fields.id_type,
          fields.id_number,
          fields.email,
          fields.phone,
          fields.state,
          fields.city,
          fields.address,
          fields.password,
          fields.status,
          fields.gold || 0,
          fields.member_point || 0,
          fields.passcode || null,
          fields.level || null,
          fields.promoter || "Normal",
          photoFile,
          frontFile,
          backFile,
          id,
        ],
        (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }
          res.end(
            JSON.stringify({
              message: "User updated",
              photo: photoFile,
              id_front_photo: frontFile,
              id_back_photo: backFile,
            })
          );
        }
      );
    });
  });
}

// Delete user
function deleteUser(req, res) {
  const id = req.url.split("/")[2];

  db.query("SELECT photo, id_front_photo, id_back_photo FROM users WHERE id=?", [id], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { photo, id_front_photo, id_back_photo } = rows[0] || {};

    db.query("DELETE FROM users WHERE id=?", [id], (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      [photo, id_front_photo, id_back_photo].forEach((file) => {
        if (file && fs.existsSync(path.join(UPLOAD_DIR, file))) {
          fs.unlinkSync(path.join(UPLOAD_DIR, file));
        }
      });

      res.end(JSON.stringify({ message: "User and photos deleted" }));
    });
  });
}

// --- approve user ---
function approveUser(req, res, idParam) {
  const id = idParam || req.url.split("/")[3];
  db.query("SELECT fullname, email FROM users WHERE id=?", [id], (err, rows) => {
    if (err || rows.length === 0)
      return res.end(JSON.stringify({ error: err ? err.message : "User not found" }));

    const { fullname, email } = rows[0];

    db.query("UPDATE users SET status='approved' WHERE id=?", [id], (err) => {
      if (err) return res.end(JSON.stringify({ error: err.message }));

      sendMail(
        email,
        fullname,
        "Account Approved",
        `Your account has been approved. You can now login to Shwe Kone Tal application.`
      );

      res.end(JSON.stringify({ message: "User approved" }));
    });
  });
}

// --- reject user ---
function rejectUser(req, res, idParam) {
  const id = idParam || req.url.split("/")[3];
  db.query("SELECT fullname, email FROM users WHERE id=?", [id], (err, rows) => {
    if (err || rows.length === 0)
      return res.end(JSON.stringify({ error: err ? err.message : "User not found" }));

    const { fullname, email } = rows[0];

    db.query("UPDATE users SET status='rejected' WHERE id=?", [id], (err) => {
      if (err) return res.end(JSON.stringify({ error: err.message }));

      sendMail(
        email,
        fullname,
        "Account Rejected",
        `We regret to inform you that your account request has been rejected. Please contact support if you believe this was a mistake.`
      );

      res.end(JSON.stringify({ message: "User rejected" }));
    });
  });
}

// --- LOGIN USER ---
function loginUser(req, res, body) {
  try {
    const { email, password } = JSON.parse(body);

    if (!email || !password) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Email and password are required" }));
    }

    db.query("SELECT id, email, password, status FROM users WHERE email=?", [email], (err, rows) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Server error" }));
      }

      if (rows.length === 0) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Email not found" }));
      }

      const user = rows[0];

      if (user.status !== "approved") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Account not approved" }));
      }

      if (user.password !== password) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Incorrect password" }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Login successful", user }));
    });
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Invalid request format" }));
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  approveUser,
  rejectUser,
  loginUser,
};
