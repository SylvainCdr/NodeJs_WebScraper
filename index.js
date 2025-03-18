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

// Lancer Puppeteer au démarrage du serveur
(async () => {
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    console.log("🚀 Puppeteer lancé !");
  } catch (error) {
    console.error("❌ Erreur lors du lancement de Puppeteer :", error);
  }
})();

// Fournir une instance du navigateur aux controllers
app.set("browser", browser);

app.listen(PORT, () => console.log(`✅ Serveur lancé sur http://localhost:${PORT}`));
