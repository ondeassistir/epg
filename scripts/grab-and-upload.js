import fs from 'fs';
import zlib from 'zlib';
import { spawn } from 'child_process';
import upload from './upload.js';

// Lista de sites/canais
const sites = [
  { name: 'guiadetv', channels: 'sites/guiadetv.com/guiadetv.com.channels.xml', output: 'tmp/guide-guiadetv.xml', gzOutput: 'guiadetv.xml.gz' },
  { name: 'mi', channels: 'sites/mi.tv/mi.tv_br.channels.xml', output: 'tmp/guide-mi.xml', gzOutput: 'mi.xml.gz' }
];

// Pastas temporária
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

// Função para rodar o grab em modo streaming (evita estourar memória)
function runGrab(site) {
  return new Promise((resolve, reject) => {
    console.log(`📡 Running grab for ${site.name}...`);
    const args = [
      'run', 'grab',
      '--',
      `--channels=${site.channels}`,
      '--days=3',
      `--output=${site.output}`
    ];
    const child = spawn('npm', args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`grab failed for ${site.name} with code ${code}`));
    });
  });
}

async function main() {
  const result = {};

  for (const site of sites) {
    console.log(`📡 Processing ${site.name}...`);

    try {
      // Gera XML do canal (grab)
      await runGrab(site);

      // Faz upload para R2 (envia XML direto)
      // if you want the file in R2 to be named ".xml" instead of ".xml.gz", change site.gzOutput → site.output
      await upload(site.output, site.output.replace('tmp/', ''));  
      result[site.name] = site.output;

      // Limpeza de memória
      fs.unlinkSync(site.output); // remove XML temporário local

    } catch (err) {
      console.warn(`⚠️ Skipping ${site.name}: ${err.message}`);
      continue;
    }
  }

  console.log('✅ All done!');
  console.log('Result paths in R2:', result);
  return result;
}


// Executa
main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
