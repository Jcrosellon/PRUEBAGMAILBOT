const { obtenerDatosClientes } = require('./excelReader');

const { clientes } = obtenerDatosClientes('./ControlFacturasVentas.xlsm');

const facturasWilmer = clientes.filter(c =>
    c.asesor &&
    c.asesor.toUpperCase().trim() === 'WILMER TAVERA'
);

console.log(`🧾 Total facturas de WILMER TAVERA: ${facturasWilmer.length}`);
console.log(`🧾 Estados de esas facturas:`);

const resumen = {};

facturasWilmer.forEach(f => {
    const estado = (f.estado || 'SIN ESTADO').toUpperCase().trim();
    resumen[estado] = (resumen[estado] || 0) + 1;
});

console.table(resumen);
