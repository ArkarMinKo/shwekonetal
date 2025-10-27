const db = require("../db");
const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const { generateId } = require("../utils/idUserGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");
const { generateIdFrontPhotoName } = require("../utils/idFrontPhotoNameGenerator");
const { generateIdBackPhotoName } = require("../utils/idBackPhotoNameGenerator");
const sendMail = require("../utils/mailer");
const { generateEmailCode, getExpiryTime } = require("../utils/emailCodeGenerator");
const { saveCode, verifyCode } = require("../utils/codeStore");

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

function getUserById(req, res, userid) {
  const sql = "SELECT * FROM users WHERE id = ?";
  const openStockSql = "SELECT gold FROM stock WHERE id = 1";

  const profitSql = "SELECT * FROM own_gold WHERE userid = ? ORDER BY created_at DESC";

  db.query(sql, [userid], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    db.query(openStockSql, (err, goldResult) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      db.query(profitSql, userid, (err, profitResult) => {
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        let ppn = 0;
        let ppnTotal;

        const formattedResults = results.map(data => {
          const profit = parseFloat(data.profit) || 0;

          total += profit;

          let formattedProfit;
          if (profit > 0) {
            formattedProfit = `+ ${profit}`;
          } else if (profit < 0) {
            formattedProfit = `- ${Math.abs(profit)}`;
          } else {
            formattedProfit = "0";
          }

          return {
            ...data,
            profit: formattedProfit
          };
        });

        if(total > 0){
          ppnTotal = `+ ${total}`
        }else if(total < 0){
          ppnTotal = `- ${Math.abs(total)}`
        }else{
          ppnTotal = "0"
        }

        const openStock = goldResult[0].gold;

        if (rows.length === 0) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: "User not found" }));
        }

        const r = rows[0];

        // remove "level" word from level value
        const cleanLevel = r.level ? r.level.replace("level", "") : null;

        const result = {
          ...r,
          level: cleanLevel, // updated field
          profile: r.photo ? `${filepath}${r.photo}` : null,
          id_front: r.id_front_photo ? `${filepath}${r.id_front_photo}` : null,
          id_back: r.id_back_photo ? `${filepath}${r.id_back_photo}` : null,
          open_stock: openStock, ppnTotal: ppnTotal
        };

        res.end(JSON.stringify(result));
      })
    });
  });
}


// --- CREATE USER ---
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

    generateId(db, (err, id) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let photoFile = null;
      let frontFile = null;
      let backFile = null;

      const photo = Array.isArray(files.photo) ? files.photo[0] : files.photo;
      const front = Array.isArray(files.id_front_photo) ? files.id_front_photo[0] : files.id_front_photo;
      const back = Array.isArray(files.id_back_photo) ? files.id_back_photo[0] : files.id_back_photo;

      if (photo && photo.filepath && photo.originalFilename && photo.size > 0) {
        const photoName = generatePhotoName(id, photo.originalFilename);
        fs.renameSync(photo.filepath, path.join(UPLOAD_DIR, photoName));
        photoFile = photoName;
      }

      if (front && front.filepath && front.originalFilename && front.size > 0) {
        const frontName = generateIdFrontPhotoName(id, front.originalFilename);
        fs.renameSync(front.filepath, path.join(UPLOAD_DIR, frontName));
        frontFile = frontName;
      }

      if (back && back.filepath && back.originalFilename && back.size > 0) {
        const backName = generateIdBackPhotoName(id, back.originalFilename);
        fs.renameSync(back.filepath, path.join(UPLOAD_DIR, backName));
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
          fields.level || "level1",
          fields.promoter || "Normal",
        ],
        (err) => {
          if (err) {
            console.error("Insert error:", err);
            if (err.code === "ER_DUP_ENTRY") {
              const msg = err.message.includes("email")
                ? "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါတယ်"
                : err.message.includes("phone")
                ? "ဤ phone number သည် အသုံးပြုပြီးသား ဖြစ်ပါတယ်"
                : "ဝင်ရောက်လာသော အချက်အလက်များ ထပ်နေပါတယ်";
              res.statusCode = 400;
              res.writeHead(400, { "Content-Type": "application/json" })
              return res.end(JSON.stringify({ error: msg }));
            }
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          // Fetch full user
          db.query("SELECT * FROM users WHERE id=?", [id], (err, rows) => {
            if (err || rows.length === 0) {
              res.writeHead(203, { "Content-Type": "application/json" })
              return res.end(JSON.stringify({ message: "အသုံးပြုသူ ဖန်တီးပြီးပါပြီ သို့သော် ဆွဲယူခြင်း မအောင်မြင်ပါ" }));
            }

            const user = rows[0];
            user.profile = user.photo ? `${filepath}${user.photo}` : null;
            user.id_front = user.id_front_photo ? `${filepath}${user.id_front_photo}` : null;
            user.id_back = user.id_back_photo ? `${filepath}${user.id_back_photo}` : null;

            sendMail(
              fields.email,
              fields.fullname,
              "pending"
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "အသုံးပြုသူ ဖန်တီးပြီးပါပြီ", user }));
          });
        }
      );
    });
  });
}

