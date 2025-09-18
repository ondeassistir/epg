// scripts/grab-and-upload.js
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const upload = require('./upload.js'); // CommonJS, exporta função uploadToR2

// Lista de sites e paths de canais/config
const sites = [
  {
    name: 'guiadetv',
    channels: 'sites/guiadetv.com/guiadetv.com.channels.xml',
    output: 'tmp/guide-guiadetv.xml'
  },
  {
    name: 'mi',
    channels: 'sites/mi.tv/mi.tv_br.channels.xml',
    output: 'tmp/guide-mi.xml'
  },
  {
    name: 'meuguia',
    channels: 'sites/meuguia.tv/meuguia.tv.channels.xml',
    output: 'tmp/guide-meuguia.xml'
  },
  {
    name: 'claro',
    channels: 'sites/claro.com.br/claro.com.br.channels.xml',
    output: 'tmp/guide-claro.xml'
  }
];

// Cria pasta temporária
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

// Função principal
async function main() {
  // 1) Roda o grab para cada site
  for (const site of sites) {
    console.log(`📡 Downloading guide for ${site.name}...`);
    try {
      execSync(`npm run grab --- --channels=${site.channels} --days=3 --output=${site.output}`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`❌ Error downloading guide for ${site.name}`, err);
      process.exit(1);
    }
  }

  // 2) Mescla os XMLs
  console.log('🔗 Merging XMLs...');
  let mergedXml = '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n';

  for (const site of sites) {
    const content = fs.readFileSync(site.output, 'utf-8');
    const inner = content.replace(/<\?xml.*\?>/, '').replace(/<tv>/, '').replace(/<\/tv>/, '');
    mergedXml += inner + '\n';
  }

  mergedXml += '</tv>';

  // 3) Comprime em gzip
  console.log('🗜 Compressing...');
  const gzipped = zlib.gzipSync(mergedXml);
  const localFile = 'public/guide.xml.gz';
  fs.writeFileSync(localFile, gzipped);

  // 4) Faz upload para R2
  console.log('📤 Uploading to R2...');
  await upload();

  console.log('✅ Done!');
}

// Executa
main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
