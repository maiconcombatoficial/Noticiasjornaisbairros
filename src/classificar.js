'use strict';
/**
 * Classifica uma notícia em regiões e bairros de Florianópolis a partir do texto
 * (título + resumo). Regras em src/bairros.json.
 */
const { normalizar } = require('./util');

const LOCATIVOS = '(?:no|na|nos|nas|do|da|dos|das|em|ao|pelo|pela|pro|pra|bairro|bairros|comunidade|localidade|praia|praias|morro|rua|avenida|servidao|terminal|regiao|moradores|moradora|morador|ate o|ate a|para o|para a|entre o|entre a|rumo ao|rumo a)';

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function palavra(alias) {
  return `(?<![a-z0-9])${esc(normalizar(alias))}(?![a-z0-9])`;
}

function compilar(config) {
  const regioes = config.regioes.map((r) => ({
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    rePalavras: r.palavras && r.palavras.length ? new RegExp(r.palavras.map(palavra).join('|'), 'i') : null,
    bairros: r.bairros.map((b) => {
      const fortes = (b.aliases || []).map(palavra);
      const fracos = (b.fracos || []).map((f) => normalizar(f));
      return {
        id: b.id,
        nome: b.nome,
        distrito: b.distrito,
        regiao: r.id,
        exigeBairro: !!b.exige_bairro,
        reForte: fortes.length ? new RegExp(fortes.join('|'), 'i') : null,
        // Termo fraco como lugar ("no Estreito"), mas não quando é início de outro nome ("no centro de inovação",
        // "na Praia Brava de Itajaí"); "de Florianópolis/da cidade/da ilha/da capital" continuam valendo.
        reFracoLocativo: fracos.length
          ? new RegExp(fracos.map((f) => `${LOCATIVOS}\\s+${esc(f)}(?![a-z0-9])(?!\\s+(?:de|da|do|dos|das)\\s+(?!florianopolis|floripa|capital|cidade|ilha))|(?<![a-z0-9])${esc(f)},?\\s+(?:em|no|na|de)\\s+florian|(?<![a-z0-9])${esc(f)},\\s+(?:florianopolis|floripa|capital)`).join('|'), 'i')
          : null,
        reExige: fracos.length
          ? new RegExp(fracos.map((f) => `(?:bairro|comunidade|localidade d[aeo]|regiao d[aeo])\\s+${esc(f)}(?![a-z0-9])|(?<![a-z0-9])${esc(f)},?\\s+(?:em|no|na)\\s+florian|(?<![a-z0-9])${esc(f)},\\s+(?:florianopolis|floripa)|(?<![a-z0-9])${esc(f)},\\s+no\\s+(?:norte|sul|leste|centro|continente)`).join('|'), 'i')
          : null,
        reIgnorar: b.ignorar && b.ignorar.length ? new RegExp(b.ignorar.map(palavra).join('|'), 'gi') : null,
        reNegativo: b.negativos && b.negativos.length ? new RegExp(b.negativos.map(palavra).join('|'), 'i') : null,
      };
    }),
  }));
  return { regioes, bairros: regioes.flatMap((r) => r.bairros) };
}

const RE_FLORIPA = /florianopolis|floripa|ilha de santa catarina|capital catarinense|capital de santa catarina|capital de sc|capital do estado de santa catarina|florianopolitan/i;
// "na Capital" em fonte catarinense = Florianópolis; evita "capital de giro", "capital paulista" etc.
const RE_CAPITAL_SC = /(?<![a-z0-9])(?:na|da|pela|para a|em|a|toda a) capital(?![a-z0-9])(?! (?:paulista|federal|gaucha|paranaense|mineira|carioca|fluminense|baiana|pernambucana|cearense|capixaba|de giro|social|humano|aberto|estrangeiro|politico|do pais|do brasil|do estado de (?!santa catarina)|argentina|uruguaia|chilena|portuguesa|francesa|americana|europeia|mundial))/i;
const RE_OUTRAS_CIDADES = /(?<![a-z0-9])(sao jose|palhoca|biguacu|santo amaro da imperatriz|governador celso ramos|tijucas|joinville|blumenau|itajai|chapeco|criciuma|lages|balneario camboriu|jaragua do sul|brusque|tubarao|garopaba|imbituba)(?![a-z0-9])/i;

