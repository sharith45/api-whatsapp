const fs = require('fs');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const cors = require('cors'); // Importar CORS
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeInMemoryStore } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

app.use(express.json());

// Configurar CORS para permitir todas las solicitudes desde cualquier origen
app.use(cors()); // Usar CORS de manera global para todas las rutas

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

async function startXeonBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const XeonBotInc = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: ['Bot Conectado', 'Chrome', '10.0'], // Personaliza el nombre del dispositivo vinculado
        auth: state,
    });

    store.bind(XeonBotInc.ev);

    XeonBotInc.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Escanea el QR antes de que expire.');
        }

        if (connection === 'open') {
            console.log('Conectado a WhatsApp');
            console.log(`Número del dispositivo: ${XeonBotInc.user.id.split(':')[0]}`);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) {
                console.log('Reconectando...');
                startXeonBot();
            }
        }
    });

    XeonBotInc.ev.on('creds.update', saveCreds);

    app.post('/send-message', async (req, res) => {
        const { number, message } = req.body;
        console.log(`Petición recibida para enviar mensaje a ${number}: "${message}"`);

        if (!number || !message) {
            console.log('Error: El número o el mensaje están vacíos');
            return res.status(400).json({ error: 'El número y el mensaje son requeridos' });
        }

        try {
            console.log(`Enviando mensaje a ${number}`);
            await XeonBotInc.sendMessage(`${number}@s.whatsapp.net`, { text: message });
            console.log(`Mensaje enviado exitosamente a ${number}`);
            res.status(200).json({ success: true, message: 'Mensaje enviado' });
        } catch (error) {
            console.error('Error al enviar el mensaje:', error);
            res.status(500).json({ success: false, error: 'Error al enviar el mensaje' });
        }
    });

    return XeonBotInc;
}

const port = process.env.PORT || 4000;

app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
    console.log(`La URL del servidor es: http://localhost:${port}`);
}).on('error', function(err) {
    if (err.code === 'EADDRINUSE') {
        console.log(`El puerto ${port} ya está en uso. Intentando con otro puerto...`);
        app.listen(0, function() {
            const newPort = this.address().port;
            console.log(`Servidor iniciado en el nuevo puerto ${newPort}`);
            console.log(`La URL del servidor es: http://localhost:${newPort}`);
        });
    } else {
        console.error(err);
    }
});

startXeonBot().catch(err => console.error('Error al iniciar el bot:', err));

let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(`Actualización detectada en ${__filename}`);
    delete require.cache[file];
    require(file);
});
