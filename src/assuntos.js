'use strict';
/** Classifica notícias por assunto (editoria) com base em palavras-chave de src/assuntos.json. */
const { normalizar } = require('./util');

let compilado = null;
function compilar(config) {
  return config.assuntos.map((a) => ({
    id: a.id,
    nome: a.nome,
    emoji: a.emoji,
    re: new RegExp(a.termos.map((t) => `(?<![a-z0-9])${normalizar(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).join('|'), 'gi'),
  }));
}
function obter(config) {
  if (!compilado || compilado.origem !== config) compilado = { origem: config, lista: compilar(config) };
  return compilado.lista;
}

/**
 * @param {{titulo:string, resumo?:string, conteudo?:string}} item
 * @returns {string[]} até 3 ids de assunto, do mais forte ao mais fraco
 */
function classificarAssuntos(item, config = require('./assuntos.json'), maximo = 3) {
  const lista = obter(config);
  const titulo = normalizar(item.titulo || '');
  const texto = normalizar(`${item.resumo || ''} ${(item.conteudo || '').slice(0, 1500)}`);
  const pontos = [];
  for (const a of lista) {
    const noTitulo = (titulo.match(a.re) || []).length;
    const noTexto = (texto.match(a.re) || []).length;
    const p = noTitulo * 2 + Math.min(noTexto, 4);
    if (p >= 2) pontos.push({ id: a.id, p, noTitulo });
  }
  pontos.sort((x, y) => y.p - x.p || y.noTitulo - x.noTitulo);
  // Só mantém assuntos secundários que tenham pelo menos metade da força do principal
  const melhor = pontos[0] ? pontos[0].p : 0;
  return pontos.filter((x) => x.p * 2 >= melhor).slice(0, maximo).map((x) => x.id);
}

function listaAssuntos(config = require('./assuntos.json')) {
  return config.assuntos.map((a) => ({ id: a.id, nome: a.nome, emoji: a.emoji }));
}

module.exports = { classificarAssuntos, listaAssuntos };
