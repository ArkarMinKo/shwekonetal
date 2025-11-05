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
function buyingPricesChart(req, res){
  const sql = "SELECT * FROM buying_prices ORDER BY date ASC, time ASC";
  db.query(sql, (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // ---- Helpers ----
    function timeToSeconds(t) {
      const parts = t.split(":").map(Number);
      const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
      return h * 3600 + m * 60 + s;
    }
    function dateToEpochSec(dateStr, timeStr = "00:00:00") {
      // treat as local
      const [y, mo, d] = dateStr.split("-").map(Number);
      const [hh, mm, ss] = timeStr.split(":").map(Number);
      const dt = new Date(y, mo - 1, d, hh || 0, mm || 0, ss || 0);
      return Math.floor(dt.getTime() / 1000);
    }
    function displaySlot(slot) { return slot.replace(/^0/, ""); } // "09:00" -> "9:00"

    // Group rows by date
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    // Convert each row to an epoch (for global closest calculation)
    const rowsWithEpoch = rows.map(r => {
      return {
        ...r,
        epoch: dateToEpochSec(r.date, r.time)
      };
    });

    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const nowSecToday = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // --- UTIL: get last row (latest time) among rows array ---
    function lastRow(rowsArr) {
      if (!rowsArr || rowsArr.length === 0) return null;
      return rowsArr[rowsArr.length - 1];
    }

    // --- UTIL: find globally closest row to a target epoch (seconds) ---
    function findClosestGlobal(targetEpoch) {
      if (!rowsWithEpoch.length) return null;
      let best = rowsWithEpoch[0];
      let bestDiff = Math.abs(targetEpoch - best.epoch);
      for (let i = 1; i < rowsWithEpoch.length; i++) {
        const d = Math.abs(targetEpoch - rowsWithEpoch[i].epoch);
        if (d < bestDiff) { best = rowsWithEpoch[i]; bestDiff = d; }
      }
      return best;
    }

    // --- 1D: today's slots 09:00 - 17:00 ---
    const slots = [];
    for (let h = 9; h <= 17; h++) slots.push(String(h).padStart(2, "0") + ":00");

    // Helper: find nearest record for a slot within a given date's rows
    function nearestPriceForSlotOnDate(slot, date) {
      const dateRows = byDate[date];
      if (!dateRows || dateRows.length === 0) return null;
      const slotEpoch = dateToEpochSec(date, slot + ":00");
      let best = null, bestDiff = Infinity;
      for (const r of dateRows) {
        const rEpoch = dateToEpochSec(r.date, r.time);
        const diff = Math.abs(rEpoch - slotEpoch);
        if (diff < bestDiff) { best = r; bestDiff = diff; }
      }
      return best ? Number(best.price) : null;
    }

    // If today has rows use them; else use the most recent previous date that has rows
    function sourceDateFor1D() {
      if (byDate[todayStr] && byDate[todayStr].length) return todayStr;
      // find latest date < today that has rows
      const candidateDates = Object.keys(byDate).filter(d => d <= todayStr).sort();
      if (candidateDates.length) return candidateDates[candidateDates.length - 1];
      // otherwise fallback to latest date in DB
      const allDates = Object.keys(byDate).sort();
      return allDates.length ? allDates[allDates.length - 1] : null;
    }

    const chosenDateFor1D = sourceDateFor1D(); // may be null

    const price1D = slots.map(slot => {
      const slotSec = timeToSeconds(slot + ":00");
      // future compared to now for today => null
      if (chosenDateFor1D === todayStr && slotSec > nowSecToday) {
        return { time: displaySlot(slot), price: null };
      }

      // try nearest on chosenDateFor1D
      if (chosenDateFor1D) {
        const p = nearestPriceForSlotOnDate(slot, chosenDateFor1D);
        if (p !== null && p !== undefined) return { time: displaySlot(slot), price: Number(p) };
      }

      // If we got here and there's no chosenDateFor1D or no value, 
      // find a globally closest record relative to target slot on today's date (preferred)
      const targetDate = chosenDateFor1D || todayStr;
      const targetEpoch = dateToEpochSec(targetDate, slot + ":00");
      const globalClosest = findClosestGlobal(targetEpoch);
      if (globalClosest) return { time: displaySlot(slot), price: Number(globalClosest.price) };

      // no data anywhere
      return { time: displaySlot(slot), price: null };
    });

    // --- 1W: this calendar week Mon..Sun ---
    // Get dates for Monday..Sunday of current week
    function weekDatesThisWeek() {
      const today = new Date();
      const day = today.getDay(); // 0 Sun .. 6 Sat
      // compute Monday date
      const monday = new Date(today);
      const diffToMon = (day === 0 ? -6 : 1 - day); // if Sunday (0), go back 6 days
      monday.setDate(today.getDate() + diffToMon);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d.toISOString().slice(0,10));
      }
      return dates; // Mon..Sun
    }

    const weekDates = weekDatesThisWeek();
    const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

    // Get the week's last price if any
    function lastPriceInDates(datesArr) {
      // find last row among those dates (rows are asc by time)
      let found = null;
      for (const d of datesArr) {
        if (byDate[d] && byDate[d].length) found = byDate[d][byDate[d].length - 1];
      }
      return found ? Number(found.price) : null;
    }

    // Compose 1W: for each day apply fallback chain: same day -> previous day in week -> week's last -> global closest -> null
    const weekLastPrice = lastPriceInDates(weekDates);
    const price1W = [];
    let carry = null;
    for (let i = 0; i < 7; i++) {
      const d = weekDates[i];
      const label = weekdayLabels[i];
      const isFuture = d > todayStr;
      if (isFuture) {
        price1W.push({ time: label, price: null });
        continue;
      }

      const rowsForDay = byDate[d] || [];
      if (rowsForDay.length) {
        const p = Number(rowsForDay[rowsForDay.length - 1].price);
        carry = p;
        price1W.push({ time: label, price: p });
      } else {
        // fallback: previous day in week (carry), else week's last price, else global closest
        if (carry !== null) {
          price1W.push({ time: label, price: carry });
        } else if (weekLastPrice !== null) {
          price1W.push({ time: label, price: weekLastPrice });
          carry = weekLastPrice;
        } else {
          // global closest: target epoch = this day's midday
          const targetEpoch = dateToEpochSec(d, "12:00:00");
          const g = findClosestGlobal(targetEpoch);
          if (g) {
            price1W.push({ time: label, price: Number(g.price) });
            carry = Number(g.price);
          } else {
            price1W.push({ time: label, price: null });
          }
        }
      }
    }

    // --- 1M: current month grouped into Week 1..Week N ---
    const monthNow = new Date();
    const monthStart = new Date(monthNow.getFullYear(), monthNow.getMonth(), 1);
    const monthEnd = new Date(monthNow.getFullYear(), monthNow.getMonth() + 1, 0);
    function getDateRange(startStr, endStr) {
      const out = [];
      let cur = new Date(startStr + "T00:00:00");
      const end = new Date(endStr + "T00:00:00");
      while (cur <= end) {
        out.push(cur.toISOString().slice(0,10));
        cur.setDate(cur.getDate() + 1);
      }
      return out;
    }
    const monthDates = getDateRange(monthStart.toISOString().slice(0,10), monthEnd.toISOString().slice(0,10));
    function weekOfMonth(dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      return Math.ceil(d.getDate() / 7);
    }
    // determine weeks present in this month
    const weeksSet = new Set(monthDates.map(d => weekOfMonth(d)));
    const weekNums = Array.from(weeksSet).sort((a,b) => a-b); // 1..5
    // compute last price per week
    const weekPrices = [];
    let lastWeekCarry = null;
    // find month's last price if exists
    let monthLastPrice = null;
    for (const d of monthDates) {
      if (byDate[d] && byDate[d].length) monthLastPrice = Number(byDate[d][byDate[d].length - 1].price);
    }
    for (const w of weekNums) {
      // collect dates in this week
      const datesInWeek = monthDates.filter(d => weekOfMonth(d) === w);
      // gather last row in week
      let lastRowWeek = null;
      for (const d of datesInWeek) {
        if (byDate[d] && byDate[d].length) lastRowWeek = byDate[d][byDate[d].length - 1];
      }
      if (lastRowWeek) {
        lastWeekCarry = Number(lastRowWeek.price);
        weekPrices.push({ time: `Week ${w}`, price: lastWeekCarry });
      } else {
        // fallback: previous week carry, else monthLastPrice, else global closest
        if (lastWeekCarry !== null) {
          weekPrices.push({ time: `Week ${w}`, price: lastWeekCarry });
        } else if (monthLastPrice !== null) {
          weekPrices.push({ time: `Week ${w}`, price: monthLastPrice });
          lastWeekCarry = monthLastPrice;
        } else {
          // global closest target = mid-date of week (use first date of week)
          const targetDate = datesInWeek.length ? datesInWeek[0] : monthDates[0];
          const targetEpoch = dateToEpochSec(targetDate, "12:00:00");
          const g = findClosestGlobal(targetEpoch);
          if (g) {
            weekPrices.push({ time: `Week ${w}`, price: Number(g.price) });
            lastWeekCarry = Number(g.price);
          } else {
            weekPrices.push({ time: `Week ${w}`, price: null });
          }
        }
      }
    }

    // Future weeks null: determine which weeks are future
    // determine week number of today
    const todayWeekNum = weekOfMonth(todayStr);
    const price1M = weekPrices.map(wobj => {
      const wnum = Number(wobj.time.split(" ")[1]);
      // if week is after today's week => future -> null
      if (wnum > todayWeekNum) return { time: wobj.time, price: null };
      return wobj;
    });

    // --- 1Y: current year Jan..Dec ---
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const year = now.getFullYear();
    // get dates per month in this year
    function monthDateRange(y, m) {
      const start = new Date(y, m, 1).toISOString().slice(0,10);
      const end = new Date(y, m+1, 0).toISOString().slice(0,10);
      return getDateRange(start, end);
    }
    // find last price in year
    let yearLastPrice = null;
    for (const r of rows) {
      const [yStr] = r.date.split("-");
      if (Number(yStr) === year) yearLastPrice = Number(r.price);
    }
    const price1Y = [];
    for (let m = 0; m < 12; m++) {
      const dates = monthDateRange(year, m);
      let thisMonthLast = null;
      for (const d of dates) {
        if (byDate[d] && byDate[d].length) thisMonthLast = Number(byDate[d][byDate[d].length - 1].price);
      }
      if (thisMonthLast !== null) {
        // if month > current month => future -> null
        const monthIndexNow = now.getMonth();
        if (m > monthIndexNow) price1Y.push({ time: monthNames[m], price: null });
        else price1Y.push({ time: monthNames[m], price: thisMonthLast });
      } else {
        // month missing -> use year's last price (period year's last). If no year data -> null
        if (yearLastPrice !== null) {
          // future months still null
          const monthIndexNow = now.getMonth();
          if (m > monthIndexNow) price1Y.push({ time: monthNames[m], price: null });
          else price1Y.push({ time: monthNames[m], price: yearLastPrice });
        } else {
          price1Y.push({ time: monthNames[m], price: null });
        }
      }
    }

    // Build final PRICE_DATA
    const PRICE_DATA = {
      "1D": price1D,
      "1W": price1W,
      "1M": price1M,
      "1Y": price1Y
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(PRICE_DATA, null, 2));
  });
}

module.exports = {
    summarys,
    buyingPricesChart
};