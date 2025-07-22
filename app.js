const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { obtenerDatosClientes } = require('./excelReader');
const { crearPDFConsolidado } = require('./pdfGenerator');

console.log('🛠️ Iniciando el bot de WhatsApp...');
console.log('-----------------------------------');

// Inicializar cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    console.log('🔵 Esperando conexión... Escanea el QR a continuación:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ ¡Cliente conectado a WhatsApp!');
    console.log('📂 Leyendo archivo Excel...');

    const { clientes, asesores } = obtenerDatosClientes('./ControlFacturasVentas.xlsm');

    console.log(`📄 Clientes encontrados (estado RECOGEN): ${clientes.length}`);
    console.log(`🧑‍💼 Asesores encontrados: ${asesores.length}`);

    for (const asesor of asesores) {
        console.log('-----------------------------------');
        console.log(`🎯 Procesando asesor: ${asesor.asesor}`);
        
        const telefonoFormateado = `${asesor.telefono}@c.us`;
    
        const clientesAsesor = clientes.filter(c =>
            c.asesor &&
            c.estado &&
            c.asesor.toUpperCase().trim() === asesor.asesor.toUpperCase().trim() &&
            c.estado.toUpperCase().trim() === 'RECOGEN'
        );
        
        
        // 🛑 Si el asesor no tiene clientes, omitir envío
        if (clientesAsesor.length === 0) {
            console.log(`⚠️ ${asesor.asesor} no tiene facturas asignadas. Se omite el envío.`);
            continue; // Salta al siguiente asesor
        }
        
        // ✅ Ahora sí genera el PDF y continúa con el envío
        const pdfPath = await crearPDFConsolidado(asesor.asesor, clientesAsesor);
        

    
        try {
            if (!fs.existsSync(pdfPath)) {
                console.error(`❌ El archivo no existe: ${pdfPath}`);
                continue;
            }
    
            // --- 🔥 Nueva sección de LOG ---
            console.log(`📂 Enviando a ${asesor.asesor}`);
            console.log(`🧾 Documento: ${path.basename(pdfPath)}`);
            console.log(`🧾 Facturas incluidas:`);
    
            const clientesAsesor = clientes.filter(c =>
                c.asesor &&
                c.estado &&
                c.asesor.toUpperCase().trim() === asesor.asesor.toUpperCase().trim() &&
                c.estado.toUpperCase().trim() === 'RECOGEN'
            );
            
                
    
            if (clientesAsesor.length === 0) {
                console.warn(`⚠️ No se encontraron facturas asignadas a ${asesor.asesor}`);
            }
    
            clientesAsesor.forEach((cliente, index) => {
                console.log(`   #${index + 1} ${cliente.nombreCliente}`);
            });
    
            console.log(`✅ Total facturas para ${asesor.asesor}: ${clientesAsesor.length}`);
            // --- 🔥 Fin sección nueva ---
    
            const pdfBase64 = fs.readFileSync(pdfPath, { encoding: 'base64' });
            const media = new MessageMedia('application/pdf', pdfBase64, path.basename(pdfPath));
            await client.sendMessage(telefonoFormateado, media);
    
            const mensajePersonalizado = asesor.mensaje.replace('(Asesor)', asesor.asesor);
            await client.sendMessage(telefonoFormateado, mensajePersonalizado);
    
            console.log(`✅ Mensaje personalizado enviado a ${asesor.asesor}: "${mensajePersonalizado}"`);
    
            // 🔥 Eliminar el PDF después
            fs.unlink(pdfPath, (err) => {
                if (err) {
                    console.error(`❌ Error eliminando el PDF de ${asesor.asesor}:`, err.message);
                } else {
                    console.log(`🗑️ PDF eliminado: ${pdfPath}`);
                }
            });
    
        } catch (err) {
            console.error(`❌ Error enviando a ${asesor.asesor}:`, err.message);
        }
    }
    


    console.log('🏁 ¡Todos los mensajes y PDFs consolidados enviados!');
});

client.initialize();
