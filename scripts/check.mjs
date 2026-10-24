import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CONFIG} from '../shared/rules.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const names=['library-background','return-cabinet','cat-supply-sheet','cat-oops-sheet','book-blue','book-yellow','book-red','box-blue','box-yellow','box-red'];
const paths=['index.html','style.css','game.js','shared/rules.js','assets/cat-supply.json','assets/cat-oops.json',...names.map(n=>'assets/'+n+'.webp')];
let bytes=0;const files=[];
for(const p of paths){const s=await fs.stat(path.join(root,p));bytes+=s.size;files.push({path:p,bytes:s.size});}
let pngBytes=bytes;for(const n of names){const png=await fs.stat(path.join(root,'assets/'+n+'.png'));const webp=await fs.stat(path.join(root,'assets/'+n+'.webp'));pngBytes+=png.size-webp.size;}
assert(bytes<500000,'Initial code+WebP budget exceeded');
const report={version:CONFIG.GAME_VERSION,initialUncompressedBytes:bytes,pngFallbackUncompressedBytes:pngBytes,files,network:'Excludes HTTP headers. WebP only, cold cache. Audio is synthesized.'};
console.log(JSON.stringify(report,null,2));

