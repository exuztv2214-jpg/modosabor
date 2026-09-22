const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { menuDiaBenefits } = require('../utils/menuDiaBenefits');
assert(process.env.DB_FILE);
const db = new Database(process.env.DB_FILE,{fileMustExist:true});
db.pragma('busy_timeout=5000');
try {
  console.log(JSON.stringify(db.transaction(()=>{
    const products = db.prepare('SELECT * FROM productos ORDER BY id').all();
    const targets = products.filter(p=>p.activo===1 && (p.categoria_id===7 || p.menu_dia_base===1) && [500000,700000,900000].includes(p.precio));
    assert.equal(targets.length,49,'Catalog changed: review before applying');
    const folder = path.join(path.dirname(process.env.DB_FILE),'catalog-option-backups');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const backup = path.join(folder,`before-benefits-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    const fd=fs.openSync(backup,'wx',0o600);
    try {fs.writeFileSync(fd,JSON.stringify({products},null,2));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    assert.deepEqual(JSON.parse(fs.readFileSync(backup,'utf8')).products,products);
    const expected=structuredClone(products);
    for(const p of targets){
      const benefits=menuDiaBenefits(p.precio,p.extras,p.descripcion);
      db.prepare('UPDATE productos SET extras=?,descripcion=? WHERE id=?').run(benefits.extras,benefits.descripcion,p.id);
      Object.assign(expected.find(row=>row.id===p.id),benefits);
    }
    assert.deepEqual(db.prepare('SELECT * FROM productos ORDER BY id').all(),expected);
    assert.equal(db.pragma('quick_check')[0].quick_check,'ok');
    return {backup,counts:targets.reduce((a,p)=>(a[p.precio/100]=(a[p.precio/100]||0)+1,a),{}),verified:true};
  }).immediate()));
} finally {db.close();}
