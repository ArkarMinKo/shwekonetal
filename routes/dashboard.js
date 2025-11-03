const db = require("../db");
const formidable = require("formidable");

function summarys(req, res) {
    const date = new Date().toLocaleDateString("en-CA")

    const buyingPricesSql = `SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 2`;
    const sellingPricesSql = `SELECT * FROM selling_prices ORDER BY date DESC, time DESC LIMIT 2`;
    const transactionsSql = `
        SELECT id
        FROM sales
        WHERE status = 'approved'
        AND DATE(created_at) = ?
    `;
    const usersSql = `SELECT id FROM users`;

    
}