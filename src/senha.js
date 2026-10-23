'use strict';
/**
 * Gera o arquivo web/api/acesso.json com a impressão digital (SHA-256 + sal) da senha de acesso ao app.
 * Uso: node src/senha.js "minha senha"      (senha vazia desliga a tela de senha)
 * Também dá para gerar pelo navegador: web/senha.html
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const senha = process.argv.slice(2).join(' ');
const arquivo = path.resolve(__dirname, '..', 'web', 'api', 'acesso.json');
if (!senha) {
  fs.writeFileSync(arquivo, JSON.stringify({ ativo: false, sal: '', hash: '' }, null, 2) + '\n');
  console.log('tela de senha desligada:', arquivo);
} else {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(sal + senha.normalize('NFC')).digest('hex');
  fs.writeFileSync(arquivo, JSON.stringify({ ativo: true, sal, hash }, null, 2) + '\n');
  console.log('senha definida:', arquivo);
}
