// scripts/grab-and-upload.js
import fs from 'fs';
import zlib from 'zlib';
import { execSync } from 'child_process';
import upload from './upload.js'; // função default do upload.js

// Lista de sites e paths de canais/config
const sites = [
  {
    name: 'guiadetv',
    channels: 'sites/guiadetv.com/guiadetv.com.channels.xml',
    output: 'tmp/guide-guiadetv.xml',
    gzOutput: 'public/guide-guiadetv.xml.gz'
  },
  {
    name: 'mi',
    channels: 'sites/mi.tv/mi.tv_br.channels.xml',
    output: 'tmp/guide-mi.xml',
    gzOutput: 'public/guide-mi.xml.gz'
  },
  {
    name: 'meuguia',
    channels: 'sites/meuguia.tv/meuguia.tv.channels.xml',
    output: 'tmp/guide-meuguia.xml',
    gzOutput: 'public/guide-meuguia.xml.gz'
  },
  {
    name: 'claro',
    channels: 'sites/claro.com.br/claro.com.br.channels.xml',
    output: 'tmp/guide-claro.xml',
    gzOutput: 'public/guide-claro.xml.gz'
  }
];

// Cria pasta temporária e pasta public
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');
if (!fs.existsSync('public')) fs.mkdirSync('public');

// Função principal
async function main() {
  for (const site of sites) {
    console.log(`📡 Downloading guide for ${site.name}...`);
    try {
      execSync(`npm run grab --- --channels=${site.channels} --days=3 --output=${site.output}`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`❌ Error downloading guide for ${site.name}`, err);
      continue; // não para todo o processo, só pula esse site
    }

    // Comprime em gzip
    console.log(`🗜 Compressing ${site.name}...`);
    const xmlStream = fs.createReadStream(site.output);
    const gzipStream = zlib.createGzip();
    const outStream = fs.createWriteStream(site.gzOutput);

    await new Promise((resolve, reject) => {
      xmlStream.pipe(gzipStream).pipe(outStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log(`📤 Uploading ${site.name} to R2...`);
    await upload(site.gzOutput); // modificar upload para aceitar path
  }

  console.log('✅ All done!');
}

// Executa
main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
