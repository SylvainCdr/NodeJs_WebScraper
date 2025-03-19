// scraperRoutes.js
const express = require("express");
const { scrape } = require("../controllers/scraperController");

const router = express.Router();

router.get("/scrape", scrape); // 👈 On passe `scrape` directement sans l'appeler avec `await scrape(req)`

module.exports = router;
