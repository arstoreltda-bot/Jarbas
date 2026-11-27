/* Jarbas · cérebro: entende o pedido (texto ou voz) e decide a ação */
"use strict";
(function (J) {
  const C = (J.cerebro = {});

  function sistema() {
    return `Você é o Jarbas, o assistente pessoal do Alison, inspirado num mordomo de inteligência artificial: educado, calmo, leve, caloroso e eficiente. Trate-o sempre por "senhor" ("Sim, senhor.", "Pois não, senhor.", "Às suas ordens."). Frases curtas e naturais, prontas para serem lidas em voz alta: sem markdown, sem emojis, sem listas com símbolos. Nunca se apresente nem explique suas funções sem ele pedir. Não comece com "bom dia", "boa tarde" ou "boa noite": o app já cumprimenta na primeira mensagem do dia. Ele está no Brasil (fuso America/Sao_Paulo) e fala português do Brasil.

Você recebe um CONTEXTO em JSON e a MENSAGEM do Alison, em texto ou em áudio anexo. Se vier áudio, transcreva fielmente o que ele disse em "transcricao". Se o áudio estiver vazio, só com ruído ou incompreensível, use a ação "naoentendi".

Ações possíveis (campo "acao"):
- "agendar": marcar um compromisso novo. Preencha "compromisso". Converta datas relativas (hoje, amanhã, depois de amanhã, sexta, dia 5, semana que vem, mês que vem) para a data exata AAAA-MM-DD a partir de CONTEXTO.agora. Um dia da semana sem mais detalhes é a próxima ocorrência (hoje, se o horário ainda não passou). Horas em HH:MM 24h ("3 da tarde" = 15:00; "meio-dia" = 12:00; "9 da noite" = 21:00). Sem fim informado, deixe "fim" vazio. "Dia todo" = diaInteiro true. calendario = "Trabalho" para trabalho ou a loja dele, senão "Pessoal". Título curto, com inicial maiúscula, sem data e hora. "lembrete" = LISTA com os minutos de antecedência de cada aviso, em relação ao início do compromisso (ele pode pedir vários: "2 dias antes e 1 hora antes" = [2880, 60]). Use decimais para segundos (30 segundos = 0.5; 1 dia = 1440). Horário exato pedido ("um dia antes às 20h"): calcule os minutos entre esse momento e o início. Pedido relativo a agora ("me avisa daqui a 20 minutos e 15 segundos"): minutos antes = (início do compromisso) − (CONTEXTO.agora + 20 min 15 s), com decimais, usando os segundos de CONTEXTO.agora. [0] = na hora. -1 = ele não quer aviso. Se ele NÃO falou nada sobre aviso ou lembrete, use null. Se faltar o dia ou a hora (e não for dia inteiro), use "perguntar".
- "remarcar": alterar um compromisso existente. "id" = id de CONTEXTO.compromissos; "compromisso" = TODOS os campos já com a alteração aplicada.
- "cancelar": desmarcar um compromisso existente. "id" = id de CONTEXTO.compromissos. Se houver dúvida sobre qual, use "perguntar".
- "listar": ele quer saber o que tem marcado. Em "resposta", diga os compromissos do período pedido, um por linha, no formato "Sexta, 27/11, às 15h: Dentista". Se não houver nada, diga isso com leveza.
- "perguntar": falta informação essencial. Pergunta curta em "resposta".
- "confirmar" / "recusar": SOMENTE quando CONTEXTO.pendente existir e for uma confirmação; ele aceitou (sim, pode, confirma, isso, manda ver) ou recusou (não, deixa, cancela).
- "lembrete": SOMENTE quando CONTEXTO.pendente.tipo for "lembrete" e ele responder quanto tempo antes quer o aviso. Preencha "minutos" como em "lembrete" acima (lista de minutos, ou -1).
- "conversa": qualquer outra coisa. Se ele só chamar seu nome ou cumprimentar, responda numa frase curta e elegante como "Sim, senhor. Estou pronto." ou "Às suas ordens, senhor.", variando. Perguntas gerais: responda de forma breve e útil.
- "naoentendi": áudio vazio ou incompreensível.

Se CONTEXTO.pendente existir e ele pedir uma mudança no que está pendente (outro horário, outro dia), devolva "agendar" (ou "remarcar", se o pendente tiver id) com os dados completos já corrigidos, mantendo o lembrete que já estava escolhido. Use CONTEXTO.conversa só como memória para completar pedidos que ele começou antes; nunca repita falas anteriores do Jarbas e responda apenas à MENSAGEM nova.
Em "resposta", para agendar e remarcar, escreva uma frase curta de confirmação; o app mostra os detalhes.${J.financas && J.financas.ativo ? "\n" + J.financas.instrucoes() : ""}

Responda SOMENTE com JSON neste formato:
{"transcricao":"","acao":"","compromisso":{"titulo":"","data":"AAAA-MM-DD","inicio":"HH:MM","fim":"","diaInteiro":false,"local":"","calendario":"Pessoal","lembrete":null},"id":"","minutos":null,"resposta":""}`;
  }

  function contexto(pendente, historico) {
    const ag = J.agora();
    const p = pendente ? { tipo: pendente.tipo, id: pendente.id || undefined, compromisso: pendente.c } : null;
    return {
      agora: { data: ag.data, diaDaSemana: J.DIAS[J.diaSemana(ag.data)], hora: ag.hora + ":" + String(new Date().getSeconds()).padStart(2, "0") },
      compromissos: J.agenda.paraIA(),
      pendente: p,
      conversa: historico.slice(-6).map((h) => (h.de === "eu" ? "Alison: " : "Jarbas: ") + h.texto),
    };
  }

  /* entrada: {texto} ou {audio: base64 wav} */
  C.entender = async function (entrada, pendente, historico) {
    const partes = [{ text: "CONTEXTO: " + JSON.stringify(contexto(pendente, historico)) }];
    if (entrada.audio) { partes.push({ text: "MENSAGEM: no áudio anexo." }); partes.push({ inlineData: { mimeType: "audio/wav", data: entrada.audio } }); }
    else partes.push({ text: "MENSAGEM: " + JSON.stringify(entrada.texto) });
    const r = await J.gemini.json(sistema(), partes);
    if (Array.isArray(r) && r[0]) r = r[0];
    if (!r || typeof r !== "object") throw new J.gemini.ErroIA("api", "resposta sem JSON");
    if (!r.acao) r.acao = r.resposta ? "conversa" : (entrada.audio && !r.transcricao ? "naoentendi" : "conversa");
    return r;
  };

  /* ---------- leitor simples, usado sem internet ou sem chave ---------- */
  C.lerLembrete = function (texto) {
    const t = J.semAcento(texto).replace("quarenta e cinco", "quarenta_e_cinco");
    if (/sem (lembrete|aviso)|nao (precisa|quero)|nenhum|dispensa/.test(t)) return -1;
    if (/na hora|no horario/.test(t)) return 0;
    if (/meia hora/.test(t)) return 30;
    const num = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, quarenta_e_cinco: 45 };
    let total = 0, achou = false, m;
    const re = /(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta_e_cinco|quarenta)\s*(segundos?|minutos?|min\b|horas?|h\b|dias?|semanas?)/g;
    while ((m = re.exec(t))) {
      const n = m[1] in num ? num[m[1]] : Number(m[1].replace(",", ".")); if (isNaN(n)) continue; achou = true; const u = m[2];
      total += u.startsWith("seg") ? n / 60 : u.startsWith("m") ? n : u.startsWith("h") ? n * 60 : u.startsWith("d") ? n * 1440 : n * 10080;
    }
    if (achou && /horas? e meia/.test(t)) total += 30;
    if (!achou && /vespera|dia anterior|\bum dia\b/.test(t)) return 1440;
    return achou ? Math.round(total * 100) / 100 : null;
  };

  C.local = function (texto, pendente) {
    const t = J.semAcento(texto).trim();
    if (pendente) {
      if (pendente.tipo === "lembrete") { const resposta = /antes|na hora|no horario|sem (lembrete|aviso)|nao (precisa|quero)|vespera|dia anterior|nenhum/.test(t) || t.split(/\s+/).length <= 3; const m = resposta && !/\b(agend|marc|anot|desmarc|muda|troca)/.test(t) ? C.lerLembrete(texto) : null; if (m !== null) return { acao: "lembrete", minutos: m }; }
      else {
        if (/^(sim|pode|confirma|confirmo|isso|ok|certo|claro|manda|perfeito|com certeza)\b/.test(t)) return { acao: "confirmar" };
        if (/^(nao|deixa|cancela|esquece|negativo)\b/.test(t)) return { acao: "recusar" };
      }
    }
    if (/^(oi|ola|ei|e ai|bom dia|boa tarde|boa noite)?[,\s]*jarbas[\s!?.,]*$/.test(t) || /^(oi|ola|bom dia|boa tarde|boa noite)[\s!.]*$/.test(t)) return { acao: "conversa" };
    const ag = J.agora();
    if (/o que (eu )?tenho|minha agenda|meus compromissos|tenho algo|tenho compromisso/.test(t)) {
      let de = ag.data, ate = J.addDias(ag.data, 30);
      if (/\bhoje\b/.test(t)) ate = de; else if (/amanha/.test(t)) de = ate = J.addDias(ag.data, 1); else if (/semana/.test(t)) ate = J.addDias(ag.data, 7);
      const r = J.agenda.resumoTexto(de, ate);
      return { acao: "listar", resposta: r ? "Pois não, senhor:\n" + r : "Não há nada marcado nesse período, senhor." };
    }
    let data = null;
    if (/\bhoje\b/.test(t)) data = ag.data;
    else if (/depois de amanha/.test(t)) data = J.addDias(ag.data, 2);
    else if (/\bamanha\b/.test(t)) data = J.addDias(ag.data, 1);
    else {
      const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (dm) { const y = dm[3] ? (dm[3].length === 2 ? "20" + dm[3] : dm[3]) : ag.data.slice(0, 4); data = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`; if (!dm[3] && data < ag.data) data = `${Number(y) + 1}${data.slice(4)}`; }
      else {
        const i = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"].findIndex((n) => new RegExp("\\b" + n).test(t));
        if (i >= 0) data = J.addDias(ag.data, (i - J.diaSemana(ag.data) + 7) % 7);
        else { const dia = t.match(/\bdia (\d{1,2})\b/); if (dia) { let d = `${ag.data.slice(0, 7)}-${dia[1].padStart(2, "0")}`; if (d < ag.data) { const x = J.dObj(ag.data.slice(0, 7) + "-01"); x.setUTCMonth(x.getUTCMonth() + 1); d = J.dStr(x).slice(0, 8) + dia[1].padStart(2, "0"); } data = d; } }
      }
    }
    const hs = [...t.matchAll(/\b(\d{1,2})(?:h|:)(\d{2})?\b|\b(\d{1,2})\s*horas?\b(?!\s*antes)/g)].map((m) => `${(m[1] || m[3]).padStart(2, "0")}:${m[2] || "00"}`).filter((h) => Number(h.slice(0, 2)) < 24);
    const diaInteiro = /dia (todo|inteiro)/.test(t);
    const pareceAgenda = data || hs.length || /\b(agend|marc|anot|lembr)/.test(t);
    if (!pareceAgenda) return { acao: "conversa", resposta: J.gemini.temChave() ? "Estou sem conexão com meu cérebro agora, senhor. Por enquanto, consigo marcar e listar compromissos." : "Para conversar comigo sobre tudo, configure minha chave do Google em Ajustes, senhor. Por enquanto, consigo marcar e listar compromissos." };
    if (!data) return { acao: "perguntar", resposta: "Pois não, senhor. Para qual dia?" };
    if (!hs.length && !diaInteiro) return { acao: "perguntar", resposta: "Perfeitamente, senhor. E a que horas?" };
    if (data === ag.data && hs[0] && hs[0] < ag.hora && /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)/.test(t)) data = J.addDias(data, 7);
    let titulo = texto.replace(/\b(agenda[r]?|marca[r]?|anota[r]?|agende|marque|anote|por favor|pra mim|para mim|jarbas)\b/gi, "")
      .replace(/\b(hoje|amanh[ãa]|depois de amanh[ãa]|(na |no |nessa |neste |nesta |nesse )?(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(-feira)?|dia \d{1,2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/gi, "")
      .replace(/\b(com )?(lembrete|aviso)?\s*(de )?\d+\s*(min(utos)?|horas?|dias?)\s*antes\b|\b(meia hora|um dia) antes\b|\bna hora\b|\bsem (lembrete|aviso)\b/gi, "")
      .replace(/\b(às|as|das|de|até|ate|a)?\s*\d{1,2}(h|:)\d{0,2}\b|\b\d{1,2}\s*horas?\b/gi, "")
      .replace(/\b(dia (todo|inteiro))\b/gi, "").replace(/[,.!?]/g, " ").replace(/\s+(às|as|das|até|ate|e|o|a|um|uma|na|no|com|de)\s*$/i, "").replace(/\s{2,}/g, " ").trim().replace(/^(um|uma|o|a)\s+/i, "");
    const inicio = diaInteiro ? "" : hs[0], fim = diaInteiro ? "" : hs[1] || "";
    const lm = t.match(/((?:\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|cinco|dez|quinze|vinte|trinta|meia)\s*(?:segundos?|minutos?|min|horas?|h|dias?)(?:\s*e\s*meia)?)\s*antes/);
    const lembrete = /sem (lembrete|aviso)/.test(t) ? -1 : /\bna hora\b/.test(t) ? 0 : lm ? C.lerLembrete(lm[1]) : /vespera|dia anterior/.test(t) ? 1440 : null;
    return { acao: "agendar", compromisso: { titulo: titulo || "Compromisso", data, inicio, fim, diaInteiro, lembrete, local: "", calendario: /loja|trabalho|cliente|fornecedor|reuni/.test(t) ? "Trabalho" : "Pessoal" } };
  };
})(window.J);
