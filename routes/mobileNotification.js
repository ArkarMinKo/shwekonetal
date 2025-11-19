const db = require("../db");

function getNoti(req, res, userid){
    if (!userid) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "userid is required" }));
    }

    const buyingPricesSql = `SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 2`;
    const sellingPricesSql = `SELECT * FROM selling_prices ORDER BY date DESC, time DESC LIMIT 2`;
    const transactionsSql = `
        SELECT id, type, gold, price, deli_fees, service_fees, status, created_at, seen
        FROM sales
        WHERE status != 'pending'
        AND seen = 0
        AND userid = ?
        ORDER BY created_at DESC
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

            db.query(transactionsSql, [userid], (err, transactionsResult) => {
                if (err) {
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
                

                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(
                    {
                        success: true,
                        buyingPrices: {
                            new_price: newBuyingPrice,
                            new_price_time: buyingPricesResult[0].time,
                            new_price_date: buyingPricesResult[0].date,
                            old_price: oldBuyingPrice,
                            old_price_time: buyingPricesResult[1]?.time || buyingPricesResult[0].time,
                            old_price_date: buyingPricesResult[1]?.date || buyingPricesResult[0].date,
                            differentPercentage: formattedBuyDifferentPercentage
                        },
                        sellingPrices: {
                            new_price: newSellingPrice,
                            new_price_time: sellingPricesResult[0].time,
                            new_price_date: sellingPricesResult[0].date,
                            old_price: oldSellingPrice,
                            old_price_time: sellingPricesResult[1]?.time || sellingPricesResult[0].time,
                            old_price_date: sellingPricesResult[1]?.date || sellingPricesResult[0].date,
                            differentPercentage: formattedSellDifferentPercentage
                        },
                        sales: transactionsResult
                    }
                ));  
            })
        })
    })
}

function seenNoti(req, res, userid) {
    if (!userid) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "userid is required" }));
    }

    const markSeenSql = `
        UPDATE sales
        SET seen = 1
        WHERE status != 'pending'
        AND seen = 0
        AND userid = ?
    `;

    db.query(markSeenSql, [userid], (err, result) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            success: true,
        }));
    });
}

module.exports = {
    getNoti,
    seenNoti
};