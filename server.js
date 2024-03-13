const express = require('express');
const cors = require('cors');
require("dotenv").config();
const path = require("path");
const { Client, LocalAuth, Poll, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { fstat } = require('fs');
const { ECP } = require('./ECP');
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: 'dataSession'
    }),
    puppeteer: {
      headless: true,
      args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
      ]
    }
  });

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

/*WHATSAPP CONNECTION*/
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
  });
  
client.on('ready', () => {
  console.log('Client is ready!');
  //console.log(client);
  client.getChats().then(async(chats) => {
    const group1 = chats.filter(c => c.name === "LeadSystem - Alma");
    console.log(group1);
    //await client.sendMessage(group1[0].id._serialized, "Messaggio di prova").then((res) => console.log(res))
  }).catch((err) => {
      console.error('Si è verificato un errore durante la ricerca della chat:', err);
  });
});

/*app.post('/webhook-lead-ecp-notification', async (req, res) => {
  try {
      const ecpWithLeads = req.body.ecpLeadTracking; 

      for (const ecp of ecpWithLeads) {
        const { ecpId, leads } = ecp;
        console.log(leads)
        const knownEcp = ECP.find(item => item._id === ecpId);
          if (knownEcp) {
            for (const lead of leads) {
              const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${lead.nome} ${lead.cognome} - ${lead.numeroTelefono}`;
              const { waId } = knownEcp;
  
              await client.sendMessage(waId._serialized, leadMessage)
                  .then(() => console.log("Messaggio inviato a", knownEcp.name, "per la lead:", lead.nome, lead.cognome))
                  .catch(error => console.error("Errore nell'invio del messaggio:", error));
          }
              console.log(`Messaggio inviato a ${knownEcp.name}`);
          } else {
              console.log(`ECP non trovato con id: ${ecp.nameECP}`);
          }
      }
      res.status(200).send('Messaggi inviati con successo agli ECP.');
  } catch (error) {
      console.error('Errore durante l\'invio dei messaggi:', error);
      res.status(500).send('Errore durante l\'invio dei messaggi.');
  }
});*/

app.post('/webhook-lead-ecp-notification', async (req, res) => {
  console.log(req.body)
  try {
      const ecpId = req.body.ecpId; 
      const leads = req.body.leads;
        const knownEcp = ECP.find(item => item._id === ecpId);
          if (knownEcp) {
              const leadMessage = `È entrata una nuova lead! contattala subito.\n• ${leads.nome} ${leads.cognome} - ${leads.numeroTelefono}`;
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
  
  client.initialize();
