const db = require("../db");
const formidable = require("formidable");

function getOwnGold(req, res, userid) {
  res.setHeader("Content-Type", "application/json");

  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "userid is required" }));
  }

  const sql = "SELECT * FROM own_gold WHERE userid = ? ORDER BY created_at DESC";

  db.query(sql, [userid], (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    let total = 0;
    let formattedTotal;

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
      formattedTotal = `+ ${total}`
    }else if(total < 0){
      formattedTotal = `- ${Math.abs(total)}`
    }else{
      formattedTotal = "0"
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ 
      total: formattedTotal,
      data: formattedResults
    }));
  });
}

function getFilterDate(req, res, userid) {
  res.setHeader("Content-Type", "application/json");

  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Userid is required" }));
  }

  const form = new formidable.IncomingForm({ multiples: true });

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    let { startDate, endDate } = fields;

    if (!startDate) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Start date is required" }));
    }

    // ✅ If no endDate provided, use same as startDate
    if (!endDate) {
      endDate = startDate;
    }

    // ✅ To make sure next day 00:00:00 is excluded, add 1 day to endDate and use "<" instead of "<="
    const sql = `
      SELECT * FROM own_gold
      WHERE userid = ? 
      AND created_at >= ? 
      AND created_at < ?
      ORDER BY created_at DESC
    `;

    const start = startDate + " 00:00:00";

    // Add 1 day to endDate
    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().slice(0, 10) + " 00:00:00";

    db.query(sql, [userid, start, nextDayStr], (err, results) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let total = 0;

      const formattedResults = results.map(data => {
        const profit = parseFloat(data.profit) || 0;
        total += profit;

        const formattedProfit =
          profit > 0 ? `+ ${profit}` :
          profit < 0 ? `- ${Math.abs(profit)}` : "0";

        return { ...data, profit: formattedProfit };
      });

      const formattedTotal =
        total > 0 ? `+ ${total}` :
        total < 0 ? `- ${Math.abs(total)}` : "0";

      res.statusCode = 200;
      res.end(JSON.stringify({
        total: formattedTotal,
        data: formattedResults
      }));
    });
  });
}
function getFilterDate(req, res, userid) {
  res.setHeader("Content-Type", "application/json");

  if (!userid) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Userid is required" }));
  }

  const form = new formidable.IncomingForm({ multiples: true });

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    let { startDate, endDate } = fields;

    if (!startDate) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Start date is required" }));
    }

    // ✅ If no endDate provided, use same as startDate
    if (!endDate) {
      endDate = startDate;
    }

    // ✅ To make sure next day 00:00:00 is excluded, add 1 day to endDate and use "<" instead of "<="
    const sql = `
      SELECT * FROM own_gold
      WHERE userid = ? 
      AND created_at >= ? 
      AND created_at < ?
      ORDER BY created_at DESC
    `;

    const start = startDate + " 00:00:00";

    // Add 1 day to endDate
    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().slice(0, 10) + " 00:00:00";

    db.query(sql, [userid, start, nextDayStr], (err, results) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let total = 0;

      const formattedResults = results.map(data => {
        const profit = parseFloat(data.profit) || 0;
        total += profit;

        const formattedProfit =
          profit > 0 ? `+ ${profit}` :
          profit < 0 ? `- ${Math.abs(profit)}` : "0";

        return { ...data, profit: formattedProfit };
      });

      const formattedTotal =
        total > 0 ? `+ ${total}` :
        total < 0 ? `- ${Math.abs(total)}` : "0";

      res.statusCode = 200;
      res.end(JSON.stringify({
        total: formattedTotal,
        data: formattedResults
      }));
    });
  });
}

module.exports = { getOwnGold, getFilterDate };