// --- UPDATE USER (fullname, phone, email, photo, state, city, address, password) ---
function updateUser(req, res, userid) {
  const id = userid;
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

    // --- Check if user exists ---
    db.query("SELECT id, email, photo FROM users WHERE id=?", [id], (err, rows) => {
      if (err || rows.length === 0) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "User not found" }));
      }

      const oldUser = rows[0];
      let photoFile = oldUser.photo;

      // --- Check for duplicate email ---
      if (fields.email) {
        db.query("SELECT id FROM users WHERE email=? AND id<>?", [fields.email, id], (err, dupRows) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }
          if (dupRows.length > 0) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါတယ်" }));
          }

          // --- Handle photo update ---
          if (photo && photo.filepath && photo.originalFilename && photo.size > 0) {
            if (photoFile && fs.existsSync(path.join(UPLOAD_DIR, photoFile))) {
              fs.unlinkSync(path.join(UPLOAD_DIR, photoFile));
            }
            const photoName = generatePhotoName(id, photo.originalFilename);
            fs.renameSync(photo.filepath, path.join(UPLOAD_DIR, photoName));
            photoFile = photoName;
          }

          // --- Update user info ---
          const sql = `
            UPDATE users 
            SET fullname=?, phone=?, email=?, photo=?, 
                state=?, city=?, address=?, password=? 
            WHERE id=?`;

          const params = [
            fields.fullname,
            fields.phone,
            fields.email,
            photoFile,
            fields.state,
            fields.city,
            fields.address,
            fields.password,
            id
          ];

          db.query(sql, params, (err) => {
            if (err) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }

            // --- Fetch updated user ---
            db.query("SELECT * FROM users WHERE id=?", [id], (err, rows) => {
              if (err || rows.length === 0) {
                return res.end(JSON.stringify({ message: "User updated, but fetch failed" }));
              }

              const user = rows[0];
              user.profile = user.photo ? `${filepath}${user.photo}` : null;
              user.id_front = user.id_front_photo ? `${filepath}${user.id_front_photo}` : null;
              user.id_back = user.id_back_photo ? `${filepath}${user.id_back_photo}` : null;

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ message: "အသုံးပြုသူ ပြင်ဆင်ပြီးပါပြီ", user }));
            });
          });
        });
      } else {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Email is required" }));
      }
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
        "approved"
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
        "rejected"
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
      return res.end(JSON.stringify({ message: "Email နဲ့ Password နှစ်ခုပေါင်းဖြည့်ပေးပါအုံး" }));
    }

    db.query("SELECT id, fullname, email, password, status FROM users WHERE email=?", [email], (err, rows) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Server error" }));
      }

      if (rows.length === 0) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "ဒီ Email နဲ့အကောင့် မတွေ့ပါ" }));
      }

      const user = rows[0];

      if (user.password !== password) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Password မှားနေပါတယ်။ ထပ်စမ်းကြည့်ပါ" }));
      }
      
      if (user.status !== "approved") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "သင့်အကောင့်ကို မခွင့်ပြုပေးသေးပါ။ စောင့်ပါဦး" }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "ဝင်ရောက်မှုအောင်မြင်ပါတယ်။ ကြိုဆိုပါတယ်", id: user.id, fullname: user.fullname}));
    });
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Invalid request format" }));
  }
}

// --- PATCH: Update user passcode only ---
function updatePasscode(req, res, id) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { passcode } = fields;

    if (!passcode) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Passcode is required" }));
    }

    db.query(
      "UPDATE users SET passcode=? WHERE id=?",
      [passcode, id],
      (err) => {
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        db.query("SELECT * FROM users WHERE id=?", [id], (err, rows) => {
          if (err || rows.length === 0) {
            return res.end(JSON.stringify({ message: "Passcode updated, but fetch failed" }));
          }

          const user = rows[0];
          res.end(JSON.stringify({ message: "Passcode updated", user }));
        });
      }
    );
  });
}

// --- POST: Verify user's passcode ---
function verifyPasscode(req, res, id) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { passcode } = fields;

    if (!passcode) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Passcode is required" }));
    }

    db.query("SELECT passcode FROM users WHERE id=?", [id], (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ message: "User not found" }));
      }

      const userPasscode = rows[0].passcode;

      if (userPasscode === passcode) {
        return res.end(JSON.stringify({ message: "Passcode matched" }));
      } else {
        res.statusCode = 401;
        return res.end(JSON.stringify({ message: "Incorrect passcode" }));
      }
    });
  });
}

function requestEmailConfirmation(req, res) {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { email } = fields;
    if (!email) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ message: "Email is required" }));
    }

    const code = generateEmailCode();
    const expiresAt = getExpiryTime();
    saveCode(email, code, expiresAt);

    sendMail(
      email,
      "Customer",
      "confirmation",
      { code: `${code}`}
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "email အတည်ပြုကုဒ် ပို့ပေးလိုက်ပါပီ။ ၃ မိနစ်အတွင်း ရိုက်ထည့်ပေးပါ", email }));
  });
}

function verifyEmailCodeBeforeCreate(req, res) {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { email, code } = fields;
    if (!email || !code) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ message: "Email and code are required" }));
    }

    const result = verifyCode(email, code);
    if (!result.success) {
      res.statusCode = 400;
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: result.message }));
    }

    res.end(JSON.stringify({ message: "email " }));
  });
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  approveUser,
  rejectUser,
  loginUser,
  updatePasscode,
  verifyPasscode,
  requestEmailConfirmation,
  verifyEmailCodeBeforeCreate,
  getUserById
};
