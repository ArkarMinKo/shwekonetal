const db = require("../db");
const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
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
  db.query("SELECT * FROM users ORDER BY id DESC", (err, rows) => {
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

  const profitSql = "SELECT * FROM own_gold WHERE userid = ? ORDER BY created_at DESC";

  const serverSql = "SELECT server FROM server WHERE id = 1"
  db.query(sql, [userid], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    db.query(profitSql, userid, (err, profitResult) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      db.query(serverSql, (err, serverResult) => {
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        let server = (serverResult.length > 0 && serverResult[0].server !== undefined)
        ? serverResult[0].server
        : 1;

        let ppn = 0;
        let ppnTotal;

        const formattedResults = profitResult.map(data => {
          const profit = parseFloat(data.profit) || 0;

          ppn += profit;

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

        if(ppn > 0){
          ppnTotal = `+ ${ppn}`
        }else if(ppn < 0){
          ppnTotal = `- ${Math.abs(ppn)}`
        }else{
          ppnTotal = "0"
        }

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
          ppnTotal: ppnTotal, server: server
        };

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
      })
    });
  });
}

// --- CREATE USER ---
function createUser(req, res) {
  const form = new formidable.IncomingForm({
    multiples: false,
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    encoding: "utf-8",
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    generateId(db, async (err, id) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let photoFile = null;
      let frontFile = null;
      let backFile = null;

      // --- Base64 decode logic ---
      try {
        if (fields.photo && fields.photo.startsWith("data:image")) {
          const base64Data = fields.photo.replace(/^data:image\/\w+;base64,/, "");
          const ext = fields.photo.substring("data:image/".length, fields.photo.indexOf(";base64"));
          const photoName = generatePhotoName(id, `photo.${ext}`);
          fs.writeFileSync(path.join(UPLOAD_DIR, photoName), Buffer.from(base64Data, "base64"));
          photoFile = photoName;
        }

        if (fields.id_front_photo && fields.id_front_photo.startsWith("data:image")) {
          const base64Data = fields.id_front_photo.replace(/^data:image\/\w+;base64,/, "");
          const ext = fields.id_front_photo.substring("data:image/".length, fields.id_front_photo.indexOf(";base64"));
          const frontName = generateIdFrontPhotoName(id, `front.${ext}`);
          fs.writeFileSync(path.join(UPLOAD_DIR, frontName), Buffer.from(base64Data, "base64"));
          frontFile = frontName;
        }

        if (fields.id_back_photo && fields.id_back_photo.startsWith("data:image")) {
          const base64Data = fields.id_back_photo.replace(/^data:image\/\w+;base64,/, "");
          const ext = fields.id_back_photo.substring("data:image/".length, fields.id_back_photo.indexOf(";base64"));
          const backName = generateIdBackPhotoName(id, `back.${ext}`);
          fs.writeFileSync(path.join(UPLOAD_DIR, backName), Buffer.from(base64Data, "base64"));
          backFile = backName;
        }
      } catch (e) {
        console.error("Base64 decode error:", e);
      }

      try {
        // --- Hash password & passcode ---
        const hashedPassword = await bcrypt.hash(fields.password, 10);
        let hashedPasscode = null;

        if (fields.passcode && fields.passcode.trim() !== "") {
          hashedPasscode = await bcrypt.hash(fields.passcode, 10);
        }

        // --- Insert to DB ---
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
            hashedPassword,
            "pending",
            fields.gold || 0,
            fields.member_point || 0,
            hashedPasscode, // hashed or null
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
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: msg }));
              }
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }
            sendMail(fields.email, fields.fullname, "pending");
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ message: "အသုံးပြုသူ ဖန်တီးပြီးပါပြီ" }));
          }
        );
      } catch (hashErr) {
        console.error("Hashing error:", hashErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Password hashing failed" }));
      }
    });
  });
}

