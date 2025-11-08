const formidable = require("formidable");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { generateAdminId } = require("../utils/idAdminGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
// --- LOGIN ADMIN ---
function loginAdmin(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: err.message }));
    }

    const { email, password } = fields;
    const emailStr = Array.isArray(email) ? email[0] : email;
    const passwordStr = Array.isArray(password) ? password[0] : password;

    if (!emailStr || !passwordStr) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Email နဲ့ Password တို့ထည့်ပါ" }));
    }

    const sql = "SELECT id, role, password FROM admin WHERE email = ?";
    db.query(sql, [emailStr], (err, rows) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: err.message }));
      }

      if (rows.length === 0) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "ဒီ Email နဲ့အကောင့် မတွေ့ပါ" }));
      }

      const user = rows[0];

      bcrypt.compare(passwordStr, user.password, (err, isMatch) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: err.message }));
        }

        if (!isMatch) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Password မှားနေပါတယ်။ ထပ်စမ်းကြည့်ပါ" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "ဝင်ရောက်မှုအောင်မြင်ပါတယ်။ ကြိုဆိုပါတယ်။",
            id: user.id,
            role: user.role
          })
        );
      });
    });
  });
}

// --- GET ADMIN ---
function getAdmins(req, res) {
    const sql = `
        SELECT id, name, photo, email, phone, gender, role
        FROM admin WHERE id != 'A001'
        ORDER BY id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: results }));
    });
}

// GET ADMIN BY ID
function getAdminsById(req, res, id) {
    const sql = `
        SELECT id, name, photo, email, phone, gender, role
        FROM admin where id = ?
        ORDER BY id DESC
    `;

    db.query(sql, id, (err, results) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: results }));
    });
}

// --- CREATE ADMIN ---
function createAdmin(req, res) {
    const form = new formidable.IncomingForm({ multiples: false, uploadDir: UPLOAD_DIR, keepExtensions: true });

    generateAdminId(db, (idErr, newId) => {
        if (idErr) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: idErr.message }));
        }

        form.parse(req, async (err, fields, files) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            const { name, password, passcode, email, phone, gender, role } = fields;
            const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;
            const nameStr = Array.isArray(name) ? name[0] : name;
            const passwordStr = Array.isArray(password) ? password[0] : password;
            const passcodeStr = Array.isArray(passcode) ? passcode[0] : passcode;
            const emailStr = Array.isArray(email) ? email[0] : email;
            const phoneStr = Array.isArray(phone) ? phone[0] : phone;
            const genderStr = Array.isArray(gender) ? gender[0] : gender;
            const roleStr = Array.isArray(role) ? role[0] : role;

            if (roleStr === "owner") {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Owner account ဖွင့်ခွင့်မရှိပါ"
                }));
            }

            if (!name || !password || !email || !gender) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "Missing required fields" }));
            }

            try {
                // Check if email already exists
                const checkEmailSql = "SELECT email FROM admin WHERE email = ?";
                db.query(checkEmailSql, [emailStr], async (err, results) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    if (results.length > 0) {
                        res.statusCode = 409; // Conflict
                        return res.end(JSON.stringify({ error: "Email already exists" }));
                    }

                    // Hash password and passcode
                    const hashedPassword = await bcrypt.hash(passwordStr, 10);
                    const hashedPasscode = passcodeStr ? await bcrypt.hash(passcodeStr, 10) : null;

                    let photoName = null;
                    if (photoFile && photoFile.originalFilename) {
                        photoName = generatePhotoName(newId, photoFile.originalFilename);
                        const newPath = path.join(UPLOAD_DIR, photoName);
                        fs.renameSync(photoFile.filepath, newPath);
                    }

                    const insertSql = `
                        INSERT INTO admin (id, name, photo, password, passcode, email, phone, gender, role)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    db.query(
                        insertSql,
                        [
                            newId,
                            nameStr,
                            photoName,
                            hashedPassword,
                            hashedPasscode,
                            emailStr,
                            phoneStr || null,
                            genderStr,
                            roleStr || "seller",
                        ],
                        (err) => {
                            if (err) {
                                res.statusCode = 500;
                                return res.end(JSON.stringify({ error: err.message }));
                            }

                            res.statusCode = 201;
                            res.end(
                                JSON.stringify({
                                    success: true,
                                    message: "Admin created successfully",
                                    id: newId,
                                })
                            );
                        }
                    );
                });
            } catch (error) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    });
}

