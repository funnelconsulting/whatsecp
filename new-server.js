const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const webQrcode = require('qrcode');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// State
let client = null;
let currentQr = null;
let isReady = false;

// WhatsApp Client Configuration
const createClient = () => {
  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'main',
      dataPath: './wa-session'
    }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1032242366-alpha.html',
    },
    puppeteer: {

        executablePath: "/usr/src/app/chrome/linux-139.0.7258.154/chrome-linux64/chrome",
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });
};

// Connect to WhatsApp
const connectClient = () => {
  client = createClient();

  client.on('qr', (qr) => {
    currentQr = qr;
    isReady = false;
    console.log('📱 QR Code ricevuto. Scansiona con WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    currentQr = null;
    isReady = true;
    console.log('✅ Client WhatsApp pronto!');
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticazione completata');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Autenticazione fallita:', msg);
    isReady = false;
  });

  client.on('disconnected', (reason) => {
    console.log('🔌 Client disconnesso:', reason);
    isReady = false;
    currentQr = null;
    
    // Riconnessione automatica dopo 5 secondi
    setTimeout(() => {
      console.log('🔄 Tentativo di riconnessione...');
      connectClient();
    }, 5000);
  });

  client.initialize();
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsapp: {
      ready: isReady,
      hasQr: !!currentQr
    }
  });
});

// Get QR code as image
app.get('/qr', async (req, res) => {
  if (!currentQr) {
    return res.status(404).json({ 
      error: 'QR non disponibile',
      reason: isReady ? 'Già connesso' : 'In attesa di connessione'
    });
  }

  res.setHeader('Content-Type', 'image/png');
  await webQrcode.toFileStream(res, currentQr, { type: 'png' });
});

// Get QR code as base64
app.get('/qr/base64', async (req, res) => {
  if (!currentQr) {
    return res.status(404).json({ 
      error: 'QR non disponibile',
      reason: isReady ? 'Già connesso' : 'In attesa di connessione'
    });
  }

  const qrBase64 = await webQrcode.toDataURL(currentQr);
  res.json({ qr: qrBase64 });
});

// Send message
app.post('/send', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Parametri mancanti: to, message' });
  }

  if (!isReady || !client) {
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  }

  try {
    // Formatta il numero (rimuove + e aggiunge @c.us se necessario)
    const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;
    
    await client.sendMessage(chatId, message);
    res.json({ success: true, chatId });
  } catch (error) {
    console.error('Errore invio messaggio:', error);
    res.status(500).json({ error: 'Errore invio messaggio', details: error.message });
  }
});

// Get all chats
app.get('/chats', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  }

  try {
    const chats = await client.getChats();
    const chatList = chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount
    }));
    res.json(chatList);
  } catch (error) {
    console.error('Errore recupero chat:', error);
    res.status(500).json({ error: 'Errore recupero chat', details: error.message });
  }
});

// Search groups by name
app.get('/groups/:query', async (req, res) => {
  if (!isReady || !client) {
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  }

  try {
    const { query } = req.params;
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup && chat.name?.toLowerCase().includes(query.toLowerCase()))
      .map(group => ({
        id: group.id._serialized,
        name: group.name
      }));
    res.json(groups);
  } catch (error) {
    console.error('Errore ricerca gruppi:', error);
    res.status(500).json({ error: 'Errore ricerca gruppi', details: error.message });
  }
});

// Logout
app.post('/logout', async (req, res) => {
  if (!client) {
    return res.status(400).json({ error: 'Client non inizializzato' });
  }

  try {
    await client.logout();
    isReady = false;
    currentQr = null;
    res.json({ success: true, message: 'Disconnesso con successo' });
  } catch (error) {
    console.error('Errore logout:', error);
    res.status(500).json({ error: 'Errore logout', details: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3080;

app.listen(PORT, () => {
  console.log(`🚀 Server avviato sulla porta ${PORT}`);
  
  // Inizializza il client WhatsApp
  connectClient();
});
