const puppeteer = require("puppeteer");

async function getCompanyWebsites(browser, searchQuery) {
    try {
        if (!browser) throw new Error("Puppeteer non prêt");

        const page = await browser.newPage();
        await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&t=h_&ia=web`, { waitUntil: "domcontentloaded" });
        await new Promise(resolve => setTimeout(resolve, 3000));

        let previousCount = 0;
        let links = [];

        for (let i = 0; i < 5; i++) {
            let newLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll("a[data-testid='result-title-a']"))
                    .map(a => ({ name: a.textContent.trim(), url: a.href }))
                    .filter(result => result.url.startsWith("http") && !result.url.includes("duckduckgo.com"));
            });

            if (newLinks.length > previousCount) {
                links = newLinks;
                previousCount = newLinks.length;
            }

            let moreResultsButton = await page.$("#more-results");
            if (moreResultsButton) {
                await moreResultsButton.click();
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
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

async function scrapeWebsite(browser, site) {
    if (!site || !site.url) {
        console.error("❌ Erreur: site ou site.url est undefined dans scrapeWebsite");
        return { email: "Non trouvé", phone: "Non trouvé", address: "Non trouvé" };
    }

    console.log('URL reçue par scrapeWebsite:', site.url);
    if (!browser) return { email: "Non trouvé", phone: "Non trouvé", address: "Non trouvé" };

    let retries = 3;
    while (retries > 0) {
        try {
            const page = await browser.newPage();
            await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, 3000));

            let contactPageUrl = await page.evaluate(() => {
                let contactLink = Array.from(document.querySelectorAll("a"))
                    .find(a => /contact/i.test(a.innerText));
                return contactLink ? contactLink.href : null;
            });

            if (contactPageUrl && !contactPageUrl.startsWith("mailto:")) {
                try {
                    await page.goto(contactPageUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });
                } catch (error) {
                    console.error(`❌ Erreur scraping ${contactPageUrl}:`, error.message);
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

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
            console.error(`❌ Erreur scraping ${site.url} (tentative restante: ${retries - 1}):`, error);
            retries--;
        }
    }

    return { email: "Non trouvé", phone: "Non trouvé", address: "Non trouvé" };
}

exports.scrape = async (req, res) => {
    const browser = req.app.get("browser");
    if (!browser) {
        return res.status(500).json({ message: "Puppeteer n'est pas prêt. Réessayez plus tard." });
    }

    const { query = "Installateur vidéosurveillance Paris" } = req.query;
    const websites = await getCompanyWebsites(browser, query);
    console.log("🔎 Sites trouvés :", websites);

    if (!websites.length) return res.json({ message: "Aucun site trouvé." });

    const results = await Promise.all(
        websites.map(async (site) => {
            const data = await scrapeWebsite(browser, site);
            return { website: site.url, name: site.name, ...data };
        })
    );

    res.json(results);
};
