/* Jarbas · avisos com o app fechado (pelo app grátis "ntfy")
   O Jarbas agenda cada lembrete no servidor do ntfy, que entrega a notificação
   no iPhone na hora certa, mesmo com o Jarbas fechado e a tela bloqueada.
   Limite do ntfy.sh: até 3 dias à frente; os mais distantes são agendados quando o app é aberto. */
"use strict";
(function (J) {
  const S = (J.avisos = {});
  const SERVIDOR = "https://ntfy.sh";
  const JANELA = 3 * 86400000 - 10 * 60000; // até ~3 dias
  const MIN_ANTEC = 12000;                   // o ntfy exige pelo menos ~10 s

  S.ativo = () => !!J.store.get("ntfy.ativo", false);
  S.repeticoes = () => Number(J.store.get("ntfy.repetir", 2)) || 0;
  S.topico = function () {
    let t = J.store.get("ntfy.topico", "");
    if (!t) {
      const a = new Uint8Array(12); crypto.getRandomValues(a);
      t = "jarbas-" + Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
      J.store.set("ntfy.topico", t);
    }
    return t;
  };
  S.linkApp = () => `ntfy://ntfy.sh/${S.topico()}`;
  S.linkWeb = () => `${SERVIDOR}/${S.topico()}`;
  const agendados = () => J.store.get("ntfy.agendados", {});   // seq -> {quando, id}
  const salvarAgendados = (x) => J.store.set("ntfy.agendados", x);

  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  /* envia uma notificação (agora ou agendada). Usa JSON na raiz do servidor (sem cabeçalhos especiais). */
  S.publicar = async function ({ titulo, texto, quando, seq, prioridade = 5 }) {
    const corpo = { topic: S.topico(), title: titulo, message: texto, priority: prioridade, tags: ["bell"], click: location.href.split("#")[0].split("?")[0] };
    if (quando && quando - Date.now() > MIN_ANTEC) corpo.delay = String(Math.floor(quando / 1000));
    if (seq) corpo.sequence_id = seq;
    const r = await fetch(SERVIDOR + "/", { method: "POST", body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error("ntfy " + r.status);
    return r.json().catch(() => ({}));
  };
  /* cancela um aviso agendado (antes de ser entregue) */
  S.cancelar = async function (seq) {
    const url = `${SERVIDOR}/${S.topico()}/${encodeURIComponent(seq)}`;
    try { const r = await fetch(url, { method: "DELETE" }); if (r.ok) return true; } catch (e) {}
    try { await fetch(url + "/delete", { mode: "no-cors" }); return true; } catch (e) { return false; }
  };

  function textoAviso(c, m) {
    if (c.ehLista) return { titulo: "Lista: " + c.titulo, texto: [m > 0 ? J.rotuloDia(c.data).replace(" · ", ", ") + (c.semHora ? "" : ", às " + J.fmtH(c.inicio)) : c.semHora ? "Hoje" : "Agora (" + J.fmtH(c.inicio) + ")", c.local].filter(Boolean).join(" · ") };
    if (c.tarefa) {
      const dia = J.rotuloDia(c.data).replace(" · ", ", ");
      return { titulo: "Tarefa: " + c.titulo, texto: m > 0 ? `Prazo: ${dia}${c.semHora ? "" : ", às " + J.fmtH(c.inicio)}` : c.semHora ? "Para fazer hoje" : `Para fazer agora (${J.fmtH(c.inicio)})` };
    }
    const hora = c.diaInteiro ? "dia inteiro" : "às " + J.fmtH(c.inicio);
    let quando;
    if (m <= 0) quando = c.diaInteiro ? "Hoje" : "Começa agora";
    else if (m < 1) quando = `Começa em ${Math.round(m * 60)} segundos`;
    else if (m < 60) quando = `Começa em ${Math.round(m)} minuto${Math.round(m) > 1 ? "s" : ""}`;
    else if (m < 720) { const h = Math.floor(m / 60), r = Math.round(m % 60); quando = `Começa em ${h} hora${h > 1 ? "s" : ""}${r ? ` e ${r} min` : ""}`; }
    else quando = "Lembrete";
    return { titulo: `${c.titulo}`, texto: `${quando} · ${J.rotuloDia(c.data).replace(" · ", ", ")}, ${hora}${c.local ? " · " + c.local : ""}` };
  }

  /* deixa o ntfy igual à agenda: agenda o que falta, cancela o que mudou ou saiu */
  let rodando = false, deNovo = false;
  S.sincronizar = async function () {
    if (!S.ativo()) return;
    if (rodando) { deNovo = true; return; }
    rodando = true;
    try {
      const agora = Date.now();
      const desejados = {};
      J.agenda.lista().concat(J.tarefas ? J.tarefas.comoCompromissos() : []).forEach((c) => {
        if (!J.agenda.valido(c)) return;
        const inicio = J.instante(c.data, c.diaInteiro ? "08:00" : c.inicio);
        J.listaLembretes(c.lembrete).forEach((m) => {
          const quando = inicio - m * 60000;
          if (quando < agora + MIN_ANTEC || quando > agora + JANELA) return;
          const seq = "j" + hash([c.id, c.titulo, c.data, c.inicio, c.local, m].join("|")) + Math.round(m * 60);
          desejados[seq] = { quando, c, m };
          /* repetições: o aviso volta a tocar a cada minuto, para não passar despercebido */
          for (let k = 1; k <= S.repeticoes(); k++) desejados[seq + "r" + k] = { quando: quando + k * 60000, c, m, repeticao: k };
        });
      });
      const feitos = agendados();
      // cancela os que não valem mais (compromisso apagado ou alterado)
      for (const seq of Object.keys(feitos)) {
        if (feitos[seq].quando < agora) { delete feitos[seq]; continue; }
        if (!desejados[seq]) { await S.cancelar(seq); delete feitos[seq]; }
      }
      // agenda os novos
      for (const seq of Object.keys(desejados)) {
        if (feitos[seq]) continue;
        const { quando, c, m, repeticao } = desejados[seq];
        const t = textoAviso(c, m);
        if (repeticao) t.titulo = "🔔 " + t.titulo + " (de novo)";
        try { await S.publicar({ titulo: t.titulo, texto: t.texto, quando, seq }); feitos[seq] = { quando, id: c.id }; }
        catch (e) { break; } // sem internet: tenta de novo depois
      }
      salvarAgendados(feitos);
    } finally {
      rodando = false;
      if (deNovo) { deNovo = false; setTimeout(S.sincronizar, 500); }
    }
  };
  /* refaz tudo (ex.: mudou o número de repetições) */
  S.sincronizarTudo = function () { S.sincronizar(); };
  S.ligar = function (on) {
    J.store.set("ntfy.ativo", !!on);
    if (on) S.sincronizar();
    else { const f = agendados(); Object.keys(f).forEach((seq) => S.cancelar(seq)); salvarAgendados({}); }
  };
  S.teste = (segundos) => S.publicar({ titulo: "Jarbas", texto: segundos ? "Teste agendado: os avisos com o app fechado estão funcionando, senhor." : "Teste: os avisos com o app fechado estão funcionando, senhor.", quando: segundos ? Date.now() + segundos * 1000 : 0 });

  window.addEventListener("online", () => S.sincronizar());
  setInterval(() => S.sincronizar(), 20 * 60000);
})(window.J);
