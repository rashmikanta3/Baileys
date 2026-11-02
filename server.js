const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 3000;
const AUTH_DIR = process.env.AUTH_DIR || '/app/auth_info_baileys';
const API_PASSWORD = process.env.API_PASSWORD || 'TPSODL@SecretPass2026';

let sock = null;

// ==========================================
// 1. PASSWORD / API KEY SECURITY MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
    // Optional: allow public health check
    if (req.path === '/health') return next();

    // Check header 'x-api-key' or query parameter '?key='
    const providedKey = req.headers['x-api-key'] || req.query.key;
    if (!providedKey || providedKey !== API_PASSWORD) {
        return res.status(401).json({
            error: 'Unauthorized: Invalid or missing API password/key.'
        });
    }
    next();
});

// ==========================================
// 2. BAILEYS CONNECTION MANAGER
// ==========================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n======================================================');
            console.log('[!] SCAN THIS QR CODE WITH WHATSAPP:');
            console.log('======================================================\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[-] Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('[!] Logged out from WhatsApp. Clear container auth directory and restart.');
            }
        } else if (connection === 'open') {
            console.log('\n[✓] WhatsApp connection authenticated and live!\n');
        }
    });
}

// ==========================================
// 3. API ENDPOINTS
// ==========================================

// Health check (returns connection status)
app.get('/health', (req, res) => {
    res.json({
        status: sock ? 'running' : 'initializing',
        connected: Boolean(sock?.user),
        user: sock?.user || null
    });
});

// List all participating groups & JIDs
app.get('/groups', async (req, res) => {
    try {
        if (!sock) return res.status(503).json({ error: 'Socket not initialized' });
        const groups = await sock.groupFetchAllParticipating();
        const list = Object.values(groups).map(g => ({
            name: g.subject,
            jid: g.id
        }));
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send text message
app.post('/send-message', async (req, res) => {
    try {
        const { jid, message } = req.body;
        if (!sock) return res.status(503).json({ error: 'Socket not initialized' });
        if (!jid || !message) return res.status(400).json({ error: 'Missing jid or message' });

        const result = await sock.sendMessage(jid, { text: message });
        res.json({ status: 'success', id: result.key.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send image (Base64) + text caption
app.post('/send-image', async (req, res) => {
    try {
        const { jid, imageBase64, caption } = req.body;
        if (!sock) return res.status(503).json({ error: 'Socket not initialized' });
        if (!jid || !imageBase64) return res.status(400).json({ error: 'Missing jid or imageBase64' });

        const buffer = Buffer.from(imageBase64, 'base64');
        const result = await sock.sendMessage(jid, {
            image: buffer,
            caption: caption || ''
        });

        res.json({ status: 'success', id: result.key.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bind to 0.0.0.0 so Docker port mapping works externally and locally
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[✓] Baileys Docker service running on port ${PORT}`);
    connectToWhatsApp();
});