const puppeteer = require("puppeteer");
const admin = require("firebase-admin");
const axios = require("axios");
const path = require("path");


// Initialisation Firebase
const serviceAccount = require("../firebase-key.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "webscraping-71cda.firebasestorage.app",
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Liste des principales villes de France
const cities = ["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Nice", "Nantes", "Lille", "Strasbourg", "Rennes"];

async function getCompanyWebsites(browser, searchQuery) {
    try {
        const page = await browser.newPage();
        await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&t=h_&ia=web`, { waitUntil: "domcontentloaded" });
        await new Promise(resolve => setTimeout(resolve, 6000));

console.log ("🔍 Recherche sur DuckDuckGo...");

        let links = [];
        for (let i = 0; i < 10; i++) { // Passe à 10 pages
            let newLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll("a[data-testid='result-title-a']"))
                    .map(a => ({ name: a.textContent.trim(), url: a.href }))
                    .filter(result => result.url.startsWith("http"));
            });

            console.log(`🔗 ${newLinks.length} nouveaux liens trouvés.`);
            newLinks.forEach(link => {
                if (!links.some(existing => existing.url === link.url)) {
                    links.push(link);
                }
            });

            if (links.length >= 600) break; // Augmenté à 300 résultats

            let moreResultsButton = await page.$("#more-results");
            if (moreResultsButton) {
                await moreResultsButton.click();
                await new Promise(resolve => setTimeout(resolve, 6000));
            } else {
                break;
            }
        }
        await page.close();
        return links.slice(0, 1500);
    } catch (error) {
        console.error("❌ Erreur recherche DuckDuckGo:", error);
        return [];
    }
}

async function scrapeWithPuppeteer(url, browser) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", req => {
        if (["stylesheet", "font"].includes(req.resourceType())) req.abort();
        else req.continue();
    });

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

console.log(`🔍 Scraping de ${url}...`);

        const data = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const email = bodyText.match(/[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}/);
            const phone = bodyText.match(/\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}/);

            let logo = null;
            let logoElement = document.querySelector("img[id*='logo'], img[class*='logo'], img[src*='logo'], header img");

            if (logoElement) {
                logo = logoElement.src.startsWith("http") ? logoElement.src : window.location.origin + logoElement.src;
            }

            return {
                email: email ? email[0] : "Non trouvé",
                phone: phone ? phone[0] : "Non trouvé",
                logo
            };
        });

        await page.close();
        return data;
    } catch (error) {
        console.error(`❌ Puppeteer a échoué sur ${url} :`, error);
        await page.close();
        return null;
    }
}

async function uploadLogoToFirebase(logoUrl, companyName) {
    try {
        if (!logoUrl || logoUrl === "Non trouvé") return null;

        const response = await axios({ url: logoUrl, responseType: "arraybuffer" });

        const fileExtension = path.extname(logoUrl.split("?")[0]);
        if (![".png", ".jpg", ".jpeg", ".webp"].includes(fileExtension.toLowerCase())) return null; // Vérifie l'extension

        const fileName = `logosV2/${companyName.replace(/\s+/g, "_")}${fileExtension}`;
        const file = bucket.file(fileName);
        await file.save(response.data, { metadata: { contentType: "image/png" } });
        await file.makePublic();

        return file.publicUrl();
    } catch (error) {
        console.error(`❌ Erreur upload logo Firebase:`, error.message);
        return null;
    }
}

exports.scrape = async (req, res) => {
    try {
        console.log("🟢 Début du scraping !");

        const browser = req.app.get("browser");
        if (!browser) {
            return res.status(500).json({ error: "Puppeteer non disponible" });
        }

        let allResults = [];

        for (const city of cities) {
            console.log(`🔍 Recherche pour ${city}`);
            const query = `entreprise installation videosurveillance ${city}`;
            const websites = await getCompanyWebsites(browser, query);
            console.log(`🌐 ${websites.length} sites trouvés pour ${city}`);

            if (!websites.length) continue;

            const results = await Promise.allSettled(websites.map(async (site) => {
                try {
                    let data = await scrapeWithPuppeteer(site.url, browser);
                    if (!data) return null;

                    let logoUrl = await uploadLogoToFirebase(data.logo, site.name);
                    if (logoUrl) {
                        data.logo = logoUrl;
                    }

                    const existingDocs = await db.collection("prospectsV2")
                        .where("website", "==", site.url)
                        .get();

                    if (!existingDocs.empty) {
                        console.log(`📌 Prospect déjà en base: ${site.url}`);
                        return null;
                    }
                    
                    // Vérification : on n'injecte pas en BDD si ni email ni téléphone ne sont trouvés
                    if ((!data.email || data.email === "Non trouvé") && (!data.phone || data.phone === "Non trouvé")) {
                        console.log(`🚫 Prospect ignoré (aucun email ni téléphone trouvé) : ${site.url}`);
                        return null;
                    }
                    
                    const docRef = await db.collection("prospectsV2").add({
                        name: site.name,
                        website: site.url,
                        email: data.email || "Non trouvé",
                        phone: data.phone || "Non trouvé",
                        logo: logoUrl || null,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    return { id: docRef.id, ...site, ...data };
                } catch (err) {
                    console.error(`⚠️ Erreur sur ${site.url} : ${err.message}`);
                    return null;
                }
            }));

            allResults.push(...results.filter(r => r.status === "fulfilled" && r.value !== null).map(r => r.value));
        }

        console.log("✅ Scraping terminé !");

        res.json(allResults);
    } catch (error) {
        console.error("❌ Erreur lors du scraping :", error.message);
        res.status(500).json({ error: "Erreur lors du scraping" });
    }
};
