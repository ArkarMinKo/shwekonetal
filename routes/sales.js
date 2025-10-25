const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");
const { generateSaleId } = require("../utils/saleHistoryIdGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");
const { generateOwnGoldId } = require("../utils/idOwnGoldGenerator");

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

        const { userid, type, gold, method, Payment_name, payment_phone } = fields;
        if (!userid || !type || !gold || !method) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "userid, type, gold and method are required" }));
        }

        const getOpenStock = `SELECT * FROM stock`;

        db.query(getOpenStock, (err, stockResult) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            const stockGold = parseFloat(stockResult[0].gold);
            const saleType = Array.isArray(type) ? type[0] : type;
            const updateStockSql = `UPDATE stock SET gold = ? WHERE id = 1`

            if(saleType === "buy" && parseFloat(gold) > stockGold){
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    error: `ရောင်းချပေးနိုင်သော ရွှေအရေအတွက်ထက် ကျော်လွန်နေသောကြောင့် ဝယ်ယူ၍ မရနိုင်ပါ`
                }));
            }
            else if(saleType === "buy" && parseFloat(gold) < stockGold){
                const updateGold = stockGold - parseFloat(gold);
                db.query(updateStockSql, updateGold, err => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }
                })
            }
            else if(saleType === "sell"){
                const updateGold = stockGold + parseFloat(gold);
                db.query(updateStockSql, updateGold, err => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }
                })
            }

            // First, get user level and gold
            db.query("SELECT level, gold AS user_gold FROM users WHERE id = ?", [userid], (err, rows) => {
                if (err || rows.length === 0) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: "User not found" }));
                }

                const userLevel = rows[0].level;
                const userGold = parseFloat(rows[0].user_gold || 0);
                const requestedGold = parseFloat(gold);

                // Define max gold per level (string keys)
                const levelLimits = {
                    level1: 120,
                    level2: 240,
                    level3: 600,
                    level4: 1200
                };

                const maxGold = levelLimits[userLevel] || 0;

                // Validation for buy
                if (saleType === "buy" && requestedGold > maxGold) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({
                        error: `သင့်အဆင့် (${userLevel}) ဖြင့် တစ်ကြိမ် အများဆုံး ${maxGold} ရွှေ ဝယ်ယူနိုင်ပါသည်`
                    }));
                }

                // Validation for sell
                if (saleType === "sell" && requestedGold > userGold) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({
                        error: `သင့်တွင် ရှိသော ရွှေပမာဏသည် ${userGold} ရွေးသာ ရှိသောကြောင့် ${requestedGold} ရွေးကို ရောင်းရန် မဖြစ်နိုင်ပါ`
                    }));
                }

                const id = generateSaleId(userid, saleType);

                getLatestPrice(saleType, (err, price) => {
                    if (err || !price) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: "Could not get latest price" }));
                    }

                    // Handle uploaded photos
                    let photoArray = [];
                    if (saleType === "buy" && files.photos) {
                        const uploadedFiles = Array.isArray(files.photos) ? files.photos : [files.photos];
                        uploadedFiles
                            .filter(f => f && f.originalFilename)
                            .forEach((file, index) => {
                                const photoName = generatePhotoName(`${id}_${index}`, file.originalFilename);
                                const newPath = path.join(UPLOAD_DIR, photoName);
                                fs.renameSync(file.filepath, newPath);
                                photoArray.push(photoName);
                            });
                    }

                    const sql = `
                        INSERT INTO sales (id, userid, type, gold, price, photos, method, payment_phone, payment_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    db.query(sql, [id, userid, saleType, requestedGold, price, JSON.stringify(photoArray), method, payment_phone || null, Payment_name || null], (err) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }
                        res.writeHead(200, { "Content-Type": "application/json" });
                        if(saleType === 'buy'){
                            res.end(JSON.stringify({ success: true, message: `‌ရွှေ ${requestedGold} ရွေးကို ဝယ်ယူပြီးပါပြီ အချက်အလက်များ စစ်ဆေးနေပါသည် ခနစောင့်ပါ` }));
                        }else{
                            res.end(JSON.stringify({ success: true, message: `ရွှေ ${requestedGold} ရွေးကို ရောင်းချခြင်းအောင်မြင်ပါသည် ငွေဖြည့်သွင်းပေးရန် ခနစောင့်ပါ` }));
                        }
                    });
                });
            });
        })
    });
}

// --- Approve Sales ---
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
        db.query(updateSaleSql, [saleId], (err) => {
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

                // Gold calculation (keep decimal)
                if (sale.type === "buy") {
                    newGold += parseFloat(sale.gold);
                    newPoint += Math.floor(parseFloat(sale.gold))
                } else if (sale.type === "sell") {
                    newGold -= parseFloat(sale.gold);
                    newPoint -= Math.floor(parseFloat(sale.gold))
                    if (newGold < 0) newGold = 0;
                    if (newPoint < 0) newPoint = 0;
                }

                // Level update logic
                let newLevel = "level1";
                if (newPoint >= 200) newLevel = "level4";
                else if (newPoint >= 150) newLevel = "level3";
                else if (newPoint >= 100) newLevel = "level2";

                const updateUserSql = `
                    UPDATE users 
                    SET gold = ?, member_point = ?, level = ?
                    WHERE id = ?
                `;
                db.query(updateUserSql, [newGold, newPoint, newLevel, sale.userid], (err) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    // ---------- OWN_GOLD LOGIC START ----------
                    if (sale.type === "buy") {
                        const ownGoldId = generateOwnGoldId(sale.userid, sale.created_at);

                        const getLatestPriceSql = `
                            SELECT price FROM selling_prices 
                            ORDER BY date DESC, time DESC 
                            LIMIT 1
                        `;

                        const getLatestFormulaSql = `
                            SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
                        `;

                        db.query(getLatestPriceSql, (err, priceResult) => {
                            if (err) {
                                console.error("Price fetch error:", err);
                                return;
                            }
                            db.query(getLatestFormulaSql, (err, formulaResult) => {
                                if (err) {
                                    console.error("Formula fetch error:", err);
                                    return;
                                }
                                const latestPrice = parseInt(priceResult[0]?.price) || 0;
                                const latestyway = parseInt(formulaResult[0]?.yway) || 128;

                                const latestYwayPrice = latestPrice / latestyway;
                                const salesYwayPrice =  sale.price / latestyway;
                                
                                const profit = (sale.gold * latestYwayPrice) - (sale.gold * salesYwayPrice);

                                const insertOwnGoldSql = `
                                    INSERT INTO own_gold (id, userid, gold, price, profit)
                                    VALUES (?, ?, ?, ?, ?)
                                `;
                                db.query(insertOwnGoldSql, [ownGoldId, sale.userid, sale.gold, sale.price, parseInt(profit)], (err) => {
                                    if (err) console.error("Insert own_gold error:", err);
                                });
                            })
                        });
                    }

                    else if (sale.type === "sell") {
                        const getOwnGoldSql = `
                            SELECT * FROM own_gold 
                            WHERE userid = ? 
                            ORDER BY created_at
                        `;
                        db.query(getOwnGoldSql, [sale.userid], (err, goldResults) => {
                            if (err) {
                                console.error("own_gold fetch error:", err);
                                return;
                            }

                            let remainingGold = parseFloat(sale.gold);

                            // Get latest selling price once
                            const getLatestPriceSql = `
                                SELECT price FROM selling_prices 
                                ORDER BY date DESC, time DESC 
                                LIMIT 1
                            `;
                            const getLatestFormulaSql = `
                                SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
                            `;
                            db.query(getLatestPriceSql, (err, priceResult) => {
                                if (err) {
                                    console.error("Price fetch error:", err);
                                    return;
                                }
                                db.query(getLatestFormulaSql, (err, formulaResult) => {
                                    if (err) {
                                        console.error("Formula fetch error:", err);
                                        return;
                                    }
                                    const latestPrice = parseInt(priceResult[0]?.price) || 0;
                                    const latestyway = parseInt(formulaResult[0]?.yway) || 128;

                                    const latestYwayPrice = latestPrice / latestyway;
                                    const salesYwayPrice =  sale.price / latestyway;

                                    for (let goldRow of goldResults) {
                                        if (remainingGold <= 0) break;

                                        let availableGold = parseFloat(goldRow.gold);
                                        let deductGold = Math.min(availableGold, remainingGold);
                                        availableGold -= deductGold;
                                        remainingGold -= deductGold;

                                        // Calculate profit for this sold portion
                                        const profit = (deductGold * latestYwayPrice) - (deductGold * salesYwayPrice);

                                        if (availableGold <= 0) {
                                            // delete if gold becomes zero
                                            const deleteSql = "DELETE FROM own_gold WHERE id = ?";
                                            db.query(deleteSql, [goldRow.id]);
                                        } else {
                                            // update remaining gold and profit
                                            const updateSql = `
                                                UPDATE own_gold 
                                                SET gold = ?, profit = ? 
                                                WHERE id = ?
                                            `;
                                            db.query(updateSql, [availableGold, parseInt(profit), goldRow.id]);
                                        }
                                    }
                                })
                            });
                        });
                    }
                    // ---------- OWN_GOLD LOGIC END ----------

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

// --- Reject Sales ---
function rejectSale(req, res, saleId) {
    if (!saleId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "saleId is required" }));
    }

    const getSaleSql = "SELECT gold, type FROM sales WHERE id = ?";
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

        const updateSaleSql = "UPDATE sales SET status = 'rejected' WHERE id = ?";
        db.query(updateSaleSql, [saleId], (err, result) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            if (result.affectedRows === 0) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ error: "Sale not found for update" }));
            }

            const getOpenStockSql = `SELECT gold FROM stock WHERE id = 1`;
            
            db.query(getOpenStockSql, (err, stockResult) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ 
                        error: "Failed to update stock after rejecting sale. Data is inconsistent.", 
                        detail: err.message 
                    }));
                }
                
                if (stockResult.length === 0) {
                     res.statusCode = 500;
                     return res.end(JSON.stringify({ 
                        error: "Stock record not found. Data is inconsistent.",
                    }));
                }

                const stockGold = parseFloat(stockResult[0].gold);
                let updateGold;

                if (sale.type === "buy") {
                    updateGold = stockGold + parseFloat(sale.gold);
                } else if (sale.type === "sell") {
                    updateGold = stockGold - parseFloat(sale.gold);
                } else {
                    // Handle unknown sale type if necessary, and skip stock update.
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    return res.end(JSON.stringify({ success: true, saleId, status: "rejected (no stock update due to unknown sale type)" }));
                }

                const updateStockSql = `UPDATE stock SET gold = ? WHERE id = 1`
                
                db.query(updateStockSql, parseFloat(updateGold), err => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ 
                            error: "Failed to update stock after rejecting sale. Data is inconsistent.", 
                            detail: err.message 
                        }));
                    }

                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ success: true, saleId, status: "rejected", stockUpdated: true }));
                });
            });
        });
    });
}

function getApprovedSales(req, res, userid) {
  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "userid is required" }));
  }

  const sql = "SELECT * FROM sales WHERE status = 'approved' AND userid = ? ORDER BY created_at DESC";

  db.query(sql, [userid], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, data: rows }));
  });
}

function getAllSales(req, res) {
  const sql = `
    SELECT s.*, u.fullname 
    FROM sales s
    LEFT JOIN users u ON s.userid = u.id
    ORDER BY s.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const getLatestFormulaSql = `
      SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
    `;

    db.query(getLatestFormulaSql, (err, formulaResult) => {
        if (err) {
            console.error("Price fetch error:", err);
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const latestyway = parseInt(formulaResult[0]?.yway) || 128;
        const ywaybypal = latestyway / 16;

        // English → Myanmar number converter
        const toMyanmarNumber = (num) => {
            const map = { 0: "၀", 1: "၁", 2: "၂", 3: "၃", 4: "၄", 5: "၅", 6: "၆", 7: "၇", 8: "၈", 9: "၉", ".":"." };
            return num.toString().split("").map(d => map[d] || d).join("");
        };

        function addDecimals(a, b, precision = 2) {
            const factor = Math.pow(10, precision); // 10^2 = 100
            return (Math.round(a * factor) + Math.round(b * factor)) / factor;
        }

        let total = 0;

        const formattedRows = rows.map((r) => {
            const goldFloat = parseFloat(r.gold);
            const basePrice = parseFloat(r.price);

            total = addDecimals(total, goldFloat, 2);

            // calculate new price
            const calculatedPrice = goldFloat * basePrice / latestyway;

            // convert gold to kyat-pal-yway string
            const kyat = Math.floor(goldFloat / latestyway);
            const palbyyway = goldFloat / ywaybypal;
            const pal = Math.floor(palbyyway % 16);
            const yway = goldFloat % ywaybypal;

            let goldString = "";
            if (kyat > 0) goldString += `${toMyanmarNumber(kyat)} ကျပ် `;
            if (pal > 0) goldString += `${toMyanmarNumber(pal)} ပဲ `;
            if (yway > 0) goldString += `${toMyanmarNumber(yway)} ရွေး`;

            if (!goldString.trim()) goldString = "၀";

            return {
            ...r,
            gold: goldString.trim(),
            price: calculatedPrice,
            yway: goldFloat
            };
        });

        // convert gold to kyat-pal-yway string
        const kyat = Math.floor(total / latestyway);
        const palbyyway = total / ywaybypal;
        const pal = Math.floor(palbyyway % 16);
        const yway = total % ywaybypal;

        let goldString = "";
        if (kyat > 0) goldString += `${toMyanmarNumber(kyat)} ကျပ် `;
        if (pal > 0) goldString += `${toMyanmarNumber(pal)} ပဲ `;
        if (yway > 0) goldString += `${toMyanmarNumber(yway)} ရွေး`;

        if (!goldString.trim()) goldString = "၀";

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, goldTotal: goldString.trim(), data: formattedRows }));
    });
  });
}

