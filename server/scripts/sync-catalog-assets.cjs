const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const Database = require('better-sqlite3');
const {dbFile,uploadsDir}=require('../utils/storagePaths');
async function main(){
  const db=new Database(dbFile,{readonly:true,fileMustExist:true});
  let images;
  try {images=[...new Set(['productos','categorias','opcion_items'].flatMap(t=>db.prepare(`SELECT imagen FROM ${t}`).all().map(r=>r.imagen)).filter(Boolean))];}finally{db.close();}
  const result={downloaded:0,existing:0,external:0,failed:[]};
  for(const img of images){
    if(!/^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(png|jpe?g|webp|gif)$/i.test(img)){result.external++;continue;}
    const file=path.join(uploadsDir,path.basename(img));
    if(fs.existsSync(file)){result.existing++;continue;}
    try{
      const res=await fetch('https://modosabor.com.ar'+img,{signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error(`HTTP ${res.status}`);
      const bytes=Buffer.from(await res.arrayBuffer());
      if(bytes.length>10*1024*1024) throw new Error('Image too large');
      fs.mkdirSync(uploadsDir,{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});result.downloaded++;
    }catch(e){result.failed.push({image:img,error:e.message});}
  }
  console.log(JSON.stringify(result));if(result.failed.length) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
