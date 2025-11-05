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

    // --- helpers ---
    function timeToSeconds(t) {
      const parts = t.split(":").map(Number);
      const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
      return h*3600 + m*60 + s;
    }
    function dateToEpoch(dateStr, timeStr="00:00:00") {
      const [y,mo,d] = dateStr.split("-").map(Number);
      const [hh,mm,ss] = timeStr.split(":").map(Number);
      return new Date(y, mo-1, d, hh||0, mm||0, ss||0).getTime();
    }
    function display(slot){ return slot.replace(/^0/,""); } // "09:00"->"9:00"

    // group by date (rows already asc by time from SQL)
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    // build rowsWithEpoch for global closest fallback
    const rowsWithEpoch = rows.map(r => ({...r, epoch: dateToEpoch(r.date, r.time)}));

    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const nowSeconds = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();

    // --- utility functions ---
    function lastRow(rowsArr){ if(!rowsArr||rowsArr.length===0) return null; return rowsArr[rowsArr.length-1]; }
    function findClosestGlobal(targetEpoch){
      if(!rowsWithEpoch.length) return null;
      let best = rowsWithEpoch[0], bd = Math.abs(targetEpoch - best.epoch);
      for(let i=1;i<rowsWithEpoch.length;i++){
        const d = Math.abs(targetEpoch - rowsWithEpoch[i].epoch);
        if(d < bd){ bd = d; best = rowsWithEpoch[i]; }
      }
      return best;
    }

    // --- 1D ---
    const slots = [];
    for(let h=9; h<=17; h++) slots.push(String(h).padStart(2,"0") + ":00");

    // find the "period" date for 1D: if today has any rows use today, else the most recent date before or equal to today that has rows; else last date in DB if any
    const allDates = Object.keys(byDate).sort();
    let periodDate1D = null;
    if(byDate[todayStr] && byDate[todayStr].length) periodDate1D = todayStr;
    else {
      const prevDates = allDates.filter(d => d <= todayStr);
      if(prevDates.length) periodDate1D = prevDates[prevDates.length-1];
      else if(allDates.length) periodDate1D = allDates[allDates.length-1];
    }

    // nearest record on a specific date to a slot
    function nearestOnDate(slot, date){
      const dateRows = byDate[date];
      if(!dateRows || dateRows.length===0) return null;
      const target = dateToEpoch(date, slot + ":00");
      let best = dateRows[0], bd = Math.abs(target - dateToEpoch(dateRows[0].date, dateRows[0].time));
      for(let i=1;i<dateRows.length;i++){
        const d = Math.abs(target - dateToEpoch(dateRows[i].date, dateRows[i].time));
        if(d < bd){ bd = d; best = dateRows[i]; }
      }
      return Number(best.price);
    }

    const price1D = slots.map(slot => {
      const slotSec = timeToSeconds(slot + ":00");
      // if chosen date is today and slot is future => null
      if(periodDate1D === todayStr && slotSec > nowSeconds) return { time: display(slot), price: null };

      // prefer nearest on periodDate1D
      if(periodDate1D){
        const p = nearestOnDate(slot, periodDate1D);
        if(p !== null && p !== undefined) return { time: display(slot), price: p };
      }

      // else, global closest to target (prefer past but allow closest)
      const targetEpoch = dateToEpoch(periodDate1D || todayStr, slot + ":00");
      const g = findClosestGlobal(targetEpoch);
      if(g) return { time: display(slot), price: Number(g.price) };

      return { time: display(slot), price: null };
    });

    // --- 1W (Mon..Sun this calendar week) ---
    function weekDatesThisWeek(){
      const t = new Date();
      const day = t.getDay(); // 0 Sun .. 6 Sat
      const monday = new Date(t);
      const diffToMon = (day === 0 ? -6 : 1 - day);
      monday.setDate(t.getDate() + diffToMon);
      const arr = [];
      for(let i=0;i<7;i++){
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        arr.push(d.toISOString().slice(0,10));
      }
      return arr; // Mon..Sun
    }
    const weekDates = weekDatesThisWeek();
    const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

    // week's last price (if any)
    function lastPriceInRange(dates){
      let found = null;
      for(const d of dates){
        if(byDate[d] && byDate[d].length) found = byDate[d][byDate[d].length-1];
      }
      return found ? Number(found.price) : null;
    }
    const weekLast = lastPriceInRange(weekDates);

    const price1W = [];
    let carryPrev = null;
    for(let i=0;i<7;i++){
      const d = weekDates[i];
      const label = weekdayLabels[i];
      if(d > todayStr){ price1W.push({ time: label, price: null }); continue; } // future day

      const rowsForDay = byDate[d] || [];
      if(rowsForDay.length){
        const p = Number(rowsForDay[rowsForDay.length-1].price);
        carryPrev = p;
        price1W.push({ time: label, price: p });
        continue;
      }

      // no data this day -> fallback chain: previous day in week (carryPrev) -> weekLast -> global closest
      if(carryPrev !== null){
        price1W.push({ time: label, price: carryPrev });
        continue;
      }
      if(weekLast !== null){
        price1W.push({ time: label, price: weekLast });
        carryPrev = weekLast;
        continue;
      }

      // global closest to this day's midday
      const targetEpoch = dateToEpoch(d, "12:00:00");
      const g = findClosestGlobal(targetEpoch);
      if(g) { price1W.push({ time: label, price: Number(g.price) }); carryPrev = Number(g.price); }
      else price1W.push({ time: label, price: null });
    }

    // --- 1M (current month grouped by week) ---
    const mNow = new Date();
    const monthStart = new Date(mNow.getFullYear(), mNow.getMonth(), 1);
    const monthEnd = new Date(mNow.getFullYear(), mNow.getMonth()+1, 0);
    function getDateRange(startStr, endStr){
      const out = []; let cur = new Date(startStr + "T00:00:00"), end = new Date(endStr + "T00:00:00");
      while(cur <= end){ out.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
      return out;
    }
    const monthDates = getDateRange(monthStart.toISOString().slice(0,10), monthEnd.toISOString().slice(0,10));
    function weekOfMonth(dateStr){ return Math.ceil(new Date(dateStr + "T00:00:00").getDate() / 7); }
    const weeksSet = Array.from(new Set(monthDates.map(d => weekOfMonth(d)))).sort((a,b)=>a-b);
    // month's last price:
    let monthLast = null;
    for(const d of monthDates) if(byDate[d] && byDate[d].length) monthLast = Number(byDate[d][byDate[d].length-1].price);

    const weekPriceMap = {};
    let prevWeekCarry = null;
    for(const w of weeksSet){
      // dates in week
      const datesInW = monthDates.filter(d => weekOfMonth(d) === w);
      // find last row in this week
      let lastRowInWeek = null;
      for(const d of datesInW) if(byDate[d] && byDate[d].length) lastRowInWeek = byDate[d][byDate[d].length-1];
      if(lastRowInWeek){
        prevWeekCarry = Number(lastRowInWeek.price);
        weekPriceMap[w] = prevWeekCarry;
      } else {
        // fallback chain: prevWeekCarry -> monthLast -> globalClosest -> null
        if(prevWeekCarry !== null){ weekPriceMap[w] = prevWeekCarry; }
        else if(monthLast !== null){ weekPriceMap[w] = monthLast; prevWeekCarry = monthLast; }
        else {
          const targetDate = datesInW.length ? datesInW[0] : monthDates[0];
          const g = findClosestGlobal(dateToEpoch(targetDate, "12:00:00"));
          weekPriceMap[w] = g ? Number(g.price) : null;
          if(g) prevWeekCarry = Number(g.price);
        }
      }
    }

    // Build 1M array up to current week; future weeks null
    const currentWeekNum = weekOfMonth(todayStr);
    const price1M = weeksSet.map(w => {
      if(w > currentWeekNum) return { time: `Week ${w}`, price: null };
      return { time: `Week ${w}`, price: weekPriceMap[w] === undefined ? null : weekPriceMap[w] };
    });

    // --- 1Y (Jan..Dec this year) ---
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const thisYear = now.getFullYear();
    // year's last price (last record inside this year)
    let yearLast = null;
    for(const r of rows){
      const y = Number(r.date.split("-")[0]);
      if(y === thisYear) yearLast = Number(r.price);
    }
    const price1Y = [];
    const currentMonthIndex = now.getMonth(); // 0..11
    for(let m=0;m<12;m++){
      // gather last price in month
      const s = new Date(thisYear, m, 1).toISOString().slice(0,10);
      const e = new Date(thisYear, m+1, 0).toISOString().slice(0,10);
      const datesInMonth = getDateRange(s, e);
      let monthLastPrice = null;
      for(const d of datesInMonth) if(byDate[d] && byDate[d].length) monthLastPrice = Number(byDate[d][byDate[d].length-1].price);
      if(m > currentMonthIndex){
        // future months null
        price1Y.push({ time: monthNames[m], price: null });
      } else {
        if(monthLastPrice !== null) price1Y.push({ time: monthNames[m], price: monthLastPrice });
        else if(yearLast !== null) price1Y.push({ time: monthNames[m], price: yearLast });
        else price1Y.push({ time: monthNames[m], price: null });
      }
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