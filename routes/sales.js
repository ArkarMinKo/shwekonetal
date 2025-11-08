const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const bcrypt = require('bcrypt');
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

        const { userid, type, gold, method, Payment_name, payment_phone, address, deli_type} = fields;
        if (!userid || !type || !gold) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "userid, type, gold are required" }));
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
            db.query("SELECT level, member_point, gold AS user_gold FROM users WHERE id = ?", [userid], (err, rows) => {
                if (err || rows.length === 0) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: "User not found" }));
                }

                const userLevel = rows[0].level;
                const userGold = parseFloat(rows[0].user_gold || 0);
                const userPoint = parseInt(rows[0].member_point || 0);
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

                // Validation for delivery
                if (saleType === "delivery" && requestedGold > userGold) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({
                        error: `သင့်တွင် ရှိသော ရွှေပမာဏသည် ${userGold} ရွေးသာ ရှိသောကြောင့် ${requestedGold} ရွေးကို ထုတ်ယူရန် မဖြစ်နိုင်ပါ`
                    }));
                }

                if (saleType === "sell" || saleType === "delivery") {
                    let newGold = userGold - requestedGold;
                    let newPoint = userPoint - Math.round(requestedGold);
                    if (newGold < 0) newGold = 0;
                    if (newPoint < 0) newPoint = 0;

                    let newLevel = "level1";
                    if (newPoint >= 200) newLevel = "level4";
                    else if (newPoint >= 150) newLevel = "level3";
                    else if (newPoint >= 100) newLevel = "level2";

                    const updateUserSql = `
                        UPDATE users 
                        SET gold = ?, member_point = ?, level = ?
                        WHERE id = ?
                    `;
                    db.query(updateUserSql, [newGold, newPoint, newLevel, userid], (err) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }
                    });
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
                        INSERT INTO sales (id, userid, type, gold, price, photos, method, payment_phone, payment_name, address, deli_type)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    db.query(sql, [id, userid, saleType, requestedGold, price, JSON.stringify(photoArray), method || "KBZ Pay", payment_phone || null, Payment_name || null, address || null, deli_type || null], (err) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }
                        res.writeHead(200, { "Content-Type": "application/json" });
                        if(saleType === 'buy'){
                            res.end(JSON.stringify({ success: true, message: `‌ရွှေ ${requestedGold} ရွေးကို ဝယ်ယူပြီးပါပြီ အချက်အလက်များ စစ်ဆေးနေပါသည် ခနစောင့်ပါ` }));
                        }else if(saleType === 'sell'){
                            res.end(JSON.stringify({ success: true, message: `ရွှေ ${requestedGold} ရွေးကို ရောင်းချခြင်းအောင်မြင်ပါသည် ငွေဖြည့်သွင်းပေးရန် ခနစောင့်ပါ` }));
                        }else{
                            res.end(JSON.stringify({ success: true, message: `ရွှေ ${requestedGold} ရွေးကို ထုတ်ယူခြင်းအောင်မြင်ပါသည် ပို့ဆောင်ရန် စစ်ဆေးနေပါသည် ခနစောင့်ပါ` }));
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

    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields) => {
        if (err) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { deli_fees, service_fees, seller, manager } = fields;

        if (!manager) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Manager passcode is required for approved." }));
        }

        const managerStr = Array.isArray(manager) ? manager[0].toString() : manager.toString();

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

            if (sale.status === 'approved') {
                res.statusCode = 409;
                return res.end(JSON.stringify({
                    success: false,
                    message: "အရောင်းအဝယ်ကို အရင်ကတည်းက အတည်ပြုပြီးသားဖြစ်ပါတယ်။"
                }));
            }

            // ✅ Manager Passcode Check
            const getAdminSql = "SELECT name, passcode FROM admin WHERE role = 'owner' OR role = 'manager'";
            db.query(getAdminSql, async (err, admins) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                let managerName = null;
                for (const admin of admins) {
                    if (await bcrypt.compare(managerStr, admin.passcode)) {
                        managerName = admin.name;
                        break;
                    }
                }

                const updateSaleSql = `
                    UPDATE sales 
                    SET status = 'approved', seller = ?, manager = ? 
                    WHERE id = ?
                `;
                db.query(updateSaleSql, [seller || null, managerName, saleId], (err) => {
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
                            newPoint += Math.round(parseFloat(sale.gold));
                        }

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

                            if (sale.type === "delivery") {
                                if (deli_fees !== undefined && service_fees !== undefined) {
                                    const updateFeesSql = `
                                        UPDATE sales 
                                        SET deli_fees = ?, service_fees = ?
                                        WHERE id = ?
                                    `;
                                    db.query(updateFeesSql, [deli_fees, service_fees, saleId], (err) => {
                                        if (err) console.error("Delivery fees update error:", err);
                                    });
                                }
                            }

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
                                    if (err) return console.error("Price fetch error:", err);
                                    db.query(getLatestFormulaSql, (err, formulaResult) => {
                                        if (err) return console.error("Formula fetch error:", err);

                                        const latestPrice = parseInt(priceResult[0]?.price) || 0;
                                        const latestyway = parseInt(formulaResult[0]?.yway) || 128;

                                        const latestYwayPrice = latestPrice / latestyway;
                                        const salesYwayPrice = sale.price / latestyway;

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

                            else if (sale.type === "sell" || sale.type === "delivery") {
                                const getOwnGoldSql = `
                                    SELECT * FROM own_gold 
                                    WHERE userid = ? 
                                    ORDER BY created_at
                                `;
                                db.query(getOwnGoldSql, [sale.userid], (err, goldResults) => {
                                    if (err) return console.error("own_gold fetch error:", err);

                                    let remainingGold = parseFloat(sale.gold);

                                    const getLatestPriceSql = `
                                        SELECT price FROM selling_prices 
                                        ORDER BY date DESC, time DESC 
                                        LIMIT 1
                                    `;
                                    const getLatestFormulaSql = `
                                        SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
                                    `;
                                    db.query(getLatestPriceSql, (err, priceResult) => {
                                        if (err) return console.error("Price fetch error:", err);
                                        db.query(getLatestFormulaSql, (err, formulaResult) => {
                                            if (err) return console.error("Formula fetch error:", err);

                                            const latestPrice = parseInt(priceResult[0]?.price) || 0;
                                            const latestyway = parseInt(formulaResult[0]?.yway) || 128;

                                            const latestYwayPrice = latestPrice / latestyway;

                                            for (let goldRow of goldResults) {
                                                if (remainingGold <= 0) break;

                                                let availableGold = parseFloat(goldRow.gold);
                                                let deductGold = Math.min(availableGold, remainingGold);
                                                availableGold -= deductGold;
                                                remainingGold -= deductGold;

                                                const salesYwayPrice = goldRow.price / latestyway;
                                                const profit = (deductGold * latestYwayPrice) - (deductGold * salesYwayPrice);

                                                if (availableGold <= 0) {
                                                    const deleteSql = "DELETE FROM own_gold WHERE id = ?";
                                                    db.query(deleteSql, [goldRow.id]);
                                                } else {
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
        });
    });
}

// --- Reject Sales ---
function rejectSale(req, res, saleId) {
    if (!saleId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "saleId is required" }));
    }

    const form = new formidable.IncomingForm();
    form.parse(req, (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { seller, manager } = fields;

        if (!manager) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Manager passcode is required for rejection." }));
        }

        // --- Check manager passcode first ---
        const getAdminSql = "SELECT name, passcode FROM admin";
        db.query(getAdminSql, async (err, admins) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            let managerName = null;
            for (const admin of admins) {
                if (await bcrypt.compare(manager.toString(), admin.passcode)) {
                    managerName = admin.name;
                    break;
                }
            }

            const getSaleSql = "SELECT id, userid, gold, type FROM sales WHERE id = ?";
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

                // --- Update sale status to rejected and save seller + manager ---
                const updateSaleSql = `
                    UPDATE sales 
                    SET status = 'rejected', seller = ?, manager = ? 
                    WHERE id = ?
                `;
                db.query(updateSaleSql, [seller, managerName, saleId], (err, result) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    // --- SELL & DELIVERY user.gold / point / level restore logic ---
                    if (sale.type === "sell" || sale.type === "delivery") {
                        const getUserSql = "SELECT gold, member_point FROM users WHERE id = ?";
                        db.query(getUserSql, [sale.userid], (err, userResult) => {
                            if (err || userResult.length === 0) {
                                res.statusCode = 500;
                                return res.end(JSON.stringify({ error: "User fetch failed" }));
                            }

                            let user = userResult[0];
                            let newGold = parseFloat(user.gold || 0) + parseFloat(sale.gold);
                            let newPoint = parseInt(user.member_point || 0) + Math.round(parseFloat(sale.gold));

                            // Recalculate level
                            let newLevel = "level1";
                            if (newPoint >= 200) newLevel = "level4";
                            else if (newPoint >= 150) newLevel = "level3";
                            else if (newPoint >= 100) newLevel = "level2";

                            const updateUserSql = `
                                UPDATE users 
                                SET gold = ?, member_point = ?, level = ? 
                                WHERE id = ?
                            `;

                            db.query(updateUserSql, [newGold, newPoint, newLevel, sale.userid], err => {
                                if (err) {
                                    res.statusCode = 500;
                                    return res.end(JSON.stringify({ error: "Failed to update user", detail: err.message }));
                                }

                                // If SALE type → also restore stock
                                if (sale.type === "sell") {
                                    db.query("UPDATE stock SET gold = gold - ? WHERE id = 1", [parseFloat(sale.gold)], err => {
                                        if (err) {
                                            res.statusCode = 500;
                                            return res.end(JSON.stringify({ error: "Stock update failed", detail: err.message }));
                                        }
                                        return res.end(JSON.stringify({ success: true, restored: "SELL user + stock" }));
                                    });
                                } else {
                                    return res.end(JSON.stringify({ success: true, restored: "DELIVERY user only" }));
                                }
                            });
                        });
                    } 
                    else {
                        return res.end(JSON.stringify({ success: true, note: "BUY ignored (no user change)" }));
                    }
                });
            });
        });
    });
}

