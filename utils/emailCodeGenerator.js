// utils/emailCodeGenerator.js
function generateEmailCode() {
  // 8-digit numeric code
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function getExpiryTime() {
  // 10 minutes from now
  return Date.now() + 10 * 60 * 1000;
}

module.exports = { generateEmailCode, getExpiryTime };
