const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const scraperRoutes = require("./routes/scraperRoutes");

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3002;

app.use(express.json());
app.use(cors());
app.use("/scraper", scraperRoutes); // Route dédiée au scraping

let browser;

// 🟢 Attendre Puppeteer avant de démarrer le serveur
(async () => {
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    console.log("🚀 Puppeteer lancé !");
    
    // ✅ On attache bien l'instance du browser à l'application
    app.set("browser", browser);

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
