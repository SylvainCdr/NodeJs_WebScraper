const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const cors = require("cors");

const app = express();
const PORT = 3002;
app.use(express.json());
app.use(cors());

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

async function getCompanyWebsites(searchQuery) {
  try {
    if (!browser) throw new Error("Puppeteer non prêt");

    const page = await browser.newPage();
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&t=h_&ia=web`, { waitUntil: "domcontentloaded" });
    await new Promise(resolve => setTimeout(resolve, 3000));

    let links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[data-testid='result-title-a']")
    )
        .map(a => ({ name: a.textContent.trim(), url: a.href }))
        .filter(result => result.url.startsWith("http") && !result.url.includes("duckduckgo.com"));
    });

    await page.close();
    return links;
  } catch (error) {
    console.error("❌ Erreur recherche DuckDuckGo:", error);
    return [];
  }
}

async function scrapeWebsite(site) {
    if (!browser) return { email: "Non trouvé", phone: "Non trouvé", address: "Non trouvé" };
    try {
      const page = await browser.newPage();
      await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
  
      // Extraire le lien de la page de contact
      let contactPageUrl = await page.evaluate(() => {
        let contactLink = Array.from(document.querySelectorAll("a"))
          .find(a => /contact/i.test(a.innerText));
        return contactLink ? contactLink.href : null;
      });
  
      // Vérifier si l'URL est valide et éviter les "mailto:"
      if (contactPageUrl && !contactPageUrl.startsWith("mailto:")) {
        await page.goto(contactPageUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
  
      // Extraire les informations de contact
      let result = await page.evaluate(() => {
        let email = document.body.innerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        let phone = document.body.innerText.match(/\+?\d{2,4}[ .-]?\d{2,4}[ .-]?\d{2,4}[ .-]?\d{2,4}/);
        let address = document.body.innerText.match(/\d{1,4}\s+[^,]+,[^,]+,[^\d]+\d{2,5}/);
        return {
          email: email ? email[0] : "Non trouvé",
          phone: phone ? phone[0] : "Non trouvé",
          address: address ? address[0] : "Non trouvé"
        };
      });
  
      await page.close();
      return result;
    } catch (error) {
      console.error(`❌ Erreur scraping ${site.url}:`, error);
      return { email: "Non trouvé", phone: "Non trouvé", address: "Non trouvé" };
    }
  }
  

app.get("/scrape", async (req, res) => {
  if (!browser) {
    return res.status(500).json({ message: "Puppeteer n'est pas prêt. Réessayez plus tard." });
  }

  const { query = "Installateur vidéosurveillance Paris" } = req.query;
  const websites = await getCompanyWebsites(query);
  console.log("🔎 Sites trouvés :", websites);
    if (!websites.length) return res.json({ message: "Aucun site trouvé." });

  const results = await Promise.all(
    websites.map(async (site) => {
      const data = await scrapeWebsite(site);
      return { website: site.url, name: site.name, ...data };
    })
  );

  res.json(results);
});

app.listen(PORT, () => console.log(`✅ Serveur lancé sur http://localhost:${PORT}`));
