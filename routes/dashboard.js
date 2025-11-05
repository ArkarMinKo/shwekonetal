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

    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const nowSeconds = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();

    // --- helpers ---
    function timeToSeconds(t){ const [h,m] = t.split(":").map(Number); return h*3600 + m*60; }
    function dateToEpoch(dateStr, timeStr="00:00:00"){ const [y,mo,d] = dateStr.split("-").map(Number); const [hh,mm,ss] = timeStr.split(":").map(Number); return new Date(y, mo-1, d, hh||0, mm||0, ss||0).getTime(); }
    function display(slot){ return slot.replace(/^0/,""); }

    // group rows by date
    const byDate = {};
    rows.forEach(r => { if(!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });

    const rowsWithEpoch = rows.map(r => ({...r, epoch: dateToEpoch(r.date,r.time)}));

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

    function nearestPrice(slot, dateRows){
      if(!dateRows || dateRows.length===0) return null;
      const targetSec = timeToSeconds(slot);
      let best = dateRows[0], bestDiff = Math.abs(targetSec - timeToSeconds(dateRows[0].time));
      for(let i=1;i<dateRows.length;i++){
        const diff = Math.abs(targetSec - timeToSeconds(dateRows[i].time));
        if(diff < bestDiff){ best = dateRows[i]; bestDiff = diff; }
      }
      return Number(best.price);
    }

    // --- 1D ---
    const slots = [];
    for(let h=1; h<=23; h+=2) slots.push(`${h}:00`);
    const dateRows1D = byDate[todayStr] || [];
    const price1D = slots.map(slot => {
      const slotSec = timeToSeconds(slot);
      if(slotSec > nowSeconds) return { time: slot, price: null }; // future
      const p = nearestPrice(slot, dateRows1D);
      return { time: slot, price: p !== null ? p : null };
    });

    // --- 1W ---
    const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    function weekDatesThisWeek(){
      const t = new Date();
      const day = t.getDay(); // 0 Sun .. 6 Sat
      const monday = new Date(t);
      const diffToMon = (day === 0 ? -6 : 1 - day);
      monday.setDate(t.getDate() + diffToMon);
      const arr = [];
      for(let i=0;i<7;i++){ const d = new Date(monday); d.setDate(monday.getDate()+i); arr.push(d.toISOString().slice(0,10)); }
      return arr;
    }
    const weekDates = weekDatesThisWeek();
    let carry = null;
    const price1W = weekDates.map((d,i)=>{
      if(d>todayStr) return { time: weekdayLabels[i], price: null };
      const last = lastRow(byDate[d]);
      if(last){ carry = Number(last.price); return { time: weekdayLabels[i], price: carry }; }
      return { time: weekdayLabels[i], price: carry };
    });

    // --- 1M ---
    function getDateRange(startStr, endStr){ const out=[]; let cur = new Date(startStr+"T00:00:00"), end = new Date(endStr+"T00:00:00"); while(cur<=end){ out.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); } return out; }
    function weekOfMonth(dateStr){ return Math.ceil(new Date(dateStr+"T00:00:00").getDate()/7); }
    const mNow = new Date(); const monthStart = new Date(mNow.getFullYear(), mNow.getMonth(),1); const monthEnd = new Date(mNow.getFullYear(), mNow.getMonth()+1,0);
    const monthDates = getDateRange(monthStart.toISOString().slice(0,10), monthEnd.toISOString().slice(0,10));
    const weeksSet = Array.from(new Set(monthDates.map(d=>weekOfMonth(d)))).sort((a,b)=>a-b);
    const weekPriceMap = {}; let prevWeek = null;
    for(const w of weeksSet){
      const datesInW = monthDates.filter(d=>weekOfMonth(d)===w);
      let last = null;
      for(const d of datesInW) if(byDate[d]&&byDate[d].length) last = lastRow(byDate[d]);
      if(last){ prevWeek = Number(last.price); weekPriceMap[w] = prevWeek; }
      else weekPriceMap[w] = prevWeek; // fallback
    }
    const currentWeekNum = weekOfMonth(todayStr);
    const price1M = weeksSet.map(w => w>currentWeekNum ? { time:`Week ${w}`, price:null } : { time:`Week ${w}`, price:weekPriceMap[w] !== undefined ? weekPriceMap[w] : null });

    // --- 1Y ---
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const thisYear = now.getFullYear();
    let lastYearPrice = null;
    const price1Y = monthNames.map((mName,idx)=>{
      const s = new Date(thisYear,idx,1).toISOString().slice(0,10);
      const e = new Date(thisYear,idx+1,0).toISOString().slice(0,10);
      const datesInMonth = getDateRange(s,e);
      let monthLast = null;
      for(const d of datesInMonth) if(byDate[d]&&byDate[d].length) monthLast = Number(lastRow(byDate[d]).price);
      if(monthLast!==null){ lastYearPrice = monthLast; return { time:mName, price:monthLast }; }
      if(idx > now.getMonth()) return { time:mName, price:null }; // future month
      return { time:mName, price:lastYearPrice };
    });

    const PRICE_DATA = { "1D": price1D, "1W": price1W, "1M": price1M, "1Y": price1Y };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(PRICE_DATA, null, 2));
  });
}

module.exports = {
    summarys,
    buyingPricesChart
};