const db = require("../db");
const formidable = require("formidable");

const { sellingPriceIdGenerator, buyingPriceIdGenerator } = require("../utils/priceIdGenerator");

function insertSellingPrice(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { price } = fields;

    if (!price) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Price is required" }));
    }

    // Generate ID, current date & time
    const id = sellingPriceIdGenerator();
    const now = new Date();
    const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(" ")[0]; // HH:MM:SS

    const sql = "INSERT INTO selling_prices (id, price, time, date) VALUES (?, ?, ?, ?)";
    const values = [id, price, time, date];

    db.query(sql, values, (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: "Selling price added successfully", id, price, time, date }));
    });
  });
}

function insertBuyingPrice(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { price } = fields;

    if (!price) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Price is required" }));
    }

    // Generate ID, current date & time
    const id = buyingPriceIdGenerator();
    const now = new Date();
    const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(" ")[0]; // HH:MM:SS

    const sql = "INSERT INTO buying_prices (id, price, time, date) VALUES (?, ?, ?, ?)";
    const values = [id, price, time, date];

    db.query(sql, values, (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: "Buying price added successfully", id, price, time, date }));
    });
  });
}

// --- Get All Selling Prices ---
function getAllSellingPrices(req, res) {
  const sql = "SELECT * FROM selling_prices ORDER BY date DESC, time DESC";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results));
  });
}

// --- Get Latest Selling Price ---
function getLatestSellingPrice(req, res) {
  const sql = "SELECT * FROM selling_prices ORDER BY date DESC, time DESC LIMIT 1";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(results[0] || {}));
  });
}

// --- Get All Buying Prices ---
function getAllBuyingPrices(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date DESC, time DESC";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');;
    res.end(JSON.stringify(results));
  });
}

// --- Get Latest Buying Price ---
function getLatestBuyingPrice(req, res) {
  const sql = "SELECT * FROM buying_prices ORDER BY date DESC, time DESC LIMIT 1";
  db.query(sql, (err, results) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');;
    res.end(JSON.stringify(results[0] || {}));
  });
}

module.exports = {
    insertSellingPrice,
    insertBuyingPrice,
    getAllBuyingPrices,
    getAllSellingPrices,
    getLatestSellingPrice,
    getLatestBuyingPrice
};