function getAllApprove(req, res) {
    const sql = `
        SELECT * FROM sales WHERE status = 'approved' ORDER BY created_at DESC
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

            let total = 0;

            const formattedRows = rows.map((r) => {
                const goldFloat = parseFloat(r.gold);
                const basePrice = parseFloat(r.price);

                // calculate new price
                const calculatedPrice = goldFloat * basePrice / latestyway;

                total += calculatedPrice;

                // convert gold to kyat-pal-yway string
                const kyat = Math.floor(goldFloat / latestyway);
                const palbyyway = goldFloat / ywaybypal;
                const pal = Math.floor(palbyyway % 16);
                const yway = (goldFloat % ywaybypal).toFixed(2);

                let goldString = "";
                if (kyat > 0) goldString += `${kyat} ကျပ် `;
                if (pal > 0) goldString += `${pal} ပဲ `;
                if (yway > 0) goldString += `${yway} ရွေး`;

                if (!goldString.trim()) goldString = "0";

                return {
                    ...r,
                    gold: goldString.trim(),
                    price: calculatedPrice,
                };
            });

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, data: formattedRows }));
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

        function addDecimals(a, b, precision = 2) {
            const factor = Math.pow(10, precision);
            return (Math.round(a * factor) + Math.round(b * factor)) / factor;
        }

        let total = 0;

        const formattedRows = rows.map((r) => {
            const goldFloat = parseFloat(r.gold);
            const basePrice = parseInt(r.price);

            total = addDecimals(total, goldFloat, 2);

            // calculate new price
            const calculatedPrice = goldFloat * basePrice / latestyway;

            // convert gold to kyat-pal-yway string
            const kyat = Math.floor(goldFloat / latestyway);
            const palbyyway = goldFloat / ywaybypal;
            const pal = Math.floor(palbyyway % 16);
            const yway = (goldFloat % ywaybypal).toFixed(2);

            let goldString = "";
            if (kyat > 0) goldString += `${kyat} ကျပ် `;
            if (pal > 0) goldString += `${pal} ပဲ `;
            if (yway > 0) goldString += `${yway} ရွေး`;

            if (!goldString.trim()) goldString = "0";

            return {
                ...r,
                gold: goldString.trim(),
                price: parseInt(calculatedPrice),
                basePrice: basePrice
            };
        });

        // convert gold to kyat-pal-yway string
        const kyat = Math.floor(total / latestyway);
        const palbyyway = total / ywaybypal;
        const pal = Math.floor(palbyyway % 16);
        const yway = (total % ywaybypal).toFixed(2);

        let goldString = "";
        if (kyat > 0) goldString += `${kyat} ကျပ် `;
        if (pal > 0) goldString += `${pal} ပဲ `;
        if (yway > 0) goldString += `${yway} ရွေး`;

        if (!goldString.trim()) goldString = "0";

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, goldTotal: goldString.trim(), data: formattedRows }));
    });
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

function getAllSalesByUser(req, res, userid) {
  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "userid is required" }));
  }

  const sql = "SELECT * FROM sales WHERE userid = ? ORDER BY created_at DESC";
  const buying_price_sql = `SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 1`;
  const selling_price_sql = `SELECT * FROM selling_prices ORDER BY date DESC, time DESC LIMIT 1`;
  const formula_sql = `SELECT * FROM formula ORDER BY date DESC, time DESC LIMIT 1`;

  db.query(sql, [userid], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // Run all 3 supporting queries in parallel
    db.query(buying_price_sql, (err, buyResult) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      db.query(selling_price_sql, (err, sellResult) => {
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        db.query(formula_sql, (err, formulaResult) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          const buying_price = buyResult[0]?.price || 0;
          const selling_price = sellResult[0]?.price || 0;
          const formula = formulaResult[0]?.yway || 1;

          let goldBuyTotal = 0;
          let goldSellTotal = 0;

          // Calculate totals based on type and status
          rows.forEach((item) => {
            if (item.type === "buy" && item.status === "approved") {
              goldBuyTotal += parseFloat(item.gold);
            } else if (item.type === "sell" && item.status === "approved") {
              goldSellTotal += parseFloat(item.gold);
            }
          });

          // Convert to totals using latest prices and formula
          const buyTotal = parseInt(goldBuyTotal * (buying_price / formula));
          const sellTotal = parseInt(goldSellTotal * (selling_price / formula));

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              success: true,
              buyTotal: buyTotal,
              sellTotal: sellTotal,
              data: rows,
            })
          );
        });
      });
    });
  });
}

function getDateFilterByUser(req, res, userid) {
  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "userid is required" }));
  }

  const form = new formidable.IncomingForm({ multiples: true });

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { startDate, endDate } = fields;

    if (!startDate) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Start date is required" }));
    }

    let sql, params;

    if (endDate) {
      sql = `
        SELECT * FROM sales 
        WHERE userid = ? 
        AND created_at >= ? 
        AND created_at <= ?
        ORDER BY created_at DESC
      `;
      params = [userid, startDate + " 00:00:00", endDate + " 23:59:59"];
    } else {
      sql = `
        SELECT * FROM sales 
        WHERE userid = ?
        AND DATE(created_at) = ?
        ORDER BY created_at DESC
      `;
      params = [userid, startDate];
    }

    db.query(sql, params, (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      // Subqueries for latest prices & formula
      const buying_price_sql = `SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 1`;
      const selling_price_sql = `SELECT * FROM selling_prices ORDER BY date DESC, time DESC LIMIT 1`;
      const formula_sql = `SELECT * FROM formula ORDER BY date DESC, time DESC LIMIT 1`;

      db.query(buying_price_sql, (err, buyResult) => {
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        db.query(selling_price_sql, (err, sellResult) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          db.query(formula_sql, (err, formulaResult) => {
            if (err) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }

            const buying_price = buyResult[0]?.price || 0;
            const selling_price = sellResult[0]?.price || 0;
            const formula = formulaResult[0]?.yway || 1;

            let goldBuyTotal = 0;
            let goldSellTotal = 0;

            rows.forEach((item) => {
              if (item.type === "buy" && item.status === "approved") {
                goldBuyTotal += parseFloat(item.gold);
              } else if (item.type === "sell" && item.status === "approved") {
                goldSellTotal += parseFloat(item.gold);
              }
            });

            const buyTotal = parseInt(goldBuyTotal * (buying_price / formula));
            const sellTotal = parseInt(goldSellTotal * (selling_price / formula));

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                success: true,
                buyTotal: buyTotal,
                sellTotal: sellTotal,
                data: rows,
              })
            );
          });
        });
      });
    });
  });
}

// --- From sales.js ---
function getTimesSalesByToday(req, res) {
    const date = new Date().toLocaleDateString("en-CA");

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
            const hour = time.getHours();
            const gold = parseFloat(row.gold) || 0;
            results[hour].value += gold;
        });

        // round to 2 decimals
        results.forEach(r => {
            r.value = parseFloat(r.value.toFixed(2));
        });

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ success: true, message: "Ma Noe", data: results }));
    });
}

// --- Report compare buy and sell chart ---
function compareBuyAndSellChart(req, res) {
  const sql = `
    SELECT 
      DATE(created_at) AS date, 
      type, 
      SUM(gold) AS total_gold
    FROM sales
    WHERE status = "approved"
    AND type != 'delivery'
    AND DATE(created_at) >= CURDATE() - INTERVAL 2 DAY
    GROUP BY DATE(created_at), type
    ORDER BY date DESC;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: err.message }));
    }

    // Step 1: Build date range (today, yesterday, day before)
    const dates = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }

    // Step 2: Create map for quick lookup
    const dataMap = {};
    results.forEach(row => {
      const d = row.date;
      if (!dataMap[d]) dataMap[d] = { buy: 0, sell: 0 };
      dataMap[d][row.type] = row.total_gold;
    });

    // Step 3: Final formatted data
    const finalData = dates.map(date => {
      const sell = parseFloat(dataMap[date]?.sell) || 0;
      const buy = parseFloat(dataMap[date]?.buy) || 0;
      
      return [date, parseFloat(sell), parseFloat(buy)];
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: finalData }));
  });
}

