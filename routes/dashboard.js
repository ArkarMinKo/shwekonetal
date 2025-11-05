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

                        const formattedBuyDifferentPercentage = 
                            buyDifferentpercentage > 0
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
                                    differentGold: 
                                        differentGold > 0
                                            ? `+ ${goldString}`
                                            : differentGold < 0
                                            ? `- ${goldString}`
                                            : `${goldString}`
                                },
                                usersCount: {
                                    allUsers: allUserCount,
                                    todayUsers: 
                                        todayUserCount > 0
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
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    function timeToSeconds(t) {
      const [h, m] = t.split(":").map(Number);
      return h * 3600 + m * 60;
    }
    function lastRow(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }
    function getDateRange(startStr, endStr) {
      const out = [];
      let cur = new Date(startStr+"T00:00:00"), end = new Date(endStr+"T00:00:00");
      while(cur <= end){ out.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
      return out;
    }
    function weekOfMonth(dateStr){ return Math.ceil(new Date(dateStr+"T00:00:00").getDate()/7); }

    // group rows by date
    const byDate = {};
    rows.forEach(r => { if(!byDate[r.date]) byDate[r.date]=[]; byDate[r.date].push(r); });

    // --- 1D ---
    const slots1D = ["01:00","03:00","05:00","07:00","09:00","11:00","13:00","15:00","17:00","19:00","21:00","23:00"];
    let lastPrice1D = null;
    const dayRows = byDate[todayStr] || [];
    const price1D = slots1D.map(slot => {
      const slotSec = timeToSeconds(slot);
      if(slotSec > nowSec) return { time: slot, price: null };
      const nearest = lastRow(dayRows);
      if(nearest) lastPrice1D = nearest.price;
      return { time: slot, price: nearest ? nearest.price : lastPrice1D };
    });

    // --- 1W ---
    const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    function weekDatesThisWeek(){
      const t = new Date(); 
      const day = t.getDay();
      const monday = new Date(t); 
      monday.setDate(t.getDate() + (day===0?-6:1-day));
      return Array.from({length:7},(_,i)=>{
        const d = new Date(monday); 
        d.setDate(monday.getDate()+i); 
        return d.toISOString().slice(0,10); 
      });
    }
    const weekDates = weekDatesThisWeek();
    let lastPrice1W = null;
    const allDatesSorted = rows.map(r=>r.date).sort(); // all dates in DB sorted
    const price1W = weekDates.map((d,i)=>{
      if(d > todayStr) return { time: weekdayLabels[i], price: null }; // future day => null
      const last = lastRow(byDate[d]);
      if(last){
        lastPrice1W = last.price;
      } else {
        // find latest price before this day in DB
        const prevDate = allDatesSorted.filter(dd=>dd<d).pop();
        if(prevDate && byDate[prevDate].length){
          lastPrice1W = lastRow(byDate[prevDate]).price;
        }
      }
      return { time: weekdayLabels[i], price: lastPrice1W };
    });

    // --- 1M ---
    const mNow = new Date(); 
    const monthStart = new Date(mNow.getFullYear(), mNow.getMonth(),1);
    const monthEnd = new Date(mNow.getFullYear(), mNow.getMonth()+1,0);
    const monthDates = getDateRange(monthStart.toISOString().slice(0,10), monthEnd.toISOString().slice(0,10));
    const weeksSet = Array.from(new Set(monthDates.map(d=>weekOfMonth(d)))).sort((a,b)=>a-b);
    let lastPrice1M = null;
    const weekPriceMap = {};
    for(const w of weeksSet){
      const datesInW = monthDates.filter(d=>weekOfMonth(d)===w);
      let weekLast = null;
      for(const d of datesInW) if(byDate[d] && byDate[d].length) weekLast = lastRow(byDate[d]);
      
      if(weekLast){
        lastPrice1M = weekLast.price;
      } else {
        // find latest price before first day of this week in DB
        const firstDay = datesInW[0];
        const prevDate = allDatesSorted.filter(dd=>dd<firstDay).pop();
        if(prevDate && byDate[prevDate].length){
          lastPrice1M = lastRow(byDate[prevDate]).price;
        }
      }
      weekPriceMap[w] = lastPrice1M;
    }
    const currentWeekNum = weekOfMonth(todayStr);
    const price1M = weeksSet.map(w => w>currentWeekNum ? { time:`Week ${w}`, price:null } : { time:`Week ${w}`, price:weekPriceMap[w] });

    // --- 1Y ---
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const thisYear = now.getFullYear();
    let lastYearPrice = null;
    const price1Y = monthNames.map((mName,idx)=>{
      const s = new Date(thisYear,idx,1).toISOString().slice(0,10);
      const e = new Date(thisYear,idx+1,0).toISOString().slice(0,10);
      const datesInMonth = getDateRange(s,e);
      let monthLast = null;
      for(const d of datesInMonth) if(byDate[d] && byDate[d].length) monthLast = lastRow(byDate[d]).price;
      if(monthLast!==null){ lastYearPrice = monthLast; return { time:mName, price:monthLast }; }
      if(idx>now.getMonth()) return { time:mName, price:null };
      return { time:mName, price:lastYearPrice };
    });

    const PRICE_DATA = { "1D": price1D, "1W": price1W, "1M": price1M, "1Y": price1Y };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(PRICE_DATA, null, 2));
  });
}

// --- Revenue Gold Chart ---
function revenueGoldChart(req, res) {
  const transactionsSql = `
    SELECT gold, type, created_at
    FROM sales
    WHERE status = 'approved'
  `;

  db.query(transactionsSql, (err, transactionsResult) => {
    if (err) {
      console.error("Price fetch error:", err);
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    // Prepare last 6 months (current + previous 5)
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString("default", { month: "short" });
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, month: monthName, value: 0 });
    }

    // Calculate total buy/sell per month
    transactionsResult.forEach((data) => {
      const created = new Date(data.created_at);
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      const targetMonth = months.find((m) => m.key === key);
      if (targetMonth) {
        const gold = parseFloat(data.gold) || 0;
        if (data.type === "buy") targetMonth.value -= gold;
        else if (data.type === "sell") targetMonth.value += gold;
      }
    });

    // Format final output safely
    const REVENUE = months.map(({ month, value }) => ({
      month,
      value: parseFloat((Number(value) || 0).toFixed(2)),
    }));

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(REVENUE));
  });
}

module.exports = {
    summarys,
    buyingPricesChart,
    revenueGoldChart
};