// --- Update USER ---
function updateUser(req, res, userid) {
  const id = userid;
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const data = JSON.parse(body);
      const { fullname, phone, photo } = data;

      // --- Check if user exists ---
      db.query("SELECT id, photo FROM users WHERE id=?", [id], (err, rows) => {
        if (err || rows.length === 0) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: "User not found" }));
        }

        const oldUser = rows[0];
        let photoFile = oldUser.photo;

        // --- Handle photo update (Base64 string) ---
        if (photo && photo.startsWith("data:image")) {
          // Remove old photo if exists
          if (photoFile && fs.existsSync(path.join(UPLOAD_DIR, photoFile))) {
            fs.unlinkSync(path.join(UPLOAD_DIR, photoFile));
          }

          // Extract base64 content and extension
          const matches = photo.match(/^data:(.+);base64,(.+)$/);
          const mimeType = matches[1];
          const base64Data = matches[2];
          const ext = mimeType.split("/")[1];

          // Generate filename (like your first structure)
          const photoName = generatePhotoName(id, `.${ext}`);
          fs.writeFileSync(path.join(UPLOAD_DIR, photoName), Buffer.from(base64Data, "base64"));

          // Save only filename (not full URL)
          photoFile = photoName;
        }

        // --- Update user info (fullname, phone, photo only) ---
        const sql = `
          UPDATE users 
          SET fullname=?, phone=?, photo=? 
          WHERE id=?`;

        const params = [fullname, phone, photoFile, id];

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

            const fetchedUser = rows[0]; 

            // Create the formatted user object (NOT an array)
            const user = {
              fullname: fetchedUser.fullname,
              phone: fetchedUser.phone,
              profile: `${filepath}${fetchedUser.photo}` // Assuming `filepath` is defined
            };

            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ message: "အသုံးပြုသူ ပြင်ဆင်ပြီးပါပြီ", user }));
          });
        });
      });
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON format" }));
    }
  });
}

// --- PATCH USER PASSWORD WITH OTP (using email, hashed) ---
function patchUserPasswordWithOTP(req, res) {
  const form = new formidable.IncomingForm();
  form.multiples = false;

  form.parse(req, async (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { email, password } = fields;

    if (!email || !password) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          error: "Email နဲ့ စကားဝှက် အသစ် ၂ခုလုံး ထည့်ပါ",
        })
      );
    }

    // --- Check if user exists ---
    db.query("SELECT id FROM users WHERE email=?", [email], async (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "အကောင့်မတွေ့ပါ" }));
      }

      try {
        // 🔒 Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `UPDATE users SET password=? WHERE email=?`;
        db.query(sql, [hashedPassword, email], (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({ message: "စကားဝှက် ပြောင်းလဲပြီးပါပြီ" })
          );
        });
      } catch (hashErr) {
        console.error("Password hash error:", hashErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Password hashing failed" }));
      }
    });
  });
}

// --- PATCH USER PASSWORD WITH OLD PASSWORD CHECK (hashed) ---
function patchUserPassword(req, res, userid) {
  const id = userid;
  const form = new formidable.IncomingForm();
  form.multiples = false;

  form.parse(req, async (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { old_password, new_password } = fields;

    if (!old_password || !new_password) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          error: "အဟောင်းနှင့်အသစ် စကားဝှက်နှစ်ခုလုံး ထည့်ပါ",
        })
      );
    }

    // --- Check if user exists ---
    db.query("SELECT password FROM users WHERE id=?", [id], async (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "User not found" }));
      }

      const currentPassword = rows[0].password;

      try {
        // 🔍 Compare old password (hashed check)
        const isMatch = await bcrypt.compare(old_password, currentPassword);

        if (!isMatch) {
          res.statusCode = 400;
          return res.end(
            JSON.stringify({ error: "အဟောင်းစကားဝှက် မှားနေပါသည်" })
          );
        }

        // 🔒 Hash new password
        const hashedNewPassword = await bcrypt.hash(new_password, 10);

        // --- Update to new hashed password ---
        const sql = `UPDATE users SET password=? WHERE id=?`;
        db.query(sql, [hashedNewPassword, id], (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ message: "စကားဝှက် အသစ်ပြောင်းပြီးပါပြီ" })
          );
        });
      } catch (hashErr) {
        console.error("Password update error:", hashErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Password hashing failed" }));
      }
    });
  });
}

