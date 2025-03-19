const puppeteer = require("puppeteer");
const admin = require("firebase-admin");
const fs = require("fs");

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

// Fonction pour récupérer les sites via DuckDuckGo


async function getCompanyWebsites(browser, searchQuery) {
    try {
        if (!browser) throw new Error("Puppeteer non prêt");

        const page = await browser.newPage();
        await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&t=h_&ia=web`, { waitUntil: "domcontentloaded" });
        await new Promise(resolve => setTimeout(resolve, 3000));

        let links = [];
        let previousCount = 0;

        for (let i = 0; i < 7; i++) { // Augmenté à 7 pages
            let newLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll("a[data-testid='result-title-a']"))
                    .map(a => ({ name: a.textContent.trim(), url: a.href }))
                    .filter(result => result.url.startsWith("http") && !result.url.includes("duckduckgo.com"));
            });

            // Ajout des nouveaux liens sans écraser les précédents
            newLinks.forEach(link => {
                if (!links.some(existing => existing.url === link.url)) {
                    links.push(link);
                }
            });

            console.log(`📌 ${links.length} résultats collectés`);

            if (links.length >= 200) break; // Stop si on a assez de résultats

            let moreResultsButton = await page.$("#more-results");
            if (moreResultsButton) {
                await moreResultsButton.click();
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                console.log("✅ Plus de bouton 'Plus de résultats'. Fin du scraping.");
                break;
            }
        }

        await page.close();
        return links.slice(0, 200);
    } catch (error) {
        console.error("❌ Erreur recherche DuckDuckGo:", error);
        return [];
    }
}



async function uploadLogoToFirebase(logoUrl, companyName) {
    try {
        if (!logoUrl || logoUrl === "Non trouvé") return null;

        const response = await axios({
            url: logoUrl,
            responseType: "arraybuffer",
        });

        const fileExtension = path.extname(logoUrl.split("?")[0]); // Gérer les URLs avec des paramètres
        const fileName = `logos/${companyName.replace(/\s+/g, "_")}${fileExtension}`;
        const file = bucket.file(fileName);

        await file.save(response.data, { metadata: { contentType: "image/png" } });
        await file.makePublic();

        return file.publicUrl();
    } catch (error) {
        console.error(`❌ Erreur upload logo Firebase:`, error.message);
        return null;
    }
}



// Scraping avec Puppeteer
async function scrapeWithPuppeteer(url, browser) {
    const page = await browser.newPage();

    // Désactiver images et CSS pour accélérer
    await page.setRequestInterception(true);
    page.on("request", (req) => {
        if (["stylesheet", "font"].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

        // Extraction des emails & téléphones
        const data = await page.evaluate(() => {
            const bodyText = document.body.innerText;

            const email = bodyText.match(/[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}/);
            const phone = bodyText.match(/\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}/);

            // Extraction du logo (on prend le premier logo trouvé)
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


// Upload de capture d’écran vers Firebase Storage
async function uploadScreenshotToFirebase(localPath) {
    try {
        const file = bucket.file(localPath);
        await file.save(fs.readFileSync(localPath), { metadata: { contentType: "image/png" } });
        await file.makePublic();
        fs.unlinkSync(localPath);
        return file.publicUrl();
    } catch (error) {
        console.error(`❌ Erreur upload Firebase:`, error.message);
        return null;
    }
}

// Fonction principale de scraping
exports.scrape = async (req, res) => {
    try {
        console.log("🟢 Requête reçue pour le scraping !");

        const browser = req.app.get("browser");
        if (!browser) {
            console.error("❌ Puppeteer non disponible !");
            return res.status(500).json({ error: "Puppeteer non disponible" });
        }

        const { city = "Paris" } = req.query;
        const query = `Installateur vidéosurveillance ${city}`;
        console.log(`🔍 Recherche pour la ville : ${city}`);

        const websites = await getCompanyWebsites(browser, query);
        console.log(`🌐 ${websites.length} sites trouvés`);

        if (!websites.length) {
            return res.json({ message: "Aucun site trouvé." });
        }

        const results = await Promise.all(
            websites.map(async (site) => {
                try {
                    let data = await scrapeWithPuppeteer(site.url, browser);
                    if (!data) return null;
        
                    // Upload du logo
                    let logoUrl = await uploadLogoToFirebase(data.logo, site.name);
                    if (logoUrl) {
                        data.logo = logoUrl; // Remplace l'URL d'origine par l'URL Firebase
                    }
        
                    // Vérifier si l'entreprise existe déjà dans Firestore
                    const existingDocs = await db.collection("entreprises")
                        .where("website", "==", site.url)
                        .get();
        
                    if (!existingDocs.empty) {
                        console.log(`📌 Entreprise déjà en base: ${site.url}`);
                        return null;
                    }
        
                    const docRef = await db.collection("entreprises").add({
                        name: site.name,
                        website: site.url,
                        email: data.email || "Non trouvé",
                        phone: data.phone || "Non trouvé",
                        logo: logoUrl || null, // Ajout du logo dans Firestore
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
        
                    return { id: docRef.id, ...site, ...data };
                } catch (err) {
                    console.error(`⚠️ Erreur dans le traitement d'un site : ${err.message}`);
                    return null;
                }
            })
        );
        

        console.log("✅ Scraping terminé !");
        res.json(results.filter(result => result !== null));

    } catch (error) {
        console.error("❌ Erreur lors du scraping :", error.message);
        res.status(500).json({ error: "Erreur lors du scraping" });
    }
};
