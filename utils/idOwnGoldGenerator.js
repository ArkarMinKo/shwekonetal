// utils/idOwnGoldGenerator.js
function generateOwnGoldId(userId, createdAt) {
    if (!userId || !createdAt) {
        throw new Error("userId and createdAt are required to generate own_gold ID");
    }

    // Convert created_at to a clean string (YYYYMMDDHHMMSS)
    const date = new Date(createdAt);
    const formattedDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
    ].join("");

    // Combine userId + formatted date
    const ownGoldId = `${userId}${formattedDate}`;
    return ownGoldId;
}

module.exports = { generateOwnGoldId };