// --- PATCH USER PASSCODE (hashed) ---
function patchUserPasscode(req, res, userid) {
  const id = userid;
  const form = new formidable.IncomingForm();
  form.multiples = false;

  form.parse(req, async (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { passcode } = fields;

    if (!passcode || passcode.trim() === "") {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "passcode အသစ် ထည့်ပါ" }));
    }

    // --- Check if user exists ---
    db.query("SELECT id FROM users WHERE id=?", [id], async (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "User not found" }));
      }

      try {
        // 🔒 Hash the new passcode before saving
        const hashedPasscode = await bcrypt.hash(passcode, 10);

        // --- Update hashed passcode only ---
        const sql = `UPDATE users SET passcode=? WHERE id=?`;
        db.query(sql, [hashedPasscode, id], (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "Passcode ပြောင်းလဲပြီးပါပြီ" }));
        });
      } catch (hashErr) {
        console.error("Hash error:", hashErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Passcode hashing failed" }));
      }
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
      return res.end(
        JSON.stringify({
          message: "Email နဲ့ Password နှစ်ခုပေါင်းဖြည့်ပေးပါအုံး",
        })
      );
    }

    db.query(
      "SELECT id, fullname, email, password, status, passcode FROM users WHERE email=?",
      [email],
      async (err, rows) => {
        if (err) {
          console.error("DB error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Server error" }));
        }

        if (rows.length === 0) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({ message: "ဒီ Email နဲ့အကောင့် မတွေ့ပါ" })
          );
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              message: "Password မှားနေပါတယ်။ ထပ်စမ်းကြည့်ပါ",
            })
          );
        }

        if (user.status !== "approved") {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              message: "သင့်အကောင့်ကို မခွင့်ပြုပေးသေးပါ။ စောင့်ပါဦး",
            })
          );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "ဝင်ရောက်မှုအောင်မြင်ပါတယ်။ ကြိုဆိုပါတယ်",
            id: user.id,
            fullname: user.fullname,
            passcode: user.passcode,
          })
        );
      }
    );
  } catch (e) {
    console.error("Login parse error:", e);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Invalid request format" }));
  }
}

// --- PATCH: Update user passcode only (hashed) ---
function updatePasscode(req, res, id) {
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { passcode } = fields;

    if (!passcode || passcode.trim() === "") {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Passcode is required" }));
    }

    try {
      // 🔒 Hash the passcode before saving
      const hashedPasscode = await bcrypt.hash(passcode, 10);

      db.query(
        "UPDATE users SET passcode=? WHERE id=?",
        [hashedPasscode, id],
        (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          db.query("SELECT * FROM users WHERE id=?", [id], (err, rows) => {
            if (err || rows.length === 0) {
              return res.end(
                JSON.stringify({
                  message: "Passcode updated, but fetch failed",
                })
              );
            }

            const user = rows[0];
            res.end(JSON.stringify({ message: "Passcode updated", user }));
          });
        }
      );
    } catch (hashErr) {
      console.error("Passcode hash error:", hashErr);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Failed to hash passcode" }));
    }
  });
}

// --- POST: Verify user's passcode (compare hash) ---
function verifyPasscode(req, res, id) {
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { passcode } = fields;

    if (!passcode || passcode.trim() === "") {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Passcode is required" }));
    }

    db.query("SELECT passcode FROM users WHERE id=?", [id], async (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ message: "User not found" }));
      }

      const userPasscode = rows[0].passcode;

      // 🔐 Compare entered passcode with hashed passcode
      const isMatch = await bcrypt.compare(passcode, userPasscode);
      res.writeHead(200, { "Content-Type": "application/json" });
      if (isMatch) {
        return res.end(JSON.stringify({ message: "Passcode မှန်ပါသည်" }));
      } else {
        res.statusCode = 401;
        return res.end(JSON.stringify({ message: "passcode မှားယွင်းနေပါသည်" }));
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
  approveUser,
  rejectUser,
  loginUser,
  updatePasscode,
  verifyPasscode,
  requestEmailConfirmation,
  verifyEmailCodeBeforeCreate,
  getUserById,
  patchUserPassword,
  patchUserPasscode,
  patchUserPasswordWithOTP
};
