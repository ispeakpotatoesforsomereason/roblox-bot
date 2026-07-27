const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

const ADMIN_PASSWORD = "67sucksandpotatoesarebetterthanhumans"; // Change this to a secure password
const tempCodes = new Map();

app.post('/api/create-temp-code', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (10 * 60 * 1000);
    tempCodes.set(code, expiresAt);

    res.json({ code, expiresAt });
});

function verifyAuth(req, res, next) {
    const { auth } = req.body;
    if (!auth) return res.status(401).json({ error: "Missing authentication" });

    if (auth === ADMIN_PASSWORD) return next();

    if (tempCodes.has(auth)) {
        const expiresAt = tempCodes.get(auth);
        if (Date.now() > expiresAt) {
            tempCodes.delete(auth);
            return res.status(403).json({ error: "Temporary code expired" });
        }
        tempCodes.delete(auth);
        return next();
    }

    return res.status(401).json({ error: "Invalid password or temp code" });
}

const botSockets = new Set();

wss.on('connection', (ws) => {
    botSockets.add(ws);
    console.log(`[+] Bot connected. Total connected: ${botSockets.size}`);

    ws.on('close', () => {
        botSockets.delete(ws);
        console.log(`[-] Bot disconnected. Total connected: ${botSockets.size}`);
    });
});

app.post('/api/command', verifyAuth, (req, res) => {
    const { action, payload } = req.body;
    const message = JSON.stringify({ action, payload });
    let delivered = 0;

    botSockets.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            delivered++;
        }
    });

    res.json({ success: true, deliveredBots: delivered });
});

server.listen(3000, () => console.log('Control panel active on http://localhost:3000'));