// --- UPDATE ADMIN INFO (EXCEPT PASSWORD, PASSCODE, EMAIL) ---
function updateAdminInfo(req, res) {
    const form = new formidable.IncomingForm({ multiples: false, uploadDir: UPLOAD_DIR, keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { strid, name, phone, gender, role } = fields;
        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;
        const id = Array.isArray(strid) ? strid[0] : strid;
        const nameStr = Array.isArray(name) ? name[0] : name;
        const phoneStr = Array.isArray(phone) ? phone[0] : phone;
        const genderStr = Array.isArray(gender) ? gender[0] : gender;
        const roleStr = Array.isArray(role) ? role[0] : role;

        try {
            // Check if admin exists
            const checkSql = "SELECT * FROM admin WHERE id = ?";
            db.query(checkSql, [id], async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "Admin not found" }));
                }

                let updatedPhoto = results[0].photo;

                if (photoFile && photoFile.size > 0) { // file ရှိလားစစ်
                    // Delete old photo
                    if (updatedPhoto) {
                        const oldPath = path.join(UPLOAD_DIR, updatedPhoto);
                        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    }

                    // Save new photo
                    const originalName = photoFile.originalFilename || photoFile.newFilename || "unknown.jpg";
                    const newPhotoName = generatePhotoName(id, originalName);
                    const newPath = path.join(UPLOAD_DIR, newPhotoName);

                    // Rename temp file to final
                    fs.renameSync(photoFile.filepath, newPath);

                    updatedPhoto = newPhotoName;
                }

                const updateSql = `
                    UPDATE admin
                    SET name = ?, phone = ?, gender = ?, role = ?, photo = ?
                    WHERE id = ?
                `;

                db.query(
                    updateSql,
                    [nameStr, phoneStr, genderStr, roleStr, updatedPhoto, id],
                    (err) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }

                        res.statusCode = 200;
                        res.end(
                            JSON.stringify({
                                success: true,
                                message: "Admin info updated successfully",
                                updated: { id, name: nameStr, phone: phoneStr, gender: genderStr, role: roleStr, photo: updatedPhoto }
                            })
                        );
                    }
                );
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- UPDATE ADMIN PASSWORD ---
function updateAdminPassword(req, res) {
    const form = new formidable.IncomingForm({ multiples: false });

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { email, password, passcode } = fields;

        if (!email || !password || !passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Email, password, and passcode are required" }));
        }

        try {
            // Get owner passcode
            const getPasscodeSql = "SELECT passcode FROM admin WHERE id = 'A001'";
            db.query(getPasscodeSql, async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "Admin not found" }));
                }

                const owner = results[0];

                // Check if passcode matches
                if (!owner.passcode) {
                    res.statusCode = 403;
                    return res.end(JSON.stringify({ error: "Passcode not set for owner" }));
                }

                const isMatch = await bcrypt.compare(passcode, owner.passcode);
                if (!isMatch) {
                    res.statusCode = 403;
                    return res.end(JSON.stringify({ error: "Passcode does not match!" }));
                }

                // Hash new password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Update password
                const updateSql = "UPDATE admin SET password = ? WHERE email = ?";
                db.query(updateSql, [hashedPassword, email], (err) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    res.statusCode = 200;
                    res.end(JSON.stringify({ success: true, message: "Password updated successfully" }));
                });
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- VERIFY ADMIN PASSCODE ---
function verifyAdminPasscode(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const passcodeField = fields.passcode;
        const passcode = Array.isArray(passcodeField) ? passcodeField[0].toString() : passcodeField.toString();

        if (!passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Passcode is required" }));
        }

        try {
            const sql = "SELECT passcode FROM admin WHERE role = 'owner' OR role = 'manager'";
            db.query(sql, async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "No admin passcodes found" }));
                }

                let matched = false;

                for (const row of results) {
                    const match = await bcrypt.compare(passcode, row.passcode);
                    if (match) {
                        matched = true;
                        break;
                    }
                }

                if (matched) {
                    res.statusCode = 200;
                    res.end(JSON.stringify({
                        success: true,
                        message: "Passcode verified successfully"
                    }));
                } else {
                    res.statusCode = 403;
                    res.end(JSON.stringify({
                        success: false,
                        message: "Invalid passcode"
                    }));
                }
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- VERIFY OWNER PASSCODE ---
function verifyOwnerPasscode(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const passcodeField = fields.passcode;
        const passcode = Array.isArray(passcodeField) ? passcodeField[0].toString() : passcodeField.toString();

        if (!passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Passcode is required" }));
        }

        try {
            const sql = "SELECT passcode FROM admin WHERE id = 'A001'";
            db.query(sql, async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "No admin passcodes found" }));
                }

                let matched = false;

                for (const row of results) {
                    const match = await bcrypt.compare(passcode, row.passcode);
                    if (match) {
                        matched = true;
                        break;
                    }
                }

                if (matched) {
                    res.statusCode = 200;
                    res.end(JSON.stringify({
                        success: true,
                        message: "Passcode verified successfully"
                    }));
                } else {
                    res.statusCode = 403;
                    res.end(JSON.stringify({
                        success: false,
                        message: "Invalid passcode"
                    }));
                }
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

module.exports = { 
    getAdmins,
    createAdmin,
    updateAdminInfo,
    updateAdminPassword,
    getAdminsById,
    loginAdmin,
    verifyAdminPasscode,
    verifyOwnerPasscode
};