/**
 * Prepara os arquivos de marca da Armarinho Aurora para a web.
 *
 * O logo original é branco sobre transparente e vem com muita margem vazia.
 * Este script recorta as bordas, gera a versão do header em duas densidades,
 * isola a onda para os ícones quadrados e monta a imagem de compartilhamento.
 *
 * Uso:
 *   pnpm marca "D:/caminho/logo branco.png" ./tmp/marca
 *
 * A saída NÃO é versionada: arquivo de marca é conteúdo, não código. O que o
 * repositório guarda é este script, para o resultado ser reproduzível.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const [origem, saida = './tmp/marca'] = process.argv.slice(2);

if (!origem) {
  console.error('Informe o arquivo de origem.\n  pnpm marca "caminho/logo.png" [pasta-de-saida]');
  process.exit(1);
}

const AZUL = '#1B3A8C';
const AMARELO = '#FDC300';

await mkdir(saida, { recursive: true });

// ── 1. Recorta a moldura transparente ──────────────────────────────────────
const recortado = await sharp(origem).trim({ threshold: 10 }).png().toBuffer();
const info = await sharp(recortado).metadata();
console.info(`logo recortado: ${info.width}x${info.height}`);

// ── 2. Logo do header, em 1x e 2x ──────────────────────────────────────────
for (const [nome, largura] of [
  ['logo.png', 400],
  ['logo@2x.png', 800],
]) {
  await sharp(recortado)
    .resize({ width: largura, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(`${saida}/${nome}`);
  console.info(`  ${nome}`);
}

// ── 3. A onda isolada ──────────────────────────────────────────────────────
// A marca ocupa ~15% da largura, à esquerda do texto. Recortamos essa faixa e
// aparamos de novo, para sobrar só o símbolo.
const marca = await sharp(recortado)
  .extract({ left: 0, top: 0, width: Math.round(info.width * 0.155), height: info.height })
  .trim({ threshold: 10 })
  .png()
  .toBuffer();

await sharp(marca)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(`${saida}/marca.png`);
console.info('  marca.png');

// ── 4. Ícones quadrados ────────────────────────────────────────────────────
// A onda branca sobre o azul da marca. Fundo sólido é obrigatório: no iOS um
// PNG transparente vira ícone preto. E o logo deitado inteiro, espremido num
// quadrado de 32px, ficaria ilegível — por isso só o símbolo.
for (const tamanho of [512, 192, 180, 32, 16]) {
  const margem = Math.round(tamanho * 0.14);

  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: AZUL } })
    .composite([
      {
        input: await sharp(marca)
          .resize(tamanho - margem * 2, tamanho - margem * 2, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer(),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(`${saida}/icone-${tamanho}.png`);
  console.info(`  icone-${tamanho}.png`);
}

// ── 5. Imagem de compartilhamento (Open Graph) ─────────────────────────────
// É o que aparece quando alguém cola o link no WhatsApp. Um ícone quadrado
// esticado em 1200x630 fica horrível.
const logoOg = await sharp(recortado).resize({ width: 760 }).png().toBuffer();
const alturaOg = (await sharp(logoOg).metadata()).height ?? 170;
const faixa = await sharp({
  create: { width: 1200, height: 12, channels: 4, background: AMARELO },
})
  .png()
  .toBuffer();

await sharp({ create: { width: 1200, height: 630, channels: 4, background: AZUL } })
  .composite([
    { input: logoOg, top: Math.round((630 - alturaOg) / 2), left: 220 },
    { input: faixa, top: 618, left: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(`${saida}/og.png`);
console.info('  og.png (1200x630)');

console.info(`\nPronto. Arquivos em ${saida}`);
