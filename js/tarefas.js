/* Jarbas · módulo Tarefas e Listas
   Tarefas = o que o senhor tem que fazer. Ficam em listas por assunto ("Geral", "Mercado Livre",
   "Compras do mercado"...). Uma lista pode ter dia, hora e aviso, repetir toda semana/mês
   e ser de compras (itens com quantidade, riscar ao comprar). */
"use strict";
(function (J) {
  const T = (J.tarefas = {});
  const COL = "tarefas", COL_L = "listas";
  const el = J.el;
  const semAcento = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  T.semAcento = semAcento;

  /* ================= listas ================= */
  T.GERAL = { id: "", nome: "Geral", tipo: "tarefas" };
  T.listas = () => J.store.lista(COL_L).slice().sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")));
  T.lista_ = (id) => (!id ? T.GERAL : J.store.lista(COL_L).find((l) => l.id === id) || null);
  const ehCompras = (nome) => /compra|mercado\b|supermercado|feira|a[cç]ougue|padaria|farm[aá]cia|atacad/.test(semAcento(nome)) && !/mercado ?livre/.test(semAcento(nome));
  T.normalizarLista = function (l) {
    l = Object.assign({ nome: "", tipo: "", data: "", hora: "", lembrete: null, repetir: "" }, l || {});
    l.nome = String(l.nome || "").trim().replace(/^lista (de |do |da )?/i, (m) => (l.nome.length > m.length + 2 ? "" : m)).slice(0, 60);
    if (l.nome) l.nome = l.nome[0].toUpperCase() + l.nome.slice(1);
    l.tipo = l.tipo === "compras" || l.tipo === "tarefas" ? l.tipo : ehCompras(l.nome) ? "compras" : "tarefas";
    l.data = /^\d{4}-\d{2}-\d{2}$/.test(l.data || "") ? l.data : "";
    const m = String(l.hora || "").match(/^(\d{1,2}):(\d{2})/); l.hora = l.data && m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
    l.lembrete = l.data ? J.agenda.normalizarLembrete(l.lembrete) : null;
    l.repetir = l.repetir === "semanal" || l.repetir === "mensal" ? l.repetir : "";
    if (l.repetir && !l.data) l.data = J.agora().data;
    return l;
  };
  function camposLista(l) { return { nome: l.nome, tipo: l.tipo, data: l.data, hora: l.hora, lembrete: l.lembrete, repetir: l.repetir }; }
  /* acha a lista pelo nome (sem acento, aceita parte do nome); cria se pedir */
  T.acharLista = function (nome) {
    const n = semAcento(nome).replace(/^lista (de |do |da )?/, "");
    if (!n || /^(geral|tarefas?|minhas tarefas|padrao)$/.test(n)) return T.GERAL;
    const ls = T.listas();
    return ls.find((l) => semAcento(l.nome) === n) || ls.find((l) => semAcento(l.nome).includes(n) || n.includes(semAcento(l.nome))) || null;
  };
  T.criarLista = (l) => { const d = J.store.inserir(COL_L, camposLista(T.normalizarLista(l))); T.mudou(); return d; };
  T.alterarLista = (id, l) => { const base = T.lista_(id); if (!base || !id) return null; const d = J.store.atualizar(COL_L, id, camposLista(T.normalizarLista(Object.assign({}, base, l)))); T.mudou(); return d; };
  T.removerLista = (id) => { if (!id) return; T.itensDa(id).forEach((t) => J.store.remover(COL, t.id)); J.store.remover(COL_L, id); if (listaSel === id) selecionar("todas"); T.mudou(); };
  T.itensDa = (id) => T.lista().filter((t) => (t.lista || "") === (id || ""));
  T.listaOuCria = function (nome, extra) {
    let l = T.acharLista(nome); let criada = false;
    if (!l) { l = T.criarLista(Object.assign({ nome }, extra || {})); criada = true; }
    else if (extra && l.id && Object.keys(extra).some((k) => extra[k] != null && extra[k] !== "")) l = T.alterarLista(l.id, extra);
    return { l, criada };
  };
  /* recorrentes: passou o dia, a lista volta para a próxima data com tudo desmarcado */
  T.renovar = function () {
    const hoje = J.agora().data; let mudou = false;
    J.store.lista(COL_L).forEach((l) => {
      if (!l.repetir || !l.data || l.data >= hoje) return;
      let d = l.data;
      while (d < hoje) { if (l.repetir === "semanal") d = J.addDias(d, 7); else { const o = J.dObj(d); o.setUTCMonth(o.getUTCMonth() + 1); d = J.dStr(o); } }
      J.store.atualizar(COL_L, l.id, { data: d });
      T.itensDa(l.id).forEach((t) => { if (t.feita) J.store.atualizar(COL, t.id, { feita: false, feitaEm: null }); });
      mudou = true;
    });
    if (mudou) T.mudou();
  };
  T.rotuloLista = function (l) {
    const p = [];
    if (l.data) p.push(rotuloDia(l.data) + (l.hora ? " às " + J.fmtH(l.hora) : ""));
    if (l.repetir) p.push(l.repetir === "semanal" ? "toda semana" : "todo mês");
    if (l.data && l.lembrete !== -1) p.push("🔔");
    return p.join(" · ");
  };
  function rotuloDia(d) { const hoje = J.agora().data; return d === hoje ? "hoje" : d === J.addDias(hoje, 1) ? "amanhã" : d === J.addDias(hoje, -1) ? "ontem" : J.rotuloDia(d).replace(/^.* · /, ""); }

  /* ================= itens (tarefas) ================= */
  const chave = (t) => (t.prazo || "9999-99-99") + (t.hora || "99:99") + (t.importante ? "0" : "1") + (t.criadoEm || "");
  const ordenar = (l) => l.slice().sort((a, b) => (a.feita - b.feita) || (a.feita ? String(b.feitaEm || "").localeCompare(String(a.feitaEm || "")) : chave(a).localeCompare(chave(b))));
  T.lista = () => ordenar(J.store.lista(COL));
  T.pendentes = () => T.lista().filter((t) => !t.feita);
  T.obter = (id) => J.store.lista(COL).find((t) => t.id === id) || null;

  /* "2 kg de arroz" -> {qtd: "2 kg", titulo: "arroz"} */
  T.separarQtd = function (txt) {
    const m = String(txt || "").trim().match(/^(\d+(?:[.,]\d+)?|uma?|duas?|tr[eê]s|meia)\s*(kg|quilos?|g|gramas?|l|litros?|ml|un(?:id(?:ades?)?)?|p(?:a)?c(?:o)?t(?:e)?s?|pacotes?|cx|caixas?|d[uú]zias?|dz|latas?|garrafas?|fardos?|sacos?|bandejas?|potes?|vidros?|rolos?|maços?)?\.?\s+(?:de\s+)?(.{2,})$/i);
    if (!m) return { qtd: "", titulo: txt };
    const nums = { um: "1", uma: "1", dois: "2", duas: "2", tres: "3", "três": "3", meia: "½" };
    return { qtd: ((nums[m[1].toLowerCase()] || m[1]) + (m[2] ? " " + m[2] : "")).trim(), titulo: m[3] };
  };
  T.normalizar = function (t) {
    t = Object.assign({ titulo: "", prazo: "", hora: "", lembrete: null, importante: false, notas: "", feita: false, lista: "", qtd: "" }, t || {});
    t.titulo = String(t.titulo || "").trim().replace(/[.!]+$/, "").slice(0, 160);
    if (t.titulo) t.titulo = t.titulo[0].toUpperCase() + t.titulo.slice(1);
    t.prazo = /^\d{4}-\d{2}-\d{2}$/.test(t.prazo || "") ? t.prazo : "";
    const m = String(t.hora || "").match(/^(\d{1,2}):(\d{2})/); t.hora = t.prazo && m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
    t.lembrete = t.prazo ? J.agenda.normalizarLembrete(t.lembrete) : null;
    t.importante = !!t.importante; t.feita = !!t.feita;
    t.notas = String(t.notas || "").trim().slice(0, 500);
    t.lista = t.lista && T.lista_(t.lista) ? t.lista : "";
    t.qtd = String(t.qtd || "").trim().slice(0, 20);
    return t;
  };
  T.valida = (t) => !!(t && t.titulo);
  function campos(t) { return { titulo: t.titulo, prazo: t.prazo, hora: t.hora, lembrete: t.lembrete, importante: t.importante, notas: t.notas, feita: t.feita, feitaEm: t.feita ? t.feitaEm || new Date().toISOString() : null, lista: t.lista, qtd: t.qtd }; }
  T.salvar = (t) => { const d = J.store.inserir(COL, campos(T.normalizar(t))); T.mudou(); return d; };
  T.alterar = (id, t) => { const base = T.obter(id); if (!base) return null; const d = J.store.atualizar(COL, id, campos(T.normalizar(Object.assign({}, base, t)))); T.mudou(); return d; };
  T.concluir = (id, feita = true) => { const d = J.store.atualizar(COL, id, { feita: !!feita, feitaEm: feita ? new Date().toISOString() : null }); T.mudou(); return d; };
  T.remover = (id) => { J.store.remover(COL, id); T.mudou(); };
  T.mudou = () => { if (T.onMudou) T.onMudou(); };

  /* filtro do cérebro: {status, de, ate, termo, atrasadas, semPrazo, lista} — o app conta, não a IA */
  const GENERICOS = /^(tarefas?|tudo|todos?|todas?|coisas?|pendencias?|afazeres|itens?)$/;
  T.filtrar = function (f) {
    f = f || {};
    const st = f.status || "pendentes";
    let termo = semAcento(f.termo); if (GENERICOS.test(termo)) termo = "";
    const hoje = J.agora().data;
    let listaId = null;
    if (f.lista != null && f.lista !== "") { const l = T.lista_(f.lista) || T.acharLista(f.lista); if (!l) return []; listaId = l.id; }
    return T.lista().filter((t) => {
      if (listaId !== null && (t.lista || "") !== listaId) return false;
      if (st === "pendentes" && t.feita) return false;
      if (st === "feitas" && !t.feita) return false;
      if (f.atrasadas && !(t.prazo && t.prazo < hoje)) return false;
      if (f.semPrazo && t.prazo) return false;
      if (f.de) {
        const ate = f.ate && f.ate >= f.de ? f.ate : f.de;
        const l = T.lista_(t.lista || "");
        const dia = t.prazo || (l && l.data) || "";
        if (!dia) return false;
        const atrasadaConta = !t.feita && f.de <= hoje && dia < hoje;
        if (!atrasadaConta && (dia < f.de || dia > ate)) return false;
      }
      if (termo && !semAcento(t.titulo + " " + t.notas).includes(termo.replace(/s$/, ""))) return false;
      return true;
    });
  };
  T.paraIA = function () {
    const sete = new Date(Date.now() - 7 * 86400000).toISOString();
    return T.lista().filter((t) => !t.feita || String(t.feitaEm || "") > sete).slice(0, 150)
      .map((t) => ({ id: t.id, titulo: t.titulo, lista: t.lista ? (T.lista_(t.lista) || {}).nome : undefined, qtd: t.qtd || undefined, prazo: t.prazo || undefined, hora: t.hora || undefined, feita: t.feita || undefined, importante: t.importante || undefined }));
  };
  T.listasParaIA = () => T.listas().map((l) => ({ id: l.id, nome: l.nome, tipo: l.tipo, data: l.data || undefined, hora: l.hora || undefined, repetir: l.repetir || undefined, pendentes: T.itensDa(l.id).filter((t) => !t.feita).length }));
  T.rotuloPrazo = function (t, curto) {
    if (!t.prazo) return "";
    let d = rotuloDia(t.prazo);
    if (!curto && t.prazo < J.agora().data && !t.feita) d = "atrasada, era " + d;
    return d + (t.hora ? " às " + J.fmtH(t.hora) : "");
  };
  T.textoItem = function (t) {
    if (!t.qtd) return t.titulo;
    if (/^[\d.,½]+$/.test(t.qtd)) return `${t.titulo} (${t.qtd})`;
    return `${t.qtd} de ${t.titulo.charAt(0).toLowerCase() + t.titulo.slice(1)}`;
  };

  /* texto da lista para mandar no WhatsApp */
  T.textoParaEnviar = function (id) {
    const l = T.lista_(id) || T.GERAL;
    const itens = T.itensDa(l.id);
    const pend = itens.filter((t) => !t.feita);
    const usar = pend.length ? pend : itens;
    const cab = `*${l.nome}*${l.data ? " (" + rotuloDia(l.data) + (l.hora ? " às " + J.fmtH(l.hora) : "") + ")" : ""}`;
    return cab + "\n\n" + usar.map((t) => `${t.feita ? "✅" : "▫️"} ${T.textoItem(t)}${t.prazo && l.tipo !== "compras" ? " (" + T.rotuloPrazo(t, true) + ")" : ""}`).join("\n");
  };
  T.enviarWhatsApp = function (id) {
    const url = "https://wa.me/?text=" + encodeURIComponent(T.textoParaEnviar(id));
    const w = window.open(url, "_blank"); if (!w) location.href = url;
  };
  T.compartilhar = async function (id) {
    const texto = T.textoParaEnviar(id);
    try { if (navigator.share) { await navigator.share({ text: texto }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    T.enviarWhatsApp(id);
  };

  /* lembretes: tarefas com prazo e listas com dia viram "compromissos" de aviso (com hora, ou às 9h) */
  T.comoCompromissos = function () {
    const tarefas = T.pendentes().filter((t) => t.prazo && t.lembrete !== -1).map((t) => ({
      id: "t-" + t.id, titulo: t.titulo, data: t.prazo, inicio: t.hora || "09:00", fim: "", diaInteiro: false, local: "", tarefa: true, semHora: !t.hora,
      lembrete: t.lembrete == null ? [0] : t.lembrete,
    }));
    const listas = T.listas().filter((l) => l.data && l.lembrete !== -1).map((l) => {
      const n = T.itensDa(l.id).filter((t) => !t.feita).length;
      return { id: "l-" + l.id + "-" + l.data, titulo: l.nome, data: l.data, inicio: l.hora || "09:00", fim: "", diaInteiro: false, local: n ? `${n} ${l.tipo === "compras" ? "ite" + (n > 1 ? "ns" : "m") : "tarefa" + (n > 1 ? "s" : "")}` : "", tarefa: true, ehLista: true, listaId: l.id, semHora: !l.hora, lembrete: l.lembrete == null ? [0] : l.lembrete };
    });
    return tarefas.concat(listas);
  };

  /* ================= tela ================= */
  const ICO_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICO_MAIS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  const ICO_ZAP = '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 2 2.4 4.3 4.6 4.8l1.2-1.2 1.7.8-.4 1.6c-3.3.4-7.2-3.4-6.9-6.8l1.6-.4.8 1.7z"/></svg>';
  let listaSel = J.store.get("tarefas.listaSel", "todas"), verFeitas = false;
  function selecionar(id) { listaSel = id; J.store.set("tarefas.listaSel", id); verFeitas = false; }
  T.mostrarLista = (id) => { selecionar(id); T.render(); };

  T.render = function () {
    const raiz = J.$("tarefas"); if (!raiz) return;
    if (listaSel !== "todas" && !T.lista_(listaSel)) selecionar("todas");
    const todas = T.lista();
    const pendDe = (id) => todas.filter((t) => !t.feita && (t.lista || "") === id).length;
    /* barra de listas */
    const barra = el("div", { class: "tf-listas", role: "tablist" });
    const chip = (id, nome, n) => el("button", { class: "chip" + (listaSel === id ? " ativo" : ""), type: "button", role: "tab", "aria-selected": String(listaSel === id), onclick: () => { selecionar(id); T.render(); } }, nome, n ? el("b", { text: n }) : null);
    barra.append(chip("todas", "Todas", todas.filter((t) => !t.feita).length), chip("", "Geral", pendDe("")));
    T.listas().forEach((l) => barra.append(chip(l.id, (l.tipo === "compras" ? "🛒 " : "") + l.nome, pendDe(l.id))));
    barra.append(el("button", { class: "chip nova", type: "button", text: "+ Lista", onclick: () => abrirFormLista({}) }));

    const lst = listaSel === "todas" ? null : T.lista_(listaSel);
    const compras = lst && lst.tipo === "compras";
    const nova = el("input", { type: "text", placeholder: compras ? "Adicionar item (ex.: 2 kg de arroz)…" : lst && lst.id ? `Nova tarefa em ${lst.nome}…` : "Nova tarefa…", "aria-label": "Nova tarefa", maxlength: 160, enterkeyhint: "done" });
    const rapida = el("form", { class: "tf-nova card", autocomplete: "off", onsubmit: (e) => {
      e.preventDefault(); const v = nova.value.trim(); if (!v) return;
      const dados = compras ? T.separarQtd(v) : { titulo: v };
      T.salvar(Object.assign(dados, { lista: lst ? lst.id : "" })); J.vibrar(10);
      setTimeout(() => { const n = J.$("tarefas").querySelector(".tf-nova input"); if (n) n.focus(); }, 30);
    } }, nova, el("button", { class: "mais", type: "button", "aria-label": "Adicionar com detalhes", onclick: () => T.abrirForm(Object.assign(compras ? T.separarQtd(nova.value.trim()) : { titulo: nova.value.trim() }, { lista: lst ? lst.id : "" })), html: ICO_MAIS }));

    const filhos = [barra];
    if (lst && lst.id) {
      const info = T.rotuloLista(lst);
      filhos.push(el("div", { class: "tf-cab card" },
        el("div", { class: "tf-cab-txt" }, el("div", { class: "tt", text: lst.nome }), el("div", { class: "sub", text: [lst.tipo === "compras" ? "Lista de compras" : "Lista de tarefas", info].filter(Boolean).join(" · ") })),
        el("button", { class: "icone zap", type: "button", "aria-label": "Enviar pelo WhatsApp", html: ICO_ZAP, onclick: () => T.enviarWhatsApp(lst.id) }),
        el("button", { class: "btn", type: "button", text: "Editar", onclick: () => abrirFormLista(lst) })));
    }
    filhos.push(rapida);

    if (!lst) {
      /* visão "Todas": por prazo */
      const hoje = J.agora().data, pend = todas.filter((t) => !t.feita);
      const doDia = (t) => t.prazo || "";
      [["Atrasadas", pend.filter((t) => doDia(t) && doDia(t) < hoje), "atras"], ["Hoje", pend.filter((t) => doDia(t) === hoje), ""], ["Próximas", pend.filter((t) => doDia(t) > hoje), ""], ["Sem prazo", pend.filter((t) => !doDia(t)), ""]]
        .forEach(([tit, l, cls]) => { if (l.length) filhos.push(grupo(`${tit} · ${l.length}`, l, cls, true)); });
      if (!pend.length) filhos.push(el("p", { class: "vazio", text: "Nenhuma tarefa pendente, senhor. Escreva acima ou peça na conversa: \"anota a tarefa de pagar o boleto amanhã\" ou \"cria a lista Mercado Livre\"." }));
      feitasAbaixo(filhos, todas.filter((t) => t.feita), "Ver concluídas");
    } else {
      const itens = T.itensDa(lst.id), pend = itens.filter((t) => !t.feita), feitas = itens.filter((t) => t.feita);
      if (compras) {
        const ordemCompra = pend.slice().sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")));
        if (ordemCompra.length) filhos.push(grupo(`Para comprar · ${ordemCompra.length}`, ordemCompra, "", false));
        if (!itens.length) filhos.push(el("p", { class: "vazio", text: "Lista vazia. Escreva os itens acima ou diga: \"adiciona arroz, feijão e 2 litros de leite na lista " + lst.nome + "\"." }));
        else if (!pend.length) filhos.push(el("p", { class: "vazio", text: "Tudo comprado, senhor ✓" }));
        if (feitas.length) {
          filhos.push(grupo(`No carrinho · ${feitas.length}`, feitas, "feitas", false));
          filhos.push(el("button", { class: "ligacao tf-ver", type: "button", text: "Desmarcar tudo (nova compra)", onclick: () => { feitas.forEach((t) => J.store.atualizar(COL, t.id, { feita: false, feitaEm: null })); T.mudou(); } }));
        }
      } else {
        if (pend.length) filhos.push(grupo(`Pendentes · ${pend.length}`, pend, "", false));
        else filhos.push(el("p", { class: "vazio", text: itens.length ? "Tudo feito nesta lista, senhor ✓" : `Nenhuma tarefa em ${lst.nome} ainda. Escreva acima ou diga: "coloca responder as perguntas na lista ${lst.nome}".` }));
        feitasAbaixo(filhos, feitas, "Ver concluídas");
      }
    }
    raiz.replaceChildren(...filhos);
  };
  function grupo(titulo, l, cls, mostrarLista) { return el("div", { class: "tf-grupo " + cls }, el("h3", { text: titulo }), el("div", { class: "itens" }, ...l.map((t) => item(t, mostrarLista)))); }
  function feitasAbaixo(filhos, feitas, rot) {
    if (!feitas.length) return;
    filhos.push(el("button", { class: "ligacao tf-ver", type: "button", text: verFeitas ? "Esconder concluídas" : `${rot} (${feitas.length})`, onclick: () => { verFeitas = !verFeitas; T.render(); } }));
    if (verFeitas) filhos.push(el("div", { class: "tf-grupo feitas" }, el("div", { class: "itens" }, ...feitas.slice(0, 60).map((t) => item(t, listaSel === "todas"))),
      el("button", { class: "btn perigo tf-limpar", type: "button", text: "Apagar as concluídas", onclick: (e) => {
        const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = `Toque de novo para apagar ${feitas.length}`; return; }
        feitas.forEach((t) => J.store.remover(COL, t.id)); T.mudou(); J.ui.toast("Concluídas apagadas");
      } })));
  }
  function item(t, mostrarLista) {
    const l = t.lista ? T.lista_(t.lista) : null;
    const sub = [mostrarLista && l ? l.nome : "", T.rotuloPrazo(t, true), t.prazo && t.prazo >= J.agora().data && t.lembrete !== -1 && !t.feita ? "🔔" : "", t.notas].filter(Boolean).join(" · ");
    return el("div", { class: "tf-item card" + (t.feita ? " feita" : "") + (t.importante ? " imp" : "") },
      el("button", { class: "tf-check", type: "button", "aria-label": t.feita ? "Desmarcar" : "Concluir", html: ICO_OK, onclick: () => { T.concluir(t.id, !t.feita); J.vibrar(12); } }),
      el("button", { class: "tf-txt", type: "button", onclick: () => T.abrirForm(t) },
        el("div", { class: "tt" }, t.qtd ? el("span", { class: "qtd", text: t.qtd }) : null, (t.importante ? "★ " : "") + t.titulo), sub ? el("div", { class: "sub", text: sub }) : null));
  }

  /* ================= formulários ================= */
  const LEMBRETES = [[-1, "Sem aviso"], [0, "Na hora (ou às 9h)"], [15, "15 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [120, "2 horas antes"], [1440, "1 dia antes"]];
  const campo = (rot, inp) => el("label", { class: "campo" }, el("span", { text: rot }), inp);
  function seletorLembrete(valor) {
    const lem = el("select", {}); LEMBRETES.forEach(([v, x]) => lem.append(el("option", { value: v, text: x })));
    const l0 = valor == null ? [0] : J.listaLembretes(valor); let atual = l0.length ? String(l0[0]) : "-1";
    if (l0.length > 1) { lem.append(el("option", { value: "manter", text: J.rotuloLembrete(l0).replace(/^avisos? /, "") })); atual = "manter"; }
    else if (!LEMBRETES.some(([v]) => String(v) === atual)) lem.append(el("option", { value: atual, text: J.rotuloLembrete(Number(atual)).replace(/^aviso /, "") }));
    lem.value = atual; lem.ler = () => (lem.value === "manter" ? l0 : Number(lem.value)); return lem;
  }
  T.abrirForm = function (t) {
    t = t || {}; const editando = !!t.id;
    const f = el("form", { class: "form", autocomplete: "off" });
    const titulo = el("input", { type: "text", value: t.titulo || "", placeholder: "Ex.: Pagar o boleto da luz", required: true, maxlength: 160, enterkeyhint: "done" });
    const lista = el("select", {}); [T.GERAL].concat(T.listas()).forEach((l) => lista.append(el("option", { value: l.id, text: l.nome }))); lista.value = t.lista || "";
    const qtd = el("input", { type: "text", value: t.qtd || "", placeholder: "Ex.: 2 kg", maxlength: 20 });
    const blocoQtd = campo("Quantidade", qtd);
    const temPrazo = el("input", { type: "checkbox" }); temPrazo.checked = !!t.prazo;
    const prazo = el("input", { type: "date", value: t.prazo || J.agora().data });
    const hora = el("input", { type: "time", value: t.hora || "" });
    const lem = seletorLembrete(t.lembrete);
    const imp = el("input", { type: "checkbox" }); imp.checked = !!t.importante;
    const notas = el("textarea", { rows: 2, placeholder: "Opcional", maxlength: 500 }); notas.value = t.notas || "";
    const blocoPrazo = el("div", {}, el("div", { class: "duas" }, campo("Dia", prazo), campo("Hora (opcional)", hora)), campo("Lembrete", lem));
    const linhaPrazo = el("label", { class: "linha-check" }, temPrazo, el("span", { text: "Tem prazo" }));
    const sync = () => { const c = (T.lista_(lista.value) || {}).tipo === "compras"; blocoQtd.hidden = !c; linhaPrazo.hidden = c; blocoPrazo.hidden = c || !temPrazo.checked; };
    temPrazo.onchange = sync; lista.onchange = sync; sync();
    const aviso = el("p", { class: "alerta", hidden: true });
    f.append(campo("O que fazer", titulo), el("div", { class: "duas" }, campo("Lista", lista), blocoQtd), linhaPrazo, blocoPrazo,
      el("label", { class: "linha-check" }, imp, el("span", { text: "Importante ★" })), campo("Observações", notas), aviso);
    const botoes = el("div", { class: "botoes" });
    if (editando) botoes.append(el("button", { class: "btn perigo", type: "button", text: "Apagar", onclick: (e) => {
      const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Toque de novo para apagar"; return; }
      T.remover(t.id); J.ui.fecharFolha(); J.ui.toast("Apagada");
    } }));
    botoes.append(el("button", { class: "btn primario", type: "submit", text: editando ? "Salvar" : "Anotar" }));
    f.append(botoes);
    f.onsubmit = (e) => {
      e.preventDefault();
      const c = (T.lista_(lista.value) || {}).tipo === "compras";
      const novo = { titulo: titulo.value, lista: lista.value, qtd: c ? qtd.value : "", prazo: !c && temPrazo.checked ? prazo.value : "", hora: !c && temPrazo.checked ? hora.value : "", lembrete: lem.ler(), importante: imp.checked, notas: notas.value };
      if (!T.valida(T.normalizar(Object.assign({}, novo)))) { aviso.hidden = false; aviso.textContent = "Escreva o que é."; return; }
      if (editando) T.alterar(t.id, novo); else T.salvar(novo);
      J.ui.fecharFolha(); J.ui.toast(editando ? "Alterado" : "Anotado");
    };
    J.ui.abrirFolha(editando ? (c0(t) ? "Item" : "Tarefa") : "Nova tarefa", f);
  };
  const c0 = (t) => (T.lista_(t.lista || "") || {}).tipo === "compras";
  function abrirFormLista(l) {
    l = l || {}; const editando = !!l.id;
    const f = el("form", { class: "form", autocomplete: "off" });
    const nome = el("input", { type: "text", value: l.nome || "", placeholder: "Ex.: Mercado Livre, Compras do mercado", required: true, maxlength: 60, enterkeyhint: "done" });
    const tipo = el("select", {}, el("option", { value: "tarefas", text: "Tarefas" }), el("option", { value: "compras", text: "Compras (com quantidade)" })); tipo.value = l.tipo || "tarefas";
    nome.oninput = () => { if (!editando) tipo.value = ehCompras(nome.value) ? "compras" : "tarefas"; };
    const temData = el("input", { type: "checkbox" }); temData.checked = !!l.data;
    const data = el("input", { type: "date", value: l.data || J.agora().data });
    const hora = el("input", { type: "time", value: l.hora || "" });
    const lem = seletorLembrete(l.lembrete);
    const rep = el("select", {}, el("option", { value: "", text: "Não repete" }), el("option", { value: "semanal", text: "Toda semana" }), el("option", { value: "mensal", text: "Todo mês" })); rep.value = l.repetir || "";
    const bloco = el("div", {}, el("div", { class: "duas" }, campo("Dia", data), campo("Hora (opcional)", hora)), el("div", { class: "duas" }, campo("Lembrete", lem), campo("Repetir", rep)),
      el("p", { class: "fraco", text: "Quando repete, depois do dia a lista volta sozinha para a próxima semana (ou mês) com os itens desmarcados." }));
    const sync = () => { bloco.hidden = !temData.checked; }; temData.onchange = sync; sync();
    const aviso = el("p", { class: "alerta", hidden: true });
    f.append(campo("Nome da lista", nome), campo("Tipo", tipo), el("label", { class: "linha-check" }, temData, el("span", { text: "Tem dia (ex.: compras amanhã às 10h)" })), bloco, aviso);
    const botoes = el("div", { class: "botoes" });
    if (editando) botoes.append(el("button", { class: "btn perigo", type: "button", text: "Apagar lista", onclick: (e) => {
      const b = e.currentTarget, n = T.itensDa(l.id).length;
      if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = n ? `Apagar a lista e ${n} ite${n > 1 ? "ns" : "m"}?` : "Toque de novo para apagar"; return; }
      T.removerLista(l.id); J.ui.fecharFolha(); J.ui.toast("Lista apagada");
    } }));
    botoes.append(el("button", { class: "btn primario", type: "submit", text: editando ? "Salvar" : "Criar lista" }));
    f.append(botoes);
    f.onsubmit = (e) => {
      e.preventDefault();
      const nv = { nome: nome.value, tipo: tipo.value, data: temData.checked ? data.value : "", hora: temData.checked ? hora.value : "", lembrete: temData.checked ? lem.ler() : null, repetir: temData.checked ? rep.value : "" };
      if (!T.normalizarLista(Object.assign({}, nv)).nome) { aviso.hidden = false; aviso.textContent = "Dê um nome para a lista."; return; }
      const outra = T.acharLista(nv.nome);
      if (!editando && outra && outra.id && T.semAcento(outra.nome) === T.semAcento(nv.nome)) { aviso.hidden = false; aviso.textContent = "Já existe uma lista com esse nome."; return; }
      const salva = editando ? T.alterarLista(l.id, nv) : T.criarLista(nv);
      selecionar(salva.id); J.ui.fecharFolha(); T.render(); J.ui.toast(editando ? "Lista salva" : "Lista criada");
    };
    J.ui.abrirFolha(editando ? "Lista" : "Nova lista", f);
  }
  T.abrirFormLista = abrirFormLista;
})(window.J);
