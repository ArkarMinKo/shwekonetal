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
function buyingPricesChart(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date ASC, time ASC";
  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // --- helpers ---
    const displayTime = t => t.replace(/^0/, ''); // "09:00" -> "9:00"
    const timeToSeconds = t => {
      const [h, m] = t.split(':').map(Number);
      return h * 3600 + (m || 0) * 60;
    };
    const dateToEpoch = (d, t = "00:00:00") => {
      const [y, mo, day] = d.split('-').map(Number);
      const [h, m, s] = t.split(':').map(Number);
      return new Date(y, mo - 1, day, h || 0, m || 0, s || 0).getTime();
    };

    // --- group by date ---
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    const rowsWithEpoch = rows.map(r => ({ ...r, epoch: dateToEpoch(r.date, r.time) }));

    function findClosestGlobal(targetEpoch) {
      if (!rowsWithEpoch.length) return null;
      let best = rowsWithEpoch[0], bd = Math.abs(targetEpoch - best.epoch);
      for (let i = 1; i < rowsWithEpoch.length; i++) {
        const d = Math.abs(targetEpoch - rowsWithEpoch[i].epoch);
        if (d < bd) { bd = d; best = rowsWithEpoch[i]; }
      }
      return best;
    }

    function nearestOnDate(slot, date) {
      const dateRows = byDate[date];
      if (!dateRows || dateRows.length === 0) return null;
      const target = dateToEpoch(date, slot + ":00");
      let best = dateRows[0], bd = Math.abs(target - dateToEpoch(dateRows[0].date, dateRows[0].time));
      for (let i = 1; i < dateRows.length; i++) {
        const d = Math.abs(target - dateToEpoch(dateRows[i].date, dateRows[i].time));
        if (d < bd) { bd = d; best = dateRows[i]; }
      }
      return Number(best.price);
    }

    // --- 1D ---
    const slots1D = [];
    for (let h = 1; h <= 23; h += 2) slots1D.push(String(h).padStart(2, '0') + ":00");

    const allDates = Object.keys(byDate).sort();
    let periodDate1D = todayStr;
    if (!byDate[todayStr] || byDate[todayStr].length === 0) {
      const prevDates = allDates.filter(d => d <= todayStr);
      periodDate1D = prevDates.length ? prevDates[prevDates.length - 1] : allDates[allDates.length - 1];
    }

    const price1D = slots1D.map(slot => {
      const slotSec = timeToSeconds(slot);
      if (periodDate1D === todayStr && slotSec > nowSeconds) return { time: displayTime(slot), price: null };
      const price = nearestOnDate(slot, periodDate1D);
      return { time: displayTime(slot), price: price !== null ? price : null };
    });

    // --- 1W ---
    const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const tDay = now.getDay(); // 0=Sun..6=Sat
    const monday = new Date(now);
    monday.setDate(now.getDate() - (tDay === 0 ? 6 : tDay - 1));
    const weekDates = weekDays.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    const weekLastPrice = () => {
      for (let i = weekDates.length - 1; i >= 0; i--) {
        const d = weekDates[i];
        if (byDate[d] && byDate[d].length) return Number(byDate[d][byDate[d].length - 1].price);
      }
      return null;
    };
    let carryPrev = null;
    const price1W = weekDates.map((d, i) => {
      if (d > todayStr) return { time: weekDays[i], price: null };
      const dayRows = byDate[d] || [];
      if (dayRows.length) {
        carryPrev = Number(dayRows[dayRows.length - 1].price);
        return { time: weekDays[i], price: carryPrev };
      }
      const fallback = carryPrev || weekLastPrice();
      if (fallback !== null) { carryPrev = fallback; return { time: weekDays[i], price: fallback }; }
      return { time: weekDays[i], price: null };
    });

    // --- 1M ---
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthDates = [];
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      monthDates.push(d.toISOString().slice(0, 10));
    }
    const weekOfMonth = dateStr => Math.ceil(new Date(dateStr).getDate() / 7);
    const weeksSet = Array.from(new Set(monthDates.map(weekOfMonth))).sort((a, b) => a - b);
    let monthLast = null;
    for (const d of monthDates) if (byDate[d] && byDate[d].length) monthLast = Number(byDate[d][byDate[d].length - 1].price);

    const weekPriceMap = {};
    let prevWeekCarry = null;
    for (const w of weeksSet) {
      const datesInW = monthDates.filter(d => weekOfMonth(d) === w);
      let lastRowInWeek = null;
      for (const d of datesInW) if (byDate[d] && byDate[d].length) lastRowInWeek = byDate[d][byDate[d].length - 1];
      if (lastRowInWeek) { prevWeekCarry = Number(lastRowInWeek.price); weekPriceMap[w] = prevWeekCarry; }
      else if (prevWeekCarry !== null) weekPriceMap[w] = prevWeekCarry;
      else if (monthLast !== null) { prevWeekCarry = monthLast; weekPriceMap[w] = monthLast; }
      else weekPriceMap[w] = null;
    }

    const currentWeekNum = weekOfMonth(todayStr);
    const price1M = weeksSet.map(w => w > currentWeekNum ? { time: `Week ${w}`, price: null } : { time: `Week ${w}`, price: weekPriceMap[w] });

    // --- 1Y ---
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const thisYear = now.getFullYear();
    let yearLast = null;
    for (const r of rows) {
      if (Number(r.date.split("-")[0]) === thisYear) yearLast = Number(r.price);
    }
    const price1Y = [];
    let lastPriceY = null;
    for (let m = 0; m < 12; m++) {
      const monthStartStr = new Date(thisYear, m, 1).toISOString().slice(0,10);
      const monthEndStr = new Date(thisYear, m+1, 0).toISOString().slice(0,10);
      const datesInMonth = [];
      for (let d = new Date(monthStartStr); d <= new Date(monthEndStr); d.setDate(d.getDate() + 1)) datesInMonth.push(d.toISOString().slice(0,10));
      let monthLastPrice = null;
      for (const d of datesInMonth) if (byDate[d] && byDate[d].length) monthLastPrice = Number(byDate[d][byDate[d].length - 1].price);
      if (m > now.getMonth()) price1Y.push({ time: monthNames[m], price: null });
      else if (monthLastPrice !== null) { lastPriceY = monthLastPrice; price1Y.push({ time: monthNames[m], price: monthLastPrice }); }
      else if (lastPriceY !== null) price1Y.push({ time: monthNames[m], price: lastPriceY });
      else price1Y.push({ time: monthNames[m], price: null });
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