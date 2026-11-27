/* Jarbas · aplicativo (conversa, voz, telas, ajustes e primeira vez) */
"use strict";
(function (J) {
  const $ = J.$, el = J.el, V = J.voz, G = J.gemini, A = J.agenda, T = J.tarefas;
  const VERSAO = "1.4.0";
  const chat = $("chat"), entrada = $("entrada"), btnAcao = $("btn-acao");
  const ehIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalado = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  /* ================= utilidades de tela ================= */
  J.ui = {};
  let toastT;
  J.ui.toast = (t) => { const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (e.hidden = true), 2600); };
  J.ui.abrirFolha = (titulo, corpo) => { $("folha-t").textContent = titulo; $("folha-corpo").replaceChildren(corpo); $("folha").hidden = false; };
  J.ui.fecharFolha = () => { $("folha").hidden = true; $("folha-corpo").replaceChildren(); };
  $("folha-x").onclick = J.ui.fecharFolha; $("folha-fundo").onclick = J.ui.fecharFolha;

  let estadoAtual = "pronto";
  function estado(e) {
    estadoAtual = e || "pronto";
    const txt = { pronto: "Pronto", ouvindo: "Ouvindo…", pensando: "Pensando…", falando: "Falando…" }[estadoAtual];
    $("estado").textContent = txt; $("estado").classList.toggle("ativo", estadoAtual !== "pronto");
    $("orbe").className = "orbe" + (estadoAtual !== "pronto" ? " " + estadoAtual : "");
  }
  V.onTroca = (motivo) => bolha("jarbas", `Usando a voz do iPhone: ${motivo}. Volto para a Premium sozinho assim que der.`, "tecnico");
  V.onEstado = (falando) => { if (falando) estado("falando"); else if (estadoAtual === "falando") estado("pronto"); };

  /* ================= conversa ================= */
  let historico = J.store.get("conversa", []).filter((h) => !/^Conectado, senhor/.test(h.texto || ""));
  const salvarHist = () => J.store.set("conversa", historico.slice(-60));
  function rolar() { const t = $("tela-conversa"); requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; }); }
  function bolha(de, texto, extra) { const e = el("div", { class: "msg " + de + (extra ? " " + extra : ""), text: texto }); chat.append(e); rolar(); return e; }
  function digitando() { const e = el("div", { class: "digitando", "aria-label": "Jarbas está pensando" }, el("i"), el("i"), el("i")); chat.append(e); rolar(); return e; }

  /* Jarbas diz algo: escreve, guarda e fala. Retorna quando terminar de falar. */
  /* cumprimento do dia: só na primeira mensagem do senhor em cada dia */
  let saudarAgora = false;
  function marcarSaudacao() {
    const hoje = J.agora().data;
    if (J.store.get("saudacao.dia", "") !== hoje) { J.store.set("saudacao.dia", hoje); saudarAgora = true; }
  }
  function dizer(texto, { falar = true, guardar = true } = {}) {
    if (saudarAgora) {
      saudarAgora = false;
      const s = J.saudacao();
      texto = String(texto || "").replace(/^(bom dia|boa tarde|boa noite)[,!.]?\s*(senhor[,!.]?)?\s*/i, "");
      texto = /^amém/i.test(texto) ? texto.replace(/^(amém[,!.]?\s*(senhor[,!.]?)?)\s*/i, () => `Amém! ${s}, senhor. `).trim() : /^(sim|às suas ordens|pronto|estou aqui|sistemas)/i.test(texto) ? `${s}, senhor. ${texto.replace(/^sim, senhor\.\s*/i, "")}`.trim() : `${s}, senhor. ${texto}`.trim();
    }
    bolha("jarbas", texto);
    if (guardar) { historico.push({ de: "jarbas", texto, t: Date.now() }); salvarHist(); }
    return falar ? V.falar(texto) : Promise.resolve();
  }

  const PRONTO = ["Sim, senhor. Estou pronto.", "Às suas ordens, senhor.", "Pronto e à disposição, senhor.", "Sim, senhor. Pode falar.", "Estou aqui, senhor.", "Sistemas prontos, senhor."];
  const ANOTADO = ["Anotado, senhor.", "Feito, senhor. Está na agenda.", "Perfeito, senhor. Marcado.", "Pronto, senhor. Já está anotado."];
  let ultimaFrase = {};
  const variar = (lista, chave) => { let i; do { i = Math.floor(Math.random() * lista.length); } while (lista.length > 1 && i === ultimaFrase[chave]); ultimaFrase[chave] = i; return lista[i]; };

  /* ---------- pendências (confirmações e perguntas de lembrete) ---------- */
  let pendente = null; // {tipo:"confirmar"|"lembrete"|"cancelar", c, id, cartao}
  function encerrarCartao(p, texto, ok) {
    if (!p || !p.cartao) return;
    const b = p.cartao.querySelector(".botoes, .chips"); if (b) b.remove();
    if (p.chips) p.chips.remove();
    p.cartao.append(el("div", { class: ok ? "feito" : "cancelado", text: texto }));
    if (ok && p.tipo !== "cancelar" && p.final) p.cartao.append(el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Ver na agenda", onclick: () => { A.irPara(p.final.data); mostrar("agenda"); } })));
  }
  function descartarPendente(texto) { if (pendente) { encerrarCartao(pendente, texto || "Substituído", false); if (pendente.chips) pendente.chips.remove(); pendente = null; } }

  const ICO = {
    dia: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    hora: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    sino: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    local: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    pasta: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  };
  function detalhes(c) {
    const d = el("div", { class: "det" });
    const add = (ico, txt) => { if (txt) d.append(el("span", { html: ICO[ico] }), el("span", { text: txt })); };
    add("dia", J.rotuloDiaLongo(c.data)); add("hora", c.diaInteiro ? "Dia inteiro" : `${J.fmtH(c.inicio)} até ${J.fmtH(c.fim)}`);
    add("local", c.local); add("pasta", c.calendario); add("sino", c.lembrete == null ? "" : J.rotuloAvisos(c).replace(/^aviso/, "Aviso").replace(/^sem/, "Sem"));
    return d;
  }
  function cartao(c, { titulo, perigo, botoes, alerta }) {
    const k = el("div", { class: "cartao" + (perigo ? " perigo" : "") }, el("div", { class: "tt", text: titulo || c.titulo }), detalhes(c));
    if (alerta) k.append(el("p", { class: "alerta", text: alerta }));
    if (botoes) k.append(el("div", { class: "botoes" }, botoes));
    chat.append(k); rolar(); return k;
  }

  function pedirConfirmacao(c, id, porVoz) {
    descartarPendente();
    const cf = A.conflitos(c, id);
    const alerta = cf.length ? `Atenção: nesse horário o senhor já tem ${cf.map((o) => `${o.titulo} (${J.rotuloHora(o)})`).join(", ")}.` : "";
    const p = { tipo: "confirmar", c, id };
    p.cartao = cartao(c, { alerta, botoes: [el("button", { class: "btn", type: "button", text: "Cancelar", onclick: () => recusar() }), el("button", { class: "btn primario", type: "button", text: id ? "Salvar alteração" : "Confirmar", onclick: () => confirmar() })] });
    pendente = p;
    const lem = (c.lembrete == null ? "" : c.lembrete === -1 ? ", sem aviso" : `, com ${J.rotuloAvisos(c)}`) + (c.alarme && c.lembrete !== -1 ? ", tocando como alarme" : "");
    const quando = c.repetir ? `${A.rotuloRepetir(c)}${c.diaInteiro ? "" : ", às " + J.fmtH(c.inicio)}, ${c.ate ? "a partir de " + J.diaFrase(c.data) : "começando " + J.diaFrase(c.data) + ", sem data para terminar"}` : `${J.diaFrase(c.data)}, ${c.diaInteiro ? "o dia inteiro" : "às " + J.fmtH(c.inicio)}`;
    const frase = id ? `Vou alterar para ${c.titulo}, ${quando}${lem}. Confirma, senhor?`
      : `Vou marcar ${c.titulo}, ${quando}${lem}. ${alerta ? alerta + " " : ""}Confirma, senhor?`;
    return dizer(frase).then(() => porVoz && ouvirDeNovo());
  }
  function perguntarLembrete(c, id, porVoz) {
    descartarPendente();
    const p = { tipo: "lembrete", c, id };
    p.cartao = cartao(c, {});
    const chips = el("div", { class: "chips" });
    [["Na hora", "na hora"], ["15 min antes", "15 minutos antes"], ["30 min antes", "30 minutos antes"], ["1 hora antes", "1 hora antes"], ["1 dia antes", "1 dia antes"], ["Sem aviso", "sem lembrete"]]
      .forEach(([r, v]) => chips.append(el("button", { class: "chip", type: "button", text: r, onclick: () => enviarTexto(v) })));
    chat.append(chips); p.chips = chips; rolar();
    pendente = p;
    return dizer("Quanto tempo antes o senhor deseja que eu o lembre?").then(() => porVoz && ouvirDeNovo());
  }
  function pedirCancelamento(alvo, porVoz) {
    descartarPendente();
    const p = { tipo: "cancelar", c: alvo, id: alvo.id };
    p.cartao = cartao(alvo, { perigo: true, botoes: [el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: "Desmarcar", onclick: () => confirmar() })] });
    pendente = p;
    return dizer(alvo.repetir ? `Deseja que eu desmarque ${alvo.titulo} de ${A.rotuloRepetir(alvo)}, todas as próximas vezes?` : `Deseja que eu desmarque ${alvo.titulo}, ${J.diaFrase(alvo.data)}${alvo.diaInteiro ? "" : ", às " + J.fmtH(alvo.inicio)}?`).then(() => porVoz && ouvirDeNovo());
  }
  function pedirCancelamentoVarios(alvos, porVoz) {
    descartarPendente();
    alvos.sort((a, b) => (a.data + (a.inicio || "")).localeCompare(b.data + (b.inicio || "")));
    /* dia de uma série: tira só aquele dia; compromisso comum ou série inteira: apaga */
    const p = { tipo: "cancelar", alvos: alvos.map((a) => ({ id: a.id, data: a.data, so: !!a.serie })), ids: alvos.map((a) => a.id), c: alvos[0] };
    const um = alvos.length === 1;
    const k = el("div", { class: "cartao perigo" }, el("div", { class: "tt", text: um ? `Desmarcar ${alvos[0].titulo}` : `Desmarcar ${alvos.length} compromissos` }));
    const ul = el("div", { class: "det" });
    alvos.forEach((a) => ul.append(el("span", { html: ICO.dia }), el("span", { text: `${J.rotuloDia(a.data)}${a.diaInteiro ? ", dia inteiro" : ", " + J.fmtH(a.inicio)} · ${a.titulo}${a.serie ? " (só este dia)" : ""}` })));
    k.append(ul, el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: um ? "Desmarcar" : `Desmarcar os ${alvos.length}`, onclick: () => confirmar() })));
    chat.append(k); rolar(); p.cartao = k;
    pendente = p;
    const mesmoDia = alvos.every((a) => a.data === alvos[0].data);
    if (um) return dizer(`Desmarco só ${alvos[0].titulo} de ${J.diaFrase(alvos[0].data)}? Os outros dias continuam marcados.`).then(() => porVoz && ouvirDeNovo());
    const nomes = alvos.length <= 4 ? ": " + alvos.map((a) => a.titulo + (a.diaInteiro ? "" : " às " + J.fmtH(a.inicio))).join(", ") : "";
    return dizer(`Realmente deseja desmarcar os ${alvos.length} compromissos${mesmoDia ? " de " + J.diaFrase(alvos[0].data) : ""}${nomes}?`).then(() => porVoz && ouvirDeNovo());
  }
  function confirmar() {
    const p = pendente; if (!p) return dizer(variar(PRONTO, "pronto"));
    pendente = null;
    if (p.tipo === "apagarLista") { const l = T.lista_(p.id); T.removerLista(p.id); encerrarCartao(p, "Apagada ✓", true); return dizer(`Pronto, senhor. Apaguei a lista ${l ? l.nome : ""}.`); }
    if (p.tipo === "apagarContato") { J.contatos.remover(p.id); encerrarCartao(p, "Apagado ✓", true); return dizer("Contato apagado, senhor."); }
    if (p.tipo === "apagarTarefas") { p.ids.forEach((i) => T.remover(i)); encerrarCartao(p, p.ids.length === 1 ? "Apagada ✓" : `${p.ids.length} apagadas ✓`, true); J.vibrar(15); return dizer(p.ids.length === 1 ? "Apagada, senhor." : `Pronto, senhor. Apaguei as ${p.ids.length} tarefas.`); }
    if (p.tipo === "cancelar" && p.alvos) { p.alvos.forEach((x) => (x.so ? A.pular(x.id, x.data) : A.remover(x.id))); encerrarCartao(p, p.ids.length === 1 ? "Desmarcado ✓" : `${p.ids.length} desmarcados ✓`, true); J.vibrar(15); return dizer(p.ids.length === 1 ? (p.alvos[0].so ? "Desmarcado só nesse dia, senhor. Os outros continuam." : "Desmarcado, senhor.") : `Pronto, senhor. Desmarquei os ${p.ids.length} compromissos.`); }
    if (p.tipo === "cancelar") { A.remover(p.id); encerrarCartao(p, "Desmarcado ✓", true); return dizer("Desmarcado, senhor."); }
    if (p.tipo === "lembrete") { pendente = p; return dizer("Antes, senhor: quanto tempo antes devo lembrá-lo?"); }
    p.final = p.id ? A.alterar(p.id, p.c) : A.salvar(p.c);
    if (!p.final) { encerrarCartao(p, "Esse compromisso não existe mais.", false); return dizer("Esse compromisso não está mais na agenda, senhor."); }
    A.irPara(p.final.data);
    encerrarCartao(p, p.id ? "Alterado ✓" : "Anotado ✓", true);
    J.vibrar(15);
    const fala = dizer(p.id ? "Alterado, senhor." : variar(ANOTADO, "anotado"));
    if (p.final.alarme) fala.then(() => oferecerAlarme(p.final, true));
    if (!J.avisos.ativo() && !J.store.get("dica.ntfy")) { J.store.set("dica.ntfy", true); bolha("jarbas", "Dica: para o lembrete tocar mesmo com o Jarbas fechado e a tela bloqueada, ative em Ajustes › Lembretes.", "tecnico"); }
    return fala;
  }
  function recusar() {
    const p = pendente; if (!p) return dizer("Perfeitamente, senhor.");
    pendente = null; encerrarCartao(p, ["cancelar", "apagarTarefas", "apagarLista", "apagarContato"].includes(p.tipo) ? "Mantido" : "Não marcado", false);
    return dizer(["cancelar", "apagarTarefas", "apagarLista", "apagarContato"].includes(p.tipo) ? "Perfeitamente, senhor. Deixei como estava." : "Tudo bem, senhor, não marquei.");
  }

  /* "daqui a 30 s" e "às 22h50" -> minutos antes do início do compromisso */
  function avisosExtras(c, daqui, em) {
    const lista = [];
    if (!A.valido(c)) return lista;
    const inicio = J.instante(c.data, c.diaInteiro ? "08:00" : c.inicio), agora = Date.now();
    (Array.isArray(daqui) ? daqui : daqui != null ? [daqui] : []).map(Number).filter((s) => s > 0).forEach((s) => lista.push((inicio - (agora + s * 1000)) / 60000));
    (Array.isArray(em) ? em : em ? [em] : []).forEach((t) => { const m = String(t).match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); if (m) lista.push((inicio - J.instante(m[1], m[2])) / 60000); });
    return lista.filter((m) => m >= 0).map((m) => Math.round(m * 1000) / 1000);
  }
  function juntarAvisos(c, extras) {
    if (!extras.length) return;
    const atual = c.lembrete == null || c.lembrete === -1 ? [] : J.listaLembretes(c.lembrete);
    c.lembrete = A.normalizarLembrete(atual.concat(extras));
  }

  /* todos os compromissos de um período (o app conta, não a IA) */
  const semAcento = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const GENERICOS = /^(reuni(ao|oes)|compromissos?|eventos?|agenda|tudo|todos?|todas?|marcac(ao|oes))$/;
  function filtrarAgenda(f) {
    const de = f.de, ate = f.ate && f.ate >= f.de ? f.ate : f.de;
    let termo = semAcento(f.termo).trim(); if (GENERICOS.test(termo)) termo = "";
    return A.expandir(de, ate).filter((c) => (!termo || semAcento(c.titulo + " " + c.local).includes(termo.replace(/s$/, ""))))
      .sort((a, b) => (a.data + (a.inicio || "00:00")).localeCompare(b.data + (b.inicio || "00:00")));
  }
  function fraseperiodo(f, inicial) {
    const de = f.de, ate = f.ate && f.ate >= f.de ? f.ate : f.de;
    let t = de === ate ? J.diaFrase(de) : `de ${J.diaFrase(de)} até ${J.diaFrase(ate)}`;
    if (de === ate && !/^(hoje|amanh)/i.test(t)) t = "em " + t;
    return inicial ? t[0].toUpperCase() + t.slice(1) : t;
  }

  function tarefasAlvo(r, status) {
    const ids = [...new Set([].concat(Array.isArray(r.ids) ? r.ids : [], r.id ? [r.id] : []))];
    if (r.filtro && (r.filtro.de || r.filtro.status || r.filtro.termo || r.filtro.atrasadas || r.filtro.semPrazo || r.filtro.lista)) return T.filtrar(Object.assign({ status }, r.filtro));
    return ids.map((i) => T.obter(i)).filter(Boolean);
  }
  function pedirApagarTarefas(alvos, porVoz) {
    descartarPendente();
    const p = { tipo: "apagarTarefas", ids: alvos.map((t) => t.id), c: { titulo: alvos[0].titulo } };
    const k = el("div", { class: "cartao perigo" }, el("div", { class: "tt", text: alvos.length === 1 ? "Apagar tarefa" : `Apagar ${alvos.length} tarefas` }));
    const ul = el("div", { class: "det" });
    alvos.forEach((t) => ul.append(el("span", { text: t.feita ? "✓" : "○" }), el("span", { text: t.titulo + (t.prazo ? " · " + T.rotuloPrazo(t, true) : "") })));
    k.append(ul, el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: alvos.length === 1 ? "Apagar" : `Apagar as ${alvos.length}`, onclick: () => confirmar() })));
    chat.append(k); rolar(); p.cartao = k; pendente = p;
    const nomes = alvos.length <= 4 ? ": " + alvos.map((t) => t.titulo).join(", ") : "";
    return dizer(alvos.length === 1 ? `Realmente deseja apagar a tarefa ${alvos[0].titulo}?` : `Realmente deseja apagar as ${alvos.length} tarefas${nomes}?`).then(() => porVoz && ouvirDeNovo());
  }

  /* ---------- executar a decisão do cérebro ---------- */
  async function executar(r, porVoz) {
    const resp = (r.resposta || "").trim();
    switch (r.acao) {
      case "agendar":
      case "remarcar": {
        let id = r.acao === "remarcar" ? r.id : (pendente && pendente.id) || null;
        const base = id ? A.obter(id) : null;
        if (id && !base) id = null;
        const anterior = pendente && pendente.c;
        let c = A.normalizar(Object.assign({}, base || {}, r.compromisso || {}));
        if (c.lembrete == null && base) c.lembrete = base.lembrete;
        if ((r.compromisso || {}).alarme == null && base) c.alarme = !!base.alarme;
        if (base && base.repetir && !(r.compromisso || {}).repetir && (r.compromisso || {}).repetir !== "nao") { c.repetir = base.repetir; c.ate = (r.compromisso || {}).ate || base.ate || ""; c.excecoes = base.excecoes || []; c = A.normalizar(c); }
        if (r.alarme === true || (anterior && anterior.alarme && pendente.tipo === "confirmar")) c.alarme = true;
        if (c.lembrete == null && anterior && anterior.lembrete != null && pendente.tipo === "confirmar") c.lembrete = anterior.lembrete;
        const rc = r.compromisso || {};
        juntarAvisos(c, avisosExtras(c, rc.avisosDaqui != null ? rc.avisosDaqui : r.avisosDaqui, rc.avisosEm != null ? rc.avisosEm : r.avisosEm));
        if (!A.valido(c)) { await dizer(resp && r.acao !== "agendar" ? resp : "Perdão, senhor, não peguei o dia ou o horário. Pode repetir?"); return porVoz && ouvirDeNovo(); }
        if (c.lembrete == null) return perguntarLembrete(c, id, porVoz);
        return pedirConfirmacao(c, id, porVoz);
      }
      case "cancelar": {
        const ids = [...new Set([].concat(Array.isArray(r.ids) ? r.ids : [], r.id ? [r.id] : []))];
        let alvos = ids.map((i) => A.obter(i)).filter(Boolean);
        if (r.soData && alvos.length === 1 && alvos[0].repetir) {
          const s = alvos[0]; alvos = A.expandir(r.soData, r.soData).filter((o) => o.id === s.id);
          if (!alvos.length) { await dizer(`${s.titulo} não acontece ${J.diaFrase(r.soData)}, senhor.`); return; }
        }
        if (r.filtro && r.filtro.de) {
          alvos = filtrarAgenda(r.filtro);
          if (!alvos.length) { await dizer(`O senhor não tem nada marcado ${fraseperiodo(r.filtro)}.`); return; }
        }
        if (!alvos.length) { await dizer(resp || "Qual compromisso o senhor deseja desmarcar?"); return porVoz && ouvirDeNovo(); }
        if (alvos.length > 1 || alvos[0].serie) return pedirCancelamentoVarios(alvos, porVoz);
        return pedirCancelamento(alvos[0], porVoz);
      }
      case "confirmar": return confirmar();
      case "recusar": return recusar();
      case "lembrete": {
        if (!pendente || pendente.tipo !== "lembrete") return dizer(resp || variar(PRONTO, "pronto"));
        const extras = avisosExtras(pendente.c, r.avisosDaqui, r.avisosEm);
        let m = A.normalizarLembrete(r.minutos);
        if (extras.length) m = A.normalizarLembrete((m == null || m === -1 ? [] : m).concat(extras));
        if (m == null) { await dizer("Perdão, senhor. Quanto tempo antes devo lembrá-lo? Por exemplo, 30 minutos antes ou um dia antes."); return porVoz && ouvirDeNovo(); }
        const p = pendente; if (p.chips) p.chips.remove(); p.cartao.remove(); pendente = null;
        p.c.lembrete = m;
        if (r.alarme === true || /alarme|despert/i.test(r.transcricao || "")) p.c.alarme = true;
        return pedirConfirmacao(p.c, p.id, porVoz);
      }
      case "tarefa_criar":
      case "lista_criar": {
        let brutas = Array.isArray(r.tarefas) ? r.tarefas : r.tarefa ? [r.tarefa] : [];
        let listaNova = null, listaCriada = false;
        if (r.lista && r.lista.nome) { const x = T.listaOuCria(r.lista.nome, { tipo: r.lista.tipo, data: r.lista.data, hora: r.lista.hora, lembrete: r.lista.lembrete, repetir: r.lista.repetir }); listaNova = x.l; listaCriada = x.criada; }
        const criadas = {}; // nome -> lista criada agora
        const itens = brutas.map((t) => {
          let l = listaNova;
          if (t.lista) { const x = T.listaOuCria(t.lista); l = x.l; if (x.criada) { criadas[l.id] = l; listaCriada = true; } }
          let dados = Object.assign({}, t, { lista: l ? l.id : "" });
          if (l && l.tipo === "compras" && !t.qtd) { const q = T.separarQtd(t.titulo); dados.titulo = q.titulo; dados.qtd = q.qtd; }
          return T.normalizar(dados);
        }).filter(T.valida);
        if (listaNova) criadas[listaNova.id] = listaNova;
        if (!itens.length) {
          if (listaNova) { T.mostrarLista(listaNova.id); const info = T.rotuloLista(listaNova); return dizer(`${listaCriada ? "Criei a lista" : "A lista"} ${listaNova.nome}${info ? " (" + info.replace(" · 🔔", ", com aviso") + ")" : ""}${listaCriada ? "" : " está pronta"}, senhor. O que devo colocar nela?`).then(() => porVoz && ouvirDeNovo()); }
          await dizer(resp || "Qual é a tarefa, senhor?"); return porVoz && ouvirDeNovo();
        }
        const feitas = itens.map((t) => T.salvar(t));
        J.vibrar(15);
        const listasUsadas = [...new Set(feitas.map((t) => t.lista || ""))];
        if (listasUsadas.length === 1) T.mostrarLista(listasUsadas[0]);
        const nomeL = (id) => (T.lista_(id) || T.GERAL).nome;
        const ondeTxt = listasUsadas.length === 1 && listasUsadas[0] ? ` na lista ${nomeL(listasUsadas[0])}` : "";
        const criouTxt = Object.keys(criadas).length ? `Criei a lista ${Object.values(criadas).map((l) => l.nome).join(" e a lista ")}. ` : "";
        if (feitas.length === 1) {
          const t = feitas[0];
          let f = `${criouTxt}Anotado, senhor: ${T.textoItem(t)}${ondeTxt}${t.prazo ? ", para " + T.rotuloPrazo(t, true) : ""}.`;
          if (t.prazo && t.prazo >= J.agora().data && t.lembrete !== -1) f += t.hora ? (t.lembrete == null || J.listaLembretes(t.lembrete).join() === "0" ? " Aviso o senhor na hora." : ` Aviso o senhor ${J.rotuloLembrete(t.lembrete).replace(/^avisos? /, "")}.`) : " Aviso o senhor às 9h do dia.";
          return dizer(f);
        }
        const compras = listasUsadas.length === 1 && (T.lista_(listasUsadas[0]) || {}).tipo === "compras";
        return dizer(`${criouTxt}Anotei ${feitas.length} ${compras ? "itens" : "tarefas"}${ondeTxt}: ${feitas.map((t) => T.textoItem(t)).join(", ")}.`);
      }
      case "lista_editar": {
        const l = T.lista_(r.id) || (r.lista && r.lista.nomeAtual ? T.acharLista(r.lista.nomeAtual) : null);
        if (!l || !l.id || !r.lista) { await dizer(resp || "Qual lista o senhor deseja mudar?"); return porVoz && ouvirDeNovo(); }
        const nova = T.alterarLista(l.id, r.lista); T.mostrarLista(nova.id);
        const info = T.rotuloLista(nova);
        return dizer(`Pronto, senhor. Lista ${nova.nome}${info ? ": " + info.replace(" · 🔔", ", com aviso") : ""}.`);
      }
      case "lista_apagar": {
        const l = T.lista_(r.id) || (r.lista && r.lista.nome ? T.acharLista(r.lista.nome) : null);
        if (!l || !l.id) { await dizer(resp || "Qual lista o senhor deseja apagar?"); return porVoz && ouvirDeNovo(); }
        descartarPendente();
        const n = T.itensDa(l.id).length;
        const p = { tipo: "apagarLista", id: l.id, c: { titulo: l.nome } };
        p.cartao = el("div", { class: "cartao perigo" }, el("div", { class: "tt", text: "Apagar a lista " + l.nome }), el("p", { class: "alerta", text: n ? `Os ${n} ite${n > 1 ? "ns" : "m"} dela também serão apagados.` : "A lista está vazia." }),
          el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: "Apagar", onclick: () => confirmar() })));
        chat.append(p.cartao); rolar(); pendente = p;
        return dizer(`Realmente deseja apagar a lista ${l.nome}${n ? ` e os ${n} ite${n > 1 ? "ns" : "m"} dela` : ""}?`).then(() => porVoz && ouvirDeNovo());
      }
      case "lista_enviar": {
        const l = (r.id != null && T.lista_(r.id)) || (r.lista && r.lista.nome ? T.acharLista(r.lista.nome) : null) || T.GERAL;
        const b = el("button", { class: "btn primario", type: "button", html: "Enviar pelo WhatsApp", onclick: () => T.enviarWhatsApp(l.id) });
        const s2 = el("button", { class: "btn", type: "button", text: "Outro app", onclick: () => T.compartilhar(l.id) });
        await dizer(`Aqui está a lista ${l.nome}, senhor. Toque para enviar.`);
        chat.append(el("div", { class: "msg jarbas" }, el("div", { class: "pre", text: T.textoParaEnviar(l.id) }), el("div", { class: "botoes", style: "margin-top:10px;display:flex;gap:8px" }, s2, b))); rolar();
        return;
      }
      case "listas_ver": {
        const ls = T.listas();
        const pl = (n, s, p) => `${n} ${n === 1 ? s : p}`;
        const linhas = [`Geral: ${pl(T.itensDa("").filter((t) => !t.feita).length, "pendente", "pendentes")}`].concat(ls.map((l) => `${l.nome}: ${l.tipo === "compras" ? T.itensDa(l.id).filter((t) => !t.feita).length + " para comprar" : pl(T.itensDa(l.id).filter((t) => !t.feita).length, "pendente", "pendentes")}${l.data ? " (" + T.rotuloLista(l).replace(" · 🔔", "") + ")" : ""}`));
        return dizer(ls.length ? `O senhor tem ${ls.length + 1} listas:\n${linhas.join(";\n")}.` : "Por enquanto só a lista Geral, senhor. Quer criar outra? Por exemplo: \"cria a lista Mercado Livre\".");
      }
      case "contato_salvar": {
        const c = J.contatos.normalizar(r.contato || {});
        if (!c.nome) { await dizer(resp || "Qual é o nome do contato, senhor?"); return porVoz && ouvirDeNovo(); }
        if (!J.contatos.valido(c)) { await dizer(`Qual é o número de ${c.nome}, senhor? Com DDD, por favor.`); return porVoz && ouvirDeNovo(); }
        const { contato, atualizado } = J.contatos.salvar(c);
        return dizer(`${atualizado ? "Atualizei" : "Salvei"} o contato ${contato.nome}, ${J.contatos.formatar(contato.numero)}.`);
      }
      case "contato_apagar": {
        const c = J.contatos.obter(r.id) || (r.contato && r.contato.nome ? J.contatos.procurar(r.contato.nome)[0] : null);
        if (!c) { await dizer(resp || "Não encontrei esse contato, senhor."); return; }
        descartarPendente();
        const p = { tipo: "apagarContato", id: c.id, c: { titulo: c.nome } };
        p.cartao = el("div", { class: "cartao perigo" }, el("div", { class: "tt", text: "Apagar o contato " + c.nome }), el("p", { class: "alerta", text: J.contatos.formatar(c.numero) }),
          el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: "Apagar", onclick: () => confirmar() })));
        chat.append(p.cartao); rolar(); pendente = p;
        return dizer(`Realmente deseja apagar o contato ${c.nome}?`).then(() => porVoz && ouvirDeNovo());
      }
      case "ligar": {
        const K = J.contatos, pedido = r.contato || {};
        let achados = r.id && K.obter(r.id) ? [K.obter(r.id)] : K.procurar(pedido.nome);
        if (!achados.length && K.digitos(pedido.numero).length >= 8) achados = [{ nome: pedido.nome || K.formatar(pedido.numero), numero: pedido.numero }];
        if (!achados.length) { await dizer(pedido.nome ? `Não tenho ${pedido.nome} nos contatos, senhor. Qual é o número? Eu salvo para as próximas vezes.` : "Para quem devo ligar, senhor?"); return porVoz && ouvirDeNovo(); }
        const botoes = el("div", { class: "botoes", style: "margin-top:10px;display:flex;flex-wrap:wrap;gap:8px" });
        achados.slice(0, 6).forEach((c) => botoes.append(el("button", { class: "btn primario btn-tel", type: "button", onclick: () => K.ligar(c) }, el("span", { html: K.ICO_TEL }), c.nome)));
        await dizer(achados.length === 1 ? `Ligando para ${achados[0].nome}, senhor. Toque para chamar.` : `Encontrei ${achados.length} contatos, senhor: ${achados.map((c) => c.nome).join(", ")}. Qual deles?`);
        chat.append(el("div", { class: "msg jarbas" }, achados.length === 1 ? el("div", { class: "sub", text: K.formatar(achados[0].numero) }) : null, botoes)); rolar();
        return;
      }
      case "contatos_ver": {
        const l = J.contatos.lista();
        return dizer(l.length ? `O senhor tem ${l.length} contato${l.length > 1 ? "s" : ""}:\n${l.map((c) => `${c.nome}: ${J.contatos.formatar(c.numero)}`).join(";\n")}.` : "Ainda não há contatos no Jarbas, senhor. Diga, por exemplo: \"salva o contato do João, 11 98765-4321\".");
      }
      case "tarefa_concluir": {
        let alvos = tarefasAlvo(r, r.desfazer ? "feitas" : "pendentes");
        if (!alvos.length) { await dizer(resp || "Não encontrei essa tarefa, senhor. Qual delas?"); return porVoz && ouvirDeNovo(); }
        alvos.forEach((t) => T.concluir(t.id, !r.desfazer)); J.vibrar(15);
        if (r.desfazer) return dizer(alvos.length === 1 ? `Pronto, senhor. ${alvos[0].titulo} voltou para as pendentes.` : `Pronto, senhor. ${alvos.length} tarefas voltaram para as pendentes.`);
        const lc = alvos.every((t) => t.lista && t.lista === alvos[0].lista) ? T.lista_(alvos[0].lista) : null;
        if (lc && lc.tipo === "compras") { const f2 = T.itensDa(lc.id).filter((t) => !t.feita).length; return dizer(`No carrinho: ${alvos.map((t) => t.titulo).join(", ")}. ${f2 ? (f2 === 1 ? "Falta 1 item" : `Faltam ${f2} itens`) + " na lista." : "Tudo comprado, senhor ✓"}`); }
        const faltam = T.pendentes().length;
        return dizer(`${alvos.length === 1 ? "Feito ✓ " + alvos[0].titulo + "." : `Marquei ${alvos.length} tarefas como feitas.`} ${faltam ? `Restam ${faltam === 1 ? "1 pendente" : faltam + " pendentes"}.` : "Nenhuma pendente, senhor. Muito bem."}`);
      }
      case "tarefa_apagar": {
        const alvos = tarefasAlvo(r, "todas");
        if (!alvos.length) { await dizer(resp || "Não encontrei essa tarefa, senhor."); return porVoz && ouvirDeNovo(); }
        return pedirApagarTarefas(alvos, porVoz);
      }
      case "tarefa_editar": {
        const t = T.obter(r.id);
        if (!t || !r.tarefa) { await dizer(resp || "Qual tarefa o senhor deseja mudar?"); return porVoz && ouvirDeNovo(); }
        const novo = T.alterar(t.id, r.tarefa);
        return dizer(`Alterado, senhor: ${novo.titulo}${novo.prazo ? ", para " + T.rotuloPrazo(novo, true) : ", sem prazo"}.`);
      }
      case "tarefa_listar": {
        const f = Object.assign({ status: "pendentes" }, r.filtro || {});
        const l = T.filtrar(f);
        const qual = f.status === "feitas" ? "concluída" : "pendente";
        const lf = f.lista ? T.acharLista(f.lista) : null;
        if (f.lista && !lf) return dizer(`Não encontrei a lista ${f.lista}, senhor.`);
        if (lf) T.mostrarLista(lf.id);
        if (lf && lf.tipo === "compras" && f.status !== "feitas") {
          if (!l.length) return dizer(`Nada para comprar na lista ${lf.nome}, senhor.`);
          return dizer(`Na lista ${lf.nome} ${l.length === 1 ? "falta 1 item" : "faltam " + l.length + " itens"}:\n${l.map((t) => T.textoItem(t)).join(";\n")}.`);
        }
        const periodo = (f.de ? " " + fraseperiodo(f) : "") + (lf ? " na lista " + lf.nome : "");
        if (!l.length) return dizer(f.status === "feitas" ? `Nenhuma tarefa concluída${periodo}, senhor.` : `Nenhuma tarefa pendente${periodo}, senhor.`);
        const itens = l.map((t) => `${t.importante ? "★ " : ""}${T.textoItem(t)}${t.prazo ? " (" + T.rotuloPrazo(t) + ")" : ""}`);
        return dizer(`O senhor tem ${l.length === 1 ? "1 tarefa " + qual : l.length + " tarefas " + qual + "s"}${periodo}:\n${itens.join(";\n")}.`);
      }
      case "naoentendi": await dizer("Perdão, senhor, não consegui ouvir bem. Pode repetir?"); return porVoz && ouvirDeNovo();
      case "perguntar": await dizer(resp || "Pode me dar mais detalhes, senhor?"); return porVoz && ouvirDeNovo();
      case "listar": {
        if (r.filtro && r.filtro.de) {
          const l = filtrarAgenda(r.filtro);
          if (!l.length) return dizer(`O senhor não tem nada marcado ${fraseperiodo(r.filtro)}.`);
          const umDia = (r.filtro.ate || r.filtro.de) === r.filtro.de;
          const itens = l.map((c) => `${umDia ? "" : J.rotuloDia(c.data).replace(" · ", ", ") + ", "}${c.diaInteiro ? "o dia inteiro" : "às " + J.fmtH(c.inicio)}: ${c.titulo}`);
          return dizer(`${fraseperiodo(r.filtro, true)}, o senhor tem ${l.length === 1 ? "1 compromisso" : l.length + " compromissos"}:\n${itens.join(";\n")}.`);
        }
        return dizer(resp || "Sua agenda está livre, senhor.");
      }
      default: {
        await dizer(resp || variar(PRONTO, "pronto"));
        if (porVoz && pendente) ouvirDeNovo();
      }
    }
  }

  /* ---------- processar uma mensagem (texto ou áudio) ---------- */
  let ocupado = false;
  async function processar(ent) {
    if (ocupado) return; ocupado = true;
    $("sugestoes").hidden = true;
    marcarSaudacao();
    const porVoz = !!ent.audio;
    let minha = null;
    if (ent.texto) { minha = bolha("eu", ent.texto); historico.push({ de: "eu", texto: ent.texto, t: Date.now() }); salvarHist(); }
    else minha = bolha("eu", "Áudio…", "voz carregando");
    estado("pensando");
    const pens = digitando();
    let r = null;
    try {
      // atalhos instantâneos para respostas simples digitadas
      if (ent.texto && pendente) { const l = J.cerebro.local(ent.texto, pendente); if (["confirmar", "recusar", "lembrete"].includes(l.acao)) r = l; }
      if (!r && ent.texto && /^\s*(jarbas[,\s]*)?(a\s+)?paz\s+(de\s+deus|do\s+senhor)[\s,]*(jarbas)?[\s!?.,]*$/i.test(ent.texto)) r = { acao: "conversa", resposta: variar(["Amém, senhor.", "Amém, senhor. Em que posso ajudá-lo?", "Amém, senhor. Às suas ordens."], "amem") };
      if (!r && ent.texto && /^\s*(oi|olá|ola|ei|ô)?[,\s]*jarbas[\s!?.,]*$/i.test(ent.texto)) r = { acao: "conversa", resposta: variar(PRONTO, "pronto") };
      if (!r) {
        try { r = await J.cerebro.entender(ent, pendente, historico); }
        catch (e1) {
          if (e1.tipo === "chave" || e1.tipo === "semchave" || e1.tipo === "rede") throw e1;
          await J.sleep(1500); // o Google às vezes falha uma vez: tenta de novo antes de incomodar o senhor
          r = await J.cerebro.entender(ent, pendente, historico);
        }
      }
    } catch (e) {
      console.warn("Jarbas IA", e && e.tipo, e && e.status, e && e.message);
      if (ent.texto) {
        r = J.cerebro.local(ent.texto, pendente);
        if (r.acao === "conversa" && e.tipo !== "semchave") { r.resposta = G.explicar(e); r.tecnico = `Detalhe técnico: ${e.tipo || "erro"}${e.status ? " " + e.status : ""}${e.modeloUsado ? " · " + e.modeloUsado : ""}${e.message ? " · " + String(e.message).slice(0, 120) : ""}`; }
      } else {
        pens.remove(); minha.remove(); estado(); ocupado = false;
        await dizer(G.explicar(e), { guardar: false });
        bolha("jarbas", `Detalhe técnico: ${e.tipo || "erro"}${e.status ? " " + e.status : ""}${e.modeloUsado ? " · " + e.modeloUsado : ""}${e.message ? " · " + String(e.message).slice(0, 120) : ""}`, "tecnico");
        return;
      }
    }
    pens.remove(); estado();
    if (porVoz) {
      const tr = String(r.transcricao || "").trim();
      if (!tr || r.acao === "naoentendi") { minha.remove(); r.acao = "naoentendi"; }
      else { minha.textContent = tr; minha.classList.remove("carregando"); historico.push({ de: "eu", texto: tr, t: Date.now(), voz: true }); salvarHist(); }
    }
    ocupado = false;
    try { await executar(r, porVoz); if (r.tecnico) bolha("jarbas", r.tecnico, "tecnico"); } catch (e) { console.error(e); }
  }
  function enviarTexto(t) { t = String(t || "").trim(); if (!t) return; if (escuta) escuta.cancelar(); if (ocupado) { J.ui.toast("Um instante, senhor…"); return; } V.destravar(); processar({ texto: t }); }

  /* ================= microfone ================= */
  let escuta = null, interrompeu = false;
  async function ouvir({ auto = false, nova = false } = {}) {
    if (escuta) { escuta.parar(); return; }
    if (auto && interrompeu) return;
    /* o senhor tocou no microfone enquanto eu falava: paro de falar e já começo a ouvir */
    if (ocupado && !auto && V.falando()) {
      interrompeu = true; V.calar();
      for (let i = 0; i < 40 && ocupado; i++) await J.sleep(50);
      interrompeu = false;
    }
    if (ocupado) return;
    V.destravar(); V.calar();
    if (!G.temChave()) { if (!auto) { await dizer("Para eu ouvir sua voz, preciso da minha chave do Google, senhor. Vamos configurá-la?"); mostrarInicio("chave"); } return; }
    if (!V.microfoneDisponivel()) { if (!auto) dizer("Este navegador não me deixa usar o microfone, senhor. Abra o Jarbas pelo ícone na tela de início."); return; }
    const ov = $("escuta"), orbeG = $("escuta-orbe"), txt = $("escuta-txt");
    txt.textContent = auto ? "Pode responder, senhor…" : "Ouvindo, senhor…";
    ov.hidden = false; estado("ouvindo");
    if (!auto && !nova) { V.som("ouvir"); await J.sleep(160); }
    try {
      escuta = await V.ouvir({
        esperaInicial: auto ? 6000 : 9000,
        onNivel: (n) => { orbeG.style.transform = `scale(${1 + n * 0.35})`; },
        onFala: () => { txt.textContent = "Estou ouvindo… toque quando terminar"; },
      });
    } catch (e) {
      ov.hidden = true; estado(); escuta = null;
      if (e.message === "negado") dizer("Preciso da permissão do microfone, senhor. Toque no microfone de novo e escolha Permitir. Se não aparecer, vá em Ajustes do iPhone, Safari, Microfone.");
      else dizer("Não consegui acessar o microfone agora, senhor.");
      return;
    }
    const res = await escuta.pronto; escuta = null;
    if (res && res.mudo && !nova) { return ouvir({ auto, nova: true }); } // reabre o microfone sozinho, sem incomodar
    ov.hidden = true; orbeG.style.transform = ""; estado();
    if (!res || res.mudo) { if (res && !auto) dizer("Não consegui ouvir o microfone, senhor. Toque nele de novo, por favor.", { guardar: false }); return; }
    if (!res.falou || res.duracao < 0.5) { if (res.pico < 0.003) V.soltarMicrofone(); if (!auto) dizer("Não ouvi nada, senhor. Toque no microfone e fale de novo, por favor.", { guardar: false }); return; }
    V.som("fim");
    processar({ audio: res.wav, duracao: res.duracao });
  }
  /* conversa contínua: depois de uma pergunta do Jarbas, o microfone abre sozinho */
  function ouvirDeNovo() { if (interrompeu) return; if (J.store.get("voz.continua", true) && V.ligada() && document.visibilityState === "visible") setTimeout(() => ouvir({ auto: true }), 250); }
  $("escuta-orbe").onclick = () => escuta && escuta.parar();
  $("escuta-enviar").onclick = () => escuta && escuta.parar();
  $("escuta-cancelar").onclick = () => escuta && escuta.cancelar();

  /* ================= compositor ================= */
  function ajustarCampo() {
    entrada.style.height = "auto"; entrada.style.height = Math.min(entrada.scrollHeight, 132) + "px";
    const tem = !!entrada.value.trim();
    btnAcao.classList.toggle("enviar", tem); btnAcao.setAttribute("aria-label", tem ? "Enviar" : "Falar com o Jarbas");
  }
  entrada.addEventListener("input", ajustarCampo);
  entrada.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarCampo(); } });
  function enviarCampo() {
    const t = entrada.value.trim(); if (!t) return;
    entrada.value = ""; ajustarCampo(); enviarTexto(t);
  }
  btnAcao.addEventListener("click", () => { if (entrada.value.trim()) enviarCampo(); else { entrada.blur(); ouvir(); } });
  $("form").addEventListener("submit", (e) => { e.preventDefault(); enviarCampo(); });
  $("sugestoes").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) enviarTexto(b.textContent); });

  /* ================= abas ================= */
  let telaAtual = "conversa";
  function mostrar(qual) {
    telaAtual = qual;
    ["conversa", "agenda", "tarefas", "ajustes"].forEach((t) => { $("tela-" + t).hidden = t !== qual; });
    document.querySelectorAll("#abas button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.tela === qual) || b.dataset.tela === qual && b.setAttribute("aria-current", "page"));
    $("compositor").hidden = qual !== "conversa";
    if (qual === "agenda") { A.render(); $("tela-agenda").scrollTop = 0; }
    if (qual === "ajustes") renderAjustes();
    if (qual === "tarefas") { T.render(); $("tela-tarefas").scrollTop = 0; }
    if (qual === "conversa") rolar();
  }
  J.ui.mostrar = mostrar;
  document.querySelectorAll("#abas button").forEach((b) => (b.onclick = () => mostrar(b.dataset.tela)));
  function contador() { const n = A.expandir(J.agora().data, J.addDias(J.agora().data, 30)).length; $("contador").hidden = !n; $("contador").textContent = n > 99 ? "99+" : String(n); }
  function contadorT() { const hoje = J.agora().data; const n = T.pendentes().filter((t) => t.prazo && t.prazo <= hoje).length; $("contador-t").hidden = !n; $("contador-t").textContent = n > 99 ? "99+" : String(n); }
  J.contatos.onMudou = () => { if (telaAtual === "ajustes") renderAjustes(); };
  T.renovar(); setInterval(() => T.renovar(), 10 * 60000);
  T.onMudou = () => { contadorT(); if (telaAtual === "tarefas") T.render(); J.avisos.sincronizar(); };
  A.onMudou = () => { contador(); if (telaAtual === "agenda") A.render(); J.avisos.sincronizar(); if (telaAtual === "ajustes") renderAjustes(); };

  /* botão de voz no topo */
  function pintarVoz() { const on = V.ligada(); $("btn-voz").setAttribute("aria-pressed", String(on)); $("btn-voz").setAttribute("aria-label", on ? "Voz do Jarbas ligada" : "Voz do Jarbas desligada"); }
  $("btn-voz").onclick = () => { const on = !V.ligada(); J.store.set("voz.ligada", on); pintarVoz(); if (!on) V.calar(); else { V.destravar(); V.falar("Voz ligada, senhor."); } J.ui.toast(on ? "Voz ligada" : "Voz desligada"); };

  /* ================= alarme de verdade (app Relógio, via Atalho do iPhone) ================= */
  const ATALHO = "Jarbas Alarme";
  /* próximo aviso do compromisso (ou o início), ainda no futuro */
  function horaAlarme(c) {
    if (!A.valido(c) || c.lembrete === -1) return null;
    const inicio = J.instante(c.data, c.diaInteiro ? "08:00" : c.inicio), agora = Date.now() + 60000;
    const ts = J.listaLembretes(c.lembrete).map((m) => inicio - m * 60000).concat([inicio]).filter((t) => t > agora).sort((a, b) => a - b);
    return ts.length ? ts[0] : null;
  }
  const hhmm = (t) => { const d = new Date(t - 3 * 3600000); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
  const chaveAlarme = (c, t) => c.id + "@" + t;
  function abrirAtalho(hora, rotulo) {
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(ATALHO)}&input=text&text=${encodeURIComponent(hora + "|" + rotulo)}`;
  }
  function oferecerAlarme(c, recemSalvo) {
    const t = horaAlarme(c); if (!t) return;
    const ofertas = J.store.get("alarme.oferecidos", {});
    const k = chaveAlarme(c, t);
    if (t - Date.now() > 23.5 * 3600000) {
      if (recemSalvo) bolha("jarbas", `Os avisos já vão tocar como urgentes e repetidos. O alarme do Relógio só pode ser marcado para as próximas 24 horas, então eu peço para marcá-lo na véspera, quando o senhor abrir o Jarbas.`, "tecnico");
      return;
    }
    if (ofertas[k] && !recemSalvo) return;
    ofertas[k] = Date.now(); J.store.set("alarme.oferecidos", ofertas);
    const hora = hhmm(t);
    const b = el("button", { class: "btn primario", type: "button", text: `⏰ Pôr alarme às ${J.fmtH(hora)}`, onclick: () => {
      if (!J.store.get("atalho.ok")) return mostrarAtalho(() => abrirAtalho(hora, c.titulo));
      b.textContent = "Abrindo o Atalhos…"; abrirAtalho(hora, c.titulo);
    } });
    const caixa = el("div", { class: "msg jarbas" }, el("div", { text: `Para tocar como alarme de verdade, toque abaixo e eu crio o alarme no Relógio (${c.titulo}).` }), el("div", { class: "acoes", style: "margin-top:10px" }, b));
    chat.append(caixa); rolar();
  }
  /* ao abrir o app: oferece o alarme dos compromissos com alarme que entraram nas próximas 24 h */
  function revisarAlarmes() { A.expandir(J.agora().data, J.addDias(J.agora().data, 1)).filter((c) => c.alarme).forEach((c) => oferecerAlarme(c, false)); }
  function mostrarAtalho(depois) {
    const raiz = $("inicio"); raiz.hidden = false;
    const fechar = () => { raiz.hidden = true; raiz.replaceChildren(); if (telaAtual === "ajustes") renderAjustes(); };
    const pronto = el("button", { class: "btn primario", type: "button", text: "Já criei. Testar (alarme em 2 min)", onclick: () => {
      J.store.set("atalho.ok", true); fechar();
      if (depois) depois(); else abrirAtalho(hhmm(Date.now() + 120000), "Teste do Jarbas");
    } });
    raiz.replaceChildren(el("div", { class: "inicio-in" },
      el("div", { class: "orbe" }, el("i")),
      el("h2", { text: "Alarme de verdade" }),
      el("p", { class: "lead", text: "Uma vez só. Crio o alarme no app Relógio pelo app Atalhos (já vem no iPhone). Ele toca como despertador, mesmo no silencioso." }),
      el("ol", { class: "passos" },
        el("li", { html: `<span>Abra o app <b>Atalhos</b>, toque no <b>+</b> e dê o nome <b>${ATALHO}</b> (exatamente assim).</span>` }),
        el("li", { html: `<span>Toque em <b>Adicionar Ação</b>, busque <b>Dividir Texto</b> e adicione. Toque em <b>Texto</b> e escolha <b>Entrada do Atalho</b>. Em <b>Novas Linhas</b>, escolha <b>Personalizado</b> e digite <b>|</b> (barra em pé).</span>` }),
        el("li", { html: `<span>Adicione <b>Obter Item da Lista</b> (deixe <b>Primeiro Item</b>). Depois adicione outra <b>Obter Item da Lista</b>, escolha <b>Último Item</b> e, em <b>Lista</b>, escolha <b>Texto Dividido</b>.</span>` }),
        el("li", { html: `<span>Adicione <b>Criar Alarme</b> (do Relógio). Em <b>Hora</b>, toque e escolha a variável <b>Item da Lista</b> (o primeiro). Em <b>Rótulo</b>, escolha o segundo <b>Item da Lista</b>.</span>` }),
        el("li", { html: `<span>Se o Atalhos perguntar de onde recebe a entrada, deixe <b>Texto</b>. Toque em <b>OK</b> para salvar e volte aqui.</span>` })),
      pronto,
      el("p", { class: "fraco", text: "Na primeira vez, o iPhone pergunta se o Atalhos pode mexer no Relógio: toque em Permitir. Depois, cada alarme é criado com um toque." }),
      el("button", { class: "ligacao", type: "button", text: "Agora não", onclick: fechar })));
  }

  /* ================= lembretes ================= */
  let avisoAtual = null;
  function avisar(c, quando) {
    if (c.tarefa) return avisarTarefa(c);
    avisoAtual = c;
    $("aviso-t").textContent = c.titulo;
    $("aviso-s").textContent = (c.diaInteiro ? "Dia inteiro" : "Às " + J.fmtH(c.inicio)) + " · " + quando + (c.local ? " · " + c.local : "");
    $("aviso").hidden = false;
    V.destravar(); V.som("aviso"); J.vibrar([200, 100, 200]);
    setTimeout(() => dizer(`Com licença, senhor. Lembrete: ${c.titulo}${c.diaInteiro ? "" : ", às " + J.fmtH(c.inicio)}, ${quando}.`), 1100);
    try { if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) navigator.serviceWorker.ready.then((r) => r.showNotification("Jarbas · " + c.titulo, { body: (c.diaInteiro ? "Hoje" : "Às " + J.fmtH(c.inicio)) + ", " + quando, icon: "icons/icon-192.png", tag: c.id })); } catch (e) {}
  }
  function avisarTarefa(c) {
    avisoAtual = c;
    $("aviso-t").textContent = (c.ehLista ? "Lista: " : "Tarefa: ") + c.titulo;
    $("aviso-s").textContent = c.semHora ? "Para hoje" : "Prazo às " + J.fmtH(c.inicio);
    $("aviso").hidden = false;
    V.destravar(); V.som("aviso"); J.vibrar([200, 100, 200]);
    if (c.ehLista) { $("aviso-s").textContent = [c.semHora ? "Hoje" : "Às " + J.fmtH(c.inicio), c.local].filter(Boolean).join(" · "); T.mostrarLista(c.listaId); setTimeout(() => dizer(`Com licença, senhor. Lembrete da lista ${c.titulo}${c.semHora ? ", hoje" : ", às " + J.fmtH(c.inicio)}${c.local ? ": " + c.local : ""}.`), 1100); return; }
    setTimeout(() => dizer(`Com licença, senhor. Lembrete da tarefa: ${c.titulo}${c.semHora ? ", para hoje" : ", às " + J.fmtH(c.inicio)}.`), 1100);
  }
  $("aviso-ok").onclick = () => { $("aviso").hidden = true; avisoAtual = null; };
  const verificar = () => { A.verificarLembretes(avisar); A.verificarLembretes(avisar, T.comoCompromissos()); };
  setInterval(verificar, 2000);
  setTimeout(revisarAlarmes, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { T.renovar(); verificar(); contador(); contadorT(); if (telaAtual === "tarefas") T.render(); revisarAlarmes(); J.avisos.sincronizar(); if (telaAtual === "agenda") A.render(); } });

  /* ================= ajustes ================= */
  function interruptor(ligado, aoMudar, rotulo) {
    const i = el("input", { type: "checkbox", role: "switch", "aria-label": rotulo }); i.checked = !!ligado; i.onchange = () => aoMudar(i.checked);
    return el("label", { class: "chave-sw" }, i, el("span"));
  }
  function linha(rot, sub, direita) { return el("div", { class: "linha" }, el("div", { class: "rot" }, rot, sub ? el("small", { text: sub }) : null), direita); }
  function selecao(opcoes, valor, aoMudar, rotulo) {
    const s = el("select", { "aria-label": rotulo }); opcoes.forEach(([v, t]) => s.append(el("option", { value: v, text: t }))); s.value = valor; s.onchange = () => aoMudar(s.value); return s;
  }
  function renderAjustes() {
    const raiz = $("ajustes"); const tem = G.temChave();
    const cerebro = el("div", { class: "grupo" },
      linha("Google Gemini", tem ? "Modelo: " + G.modelo() : "Sem chave: só agenda básica por texto", el("span", { class: "pilula" + (tem ? "" : " nao"), text: tem ? "Conectado" : "Desligado" })),
      linha(tem ? "Trocar a chave" : "Configurar a chave grátis", "Passo a passo no Google AI Studio", el("button", { class: "btn", type: "button", text: tem ? "Trocar" : "Configurar", onclick: () => mostrarInicio("chave") })));

    const vozes = V.vozesOrdenadas();
    const premium = V.modo() === "premium";
    const voz = el("div", { class: "grupo" },
      linha("Responder em voz", null, interruptor(V.ligada(), (v) => { J.store.set("voz.ligada", v); pintarVoz(); if (!v) V.calar(); }, "Responder em voz")),
      linha("Tipo de voz", premium ? "Mais natural, porém demora alguns segundos e tem cota diária" : "Responde na hora", selecao([["premium", "Premium"], ["iphone", "Do iPhone"]], V.modo(), (v) => { J.store.set("voz.modo", v); renderAjustes(); }, "Tipo de voz")),
      premium ? linha("Voz premium", null, selecao(V.VOZES_PREMIUM, V.vozPremium(), (v) => { J.store.set("voz.premium", v); testarVoz(); }, "Voz premium"))
        : linha("Voz do iPhone", vozes.length ? null : "Nenhuma voz em português encontrada", selecao([["", "Automática"]].concat(vozes.map((v) => [v.name, v.name + (V.masculina(v) ? " ♂" : "")])), V.vozIphone(), (v) => { J.store.set("voz.iphone", v); testarVoz(); }, "Voz do iPhone")),
      premium ? null : linha("Jeito de falar", null, selecao([["ia", "Assistente de IA"], ["natural", "Natural"], ["grave", "Grave e calmo"]], J.store.get("voz.estilo", "ia"), (v) => { J.store.set("voz.estilo", v); testarVoz(); }, "Jeito de falar")),
      linha("Ouvir um exemplo", null, el("button", { class: "btn", type: "button", text: "Ouvir", onclick: testarVoz })),
      linha("Conversa contínua", "Quando eu fizer uma pergunta, o microfone abre sozinho", interruptor(J.store.get("voz.continua", true), (v) => J.store.set("voz.continua", v), "Conversa contínua")));

    const AV = J.avisos, avOn = AV.ativo();
    const msgAv = el("small", { text: "" });
    const testar = (seg) => async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await AV.teste(seg); J.ui.toast(seg ? `Aviso de teste chega em ${seg} s. Pode bloquear a tela.` : "Aviso de teste enviado"); }
      catch (err) { J.ui.toast("Não consegui enviar. Confira a internet."); }
      b.disabled = false;
    };
    const avisos = el("div", { class: "grupo" },
      linha("Avisos com o app fechado", avOn ? "Ligado: os lembretes chegam pelo app ntfy, mesmo com a tela bloqueada" : "Chegam mesmo com o Jarbas fechado e a tela bloqueada", interruptor(avOn, (v) => { AV.ligar(v); renderAjustes(); J.ui.toast(v ? "Avisos ligados" : "Avisos desligados"); }, "Avisos com o app fechado")),
      linha("Repetir o aviso", "Toca de novo a cada minuto, para não passar despercebido", selecao([["0", "Não repetir"], ["1", "1 vez"], ["2", "2 vezes"], ["3", "3 vezes"], ["5", "5 vezes"]], String(AV.repeticoes()), (v) => { J.store.set("ntfy.repetir", Number(v)); AV.sincronizarTudo(); }, "Repetir o aviso")),
      linha("Alarme do Relógio", J.store.get("atalho.ok") ? "Pronto: peça \"com alarme\" e eu crio no Relógio" : "Para tocar como despertador (uma vez só)", el("button", { class: "btn", type: "button", text: J.store.get("atalho.ok") ? "Testar" : "Configurar", onclick: () => J.store.get("atalho.ok") ? abrirAtalho(hhmm(Date.now() + 120000), "Teste do Jarbas") : mostrarAtalho() })),
      linha("Passo a passo", "Instalar o ntfy e ligar ao Jarbas (uma vez só)", el("button", { class: "btn", type: "button", text: "Ver", onclick: mostrarNtfy })),
      linha("Testar agora", null, el("button", { class: "btn", type: "button", text: "Enviar", onclick: testar(0) })),
      linha("Testar com a tela bloqueada", "Chega em 30 segundos", el("button", { class: "btn", type: "button", text: "Agendar", onclick: testar(30) })), msgAv);
    const inputArq = el("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: importar });
    const dados = el("div", { class: "grupo" },
      linha("Fazer backup", "Salva agenda e ajustes num arquivo", el("button", { class: "btn", type: "button", text: "Exportar", onclick: exportar })),
      linha("Restaurar backup", null, el("button", { class: "btn", type: "button", text: "Importar", onclick: () => inputArq.click() })),
      linha("Limpar a conversa", "A agenda não é apagada", el("button", { class: "btn perigo", type: "button", text: "Limpar", onclick: (e) => {
        const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmar"; return; }
        historico = []; salvarHist(); chat.replaceChildren(); descartarPendente(); bolha("jarbas", variar(PRONTO, "pronto")); J.ui.toast("Conversa limpa"); renderAjustes();
      } })), inputArq);

    const app = el("div", { class: "grupo" },
      linha("Instalado na tela de início", instalado() ? "Funcionando como aplicativo" : "Abra no Safari e adicione à Tela de Início", el("span", { class: "pilula" + (instalado() ? "" : " nao"), text: instalado() ? "Sim" : "Não" })),
      (J.store.get("voz.diag", []).length ? linha("Diagnóstico da voz", J.store.get("voz.diag", []).slice(-3).join(" · "), el("button", { class: "btn", type: "button", text: "Limpar", onclick: () => { J.store.set("voz.diag", []); renderAjustes(); } })) : null),
      instalado() ? null : linha("Como instalar", null, el("button", { class: "btn", type: "button", text: "Ver", onclick: () => mostrarInicio("instalar") })));

    raiz.replaceChildren(
      el("div", { class: "secao" }, el("h3", { text: "Cérebro" }), cerebro),
      el("div", { class: "secao" }, el("h3", { text: "Voz" }), voz),
      el("div", { class: "secao" }, el("h3", { text: "Lembretes" }), avisos),
      el("div", { class: "secao" }, el("h3", { text: "Contatos (para ligar pelo Jarbas)" }), J.contatos.renderGrupo()),
      el("div", { class: "secao" }, el("h3", { text: "Seus dados (ficam só neste iPhone)" }), dados),
      el("div", { class: "secao" }, el("h3", { text: "Aplicativo" }), app),
      el("p", { class: "rodape", text: `Jarbas ${VERSAO} · seu assistente pessoal` }));
  }
  V.onVozes = () => { if (telaAtual === "ajustes") renderAjustes(); };
  function testarVoz() { V.destravar(); V.falar(`${J.saudacao()}, senhor. Sou o Jarbas. Em que posso ajudá-lo?`, { forcar: true }); }

  async function exportar() {
    const dados = JSON.stringify(J.store.exportar(), null, 1);
    const nome = `jarbas-backup-${J.agora().data}.json`;
    try {
      const arq = new File([dados], nome, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [arq] })) { await navigator.share({ files: [arq], title: "Backup do Jarbas" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = el("a", { href: URL.createObjectURL(new Blob([dados], { type: "application/json" })), download: nome }); document.body.append(a); a.click(); a.remove();
  }
  function importar(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { J.store.importar(JSON.parse(r.result)); J.ui.toast("Backup restaurado"); setTimeout(() => location.reload(), 700); } catch (err) { J.ui.toast(err.message || "Arquivo inválido"); } };
    r.readAsText(f); e.target.value = "";
  }

  /* ================= passo a passo do ntfy ================= */
  function mostrarNtfy() {
    const AV = J.avisos, topico = AV.topico();
    const raiz = $("inicio"); raiz.hidden = false;
    const fechar = () => { raiz.hidden = true; raiz.replaceChildren(); if (telaAtual === "ajustes") renderAjustes(); };
    const copiar = el("button", { class: "btn", type: "button", text: "Copiar meu canal", onclick: async (e) => {
      try { await navigator.clipboard.writeText(topico); e.currentTarget.textContent = "Copiado ✓"; } catch (err) { J.ui.toast(topico); }
    } });
    const testar = el("button", { class: "btn primario", type: "button", text: "Enviar aviso de teste", onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { AV.ligar(true); await AV.teste(0); b.textContent = "Enviado. Chegou no iPhone?"; J.vibrar(15); }
      catch (err) { b.disabled = false; b.textContent = "Sem internet. Tentar de novo"; }
    } });
    raiz.replaceChildren(el("div", { class: "inicio-in" },
      el("div", { class: "orbe" }, el("i")),
      el("h2", { text: "Avisos com o app fechado" }),
      el("p", { class: "lead", text: "Uma vez só. Depois disso, os lembretes chegam com som, mesmo com a tela bloqueada." }),
      el("ol", { class: "passos" },
        el("li", { html: `<span>Instale o app grátis <b>ntfy</b> na App Store: <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">abrir na App Store</a>. Abra-o e toque em <b>Permitir</b> notificações.</span>` }),
        el("li", { html: `<span>Toque em <b>Copiar meu canal</b> aqui embaixo. Seu canal é <b>${topico}</b> (é secreto, não compartilhe).</span>` }),
        el("li", { html: `<span>No ntfy, toque no <b>+</b> (no alto, à direita), cole o canal em <b>Topic</b>, deixe o servidor padrão (ntfy.sh) e toque em <b>Subscribe</b>.</span>` }),
        el("li", { html: `<span>Volte aqui e toque em <b>Enviar aviso de teste</b>. Se a notificação chegar, está tudo pronto.</span>` })),
      copiar, testar,
      el("p", { class: "fraco", text: "Os avisos são agendados até 3 dias à frente; os mais distantes, o Jarbas agenda sozinho quando o senhor o abre." }),
      el("button", { class: "ligacao", type: "button", text: "Concluir", onclick: fechar })));
  }
  J.ui.mostrarNtfy = mostrarNtfy;

  /* ================= primeira vez: instalar e chave ================= */
  const ICO_COMP = '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const ICO_MAIS = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  function mostrarInicio(passo) {
    const raiz = $("inicio"); raiz.hidden = false;
    const fechar = () => { raiz.hidden = true; raiz.replaceChildren(); };
    if (passo === "instalar") {
      raiz.replaceChildren(el("div", { class: "inicio-in" },
        el("div", { class: "orbe" }, el("i")),
        el("h2", { text: "Instale o Jarbas" }),
        el("p", { class: "lead", text: "Assim ele abre em tela cheia, como um aplicativo, e pode usar o microfone." }),
        el("ol", { class: "passos" },
          el("li", { html: `<span>Abra este endereço no <b>Safari</b>.</span>` }),
          el("li", { html: `<span>Toque em <b>Compartilhar</b> ${ICO_COMP} (na barra de baixo; se não aparecer, toque em <b>⋯</b> primeiro).</span>` }),
          el("li", { html: `<span>Role e toque em <b>Adicionar à Tela de Início</b> ${ICO_MAIS}.</span>` }),
          el("li", { html: `<span>Deixe <b>Abrir como App Web</b> ligado e toque em <b>Adicionar</b>.</span>` }),
          el("li", { html: `<span>Feche o Safari e abra o <b>Jarbas</b> pelo ícone novo na tela de início.</span>` })),
        el("button", { class: "ligacao", type: "button", text: "Continuar no navegador por enquanto", onclick: () => { J.store.set("inicio.pulouInstalar", true); fechar(); if (!G.temChave() && !J.store.get("inicio.pulouChave")) mostrarInicio("chave"); } })));
      return;
    }
    const campo = el("input", { type: "text", placeholder: "Cole aqui a chave (AQ.… ou AIza…)", autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Chave da API do Gemini", value: "" });
    const msg = el("p", { class: "fraco", text: "A chave fica guardada só neste iPhone." });
    const botao = el("button", { class: "btn primario", type: "button", text: "Conectar o Jarbas" });
    botao.onclick = async () => {
      const k = campo.value.trim().replace(/\s+/g, "");
      if (k.length < 20) { msg.textContent = "Essa chave parece incompleta. Copie de novo no AI Studio."; msg.style.color = "var(--alerta)"; return; }
      botao.disabled = true; botao.textContent = "Testando a chave…"; msg.style.color = ""; msg.textContent = "Conversando com o Google…";
      try {
        await G.configurar(k);
        fechar(); renderAjustes(); V.destravar();
        dizer("Conectado, senhor. Estou pronto.", { guardar: false });
      } catch (e) {
        botao.disabled = false; botao.textContent = "Conectar o Jarbas"; msg.style.color = "var(--alerta)";
        msg.textContent = e.tipo === "chave" ? "O Google recusou essa chave. Confira se copiou inteira." : e.tipo === "rede" ? "Sem internet. Tente de novo." : "Não deu certo agora (" + (e.message || "erro") + "). Tente de novo.";
      }
    };
    raiz.replaceChildren(el("div", { class: "inicio-in" },
      el("div", { class: "orbe" }, el("i")),
      el("h2", { text: "Ligue o cérebro do Jarbas" }),
      el("p", { class: "lead", text: "Leva 2 minutos e é grátis. Só precisa de uma conta Google (a do Gmail serve)." }),
      el("ol", { class: "passos" },
        el("li", { html: `<span>Toque aqui: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e entre com sua conta Google. Se pedir, aceite os termos.</span>` }),
        el("li", { html: `<span>Toque em <b>Create API key</b> (Criar chave de API). Se perguntar o projeto, escolha o que aparecer ou crie um novo.</span>` }),
        el("li", { html: `<span>Toque em <b>Copiar</b> ao lado da chave (começa com <b>AQ.</b> ou <b>AIza</b>).</span>` }),
        el("li", { html: `<span>Volte aqui, cole no campo abaixo e toque em <b>Conectar</b>. Não precisa cadastrar cartão.</span>` })),
      campo, botao, msg,
      el("button", { class: "ligacao", type: "button", text: G.temChave() ? "Voltar" : "Fazer isso depois", onclick: () => { J.store.set("inicio.pulouChave", true); fechar(); } })));
  }

  /* ================= teclado e tela (iPhone) ================= */
  function ajustarAltura() {
    const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--altura", h + "px");
    document.body.classList.toggle("teclado", !!vv && window.innerHeight - vv.height > 120);
    if (vv && vv.offsetTop) window.scrollTo(0, 0);
    if (telaAtual === "conversa") rolar();
  }
  if (window.visualViewport) { visualViewport.addEventListener("resize", ajustarAltura); visualViewport.addEventListener("scroll", ajustarAltura); }
  window.addEventListener("resize", ajustarAltura); ajustarAltura();
  document.addEventListener("gesturestart", (e) => e.preventDefault()); // sem zoom de pinça
  let ultimoToque = 0;
  document.addEventListener("touchend", (e) => { const t = Date.now(); if (t - ultimoToque < 300 && !e.target.closest("input,textarea,select")) e.preventDefault(); ultimoToque = t; }, { passive: false });
  document.addEventListener("pointerdown", () => V.destravar(), { passive: true });

  /* ================= início ================= */
  function iniciar() {
    pintarVoz(); contador(); contadorT(); G.revisar(); J.avisos.sincronizar();
    const recentes = historico.slice(-16);
    let ultimoDia = "";
    recentes.forEach((h) => {
      const d = h.t ? new Date(h.t).toLocaleDateString("pt-BR", { timeZone: J.TZ }) : "";
      if (d && d !== ultimoDia) { ultimoDia = d; chat.append(el("div", { class: "data-sep", text: d === new Date().toLocaleDateString("pt-BR", { timeZone: J.TZ }) ? "Hoje" : d })); }
      bolha(h.de, h.texto, h.voz ? "voz" : "");
    });
    if (historico.length) $("sugestoes").hidden = true;
    /* só cumprimenta ao abrir se a conversa estiver vazia ou parada há mais de 30 min (evita resposta "duplicada") */
    const ult = historico[historico.length - 1];
    if (!ult || !ult.t || Date.now() - ult.t > 30 * 60000) bolha("jarbas", variar(PRONTO, "pronto"));
    if (ehIOS && !instalado() && !J.store.get("inicio.pulouInstalar")) mostrarInicio("instalar");
    else if (!G.temChave() && !J.store.get("inicio.pulouChave")) mostrarInicio("chave");
    verificar();
  }
  iniciar();

  /* atualização garantida: compara com a versão publicada e recarrega sozinho */
  async function checarVersao() {
    try {
      const r = await fetch("versao.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const v = (await r.json()).versao;
      if (v && v !== VERSAO && sessionStorage.getItem("jarbas.recarregou") !== v) {
        sessionStorage.setItem("jarbas.recarregou", v);
        try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) {}
        try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((x) => x.update())); } catch (e) {}
        location.reload();
      }
    } catch (e) {}
  }
  checarVersao();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checarVersao(); });

  /* aplicativo offline + atualizações */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const n = reg.installing; if (!n) return;
        n.addEventListener("statechange", () => { if (n.state === "installed" && navigator.serviceWorker.controller) J.ui.toast("Atualizando o Jarbas…"); });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }

  /* para testes automatizados */
  J._teste = { processar, executar, get pendente() { return pendente; }, enviarTexto, mostrar, ouvir };
})(window.J);
