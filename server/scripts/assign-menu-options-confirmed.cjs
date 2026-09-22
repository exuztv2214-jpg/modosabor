// Confirmed product-by-product by the owner. Dry-run by default.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const plan = [
  [134,'Cerdo al horno con verduras','g'],[87,'Costeleta a la riojana','g'],
  [83,'Costeleta de res a caballo','g'],[65,'Costillita de cerdo al horno con papas','g'],
  [99,'Estofado','none'],[111,'Fideos caseros','s'],[81,'Guiso de lentejas y arroz','none'],
  [125,'Hamburgesas de Pollo, Espinaca, Jamón y Queso','g'],[101,'Lasaña','s'],[94,'Marinera','g'],
  [91,'Matambre de cerdo a la pizza','g'],[108,'Merluza a la Romana','g'],[129,'Mila Napo','g'],
  [115,'Milanesa a caballo','g'],[90,'Milanesa de merluza','g'],[114,'Mondongo a la española','none'],
  [123,'Niñitos Envueltos','none'],[133,'Osobuco al Malbec','g'],[102,'Pan de Carne','g'],[128,'Parrillada','g'],
  [124,'Pastel de Papas','none'],[95,'Pollo al Ajillo','g'],[86,'Pollo al Verdeo','g'],
  [135,'Pollo deshuesado a la crema','g'],[89,'Pollo teriyaki','g'],[132,'Porcion de Costilla','g'],
  [122,'Quepi Rellenos','g'],[117,'Raviles','archive'],[112,'Ravioles','s'],[127,'Salpicon de Ave','none'],
  [107,'Sopa de Albondigas de Maiz','none'],[67,'Suprema a la napolitana','g'],[85,'Suprema a la suiza','g'],
  [82,'Tarta de pollo y puerro','none'],[105,'Tortilla de Papas','none'],[68,'Wok de verduras y pollo','wok'],
  [113,'ZapallitosRellenos','g'],[136,'chaufam','none'],[137,'pollo al chanpiñon','g'],
  [139,'suprema maryland','g'],[110,'Ñoquis','s'],[92,'Ñoquis de Espinaca','s'],
  [97,'Pomo Postre + Bebida','archive'],[126,'Promo Postre','archive'],[98,'Promo Postre-bebidas','archive'],
];
assert(process.env.DB_FILE);
const apply = process.argv.includes('--apply');
const db = new Database(process.env.DB_FILE, {fileMustExist:true, readonly:!apply});
db.pragma('foreign_keys=ON');
db.pragma('busy_timeout=5000');
const snapshot = () => ({
  products: db.prepare('SELECT * FROM productos ORDER BY id').all(),
  assignments: db.prepare('SELECT * FROM producto_opcion_listas ORDER BY producto_id,lista_id').all(),
});
function validate(before) {
  assert.equal(db.prepare('SELECT nombre FROM opcion_listas WHERE id=5 AND activo=1').get()?.nombre,'Guarniciones');
  assert.equal(db.prepare('SELECT nombre FROM opcion_listas WHERE id=6 AND activo=1').get()?.nombre,'Salsas');
  for (const [id,name] of plan) {
    const p = before.products.find(p=>p.id===id);
    assert.equal(p?.nombre,name);
    assert.deepEqual(JSON.parse(p.variantes || '[]'),[],`Unexpected variants on ${id}`);
    assert.equal(before.assignments.filter(a=>a.producto_id===id).length,0,`Unexpected assignments on ${id}`);
  }
}
try {
  const before = snapshot();
  validate(before);
  const dependencies = plan.filter(p=>p[2]==='archive').map(([id,name])=>({id,name,
    orders: db.prepare('SELECT COUNT(*) n FROM pedido_items WHERE producto_id=?').get(id).n,
    menuHistory: db.prepare('SELECT COUNT(*) n FROM menu_dia_historial WHERE producto_id=?').get(id).n,
    recipes: db.prepare('SELECT COUNT(*) n FROM inventario_recetas WHERE producto_id=?').get(id).n,
  }));
  if (!apply) console.log(JSON.stringify({dryRun:true, plan,dependencies}));
  else console.log(JSON.stringify(db.transaction(()=>{
    const before = snapshot();
    validate(before);
    const fkBefore = db.pragma('foreign_key_check');
    const folder = path.join(path.dirname(process.env.DB_FILE),'catalog-option-backups');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const backup = path.join(folder,`before-confirmed-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    const fd = fs.openSync(backup,'wx',0o600);
    try { fs.writeFileSync(fd,JSON.stringify({before,plan},null,2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    assert.deepEqual(JSON.parse(fs.readFileSync(backup,'utf8')).before,before);
    const expected = structuredClone(before);
    for (const [id,,action] of plan) {
      const p = expected.products.find(p=>p.id===id);
      if (action==='g' || action==='s') {
        const lista_id = action==='g'?5:6;
        db.prepare('INSERT INTO producto_opcion_listas (producto_id,lista_id,orden) VALUES (?,?,0)').run(id,lista_id);
        expected.assignments.push({producto_id:id,lista_id,orden:0});
      } else if (action==='archive') {
        // Match the application's normal delete policy: retain order/recipe/history records.
        db.prepare('UPDATE productos SET activo=0,menu_dia_base=0,menu_dia_disponible_hoy=0 WHERE id=?').run(id);
        Object.assign(p,{activo:0,menu_dia_base:0,menu_dia_disponible_hoy:0});
      } else if (action==='wok') {
        p.variantes=JSON.stringify([{nombre:'Guarnición',obligatorio:1,opciones:[{nombre:'Arroz',precio_extra:0},{nombre:'Fideo',precio_extra:0}]}]);
        db.prepare('UPDATE productos SET variantes=? WHERE id=?').run(p.variantes,id);
      }
    }
    expected.assignments.sort((a,b)=>a.producto_id-b.producto_id || a.lista_id-b.lista_id);
    assert.deepEqual(snapshot(),expected,'Unexpected catalog change');
    assert.deepEqual(db.pragma('foreign_key_check'),fkBefore);
    assert.equal(db.pragma('quick_check')[0].quick_check,'ok');
    return {backup,dependencies,counts:plan.reduce((a,p)=>(a[p[2]]=(a[p[2]]||0)+1,a),{}),verified:true};
  }).immediate()));
} finally { db.close(); }
