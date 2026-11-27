/* Jarbas · módulo Agenda (compromissos, calendário e lembretes) */
"use strict";
(function (J) {
  const A = (J.agenda = {});
  const COL = "compromissos";
  const el = J.el;

  const ordenar = (l) => l.slice().sort((a, b) => (a.data + (a.diaInteiro ? "00:00" : a.inicio)).localeCompare(b.data + (b.diaInteiro ? "00:00" : b.inicio)));
  A.lista = () => ordenar(J.store.lista(COL));
  A.obter = (id) => J.store.lista(COL).find((c) => c.id === id) || null;

  A.normalizar = function (c) {
    c = Object.assign({ titulo: "", data: "", inicio: "", fim: "", diaInteiro: false, local: "", calendario: "Pessoal", lembrete: null }, c || {});
    c.titulo = String(c.titulo || "").trim().slice(0, 120);
    if (c.titulo) c.titulo = c.titulo[0].toUpperCase() + c.titulo.slice(1);
    c.diaInteiro = !!c.diaInteiro;
    const hh = (h) => { const m = String(h || "").match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
    c.inicio = c.diaInteiro ? "" : hh(c.inicio);
    c.fim = c.diaInteiro ? "" : hh(c.fim);
    if (!c.diaInteiro && c.inicio && (!c.fim || c.fim <= c.inicio)) c.fim = J.addMin(c.inicio, 60);
    c.calendario = /trabalho/i.test(c.calendario) ? "Trabalho" : "Pessoal";
    c.local = String(c.local || "").trim().slice(0, 120);
    c.lembrete = A.normalizarLembrete(c.lembrete);
    return c;
  };
  /* null = não informado · -1 = sem aviso · [minutos antes...] (aceita número, texto ou lista) */
  A.normalizarLembrete = function (l) {
    if (l === null || l === undefined || l === "") return null;
    const arr = (Array.isArray(l) ? l : [l]).map(Number).filter((x) => !isNaN(x));
    if (!arr.length) return null;
    const bons = [...new Set(arr.filter((x) => x >= 0).map((x) => Math.min(43200, Math.round(x * 1000) / 1000)))].sort((a, b) => b - a);
    return bons.length ? bons : -1;
  };
  A.valido = (c) => !!(c && c.titulo && /^\d{4}-\d{2}-\d{2}$/.test(c.data || "") && (c.diaInteiro || /^\d{2}:\d{2}$/.test(c.inicio || "")));

  function campos(c) { return { titulo: c.titulo, data: c.data, inicio: c.inicio, fim: c.fim, diaInteiro: c.diaInteiro, local: c.local, calendario: c.calendario, lembrete: c.lembrete == null ? [60] : c.lembrete }; }
  A.salvar = (c) => { const d = J.store.inserir(COL, campos(A.normalizar(c))); A.mudou(); return d; };
  A.alterar = (id, c) => { const d = J.store.atualizar(COL, id, campos(A.normalizar(c))); limparAviso(id); A.mudou(); return d; };
  A.remover = (id) => { J.store.remover(COL, id); limparAviso(id); A.mudou(); };
  A.mudou = () => { if (A.onMudou) A.onMudou(); };

  A.conflitos = function (c, ignorarId) {
    if (c.diaInteiro) return [];
    const a1 = J.minutos(c.inicio), a2 = J.minutos(c.fim || J.addMin(c.inicio, 60));
    return A.lista().filter((o) => o.id !== ignorarId && o.data === c.data && !o.diaInteiro && a1 < J.minutos(o.fim || J.addMin(o.inicio, 60)) && J.minutos(o.inicio) < a2);
  };

  /* resumo compacto para a IA */
  A.paraIA = function () {
    const hoje = J.agora().data, limite = J.addDias(hoje, 120);
    return A.lista().filter((c) => c.data >= J.addDias(hoje, -7) && c.data <= limite).slice(0, 80)
      .map((c) => ({ id: c.id, titulo: c.titulo, data: c.data, dia: J.DIAS[J.diaSemana(c.data)], inicio: c.inicio, fim: c.fim, diaInteiro: c.diaInteiro, local: c.local, calendario: c.calendario, lembreteMin: c.lembrete }));
  };
  A.resumoTexto = function (de, ate) {
    const l = A.lista().filter((c) => c.data >= de && c.data <= ate);
    if (!l.length) return "";
    return l.map((c) => `${J.rotuloDia(c.data).replace(/^(Hoje|Amanhã) · /, "$1, ")}, ${J.rotuloHora(c)}: ${c.titulo}`).join("\n");
  };

  /* ---------- lembretes (tocam com o app aberto ou assim que ele é aberto) ---------- */
  function avisados() { return J.store.get("agenda.avisados", {}); }
  function limparAviso(id) { const a = avisados(); Object.keys(a).forEach((k) => { if (k.startsWith(id + "|")) delete a[k]; }); J.store.set("agenda.avisados", a); }
  A.verificarLembretes = function (avisar) {
    const agora = Date.now(); const a = avisados(); let mudou = false;
    A.lista().forEach((c) => {
      if (!A.valido(c)) return;
      const inicio = J.instante(c.data, c.diaInteiro ? "08:00" : c.inicio);
      /* só o aviso mais recente que já chegou a hora (evita vários de uma vez) */
      const vencidos = J.listaLembretes(c.lembrete).filter((m) => agora >= inicio - m * 60000);
      if (!vencidos.length) return;
      const m = Math.min(...vencidos);
      const chave = c.id + "|" + c.data + "|" + (c.inicio || "dia") + "|" + m;
      if (a[chave]) return;
      vencidos.forEach((x) => (a[c.id + "|" + c.data + "|" + (c.inicio || "dia") + "|" + x] = agora)); mudou = true;
      if (agora > inicio + 20 * 60000) return; // já passou faz tempo: não incomoda
      if (J.avisos && J.avisos.ativo() && agora > inicio - m * 60000 + 30 * 60000 && m > 0) return; // aviso antigo perdido: não toca atrasado
      const falta = Math.round((inicio - agora) / 60000);
      const faltaS = Math.round((inicio - agora) / 1000);
      let quando;
      if (c.diaInteiro) quando = falta < 720 ? "hoje" : `em ${J.diaFrase(c.data)}`;
      else if (faltaS > 5 && faltaS < 60) quando = `daqui a ${faltaS} segundos`;
      else if (falta <= 0) quando = falta < -1 ? `começou há ${-falta} minutos` : "agora";
      else if (falta < 60) quando = `daqui a ${falta} minuto${falta > 1 ? "s" : ""}`;
      else if (falta < 1440) { const h = Math.floor(falta / 60), m = falta % 60; quando = `daqui a ${h} hora${h > 1 ? "s" : ""}${m >= 5 ? ` e ${m} minutos` : ""}`; }
      else quando = `${J.diaFrase(c.data)}`;
      avisar(c, quando);
    });
    if (mudou) J.store.set("agenda.avisados", a);
  };

  /* ---------- tela da agenda: calendário do mês + dia escolhido ---------- */
  const MESES_T = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  let mesVisto = J.agora().data.slice(0, 7), diaSel = J.agora().data;
  A.irPara = (data) => { diaSel = data; mesVisto = data.slice(0, 7); };
  function mudarMes(n) { const d = J.dObj(mesVisto + "-01"); d.setUTCMonth(d.getUTCMonth() + n); mesVisto = J.dStr(d).slice(0, 7); A.render(); }

  A.render = function () {
    const raiz = J.$("agenda"); if (!raiz) return;
    const hoje = J.agora().data, todos = A.lista();
    const porDia = {}; todos.forEach((c) => (porDia[c.data] = porDia[c.data] || []).push(c));
    const { y, m } = J.dParts(mesVisto + "-01");

    const grade = el("div", { class: "cal-grid", role: "grid" });
    ["D", "S", "T", "Q", "Q", "S", "S"].forEach((l) => grade.append(el("div", { class: "cal-dow", "aria-hidden": "true", text: l })));
    const ini = J.diaSemana(mesVisto + "-01"), fimMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let i = 0; i < ini; i++) grade.append(el("div"));
    for (let d = 1; d <= fimMes; d++) {
      const ds = `${mesVisto}-${String(d).padStart(2, "0")}`, qtd = (porDia[ds] || []).length;
      const cls = ["cal-d", ds === hoje && "hoje", ds === diaSel && "sel", ds < hoje && "passado"].filter(Boolean).join(" ");
      const pontos = el("span", { class: "dots" }); for (let k = 0; k < Math.min(qtd, 3); k++) pontos.append(el("i"));
      grade.append(el("button", { class: cls, type: "button", "aria-label": `${d}${qtd ? `, ${qtd} compromisso${qtd > 1 ? "s" : ""}` : ""}`, onclick: () => { diaSel = ds; A.render(); } }, el("span", { text: d }), pontos));
    }
    const cal = el("div", { class: "cal card" },
      el("div", { class: "cal-top" },
        el("button", { class: "icone", type: "button", "aria-label": "Mês anterior", onclick: () => mudarMes(-1), html: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>' }),
        el("div", { class: "cal-tit", text: `${MESES_T[m - 1]} ${y}` }),
        el("button", { class: "icone", type: "button", "aria-label": "Próximo mês", onclick: () => mudarMes(1), html: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>' }),
        el("button", { class: "chip", type: "button", text: "Hoje", onclick: () => { A.irPara(hoje); A.render(); } })),
      grade);

    const doDia = porDia[diaSel] || [];
    const lista = el("div", { class: "itens" });
    if (!doDia.length) lista.append(el("p", { class: "vazio", text: diaSel < hoje ? "Nada marcado neste dia." : "Dia livre, senhor. Toque em + ou peça na conversa." }));
    doDia.forEach((c) => {
      const hora = c.diaInteiro ? el("div", { class: "hora" }, "Dia", el("small", { text: "inteiro" })) : el("div", { class: "hora" }, J.fmtH(c.inicio), c.fim ? el("small", { text: "até " + J.fmtH(c.fim) }) : null);
      lista.append(el("button", { class: "item card", type: "button", onclick: () => A.abrirForm(c) },
        hora,
        el("div", { class: "item-txt" },
          el("div", { class: "tt" }, c.titulo, el("span", { class: "tag" + (c.calendario === "Trabalho" ? " trab" : ""), text: c.calendario })),
          el("div", { class: "sub", text: [c.local, J.rotuloAvisos(c)].filter(Boolean).join(" · ") }))));
    });

    const proximos = todos.filter((c) => c.data >= hoje).length;
    raiz.replaceChildren(
      cal,
      el("div", { class: "dia-tit" }, el("h2", { text: J.rotuloDiaLongo(diaSel) }), el("button", { class: "mais", type: "button", "aria-label": "Novo compromisso", onclick: () => A.abrirForm({ data: diaSel }), html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' })),
      lista,
      proximos ? el("p", { class: "nota", text: `${proximos} compromisso${proximos > 1 ? "s" : ""} daqui para frente.` }) : null
    );
  };

  /* ---------- formulário (novo / editar) ---------- */
  const LEMBRETES = [[-1, "Sem aviso"], [0, "Na hora"], [5, "5 min antes"], [10, "10 min antes"], [15, "15 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [120, "2 horas antes"], [1440, "1 dia antes"], [2880, "2 dias antes"]];
  A.abrirForm = function (c) {
    c = c || {}; const editando = !!c.id;
    const ag = J.agora();
    const f = el("form", { class: "form", autocomplete: "off" });
    const campo = (rot, inp) => el("label", { class: "campo" }, el("span", { text: rot }), inp);
    const titulo = el("input", { type: "text", value: c.titulo || "", placeholder: "Ex.: Dentista", required: true, maxlength: 120, enterkeyhint: "done" });
    const data = el("input", { type: "date", value: c.data || ag.data, required: true });
    const diaInt = el("input", { type: "checkbox" }); diaInt.checked = !!c.diaInteiro;
    const ini = el("input", { type: "time", value: c.inicio || J.addMin(ag.hora.slice(0, 3) + "00", 60) });
    const fim = el("input", { type: "time", value: c.fim || "" });
    const local = el("input", { type: "text", value: c.local || "", placeholder: "Opcional", maxlength: 120 });
    const cal = el("select", {}, el("option", { value: "Pessoal", text: "Pessoal" }), el("option", { value: "Trabalho", text: "Trabalho" })); cal.value = c.calendario || "Pessoal";
    const lem = el("select", {}); const lista = J.listaLembretes(c.lembrete);
    LEMBRETES.forEach(([v, t]) => lem.append(el("option", { value: v, text: t })));
    let atual = lista.length ? String(lista[0]) : "-1";
    if (lista.length > 1) { lem.append(el("option", { value: "manter", text: J.rotuloLembrete(lista).replace(/^avisos? /, "") })); atual = "manter"; }
    else if (!LEMBRETES.some(([v]) => String(v) === atual)) lem.append(el("option", { value: atual, text: J.rotuloLembrete(Number(atual)).replace(/^aviso /, "") }));
    lem.value = atual;
    const horas = el("div", { class: "duas" }, campo("Início", ini), campo("Fim", fim));
    const sync = () => { horas.hidden = diaInt.checked; }; diaInt.onchange = sync; sync();
    ini.onchange = () => { if (!fim.value || fim.value <= ini.value) fim.value = J.addMin(ini.value, 60); };
    const aviso = el("p", { class: "alerta", hidden: true });
    f.append(campo("O quê", titulo), campo("Dia", data), el("label", { class: "linha-check" }, diaInt, el("span", { text: "Dia inteiro" })), horas, campo("Onde", local), el("div", { class: "duas" }, campo("Agenda", cal), campo("Lembrete", lem)), aviso);
    const botoes = el("div", { class: "botoes" });
    if (editando) botoes.append(el("button", { class: "btn perigo", type: "button", text: "Desmarcar", onclick: (e) => {
      const b = e.currentTarget; if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Toque de novo para desmarcar"; return; }
      A.remover(c.id); J.ui.fecharFolha(); J.ui.toast("Desmarcado, senhor.");
    } }));
    botoes.append(el("button", { class: "btn primario", type: "submit", text: editando ? "Salvar" : "Marcar" }));
    f.append(botoes);
    f.onsubmit = (e) => {
      e.preventDefault();
      const novo = A.normalizar({ titulo: titulo.value, data: data.value, diaInteiro: diaInt.checked, inicio: ini.value, fim: fim.value, local: local.value, calendario: cal.value, lembrete: lem.value === "manter" ? lista : Number(lem.value) });
      if (!A.valido(novo)) { aviso.hidden = false; aviso.textContent = "Preencha o que é, o dia e o horário."; return; }
      const cf = A.conflitos(novo, c.id);
      if (cf.length && f.dataset.conf !== "1") { f.dataset.conf = "1"; aviso.hidden = false; aviso.textContent = `Nesse horário já há: ${cf.map((o) => o.titulo).join(", ")}. Toque de novo para salvar assim mesmo.`; return; }
      if (editando) A.alterar(c.id, novo); else A.salvar(novo);
      A.irPara(novo.data); J.ui.fecharFolha(); J.ui.toast(editando ? "Alterado, senhor." : "Anotado, senhor.");
    };
    J.ui.abrirFolha(editando ? "Compromisso" : "Novo compromisso", f);
  };
})(window.J);
