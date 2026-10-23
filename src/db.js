'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS noticias (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  titulo TEXT NOT NULL,
  titulo_chave TEXT NOT NULL,
  resumo TEXT,
  imagem TEXT,
  fonte_id TEXT,
  fonte_nome TEXT,
  via_gnews INTEGER DEFAULT 0,
  publicado_em TEXT,
  coletado_em TEXT,
  regioes TEXT NOT NULL DEFAULT '[]',
  bairros TEXT NOT NULL DEFAULT '[]',
  assuntos TEXT NOT NULL DEFAULT '[]',
  geral INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_noticias_pub ON noticias(publicado_em);
CREATE INDEX IF NOT EXISTS idx_noticias_titulo ON noticias(titulo_chave);
CREATE TABLE IF NOT EXISTS fontes_status (
  fonte_id TEXT PRIMARY KEY,
  nome TEXT,
  tipo TEXT,
  ultimo_ok TEXT,
  ultimo_erro TEXT,
  erro TEXT,
  falhas_seguidas INTEGER DEFAULT 0,
  total_itens INTEGER DEFAULT 0,
  itens_ultima INTEGER DEFAULT 0,
  novos_ultima INTEGER DEFAULT 0,
  ultima_coleta TEXT
);
CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);
`;

function abrir(caminho) {
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Migração: bancos criados antes da coluna 'assuntos'
  const colunas = db.prepare('PRAGMA table_info(noticias)').all().map((c) => c.name);
  if (!colunas.includes('assuntos')) db.exec("ALTER TABLE noticias ADD COLUMN assuntos TEXT NOT NULL DEFAULT '[]'");

  const st = {
    porId: db.prepare('SELECT id, via_gnews FROM noticias WHERE id = ?'),
    porTitulo: db.prepare('SELECT id, via_gnews, fonte_id FROM noticias WHERE titulo_chave = ? LIMIT 1'),
    inserir: db.prepare(`INSERT INTO noticias (id,url,titulo,titulo_chave,resumo,imagem,fonte_id,fonte_nome,via_gnews,publicado_em,coletado_em,regioes,bairros,assuntos,geral)
      VALUES (@id,@url,@titulo,@titulo_chave,@resumo,@imagem,@fonte_id,@fonte_nome,@via_gnews,@publicado_em,@coletado_em,@regioes,@bairros,@assuntos,@geral)`),
    apagar: db.prepare('DELETE FROM noticias WHERE id = ?'),
    recentes: db.prepare('SELECT * FROM noticias WHERE publicado_em >= ? ORDER BY publicado_em DESC LIMIT ?'),
    limpar: db.prepare('DELETE FROM noticias WHERE publicado_em < ?'),
    contar: db.prepare('SELECT COUNT(*) AS n FROM noticias'),
    statusTodos: db.prepare('SELECT * FROM fontes_status ORDER BY nome'),
    statusUm: db.prepare('SELECT * FROM fontes_status WHERE fonte_id = ?'),
    statusUpsert: db.prepare(`INSERT INTO fontes_status (fonte_id,nome,tipo,ultimo_ok,ultimo_erro,erro,falhas_seguidas,total_itens,itens_ultima,novos_ultima,ultima_coleta)
      VALUES (@fonte_id,@nome,@tipo,@ultimo_ok,@ultimo_erro,@erro,@falhas_seguidas,@total_itens,@itens_ultima,@novos_ultima,@ultima_coleta)
      ON CONFLICT(fonte_id) DO UPDATE SET nome=excluded.nome, tipo=excluded.tipo, ultimo_ok=excluded.ultimo_ok, ultimo_erro=excluded.ultimo_erro, erro=excluded.erro,
      falhas_seguidas=excluded.falhas_seguidas, total_itens=excluded.total_itens, itens_ultima=excluded.itens_ultima, novos_ultima=excluded.novos_ultima, ultima_coleta=excluded.ultima_coleta`),
    metaGet: db.prepare('SELECT valor FROM meta WHERE chave = ?'),
    metaSet: db.prepare('INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'),
  };

  const api = {
    raw: db,
    /**
     * Insere com deduplicação por URL e por título.
     * @returns {'nova'|'duplicada'|'substituiu'}
     */
    /** Já existe uma notícia com esta URL ou este título? */
    jaConhecida(n) {
      return !!(st.porId.get(n.id) || st.porTitulo.get(n.titulo_chave));
    },
    inserirNoticia(n) {
      if (st.porId.get(n.id)) return 'duplicada';
      const mesmoTitulo = st.porTitulo.get(n.titulo_chave);
      if (mesmoTitulo) {
        // Preferimos o link direto do portal ao redirecionamento do Google Notícias.
        if (mesmoTitulo.via_gnews && !n.via_gnews) {
          st.apagar.run(mesmoTitulo.id);
          st.inserir.run(n);
          return 'substituiu';
        }
        return 'duplicada';
      }
      st.inserir.run(n);
      return 'nova';
    },
    recentes(desdeIso, limite = 5000) {
      return st.recentes.all(desdeIso, limite).map(desserializar);
    },
    limparAntigas(antesIso) {
      return st.limpar.run(antesIso).changes;
    },
    total() {
      return st.contar.get().n;
    },
    statusFontes() {
      return st.statusTodos.all();
    },
    statusFonte(id) {
      return st.statusUm.get(id) || null;
    },
    salvarStatus(s) {
      st.statusUpsert.run(s);
    },
    meta(chave, valor) {
      if (valor === undefined) {
        const r = st.metaGet.get(chave);
        return r ? r.valor : null;
      }
      st.metaSet.run(chave, String(valor));
      return valor;
    },
    transacao(fn) {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    fechar() {
      db.close();
    },
  };
  return api;
}

function desserializar(linha) {
  return {
    ...linha,
    regioes: JSON.parse(linha.regioes || '[]'),
    bairros: JSON.parse(linha.bairros || '[]'),
    assuntos: JSON.parse(linha.assuntos || '[]'),
    geral: !!linha.geral,
    via_gnews: !!linha.via_gnews,
  };
}

module.exports = { abrir };
