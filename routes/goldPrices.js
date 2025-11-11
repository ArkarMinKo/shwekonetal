const db = require("../db");
const formidable = require("formidable");

const { sellingPriceIdGenerator, buyingPriceIdGenerator, formulaIdGenerator } = require("../utils/priceIdGenerator");

function postOpenStock(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { kyat, pal, yway } = fields;

    if (kyat === undefined || pal === undefined || yway === undefined) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Kyat, Pal and Yway are required" }));
    }

    const toEnglishNumber = (num) => {
      const map = { "၀": 0, "၁": 1, "၂": 2, "၃": 3, "၄": 4, "၅": 5, "၆": 6, "၇": 7, "၈": 8, "၉": 9, ".": "." };
      if (!num) return "0";
      return num.toString().split("").map(d => map[d] ?? d).join("");
    };

    const engKyat = parseFloat(toEnglishNumber(kyat)) || 0;
    const engPal = parseFloat(toEnglishNumber(pal)) || 0;
    const engYway = parseFloat(toEnglishNumber(yway)) || 0;

    const getLatestFormulaSql = `
      SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
    `;

    db.query(getLatestFormulaSql, (err, formulaResult) => {
      if (err) {
        console.error("Price fetch error:", err);
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      const latestyway = parseFloat(formulaResult[0]?.yway) || 128;
      const ywaybypal = latestyway / 16;

      const dataYway = engYway;
      const dataPal = engPal * ywaybypal;
      const dataKyat = engKyat * latestyway;

      let gold = dataYway + dataPal + dataKyat;
      gold = parseFloat(gold.toFixed(2));

      if (isNaN(gold)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Invalid number conversion" }));
      }

      const sql = `SELECT * FROM stock WHERE id = 1`;

      db.query(sql, (err, rows) => {
        if (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        if (rows.length === 0) {
          const insertSql = `INSERT INTO stock (gold) VALUES (?)`;
          db.query(insertSql, [gold], (err) => {
            if (err) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({
              message: "Insert gold to stock successfully",
              data: gold
            }));
          });
        } else {
          const updateSql = `UPDATE stock SET gold = ? WHERE id = 1`;
          const updateGold = parseFloat(rows[0].gold) + gold;

          db.query(updateSql, [updateGold], (err) => {
            if (err) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({
              message: "Update gold to stock successfully",
              data: updateGold.toFixed(2)
            }));
          });
        }
      });
    });
  });
}

function openServer(req, res){
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const {server} = fields;

    if (server === undefined) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Server is required" }));
    }

    const sql = `SELECT * FROM server WHERE id = 1`;

    db.query(sql, (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if(rows.length === 0){
        const insertSql = `INSERT INTO server (server) VALUES (?)`;

        db.query(insertSql, [parseInt(server)], (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            message: "Insert server to server successfully",
            data: server
          }));
        });
      }else{
        const updateSql = `UPDATE server SET server = ? WHERE id = 1`;
        const updateServer = parseInt(server);

        db.query(updateSql, [parseInt(updateServer)], (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            message: "Update server to server successfully",
            data: server
          }));
        });
      }
    })
  })
}

function getServer(req, res) {
  const sql = `SELECT * FROM server WHERE id = 1`;

  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    if (rows.length === 0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ message: "No server found" }));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      message: "Get server successfully",
      data: rows[0]
    }));
  });
}


function getOpenStock(req, res){
  const sql = `SELECT * FROM stock`;

  db.query(sql, (err,rows) => {
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

      const getLatestBuyingPrice = "SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 1"
      db.query(getLatestBuyingPrice, (err, buyingPriceResult) => {
        if (err) {
          console.error("Price fetch error:", err);
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }

        const buying_prices = parseInt(buyingPriceResult[0].price)
        
        const latestyway = parseInt(formulaResult[0]?.yway) || 128;
        const ywaybypal = latestyway / 16;

        const total_profit = parseInt(rows[0].gold * buying_prices / latestyway).toLocaleString();

        const formattedRows = rows.map((r) => {
          const goldFloat = parseFloat(r.gold);

          // convert gold to kyat-pal-yway string
          const kyat = Math.floor(goldFloat / latestyway);
          const palbyyway = goldFloat / ywaybypal;
          const pal = Math.floor(palbyyway % 16);
          const yway = (goldFloat % ywaybypal).toFixed(2);

          return {
              ...r,
              kyat: kyat.toString(),
              pal: pal.toString(),
              yway: yway,
          };
        });

        const totalString = `ပိုင်ဆိုင်မှုတန်ဖိုး = ${total_profit} ကျပ်`

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, total: totalString, data: formattedRows }));
      })
    })
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

