const express = require('express');
const cors = require('cors');
require("dotenv").config();
const path = require("path");
const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { ECP } = require('./ECP');

let sessionObj = {};

mongoose.connect('mongodb+srv://mattianorisbusiness:rTn5AIQzwPXqitLJ@db0.8jby7.mongodb.net/?retryWrites=true&w=majority&appName=DB0').then(() => {
  const store = new MongoStore({ mongoose: mongoose });
  console.log('MongoDB Connesso!!!')
  let client;
  
  const connectClient = () => {
    client = new Client({
      authStrategy: new RemoteAuth({
        clientId: '1',
        store: store,
        backupSyncIntervalMs: 300000,
      }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2410.1.html',
      },
      puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Necessario per ambienti con risorse limitate
            '--disable-gpu'
        ]
      }
    });
    console.log('connessione')
  /*WHATSAPP CONNECTION*/
  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('Client is ready!');
    client.getChats().then(async(chats) => {
      //console.log(chats[0])
      const group1 = chats.filter(c => c.name?.trim() === "LeadSystem - Ateneo San Michele");
      const group2 = chats.filter(c => c.name.trim() === "LeadSystem - AUGUSTEA");
      const group3 = chats.filter(c => c.name.trim() === "LeadSystem - Istituto Volta");
      const group4 = chats.filter(c => c.name.trim() === "LeadSystem - Pre-qualifica ComparaCorsi");
      console.log(group1)
      console.log(group2)
      console.log(group3)
      console.log(group4)

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

  app.post('/webhook-lead-ecp-notification', async (req, res) => {
    console.log(req.body)
    try {
        const ecpId = req.body.ecpId; 
        const leads = req.body.leads;
        const orientatore = req.body.orientatore ? req.body.orientatore : null;
          const knownEcp = ECP.find(item => item._id === ecpId);
            if (knownEcp) {
              const leadMessage = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}`;
                //const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}`;
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
        const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}`;
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
