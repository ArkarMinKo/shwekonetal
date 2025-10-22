const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");
const { generateSaleId } = require("../utils/saleHistoryIdGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Helper: Get latest price
function getLatestPrice(type, callback) {
  const table = type === "buy" ? "buying_prices" : "selling_prices";
  const query = `SELECT price FROM ${table} ORDER BY date DESC, time DESC LIMIT 1`;
  db.query(query, (err, rows) => {
    if (err) return callback(err);
    callback(null, rows.length ? rows[0].price : null);
  });
}

// Create sale
function createSale(req, res) {
    const form = new formidable.IncomingForm({ multiples: true, uploadDir: UPLOAD_DIR });

    form.parse(req, (err, fields, files) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { userid, type, gold } = fields;
            if (!userid || !type || !gold) {
                res.statusCode = 400;
            return res.end(JSON.stringify({ error: "userid, type, and gold are required" }));
        }

        // First, get user level
        db.query("SELECT level FROM users WHERE id = ?", [userid], (err, rows) => {
            if (err || rows.length === 0) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "User not found" }));
            }

            const userLevel = rows[0].level;

            // Define max gold per level (string keys)
            const levelLimits = {
                level1: 120,
                level2: 240,
                level3: 600,
                level4: 1200
            };

            const maxGold = levelLimits[userLevel] || 0;

            if (type === "buy" && parseFloat(gold) > maxGold) {
                res.statusCode = 400;
                return res.end(JSON.stringify({
                    error: `Your level (${userLevel}) allows a maximum of ${maxGold} gold per purchase`
                }));
            }

            const id = generateSaleId(userid, type);

            // Get latest price
            getLatestPrice(type, (err, price) => {
                if (err || !price) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: "Could not get latest price" }));
                }

                // Handle uploaded photos
                let photoArray = [];
                const uploadedFiles = Array.isArray(files.photos) ? files.photos : [files.photos];
                uploadedFiles.forEach((file, index) => {
                    const photoName = generatePhotoName(`${id}_${index}`, file.originalFilename);
                    const newPath = path.join(UPLOAD_DIR, photoName);
                    fs.renameSync(file.filepath, newPath);
                    photoArray.push(photoName);
                });

                const sql = `
                INSERT INTO sales (id, userid, type, gold, price, photos)
                VALUES (?, ?, ?, ?, ?, ?)
                `;
                db.query(sql, [id, userid, type, gold, price, JSON.stringify(photoArray)], (err, result) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: true}));
                });
            });
        });
    });
}

function approveSale(req, res, saleId) {
    if (!saleId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "saleId is required" }));
    }

    const getSaleSql = "SELECT * FROM sales WHERE id = ?";
    db.query(getSaleSql, [saleId], (err, salesResult) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        if (salesResult.length === 0) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: "Sale not found" }));
        }

        const sale = salesResult[0];

        const updateSaleSql = "UPDATE sales SET status = 'approved' WHERE id = ?";
        db.query(updateSaleSql, [saleId], (err, updateResult) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            const getUserSql = "SELECT gold, member_point, level FROM users WHERE id = ?";
            db.query(getUserSql, [sale.userid], (err, userResult) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (userResult.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "User not found" }));
                }

                let user = userResult[0];
                let newGold = parseFloat(user.gold || 0);
                let newPoint = parseInt(user.member_point || 0);

                if (sale.type === "buy") {
                    newGold += parseFloat(sale.gold);
                } else if (sale.type === "sell") {
                    newGold -= parseFloat(sale.gold);
                    if (newGold < 0) newGold = 0;
                }

                const pointAdd = Math.floor(parseFloat(sale.gold));
                newPoint += pointAdd;

                let newLevel = "level1";
                if (newPoint >= 200) newLevel = "level4";
                else if (newPoint >= 150) newLevel = "level3";
                else if (newPoint >= 100) newLevel = "level2";

                const updateUserSql = `
                    UPDATE users 
                    SET gold = ?, member_point = ?, level = ?
                    WHERE id = ?
                `;
                db.query(updateUserSql, [newGold, newPoint, newLevel, sale.userid], (err, result) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    res.setHeader("Content-Type", "application/json");
                    res.end(
                        JSON.stringify({
                            success: true,
                            saleId,
                            saleType: sale.type,
                            status: "approved",
                        })
                    );
                });
            });
        });
    });
}


function rejectSale(req, res, saleId) {
    if (!saleId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "saleId is required" }));
    }

    const sql = "UPDATE sales SET status = 'rejected' WHERE id = ?";
    db.query(sql, [saleId], (err, result) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        if (result.affectedRows === 0) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: "Sale not found" }));
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: true, saleId, status: "rejected" }));
    });
}

function getApprovedSales(req, res) {
  const sql = "SELECT * FROM sales WHERE status = 'approved' ORDER BY created_at DESC";
  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: true, data: rows }));
  });
}

function getAllSales(req, res) {
  const sql = "SELECT * FROM sales ORDER BY created_at DESC";
  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: true, data: rows }));
  });
}

function getPendingSales(req, res) {
  const sql = "SELECT * FROM sales WHERE status = 'pending' ORDER BY created_at DESC";
  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: true, data: rows }));
  });
}

module.exports = { createSale, approveSale, rejectSale, getApprovedSales, getAllSales, getPendingSales };