// ✅ Utility to format date in device's local timezone: YYYY-MM-DD
function formatLocalDate(d) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
}

// --- Generic function to get all prices (buying or selling) ---
function getAllPrices(req, res, tableName) {
  const sql = `SELECT * FROM ${tableName} ORDER BY date ASC, time ASC`;
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // Normalize time format
    results = results.map(r => {
      const [h, m] = r.time.split(":");
      r.time = `${h.padStart(2, "0")}:${m}`;
      return r;
    });

    const timeSlots = [
      "01:00", "03:00", "05:00", "07:00",
      "09:00", "11:00", "13:00", "15:00",
      "17:00", "19:00", "21:00", "23:00"
    ];

    // Group by date
    const groupedByDate = {};
    results.forEach(r => {
      if (!groupedByDate[r.date]) groupedByDate[r.date] = [];
      groupedByDate[r.date].push(r);
    });

    // ✅ Get server (device) local time
    const now = new Date();
    const todayStr = formatLocalDate(now);
    const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    function timeToSeconds(t) {
      const [h, m] = t.split(":").map(Number);
      return h * 3600 + m * 60;
    }

    function lastRow(arr) {
      return arr && arr.length ? arr[arr.length - 1] : null;
    }

    const dbDates = Object.keys(groupedByDate).sort();
    const minDate = dbDates[0] || todayStr;
    const maxDate = dbDates[dbDates.length - 1] || todayStr;
    const endDate = new Date(Math.max(new Date(maxDate), now));

    const allDates = [];
    let cur = new Date(minDate);
    while (cur <= endDate) {
      allDates.push(formatLocalDate(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const finalOutput = {};
    const lastRowOverall = lastRow(results);

    allDates.forEach(date => {
      const dateData = {};
      const rows = groupedByDate[date] || [];

      // find yesterday's last record if exists
      const prevDates = Object.keys(groupedByDate).filter(d => d < date).sort();
      const prevDateWithData = prevDates.length ? prevDates[prevDates.length - 1] : null;
      const prevLast = prevDateWithData ? lastRow(groupedByDate[prevDateWithData]) : null;

      const todayHasNoData = date === todayStr && rows.length === 0;
      let lastPrice = null;

      timeSlots.forEach((slot, index) => {
        const slotSec = timeToSeconds(slot);
        const displayTime = slot.replace(/^0/, "");
        const periodStartSec = index === 0 ? 0 : timeToSeconds(timeSlots[index - 1]) + 1;

        let price = lastPrice;

        // FUTURE slots always null for today
        if (date === todayStr && slotSec > currentSec) {
          dateData[displayTime] = null;
          return;
        }

        // ✅ CASE 1: today or past with rows
        if (rows.length) {
          const periodRows = rows
            .filter(r => {
              const tSec = timeToSeconds(r.time);
              return tSec >= periodStartSec && tSec <= slotSec;
            })
            .sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));

          if (periodRows.length) {
            price = periodRows[periodRows.length - 1].price;
          } else if (lastPrice === null) {
            price = (date === todayStr ? lastRowOverall : prevLast)
              ? (date === todayStr ? lastRowOverall.price : prevLast.price)
              : null;
          }
        }

        // ✅ CASE 2: today has no data at all
        else if (date === todayStr) {
          if (slotSec <= currentSec) {
            price = prevLast ? prevLast.price : null; // use yesterday's last known price
          } else {
            price = null; // future time slots
          }
        }

        // ✅ CASE 3: old date with no data
        else {
          price = prevLast ? prevLast.price : null;
        }

        lastPrice = price;
        dateData[displayTime] = price;
      });

      finalOutput[date] = dateData;
    });

    const sortedOutput = Object.fromEntries(
      Object.entries(finalOutput).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(sortedOutput, null, 2));
  });
}

// --- Get All Selling Prices (Formatted by Date & Nearest Hour Slot) ---
function getAllSellingPrices(req, res) {
  getAllPrices(req, res, "selling_prices");
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

// --- Get All Buying Prices (Formatted by Date & Nearest Hour Slot) ---
function getAllBuyingPrices(req, res) {
  getAllPrices(req, res, "buying_prices");
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

// --- Get buying prices data ---
function getBuyingPricesData(req, res){
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

// --- Get buying prices data ---
function getSellingPricesData(req, res){
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
    getOpenStock,
    openServer,
    getServer,
    getSellingPricesData,
    getBuyingPricesData
};