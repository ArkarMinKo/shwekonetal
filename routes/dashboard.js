const db = require("../db");
const formidable = require("formidable");

function summarys(req, res) {
    const date = new Date().toLocaleDateString("en-CA")

    const buyingPricesSql = `SELECT price FROM buying_prices ORDER BY date DESC, time DESC LIMIT 2`;
    const sellingPricesSql = `SELECT price FROM selling_prices ORDER BY date DESC, time DESC LIMIT 2`;
    const transactionsSql = `
        SELECT gold, type
        FROM sales
        WHERE status = 'approved'
        AND DATE(created_at) = ?
    `;
    const usersSql = `SELECT id, DATE(create_at) AS created_at FROM users`;
    const getLatestFormulaSql = `
        SELECT yway FROM formula ORDER BY date DESC, time DESC LIMIT 1
    `;

    db.query(buyingPricesSql, (err, buyingPricesResult) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        db.query(sellingPricesSql, (err, sellingPricesResult) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            db.query(transactionsSql, [date], (err, transactionsResult) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                db.query(usersSql, (err, usersResult) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    db.query(getLatestFormulaSql, (err, formulaResult) => {
                        if (err) {
                            console.error("Price fetch error:", err);
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }

                        if (!buyingPricesResult.length || !sellingPricesResult.length) {
                            res.statusCode = 404;
                            return res.end(JSON.stringify({ error: "Not enough price data" }));
                        }

                        const newBuyingPrice = parseInt(buyingPricesResult[0].price);
                        const oldBuyingPrice = parseInt(buyingPricesResult[1]?.price || buyingPricesResult[0].price);
                        const buyDifferentpercentage = parseFloat(((newBuyingPrice - oldBuyingPrice) / oldBuyingPrice * 100).toFixed(2));

                        const formattedBuyDifferentPercentage = buyDifferentpercentage > 0
                                                                ?  `+ ${buyDifferentpercentage} %`
                                                                : buyDifferentpercentage < 0
                                                                ? `- ${Math.abs(buyDifferentpercentage)} %`
                                                                : `0 %`
                        
                        const newSellingPrice = parseInt(sellingPricesResult[0].price);
                        const oldSellingPrice = parseInt(sellingPricesResult[1]?.price || sellingPricesResult[0].price);
                        const sellDifferentpercentage = parseFloat(((newSellingPrice - oldSellingPrice) / oldSellingPrice * 100).toFixed(2));

                        const formattedSellDifferentPercentage =
                            sellDifferentpercentage > 0
                                ? `+ ${sellDifferentpercentage} %`
                                : sellDifferentpercentage < 0
                                ? `- ${Math.abs(sellDifferentpercentage)} %`
                                : `0 %`;
                        
                        const transactionsCount = transactionsResult.length;
                        const allUserCount = usersResult.length;
                        const todayUserCount = usersResult.filter(user => user.created_at === date).length;

                        let totalBuyGold = 0;
                        let totalSellGold = 0;

                        transactionsResult.forEach(data => {
                            if(data.type === 'buy'){
                                totalBuyGold += data.gold;
                            }else if(data.type === 'sell'){
                                totalSellGold += data.gold;
                            }
                        })

                        const differentGold = parseFloat((totalSellGold - totalBuyGold).toFixed(2));
                        const dfGoldPst = Math.abs(differentGold);

                        const latestyway = parseInt(formulaResult[0]?.yway) || 128;
                        const ywaybypal = latestyway / 16;

                        // convert gold to kyat-pal-yway string
                        const kyat = Math.floor(dfGoldPst / latestyway);
                        const palbyyway = dfGoldPst / ywaybypal;
                        const pal = Math.floor(palbyyway % 16);
                        const yway = parseFloat((dfGoldPst % ywaybypal).toFixed(2));

                        let goldString = "";
                        if (kyat > 0) goldString += `${kyat} ကျပ် `;
                        if (pal > 0) goldString += `${pal} ပဲ `;
                        if (yway > 0) goldString += `${yway} ရွေး`;

                        if (!goldString.trim()) goldString = "0 ရွေး";

                        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                        res.end(JSON.stringify(
                            {
                                success: true,
                                buyingPrices: {
                                    price: newBuyingPrice,
                                    differentPercentage: formattedBuyDifferentPercentage
                                },
                                sellingPrices: {
                                    price: newSellingPrice,
                                    differentPercentage: formattedSellDifferentPercentage
                                },
                                transactions: {
                                    count: transactionsCount
                                },
                                revenueGold: {
                                    differentGold: differentGold > 0
                                                    ? `+ ${goldString}`
                                                    : differentGold < 0
                                                    ? `- ${goldString}`
                                                    : `${goldString}`
                                },
                                usersCount: {
                                    allUsers: allUserCount,
                                    todayUsers: todayUserCount > 0
                                                ? `+ ${todayUserCount}`
                                                : `0`
                                }
                            }
                        ));
                    })
                })
            })
        })
    })
}

