const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Para convertir fechas Excel tipo 45905 a 28/04/2025
function excelDateToJSDate(serial) {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toLocaleDateString('es-CO');
}

async function crearPDFConsolidado(asesor, datosClientes) {
    const pdfsFolder = path.join(__dirname, 'pdfs');
    if (!fs.existsSync(pdfsFolder)) {
        fs.mkdirSync(pdfsFolder);
    }

    const pdfPath = path.join(pdfsFolder, `${asesor}.pdf`);
    const doc = new PDFDocument({ margin: 15, size: 'A4', bufferPages: true });

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Portada
    doc.fontSize(22).fillColor('#000000').text('Reporte de Facturación', { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(16).fillColor('#000000').text(`Asesor: ${asesor}`, { align: 'left' });
    doc.fontSize(12).fillColor('#000000').text(`Fecha de generación: ${new Date().toLocaleDateString()}`, { align: 'left' });
    doc.moveDown(2);

    // Configuración de tabla
    const startX = 20;
    let currentY = doc.y;
    const rowHeight = 20;
    const headerHeight = 30;

    const columns = [
        { header: 'ID FACTURA', key: 'idFactura', width: 70 },
        { header: 'PREF', key: 'prefijoFactura', width: 40 },
        { header: 'FACTURA', key: 'numeroFactura', width: 60 },
        { header: 'NOMBRE CLIENTE', key: 'nombreCliente', width: 180 },
        { header: 'VALOR', key: 'valor', width: 70 },
        { header: 'FECHA <br> FACTURACION', key: 'fechaFactura', width: 90 },
        { header: 'ESTADO', key: 'estado', width: 60 }
    ];

    // Dibujar encabezado azul
    let x = startX;
    doc.rect(startX, currentY, columns.reduce((acc, col) => acc + col.width, 0), headerHeight)
       .fill('#007ACC');

    doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(11);
    columns.forEach(col => {
        const headerText = col.header.replace('<br>', ' '); // quitamos el <br> si existe
        const headerParts = headerText.split(' ');
    
        if (headerParts.length > 1) {
            // 🔥 Si tiene más de una palabra, dividimos en dos líneas
            doc.text(headerParts[0], x + 2, currentY + 4, { width: col.width - 4, align: 'center' });
            doc.text(headerParts.slice(1).join(' '), x + 2, currentY + 14, { width: col.width - 4, align: 'center' });
        } else {
            // 🔥 Si es una sola palabra
            doc.text(headerText, x + 2, currentY + 8, { width: col.width - 4, align: 'center' });
        }
        x += col.width;
    });
    

    currentY += headerHeight;

    // Dibujar filas de datos
    doc.font('Helvetica').fillColor('#000000').fontSize(9);

    datosClientes.forEach(cliente => {
        x = startX;
        columns.forEach(col => {
            let text = cliente[col.key] || '';

            if (col.key === 'valor') {
                // 🔥 Convertimos el texto a número limpio
                let numero = parseFloat(
                    String(text).replace(/[^\d.-]/g, '') // quita $ , espacios
                );
                if (!isNaN(numero)) {
                    text = `$ ${numero.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;
                } else {
                    text = '$ 0.00';
                }
            }
            

            if (col.key === 'fechaFactura' && typeof text === 'number') {
                text = excelDateToJSDate(text);
            }

            doc.rect(x, currentY, col.width, rowHeight).stroke('#CCCCCC');
            doc.text(text, x + 2, currentY + 5, { width: col.width - 4, align: 'center' });
            x += col.width;
        });

        currentY += rowHeight;

        if (currentY > 750) {
            doc.addPage();
            currentY = 50;

            // Redibujar encabezado en nueva página
            x = startX;
            doc.rect(startX, currentY, columns.reduce((acc, col) => acc + col.width, 0), headerHeight)
               .fill('#007ACC');

            doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(11);
            columns.forEach(col => {
                const headerText = col.header.replace('<br>', ' '); // quitamos el <br> si existe
                const headerParts = headerText.split(' ');
            
                if (headerParts.length > 1) {
                    // 🔥 Si tiene más de una palabra, dividimos en dos líneas
                    doc.text(headerParts[0], x + 2, currentY + 4, { width: col.width - 4, align: 'center' });
                    doc.text(headerParts.slice(1).join(' '), x + 2, currentY + 14, { width: col.width - 4, align: 'center' });
                } else {
                    // 🔥 Si es una sola palabra
                    doc.text(headerText, x + 2, currentY + 8, { width: col.width - 4, align: 'center' });
                }
                x += col.width;
            });
            

            currentY += headerHeight;
            doc.font('Helvetica').fillColor('#000000').fontSize(9);
        }
    });

    // 🔥 Agregar número de páginas
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(9).fillColor('gray')
            .text(`Página ${i + 1} de ${pages.count}`, 500, 800, { align: 'right' });
    }

    doc.end(); // Cerramos el documento aquí

    await new Promise((resolve, reject) => {
        stream.on('finish', () => {
            resolve();
        });
        stream.on('error', reject);
    });

    return pdfPath;
}

module.exports = { crearPDFConsolidado };
