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

    const { startDate, endDate } = fields;

    if (!startDate) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Start date is required" }));
    }

    let sql;
    let params;

    if (endDate) {
      sql = `
        SELECT * FROM own_gold
        WHERE userid = ? 
        AND created_at >= ? 
        AND created_at <= ?
        ORDER BY created_at DESC
      `;
      params = [
        userid,
        startDate + " 00:00:00",
        endDate + " 23:59:59"
      ];
    } else {
      sql = `
        SELECT * FROM own_gold
        WHERE userid = ?
        AND DATE(created_at) = ?
        ORDER BY created_at DESC
      `;
      params = [
        userid,
        startDate,
      ];
    }

    db.query(sql, params, (err, results) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let total = 0;
      const formattedResults = results.map(data => {
        const profit = parseFloat(data.profit) || 0;
        total += profit;

        return {
          ...data,
          profit:
            profit > 0
              ? `+ ${profit}`
              : profit < 0
              ? `- ${Math.abs(profit)}`
              : "0"
        };
      });

      const formattedTotal =
        total > 0
          ? `+ ${total}`
          : total < 0
          ? `- ${Math.abs(total)}`
          : "0";

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          total: formattedTotal,
          data: formattedResults
        })
      );
    });
  });
}

module.exports = { getOwnGold, getFilterDate };