// GET /buying-prices-chart
// GET /buying-prices-chart
function buyingPricesChart(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date ASC, time ASC";
  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // --- helpers ---
    function timeToSeconds(t) {
      const parts = t.split(":").map(Number);
      const h = parts[0] || 0, m = parts[1] || 0;
      return h * 3600 + m * 60;
    }
    function dateToEpoch(dateStr, timeStr = "00:00:00") {
      const [y, mo, d] = dateStr.split("-").map(Number);
      const [hh, mm, ss] = timeStr.split(":").map(Number);
      return new Date(y, mo - 1, d, hh || 0, mm || 0, ss || 0).getTime();
    }
    function display(slot) { return slot.replace(/^0/, ""); }

    // group by date
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    // build rowsWithEpoch for global closest fallback
    const rowsWithEpoch = rows.map(r => ({ ...r, epoch: dateToEpoch(r.date, r.time) }));

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60;

    function lastRow(rowsArr) { return rowsArr?.length ? rowsArr[rowsArr.length - 1] : null; }

    function findClosestGlobal(targetEpoch) {
      if (!rowsWithEpoch.length) return null;
      let best = rowsWithEpoch[0], bd = Math.abs(targetEpoch - best.epoch);
      for (let i = 1; i < rowsWithEpoch.length; i++) {
        const d = Math.abs(targetEpoch - rowsWithEpoch[i].epoch);
        if (d < bd) { bd = d; best = rowsWithEpoch[i]; }
      }
      return best;
    }

    // --- 1D ---
    const slots = [];
    for (let h = 1; h <= 23; h += 2) slots.push(String(h).padStart(2, "0") + ":00");

    const allDates = Object.keys(byDate).sort();
    let periodDate1D = null;
    if (byDate[todayStr]?.length) periodDate1D = todayStr;
    else {
      const prevDates = allDates.filter(d => d <= todayStr);
      periodDate1D = prevDates.length ? prevDates[prevDates.length - 1] : allDates[allDates.length - 1];
    }

    function nearestOnDate(slot, date) {
      const dateRows = byDate[date];
      if (!dateRows?.length) return null;
      const target = dateToEpoch(date, slot + ":00");
      let best = dateRows[0], bd = Math.abs(target - dateToEpoch(dateRows[0].date, dateRows[0].time));
      for (let i = 1; i < dateRows.length; i++) {
        const d = Math.abs(target - dateToEpoch(dateRows[i].date, dateRows[i].time));
        if (d < bd) { bd = d; best = dateRows[i]; }
      }
      return Number(best.price);
    }

    const price1D = slots.map(slot => {
      const slotSec = timeToSeconds(slot + ":00");
      if (periodDate1D === todayStr && slotSec > nowSeconds) return { time: display(slot), price: null };
      if (periodDate1D) {
        const p = nearestOnDate(slot, periodDate1D);
        if (p !== null) return { time: display(slot), price: p };
      }
      const targetEpoch = dateToEpoch(periodDate1D || todayStr, slot + ":00");
      const g = findClosestGlobal(targetEpoch);
      return { time: display(slot), price: g ? Number(g.price) : null };
    });

    // --- 1W ---
    const weekDates = [];
    const day = now.getDay(); // 0 Sun .. 6 Sat
    const monday = new Date(now);
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(d.toISOString().slice(0, 10));
    }
    const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    function lastPriceInRange(dates) {
      let found = null;
      for (const d of dates) if (byDate[d]?.length) found = byDate[d][byDate[d].length - 1];
      return found ? Number(found.price) : null;
    }
    const weekLast = lastPriceInRange(weekDates);

    const price1W = [];
    let carryPrev = null;
    for (let i = 0; i < 7; i++) {
      const d = weekDates[i], label = weekdayLabels[i];
      if (d > todayStr) { price1W.push({ time: label, price: null }); continue; }
      const rowsForDay = byDate[d] || [];
      if (rowsForDay.length) {
        carryPrev = Number(rowsForDay[rowsForDay.length - 1].price);
        price1W.push({ time: label, price: carryPrev });
      } else if (carryPrev !== null) {
        price1W.push({ time: label, price: carryPrev });
      } else if (weekLast !== null) {
        carryPrev = weekLast;
        price1W.push({ time: label, price: carryPrev });
      } else {
        const targetEpoch = dateToEpoch(d, "12:00:00");
        const g = findClosestGlobal(targetEpoch);
        const val = g ? Number(g.price) : null;
        price1W.push({ time: label, price: val });
        if (g) carryPrev = val;
      }
    }

    // --- 1M ---
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    function getDateRange(startStr, endStr) {
      const out = []; let cur = new Date(startStr + "T00:00:00"), end = new Date(endStr + "T00:00:00");
      while (cur <= end) { out.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
      return out;
    }
    const monthDates = getDateRange(monthStart.toISOString().slice(0,10), monthEnd.toISOString().slice(0,10));
    function weekOfMonth(dateStr) { return Math.ceil(new Date(dateStr + "T00:00:00").getDate() / 7); }
    const weeksSet = Array.from(new Set(monthDates.map(d => weekOfMonth(d)))).sort((a,b)=>a-b);

    let monthLast = null;
    for (const d of monthDates) if (byDate[d]?.length) monthLast = Number(byDate[d][byDate[d].length - 1].price);

    const weekPriceMap = {};
    let prevWeekCarry = null;
    for (const w of weeksSet) {
      const datesInW = monthDates.filter(d => weekOfMonth(d) === w);
      let lastRowInWeek = null;
      for (const d of datesInW) if (byDate[d]?.length) lastRowInWeek = byDate[d][byDate[d].length - 1];
      if (lastRowInWeek) { prevWeekCarry = Number(lastRowInWeek.price); weekPriceMap[w] = prevWeekCarry; }
      else if (prevWeekCarry !== null) { weekPriceMap[w] = prevWeekCarry; }
      else if (monthLast !== null) { weekPriceMap[w] = monthLast; prevWeekCarry = monthLast; }
      else {
        const targetDate = datesInW.length ? datesInW[0] : monthDates[0];
        const g = findClosestGlobal(dateToEpoch(targetDate, "12:00:00"));
        weekPriceMap[w] = g ? Number(g.price) : null;
        if (g) prevWeekCarry = Number(g.price);
      }
    }
    const currentWeekNum = weekOfMonth(todayStr);
    const price1M = weeksSet.map(w => (w > currentWeekNum ? { time: `Week ${w}`, price: null } : { time: `Week ${w}`, price: weekPriceMap[w] ?? null }));

    // --- 1Y ---
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const thisYear = now.getFullYear();
    let yearLast = null;
    for (const r of rows) { if (Number(r.date.split("-")[0]) === thisYear) yearLast = Number(r.price); }
    const price1Y = [];
    for (let m = 0; m < 12; m++) {
      const s = new Date(thisYear, m, 1).toISOString().slice(0,10);
      const e = new Date(thisYear, m+1, 0).toISOString().slice(0,10);
      const datesInMonth = getDateRange(s, e);
      let monthLastPrice = null;
      for (const d of datesInMonth) if (byDate[d]?.length) monthLastPrice = Number(byDate[d][byDate[d].length - 1].price);

      if (m > now.getMonth()) price1Y.push({ time: monthNames[m], price: null });
      else price1Y.push({ time: monthNames[m], price: monthLastPrice ?? yearLast ?? null });
    }

    const PRICE_DATA = { "1D": price1D, "1W": price1W, "1M": price1M, "1Y": price1Y };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(PRICE_DATA, null, 2));
  });
}

module.exports = {
    summarys,
    buyingPricesChart
};