import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../',import.meta.url));
export function createServer(){
 return http.createServer(async(req,res)=>{
  try{
   let relative=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/repo\//,'/');
   if(relative==='/')relative='/index.html';
   const file=path.resolve(root,'.'+relative);
   if(!file.startsWith(root)||/(?:^|[\\/])(?:\.git|\.env|tests|node_modules)(?:[\\/.]|$)/.test(relative)){res.writeHead(404);res.end();return;}
   const data=await fs.readFile(file),ext=path.extname(file);
   res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp'})[ext]||'application/octet-stream','Cache-Control':'no-cache'});
   res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const server=createServer();server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
}

