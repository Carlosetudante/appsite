// oracle-client.js (duplicado da pasta frontend)
// FunÃ§Ãµes cliente para decisÃ£o hÃ­brida (NLU local + fallback + RAG + LLM)
(function () {
  async function searchMemories(text) {
    const rawQuery = String(text || '').trim();
    const query = rawQuery.toLowerCase();
    const collected = [];
    const seen = new Set();
    const STOPWORDS = new Set([
      'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
      'em', 'no', 'na', 'nos', 'nas', 'com', 'sem', 'por', 'para', 'pra', 'que', 'qual',
      'como', 'quando', 'onde', 'porque', 'sobre', 'meu', 'minha', 'meus', 'minhas',
      'eu', 'você', 'voce', 'ele', 'ela', 'isso', 'isto', 'essa', 'esse', 'esta', 'este',
      'e', 'ou', 'se', 'já', 'ja', 'to', 'tô', 'ta', 'estou', 'está', 'estao', 'sao', 'são'
    ]);

    const trimContent = (value, max = 900) => {
      const raw = String(value || '').replace(/\s+/g, ' ').trim();
      if (!raw) return '';
      if (raw.length <= max) return raw;
      return `${raw.slice(0, Math.max(30, max - 1)).trim()}...`;
    };

    const normalizeLoose = (value) => String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedQuery = normalizeLoose(rawQuery);
    const queryTokens = normalizedQuery
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token && token.length >= 3 && !STOPWORDS.has(token));

    const matchScoreFor = (value) => {
      const hay = normalizeLoose(value);
      if (!hay) return -1;
      if (!normalizedQuery) return 1;

      let score = 0;
      let tokenHits = 0;
      if (hay.includes(normalizedQuery)) score += 6;
      queryTokens.forEach((token) => {
        if (hay.includes(token)) {
          tokenHits += 1;
          score += 1;
        }
      });

      if (score <= 0 && tokenHits === 0) return -1;
      if (queryTokens.length >= 3 && tokenHits <= 1 && !hay.includes(normalizedQuery)) return -1;
      return score + (tokenHits / Math.max(1, queryTokens.length));
    };

    const addMemory = (content, extra = {}) => {
      const clean = trimContent(content);
      if (!clean) return;
      const score = Number.isFinite(Number(extra.score)) ? Number(extra.score) : matchScoreFor(clean);
      if (score < 0) return;
      const key = normalizeLoose(clean);
      if (seen.has(key)) return;
      seen.add(key);
      collected.push({
        content: clean,
        title: extra.title || '',
        source: extra.source || 'local',
        score
      });
    };

    const financeQuery = /(financ|financeir|saldo|dinheiro|gasto|despesa|receita|entrada|saida|saída|r\$|conta)/i.test(normalizedQuery);
    if (financeQuery) {
      try {
        const txs = Array.isArray(window.gameState?.finances) ? window.gameState.finances : [];
        if (txs.length) {
          const income = txs.filter((t) => t?.type === 'income').reduce((sum, t) => sum + Number(t?.value || 0), 0);
          const expense = txs.filter((t) => t?.type === 'expense').reduce((sum, t) => sum + Number(t?.value || 0), 0);
          const balance = income - expense;
          const latest = txs
            .slice()
            .sort((a, b) => {
              const ams = Date.parse(String(a?.date || a?.createdAt || '')) || 0;
              const bms = Date.parse(String(b?.date || b?.createdAt || '')) || 0;
              return bms - ams;
            })
            .slice(0, 6)
            .map((t) => {
              const typeLabel = t?.type === 'income' ? 'entrada' : 'saida';
              const desc = String(t?.desc || '').trim() || 'sem descrição';
              const val = Number(t?.value || 0).toFixed(2);
              return `${typeLabel}: ${desc} (R$ ${val})`;
            });

          const summary = [
            `Resumo financeiro local: entradas R$ ${income.toFixed(2)}, saídas R$ ${expense.toFixed(2)}, saldo R$ ${balance.toFixed(2)}.`,
            latest.length ? `Últimos lançamentos: ${latest.join(' | ')}` : ''
          ].filter(Boolean).join('\n');

          addMemory(summary, {
            title: 'Finanças do app',
            source: 'finance_state_local',
            score: 12
          });
        }
      } catch (e) {
        console.warn('finance_state local parse erro', e);
      }
    }

    if (typeof searchOracleMemory === 'function') {
      try {
        const hits = await searchOracleMemory(text);
        (hits || []).forEach((h) => {
          addMemory(h?.fact || h?.text || h?.title || '', {
            title: h?.title || 'Nuvem',
            source: 'cloud_oracle_memory'
          });
        });
      } catch (e) {
        console.warn('searchOracleMemory erro', e);
      }
    }

    try {
      const localRaw = localStorage.getItem('oracle_memory');
      const localMem = localRaw ? JSON.parse(localRaw) : null;
      const facts = Array.isArray(localMem?.facts) ? localMem.facts : [];
      for (let i = facts.length - 1; i >= 0; i -= 1) {
        const f = facts[i] || {};
        const textFact = String(f?.text || '').trim();
        if (!textFact) continue;
        addMemory(textFact, { title: 'Memória local', source: 'oracle_memory_local' });
        if (collected.length >= 40) break;
      }
    } catch (e) {
      console.warn('oracle_memory local parse erro', e);
    }

    try {
      const iaRaw = localStorage.getItem('ur_ia_hub_knowledge_v1');
      const iaEntries = iaRaw ? JSON.parse(iaRaw) : [];
      if (Array.isArray(iaEntries)) {
        for (let i = iaEntries.length - 1; i >= 0; i -= 1) {
          const entry = iaEntries[i] || {};
          const prompt = String(entry.prompt || '').trim();
          const response = String(entry.response || '').trim();
          if (!response) continue;
          const topic = String(entry.topic || 'geral').trim();
          const provider = String(entry.provider || 'ia').trim();
          const payload = `Tópico: ${topic}\nProvedor: ${provider}\nPergunta: ${prompt || '(sem prompt)'}\nResposta: ${response}`;
          addMemory(payload, { title: `IA Hub • ${topic}`, source: 'ia_hub_local' });
          if (collected.length >= 40) break;
        }
      }
    } catch (e) {
      console.warn('IA Hub local memory parse erro', e);
    }

    const sorted = collected
      .slice()
      .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
      .slice(0, 12);

    return sorted.map(({ score, ...rest }) => rest);
  }

  function isValidOracleResponse(obj) {
    return obj && typeof obj.intent === 'string' && typeof obj.reply === 'string' && Array.isArray(obj.actions);
  }

  function makeSessionId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  async function promiseWithTimeout(promise, timeoutMs = 22000, code = 'ORACLE_PROMISE_TIMEOUT') {
    const ms = Math.max(3000, Number(timeoutMs) || 22000);
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(code);
        err.code = code;
        reject(err);
      }, ms);
    });
    try {
      return await Promise.race([Promise.resolve(promise), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const ms = Math.max(4000, Number(timeoutMs) || 20000);

    if (typeof AbortController === 'undefined') {
      const timeoutPromise = new Promise((_, reject) => {
        const err = new Error('ORACLE_FETCH_TIMEOUT');
        err.code = 'ORACLE_FETCH_TIMEOUT';
        setTimeout(() => reject(err), ms);
      });
      return Promise.race([fetch(url, options), timeoutPromise]);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const timeoutErr = new Error('ORACLE_FETCH_TIMEOUT');
        timeoutErr.code = 'ORACLE_FETCH_TIMEOUT';
        throw timeoutErr;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeOracleResult(obj, source, sessionKey, context) {
    return {
      intent: obj?.intent || 'desconhecido',
      entities: obj?.entities || {},
      confidence: typeof obj?.confidence === 'number' ? obj.confidence : 0,
      reply: obj?.reply || '',
      questions: Array.isArray(obj?.questions) ? obj.questions.slice(0, 2) : [],
      actions: Array.isArray(obj?.actions) ? obj.actions : [],
      source,
      session: context && (context.session || context.sessionId) ? (context.session || context.sessionId) : sessionKey
    };
  }

  function resolveSessionKey(context) {
    if (context) {
      if (typeof context === 'string') return context;
      if (typeof context === 'object' && context.session) {
        return (typeof context.session === 'string') ? context.session : context.session.id || null;
      }
    }
    return null;
  }

  const LOCAL_LLM_PLUGIN_NAMES = [
    'LocalLlm',
    'LocalLLM',
    'OracleLocalLlm',
    'LocalLlmEngine',
    'LlamaCpp',
    'LlamaJni',
    'OnDeviceLlm',
    'OnDeviceLLM'
  ];
  const OFFLINE_HISTORY_KEY = 'oracle_offline_llm_history_v1';
  const OFFLINE_TURN_KEY = 'oracle_offline_llm_turn_count_v1';
  const LOCAL_LLM_STATE = {
    plugin: null,
    pluginName: '',
    loadedModelSignature: ''
  };

  function isLocalOfflineProvider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    return [
      'local_offline',
      'offline_local',
      'local_llm',
      'llama_cpp',
      'llama',
      'ondevice',
      'device_local'
    ].includes(normalized);
  }

  function normalizeLooseText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactText(value, max = 1200) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    if (clean.length <= max) return clean;
    return `${clean.slice(0, Math.max(80, max - 1)).trim()}...`;
  }

  function parseListStorage(key, fallback = []) {
    try {
      const raw = localStorage.getItem(String(key || ''));
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveListStorage(key, list = [], max = 80) {
    const safeList = (Array.isArray(list) ? list : [])
      .filter((item) => item && typeof item === 'object')
      .slice(-Math.max(1, Number(max) || 80));
    try {
      localStorage.setItem(String(key || ''), JSON.stringify(safeList));
    } catch (e) {}
    return safeList;
  }

  function getOfflineHistory(limit = 12) {
    const safeLimit = Math.max(1, Number(limit) || 12);
    const list = parseListStorage(OFFLINE_HISTORY_KEY, []);
    return list
      .map((item) => ({
        role: String(item?.role || '').trim().toLowerCase(),
        content: compactText(item?.content || '', 900),
        ts: Number(item?.ts || 0)
      }))
      .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content)
      .slice(-safeLimit);
  }

  function appendOfflineHistory(role, content) {
    const safeRole = String(role || '').trim().toLowerCase();
    const safeContent = compactText(content || '', 900);
    if (!safeContent) return;
    if (safeRole !== 'user' && safeRole !== 'assistant') return;
    const current = getOfflineHistory(80);
    current.push({
      role: safeRole,
      content: safeContent,
      ts: Date.now()
    });
    saveListStorage(OFFLINE_HISTORY_KEY, current, 80);
  }

  function bumpOfflineTurnCount() {
    let current = 0;
    try {
      current = Number(localStorage.getItem(OFFLINE_TURN_KEY) || 0);
    } catch (e) {
      current = 0;
    }
    if (!Number.isFinite(current) || current < 0) current = 0;
    current += 1;
    try {
      localStorage.setItem(OFFLINE_TURN_KEY, String(current));
    } catch (e) {}
    return current;
  }

  function getCapacitorInstance() {
    try {
      return window.Capacitor || null;
    } catch (e) {
      return null;
    }
  }

  function resolveCapacitorPlugin(names = []) {
    const cap = getCapacitorInstance();
    if (!cap) return { plugin: null, name: '' };
    const pluginNames = (Array.isArray(names) ? names : [names])
      .map((n) => String(n || '').trim())
      .filter(Boolean);
    for (const name of pluginNames) {
      try {
        if (cap.Plugins && cap.Plugins[name]) return { plugin: cap.Plugins[name], name };
        if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(name)) continue;
        if (typeof cap.registerPlugin === 'function') {
          const plugin = cap.registerPlugin(name);
          if (plugin) return { plugin, name };
        }
      } catch (e) {}
    }
    return { plugin: null, name: '' };
  }

  function getLocalLlmPlugin() {
    if (LOCAL_LLM_STATE.plugin) {
      return { plugin: LOCAL_LLM_STATE.plugin, name: LOCAL_LLM_STATE.pluginName || 'LocalLlm' };
    }
    const resolved = resolveCapacitorPlugin(LOCAL_LLM_PLUGIN_NAMES);
    if (!resolved.plugin) return { plugin: null, name: '' };
    LOCAL_LLM_STATE.plugin = resolved.plugin;
    LOCAL_LLM_STATE.pluginName = resolved.name || 'LocalLlm';
    return resolved;
  }

  function readLocalLlmText(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload.trim();
    if (Array.isArray(payload)) {
      return payload.map((p) => readLocalLlmText(p)).filter(Boolean).join(' ').trim();
    }
    return String(
      payload?.text ||
      payload?.reply ||
      payload?.response ||
      payload?.output ||
      payload?.content ||
      payload?.message ||
      payload?.result ||
      ''
    ).trim();
  }

  async function ensureLocalLlmLoaded(plugin, options = {}) {
    if (!plugin || typeof plugin !== 'object') {
      const err = new Error('LOCAL_LLM_PLUGIN_NOT_AVAILABLE');
      err.code = 'LOCAL_LLM_PLUGIN_NOT_AVAILABLE';
      throw err;
    }
    const modelPath = String(options.modelPath || '').trim();
    const model = String(options.model || '').trim();
    const contextSize = Math.max(512, Number(options.contextSize) || 2048);
    const pluginTimeoutMs = Math.max(
      5000,
      Number(window.OracleConfig?.localLlmPluginTimeoutMs || options.timeoutMs || 20000)
    );
    const signature = `${modelPath || model || '__default__'}::${contextSize}`;
    if (LOCAL_LLM_STATE.loadedModelSignature === signature) return signature;

    let loaded = false;
    if (typeof plugin.loadModel === 'function') {
      try {
        await promiseWithTimeout(plugin.loadModel({
          path: modelPath,
          modelPath,
          model,
          contextSize
        }), pluginTimeoutMs, 'LOCAL_LLM_LOAD_TIMEOUT');
        loaded = true;
      } catch (e1) {
        try {
          await promiseWithTimeout(
            plugin.loadModel(modelPath || model || '', contextSize),
            pluginTimeoutMs,
            'LOCAL_LLM_LOAD_TIMEOUT'
          );
          loaded = true;
        } catch (e2) {}
      }
    } else if (typeof plugin.init === 'function') {
      try {
        await promiseWithTimeout(plugin.init({
          path: modelPath,
          modelPath,
          model,
          contextSize
        }), pluginTimeoutMs, 'LOCAL_LLM_LOAD_TIMEOUT');
        loaded = true;
      } catch (e) {}
    }

    if (!loaded && (typeof plugin.complete !== 'function' && typeof plugin.generate !== 'function' && typeof plugin.chat !== 'function')) {
      const err = new Error('LOCAL_LLM_METHOD_NOT_FOUND');
      err.code = 'LOCAL_LLM_METHOD_NOT_FOUND';
      throw err;
    }

    LOCAL_LLM_STATE.loadedModelSignature = signature;
    return signature;
  }

  async function callLocalLlmComplete(plugin, prompt, options = {}) {
    const pluginTimeoutMs = Math.max(
      5000,
      Number(options.timeoutMs || window.OracleConfig?.localLlmPluginTimeoutMs || window.OracleConfig?.localLlmTimeoutMs || 26000)
    );
    const payload = {
      prompt: String(prompt || ''),
      maxTokens: Math.max(64, Number(options.maxTokens) || 256),
      temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.65,
      topP: Number.isFinite(Number(options.topP)) ? Number(options.topP) : 0.9
    };
    const methods = ['complete', 'generate', 'infer', 'prompt'];
    for (const method of methods) {
      if (typeof plugin?.[method] !== 'function') continue;
      try {
        const out = await promiseWithTimeout(
          plugin[method](payload),
          pluginTimeoutMs,
          'LOCAL_LLM_TIMEOUT'
        );
        const text = readLocalLlmText(out);
        if (text) return text;
      } catch (e) {}
    }

    if (typeof plugin?.chat === 'function') {
      try {
        const out = await promiseWithTimeout(plugin.chat({
          messages: [
            { role: 'user', content: payload.prompt }
          ],
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
          topP: payload.topP
        }), pluginTimeoutMs, 'LOCAL_LLM_TIMEOUT');
        const text = readLocalLlmText(out);
        if (text) return text;
      } catch (e) {}
    }

    const err = new Error('LOCAL_LLM_EMPTY_RESPONSE');
    err.code = 'LOCAL_LLM_EMPTY_RESPONSE';
    throw err;
  }

  function getAgentPromptContext() {
    try {
      const scriptApi = window.OracleScript;
      if (!scriptApi || typeof scriptApi.getContext !== 'function') return null;
      const ctx = scriptApi.getContext() || {};
      const instructions = (Array.isArray(ctx.instructions) ? ctx.instructions : [])
        .map((item) => compactText(item, 220))
        .filter(Boolean)
        .slice(0, 8);
      const facts = (Array.isArray(ctx.facts) ? ctx.facts : [])
        .map((item) => compactText(item, 220))
        .filter(Boolean)
        .slice(0, 8);
      let activeName = '';
      if (typeof scriptApi.getActiveScriptId === 'function' && typeof scriptApi.getScriptById === 'function') {
        const activeId = String(scriptApi.getActiveScriptId() || '').trim();
        if (activeId) {
          const active = scriptApi.getScriptById(activeId);
          activeName = String(active?.name || active?.filename || '').trim();
        }
      }
      if (!instructions.length && !facts.length && !activeName) return null;
      return { activeName, instructions, facts };
    } catch (e) {
      return null;
    }
  }

  function buildOfflineSystemPrompt() {
    const cfg = window.OracleConfig || {};
    const custom = compactText(cfg.offlineSystemPrompt || '', 1200);
    if (custom) return custom;
    return [
      'Voce e um assistente util e direto em portugues do Brasil.',
      'Use as memorias fornecidas para personalizar a resposta.',
      'Nao invente dados pessoais do usuario.',
      'Se nao souber, diga de forma clara e objetiva.'
    ].join(' ');
  }

  function buildLocalOfflinePrompt({ message, memories = [], history = [], scriptContext = null } = {}) {
    const sections = [];
    sections.push(`system: ${buildOfflineSystemPrompt()}`);

    if (scriptContext && (scriptContext.activeName || (scriptContext.instructions || []).length || (scriptContext.facts || []).length)) {
      const scriptLines = [];
      if (scriptContext.activeName) scriptLines.push(`Agente ativo: ${scriptContext.activeName}`);
      if (Array.isArray(scriptContext.instructions) && scriptContext.instructions.length) {
        scriptLines.push('Instrucoes do agente:');
        scriptContext.instructions.forEach((line) => scriptLines.push(`- ${line}`));
      }
      if (Array.isArray(scriptContext.facts) && scriptContext.facts.length) {
        scriptLines.push('Fatos do agente:');
        scriptContext.facts.forEach((line) => scriptLines.push(`- ${line}`));
      }
      if (scriptLines.length) {
        sections.push(`system: CONTEXTO DE AGENTE\n${scriptLines.join('\n')}`);
      }
    }

    const memoryLines = (Array.isArray(memories) ? memories : [])
      .map((m) => compactText(m?.content || '', 260))
      .filter(Boolean)
      .slice(0, 8);
    if (memoryLines.length) {
      sections.push(`system: MEMORIA RELEVANTE\n${memoryLines.map((line) => `- ${line}`).join('\n')}`);
    }

    (Array.isArray(history) ? history : []).slice(-12).forEach((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : 'user';
      const content = compactText(item?.content || '', 600);
      if (!content) return;
      sections.push(`${role}: ${content}`);
    });

    sections.push(`user: ${compactText(message || '', 1200)}`);
    sections.push('assistant:');
    return sections.join('\n\n');
  }

  function extractDurableFactsFromMessages(texts = []) {
    const joined = String((Array.isArray(texts) ? texts : [texts]).join('\n')).replace(/\s+/g, ' ').trim();
    if (!joined) return [];

    const facts = [];
    const pushFact = (value) => {
      const clean = compactText(value, 180);
      if (!clean) return;
      if (!facts.some((f) => normalizeLooseText(f) === normalizeLooseText(clean))) {
        facts.push(clean);
      }
    };

    const patterns = [
      { regex: /\bmeu nome e ([^.!,\n]+)/i, prefix: 'Nome do usuario: ' },
      { regex: /\beu trabalho (?:na|no|em) ([^.!,\n]+)/i, prefix: 'Trabalho do usuario: ' },
      { regex: /\bmeu objetivo (?:e|eh) ([^.!,\n]+)/i, prefix: 'Objetivo do usuario: ' },
      { regex: /\beu gosto de ([^.!,\n]+)/i, prefix: 'Preferencia do usuario: gosta de ' },
      { regex: /\beu prefiro ([^.!,\n]+)/i, prefix: 'Preferencia do usuario: prefere ' }
    ];

    patterns.forEach((entry) => {
      const match = joined.match(entry.regex);
      if (match && match[1]) pushFact(`${entry.prefix}${match[1].trim()}`);
    });
    return facts.slice(0, 8);
  }

  function saveDurableFacts(facts = []) {
    const list = (Array.isArray(facts) ? facts : []).map((f) => compactText(f, 180)).filter(Boolean);
    if (!list.length) return 0;
    let saved = 0;
    if (window.OracleMemory && typeof window.OracleMemory.learn === 'function') {
      list.forEach((fact) => {
        const ok = window.OracleMemory.learn(fact, 'offline_fact');
        if (ok) saved += 1;
      });
      return saved;
    }
    return 0;
  }

  async function maybeRefreshOfflineMemories(plugin, turnCount = 0) {
    const safeTurn = Number(turnCount) || 0;
    if (safeTurn <= 0 || safeTurn % 10 !== 0) return;
    const history = getOfflineHistory(24);
    if (history.length < 6) return;
    const dialog = history.map((item) => `${item.role}: ${item.content}`).join('\n');
    if (!dialog) return;

    try {
      const summaryPrompt = [
        'Resuma o dialogo abaixo em ate 8 linhas, focando em contexto duradouro do usuario.',
        dialog
      ].join('\n\n');
      const summary = await callLocalLlmComplete(plugin, summaryPrompt, {
        maxTokens: 180,
        temperature: 0.2,
        topP: 0.9
      });
      const safeSummary = compactText(summary, 700);
      if (safeSummary && window.OracleMemory && typeof window.OracleMemory.learn === 'function') {
        window.OracleMemory.learn(`[OfflineSummary] ${safeSummary}`, 'offline_summary');
      }

      const factsPrompt = [
        'Extraia de 3 a 8 fatos duradouros do usuario do dialogo abaixo.',
        'Responda com um item por linha. Se nao houver fatos, responda NADA.',
        dialog
      ].join('\n\n');
      const factsRaw = await callLocalLlmComplete(plugin, factsPrompt, {
        maxTokens: 180,
        temperature: 0.2,
        topP: 0.9
      });
      const extracted = String(factsRaw || '')
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^[-*•\s]+/, ''))
        .filter((line) => line && !/^nada$/i.test(line))
        .slice(0, 8);
      saveDurableFacts(extracted);
    } catch (e) {}
  }

  function buildOfflineHeuristicReply({
    message = '',
    memories = [],
    history = [],
    scriptContext = null,
    reason = ''
  } = {}) {
    const normalizedMessage = normalizeLooseText(message);
    const memoryLines = (Array.isArray(memories) ? memories : [])
      .map((m) => compactText(m?.content || '', 220))
      .filter(Boolean)
      .slice(0, 8);

    const amountRegex = /(?:r\$\s?\d[\d.,]*|\d[\d.,]*\s?(?:reais|rs)\b)/ig;
    const dateRegex = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g;
    const protocolRegex = /\b\d{8,48}\b/g;
    const amounts = [];
    const dates = [];
    const protocols = [];

    memoryLines.forEach((line) => {
      (String(line).match(amountRegex) || []).forEach((item) => {
        const clean = compactText(item, 40);
        if (clean && !amounts.includes(clean)) amounts.push(clean);
      });
      (String(line).match(dateRegex) || []).forEach((item) => {
        const clean = compactText(item, 22);
        if (clean && !dates.includes(clean)) dates.push(clean);
      });
      (String(line).match(protocolRegex) || []).forEach((item) => {
        const clean = compactText(item, 48);
        if (clean && clean.length >= 10 && !protocols.includes(clean)) protocols.push(clean);
      });
    });

    let intro = 'Estou em modo offline local e continuo te ajudando aqui no app.';
    if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalizedMessage)) {
      intro = 'Oi! Estou online no modo local/offline e pronto para ajudar.';
    } else if (/\bcomo vai\b|\btudo bem\b|\bcomo esta\b/.test(normalizedMessage)) {
      intro = 'Estou bem e funcionando em modo local/offline no seu aparelho.';
    } else if (/\b(obrigado|valeu|grato)\b/.test(normalizedMessage)) {
      intro = 'Fechado. Sempre que precisar, eu sigo com voce em modo local.';
    }

    const asksSummary = /\b(resumo|resumir|sintese|o que voce sabe|o que lembra|memoria)\b/.test(normalizedMessage);
    const asksValue = /\b(valor|preco|total|quanto|saldo|custo)\b/.test(normalizedMessage);
    const asksDate = /\b(data|vencimento|quando)\b/.test(normalizedMessage);
    const asksProtocol = /\b(codigo|linha digitavel|protocolo|id|referencia)\b/.test(normalizedMessage);

    const lines = [intro];

    if (scriptContext && (scriptContext.activeName || (scriptContext.instructions || []).length)) {
      const active = compactText(scriptContext.activeName || '', 80);
      const objective = compactText((scriptContext.instructions || [])[0] || '', 180);
      if (active) {
        lines.push(`Agente ativo agora: ${active}.`);
      }
      if (objective) {
        lines.push(`Foco do agente: ${objective}.`);
      }
    }

    if (asksValue && amounts.length) {
      lines.push(`Valor(es) encontrado(s): ${amounts.slice(0, 4).join(' | ')}.`);
    }
    if (asksDate && dates.length) {
      lines.push(`Data(s) identificada(s): ${dates.slice(0, 4).join(' | ')}.`);
    }
    if (asksProtocol && protocols.length) {
      lines.push(`Codigo(s)/referencia(s): ${protocols.slice(0, 3).join(' | ')}.`);
    }

    const recentTurns = (Array.isArray(history) ? history : [])
      .slice(-4)
      .map((item) => `${item?.role === 'assistant' ? 'assistente' : 'usuario'}: ${compactText(item?.content || '', 160)}`)
      .filter(Boolean);

    if ((asksSummary || /\?/.test(message)) && memoryLines.length) {
      const top = memoryLines.slice(0, 4).map((line) => `- ${line}`).join('\n');
      lines.push(`Resumo rapido do que lembro agora:\n${top}`);
    } else if (recentTurns.length) {
      lines.push(`Contexto recente:\n${recentTurns.join('\n')}`);
    }

    if (!memoryLines.length && !recentTurns.length) {
      lines.push('Ainda nao tenho contexto suficiente salvo. Se quiser, me passe mais detalhes para eu aprender.');
    }

    if (reason) {
      lines.push(`(Modo local de contingencia: ${compactText(reason, 120)})`);
    }

    return compactText(lines.join('\n\n'), 2600);
  }

  async function callLocalOfflineLlm({ message, memories = [], model = '', sessionKey = '', context = {}, cfg = {} } = {}) {
    const history = getOfflineHistory(12);
    const scriptContext = getAgentPromptContext();
    const commitHistory = (replyText = '') => {
      appendOfflineHistory('user', message);
      appendOfflineHistory('assistant', replyText);
      saveDurableFacts(extractDurableFactsFromMessages([message, replyText]));
      return bumpOfflineTurnCount();
    };
    const fallbackResult = (reason = '') => {
      const reply = buildOfflineHeuristicReply({
        message,
        memories,
        history,
        scriptContext,
        reason
      });
      commitHistory(reply);
      return normalizeOracleResult({
        intent: 'general.chat',
        entities: {},
        confidence: 0.52,
        reply,
        questions: [],
        actions: []
      }, 'llm_local_offline_fallback', sessionKey, context);
    };

    const resolved = getLocalLlmPlugin();
    if (!resolved.plugin) {
      return fallbackResult('plugin_nativo_indisponivel');
    }

    const modelPath = String(cfg.localLlmModelPath || cfg.llmModelPath || '').trim();
    const contextSize = Math.max(512, Number(cfg.localLlmContextSize) || 2048);
    const maxTokens = Math.max(64, Number(cfg.localLlmMaxTokens) || 320);
    const temperature = Number.isFinite(Number(cfg.localLlmTemperature)) ? Number(cfg.localLlmTemperature) : 0.68;
    const topP = Number.isFinite(Number(cfg.localLlmTopP)) ? Number(cfg.localLlmTopP) : 0.9;
    const pluginTimeoutMs = Math.max(
      5000,
      Number(cfg.localLlmTimeoutMs || cfg.localLlmPluginTimeoutMs || 26000)
    );

    try {
      await ensureLocalLlmLoaded(resolved.plugin, {
        modelPath,
        model,
        contextSize,
        timeoutMs: pluginTimeoutMs
      });
    } catch (e) {
      return fallbackResult(`falha_ao_carregar_modelo: ${String(e?.code || e?.message || e || '').slice(0, 80)}`);
    }

    try {
      const prompt = buildLocalOfflinePrompt({
        message,
        memories,
        history,
        scriptContext
      });

      const reply = compactText(await callLocalLlmComplete(resolved.plugin, prompt, {
        maxTokens,
        temperature,
        topP,
        timeoutMs: pluginTimeoutMs
      }), 2600);

      if (!reply) {
        return fallbackResult('resposta_vazia_do_plugin');
      }

      const turnCount = commitHistory(reply);
      Promise.resolve(maybeRefreshOfflineMemories(resolved.plugin, turnCount)).catch(() => {});

      return normalizeOracleResult({
        intent: 'general.chat',
        entities: {},
        confidence: 0.88,
        reply,
        questions: [],
        actions: []
      }, 'llm_local_offline', sessionKey, context);
    } catch (e) {
      return fallbackResult(`erro_execucao_plugin: ${String(e?.code || e?.message || e || '').slice(0, 90)}`);
    }
  }

  function parseImageDataUrlPayload(dataUrl) {
    const raw = String(dataUrl || '').trim();
    const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
    if (!match) {
      const err = new Error('IMAGE_DATA_URL_INVALID');
      err.code = 'IMAGE_DATA_URL_INVALID';
      throw err;
    }
    const mimeType = String(match[1] || '').toLowerCase();
    const base64Data = String(match[2] || '').replace(/\s+/g, '');
    if (!mimeType.startsWith('image/')) {
      const err = new Error('IMAGE_MIME_INVALID');
      err.code = 'IMAGE_MIME_INVALID';
      throw err;
    }
    if (!base64Data || base64Data.length < 120) {
      const err = new Error('IMAGE_BASE64_EMPTY');
      err.code = 'IMAGE_BASE64_EMPTY';
      throw err;
    }
    if (base64Data.length > 5800000) {
      const err = new Error('IMAGE_TOO_LARGE');
      err.code = 'IMAGE_TOO_LARGE';
      throw err;
    }
    return { mimeType, base64Data };
  }

  function buildImageAnalysisPrompt(message, memories = []) {
    const cleanMessage = String(message || '').trim();
    const memoryText = (memories || [])
      .map((m, i) => `${i + 1}. ${String(m?.content || '').trim()}`)
      .filter(Boolean)
      .slice(0, 4)
      .join('\n');

    return [
      'Voce e o Oraculo do app Universo Real.',
      'Responda em portugues (pt-BR), de forma objetiva e sem inventar dados.',
      'Analise a imagem enviada pelo usuario.',
      'Se for conta/boleto/comprovante, extraia em topicos: tipo, emissor, data, valor_total, vencimento, codigo_linha_digitavel, itens.',
      'Se algum campo nao aparecer, escreva "nao identificado".',
      cleanMessage ? `Pedido do usuario: ${cleanMessage}` : 'Pedido do usuario: Analise esta imagem e explique o que significa.',
      memoryText ? `Contexto util:\n${memoryText}` : ''
    ].filter(Boolean).join('\n\n');
  }

  function extractGeminiReplyText(data) {
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    return String(parts.map((p) => String(p?.text || '')).join('\n').trim()).trim();
  }

  function buildGeminiImagePartVariants(mimeType, base64Data) {
    return [
      { inlineData: { mimeType, data: base64Data } },
      { inline_data: { mime_type: mimeType, data: base64Data } }
    ];
  }

  async function callMiniMaxDirect({ message, memories, model, apiKey, baseUrl, sessionKey, context }) {
    const endpoint = `${String(baseUrl || 'https://api.minimax.io/v1').replace(/\/+$/, '')}/chat/completions`;
    const memoryText = (memories || [])
      .map((m, i) => `${i + 1}. ${String(m?.content || '').trim()}`)
      .filter(Boolean)
      .join('\n');

    const systemPrompt = [
      'VocÃª Ã© o OrÃ¡culo do app Universo Real.',
      'Responda em portuguÃªs (pt-BR).',
      'Retorne EXATAMENTE um JSON vÃ¡lido com chaves: intent, entities, confidence, reply, questions, actions.',
      'questions deve ser array curto (mÃ¡ximo 2). actions deve ser array.',
      'confidence entre 0 e 1.'
    ].join(' ');

    const userPrompt = [
      `Mensagem do usuÃ¡rio: ${message}`,
      memoryText ? `MemÃ³rias Ãºteis:\n${memoryText}` : 'MemÃ³rias Ãºteis: nenhuma.'
    ].join('\n\n');

    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'MiniMax-M1',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    }, 22000);

    if (!resp.ok) {
      throw new Error(`MiniMax HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('MiniMax sem conteÃºdo');

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = String(text).match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('MiniMax nÃ£o retornou JSON de resposta vÃ¡lido');
    }

    return normalizeOracleResult(parsed, 'llm_minimax', sessionKey, context);
  }

  async function callRapidApiChatbot({ message, apiKey, endpoint, host, sessionKey, context, cfg }) {
    const apiEndpoint = endpoint || 'https://chatgpt-ai-chat-bot.p.rapidapi.com/ask';
    const apiHost = host || 'chatgpt-ai-chat-bot.p.rapidapi.com';
    const lowerEndpoint = String(apiEndpoint).toLowerCase();
    let requestBody = { query: message };

    if (lowerEndpoint.includes('/adultgpt') || apiHost.includes('adult-gpt')) {
      requestBody = {
        messages: [{ role: 'user', content: message }],
        genere: cfg?.rapidapiAdultGenre || 'ai-gay-1',
        bot_name: '',
        temperature: Number(cfg?.rapidapiTemperature ?? 0.9),
        top_k: Number(cfg?.rapidapiTopK ?? 10),
        top_p: Number(cfg?.rapidapiTopP ?? 0.9),
        max_tokens: Number(cfg?.rapidapiMaxTokens ?? 200)
      };
    } else if (lowerEndpoint.includes('/conversationllama')) {
      requestBody = {
        messages: [{ role: 'user', content: message }],
        web_access: false
      };
    }

    const resp = await fetchWithTimeout(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost
      },
      body: JSON.stringify(requestBody)
    }, 22000);

    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch (e) {}
      const err = new Error(`RapidAPI HTTP ${resp.status}${details ? `: ${details.slice(0, 120)}` : ''}`);
      err.status = resp.status;
      throw err;
    }

    let rawBody = '';
    try {
      rawBody = await resp.text();
    } catch (e) {
      rawBody = '';
    }

    let data = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (e) {
        data = null;
      }
    }

    if (data && typeof data.intent === 'string') {
      return normalizeOracleResult(data, 'llm_rapidapi_chatbot', sessionKey, context);
    }

    const replyFromData =
      data?.reply ||
      data?.response ||
      data?.output ||
      data?.answer ||
      data?.result ||
      data?.message ||
      data?.data?.response ||
      data?.choices?.[0]?.message?.content ||
      '';

    const replyText = String(replyFromData || rawBody || '').trim();
    const lowerReply = replyText.toLowerCase();
    const genericProviderFallback =
      lowerReply.includes("i'm sorry, right now i'm not able to answer") ||
      lowerReply.includes("i am sorry, right now i'm not able to answer") ||
      lowerReply.includes('not able to answer that question');

    return normalizeOracleResult({
      intent: 'general.chat',
      entities: {},
      confidence: genericProviderFallback ? 0.35 : 0.7,
      reply: genericProviderFallback ? '' : String(replyText || 'Não consegui interpretar a resposta do provedor.'),
      questions: [],
      actions: []
    }, 'llm_rapidapi_chatbot', sessionKey, context);
  }

  async function callRapidApiGeminiPro({ message, memories, apiKey, endpoint, host, model, sessionKey, context }) {
    const apiEndpoint = endpoint || 'https://gemini-pro-ai.p.rapidapi.com/';
    const apiHost = host || 'gemini-pro-ai.p.rapidapi.com';
    const memoryText = (memories || [])
      .map((m, i) => `${i + 1}. ${String(m?.content || '').trim()}`)
      .filter(Boolean)
      .slice(0, 4)
      .join('\n');

    const prompt = [
      'Responda em portugues (pt-BR) de forma objetiva.',
      message,
      memoryText ? `Contexto util:\n${memoryText}` : ''
    ].filter(Boolean).join('\n\n');

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    };

    const resp = await fetchWithTimeout(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost
      },
      body: JSON.stringify(requestBody)
    }, 24000);

    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch (e) {}
      const err = new Error(`RapidAPI Gemini HTTP ${resp.status}${details ? `: ${details.slice(0, 120)}` : ''}`);
      err.status = resp.status;
      throw err;
    }

    let data = null;
    try {
      data = await resp.json();
    } catch (e) {
      data = null;
    }

    const replyText = String(
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.output ||
      data?.reply ||
      data?.response ||
      data?.message ||
      ''
    ).trim();

    if (!replyText) {
      throw new Error('RapidAPI Gemini sem resposta textual');
    }

    return normalizeOracleResult({
      intent: 'general.chat',
      entities: {},
      confidence: 0.8,
      reply: replyText,
      questions: [],
      actions: []
    }, 'llm_rapidapi_gemini_pro', sessionKey, context);
  }

  async function callGoogleGeminiDirect({ message, memories, apiKey, baseUrl, model, sessionKey, context }) {
    const apiBase = String(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const chosenModel = String(model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
    const memoryText = (memories || [])
      .map((m, i) => `${i + 1}. ${String(m?.content || '').trim()}`)
      .filter(Boolean)
      .slice(0, 6)
      .join('\n');

    const prompt = [
      'Responda em portugues (pt-BR) de forma objetiva.',
      message,
      memoryText ? `Contexto util:\n${memoryText}` : ''
    ].filter(Boolean).join('\n\n');

    const modelCandidates = Array.from(new Set([
      chosenModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-flash-latest'
    ].filter(Boolean)));

    let lastErr = null;
    for (const candidateModel of modelCandidates) {
      const endpoint = `${apiBase}/models/${encodeURIComponent(candidateModel)}:generateContent`;
      const resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': String(apiKey || '')
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.35,
            topP: 0.9,
            maxOutputTokens: 900
          }
        })
      }, 26000);

      if (!resp.ok) {
        let details = '';
        try { details = await resp.text(); } catch (e) {}
        let detailText = String(details || '');
        try {
          const parsed = detailText ? JSON.parse(detailText) : null;
          if (parsed?.error?.message) detailText = String(parsed.error.message);
        } catch (e) {}
        detailText = detailText.slice(0, 200);
        const err = new Error(`Google Gemini HTTP ${resp.status}${detailText ? `: ${detailText}` : ''}`);
        err.status = resp.status;
        lastErr = err;

        const modelError = resp.status === 404 || (resp.status === 400 && /(model|not found|unsupported)/i.test(detailText));
        if (modelError) continue;
        throw err;
      }

      let data = null;
      try {
        data = await resp.json();
      } catch (e) {
        data = null;
      }

      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
      const replyText = String(parts.map((p) => String(p?.text || '')).join('\n').trim()).trim();

      if (!replyText) {
        lastErr = new Error('Google Gemini sem resposta textual');
        continue;
      }

      return normalizeOracleResult({
        intent: 'general.chat',
        entities: {},
        confidence: 0.85,
        reply: replyText,
        questions: [],
        actions: []
      }, 'llm_google_gemini', sessionKey, context);
    }

    throw lastErr || new Error('Google Gemini indisponível para os modelos testados');
  }

  async function callGoogleGeminiImageDirect({ message, memories, imageDataUrl, apiKey, baseUrl, model, sessionKey, context }) {
    const apiBase = String(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const chosenModel = String(model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
    const { mimeType, base64Data } = parseImageDataUrlPayload(imageDataUrl);
    const prompt = buildImageAnalysisPrompt(message, memories);
    const imagePartVariants = buildGeminiImagePartVariants(mimeType, base64Data);

    const modelCandidates = Array.from(new Set([
      chosenModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-flash-latest'
    ].filter(Boolean)));

    let lastErr = null;
    for (const candidateModel of modelCandidates) {
      for (let variantIndex = 0; variantIndex < imagePartVariants.length; variantIndex += 1) {
        const endpoint = `${apiBase}/models/${encodeURIComponent(candidateModel)}:generateContent`;
        const imagePart = imagePartVariants[variantIndex];
        const resp = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': String(apiKey || '')
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  imagePart
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              topP: 0.9,
              maxOutputTokens: 1100
            }
          })
        }, 32000);

        if (!resp.ok) {
          let details = '';
          try { details = await resp.text(); } catch (e) {}
          let detailText = String(details || '');
          try {
            const parsed = detailText ? JSON.parse(detailText) : null;
            if (parsed?.error?.message) detailText = String(parsed.error.message);
          } catch (e) {}
          detailText = detailText.slice(0, 220);
          const err = new Error(`Google Gemini image HTTP ${resp.status}${detailText ? `: ${detailText}` : ''}`);
          err.status = resp.status;
          lastErr = err;

          const modelError = resp.status === 404 || (resp.status === 400 && /(model|not found|unsupported)/i.test(detailText));
          if (modelError) break;

          const payloadFieldError = resp.status === 400 && /(inline|mime|unknown field|invalid json)/i.test(detailText);
          if (payloadFieldError && variantIndex + 1 < imagePartVariants.length) continue;
          throw err;
        }

        let data = null;
        try {
          data = await resp.json();
        } catch (e) {
          data = null;
        }
        const replyText = extractGeminiReplyText(data);
        if (!replyText) {
          lastErr = new Error('Google Gemini sem resposta textual para imagem');
          continue;
        }

        return normalizeOracleResult({
          intent: 'image.analysis',
          entities: {},
          confidence: 0.9,
          reply: replyText,
          questions: [],
          actions: []
        }, 'llm_google_gemini_image', sessionKey, context);
      }
    }

    throw lastErr || new Error('Google Gemini indisponivel para analise de imagem');
  }

  async function callRapidApiGeminiProImage({ message, memories, imageDataUrl, apiKey, endpoint, host, model, sessionKey, context }) {
    const apiEndpoint = endpoint || 'https://gemini-pro-ai.p.rapidapi.com/';
    const apiHost = host || 'gemini-pro-ai.p.rapidapi.com';
    const { mimeType, base64Data } = parseImageDataUrlPayload(imageDataUrl);
    const prompt = buildImageAnalysisPrompt(message, memories);
    const imagePartVariants = buildGeminiImagePartVariants(mimeType, base64Data);

    let lastErr = null;
    for (let variantIndex = 0; variantIndex < imagePartVariants.length; variantIndex += 1) {
      const requestBody = {
        model: model || undefined,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              imagePartVariants[variantIndex]
            ]
          }
        ]
      };

      const resp = await fetchWithTimeout(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': apiHost
        },
        body: JSON.stringify(requestBody)
      }, 32000);

      if (!resp.ok) {
        let details = '';
        try { details = await resp.text(); } catch (e) {}
        const detailText = String(details || '').slice(0, 220);
        const err = new Error(`RapidAPI Gemini image HTTP ${resp.status}${detailText ? `: ${detailText}` : ''}`);
        err.status = resp.status;
        lastErr = err;

        const payloadFieldError = resp.status === 400 && /(inline|mime|unknown field|invalid json)/i.test(detailText);
        if (payloadFieldError && variantIndex + 1 < imagePartVariants.length) continue;
        throw err;
      }

      let data = null;
      try {
        data = await resp.json();
      } catch (e) {
        data = null;
      }

      const replyText = String(
        extractGeminiReplyText(data) ||
        data?.output ||
        data?.reply ||
        data?.response ||
        data?.message ||
        ''
      ).trim();

      if (!replyText) {
        lastErr = new Error('RapidAPI Gemini sem resposta textual para imagem');
        continue;
      }

      return normalizeOracleResult({
        intent: 'image.analysis',
        entities: {},
        confidence: 0.82,
        reply: replyText,
        questions: [],
        actions: []
      }, 'llm_rapidapi_gemini_image', sessionKey, context);
    }

    throw lastErr || new Error('RapidAPI Gemini indisponivel para imagem');
  }

  async function analyzeImageWithLLM(imageDataUrl, context = {}, options = {}) {
    const cfg = window.OracleConfig || {};
    const useLLM = options.useLLM ?? cfg.useLLM ?? false;
    const llmProvider = String(options.provider ?? cfg.llmProvider ?? 'server').toLowerCase();
    const llmModel = options.model ?? cfg.llmModel ?? 'gemini-2.5-flash';
    const rapidapiGeminiKey = options.rapidapiGeminiKey ?? cfg.rapidapiGeminiKey ?? cfg.rapidapiKey ?? '';
    const rapidapiGeminiHost = options.rapidapiGeminiHost ?? cfg.rapidapiGeminiHost ?? 'gemini-pro-ai.p.rapidapi.com';
    const rapidapiGeminiEndpoint = options.rapidapiGeminiEndpoint ?? cfg.rapidapiGeminiEndpoint ?? 'https://gemini-pro-ai.p.rapidapi.com/';
    const googleGeminiApiKey = options.googleGeminiApiKey ?? cfg.googleGeminiApiKey ?? '';
    const googleGeminiBaseUrl = options.googleGeminiBaseUrl ?? cfg.googleGeminiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const message = String(options.message || '').trim() || 'Analise a imagem enviada e explique o que significa.';

    let sessionKey = resolveSessionKey(context);
    if (!sessionKey) {
      sessionKey = makeSessionId();
      try { if (context && typeof context === 'object') context.session = sessionKey; } catch (e) {}
    }

    if (isLocalOfflineProvider(llmProvider)) {
      return normalizeOracleResult({
        intent: 'image.analysis',
        entities: {},
        confidence: 0.3,
        reply: 'No modo offline, use o fluxo local do chat para imagem (OCR local). A analise por API externa esta desativada.',
        questions: [],
        actions: []
      }, 'image_local_offline_hint', sessionKey, context);
    }

    if (!useLLM) {
      return normalizeOracleResult({
        intent: 'image.analysis',
        entities: {},
        confidence: 0.05,
        reply: 'Para analisar foto, ative a IA externa nas configuracoes do Oraculo (useLLM=true).',
        questions: [],
        actions: []
      }, 'image_llm_disabled', sessionKey, context);
    }

    let memories = [];
    try {
      memories = await searchMemories(message);
    } catch (e) {
      memories = [];
    }

    const pipeline = [];
    if (llmProvider === 'google_gemini' && googleGeminiApiKey) pipeline.push('google_gemini');
    if (llmProvider === 'rapidapi_gemini_pro' && rapidapiGeminiKey) pipeline.push('rapidapi_gemini_pro');
    if (googleGeminiApiKey && !pipeline.includes('google_gemini')) pipeline.push('google_gemini');
    if (rapidapiGeminiKey && !pipeline.includes('rapidapi_gemini_pro')) pipeline.push('rapidapi_gemini_pro');

    if (pipeline.length === 0) {
      return normalizeOracleResult({
        intent: 'image.analysis',
        entities: {},
        confidence: 0.05,
        reply: 'Nao achei uma chave valida para analise de imagem. Configure googleGeminiApiKey ou rapidapiGeminiKey.',
        questions: [],
        actions: []
      }, 'image_llm_missing_keys', sessionKey, context);
    }

    let lastErr = null;
    for (const provider of pipeline) {
      try {
        if (provider === 'google_gemini') {
          const result = await callGoogleGeminiImageDirect({
            message,
            memories,
            imageDataUrl,
            apiKey: googleGeminiApiKey,
            baseUrl: googleGeminiBaseUrl,
            model: llmModel,
            sessionKey,
            context
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'google_gemini_image',
            model: llmModel
          });
          return result;
        }
        if (provider === 'rapidapi_gemini_pro') {
          const result = await callRapidApiGeminiProImage({
            message,
            memories,
            imageDataUrl,
            apiKey: rapidapiGeminiKey,
            endpoint: rapidapiGeminiEndpoint,
            host: rapidapiGeminiHost,
            model: llmModel,
            sessionKey,
            context
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'rapidapi_gemini_image',
            model: llmModel
          });
          return result;
        }
      } catch (e) {
        lastErr = e;
        window.OracleTelemetry?.log('llm_error', {
          provider,
          msg: String(e?.message || e)
        });
      }
    }

    const detail = String(lastErr?.message || lastErr || 'sem detalhes').slice(0, 180);
    return normalizeOracleResult({
      intent: 'image.analysis',
      entities: {},
      confidence: 0.05,
      reply: `Falha ao analisar imagem com IA externa. Detalhe: ${detail}`,
      questions: [],
      actions: []
    }, 'image_llm_error', sessionKey, context);
  }
  async function getPending(session) {
    try {
      const resp = await fetchWithTimeout(`/api/oracle/pending?session=${encodeURIComponent(session)}`, {}, 12000);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) { return null; }
  }

  async function fillPending(session, answers = []) {
    try {
      const resp = await fetchWithTimeout('/api/oracle/pending/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, answers })
      }, 15000);
      if (!resp.ok) throw new Error('fill failed');
      return await resp.json();
    } catch (e) {
      console.warn('fillPending failed', e);
      return null;
    }
  }

  async function understandWithRAG(message, context = {}, options = {}) {
    const DECISION_THRESHOLD = 0.75;
    const FALLBACK_THRESHOLD = 0.70;

    const cfg = window.OracleConfig || {};
    const useLLM = options.useLLM ?? cfg.useLLM ?? false;
    const forceLLM = !!(options.forceLLM);
    const llmProvider = String(options.provider ?? cfg.llmProvider ?? 'server').toLowerCase();
    const llmModel = options.model ?? cfg.llmModel ?? 'MiniMax-M1';
    const minimaxApiKey = options.minimaxApiKey ?? cfg.minimaxApiKey ?? '';
    const minimaxBaseUrl = options.minimaxBaseUrl ?? cfg.minimaxBaseUrl ?? 'https://api.minimax.io/v1';
    const rapidapiKey = options.rapidapiKey ?? cfg.rapidapiKey ?? '';
    const rapidapiHost = options.rapidapiHost ?? cfg.rapidapiHost ?? 'chatgpt-ai-chat-bot.p.rapidapi.com';
    const rapidapiEndpoint = options.rapidapiEndpoint ?? cfg.rapidapiEndpoint ?? 'https://chatgpt-ai-chat-bot.p.rapidapi.com/ask';
    const rapidapiGeminiKey = options.rapidapiGeminiKey ?? cfg.rapidapiGeminiKey ?? cfg.rapidapiKey ?? '';
    const rapidapiGeminiHost = options.rapidapiGeminiHost ?? cfg.rapidapiGeminiHost ?? 'gemini-pro-ai.p.rapidapi.com';
    const rapidapiGeminiEndpoint = options.rapidapiGeminiEndpoint ?? cfg.rapidapiGeminiEndpoint ?? 'https://gemini-pro-ai.p.rapidapi.com/';
    const googleGeminiApiKey = options.googleGeminiApiKey ?? cfg.googleGeminiApiKey ?? '';
    const googleGeminiBaseUrl = options.googleGeminiBaseUrl ?? cfg.googleGeminiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    let forcedLlmError = null;

    // Ensure we send a session id so server can persist pending slot-fills
    let sessionKey = null;
    if (context) {
      if (typeof context === 'string') sessionKey = context;
      else if (context.session) sessionKey = (typeof context.session === 'string') ? context.session : context.session.id || null;
    }
    if (!sessionKey) {
      sessionKey = makeSessionId();
      try { if (context && typeof context === 'object') context.session = sessionKey; } catch (e) {}
    }

    // 1) NLU local
    let localResult = { intent: 'unknown', confidence: 0.0 };
    try { if (window.OracleNLU && typeof window.OracleNLU.detectIntent === 'function') localResult = window.OracleNLU.detectIntent(message); } catch (e) {}
    if (!forceLLM && localResult && localResult.confidence >= DECISION_THRESHOLD) return { ...localResult, source: 'nlu_local' };

    // 2) Fallback leve
    let fast = { intent: 'desconhecido', confidence: 0.0 };
    try { if (window.OracleBrain && typeof window.OracleBrain.keywordFallback === 'function') fast = window.OracleBrain.keywordFallback(message); } catch (e) {}
    if (!forceLLM && fast && fast.confidence >= FALLBACK_THRESHOLD) return { ...fast, source: 'keyword_fallback' };

    // 3) RAG
    const memories = await searchMemories(message);

    // 4) LLM via endpoint seguro (opcional)
    if (useLLM) {
      try {
        if (isLocalOfflineProvider(llmProvider)) {
          const localOffline = await callLocalOfflineLlm({
            message,
            memories,
            model: llmModel,
            sessionKey,
            context,
            cfg
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'local_offline',
            model: llmModel
          });
          return localOffline;
        }

        if (llmProvider === 'minimax' && minimaxApiKey) {
          const direct = await callMiniMaxDirect({
            message,
            memories,
            model: llmModel,
            apiKey: minimaxApiKey,
            baseUrl: minimaxBaseUrl,
            sessionKey,
            context
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'minimax',
            model: llmModel,
            confidence: direct?.confidence
          });
          return direct;
        }

        if (llmProvider === 'rapidapi_chatbot' && rapidapiKey) {
          const rapid = await callRapidApiChatbot({
            message,
            apiKey: rapidapiKey,
            endpoint: rapidapiEndpoint,
            host: rapidapiHost,
            sessionKey,
            context,
            cfg
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'rapidapi_chatbot',
            endpoint: rapidapiEndpoint
          });
          return rapid;
        }

        if (llmProvider === 'rapidapi_gemini_pro' && rapidapiGeminiKey) {
          const geminiRapid = await callRapidApiGeminiPro({
            message,
            memories,
            apiKey: rapidapiGeminiKey,
            endpoint: rapidapiGeminiEndpoint,
            host: rapidapiGeminiHost,
            model: llmModel,
            sessionKey,
            context
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'rapidapi_gemini_pro',
            endpoint: rapidapiGeminiEndpoint,
            model: llmModel
          });
          return geminiRapid;
        }

        if (llmProvider === 'google_gemini' && googleGeminiApiKey) {
          const googleGemini = await callGoogleGeminiDirect({
            message,
            memories,
            apiKey: googleGeminiApiKey,
            baseUrl: googleGeminiBaseUrl,
            model: llmModel,
            sessionKey,
            context
          });
          window.OracleTelemetry?.log('llm_used', {
            ok: true,
            provider: 'google_gemini',
            endpoint: googleGeminiBaseUrl,
            model: llmModel
          });
          return googleGemini;
        }

        const resp = await fetchWithTimeout('/api/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            memories,
            ctx: context,
            llm: {
              provider: llmProvider,
              model: llmModel
            }
          })
        }, 22000);
        if (resp.ok) {
          const data = await resp.json();
          window.OracleTelemetry?.log('llm_used', { ok: true, intent: data.intent, confidence: data.confidence });
          return normalizeOracleResult(data, `llm_${llmProvider || 'server'}`, sessionKey, context);
        }
        if (forceLLM) {
          return {
            intent: 'desconhecido',
            entities: {},
            confidence: 0.05,
            reply: `⚠️ Falha na IA externa (${llmProvider || 'server'}): HTTP ${resp.status}. Verifique a chave/API.`,
            questions: [],
            actions: [],
            source: 'llm_forced_http_error',
            session: sessionKey
          };
        }
        window.OracleTelemetry?.log('llm_used', { ok: false, status: resp.status, provider: llmProvider });
      } catch (e) {
        console.warn('understandWithRAG LLM falhou:', e);
        window.OracleTelemetry?.log('llm_error', { provider: llmProvider, msg: String(e?.message || e) });
        forcedLlmError = e;
        if (String(e?.code || e?.message || '').includes('ORACLE_FETCH_TIMEOUT')) {
          return fast || localResult || {
            intent: 'desconhecido',
            entities: {},
            confidence: 0.25,
            reply: 'A resposta da IA externa demorou. Continuo funcionando no modo local. âœ…',
            questions: [],
            actions: [],
            source: 'timeout_fallback_local',
            session: sessionKey
          };
        }
        // Se a cota da API externa acabar, mantÃ©m o OrÃ¡culo funcional pelo fallback local.
        if ((llmProvider === 'rapidapi_chatbot' || llmProvider === 'rapidapi_gemini_pro' || llmProvider === 'google_gemini') && (e?.status === 429 || e?.status === 402 || String(e?.message || '').includes('quota'))) {
          return fast || localResult || {
            intent: 'desconhecido',
            entities: {},
            confidence: 0.2,
            reply: 'A IA externa atingiu o limite agora. O OrÃ¡culo continua funcionando no modo local. âœ…',
            questions: [],
            actions: [],
            source: 'quota_fallback_local',
            session: sessionKey
          };
        }
      }
    }

    if (useLLM && forceLLM) {
      const detail = String(forcedLlmError?.message || forcedLlmError || 'sem detalhes').slice(0, 180);
      const offlineMode = isLocalOfflineProvider(llmProvider);
      const reply = offlineMode
        ? `⚠️ Não foi possível usar o motor local offline. Verifique se o plugin nativo do LLM está instalado no APK e se o modelo GGUF foi carregado. Detalhe: ${detail}`
        : `⚠️ Não foi possível usar a IA externa (${llmProvider || 'server'}). Verifique a key/API. Detalhe: ${detail}`;
      return {
        intent: 'desconhecido',
        entities: {},
        confidence: 0.05,
        reply,
        questions: [],
        actions: [],
        source: 'llm_forced_error',
        session: sessionKey
      };
    }

    // fallback final
    return fast || localResult || { intent: 'desconhecido', entities: {}, confidence: 0.2, reply: 'NÃ£o entendi. Quer criar tarefa, finanÃ§as, XP ou status?', questions: [], actions: [], source: 'fallback_final', session: sessionKey };
  }

  window.OracleClient = {
    understandWithRAG,
    analyzeImageWithLLM,
    searchMemories,
    isLocalOfflineProvider,
    getPending,
    fillPending
  };

})();

