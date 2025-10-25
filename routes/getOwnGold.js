const db = require("../db");

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

    const formattedResults = results.map(data => {
      const profit = parseFloat(data.profit) || 0;
      let formattedtotal;
      total += profit;

      if(total > 0){
        formattedtotal = `+ ${total}` 
      }else{
        formattedtotal = `- ${total}`
      }

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

    res.statusCode = 200;
    res.end(JSON.stringify({ 
      total: formattedtotal,
      data: formattedResults
    }));
  });
}

module.exports = { getOwnGold };