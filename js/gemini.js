/* Jarbas · conexão com a IA (Google Gemini, plano gratuito)
   A chave fica salva só neste aparelho e vai direto do iPhone para o Google. */
"use strict";
(function (J) {
  const BASE = "https://generativelanguage.googleapis.com/v1beta";
  const G = (J.gemini = {});

  G.chave = () => J.store.get("gemini.chave", "");
  G.temChave = () => !!G.chave();
  G.salvarChave = (k) => J.store.set("gemini.chave", String(k || "").trim());
  G.modelo = () => J.store.get("gemini.modelo", "gemini-flash-latest");
  G.modeloVoz = () => J.store.get("gemini.modeloVoz", "gemini-2.5-flash-preview-tts");

  class ErroIA extends Error { constructor(tipo, msg, status) { super(msg); this.tipo = tipo; this.status = status; } }
  G.ErroIA = ErroIA;

  /* Mensagem amigável para cada tipo de falha */
  G.explicar = function (e) {
    switch (e && e.tipo) {
      case "chave": return "Minha chave do Google não está funcionando, senhor. Confira em Ajustes.";
      case "limite": return "Atingimos o limite gratuito do Google por agora, senhor. Tente de novo em um minuto.";
      case "rede": return "Estou sem internet no momento, senhor.";
      case "semchave": return "Ainda não tenho minha chave do Google, senhor. Configure em Ajustes.";
      default: return "Tive um problema para pensar agora, senhor. Pode repetir?";
    }
  };

  async function chamar(caminho, corpo, { timeout = 30000 } = {}) {
    const chave = G.chave();
    if (!chave) throw new ErroIA("semchave", "sem chave");
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    let r;
    try {
      const cab = { "x-goog-api-key": chave };
      if (corpo) cab["Content-Type"] = "application/json";
      r = await fetch(`${BASE}/${caminho}`, {
        method: corpo ? "POST" : "GET",
        headers: cab,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: ctl.signal,
      });
    } catch (e) {
      throw new ErroIA(e.name === "AbortError" ? "tempo" : "rede", e.message);
    } finally { clearTimeout(t); }
    if (r.ok) return r.json();
    let det = ""; try { const j = await r.json(); det = (j.error && (j.error.message || j.error.status)) || ""; } catch (e) {}
    if (r.status === 429) throw new ErroIA("limite", det, 429);
    if (r.status === 400 && /api.?key|API_KEY/i.test(det)) throw new ErroIA("chave", det, 400);
    if (r.status === 401 || r.status === 403) throw new ErroIA("chave", det, r.status);
    if (r.status === 404) throw new ErroIA("modelo", det, 404);
    throw new ErroIA("api", det || "HTTP " + r.status, r.status);
  }

  /* Testa a chave e escolhe automaticamente os melhores modelos gratuitos disponíveis. */
  G.configurar = async function (chave) {
    const antiga = G.chave();
    G.salvarChave(chave);
    try {
      const j = await chamar("models?pageSize=200", null, { timeout: 20000 });
      const nomes = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
      const versao = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : 0; };
      let texto = nomes.includes("gemini-flash-latest") ? "gemini-flash-latest" : null;
      if (!texto) {
        const flash = nomes.filter((n) => /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => versao(b) - versao(a));
        const qualquer = nomes.filter((n) => /flash/.test(n) && !/tts|image|live|audio|lite|thinking|exp/.test(n)).sort((a, b) => versao(b) - versao(a));
        texto = flash[0] || qualquer[0] || "gemini-2.5-flash";
      }
      const tts = nomes.filter((n) => /flash/.test(n) && /tts/.test(n)).sort((a, b) => versao(b) - versao(a) || (/preview/.test(a) ? 1 : -1));
      J.store.set("gemini.modelo", texto);
      if (tts[0]) J.store.set("gemini.modeloVoz", tts[0]);
      J.store.set("gemini.temVoz", !!tts[0]);
      return { modelo: texto, modeloVoz: tts[0] || null };
    } catch (e) {
      if (antiga) G.salvarChave(antiga); else J.store.del("gemini.chave");
      throw e;
    }
  };

  function textoDaResposta(j) {
    const c = j && j.candidates && j.candidates[0];
    if (!c || !c.content || !c.content.parts) {
      const motivo = (j && j.promptFeedback && j.promptFeedback.blockReason) || (c && c.finishReason) || "vazia";
      throw new ErroIA("api", "resposta " + motivo);
    }
    return c.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  }
  G.lerJSON = function (t) {
    t = String(t || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new ErroIA("api", "JSON inválido");
  };

  /* Pede uma resposta em JSON. partes = [{text}] e/ou [{inlineData:{mimeType,data}}] */
  G.json = async function (sistema, partes, { temperatura = 0.4 } = {}) {
    const modelo = G.modelo();
    const corpo = {
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseMimeType: "application/json", temperature: temperatura, maxOutputTokens: 2048 },
    };
    const semPensar = J.store.get("gemini.semPensar", true);
    if (semPensar) corpo.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    let j;
    try {
      j = await chamar(`models/${modelo}:generateContent`, corpo);
    } catch (e) {
      if (e.tipo === "api" && e.status === 400 && corpo.generationConfig.thinkingConfig) {
        // modelo não aceita desligar o raciocínio: tenta sem essa opção e lembra
        delete corpo.generationConfig.thinkingConfig;
        J.store.set("gemini.semPensar", false);
        j = await chamar(`models/${modelo}:generateContent`, corpo);
      } else if (e.tipo === "modelo" && modelo !== "gemini-2.5-flash") {
        J.store.set("gemini.modelo", "gemini-2.5-flash");
        return G.json(sistema, partes, { temperatura });
      } else throw e;
    }
    return G.lerJSON(textoDaResposta(j));
  };

  /* Voz premium: transforma texto em fala (PCM 24 kHz). Retorna {pcm: Int16Array, taxa} */
  G.falar = async function (texto, voz) {
    const corpo = {
      contents: [{ parts: [{ text: `Diga em português do Brasil, com voz masculina calma, educada e serena de um mordomo de inteligência artificial, levemente sintética, em ritmo contínuo e sem pausas longas: ${texto}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz || "Charon" } } } },
    };
    const j = await chamar(`models/${G.modeloVoz()}:generateContent`, corpo, { timeout: 20000 });
    const p = j && j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).find((x) => x.inlineData);
    if (!p) throw new ErroIA("api", "sem áudio");
    const taxa = Number((p.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || 24000);
    const bin = atob(p.inlineData.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { pcm: new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2)), taxa };
  };
})(window.J);
