const formidable = require("formidable");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { generateAdminId } = require("../utils/idAdminGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

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

module.exports = { createAdmin };