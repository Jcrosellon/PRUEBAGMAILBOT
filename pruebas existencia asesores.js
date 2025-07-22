const { obtenerDatosClientes } = require('./excelReader');

const { clientes } = obtenerDatosClientes('./ControlFacturasVentas.xlsm');

const asesoresUnicos = new Set();

clientes.forEach(c => {
    asesoresUnicos.add((c.asesor || '').trim());
});

console.log("🕵️‍♂️ Asesores únicos encontrados:");
console.log([...asesoresUnicos].sort());

console.log("\n🧪 Revisando variantes de WILMER:");
[...asesoresUnicos].forEach(nombre => {
    if (nombre.toUpperCase().includes("WILMER")) {
        console.log(`👉 "${nombre}"`);
    }
});


