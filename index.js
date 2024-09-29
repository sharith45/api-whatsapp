const fs = require('fs');
const pino = require('pino');
const qrcode = require('qrcode'); 
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeInMemoryStore } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
let qrCodeString = null; 
let isConnected = false; // Variable para comprobar si la conexión está activa
let xeonBotInstance; // Guardar la instancia del bot
let serverUrl = ''; // Variable para almacenar la URL del servidor

app.use(express.json());
app.use(cors());

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

async function startXeonBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const XeonBotInc = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: ['Bot Neuroadvance', 'Chrome', '10.0'], 
        auth: state,
    });

    store.bind(XeonBotInc.ev);

    XeonBotInc.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            qrCodeString = qr; 
            console.log('Escanea el QR en tu navegador en la siguiente URL:');
            console.log(`${serverUrl}/qr`);
        }

        if (connection === 'open') {
            isConnected = true; // Marcar como conectado
            xeonBotInstance = XeonBotInc; // Guardar la instancia del bot
            console.log('Conectado a WhatsApp');
            console.log(`Número del dispositivo: ${XeonBotInc.user.id.split(':')[0]}`);
        }

        if (connection === 'close') {
            isConnected = false; // Marcar como desconectado
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) {
                console.log('Reconectando...');
                startXeonBot();
            }
        }
    });

    XeonBotInc.ev.on('creds.update', saveCreds);

    return XeonBotInc;
}

app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    console.log(`Petición recibida para enviar mensaje a ${number}: "${message}"`);

    if (!number || !message) {
        console.log('Error: El número o el mensaje están vacíos');
        return res.status(400).json({ error: 'El número y el mensaje son requeridos' });
    }

    if (!isConnected) {
        console.log('Error: No hay conexión activa con WhatsApp');
        return res.status(500).json({ success: false, error: 'No hay conexión activa con WhatsApp' });
    }

    try {
        console.log(`Enviando mensaje a ${number}`);
        await xeonBotInstance.sendMessage(`${number}@s.whatsapp.net`, { text: message });
        console.log(`Mensaje enviado exitosamente a ${number}`);
        res.status(200).json({ success: true, message: 'Mensaje enviado' });
    } catch (error) {
        console.error('Error al enviar el mensaje:', error);
        res.status(500).json({ success: false, error: 'Error al enviar el mensaje' });
    }
});

app.get('/qr', async (req, res) => {
    if (qrCodeString) {
        try {
            const qrCodeDataURL = await qrcode.toDataURL(qrCodeString); 
            res.send(`<img src="${qrCodeDataURL}" alt="Escanea el QR" />`);
        } catch (error) {
            res.status(500).json({ error: 'Error al generar el QR' });
        }
    } else {
        res.status(404).json({ error: 'QR no disponible, espera que se genere' });
    }
});

const port = process.env.PORT || 4000;

function startServer() {
    const server = app.listen(port, () => {
        serverUrl = `http://localhost:${port}`;
        console.log(`Servidor escuchando en el puerto ${port}`);
        console.log(`La URL del servidor es: ${serverUrl}`);
    });

    server.on('error', function (err) {
        if (err.code === 'EADDRINUSE') {
            console.log(`El puerto ${port} ya está en uso. Intentando con otro puerto...`);
            app.listen(0, function () {
                const newPort = this.address().port;
                serverUrl = `http://localhost:${newPort}`;
                console.log(`Servidor iniciado en el nuevo puerto ${newPort}`);
                console.log(`La URL del servidor es: ${serverUrl}`);
            });
        } else {
            console.error(err);
        }
    });

    process.on('uncaughtException', (err) => {
        console.error('Excepción no controlada:', err);
        console.log('Reiniciando servidor...');
        server.close(() => {
            startServer();
        });
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Rechazo no manejado en la promesa:', promise, 'razón:', reason);
        console.log('Reiniciando servidor...');
        server.close(() => {
            startServer();
        });
    });
}

startServer();
startXeonBot().catch(err => {
    console.error('Error al iniciar el bot:', err);
    process.exit(1); 
});

let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(`Actualización detectada en ${__filename}`);
    delete require.cache[file];
    require(file);
});