// --- Buy table ---
function buyTable(req, res){
    const sql = `
        SELECT * FROM sales WHERE type = 'buy' and status = 'approved' ORDER BY created_at DESC
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

            let priceTotal = 0;
            let goldTotal = 0;

            const formattedRows = rows.map((r) => {
                const goldFloat = parseFloat(r.gold);
                const basePrice = parseFloat(r.price);

                // calculate new price
                const calculatedPrice = goldFloat * basePrice / latestyway;

                priceTotal += calculatedPrice;
                goldTotal += goldFloat;

                // convert gold to kyat-pal-yway string
                const kyat = Math.floor(goldFloat / latestyway);
                const palbyyway = goldFloat / ywaybypal;
                const pal = Math.floor(palbyyway % 16);
                const yway = (goldFloat % ywaybypal).toFixed(2);

                let goldString = "";
                if (kyat > 0) goldString += `${kyat} ကျပ် `;
                if (pal > 0) goldString += `${pal} ပဲ `;
                if (yway > 0) goldString += `${yway} ရွေး`;

                if (!goldString.trim()) goldString = "0";

                return {
                    ...r,
                    gold: goldString.trim(),
                    price: calculatedPrice,
                };
            });

            // convert gold to kyat-pal-yway string
            const kyat = Math.floor(goldTotal / latestyway);
            const palbyyway = goldTotal / ywaybypal;
            const pal = Math.floor(palbyyway % 16);
            const yway = (goldTotal % ywaybypal).toFixed(2);

            let goldString = "";
            if (kyat > 0) goldString += `${kyat} ကျပ် `;
            if (pal > 0) goldString += `${pal} ပဲ `;
            if (yway > 0) goldString += `${yway} ရွေး`;

            if (!goldString.trim()) goldString = "0";

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, priceTotal: parseInt(priceTotal), goldTotal: goldString, data: formattedRows }));
        });
    });
}

// --- Sell table ---
function sellTable(req, res){
    const sql = `
        SELECT * FROM sales WHERE type = 'sell' and status = 'approved' ORDER BY created_at DESC
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

            let priceTotal = 0;
            let goldTotal = 0;

            const formattedRows = rows.map((r) => {
                const goldFloat = parseFloat(r.gold);
                const basePrice = parseFloat(r.price);

                // calculate new price
                const calculatedPrice = goldFloat * basePrice / latestyway;

                priceTotal += calculatedPrice;
                goldTotal += goldFloat;

                // convert gold to kyat-pal-yway string
                const kyat = Math.floor(goldFloat / latestyway);
                const palbyyway = goldFloat / ywaybypal;
                const pal = Math.floor(palbyyway % 16);
                const yway = (goldFloat % ywaybypal).toFixed(2);

                let goldString = "";
                if (kyat > 0) goldString += `${kyat} ကျပ် `;
                if (pal > 0) goldString += `${pal} ပဲ `;
                if (yway > 0) goldString += `${yway} ရွေး`;

                if (!goldString.trim()) goldString = "0";

                return {
                    ...r,
                    gold: goldString.trim(),
                    price: calculatedPrice,
                };
            });

            // convert gold to kyat-pal-yway string
            const kyat = Math.floor(goldTotal / latestyway);
            const palbyyway = goldTotal / ywaybypal;
            const pal = Math.floor(palbyyway % 16);
            const yway = (goldTotal % ywaybypal).toFixed(2);

            let goldString = "";
            if (kyat > 0) goldString += `${kyat} ကျပ် `;
            if (pal > 0) goldString += `${pal} ပဲ `;
            if (yway > 0) goldString += `${yway} ရွေး`;

            if (!goldString.trim()) goldString = "0";

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, priceTotal: parseInt(priceTotal), goldTotal: goldString, data: formattedRows }));
        });
    });
}

