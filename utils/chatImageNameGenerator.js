const fs = require("fs");
const path = require("path");

const IMAGE_DIR = path.join(__dirname, "../chatUploads/Images");
fs.mkdirSync(IMAGE_DIR, { recursive: true });

let lastNumber = 0;
fs.readdirSync(IMAGE_DIR).forEach(file => {
  const match = file.match(/^CI(\d+)\./);
  if (match) lastNumber = Math.max(lastNumber, parseInt(match[1]));
});

function getNextImageName(ext = ".png") {
  lastNumber++;
  return `CI${lastNumber}${ext}`;
}

module.exports = getNextImageName;
