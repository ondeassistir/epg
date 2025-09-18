import fs from 'fs';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { uploadToR2 } from './upload.js'; // seu upload.js já existente

// Lista de sites e paths de canais/config
const sites = [
  { name: 'guiadetv', channels: 'sites/guiadetv.com/guiadetv.com.channels.xml', output: 'tmp/guide-guiadetv.xml' },
  { name: 'mi', channels: 'sites/mi.tv/mi.tv_br.channels.xml', output: 'tmp/guide-mi.xml' },
  { name: 'claro', channels: 'sites/claro.com.br/claro.com.br.channels.xml', output: 'tmp/guide-claro.xml' },
];

// Cria pasta temporária
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

// 1) Roda o grab para cada site
sites.forEach(site => {
  console.log(`Downloading guide for ${site.name}...`);
  execSync(`npm run grab --- --channels=${site.channels} --days=3 --output=${site.output}`, { stdio: 'inherit' });
});

// 2) Mescla os XMLs
console.log('Merging XMLs...');
let mergedXml = '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n';

sites.forEach(site => {
  const content = fs.readFileSync(site.output, 'utf-8');
  // remove a declaração XML do arquivo individual e as tags <tv> </tv>
  const inner = content.replace(/<\?xml.*\?>/, '').replace(/<tv>/, '').replace(/<\/tv>/, '');
  mergedXml += inner + '\n';
});

mergedXml += '</tv>';

// 3) Comprime em gzip
console.log('Compressing...');
const gzipped = zlib.gzipSync(mergedXml);
fs.writeFileSync('public/guide.xml.gz', gzipped);

// 4) Faz upload para R2
console.log('Uploading to R2...');
await uploadToR2('public/guide.xml.gz', 'guide.xml.gz');

console.log('Done!');