// --- Delivery table ---
function deliTable(req, res){
    const sql = `
        SELECT * FROM sales WHERE type = 'delivery' and status = 'approved' ORDER BY created_at DESC
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

            let goldTotal = 0;

            const formattedRows = rows.map((r) => {
                const goldFloat = parseFloat(r.gold);
                const basePrice = parseFloat(r.price);

                // calculate new price
                const calculatedPrice = goldFloat * basePrice / latestyway;

                goldTotal += goldFloat;

                // convert gold to kyat-pal-yway string
                const kyat = Math.floor(goldFloat / latestyway);
                const palbyyway = goldFloat / ywaybypal;
                const pal = Math.floor(palbyyway % 16);
                const yway = (goldFloat % ywaybypal).toFixed(2);

                let goldString = "";
                if (kyat > 0) goldString += `${kyat} ကျပ် `;
                if (pal > 0) goldString += `${pal} ပဲ `;
                if (yway > 0) goldString += `${yway} ရွေး`;

                if (!goldString.trim()) goldString = "0";

                return {
                    ...r,
                    gold: goldString.trim(),
                    price: calculatedPrice,
                };
            });

            // convert gold to kyat-pal-yway string
            const kyat = Math.floor(goldTotal / latestyway);
            const palbyyway = goldTotal / ywaybypal;
            const pal = Math.floor(palbyyway % 16);
            const yway = (goldTotal % ywaybypal).toFixed(2);

            let goldString = "";
            if (kyat > 0) goldString += `${kyat} ကျပ် `;
            if (pal > 0) goldString += `${pal} ပဲ `;
            if (yway > 0) goldString += `${yway} ရွေး`;

            if (!goldString.trim()) goldString = "0";

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, goldTotal: goldString, data: formattedRows }));
        });
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
        getAllSalesByUser,
        getDateFilterByUser,
        getTimesSalesByToday,
        getAllApprove,
        compareBuyAndSellChart,
        buyTable,
        sellTable,
        deliTable
    };
