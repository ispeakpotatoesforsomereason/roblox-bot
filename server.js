const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(publicDir, 'index.html');

app.use(express.json());

// change this line to allow default index serving
app.use(express.static(publicDir));

// delete the sendIndexPage function and custom routes entirely. 
// express.static handles '/' and '/index.html' out of the box without breaking headers.


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
        return next();
    }

    return res.status(401).json({ error: "Invalid password or temp code" });
}

// store bot data: botName -> { ws, username, time }
const bots = new Map();

wss.on('connection', (ws) => {
    ws.isAlive = true;
    let registeredName = null;

    console.log(`[+] New client connected. Total clients: ${wss.clients.size}`);

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);

            if (data.type === 'updateStats') {
                registeredName = data.username;
                bots.set(registeredName, {
                    ws,
                    username: data.username,
                    time: data.time ?? 0
                });
                console.log(`[*] ${registeredName} stats updated: time = ${data.time}`);
            }
        } catch (e) {
            // non-json or malformed message
        }
    });

    ws.on('close', () => {
        if (registeredName) {
            bots.delete(registeredName);
            console.log(`[-] Bot ${registeredName} disconnected.`);
        }
    });

    ws.on('error', () => {
        if (registeredName) bots.delete(registeredName);
    });
});

// heartbeat ping every 30s
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// get list of bots and their reported time attribute
app.post('/api/bots', verifyAuth, (req, res) => {
    const botList = [];
    bots.forEach((botData, name) => {
        if (botData.ws.readyState === WebSocket.OPEN) {
            botList.push({
                username: botData.username,
                time: botData.time
            });
        }
    });
    res.json({ success: true, bots: botList });
});

// send command to specific bots or all
app.post('/api/command', verifyAuth, (req, res) => {
    const { action, payload, targets } = req.body;
    const message = JSON.stringify({ action, payload });
    let delivered = 0;

    bots.forEach((botData, name) => {
        if (!targets || targets.includes(name)) {
            if (botData.ws.readyState === WebSocket.OPEN) {
                try {
                    botData.ws.send(message);
                    delivered++;
                } catch (e) {
                    bots.delete(name);
                }
            } else {
                bots.delete(name);
            }
        }
    });

    res.json({ success: true, deliveredBots: delivered });
});

function startServer(startPort) {
    const host = '0.0.0.0';
    const maxAttempts = 10;

    const tryListen = (port) => {
        const handleListenError = (err) => {
            if (err.code === 'EADDRINUSE' && port < startPort + maxAttempts - 1) {
                const nextPort = port + 1;
                console.warn(`Port ${port} is busy, trying ${nextPort}...`);
                tryListen(nextPort);
                return;
            }

            console.error('Failed to start server:', err);
            process.exit(1);
        };

        server.removeAllListeners('error');
        server.once('error', handleListenError);

        server.listen(port, host, () => {
            server.removeAllListeners('error');
            console.log(`Control panel active on port ${port}`);
        });
    };

    tryListen(startPort);
}

const PORT = Number(process.env.PORT) || 3000;
startServer(PORT);
