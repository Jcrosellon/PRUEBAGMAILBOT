// app.js
const { execSync, spawnSync, spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// -------------- PRECHECK: versiones & actualización --------------
const CRITICAL_DEPS = ['whatsapp-web.js', 'puppeteer']; // puedes añadir más si quieres
const UPDATE_MODE = process.env.AUTO_UPDATE_DEPS ? 'auto' : 'ask'; // 'ask' por defecto
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SKIP_FLAG = 'SKIP_UPDATE_CHECK';

function getInstalledVersion(pkg) {
    try {
        // Lee la versión instalada desde el package.json del paquete
        const p = require.resolve(path.join(pkg, 'package.json'));
        return require(p).version;
    } catch {
        return null; // no instalado
    }
}

function getLatestVersion(pkg) {
    try {
        const v = execSync(`${NPM_CMD} view ${pkg} version`, { stdio: ['ignore', 'pipe', 'pipe'] })
            .toString()
            .trim();
        return v || null;
    } catch {
        return null;
    }
}

function versionDiff(installed, latest) {
    if (!installed || !latest) return 'desconocida';
    return installed === latest ? 'al día' : `${installed} → ${latest}`;
}

async function maybePromptYes(question) {
    if (UPDATE_MODE === 'auto') return true;
    return await new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${question} (s/n): `, (ans) => {
            rl.close();
            const a = (ans || '').trim().toLowerCase();
            resolve(a === 's' || a === 'si' || a === 'y' || a === 'yes');
        });
    });
}

function installLatest(pkgs) {
    const args = ['i', ...pkgs.map((p) => `${p}@latest`)];
    console.log(`📦 Ejecutando: ${NPM_CMD} ${args.join(' ')}`);
    const res = spawnSync(NPM_CMD, args, { stdio: 'inherit', shell: true });
    if (res.status !== 0) {
        throw new Error(`La instalación falló (código ${res.status}).`);
    }
}

function restartSelf() {
    // Reinicia el proceso con una variable para saltar el check y evitar bucles
    const env = { ...process.env, [SKIP_FLAG]: '1' };
    const nodePath = process.execPath;
    const args = process.argv.slice(1);
    console.log('🔁 Reiniciando el proceso para tomar los cambios...\n');
    const child = spawn(nodePath, args, { stdio: 'inherit', env, shell: false });
    child.on('exit', (code) => process.exit(code));
}

async function preflight() {
    if (process.env[SKIP_FLAG] === '1') return; // ya actualizamos en este arranque

    console.log('🔎 Verificando dependencias críticas...\n');
    const report = [];
    const outdated = [];

    for (const pkg of CRITICAL_DEPS) {
        const installed = getInstalledVersion(pkg);
        const latest = getLatestVersion(pkg);
        const diff = versionDiff(installed, latest);
        report.push({ pkg, installed, latest, diff });
        if (!installed || (latest && installed !== latest)) {
            outdated.push(pkg);
        }
    }

    // Muestra reporte
    report.forEach(({ pkg, installed, latest, diff }) => {
        console.log(`• ${pkg}: instalado=${installed || '—'} | último=${latest || '—'} | ${diff}`);
    });
    console.log('');

    if (outdated.length === 0) {
        console.log('✅ Dependencias al día.\n');
        return;
    }

    const ok = await maybePromptYes(`Se encontraron actualizaciones para: ${outdated.join(', ')}. ¿Actualizar ahora?`);
    if (!ok) {
        console.log('⏭️ Saltando actualización. Continuando con el bot...\n');
        return;
    }

    try {
        installLatest(outdated);
    } catch (err) {
        console.error('❌ Error actualizando dependencias:', err.message);
        console.log('⏭️ Continuando sin actualizar...\n');
        return;
    }

    // Reinicia para cargar nuevas versiones
    restartSelf();
    // Importante: no continuar; el proceso se reemplaza por el hijo
    await new Promise(() => { });
}

// -------------- Lógica del bot --------------
async function main() {
    await preflight();

    const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
    const qrcode = require('qrcode-terminal');
    const { obtenerDatosClientes } = require('./excelReader');
    const { crearPDFConsolidado } = require('./pdfGenerator');

    const excelPath = path.resolve(__dirname, 'ControlFacturasVentas.xlsm');

    console.log('🛠️ Iniciando el bot de WhatsApp...');
    console.log('-----------------------------------');

    const client = new Client({
        authStrategy: new LocalAuth({
            // 👇 Guarda las credenciales en una carpeta fija
            dataPath: path.join(__dirname, '.wwebjs_auth'),
            clientId: 'bot-pdfs' // puedes darle un nombre único por si usas varias sesiones
        }),
        puppeteer: {
            headless: true,
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
    });


    // Eventos
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

                let telefonoFormateado = (asesor.telefono || '').replace(/[^0-9]/g, '');
                if (!telefonoFormateado.startsWith('57')) telefonoFormateado = `57${telefonoFormateado}`;
                telefonoFormateado = `${telefonoFormateado}@c.us`;

                const clientesAsesor = clientes.filter(c =>
                    c.asesor && c.estado &&
                    c.asesor.toUpperCase().trim() === asesor.asesor.toUpperCase().trim() &&
                    c.estado.toUpperCase().trim() === 'RECOGEN'
                );

                if (clientesAsesor.length === 0) {
                    console.log(`⚠️ ${asesor.asesor} no tiene facturas asignadas. Se omite el envío.`);
                    continue;
                }

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

                    // Enviar PDF
                    const pdfBase64 = fs.readFileSync(pdfPath, { encoding: 'base64' });
                    const media = new MessageMedia('application/pdf', pdfBase64, path.basename(pdfPath));
                    await client.sendMessage(telefonoFormateado, media);

                    // Mensaje
                    let mensaje = asesor.mensaje || 'Hola (Asesor), aquí está el reporte de facturas pendientes de firmar.';
                    mensaje = mensaje.replace('(Asesor)', asesor.asesor);
                    await client.sendMessage(telefonoFormateado, mensaje);

                    console.log(`✅ Mensaje enviado a ${asesor.asesor}: "${mensaje}"`);

                    // Limpia PDF
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
}

// Ejecuta
main().catch((e) => {
    console.error('❌ Error al iniciar:', e);
    process.exit(1);
});
