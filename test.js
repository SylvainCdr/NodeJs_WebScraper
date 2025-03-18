const { saveToFirebase } = require("./firebaseService");

const testData = {
  name: "Entreprise Test",
  website: "https://exemple.com",
  email: "contact@exemple.com",
  phone: "+33 6 12 34 56 78",
  screenshotPath: "./test.png", // Une image test à uploader
};

saveToFirebase(testData);
