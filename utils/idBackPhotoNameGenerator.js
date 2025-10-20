const path = require("path");

function generateIdBackPhotoName(id, originalName) {
  const ext = path.extname(originalName);
  return `${id}B${ext}`;
}

module.exports = { generateIdBackPhotoName };
