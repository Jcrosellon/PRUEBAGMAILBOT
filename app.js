// app.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { obtenerDatosClientes } = require('./excelReader');
const { crearPDFConsolidado } = require('./pdfGenerator');

// Ruta absoluta al Excel
const excelPath = path.resolve(__dirname, 'ControlFacturasVentas.xlsm');

console.log('🛠️ Iniciando el bot de WhatsApp...');
console.log('-----------------------------------');

// Cliente WhatsApp en modo consola (headless)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // usamos Chromium de Puppeteer (no executablePath) para evitar cierres de Chrome externo
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-features=site-per-process',
            '--disable-web-security'
        ]
    }
    // ❌ QUITADO: webVersionCache (causaba el error por faltar remotePath)
    // webVersionCache: { type: 'remote' }
});

// ---- Eventos y logs útiles ----
client.on('loading_screen', (percent, message) =>
    console.log(`⏳ Cargando (${percent}%): ${message}`)
);

client.on('qr', (qr) => {
    console.log('🔵 Escanea este QR (ASCII) desde WhatsApp > Dispositivos vinculados > Vincular:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('🔐 Sesión autenticada (previa al ready)...'));

client.on('ready', async () => {
    try {
        console.log('✅ ¡Cliente conectado a WhatsApp!');
        console.log('📂 Leyendo archivo Excel...');

        const { clientes, asesores } = obtenerDatosClientes(excelPath);
        console.log(`📄 Clientes (RECOGEN): ${clientes.length}`);
        console.log(`🧑‍💼 Asesores: ${asesores.length}`);

        if (!Array.isArray(asesores) || asesores.length === 0) {
            console.warn('⚠️ No hay asesores en el Excel. Revisa ruta/sheets.');
            return;
        }

        for (const asesor of asesores) {
            console.log('-----------------------------------');
            console.log(`🎯 Procesando asesor: ${asesor.asesor}`);

            // Formatea teléfono a WhatsApp
            let telefonoFormateado = (asesor.telefono || '').replace(/[^0-9]/g, '');
            if (!telefonoFormateado.startsWith('57')) telefonoFormateado = `57${telefonoFormateado}`;
            telefonoFormateado = `${telefonoFormateado}@c.us`;

            // Filtra facturas "RECOGEN" por asesor
            const clientesAsesor = clientes.filter(c =>
                c.asesor && c.estado &&
                c.asesor.toUpperCase().trim() === asesor.asesor.toUpperCase().trim() &&
                c.estado.toUpperCase().trim() === 'RECOGEN'
            );

            if (clientesAsesor.length === 0) {
                console.log(`⚠️ ${asesor.asesor} no tiene facturas asignadas. Se omite el envío.`);
                continue;
            }

            // Genera el PDF consolidado
            const pdfPath = await crearPDFConsolidado(asesor.asesor, clientesAsesor);

            try {
                if (!fs.existsSync(pdfPath)) {
                    console.error(`❌ El archivo no existe: ${pdfPath}`);
                    continue;
                }

                console.log(`📂 Enviando a ${asesor.asesor}`);
                console.log(`🧾 Documento: ${path.basename(pdfPath)}`);
                console.log('🧾 Facturas incluidas:');
                clientesAsesor.forEach((c, i) => console.log(`   #${i + 1} ${c.nombreCliente}`));
                console.log(`✅ Total facturas para ${asesor.asesor}: ${clientesAsesor.length}`);

                // Envía PDF
                const pdfBase64 = fs.readFileSync(pdfPath, { encoding: 'base64' });
                const media = new MessageMedia('application/pdf', pdfBase64, path.basename(pdfPath));
                await client.sendMessage(telefonoFormateado, media);

                // Mensaje de texto
                let mensaje = asesor.mensaje || 'Hola (Asesor), aquí está el reporte de facturas pendientes de firmar.';
                mensaje = mensaje.replace('(Asesor)', asesor.asesor);
                await client.sendMessage(telefonoFormateado, mensaje);

                console.log(`✅ Mensaje enviado a ${asesor.asesor}: "${mensaje}"`);

                // Borra PDF
                fs.unlink(pdfPath, (err) => {
                    if (err) console.error(`❌ Error eliminando PDF de ${asesor.asesor}:`, err.message);
                    else console.log(`🗑️ PDF eliminado: ${pdfPath}`);
                });

            } catch (err) {
                console.error(`❌ Error enviando a ${asesor.asesor}:`, err.message);
            }
        }

        console.log('🏁 ¡Todos los mensajes y PDFs consolidados enviados!');
    } catch (error) {
        console.error('❌ Error global:', error);
    }
});

client.on('auth_failure', (msg) => console.error('❌ Error de autenticación:', msg));
client.on('disconnected', (reason) => console.log('🔴 Cliente desconectado:', reason));

// Captura errores silenciosos
process.on('unhandledRejection', (err) => console.error('💥 UnhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('💥 UncaughtException:', err));

console.log('🚀 Llamando client.initialize()...');
client.initialize();
