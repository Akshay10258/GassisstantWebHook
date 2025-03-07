const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Store OAuth codes (in-memory for testing)
const authCodes = new Map();

app.get("/", (req, res) => {
    const { client_id, redirect_uri, state } = req.query;
    console.log("OAuth authorize request received:", req.query);
    const authCode = 'auth-' + Math.random().toString(36).substring(2);
    authCodes.set(authCode, { client_id, redirect_uri });
    
    // Log what we're redirecting to
    console.log(`Redirecting to: ${redirect_uri}?code=${authCode}&state=${state}`);
    
    res.redirect(`${redirect_uri}?code=${authCode}&state=${state}`);
});

// Handle other methods
app.all("*", (req, res) => {
    res.status(405).send("Method not allowed");
});

module.exports = app;