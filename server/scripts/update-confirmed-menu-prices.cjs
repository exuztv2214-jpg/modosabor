// Prices explicitly confirmed by the owner, including the inversion of entries 1-10.
// This updates amounts only; Premium/Especial UI support is a separate change.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const plan = [
  [88,'1/4 de Pollo al Horno',7000],[96,'Albondigas en Salsa',7000],[84,'Albóndigas Rellenas',7000],
  [120,'Arrolladito de Matambre',7000],[138,'Arroz Chaufa',5000],[104,'Arroz con Pollo',5000],
  [106,'Bife de Pollo',7000],[64,'Bombita de Papas',7000],[66,'Canelones',5000],[130,'Canelones (Grandes)',7000],
  [118,'Cerdo a la Cerveza',7000],[134,'Cerdo al Horno con Verduras',7000],[136,'Chaufam',5000],
  [87,'Costeleta a la Riojana',7000],[83,'Costeleta de Res a Caballo',9000],
  [65,'Costillita de Cerdo al Horno con Papas',7000],[99,'Estofado',5000],[111,'Fideos Caseros',5000],
  [81,'Guiso de Lentejas y Arroz',5000],[125,'Hamburgesas de Pollo, Espinaca, Jamón y Queso',7000],
  [101,'Lasaña',7000],[94,'Marinera',7000],[91,'Matambre de Cerdo a la Pizza',7000],[108,'Merluza a la Romana',7000],
  [129,'Mila Napo',9000],[115,'Milanesa a Caballo',9000],[90,'Milanesa de Merluza',7000],
  [114,'Mondongo a la Española',5000],[123,'Niñitos Envueltos',7000],[133,'Osobuco al Malbec',9000],
  [102,'Pan de Carne',7000],[128,'Parrillada',12000],[124,'Pastel de Papas',7000],[95,'Pollo al Ajillo',7000],
  [137,'Pollo al Chanpiñon',7000],[86,'Pollo al Verdeo',7000],[135,'Pollo Deshuesado a la Crema',7000],
  [89,'Pollo Teriyaki',7000],[132,'Porcion de Costilla',16000],[122,'Quepi Rellenos',5000],
  [112,'Ravioles',5000],[127,'Salpicon de Ave',5000],[107,'Sopa de Albondigas de Maiz',7000],
  [67,'Suprema a la Napolitana',7000],[85,'Suprema a la Suiza',7000],[139,'Suprema Maryland',7000],
  [82,'Tarta de Pollo y Puerro',5000],[105,'Tortilla de Papas',7000],[68,'Wok de Verduras y Pollo',5000],
  [113,'Zapallitos Rellenos',7000],[110,'Ñoquis',5000],[92,'Ñoquis de Espinaca',5000],
];
assert.equal(plan.length,52);
assert.equal(new Set(plan.map(p=>p[0])).size,52);
assert(process.env.DB_FILE);
const apply = process.argv.includes('--apply');
const db = new Database(process.env.DB_FILE,{fileMustExist:true,readonly:!apply});
db.pragma('busy_timeout=5000');
const read = () => ({
  products:db.prepare('SELECT * FROM productos ORDER BY id').all(),
  history:db.prepare('SELECT * FROM menu_dia_historial ORDER BY id').all(),
  assignments:db.prepare('SELECT * FROM producto_opcion_listas ORDER BY producto_id,lista_id').all(),
});
try {
  const execute = () => {
    const before = read();
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());
    const ids = new Set(plan.map(p=>p[0]));
    // No daily menu exists today at audit time. Stop if this changes rather than silently
    // overwriting newly entered portions or letting them override the confirmed base prices.
    assert.equal(before.history.filter(h=>h.fecha>=date && ids.has(h.producto_id)).length,0,'Daily pricing changed: re-audit first');
    const existing = plan.filter(([id,name])=>{
      const row = before.products.find(p=>p.id===id);
      if (!row && id===136) return false; // Independently removed by the operator; never recreate.
      assert.equal(row?.nombre,name,`Identity changed: ${id}`);
      assert.equal(row.activo,1,`Availability changed: ${id}`);
      return true;
    });
    const changes = existing.map(([id,nombre,pesos])=>({id,nombre,before:before.products.find(p=>p.id===id).precio/100,after:pesos})).filter(c=>c.before!==c.after);
    if (!apply) return {reviewed:existing.length,missing:plan.filter(p=>!existing.includes(p)),changes};
    const folder=path.join(path.dirname(process.env.DB_FILE),'catalog-option-backups');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const backup=path.join(folder,`before-confirmed-prices-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    const fd=fs.openSync(backup,'wx',0o600);
    try {fs.writeFileSync(fd,JSON.stringify({before,plan},null,2));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    assert.deepEqual(JSON.parse(fs.readFileSync(backup,'utf8')).before,before);
    for (const [id,,pesos] of existing) db.prepare('UPDATE productos SET precio=? WHERE id=?').run(pesos*100,id);
    const expected=structuredClone(before);
    for(const [id,,pesos] of existing) expected.products.find(p=>p.id===id).precio=pesos*100;
    assert.deepEqual(read(),expected,'Unexpected change outside product prices');
    const pricing=require('../utils/menuDiaPricing');
    for(const [id,,pesos] of existing) {
      assert.equal(pricing.applyMenuDiaPricing(db.prepare('SELECT * FROM productos WHERE id=?').get(id)).precio,pesos*100);
    }
    assert.equal(db.pragma('quick_check')[0].quick_check,'ok');
    return {backup,verified:existing.length,changed:changes.length,missing:plan.filter(p=>!existing.includes(p)),counts:existing.reduce((a,p)=>(a[p[2]]=(a[p[2]]||0)+1,a),{}),changes};
  };
  console.log(JSON.stringify(apply ? db.transaction(execute).immediate() : execute()));
} finally {db.close();}
