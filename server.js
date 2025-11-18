const express = require('express');
const cors = require('cors');
require("dotenv").config();
const path = require("path");
const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const webQrcode = require('qrcode');
const { ECP } = require('./ECP');

let sessionObj = {};
let currentQr = null;

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} alle ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return formattedDate;
};

new Promise(r => setTimeout(r, 1000)).then(() => {
  let client;
  
  const connectClient = () => {
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
    console.log('Client is ready!');
    client.getChats().then(async(chats) => {
      //console.log(chats[0])
      const group1 = chats.filter(c => c.name?.toLowerCase().includes("Rho"));
      // const group2 = chats.filter(c => c.name.trim() === "LeadSystem - Ansi Somma");
      // const group3 = chats.filter(c => c.name.trim().includes("LeadSystem - Universitas (Turro"));
      // const group4 = chats.filter(c => c.name.trim().includes("LeadSystem - BRA (Polo scolastico europeo)"));
      //const group3 = chats.filter(c => c.name.trim() === "LeadSystem - Corsi Uni");
      //const group4 = chats.filter(c => c.name.trim() === "LeadSystem - Delma Formazione");
      console.log(group1)
      // console.log(group2)
      // console.log(group3)
      // console.log(group4)
      //console.log(group4)

      /*if (group1) {
        try {
          await client.sendMessage(group1[0].id._serialized, "Ciao a tutti! Questo è un messaggio di prova.");
          console.log('Messaggio inviato con successo al gruppo 1');
        } catch (error) {
          console.error('Errore nell\'invio del messaggio al gruppo 1:', error);
        }
      } else {
        console.log('Gruppo 1 non trovato');
      }*/
      //console.log(group2)
      //console.log(group3)
    }).catch((err) => {
        console.error('Si è verificato un errore durante la ricerca della chat:', err);
    });
  });
  //"whatsapp-web.js": "github:pedroslopez/whatsapp-web.js#v1.26.0",
  client.on("remote_session_saved", () => {
    console.log("Sessione salvata!")
  })

  client.on('disconnect', () => {
    console.log('Il client WhatsApp si è disconnesso. Tentativo di riconnessione...');
    setTimeout(connectClient, 5000);
  });

  client.on('auth_failure', () => {
    console.log('Fallimento dell\'autenticazione. Riavvio del server...');
    process.exit(1);
  });

  app.get("/groups/:query", async (req, res) => {
    const query = req.params.query;
    const groups = await client.getChats();
    const group = groups.filter(g => g.name?.toLowerCase().includes(query.toLowerCase())).map(g =>( {name: g.name, id: g.id._serialized}));
    res.status(200).json(group);
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
              const leadMessageVolta = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''} per istituto Volta! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}${leads.contenuto_utm && leads.contenuto_utm !== "" ? `\n• ${leads.contenuto_utm}` : ""}`;
              const leadMessagePrequalificaVolta = `È entrata una nuova lead Qualificata! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}\n• ${leads.corso_laurea || ""}\n• ${leads.provincia || ""}`;
              const leadMessagePrequalificaComparacorsi = `È entrata una nuova lead Qualificata${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono} ${leads.eventi_calendario?.[0] && leads.eventi_calendario?.[0].data !== "" ? `\n• Appuntamento: ${formatDate(leads.eventi_calendario?.[0].data)}` : ""}`;
                //const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono || leads.telefono}`;
                const { waId } = knownEcp;

                await client.sendMessage(waId._serialized, 
                  (ecpId == "678f89da98becb24b578c3a5" || ecpId == '691b489963c64b0cea5c73f5') ? leadMessagePrequalificaVolta : 
                  leads.prequalificazione_spostata && (ecpId == "64c8d506f67b84dfe65a2d8f" || ecpId == "668512a3e704f9d7c83d5c59" || ecpId == "67b5e7addd9709f728e108a5") ? leadMessagePrequalificaComparacorsi : 
                  volta ? leadMessageVolta : ecpId == "68f8ae7dccb51d3308fea01a" ? leadMessageFormatemp :
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
    res.setHeader("Content-Type", "image/png");
    const stream = await webQrcode.toFileStream(res, currentQr, { type: "png" });
  });

  client.initialize();

  }

  connectClient();
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
