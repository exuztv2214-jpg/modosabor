// One-time catalog formatting; preview by default, explicit --apply required.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const connectors = new Set(['a','al','con','de','del','el','en','la','las','los','o','para','por','sin','un','una','y']);
const units = new Set(['ml','lt','kg','gr']);
function format(name) {
  return name.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2').replace(/\p{L}+/gu, (word, offset) => {
    const lower = word.toLocaleLowerCase('es');
    if (['bbq','xl'].includes(lower)) return lower.toUpperCase();
    if (units.has(lower) || (offset > 0 && connectors.has(lower))) return lower;
    return lower[0].toLocaleUpperCase('es') + lower.slice(1);
  });
}
assert.equal(format('Wok de verduras y pollo'), 'Wok de Verduras y Pollo');
assert.equal(format('1/4 de Pollo al Horno'), '1/4 de Pollo al Horno');
assert.equal(format('Modo Sabor BBQ'), 'Modo Sabor BBQ');
assert.equal(format('Jugo Fresh 600 ml'), 'Jugo Fresh 600 ml');
assert.equal(format('ZapallitosRellenos'), 'Zapallitos Rellenos');
assert.equal(format('Al Ajillo'), 'Al Ajillo');
assert(process.env.DB_FILE);
const apply = process.argv.includes('--apply');
const db = new Database(process.env.DB_FILE, {fileMustExist:true,readonly:!apply});
db.pragma('busy_timeout=5000');
const read = () => db.prepare('SELECT * FROM productos ORDER BY id').all();
try {
  const execute = () => {
    const before = read();
    const changes = before.filter(p=>p.nombre!==format(p.nombre)).map(p=>({id:p.id,before:p.nombre,after:format(p.nombre)}));
    if (!apply) return {reviewed:before.length,changes};
    const folder = path.join(path.dirname(process.env.DB_FILE),'catalog-option-backups');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const backup = path.join(folder,`before-name-format-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    const fd = fs.openSync(backup,'wx',0o600);
    try { fs.writeFileSync(fd,JSON.stringify({products:before,changes},null,2));fs.fsyncSync(fd); } finally {fs.closeSync(fd);}
    assert.deepEqual(JSON.parse(fs.readFileSync(backup,'utf8')).products,before);
    const update = db.prepare('UPDATE productos SET nombre=? WHERE id=? AND nombre=?');
    for (const c of changes) assert.equal(update.run(c.after,c.id,c.before).changes,1);
    assert.deepEqual(read(),before.map(p=>({...p,nombre:format(p.nombre)})));
    assert.equal(db.pragma('quick_check')[0].quick_check,'ok');
    return {reviewed:before.length,updated:changes.length,backup,verified:true,changes};
  };
  console.log(JSON.stringify(apply ? db.transaction(execute).immediate() : execute()));
} finally {db.close();}
