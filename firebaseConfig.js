const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json"); // Clé privée Firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "webscraping-71cda.firebasestorage.app"
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { db, bucket };
