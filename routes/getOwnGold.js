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
    console.log(results);
    results.forEach(data => {
      console.log(data.profit)
      console.log(typeof(data.profit))
      total += data.profit;
    })

    res.statusCode = 200;
    res.end(JSON.stringify({ 
      total: total,
      data: results
    }));
  });
}

module.exports = { getOwnGold };