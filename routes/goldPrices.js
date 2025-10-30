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

        db.query(insertSql, [server], (err) => {
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
        const updateServer = server;

        db.query(updateSql, [updateServer], (err) => {
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

        const total_profit = rows[0].gold * buying_prices / latestyway;

        // English → Myanmar number converter
        const toMyanmarNumber = (num) => {
            const map = { 0: "၀", 1: "၁", 2: "၂", 3: "၃", 4: "၄", 5: "၅", 6: "၆", 7: "၇", 8: "၈", 9: "၉", ".":"." };
            return num.toString().split("").map(d => map[d] || d).join("");
        };

        const formattedRows = rows.map((r) => {
          const goldFloat = parseFloat(r.gold);

          // convert gold to kyat-pal-yway string
          const kyat = Math.floor(goldFloat / latestyway);
          const palbyyway = goldFloat / ywaybypal;
          const pal = Math.floor(palbyyway % 16);
          const yway = (goldFloat % ywaybypal).toFixed(2);

          return {
              ...r,
              kyat: toMyanmarNumber(kyat),
              pal: toMyanmarNumber(pal),
              yway: toMyanmarNumber(yway),
          };
        });

        const totalString = `၁ ကျပ်သားပေါက်စျေး ${toMyanmarNumber(buying_prices)} ကျပ် ≈ စုစုပေါင်း ${toMyanmarNumber(total_profit)} ကျပ်`

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

// --- Get All Buying Prices (Formatted by Date & Nearest Hour Slot) ---
function getAllSellingPrices(req, res) {
  const sql = "SELECT * FROM selling_prices ORDER BY date ASC, time ASC"; // ASC for logic, DESC later
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const timeSlots = [
      "01:00", "03:00", "05:00", "07:00",
      "09:00", "11:00", "13:00", "15:00",
      "17:00", "19:00", "21:00", "23:00"
    ];

    // Group records by date
    const groupedByDate = {};
    results.forEach(row => {
      if (!groupedByDate[row.date]) groupedByDate[row.date] = [];
      groupedByDate[row.date].push(row);
    });

    // Helper to convert time "HH:MM[:SS]" → seconds
    function timeToSeconds(time) {
      const [h, m, s] = time.split(":").map(Number);
      return h * 3600 + m * 60 + (s || 0);
    }

    // Helper to iterate date range
    function getDateRange(start, end) {
      const dates = [];
      let current = new Date(start);
      const last = new Date(end);
      while (current <= last) {
        dates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }

    // Get date range
    const allDatesInDB = Object.keys(groupedByDate).sort(); // ascending
    const minDate = allDatesInDB[0];
    const maxDate = allDatesInDB[allDatesInDB.length - 1];
    const allDates = getDateRange(minDate, maxDate);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const finalOutput = {};
    let lastDateData = null;

    for (const date of allDates) {
      const rows = groupedByDate[date];
      const dateData = {};

      if (rows) {
        // Compute nearest for each slot
        timeSlots.forEach(slot => {
          const slotSec = timeToSeconds(slot + ":00");
          let nearest = null;
          let minDiff = Infinity;

          for (const r of rows) {
            const rowSec = timeToSeconds(r.time);
            const diff = Math.abs(rowSec - slotSec);
            if (diff < minDiff) {
              minDiff = diff;
              nearest = r;
            }
          }

          const displayTime = slot.replace(/^0/, "");

          // Today's future times → null
          if (date === today && slotSec > currentSec) {
            dateData[displayTime] = null;
          } else {
            dateData[displayTime] = nearest ? nearest.price : null;
          }
        });

        lastDateData = { ...dateData }; // update last known
        finalOutput[date] = dateData;
      } else {
        // No data → copy previous
        if (lastDateData) {
          finalOutput[date] = { ...lastDateData };
        }
      }
    }

    if (!finalOutput[today] && lastDateData) {
      const todayData = {};
      Object.entries(lastDateData).forEach(([slot, value]) => {
        const [h, m] = slot.split(":").map(Number);
        const slotSec = h * 3600 + m * 60;
        todayData[slot] = slotSec > currentSec ? null : value;
      });
      finalOutput[today] = todayData;
    }

    // Convert to DESC order
    const sortedDesc = Object.fromEntries(
      Object.entries(finalOutput).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(sortedDesc, null, 2));
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

// --- Get All Buying Prices (Formatted by Date & Nearest Hour Slot) ---
function getAllBuyingPrices(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date ASC, time ASC"; // ASC for logic, DESC later
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const timeSlots = [
      "01:00", "03:00", "05:00", "07:00",
      "09:00", "11:00", "13:00", "15:00",
      "17:00", "19:00", "21:00", "23:00"
    ];

    // Group records by date
    const groupedByDate = {};
    results.forEach(row => {
      if (!groupedByDate[row.date]) groupedByDate[row.date] = [];
      groupedByDate[row.date].push(row);
    });

    // Helper to convert time "HH:MM[:SS]" → seconds
    function timeToSeconds(time) {
      const [h, m, s] = time.split(":").map(Number);
      return h * 3600 + m * 60 + (s || 0);
    }

    // Helper to iterate date range
    function getDateRange(start, end) {
      const dates = [];
      let current = new Date(start);
      const last = new Date(end);
      while (current <= last) {
        dates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }

    // Get date range
    const allDatesInDB = Object.keys(groupedByDate).sort(); // ascending
    const minDate = allDatesInDB[0];
    const maxDate = allDatesInDB[allDatesInDB.length - 1];
    const allDates = getDateRange(minDate, maxDate);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const finalOutput = {};
    let lastDateData = null;

    for (const date of allDates) {
      const rows = groupedByDate[date];
      const dateData = {};

      if (rows) {
        // Compute nearest for each slot
        timeSlots.forEach(slot => {
          const slotSec = timeToSeconds(slot + ":00");
          let nearest = null;
          let minDiff = Infinity;

          for (const r of rows) {
            const rowSec = timeToSeconds(r.time);
            const diff = Math.abs(rowSec - slotSec);
            if (diff < minDiff) {
              minDiff = diff;
              nearest = r;
            }
          }

          const displayTime = slot.replace(/^0/, "");

          // Today's future times → null
          if (date === today && slotSec > currentSec) {
            dateData[displayTime] = null;
          } else {
            dateData[displayTime] = nearest ? nearest.price : null;
          }
        });

        lastDateData = { ...dateData }; // update last known
        finalOutput[date] = dateData;
      } else {
        // No data → copy previous
        if (lastDateData) {
          finalOutput[date] = { ...lastDateData };
        }
      }
    }

    // Convert to DESC order
    const sortedDesc = Object.fromEntries(
      Object.entries(finalOutput).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(sortedDesc, null, 2));
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
    getOpenStock,
    openServer
};