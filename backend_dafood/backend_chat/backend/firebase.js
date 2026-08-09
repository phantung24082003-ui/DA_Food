const admin = require("firebase-admin");

//  file serviceAccountKey.json là key tải từ Firebase console
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const db = admin.firestore();

module.exports = db;

(async () => {
  try {
    const snapshot = await db.collection("Products").limit(1).get();
    console.log(" Firestore connected, found", snapshot.size, "product(s)");
  } catch (error) {
    console.error(" Firestore test failed:", error);
  }
})();

