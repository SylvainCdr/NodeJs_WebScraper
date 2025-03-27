const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const scraperRoutes = require("./routes/scraperRoutes");
const { updateGoogleSheet } = require("./controllers/exportToSheet"); // Importation de la fonction de mise à jour de Google Sheet
const admin = require("firebase-admin");

// Initialiser Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./config/firebase_credentials.json")),
  });
}

const db = admin.firestore();

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3002;

app.use(express.json());
app.use(cors());
app.use("/scraper", scraperRoutes); // Route dédiée au scraping

let browser;

// Fonction de synchronisation avec Firestore et Google Sheets
async function syncFirestoreWithGoogleSheet() {
  try {
    console.log("🔄 Synchronisation Firestore → Google Sheets...");
    
    const snapshot = await db.collection("prospectsV2").orderBy("createdAt", "desc").get();
    
    if (snapshot.empty) {
      console.log("⚠️ Aucun prospect trouvé dans Firestore.");
      return;
    }

    let prospects = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      prospects.push({
        id: doc.id,
        logo: data.logo || "",
        name: data.name || "",
        website: data.website || "",
        email: data.email || "",
        phone: data.phone || "",
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
      });
    });

    await updateGoogleSheet(prospects);
    console.log("✅ Synchronisation terminée avec Google Sheets !");
  } catch (error) {
    console.error("❌ Erreur lors de la synchronisation :", error);
  }
}

// 🟢 Attendre Puppeteer avant de démarrer le serveur
(async () => {
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    console.log("🚀 Puppeteer lancé !");
    
    // ✅ On attache bien l'instance du browser à l'application
    app.set("browser", browser);

    // Synchroniser Firestore avec Google Sheets dès le démarrage
    await syncFirestoreWithGoogleSheet();

    // 🟢 Maintenant on lance le serveur, une fois Puppeteer prêt
    app.listen(PORT, () => console.log(`✅ Serveur lancé sur http://localhost:${PORT}`));
  } catch (error) {
    console.error("❌ Erreur lors du lancement de Puppeteer :", error);
  }
})();

// 🔻 Gestion propre de la fermeture de Puppeteer
process.on("exit", async () => {
  if (browser) await browser.close();
  console.log("🚪 Puppeteer fermé proprement.");
});

process.on("SIGINT", async () => {
  if (browser) await browser.close();
  console.log("🛑 Serveur arrêté, Puppeteer fermé.");
  process.exit(0);
});
