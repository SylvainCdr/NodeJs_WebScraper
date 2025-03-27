const { google } = require("googleapis");
const keys = require("../config/google_credentials.json"); // Chemin vers le fichier JSON

async function updateGoogleSheet(prospects) {
  const auth = new google.auth.GoogleAuth({
    credentials: keys,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = "1bOCZpG_2ozczTZ-vplKOdKL9XYG-YzYkXBW7iAKG6xk"; // Remplace avec ton ID Google Sheet
  const range = "A1"; // Insère à partir de la première ligne

  const values = [
    ["ID", "Logo", "Nom", "Website", "Email", "Téléphone", "Créé à"], // En-têtes
    ...prospects.map(prospect => [
      prospect.id || "",
      prospect.logo || "",
      prospect.name || "",
      prospect.website || "",
      prospect.email || "",
      prospect.phone || "",
      prospect.createdAt ? new Date(prospect.createdAt).toISOString() : new Date().toISOString(),
    ]),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    resource: { values },
  });

  console.log("✅ Google Sheet mise à jour !");
}

module.exports = {
  updateGoogleSheet,
};
