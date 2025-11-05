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

function buyingPricesChart(req, res){
    const sql = "SELECT * FROM buying_prices ORDER BY date ASC, time ASC";
    db.query(sql, (err, rows) => {
        if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
        }

        // Helper: parse "HH:MM[:SS]" -> seconds since midnight
        function timeToSeconds(t) {
        const parts = t.split(":").map(Number);
        const h = parts[0] || 0;
        const m = parts[1] || 0;
        const s = parts[2] || 0;
        return h * 3600 + m * 60 + s;
        }

        // Helper: format display time like "9:00", "1:00" (remove leading zero hour)
        function displayHour(hhmm) {
        // hhmm like "09:00" or "13:00"
        const [h, m] = hhmm.split(":").map(Number);
        return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`.replace(/^0/, "");
        }

        // Group rows by date (YYYY-MM-DD)
        const byDate = {};
        rows.forEach(r => {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push(r);
        });

        // Prepare "now" data for today/future logic (local time)
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        // --- 1D logic: slots 09:00 .. 17:00 (hourly) nearest-record per slot ---
        const slots = [];
        for (let hour = 9; hour <= 17; hour++) {
        slots.push(String(hour).padStart(2, "0") + ":00");
        }

        // get date range covered by DB (asc)
        const allDates = Object.keys(byDate).sort();
        // if DB empty, return empty structure
        if (allDates.length === 0) {
        const emptyPRICE_DATA = { "1D": [], "1W": [], "1M": [], "1Y": [] };
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify(emptyPRICE_DATA, null, 2));
        }

        // helper to create inclusive date array
        function getDateRange(startStr, endStr) {
        const out = [];
        const cur = new Date(startStr + "T00:00:00");
        const end = new Date(endStr + "T00:00:00");
        while (cur <= end) {
            out.push(cur.toISOString().slice(0, 10));
            cur.setDate(cur.getDate() + 1);
        }
        return out;
        }

        const minDate = allDates[0];
        const maxDate = allDates[allDates.length - 1];
        const fullDates = getDateRange(minDate, maxDate);

        // Build finalOutput (date -> { slotDisplay: price|null })
        const finalByDate = {};
        let lastDateData = null;

        for (const date of fullDates) {
        const rowsForDate = byDate[date];
        if (rowsForDate && rowsForDate.length > 0) {
            // For each slot find nearest record (by time)
            const slotObj = {};
            for (const slot of slots) {
            const slotSec = timeToSeconds(slot + ":00");
            let nearest = null;
            let minDiff = Infinity;
            for (const r of rowsForDate) {
                const rSec = timeToSeconds(r.time);
                const diff = Math.abs(rSec - slotSec);
                if (diff < minDiff) {
                minDiff = diff;
                nearest = r;
                }
            }
            const disp = slot.replace(/^0/, ""); // "09:00" -> "9:00"
            // if this is today and slot is in future -> null
            if (date === todayStr && slotSec > nowSeconds) {
                slotObj[disp] = null;
            } else {
                slotObj[disp] = nearest ? Number(nearest.price) : null;
            }
            }
            finalByDate[date] = slotObj;
            lastDateData = { ...slotObj };
        } else {
            // no rows for this date -> copy lastDateData (if any)
            if (lastDateData) {
            // ensure for today we null future slots
            if (date === todayStr) {
                const todayCopy = {};
                Object.entries(lastDateData).forEach(([slot, val]) => {
                const [h, m] = slot.split(":").map(Number);
                const slotSec = h * 3600 + m * 60;
                todayCopy[slot] = slotSec > nowSeconds ? null : val;
                });
                finalByDate[date] = todayCopy;
                lastDateData = { ...todayCopy };
            } else {
                finalByDate[date] = { ...lastDateData };
            }
            } else {
            // no previous data: set all slots null (but this is rare because we iterate from minDate)
            const emptySlots = {};
            slots.forEach(s => emptySlots[s.replace(/^0/, "")] = null);
            finalByDate[date] = emptySlots;
            }
        }
        }

        // We'll use the most recent date to compute carry-forward baseline if today not present
        if (!finalByDate[todayStr] && lastDateData) {
        const todayCopy = {};
        Object.entries(lastDateData).forEach(([slot, val]) => {
            const [h, m] = slot.split(":").map(Number);
            const slotSec = h * 3600 + m * 60;
            todayCopy[slot] = slotSec > nowSeconds ? null : val;
        });
        finalByDate[todayStr] = todayCopy;
        }

        // Convert finalByDate into one 1D array for the *latest date* (as in your example PRICE_DATA 1D)
        // The example PRICE_DATA 1D shows times with 9..17 and prices for a single day.
        // We'll use the most recent date (maxDate) that is <= today (or last available) as the 1D source.
        let sourceDateFor1D = maxDate;
        if (sourceDateFor1D > todayStr && fullDates.includes(todayStr)) {
        sourceDateFor1D = todayStr;
        } else if (sourceDateFor1D > todayStr) {
        // if maxDate is in future (unlikely), pick latest <= today or lastDateData fallback
        const beforeToday = fullDates.filter(d => d <= todayStr);
        sourceDateFor1D = beforeToday.length ? beforeToday[beforeToday.length - 1] : maxDate;
        }
        const daySlots = finalByDate[sourceDateFor1D] || lastDateData || {};
        const price1D = Object.keys(daySlots).map(slot => ({
        time: slot,
        price: daySlots[slot] === null ? null : Number(daySlots[slot])
        }));

        // --- 1W logic: last 7 calendar days, label Mon..Sun (use weekday names) ---
        const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        // last 7 days (including today) descending -> but output from Mon..Sun order in example.
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7.push(d.toISOString().slice(0, 10));
        }

        // For each of those dates, pick the last (latest time) row for that day if exists; else carry-forward
        let lastKnown = null;
        const dayPriceMap = {};
        for (const date of last7) {
        const rowsForDate = (byDate[date] || []);
        if (rowsForDate.length > 0) {
            // last change is last element because original query was ASC
            const lastRow = rowsForDate[rowsForDate.length - 1];
            lastKnown = Number(lastRow.price);
            dayPriceMap[date] = lastKnown;
        } else {
            // carry-forward
            dayPriceMap[date] = lastKnown;
        }
        }

        // produce 7-element array Mon..Sun in order. We'll map weekday names across last7 dates
        // The example shows Mon..Sun specifically, so we'll produce labels Mon..Sun and assign:
        // find the date in last7 that matches each weekday label; if multiple weeks cross, we still pick the corresponding day's price from last7
        const weekData = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(label => {
        // find first date in last7 with this weekday
        const foundDate = last7.find(d => {
            const wd = new Date(d + "T00:00:00").getDay(); // 0=Sun
            return weekdayNames[wd] === label;
        });
        const price = foundDate ? dayPriceMap[foundDate] : lastKnown;
        return { time: label, price: price === null || price === undefined ? null : Number(price) };
        });

        // --- 1M logic: group current month into weeks Week 1..Week 5 ---
        // We'll compute for the *current month* (based on today). But use DB range within that month.
        const nowMonth = new Date();
        const monthStart = new Date(nowMonth.getFullYear(), nowMonth.getMonth(), 1);
        const monthEnd = new Date(nowMonth.getFullYear(), nowMonth.getMonth() + 1, 0); // last day
        const monthDates = getDateRange(monthStart.toISOString().slice(0, 10), monthEnd.toISOString().slice(0, 10));

        // group dates by week-of-month (week starting on day 1..7 => week1)
        function weekOfMonth(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        return Math.ceil((d.getDate()) / 7);
        }

        // for each week number found in the current month, pick last change in that week (from DB rows),
        // if none use carry-forward from previous week
        const weeksInMonth = new Set(monthDates.map(d => weekOfMonth(d)));
        const weekNums = Array.from(weeksInMonth).sort((a, b) => a - b); // 1..5
        let lastWeekKnown = null;
        const weekPrices = [];

        for (const w of weekNums) {
        // collect all rows whose date is in this week of the month
        const rowsInWeek = [];
        for (const d of monthDates) {
            if (weekOfMonth(d) === w && byDate[d]) {
            rowsInWeek.push(...byDate[d]);
            }
        }
        if (rowsInWeek.length > 0) {
            const lastRow = rowsInWeek[rowsInWeek.length - 1];
            lastWeekKnown = Number(lastRow.price);
            weekPrices.push({ time: `Week ${w}`, price: lastWeekKnown });
        } else {
            weekPrices.push({ time: `Week ${w}`, price: lastWeekKnown === null ? null : Number(lastWeekKnown) });
        }
        }

        // If no weeks (rare) fallback to last known across DB
        if (weekPrices.length === 0) {
        const fallback = rows.length ? Number(rows[rows.length - 1].price) : null;
        weekPrices.push({ time: "Week 1", price: fallback });
        }

        // --- 1Y logic: months Jan..Dec, last change in each month (for year of today) ---
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const thisYear = now.getFullYear();
        let lastMonthKnown = null;
        const yearPrices = [];

        for (let m = 0; m < 12; m++) {
        // collect rows in this year-month
        const start = new Date(thisYear, m, 1).toISOString().slice(0, 10);
        const end = new Date(thisYear, m + 1, 0).toISOString().slice(0, 10);
        const datesOfMonth = getDateRange(start, end);
        const rowsInMonth = [];
        for (const d of datesOfMonth) {
            if (byDate[d]) rowsInMonth.push(...byDate[d]);
        }
        if (rowsInMonth.length > 0) {
            const lastRow = rowsInMonth[rowsInMonth.length - 1]; // last change in month
            lastMonthKnown = Number(lastRow.price);
            yearPrices.push({ time: monthNames[m], price: lastMonthKnown });
        } else {
            yearPrices.push({ time: monthNames[m], price: lastMonthKnown === null ? null : Number(lastMonthKnown) });
        }
        }

        // Build final PRICE_DATA object
        const PRICE_DATA = {
        "1D": price1D,
        "1W": weekData,
        "1M": weekPrices,
        "1Y": yearPrices
        };

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(PRICE_DATA, null, 2));
    });
}

module.exports = {
    summarys,
    buyingPricesChart
};