const path = require("path");

function generateIdFrontPhotoName(id, originalName) {
  const ext = path.extname(originalName);
  return `${id}F${ext}`;
}

module.exports = { generateIdFrontPhotoName };
