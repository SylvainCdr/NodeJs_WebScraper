const express = require("express");
const { scrape } = require("../controllers/scraperController");

const router = express.Router();

router.get("/", scrape); // Route GET /scraper

module.exports = router;
