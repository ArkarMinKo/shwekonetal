// utils/codeStore.js
const codes = {}; 

// Save a code for an email
function saveCode(email, code, expiresAt) {
  codes[email] = { code, expiresAt };
}

// Verify the code for an email
function verifyCode(email, inputCode) {
  const entry = codes[email];
  if (!entry) return { success: false, message: "Code not found" };
  if (Date.now() > entry.expiresAt) return { success: false, message: "Code expired" };
  if (entry.code !== inputCode) return { success: false, message: "Incorrect code" };
  delete codes[email]; // remove after successful verification
  return { success: true, message: "Code verified" };
}

module.exports = { saveCode, verifyCode };
