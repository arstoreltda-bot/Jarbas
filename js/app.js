/* Jarbas · aplicativo (conversa, voz, telas, ajustes e primeira vez) */
"use strict";
(function (J) {
  const $ = J.$, el = J.el, V = J.voz, G = J.gemini, A = J.agenda;
  const VERSAO = "1.1.10";
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
    const frase = id ? `Vou alterar para ${c.titulo}, ${J.diaFrase(c.data)}, ${c.diaInteiro ? "o dia inteiro" : "às " + J.fmtH(c.inicio)}${lem}. Confirma, senhor?`
      : `Vou marcar ${c.titulo}, ${J.diaFrase(c.data)}, ${c.diaInteiro ? "o dia inteiro" : "às " + J.fmtH(c.inicio)}${lem}. ${alerta ? alerta + " " : ""}Confirma, senhor?`;
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
    return dizer(`Deseja que eu desmarque ${alvo.titulo}, ${J.diaFrase(alvo.data)}${alvo.diaInteiro ? "" : ", às " + J.fmtH(alvo.inicio)}?`).then(() => porVoz && ouvirDeNovo());
  }
  function pedirCancelamentoVarios(alvos, porVoz) {
    descartarPendente();
    alvos.sort((a, b) => (a.data + (a.inicio || "")).localeCompare(b.data + (b.inicio || "")));
    const p = { tipo: "cancelar", ids: alvos.map((a) => a.id), c: alvos[0] };
    const k = el("div", { class: "cartao perigo" }, el("div", { class: "tt", text: `Desmarcar ${alvos.length} compromissos` }));
    const ul = el("div", { class: "det" });
    alvos.forEach((a) => ul.append(el("span", { html: ICO.dia }), el("span", { text: `${J.rotuloDia(a.data)}${a.diaInteiro ? ", dia inteiro" : ", " + J.fmtH(a.inicio)} · ${a.titulo}` })));
    k.append(ul, el("div", { class: "botoes" }, el("button", { class: "btn", type: "button", text: "Manter", onclick: () => recusar() }), el("button", { class: "btn perigo", type: "button", text: `Desmarcar os ${alvos.length}`, onclick: () => confirmar() })));
    chat.append(k); rolar(); p.cartao = k;
    pendente = p;
    const mesmoDia = alvos.every((a) => a.data === alvos[0].data);
    const nomes = alvos.length <= 4 ? ": " + alvos.map((a) => a.titulo + (a.diaInteiro ? "" : " às " + J.fmtH(a.inicio))).join(", ") : "";
    return dizer(`Realmente deseja desmarcar os ${alvos.length} compromissos${mesmoDia ? " de " + J.diaFrase(alvos[0].data) : ""}${nomes}?`).then(() => porVoz && ouvirDeNovo());
  }
  function confirmar() {
    const p = pendente; if (!p) return dizer(variar(PRONTO, "pronto"));
    pendente = null;
    if (p.tipo === "cancelar" && p.ids) { p.ids.forEach((i) => A.remover(i)); encerrarCartao(p, `${p.ids.length} desmarcados ✓`, true); J.vibrar(15); return dizer(`Pronto, senhor. Desmarquei os ${p.ids.length} compromissos.`); }
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
    pendente = null; encerrarCartao(p, p.tipo === "cancelar" ? "Mantido" : "Não marcado", false);
    return dizer(p.tipo === "cancelar" ? "Perfeitamente, senhor. Deixei como estava." : "Tudo bem, senhor, não marquei.");
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
        const alvos = ids.map((i) => A.obter(i)).filter(Boolean);
        if (!alvos.length) { await dizer(resp || "Qual compromisso o senhor deseja desmarcar?"); return porVoz && ouvirDeNovo(); }
        if (alvos.length > 1) return pedirCancelamentoVarios(alvos, porVoz);
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
      case "naoentendi": await dizer("Perdão, senhor, não consegui ouvir bem. Pode repetir?"); return porVoz && ouvirDeNovo();
      case "perguntar": await dizer(resp || "Pode me dar mais detalhes, senhor?"); return porVoz && ouvirDeNovo();
      case "listar": return dizer(resp || "Sua agenda está livre, senhor.");
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
    ["conversa", "agenda", "ajustes"].forEach((t) => { $("tela-" + t).hidden = t !== qual; });
    document.querySelectorAll("#abas button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.tela === qual) || b.dataset.tela === qual && b.setAttribute("aria-current", "page"));
    $("compositor").hidden = qual !== "conversa";
    if (qual === "agenda") { A.render(); $("tela-agenda").scrollTop = 0; }
    if (qual === "ajustes") renderAjustes();
    if (qual === "conversa") rolar();
  }
  J.ui.mostrar = mostrar;
  document.querySelectorAll("#abas button").forEach((b) => (b.onclick = () => mostrar(b.dataset.tela)));
  function contador() { const n = A.lista().filter((c) => c.data >= J.agora().data).length; $("contador").hidden = !n; $("contador").textContent = n > 99 ? "99+" : String(n); }
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
  function revisarAlarmes() { A.lista().filter((c) => c.alarme).forEach((c) => oferecerAlarme(c, false)); }
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
    avisoAtual = c;
    $("aviso-t").textContent = c.titulo;
    $("aviso-s").textContent = (c.diaInteiro ? "Dia inteiro" : "Às " + J.fmtH(c.inicio)) + " · " + quando + (c.local ? " · " + c.local : "");
    $("aviso").hidden = false;
    V.destravar(); V.som("aviso"); J.vibrar([200, 100, 200]);
    setTimeout(() => dizer(`Com licença, senhor. Lembrete: ${c.titulo}${c.diaInteiro ? "" : ", às " + J.fmtH(c.inicio)}, ${quando}.`), 1100);
    try { if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) navigator.serviceWorker.ready.then((r) => r.showNotification("Jarbas · " + c.titulo, { body: (c.diaInteiro ? "Hoje" : "Às " + J.fmtH(c.inicio)) + ", " + quando, icon: "icons/icon-192.png", tag: c.id })); } catch (e) {}
  }
  $("aviso-ok").onclick = () => { $("aviso").hidden = true; avisoAtual = null; };
  const verificar = () => A.verificarLembretes(avisar);
  setInterval(verificar, 2000);
  setTimeout(revisarAlarmes, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { verificar(); contador(); revisarAlarmes(); J.avisos.sincronizar(); if (telaAtual === "agenda") A.render(); } });

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
    pintarVoz(); contador(); G.revisar(); J.avisos.sincronizar();
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
