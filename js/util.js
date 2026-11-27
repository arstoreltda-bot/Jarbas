/* Jarbas · utilidades comuns (datas, DOM, armazenamento) */
"use strict";
window.J = window.J || {};

(function (J) {
  const TZ = "America/Sao_Paulo";
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* ---------- DOM ---------- */
  J.$ = (id) => document.getElementById(id);
  J.el = function (tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    filhos.flat().forEach((f) => { if (f != null && f !== false) e.append(f.nodeType ? f : String(f)); });
    return e;
  };
  J.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  J.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  J.vibrar = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  /* ---------- armazenamento no aparelho ----------
     Tudo fica no próprio iPhone (localStorage), com prefixo "jarbas.".
     Coleções (agenda, e no futuro finanças) são listas de objetos com id. */
  const P = "jarbas.";
  J.store = {
    get(k, def) { try { const v = localStorage.getItem(P + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(P + k); } catch (e) {} },
    lista(col) { const l = J.store.get("col." + col, []); return Array.isArray(l) ? l : []; },
    salvarLista(col, l) { return J.store.set("col." + col, l); },
    inserir(col, doc) { const l = J.store.lista(col); const d = Object.assign({ id: J.uid(), criadoEm: new Date().toISOString() }, doc); l.push(d); J.store.salvarLista(col, l); return d; },
    atualizar(col, id, campos) { const l = J.store.lista(col); const i = l.findIndex((x) => x.id === id); if (i < 0) return null; l[i] = Object.assign({}, l[i], campos, { id, atualizadoEm: new Date().toISOString() }); J.store.salvarLista(col, l); return l[i]; },
    remover(col, id) { J.store.salvarLista(col, J.store.lista(col).filter((x) => x.id !== id)); },
    /* backup completo (todas as chaves do Jarbas, exceto a chave da API) */
    exportar() {
      const out = { app: "jarbas", versao: 1, exportadoEm: new Date().toISOString(), dados: {} };
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(P) && k !== P + "gemini.chave") out.dados[k.slice(P.length)] = localStorage.getItem(k);
      }
      return out;
    },
    importar(obj) {
      if (!obj || obj.app !== "jarbas" || !obj.dados) throw new Error("Arquivo não é um backup do Jarbas.");
      Object.keys(obj.dados).forEach((k) => { if (k !== "gemini.chave") localStorage.setItem(P + k, obj.dados[k]); });
    },
  };
  /* pede ao iPhone para não apagar os dados do app */
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  /* ---------- datas (horário de Brasília) ---------- */
  J.TZ = TZ; J.DIAS = DIAS; J.DIAS_CURTOS = DIAS_CURTOS; J.MESES = MESES;
  J.agora = function () {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return { data: `${g("year")}-${g("month")}-${g("day")}`, hora: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
  };
  J.dParts = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
  J.dObj = (s) => { const { y, m, d } = J.dParts(s); return new Date(Date.UTC(y, m - 1, d)); };
  J.dStr = (dt) => dt.toISOString().slice(0, 10);
  J.addDias = (s, n) => { const d = J.dObj(s); d.setUTCDate(d.getUTCDate() + n); return J.dStr(d); };
  J.diaSemana = (s) => J.dObj(s).getUTCDay();
  J.minutos = (h) => { const [H, M] = h.split(":").map(Number); return H * 60 + M; };
  J.addMin = (h, min) => { let t = J.minutos(h) + min; t = Math.max(0, Math.min(t, 23 * 60 + 59)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  J.fmtH = (h) => { if (!h) return ""; const [H, M] = h.split(":"); return M === "00" ? `${Number(H)}h` : `${Number(H)}h${M}`; };
  /* instante (ms) de uma data/hora de Brasília. O Brasil não tem horário de verão desde 2019 (UTC-3). */
  J.instante = (data, hora) => { const { y, m, d } = J.dParts(data); const [H, M] = (hora || "00:00").split(":").map(Number); return Date.UTC(y, m - 1, d, H + 3, M); };
  J.rotuloDia = function (s) {
    const hoje = J.agora().data; const { m, d } = J.dParts(s);
    const base = `${DIAS_CURTOS[J.diaSemana(s)]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
    if (s === hoje) return "Hoje · " + base;
    if (s === J.addDias(hoje, 1)) return "Amanhã · " + base;
    return base;
  };
  J.rotuloDiaLongo = function (s) {
    const hoje = J.agora().data; const { y, m, d } = J.dParts(s);
    const base = `${DIAS[J.diaSemana(s)]}, ${d} de ${MESES[m - 1]}${y !== J.dParts(hoje).y ? " de " + y : ""}`;
    if (s === hoje) return "Hoje, " + base;
    if (s === J.addDias(hoje, 1)) return "Amanhã, " + base;
    return base[0].toUpperCase() + base.slice(1);
  };
  /* "Hoje · sex 27/11" -> "hoje, sex 27/11" para frases */
  J.diaFrase = (s) => J.rotuloDia(s).replace(/^(Hoje|Amanhã) · /, (x, a) => a.toLowerCase() + ", ");
  J.rotuloHora = (c) => c.diaInteiro ? "dia inteiro" : (c.fim ? `${J.fmtH(c.inicio)} às ${J.fmtH(c.fim)}` : J.fmtH(c.inicio));
  /* lembretes: null (não informado, vale 1h antes) | -1 (sem aviso) | [minutos antes, ...] */
  J.listaLembretes = (l) => (l == null ? [60] : Array.isArray(l) ? l : Number(l) < 0 ? [] : [Number(l)]);
  J.rotuloLembrete = function (min) {
    if (Array.isArray(min)) {
      if (!min.length) return "sem aviso";
      if (min.length === 1) return J.rotuloLembrete(min[0]);
      const partes = min.map((x) => J.rotuloLembrete(x).replace(/^aviso /, ""));
      return "avisos " + partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
    }
    const m = Number(min);
    if (min == null || isNaN(m)) return "aviso 1h antes";
    if (m < 0) return "sem aviso";
    if (m === 0) return "aviso na hora";
    if (m < 1) return `aviso ${Math.round(m * 60)} s antes`;
    if (m % 1 && m < 60) { const mi = Math.floor(m), se = Math.round((m - mi) * 60); return `aviso ${mi} min e ${se} s antes`; }
    if (m >= 1440 && m % 1440 === 0) { const d = m / 1440; return `aviso ${d} dia${d > 1 ? "s" : ""} antes`; }
    if (m >= 60) { const h = Math.floor(m / 60), r = Math.round(m % 60); return r ? `aviso ${h}h${String(r).padStart(2, "0")} antes` : `aviso ${h}h antes`; }
    return `aviso ${Math.round(m)} min antes`;
  };
  /* rótulo dos avisos de um compromisso: "1h antes" ou, se for um horário quebrado, "hoje às 22h45" */
  J.rotuloAvisos = function (c) {
    const l = c.lembrete == null ? [60] : c.lembrete === -1 ? [] : J.listaLembretes(c.lembrete);
    if (!l.length) return "sem aviso";
    const inicio = J.instante(c.data, c.diaInteiro ? "08:00" : c.inicio);
    const redondo = (m) => m === 0 || (Number.isInteger(m) && (m < 60 || m % 15 === 0));
    const partes = l.map((m) => {
      if (redondo(m)) return J.rotuloLembrete(m).replace(/^aviso /, "");
      const t = new Date(inicio - m * 60000);
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: J.TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(t);
      const g = (k) => p.find((x) => x.type === k).value;
      const d = `${g("year")}-${g("month")}-${g("day")}`, h = `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
      const dia = J.rotuloDia(d).replace(/^(Hoje|Amanhã) · .*/, (x, a) => a.toLowerCase());
      return `${dia} às ${J.fmtH(h)}${g("second") !== "00" ? ` e ${Number(g("second"))} s` : ""}`;
    });
    return (partes.length > 1 ? "avisos " + partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1] : "aviso " + partes[0]);
  };
  J.saudacao = () => { const h = Number(J.agora().hora.slice(0, 2)); return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
  J.semAcento = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
})(window.J);
