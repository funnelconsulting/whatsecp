const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const webQrcode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { ECP } = require('./ECP');
const momentTimezone = require('moment-timezone');

const app = express();

// Middleware
app.use(express.static(path.join(__dirname, 'client', 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(
  cors({
    origin: ["https://test-comparatore.netlify.app", "https://leadsystem-test.netlify.app", "http://localhost:3000", "https://leadsystemfunnel-production.up.railway.app"],
  })
);

// State
let sock = null;
let currentQr = null;
let isReady = false;
let userInfo = null;

// Auth directory
const AUTH_DIR = path.join(__dirname, 'baileys-session');

// Logger silenzioso (solo errori)
const logger = pino({ level: 'silent' });

// Connect to WhatsApp
const connectClient = async () => {
  // Crea la directory se non esiste
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['WhatsApp Server', 'Chrome', '120.0.0'],
  });

  // Salva le credenziali quando cambiano
  sock.ev.on('creds.update', saveCreds);

  // Gestione connessione
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      isReady = false;
      console.log('📱 QR Code ricevuto. Scansiona con WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      currentQr = null;
      isReady = true;
      userInfo = sock.user;
      console.log('✅ Client WhatsApp pronto!');
      console.log(`📞 Connesso come: ${userInfo?.name || userInfo?.id}`);
    }

    if (connection === 'close') {
      isReady = false;
      userInfo = null;
      
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`🔌 Client disconnesso (codice: ${statusCode})`);

      if (shouldReconnect) {
        console.log('🔄 Tentativo di riconnessione...');
        setTimeout(connectClient, 3000);
      } else {
        console.log('👋 Logout effettuato. Rimuovo sessione...');
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
      }
    }
  });

  // Log messaggi in arrivo
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.message) {
          const sender = msg.key.remoteJid;
          const text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       '[media]';
          console.log(`📨 Messaggio da ${sender}: ${text.substring(0, 50)}...`);
        }
      }
    }
  });
};

// Helper: formatta il numero per WhatsApp
const formatNumber = (number) => {
  if (number.includes('@')) return number;
  const cleaned = number.replace(/\D/g, '');
  return `${cleaned}@s.whatsapp.net`;
};

// Helper: formatta la data
const formatDate = (dateString) => {
  const tempDate = new Date(dateString);
  const minutesOffset = momentTimezone.tz(new Date(), 'Europe/Rome').utcOffset();
  const date = new Date(tempDate.getTime() + minutesOffset * 60000);
  const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} alle ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return formattedDate;
};

// Helper: invia messaggio WhatsApp
const sendWhatsAppMessage = async (jid, message) => {
  if (!isReady || !sock) {
    throw new Error('WhatsApp non connesso');
  }
  await sock.sendMessage(jid, { text: message });
};

// ==================== ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsapp: {
      ready: isReady,
      hasQr: !!currentQr,
      user: userInfo ? {
        id: userInfo.id,
        name: userInfo.name
      } : null
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

  if (!isReady || !sock) {
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  }

  try {
    const chatId = formatNumber(to);
    await sock.sendMessage(chatId, { text: message });
    res.json({ success: true, chatId });
  } catch (error) {
    console.error('Errore invio messaggio:', error);
    res.status(500).json({ error: 'Errore invio messaggio', details: error.message });
  }
});

// Get all chats (groups)
app.get('/chats', async (req, res) => {
  if (!isReady || !sock) {
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  }

  try {
    const chats = await sock.groupFetchAllParticipating();
    const chatList = Object.entries(chats).map(([id, chat]) => ({
      id,
      name: chat.subject,
      isGroup: true,
      participants: chat.participants?.length || 0
    }));
    res.json(chatList);
  } catch (error) {
    console.error('Errore recupero chat:', error);
    res.status(500).json({ error: 'Errore recupero chat', details: error.message });
  }
});

// Search groups by name
app.get('/groups/:query', async (req, res) => {
  if (!isReady || !sock) {
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  }

  try {
    const { query } = req.params;
    const allGroups = await sock.groupFetchAllParticipating();
    const groups = Object.entries(allGroups)
      .filter(([_, group]) => group.subject?.toLowerCase().includes(query.toLowerCase()))
      .map(([id, group]) => ({
        id,
        name: group.subject
      }));
    res.json(groups);
  } catch (error) {
    console.error('Errore ricerca gruppi:', error);
    res.status(500).json({ error: 'Errore ricerca gruppi', details: error.message });
  }
});

// Logout
app.post('/logout', async (req, res) => {
  if (!sock) {
    return res.status(400).json({ error: 'Client non inizializzato' });
  }

  try {
    await sock.logout();
    isReady = false;
    currentQr = null;
    userInfo = null;
    res.json({ success: true, message: 'Disconnesso con successo' });
  } catch (error) {
    console.error('Errore logout:', error);
    res.status(500).json({ error: 'Errore logout', details: error.message });
  }
});

// ==================== WEBHOOK ECP ====================

app.post('/webhook-appointment-ecp', async (req, res) => {
  console.log(req.body);
  try {
    const minutesOffset = momentTimezone.tz(new Date(), 'Europe/Rome').utcOffset();
    const appointment = new Date(new Date(req.body.appointment).getTime() + minutesOffset * 60000);
    
    const { nome, cognome, telefono, ecpId, utm_medium } = req.body;

    const message = `La lead ${nome} ${cognome} con ha effettuato l'appuntamento\n• Telefono: ${telefono}\n• Appuntamento: ${appointment.toLocaleDateString()} alle ${appointment.getHours().toString().padStart(2, '0')}:${appointment.getMinutes().toString().padStart(2, '0')}`;
    
    const knownEcp = ECP.find(item => item._id === ecpId);
    if (knownEcp) {
      await sendWhatsAppMessage(knownEcp.waId._serialized, message);
      console.log("Messaggio inviato a", knownEcp.name, "per la lead:", nome, cognome);
    } else {
      console.log(`ECP non trovato con id: ${ecpId}`);
    }

  } catch (error) {
    console.error('Errore durante l\'invio del messaggio:', error);
  }
  res.status(200).send('Messaggio inviato con successo agli ECP.');
});

