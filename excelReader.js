const xlsx = require('xlsx');

function limpiarValor(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string') {
        let numero = parseFloat(valor.replace(/[^\d.-]/g, ''));
        return isNaN(numero) ? 0 : numero;
    }
    return 0;
}

function limpiarEncabezados(datos) {
    return datos.map(row => {
        const newRow = {};
        for (const key in row) {
            const cleanKey = key.trim(); // 🔥 Elimina espacios invisibles
            newRow[cleanKey] = row[key];
        }
        return newRow;
    });
}

function obtenerDatosClientes(ruta) {
    const workbook = xlsx.readFile(ruta);

    let datosGenerales = xlsx.utils.sheet_to_json(workbook.Sheets['RelacionGeneral'], { raw: true });
    let datosAsesor = xlsx.utils.sheet_to_json(workbook.Sheets['ContactoAsesor'], { raw: true });

    // 🔥 Limpiar encabezados invisibles
    datosGenerales = limpiarEncabezados(datosGenerales);
    datosAsesor = limpiarEncabezados(datosAsesor);

    const encabezados = Object.keys(datosGenerales[0]);

    const clientesRecogen = datosGenerales
        .filter(row => row.ESTADO && row.ESTADO.toString().trim().toUpperCase() === 'RECOGEN')
        .map(row => ({
            idFactura: row['ID FACTURA'],
            prefijoFactura: row['PREF'],
            numeroFactura: row['FACTURA'],
            nombreCliente: row['NOMBRE CLIENTE'],
            valor: limpiarValor(row['VALOR']), // ✅ Ahora seguro agarra
            fechaFactura: row['FECHA FACTURACION'],
            asesor: row['ASESOR'],
            estado: row['ESTADO']
        }));

        const asesores = datosAsesor
        .filter(a => a.NombreAsesor && a.Telefono) // ✅ usa los nombres reales
        .map(a => ({
            asesor: a.NombreAsesor.toString().trim(),
            telefono: a.Telefono.toString().trim(),
            mensaje: a.MensajePersonalizado ? a.MensajePersonalizado.toString().trim() : ''
        }));
    

    return { clientes: clientesRecogen, asesores };
}

module.exports = { obtenerDatosClientes };
