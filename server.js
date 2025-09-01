const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyCors = require('@fastify/cors');
require("dotenv").config();
const path = require("path");
const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { ECP } = require('./ECP');

let sessionObj = {};

const formatDate = (dateString) => {
  const [datePart, timePart] = dateString.split(' ');
  const [year, month, day] = datePart.split('-');
  const [hours, minutes] = timePart.split(':');

  const date = new Date(`20${year}-${month}-${day}T${hours}:${minutes}:00`);
  const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} alle ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return formattedDate;
};

// Fastify instance
const fastify = Fastify({
  logger: false,
  bodyLimit: 10 * 1024 * 1024
});

// Static files
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'client', 'public'),
  prefix: '/'
});

// CORS
fastify.register(fastifyCors, {
  origin: [
    "https://test-comparatore.netlify.app",
    "https://leadsystem-test.netlify.app",
    "http://localhost:3000",
    "https://leadsystemfunnel-production.up.railway.app"
  ]
});

let client;
let store;

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
        '--single-process',
        '--disable-gpu'
      ]
    }
  });
  console.log('connessione');

  // WHATSAPP CONNECTION
  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('Client is ready!');
    client.getChats().then(async (chats) => {
      const group1 = chats.filter(c => c.name?.trim() === "LeadSystem - Vercelli (UNIATLAS)");
      const group2 = chats.filter(c => c.name.trim() === "LeadSystem - Ansi Somma");
      console.log(group1)
      console.log(group2)
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

  client.initialize();
}

// Routes
fastify.post('/webhook-lead-ecp-notification', async (request, reply) => {
  console.log(request.body)
  if (!client) {
    return reply.code(503).send('WhatsApp client non inizializzato. Riprova più tardi.');
  }
  try {
    const ecpId = request.body.ecpId;
    const leads = request.body.leads;
    const volta = request.body.volta;
    const orientatore = request.body.orientatore ? request.body.orientatore : null;
    const knownEcp = ECP.find(item => item._id === ecpId);
    if (knownEcp) {
      const leadMessage = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}`;
      const leadMessageVolta = `È entrata una nuova lead${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''} per istituto Volta! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}${leads.utmContent && leads.utmContent !== "" ? `\n• ${leads.utmContent}` : ""}`;
      const leadMessagePrequalificaVolta = `È entrata una nuova lead Qualificata! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}\n• ${leads.corsoInteressato || ""}\n• ${leads.provincia || ""}`;
      const leadMessagePrequalificaComparacorsi = `È entrata una nuova lead Qualificata${(orientatore && orientatore.nome && orientatore.cognome) ? ` assegnata a ${orientatore.nome} ${orientatore.cognome}` : ''}! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono} ${leads.appDate && leads.appDate !== "" ? `\n• Appuntamento: ${formatDate(leads.appDate)}` : ""}`;
      const { waId } = knownEcp;

      await client.sendMessage(
        waId._serialized,
        ecpId == "678f89da98becb24b578c3a5" ? leadMessagePrequalificaVolta :
        leads.prequalificaSpostato && (ecpId == "64c8d506f67b84dfe65a2d8f" || ecpId == "668512a3e704f9d7c83d5c59" || ecpId == "67b5e7addd9709f728e108a5") ? leadMessagePrequalificaComparacorsi :
        volta ? leadMessageVolta :
        leadMessage
      )
        .then(() => console.log("Messaggio inviato a", knownEcp.name, "per la lead:", leads.nome, leads.cognome))
        .catch(error => console.error("Errore nell'invio del messaggio:", error));
      console.log(`Messaggio inviato a ${knownEcp.name}`);
    } else {
      console.log(`ECP non trovato con id: ${ecpId}`);
    }
    reply.code(200).send('Messaggi inviati con successo agli ECP.');
  } catch (error) {
    console.error('Errore durante l\'invio dei messaggi:', error);
    reply.code(500).send('Errore durante l\'invio dei messaggi.');
  }
});

fastify.post('/webhook-lead-luiss', async (request, reply) => {
  console.log(request.body)
  if (!client) {
    return reply.code(503).send('WhatsApp client non inizializzato. Riprova più tardi.');
  }
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
    const ecpId = request.body.ecpId;
    const leads = request.body.leads;
    const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}`;
    const { waId } = luissGroup;

    await client.sendMessage(waId._serialized, leadMessage)
      .then(() => console.log("Messaggio inviato a", luissGroup.name, "per la lead:", leads.nome, leads.cognome))
      .catch(error => console.error("Errore nell'invio del messaggio:", error));
    console.log(`Messaggio inviato a ${luissGroup.name}`);
    reply.code(200).send('Messaggi inviati con successo agli ECP.');
  } catch (error) {
    console.error('Errore durante l\'invio dei messaggi:', error);
    reply.code(500).send('Errore durante l\'invio dei messaggi.');
  }
});

// DB connect and WhatsApp client init
mongoose.connect('mongodb+srv://mattianorisbusiness:rTn5AIQzwPXqitLJ@db0.8jby7.mongodb.net/?retryWrites=true&w=majority&appName=DB0').then(() => {
  store = new MongoStore({ mongoose: mongoose });
  console.log('MongoDB Connesso!!!')
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

const PORT = process.env.PORT || 3080;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is running on ${address}`);
});
