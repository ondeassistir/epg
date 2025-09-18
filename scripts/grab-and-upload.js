import fs from 'fs';
import zlib from 'zlib';
import { execSync } from 'child_process';
import upload from './upload.js';

// Lista de sites/canais
const sites = [
  { name: 'guiadetv', channels: 'sites/guiadetv.com/guiadetv.com.channels.xml', output: 'tmp/guide-guiadetv.xml', gzOutput: 'guiadetv.xml.gz' },
  { name: 'mi', channels: 'sites/mi.tv/mi.tv_br.channels.xml', output: 'tmp/guide-mi.xml', gzOutput: 'mi.xml.gz' }
];

// Pastas temporária
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

async function main() {
  const result = {};

  for (const site of sites) {
    console.log(`📡 Processing ${site.name}...`);

    try {
      // Gera XML do canal (grab)
      execSync(`npm run grab --- --channels=${site.channels} --days=3 --output=${site.output}`, { stdio: 'inherit' });

      // Comprime em gzip
      const xmlStream = fs.createReadStream(site.output);
      const gzipStream = zlib.createGzip();
      const outStream = fs.createWriteStream(site.gzOutput);

      await new Promise((resolve, reject) => {
        xmlStream.pipe(gzipStream).pipe(outStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      // Faz upload para R2 (sempre no mesmo path)
      await upload(site.gzOutput, site.gzOutput);
      result[site.name] = site.gzOutput;

      // Limpeza de memória
      xmlStream.destroy();
      gzipStream.destroy();
      outStream.destroy();
      fs.unlinkSync(site.output); // remove XML temporário
      fs.unlinkSync(site.gzOutput); // remove gzip local

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
