const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store tokens (in-memory for testing)
const tokens = new Map();

app.post("/api/oauth-token", (req, res) => {
    console.log("OAuth token request received:", req.body);
    
    const { code, client_id, client_secret } = req.body;
    
    // For testing purposes, just issue a token without checking the code
    const accessToken = 'access-' + Math.random().toString(36).substring(2);
    const refreshToken = 'refresh-' + Math.random().toString(36).substring(2);
    
    tokens.set(accessToken, { client_id });
    
    console.log("Issuing token:", accessToken);
    
    res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refreshToken
    });
});

// Handle other methods
app.all("*", (req, res) => {
    res.status(405).send("Method not allowed");
});

module.exports = app;