function getTimesSalesByDay(req, res) {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA"); // e.g. 2025-10-24

  const sql = `
    SELECT gold, created_at
    FROM sales
    WHERE status = 'approved'
      AND type = 'buy'
      AND DATE(created_at) = ?
  `;

  db.query(sql, [date], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // Time slots (09:00, 10:00 ... etc)
    const timeSlots = [
      "00:00", "01:00", "02:00", "03:00", "04:00",
      "05:00", "06:00", "07:00", "08:00", "09:00",
      "10:00", "11:00", "12:00", "13:00", "14:00",
      "15:00", "16:00", "17:00", "18:00", "19:00",
      "20:00", "21:00", "22:00", "23:00"
    ];

    const results = timeSlots.map(slot => ({ date: slot, value: 0 }));

    rows.forEach(row => {
      const time = new Date(row.created_at);
      const hour = time.getHours(); // 0 - 23
      const gold = parseFloat(row.gold) || 0;
      results[hour].value += gold;
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, data: results }));
  });
}

function getRejectedSales(req, res, userid) {
  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "userid is required" }));
  }

  const sql = "SELECT * FROM sales WHERE status = 'rejected' AND userid = ? ORDER BY created_at DESC";

  db.query(sql, [userid], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, data: rows }));
  });
}

function getPendingSales(req, res, userid) {
  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "userid is required" }));
  }

  const sql = "SELECT * FROM sales WHERE status = 'pending' AND userid = ? ORDER BY created_at DESC";

  db.query(sql, [userid], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, data: rows }));
  });
}

module.exports = {
        createSale,
        approveSale,
        rejectSale, 
        getApprovedSales, 
        getRejectedSales,
        getAllSales, 
        getPendingSales,
        getTimesSalesByDay
    };
