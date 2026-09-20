// Input: base64-encoded JSON catalog export on stdin. Never copies customer/order/config data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const Database = require('better-sqlite3');
const { dbFile } = require('../utils/storagePaths');
const source = JSON.parse(Buffer.from(fs.readFileSync(0,'utf8').trim(),'base64').toString('utf8'));
const tables=['categorias','productos','opcion_listas','opcion_items','producto_opcion_listas'];
for(const table of tables) assert(Array.isArray(source[table]), `Missing ${table}`);
assert(source.productos.length>100 && source.opcion_listas.length>=3);
const db=new Database(dbFile,{fileMustExist:true});
db.pragma('foreign_keys=ON');
db.pragma('busy_timeout=5000');
async function main(){
  const before=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));
  if(!process.argv.includes('--apply')) {
    console.log(JSON.stringify({dryRun:true,counts:tables.map(t=>({table:t,local:before[t].length,railway:source[t].length}))}));return;
  }
  const folder=path.join(path.dirname(dbFile),'backups');fs.mkdirSync(folder,{recursive:true});
  const backup=path.join(folder,`before-catalog-sync-${Date.now()}.sqlite`);
  await db.backup(backup);
  db.transaction(()=>{
    const oldFK=db.pragma('foreign_key_check');
    for(const [table,column] of [['productos','subcategoria'],['opcion_items','imagen']]) {
      if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
    // Replace option assignments as a unit; do not delete products/categories with historical references.
    db.prepare('DELETE FROM producto_opcion_listas').run();
    db.prepare('DELETE FROM opcion_items').run();
    db.prepare('DELETE FROM opcion_listas').run();
    for(const table of tables) {
      const columns=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
      for(const row of source[table]) {
        const fields=Object.keys(row).filter(c=>columns.has(c));
        const pk=table==='producto_opcion_listas'?['producto_id','lista_id']:['id'];
        const updates=fields.filter(c=>!pk.includes(c));
        const conflict=updates.length ? `DO UPDATE SET ${updates.map(c=>`"${c}"=excluded."${c}"`).join(',')}` : 'DO NOTHING';
        db.prepare(`INSERT INTO ${table} (${fields.map(c=>`"${c}"`).join(',')}) VALUES (${fields.map(()=>'?').join(',')}) ON CONFLICT (${pk.join(',')}) ${conflict}`).run(...fields.map(c=>row[c]));
      }
    }
    const activeIds=new Set(source.productos.map(p=>p.id));
    for(const p of before.productos) if(!activeIds.has(p.id)) db.prepare('UPDATE productos SET activo=0,menu_dia_base=0,menu_dia_disponible_hoy=0 WHERE id=?').run(p.id);
    for(const table of tables) {
      const actual=db.prepare(`SELECT * FROM ${table}`).all();
      for(const expected of source[table]){
        const found=actual.find(r=>table==='producto_opcion_listas'?r.producto_id===expected.producto_id && r.lista_id===expected.lista_id:r.id===expected.id);
        assert(found);
        for(const key of Object.keys(expected)) if(Object.hasOwn(found,key)) assert.deepEqual(found[key],expected[key],`${table}.${key}`);
      }
    }
    assert.deepEqual(db.pragma('foreign_key_check'),oldFK);
    assert.equal(db.pragma('quick_check')[0].quick_check,'ok');
  }).immediate();
  console.log(JSON.stringify({backup,verified:true,counts:tables.map(t=>({table:t,imported:source[t].length}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