app.post('/webhook-lead-ecp-prequalifica', async (req, res) => {
  console.log(req.body);
  try {
    const ecpId = req.body.ecpId; 
    const leads = req.body.leads;
    const newStatus = req.body.newStatus;
    const orientatore = req.body.orientatore ? req.body.orientatore : null;
    
    const knownEcp = ECP.find(item => item._id === ecpId);
    if (knownEcp) {
      const leadMessageSQL = `È entrata una nuova lead Qualificata${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.
•⁠  ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono} 
${leads.eventi_calendario?.[0] && leads.eventi_calendario?.[0].data !== "" ? `• Appuntamento: ${formatDate(leads.eventi_calendario?.[0].data)}` : ""}`;
      
      const leadMessageIrraggiungibile = `È entrata una nuova lead non qualificata da richiamare${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.
•⁠  ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;
      
      const leadMessage = newStatus === "SQL" ? leadMessageSQL : leadMessageIrraggiungibile;
      
      await sendWhatsAppMessage(knownEcp.waId._serialized, leadMessage);
      console.log("Messaggio inviato a", knownEcp.name, "per la lead:", leads.nome, leads.cognome);
    } else {
      console.log(`ECP non trovato con id: ${ecpId}`);
    }
    res.status(200).send('Messaggi inviati con successo agli ECP.');
  } catch (error) {
    console.error('Errore durante l\'invio dei messaggi:', error);
    res.status(500).send('Errore durante l\'invio dei messaggi.');
  }
});

app.post('/webhook-lead-ecp-notification', async (req, res) => {
  console.log(req.body);
  try {
    const ecpId = req.body.ecpId; 
    const leads = req.body.leads;
    const volta = req.body.volta;
    const orientatore = req.body.orientatore ? req.body.orientatore : null;
    
    const knownEcp = ECP.find(item => item._id === ecpId);
    if (knownEcp) {
      const leadMessage = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;
      
      const leadMessageFormatemp = `È entrata una nuova lead per Formatemp! contattala subito.
•⁠ ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}
•⁠ ${leads.utm_campaign}`;

      const leadMessageEpicode = `È entrata una nuova lead per Epicode! contattala subito.
• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}
• ${leads.corso}
• Utm Medium: ${leads.utm_medium}`;

      const leadMessageVolta = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''} per istituto Volta! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}${leads.contenuto_utm && leads.contenuto_utm !== "" ? `\n• ${leads.contenuto_utm}` : ""}`;
      
      const leadMessagePrequalificaVolta = `È entrata una nuova lead Qualificata! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}\n• ${leads.corso_laurea || ""}\n• ${leads.provincia || ""}`;
      
      const leadMessagePrequalificaComparacorsi = `È entrata una nuova lead Qualificata${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono} ${leads.eventi_calendario?.[0] && leads.eventi_calendario?.[0].data !== "" ? `\n• Appuntamento: ${formatDate(leads.eventi_calendario?.[0].data)}` : ""}`;

      const messageToSend = 
        (ecpId == "678f89da98becb24b578c3a5" || ecpId == '691b489963c64b0cea5c73f5') ? leadMessagePrequalificaVolta : 
        leads.prequalificazione_spostata && (ecpId == "64c8d506f67b84dfe65a2d8f" || ecpId == "668512a3e704f9d7c83d5c59" || ecpId == "67b5e7addd9709f728e108a5") ? leadMessagePrequalificaComparacorsi : 
        volta ? leadMessageVolta : 
        ecpId == "68f8ae7dccb51d3308fea01a" ? leadMessageFormatemp : 
        ecpId == "69400a2c1dd4dd5a570d7eea" ? leadMessageEpicode :
        leadMessage;

      await sendWhatsAppMessage(knownEcp.waId._serialized, messageToSend);
      console.log("Messaggio inviato a", knownEcp.name, "per la lead:", leads.nome, leads.cognome);
    } else {
      console.log(`ECP non trovato con id: ${ecpId}`);
    }
    res.status(200).send('Messaggi inviati con successo agli ECP.');
  } catch (error) {
    console.error('Errore durante l\'invio dei messaggi:', error);
    res.status(500).send('Errore durante l\'invio dei messaggi.');
  }
});

app.post('/webhook-lead-luiss', async (req, res) => {
  console.log(req.body);
  const luissGroup = {
    name: "Luiss",
    _id: "6674220bc423baeeaa460161", 
    groupName: "ComparaCorsi - Luiss Business School",
    waId: {
      server: 'g.us',
      user: '120363298744307174',
      _serialized: '120363298744307174@g.us'
    },
  };
  
  try {
    const leads = req.body.leads;
    const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;

    await sendWhatsAppMessage(luissGroup.waId._serialized, leadMessage);
    console.log("Messaggio inviato a", luissGroup.name, "per la lead:", leads.nome, leads.cognome);
    res.status(200).send('Messaggi inviati con successo agli ECP.');
  } catch (error) {
    console.error('Errore durante l\'invio dei messaggi:', error);
    res.status(500).send('Errore durante l\'invio dei messaggi.');
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3080;

app.listen(PORT, () => {
  console.log(`🚀 Server avviato sulla porta ${PORT}`);
  connectClient();
});