let compilado = null;
function obterCompilado(config) {
  if (!compilado || compilado.origem !== config) {
    compilado = { origem: config, ...compilar(config) };
  }
  return compilado;
}

/**
 * @param {{titulo:string, resumo?:string, conteudo?:string}} item
 * @param {{escopo?:string, regiao_fixa?:string, bairro_fixo?:string}} fonte
 * @param {object} config conteúdo de bairros.json
 * @returns {{floripa:boolean, regioes:string[], bairros:string[], geral:boolean, contexto:string}}
 */
function classificar(item, fonte = {}, config = require('./bairros.json')) {
  const { regioes, bairros } = obterCompilado(config);
  const titulo = normalizar(item.titulo || '');
  // Título pesa mais: a notícia pode citar vários lugares no corpo, mas o título diz do que ela trata.
  const texto = `${titulo} . ${titulo} . ${normalizar(item.resumo || '')} ${normalizar((item.conteudo || '').slice(0, 2500))}`.trim();
  const escopo = fonte.escopo || 'sc';

  let contexto = 'nenhum';
  if (escopo === 'local') contexto = 'fonte-local';
  else if (RE_FLORIPA.test(texto)) contexto = 'cita-florianopolis';
  else if (escopo === 'sc' && RE_CAPITAL_SC.test(texto) && !RE_OUTRAS_CIDADES.test(titulo)) contexto = 'cita-capital';

  const temContexto = contexto !== 'nenhum';
  const bairrosAchados = new Set();
  const regioesAchadas = new Set();

  for (const b of bairros) {
    let t = texto;
    if (b.reNegativo && b.reNegativo.test(t)) continue;
    if (b.reIgnorar) t = t.replace(b.reIgnorar, ' ');
    let achou = false;
    if (b.reForte && b.reForte.test(t)) {
      // Termo forte: basta a fonte ser de SC/local; de fonte nacional exige citar Florianópolis.
      if (temContexto || (escopo === 'sc' && !b.exigeBairro)) achou = true;
    }
    if (!achou && temContexto) {
      if (b.exigeBairro) {
        if (b.reExige && b.reExige.test(t)) achou = true;
      } else if (b.reFracoLocativo && b.reFracoLocativo.test(t)) {
        achou = true;
      }
    }
    if (achou) {
      bairrosAchados.add(b.id);
      regioesAchadas.add(b.regiao);
    }
  }

  for (const r of regioes) {
    if (r.rePalavras && r.rePalavras.test(texto) && (temContexto || escopo === 'sc')) regioesAchadas.add(r.id);
  }

  if (fonte.regiao_fixa) regioesAchadas.add(fonte.regiao_fixa);
  if (fonte.bairro_fixo && bairrosAchados.size === 0) {
    bairrosAchados.add(fonte.bairro_fixo);
    const bf = bairros.find((b) => b.id === fonte.bairro_fixo);
    if (bf) regioesAchadas.add(bf.regiao);
  }

  // Se um bairro foi achado, a notícia é de Floripa mesmo que o texto não diga "Florianópolis".
  const floripa = temContexto || bairrosAchados.size > 0 || regioesAchadas.size > 0;
  // Fonte estadual falando de outra cidade no título e sem bairro: não entra.
  if (floripa && contexto !== 'fonte-local' && bairrosAchados.size === 0 && regioesAchadas.size === 0 && RE_OUTRAS_CIDADES.test(titulo) && !RE_FLORIPA.test(titulo)) {
    return { floripa: false, regioes: [], bairros: [], geral: false, contexto: 'outra-cidade' };
  }

  return {
    floripa,
    regioes: [...regioesAchadas],
    bairros: [...bairrosAchados],
    geral: floripa && regioesAchadas.size === 0,
    contexto,
  };
}

function resumoConfig(config = require('./bairros.json')) {
  return {
    regioes: config.regioes.map((r) => ({
      id: r.id,
      nome: r.nome,
      cor: r.cor,
      bairros: r.bairros.map((b) => ({ id: b.id, nome: b.nome, distrito: b.distrito })),
    })),
  };
}

module.exports = { classificar, compilar, resumoConfig };
