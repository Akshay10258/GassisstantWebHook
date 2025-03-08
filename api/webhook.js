const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Fixed parenthesis mismatch here

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
        return res.json({
            requestId: body.requestId,
            payload: {
                agentUserId: "user123",
                devices: [{
                    id: "garden",
                    type: "action.devices.types.SENSOR",
                    traits: ["action.devices.traits.SensorState"],
                    name: {
                        name: "Garden",
                        defaultNames: ["Garden Monitor"],
                        nicknames: ["My Garden"]
                    },
                    willReportState: true,
                    attributes: {
                        sensorStatesSupported: [
                            {
                                name: "MoistureLevel",
                                numericCapabilities: {
                                    rawValueUnit: "PERCENTAGE",
                                    minValue: 0,
                                    maxValue: 100
                                }
                            },
                            {
                                name: "Temperature",
                                numericCapabilities: {
                                    rawValueUnit: "CELSIUS",
                                    minValue: -20,
                                    maxValue: 50
                                }
                            },
                            {
                                name: "Humidity",
                                numericCapabilities: {
                                    rawValueUnit: "PERCENTAGE",
                                    minValue: 0,
                                    maxValue: 100
                                }
                            }
                        ]
                    },
                    deviceInfo: {
                        manufacturer: "YourCompany",
                        model: "GardenMonitorV1",
                        hwVersion: "1.0",
                        swVersion: "1.0.1"
                    }
                }]
            }
        });
    }

    // Handle Smart Home QUERY intent
    if (body.inputs && body.inputs[0].intent === 'action.devices.QUERY') {
        try {
            console.log("Full QUERY request:", JSON.stringify(body, null, 2));
            const snapshot = await db.ref("monitor").once("value");
            const monitorValue = snapshot.val() || { SoilMoisture: 0, Temperature: 0, Humidity: 0 };

            const moisture = monitorValue.SoilMoisture || 0;
            const temperature = monitorValue.temp || 0;
            const humidity = monitorValue.humidity || 0;

            console.log("Handling QUERY intent");
            console.log("Monitor values:", monitorValue);

            let moistureState = moisture > 60 ? "well-watered" : moisture > 30 ? "needs watering" : "dry";
            let tempState = temperature > 30 ? "hot" : temperature > 15 ? "moderate" : "cold";
            let humidityState = humidity > 70 ? "high" : humidity > 30 ? "moderate" : "low";

            // Create a verbal status message
            const statusMessage = `The garden conditions are as follows: 
                Moisture level is ${moisture}%, which is ${moistureState}. 
                Temperature is ${temperature}°C, which is ${tempState}. 
                Humidity is ${humidity}%, which is ${humidityState}.`;

            console.log("Status message:", statusMessage);

            // const response = {
            //     requestId: body.requestId,
            //     payload: {
            //         devices: {
            //             garden: {
            //                 status: "SUCCESS",
            //                 online: true,
            //                 states: {
            //                     SensorState: {
            //                         MoistureLevel: {
            //                             currentSensorState: moistureState,
            //                             rawValue: moisture
            //                         },
            //                         Temperature: {
            //                             currentSensorState: tempState,
            //                             rawValue: temperature
            //                         },
            //                         Humidity: {
            //                             currentSensorState: humidityState,
            //                             rawValue: humidity
            //                         }
            //                     },
            //                     online: true
            //                 }
            //             }
            //         }
            //     },
            //     // Place the statusMessage directly here, outside of a "voice" object
            //     fulfillmentText: statusMessage,
            // };

            const response = {
                
                    "requestId": "ff36a3cc-ec34-11e6-b1a0-6437dbd0e57a",
                    "payload": {
                        "devices": {
                            "garden": {
                                "status": "SUCCESS",
                                "online": true,
                                "states": {
                                    "SensorState": {
                                        "MoistureLevel": {
                                            "currentSensorState": "well-watered",
                                            "rawValue": 80
                                        },
                                        "Temperature": {
                                            "currentSensorState": "moderate",
                                            "rawValue": 25.3
                                        },
                                        "Humidity": {
                                            "currentSensorState": "moderate",
                                            "rawValue": 43
                                        }
                                    },
                                    "online": true
                                }
                            }
                        }
                    },
                    "fulfillmentText": "Test message."
            }

            console.log("Sending response:", JSON.stringify(response, null, 2));
            return res.json(response);
        } catch (error) {
            console.error("Error fetching sensor data:", error);
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

    // Handle Dialogflow (Google Assistant text queries)
    if (req.body.queryResult) {
        const userQuery = req.body.queryResult.queryText?.toLowerCase() || "";
        console.log("Dialogflow Request:", userQuery);

        if (userQuery.includes("moisture") || userQuery.includes("temperature") || userQuery.includes("humidity")) {
            try {
                // Fetch sensor data from Firebase
                const snapshot = await db.ref("monitor").once("value");
                const sensorData = snapshot.val() || { SoilMoisture: 0, Temperature: 0, Humidity: 0 };

                const moisture = sensorData.SoilMoisture || 0;
                const temperature = sensorData.temp || 0;
                const humidity = sensorData.humidity || 0;

                let message = `The garden conditions are: 
                Moisture is ${moisture}%. 
                Temperature is ${temperature}°C. 
                Humidity is ${humidity}%.`;

                return res.json({
                    fulfillmentMessages: [
                        {
                            text: {
                                text: [message]
                            }
                        }
                    ],
                    structuredResponse: {
                        voice: {
                            text: message
                        }
                    }
                });
            } catch (error) {
                console.error("Error fetching sensor data:", error);
                return res.json({
                    fulfillmentText: "I couldn't retrieve the garden data. Try again later!"
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