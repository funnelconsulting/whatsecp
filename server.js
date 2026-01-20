const express = require('express');
const cors = require('cors');
require("dotenv").config();
const path = require("path");
const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const webQrcode = require('qrcode');
const { ECP } = require('./ECP');
const momentTimezone = require('moment-timezone');

let sessionObj = {};
let currentQr = null;
let client = null;
let isClientReady = false;
let isConnectingClient = false;
let routesRegistered = false;
let reconnectTimeout = null;

const formatDate = (dateString) => {
  const tempDate = new Date(dateString);
  
  const minutesOffset = momentTimezone.tz(new Date(), 'Europe/Rome').utcOffset();

  const date = new Date(tempDate.getTime() + minutesOffset * 60000);

  const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} alle ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return formattedDate;
};

new Promise(r => setTimeout(r, 1000)).then(() => {
  const scheduleReconnect = (reason) => {
    isClientReady = false;
    currentQr = null;

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    console.log(`[WA] Disconnected (${reason}). Reconnect in 5s...`);
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connectClient().catch((err) => console.error("[WA] Reconnect failed:", err));
    }, 5000);
  };

  const connectClient = async () => {
    if (isConnectingClient) return;
    isConnectingClient = true;

    isClientReady = false;
    currentQr = null;

    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        console.error("[WA] Error destroying previous client:", err);
      } finally {
        client = null;
      }
    }

    client = new Client({
      // authStrategy: new LocalAuth({
      //   clientId: '1',
      //   dataPath: '/usr/src/app/chrome-data'
      // }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2410.1.html',
      },
      puppeteer: {
        // executablePath: "/usr/src/app/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome",
        executablePath: "/usr/src/app/chrome/linux-139.0.7258.154/chrome-linux64/chrome",
        // headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Necessario per ambienti con risorse limitate
            // '--user-data-dir=/usr/src/app/chrome-data'
            '--disable-gpu'
        ],
        userDataDir: '/usr/src/app/chrome-data'
      }
    });
    console.log('connessione')
  /*WHATSAPP CONNECTION*/
  client.on('qr', (qr) => {
    currentQr = qr;
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    isClientReady = true;
    console.log('Client is ready!');
  });

  client.on("change_state", (state) => {
    console.log("[WA] State:", state);
  });
  //"whatsapp-web.js": "github:pedroslopez/whatsapp-web.js#v1.26.0",
  client.on("remote_session_saved", () => {
    console.log("Sessione salvata!")
  })

  client.on('disconnected', (reason) => {
    scheduleReconnect(reason);
  });

  client.on('auth_failure', (message) => {
    console.error("[WA] Auth failure:", message);
    scheduleReconnect("auth_failure");
  });

  if (!routesRegistered) {
    app.get("/groups/:query", async (req, res) => {
      if (!client || !isClientReady) {
        return res.status(503).json({ error: "WhatsApp client not ready" });
      }

      try {
        const query = req.params.query;
        const groups = await client.getChats();
        const group = groups
          .filter(g => g.name?.toLowerCase().includes(query.toLowerCase()))
          .map(g => ({ name: g.name, id: g.id._serialized }));
        res.status(200).json(group);
      } catch (err) {
        console.error("Errore durante /groups:", err);
        res.status(500).json({ error: "Errore durante la ricerca dei gruppi" });
      }
    });

  app.post('/webhook-appointment-ecp', async (req, res) => {
    console.log(req.body)
    try {

        const minutesOffset = momentTimezone.tz(new Date(), 'Europe/Rome').utcOffset();

        const appointment = new Date(new Date(req.body.appointment).getTime() + minutesOffset * 60000);
    
      
        //const appointment = new Date(req.body.appointment);
        const {nome, cognome, telefono, ecpId, utm_medium} = req.body;

        const message = `La lead ${nome} ${cognome} con ha effettuato l'appuntamento\n• Telefono: ${telefono}\n• Appuntamento: ${appointment.toLocaleDateString()} alle ${appointment.getHours().toString().padStart(2, '0')}:${appointment.getMinutes().toString().padStart(2, '0')}`;
        
        const knownEcp = ECP.find(item => item._id === ecpId);
        if (knownEcp) {
          await client.sendMessage(knownEcp.waId._serialized, message)
            .then(() => console.log("Messaggio inviato a", knownEcp.name, "per la lead:", nome, cognome))
            .catch(error => console.error("Errore nell'invio del messaggio:", error));
          console.log(`Messaggio inviato a ${knownEcp.name}`);
        } else {
          console.log(`ECP non trovato con id: ${ecpId}`);
        }

    } catch (error) {
        console.error('Errore durante l\'invio del messaggio:', error);
    }
    res.status(200).send('Messaggio inviato con successo agli ECP.');
  });

  app.post('/webhook-lead-ecp-prequalifica', async (req, res) => {
    console.log(req.body)
    try {
        const ecpId = req.body.ecpId; 
        const leads = req.body.leads;
        const newStatus = req.body.newStatus;
        const orientatore = req.body.orientatore ? req.body.orientatore : null;
          const knownEcp = ECP.find(item => item._id === ecpId);
            if (knownEcp) {
              const leadMessageSQL = `È entrata una nuova lead Qualificata${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.
•⁠  ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono} 
${leads.eventi_calendario?.[0] && leads.eventi_calendario?.[0].data !== "" ? `• Appuntamento: ${formatDate(leads.eventi_calendario?.[0].data)}` : ""}`
              const leadMessageIrraggiungibile = `È entrata una nuova lead non qualificata da richiamare${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.
•⁠  ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`
              const leadMessage = newStatus === "SQL" ? leadMessageSQL : leadMessageIrraggiungibile;
              
                //const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;
                const { waId } = knownEcp;

                await client.sendMessage(waId._serialized, leadMessage)
                    .then(() => console.log("Messaggio inviato a", knownEcp.name, "per la lead:", leads.nome, leads.cognome))
                    .catch(error => console.error("Errore nell'invio del messaggio:", error));
                console.log(`Messaggio inviato a ${knownEcp.name}`);
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
    console.log(req.body)
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
•⁠ ${leads.utm_campaign}`
const leadMessageEpicode = `È entrata una nuova lead per Epicode! contattala subito.
• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}
• ${leads.corso}
• Utm Medium: ${leads.utm_medium}`
              const leadMessageVolta = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''} per istituto Volta! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}${leads.contenuto_utm && leads.contenuto_utm !== "" ? `\n• ${leads.contenuto_utm}` : ""}`;
              const leadMessagePrequalificaVolta = `È entrata una nuova lead Qualificata! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}\n• ${leads.corso_laurea || ""}\n• ${leads.provincia || ""}`;
              const leadMessagePrequalificaComparacorsi = `È entrata una nuova lead Qualificata${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono} ${leads.eventi_calendario?.[0] && leads.eventi_calendario?.[0].data !== "" ? `\n• Appuntamento: ${formatDate(leads.eventi_calendario?.[0].data)}` : ""}`;
                //const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;
                const { waId } = knownEcp;

                await client.sendMessage(waId._serialized, 
                  (ecpId == "678f89da98becb24b578c3a5" || ecpId == '691b489963c64b0cea5c73f5') ? leadMessagePrequalificaVolta : 
                  leads.prequalificazione_spostata && (ecpId == "64c8d506f67b84dfe65a2d8f" || ecpId == "668512a3e704f9d7c83d5c59" || ecpId == "67b5e7addd9709f728e108a5") ? leadMessagePrequalificaComparacorsi : 
                  volta ? leadMessageVolta : ecpId == "68f8ae7dccb51d3308fea01a" ? leadMessageFormatemp : ecpId == "69400a2c1dd4dd5a570d7eea" ? leadMessageEpicode :
                  leadMessage)
                    .then(() => console.log("Messaggio inviato a", knownEcp.name, "per la lead:", leads.nome, leads.cognome))
                    .catch(error => console.error("Errore nell'invio del messaggio:", error));
                console.log(`Messaggio inviato a ${knownEcp.name}`);
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
    console.log(req.body)
    const luissGroup = {
      name: "Luiss",
      _id: "6674220bc423baeeaa460161", 
      groupName: "ComparaCorsi - Luiss Business School",
      waId: {
        server: 'g.us',
        user: '120363298744307174',
        _serialized: '120363298744307174@g.us'
      },
    }
    try {
        const ecpId = req.body.ecpId; 
        const leads = req.body.leads;
        const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;
        const { waId } = luissGroup;

        await client.sendMessage(waId._serialized, leadMessage)
            .then(() => console.log("Messaggio inviato a", luissGroup.name, "per la lead:", leads.nome, leads.cognome))
            .catch(error => console.error("Errore nell'invio del messaggio:", error));
        console.log(`Messaggio inviato a ${luissGroup.name}`);
        res.status(200).send('Messaggi inviati con successo agli ECP.');
    } catch (error) {
        console.error('Errore durante l\'invio dei messaggi:', error);
        res.status(500).send('Errore durante l\'invio dei messaggi.');
    }
  });

    app.get('/qr', async (req, res) => {
      if (!currentQr) {
        return res.status(404).json({ error: "QR non disponibile (già loggato o in connessione)" });
      }

      res.setHeader("Content-Type", "image/png");
      await webQrcode.toFileStream(res, currentQr, { type: "png" });
    });

    routesRegistered = true;
  }

  await client.initialize();

  }

  connectClient().catch((err) => console.error("[WA] Initial connect failed:", err));
});

/*const client = new Client({
    authStrategy: new LocalAuth({
      clientId: '1',
      //dataPath: 'dataSession'
    }),
    webVersionCache:{
      type: 'remote', 
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html', 
    },
    puppeteer: {
      headless: true,
      args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
      ]
    }
  });*/

const app = express();
app.use(express.static(path.join(__dirname, 'client', 'public')));

app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin: ["https://test-comparatore.netlify.app", "https://leadsystem-test.netlify.app", "http://localhost:3000", "https://leadsystemfunnel-production.up.railway.app"],
  })
);

const PORT = process.env.PORT || 3080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
