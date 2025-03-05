const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// var serviceAccount = require("path/to/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert({
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),  // Fix newlines
        client_email: process.env.FIREBASE_CLIENT_EMAIL
    }),
    databaseURL: "https://greenthumb-3c42c-default-rtdb.asia-southeast1.firebasedatabase.app"
});


const db = admin.database(); // Realtime Database

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; font-src 'self' https://gassisstant-web-hook.vercel.app; style-src 'self' 'unsafe-inline'; script-src 'self';");
    next();
});

app.use('/type-font', express.static(__dirname + '/fonts'));

app.post("/api/webhook", async (req, res) => {
    const userQuery = req.body.queryResult?.queryText.toLowerCase() || "";
    console.log("Google Assistant Request:", userQuery);

    // Handle moisture level request
    if (userQuery.includes("moisture level") || userQuery.includes("plants watered")) {
        try {
            // Fetch moisture level from Firebase
            const snapshot = await db.ref("moistureLevel").once("value");
            const moistureLevel = snapshot.val() || 0;

            let message = `The moisture level is ${moistureLevel}%. `;
            if (moistureLevel > 60) {
                message += "Your plants are well-watered! 🌱";
            } else if (moistureLevel > 30) {
                message += "Your plants might need watering soon. 💦";
            } else {
                message += "Your plants are dry! Time to water them. 🚰";
            }

            return res.json({ fulfillmentText: message });
        } catch (error) {
            console.error("Error fetching moisture level:", error);
            return res.json({ fulfillmentText: "I couldn't retrieve the moisture level. Try again later!" });
        }
    }

    res.json({ fulfillmentText: "I'm not sure how to respond to that!" });
});

module.exports = app;
