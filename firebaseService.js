const { db, bucket } = require("./firebaseConfig");
const fs = require("fs");

async function saveToFirebase({ name, website, email, phone, screenshotPath }) {
  try {
    const docRef = await db.collection("entreprises").add({
      name,
      website,
      email,
      phone,
      createdAt: new Date(),
    });

    let imageUrl = null;

    if (screenshotPath) {
      const fileName = `captures/${docRef.id}.png`;
      await bucket.upload(screenshotPath, { destination: fileName });

      imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      await docRef.update({ screenshot: imageUrl });

      fs.unlinkSync(screenshotPath); // Supprime l'image locale après upload
    }

    console.log("✅ Données enregistrées dans Firebase :", { name, website, email, phone, screenshot: imageUrl });
    return { id: docRef.id, name, website, email, phone, screenshot: imageUrl };
  } catch (error) {
    console.error("❌ Erreur Firebase :", error);
  }
}

module.exports = { saveToFirebase };
