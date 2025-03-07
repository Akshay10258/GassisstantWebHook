const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Main webhook route (handles Dialogflow and Smart Home)
app.post("/api/webhook", async (req, res) => {
    const body = req.body;
    console.log("Request Body:", JSON.stringify(body));

    // Handle Smart Home SYNC intent
    if (body.inputs && body.inputs[0].intent === 'action.devices.SYNC') {
        console.log("Handling SYNC intent");
       // In your SYNC response
        return res.json({
            requestId: body.requestId,
            payload: {
                agentUserId: "user123",
                devices: [{
                    id: "garden",
                    type: "action.devices.types.GARDEN",  // Changed from SENSOR to a more specific type
                    traits: [
                        "action.devices.traits.SensorState", 
                        "action.devices.traits.StatusReport"  // Add this trait to enable verbal responses
                    ],
                    name: {
                        name: "Garden",
                        defaultNames: ["Garden Monitor"],
                        nicknames: ["My Garden", "Balcony Garden"]
                    },
                    willReportState: true,
                    attributes: {
                        sensorStatesSupported: [{
                            name: "MoistureLevel",
                            descriptiveCapabilities: {
                                availableStates: [
                                    "dry",
                                    "needs watering",
                                    "well-watered"
                                ]
                            },
                            numericCapabilities: {
                                rawValueUnit: "PERCENTAGE"
                            }
                        }],
                        // Add this to enable status reports
                        statusReportSupported: true
                    }
                }]
            }
    });
    }

        // Handle Smart Home QUERY intent
    if (body.inputs && body.inputs[0].intent === 'action.devices.QUERY') {
        try {
            const snapshot = await db.ref("monitor").once("value");
            const monitorValue = snapshot.val() || { SoilMoisture: 0 };
            const moisture = monitorValue.SoilMoisture || 0;

            console.log("Handling QUERY intent");
            console.log("Monitor value:", monitorValue);
            
            let descriptiveState;
            
            if (moisture > 60) {
                descriptiveState = "well-watered";
            } else if (moisture > 30) {
                descriptiveState = "needs watering";
            } else {
                descriptiveState = "dry";
            }
            
            // Create a verbal status message
            const statusMessage = `The garden moisture level is ${moisture}%. Your plants are ${descriptiveState}.`;
            console.log("Status message:", statusMessage);
            
            return res.json({
                requestId: body.requestId,
                payload: {
                    devices: {
                        garden: {
                            status: "SUCCESS",
                            online: true,
                            state: {
                                "SensorState": {
                                    "MoistureLevel": {
                                        "currentSensorState": descriptiveState,
                                        "rawValue": moisture
                                    }
                                }
                            },
                            // The key part: add status with verbal response
                            statusReport: [{
                                blocking: false,
                                priority: 0,
                                statusCode: "urn:statusReport:deviceStatus",
                                deviceTarget: "garden",
                                userNotification: {
                                    title: "Garden Moisture Status",
                                    text: statusMessage
                                }
                            }],
                            // This field helps Google Assistant know what to say
                            errorCode: null,
                            status: "SUCCESS",
                            debugString: statusMessage
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
                            errorCode: "deviceOffline"
                        }
                    }
                }
            });
        }
    }

    // Handle Dialogflow request
    if (req.body.queryResult) {
        const userQuery = req.body.queryResult.queryText?.toLowerCase() || "";
        console.log("Dialogflow Request:", userQuery);

        if (userQuery.includes("moisture level") || userQuery.includes("plants watered")) {
            try {
                // First try the monitor path
                let snapshot = await db.ref("monitor").once("value");
                let moistureData = snapshot.val();
                
                // If not found, try the direct SoilMoisture path
                if (!moistureData || !moistureData.SoilMoisture) {
                    snapshot = await db.ref("SoilMoisture").once("value");
                    let directValue = snapshot.val();
                    moistureData = { SoilMoisture: directValue || 0 };
                }
                
                const moisture = moistureData.SoilMoisture || 0;

                let message = `The moisture level is ${moisture}%. `;
                if (moisture > 60) {
                    message += "Your plants are well-watered! 🌱";
                } else if (moisture > 30) {
                    message += "Your plants might need watering soon. 💦";
                } else {
                    message += "Your plants are dry! Time to water them. 🚰";
                }

                return res.json({
                    fulfillmentText: message,
                    fulfillmentMessages: [
                        {
                            text: {
                                text: [message]
                            }
                        }
                    ]
                });
            } catch (error) {
                console.error("Error fetching moisture level:", error);
                return res.json({ 
                    fulfillmentText: "I couldn't retrieve the moisture level. Try again later!" 
                });
            }
        }

        return res.json({ 
            fulfillmentText: "I'm not sure how to respond to that!" 
        });
    }

    // If it's neither a Smart Home nor a Dialogflow request
    res.json({ error: "Unrecognized request format" });
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