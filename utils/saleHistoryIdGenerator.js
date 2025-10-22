function generateSaleId(userid, type) {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-T:.Z]/g, "");
  return `${userid}_${type}_${dateStr}`;
}

module.exports = { generateSaleId };
