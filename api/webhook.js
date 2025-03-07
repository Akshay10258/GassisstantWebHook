const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For OAuth token endpoint

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.cert({
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL
    }),
    databaseURL: "https://greenthumb-3c42c-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

// Store OAuth codes/tokens (in-memory for testing; use Firebase for production)
const authCodes = new Map();
const tokens = new Map();

// Explicitly serve static files
app.use('/type-font', express.static(path.join(__dirname, '../public/fonts')));

// Apply CSP headers to all routes
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", 
        "default-src 'self'; " + 
        "font-src 'self' https://gassisstant-web-hook.vercel.app; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; " + 
        "connect-src 'self' https://gassisstant-web-hook.vercel.app;"
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
});

app.get("/api/webhook/oauth/authorize", (req, res) => {
    const { client_id, redirect_uri, state } = req.query;
    const authCode = 'auth-' + Math.random().toString(36).substring(2);
    authCodes.set(authCode, { client_id, redirect_uri });
    res.redirect(`${redirect_uri}?code=${authCode}&state=${state}`);
});

app.post("/api/webhook/oauth/token", (req, res) => {
    const { code, client_id, client_secret } = req.body;
    const authData = authCodes.get(code);
    if (authData && authData.client_id === client_id) {
        const accessToken = 'access-' + Math.random().toString(36).substring(2);
        const refreshToken = 'refresh-' + Math.random().toString(36).substring(2);
        tokens.set(accessToken, { client_id });
        res.json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken
        });
        authCodes.delete(code);
    } else {
        res.status(400).json({ error: 'invalid_grant' });
    }
});

// Main webhook route (handles Dialogflow and Smart Home)
app.post("/api/webhook", async (req, res) => {
    const body = req.body;
    console.log("Request Body:", JSON.stringify(body));

    // Handle Smart Home QUERY intent
    if (body.intent === 'action.devices.QUERY') {
        try {
            const snapshot = await db.ref("moistureLevel").once("value");
            const moistureLevel = snapshot.val() || 0;

            let message = `The moisture level is ${moistureLevel}%. `;
            if (moistureLevel > 60) {
                message += "Your plants are well-watered!";
            } else if (moistureLevel > 30) {
                message += "Your plants might need watering soon.";
            } else {
                message += "Your plants are dry! Time to water them.";
            }

            return res.json({
                requestId: body.requestId,
                payload: {
                    devices: {
                        garden: {
                            status: "SUCCESS",
                            online: true,
                            currentStatusReport: [
                                {
                                    statusCode: "SUCCESS",
                                    description: message
                                }
                            ]
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Error fetching moisture level:", error);
            return res.json({
                requestId: body.requestId,
                payload: {
                    devices: {
                        garden: {
                            status: "ERROR",
                            errorCode: "deviceOffline",
                            currentStatusReport: [
                                {
                                    statusCode: "ERROR",
                                    description: "I couldn't retrieve the moisture level. Try again later!"
                                }
                            ]
                        }
                    }
                }
            });
        }
    }

    // Handle Dialogflow request (existing logic)
    const userQuery = req.body.queryResult?.queryText?.toLowerCase() || "";
    console.log("Google Assistant Request:", userQuery);

    if (userQuery.includes("moisture level") || userQuery.includes("plants watered")) {
        try {
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

// Test GET endpoint
app.get("/api/webhook", (req, res) => {
    res.json({ message: "Webhook API is operational" });
});

// Test font endpoint
app.get("/test-font", (req, res) => {
    res.sendFile(path.join(__dirname, '../public/fonts/Colfax-Medium.woff'));
});

module.exports = app;