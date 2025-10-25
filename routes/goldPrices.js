const db = require("../db");
const formidable = require("formidable");

const { sellingPriceIdGenerator, buyingPriceIdGenerator, formulaIdGenerator } = require("../utils/priceIdGenerator");

function postOpenStock(req, res){
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const {gold} = fields;

    if (!gold) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Gold is required" }));
    }

    const sql = `SELECT * FROM stock`;

    db.query(sql, (err,rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if(rows.length === 0) {
        const sql = `INSERT INTO stock (gold) VALUES (?)`;

        db.query(sql, gold, err => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            message: "Insert gold to stock successfully",
            data: gold
          }));
        })
      }else{
        const sql = `UPDATE stock SET gold = ? WHERE id = 1`
        let updateGold;

        updateGold = parseFloat(rows[0].gold) + parseFloat(gold);
        db.query(sql, updateGold, err => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            message: "Update gold to stock successfully",
            data: updateGold
          }));
        })
      }
    })
  })
}

function getOpenStock(req, res){
  const sql = `SELECT * FROM stock`;

  db.query(sql, (err,rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ success: true, data: rows }));
  })
}

function insertSellingPrice(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { price } = fields;

    if (!price) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Price is required" }));
    }

    // Generate ID, current date & time
    const id = sellingPriceIdGenerator();
    const now = new Date();
    const date = now.toLocaleDateString("en-CA"); // YYYY-MM-DD (Canada locale uses ISO format)
    const time = now.toLocaleTimeString("en-GB", { hour12: false }); // HH:MM:SS (24-hour)

    const sql = "INSERT INTO selling_prices (id, price, time, date) VALUES (?, ?, ?, ?)";
    const values = [id, price, time, date];

    db.query(sql, values, (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      // ---------- PROFIT UPDATE LOGIC START ----------
      const getOwnGoldSql = "SELECT * FROM own_gold";
      const getLatestFormulaSql = `
        SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
      `;
      db.query(getOwnGoldSql, (err, goldResults) => {
        if (err) {
          console.error("own_gold fetch error:", err);
          return;
        }

        db.query(getLatestFormulaSql, (err, formulaResult) => {
          if (err) {
            console.error("Formula fetch error:", err);
            return;
          }
          if (goldResults.length === 0) return;

          // Loop and update each own_gold row's profit
          goldResults.forEach((goldRow) => {
            const goldQty = parseFloat(goldRow.gold);
            const latestyway = parseInt(formulaResult[0]?.yway) || 128;

            const salesYwayPrice = goldRow.price / latestyway;
            const latestYwayPrice =  price / latestyway;

            const profit = (latestYwayPrice * goldQty) - (salesYwayPrice * goldQty);

            const updateProfitSql = `
              UPDATE own_gold
              SET profit = ?
              WHERE id = ?
            `;
            db.query(updateProfitSql, [profit, goldRow.id], (err) => {
              if (err) console.error(`Error updating profit for ${goldRow.id}:`, err);
            });
          });
        })
      });
      // ---------- PROFIT UPDATE LOGIC END ----------

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        message: "Selling price added successfully",
        id,
        price,
        time,
        date
      }));
    });
  });
}

function insertBuyingPrice(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { price } = fields;

    if (!price) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Price is required" }));
    }

    // Generate ID, current date & time
    const id = buyingPriceIdGenerator();
    // Use local timezone
    const now = new Date();
    const date = now.toLocaleDateString("en-CA"); // YYYY-MM-DD (Canada locale uses ISO format)
    const time = now.toLocaleTimeString("en-GB", { hour12: false }); // HH:MM:SS (24-hour)

    const sql = "INSERT INTO buying_prices (id, price, time, date) VALUES (?, ?, ?, ?)";
    const values = [id, price, time, date];

    db.query(sql, values, (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: "Buying price added successfully", id, price, time, date }));
    });
  });
}

// --- Insert Formula ---
function insertFormula(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { yway } = fields;

    if (!yway) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Yway is required" }));
    }

    // Generate ID, current date & time
    const id = formulaIdGenerator();
    // Use local timezone
    const now = new Date();
    const date = now.toLocaleDateString("en-CA"); // YYYY-MM-DD (Canada locale uses ISO format)
    const time = now.toLocaleTimeString("en-GB", { hour12: false }); // HH:MM:SS (24-hour)

    const sql = "INSERT INTO formula (id, yway, time, date) VALUES (?, ?, ?, ?)";
    const values = [id, yway, time, date];

    db.query(sql, values, (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: "Formula added successfully", id, yway, time, date }));
    });
  }); 
}

// --- Get All Selling Prices ---
function getAllSellingPrices(req, res) {
  const sql = "SELECT * FROM selling_prices ORDER BY date DESC, time DESC";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results));
  });
}

// --- Get Latest Selling Price ---
function getLatestSellingPrice(req, res) {
  const sql = "SELECT * FROM selling_prices ORDER BY date DESC, time DESC LIMIT 1";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(results[0] || {}));
  });
}

// --- Get All Buying Prices ---
function getAllBuyingPrices(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date DESC, time DESC";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results));
  });
}

// --- Get Latest Buying Price ---
function getLatestBuyingPrice(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 1";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results[0] || {}));
  });
}

// --- Get All Formula ---
function getAllFormula(req, res) {
  const sql = "SELECT * FROM formula ORDER BY date DESC, time DESC";

  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results));
  });
}

// --- Get Latest Formula ---
function getLatestFormula(req, res) {
  const sql = "SELECT * FROM formula ORDER BY date DESC, time DESC LIMIT 1";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results[0] || {}));
  });
}

module.exports = {
    insertSellingPrice,
    insertBuyingPrice,
    getAllBuyingPrices,
    getAllSellingPrices,
    getLatestSellingPrice,
    getLatestBuyingPrice,
    insertFormula,
    getAllFormula,
    getLatestFormula,
    postOpenStock,
    getOpenStock
};