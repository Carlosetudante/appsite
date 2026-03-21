// ===========================================
// SUPABASE - CONFIGURAÃ‡ÃƒO E SERVIÃ‡OS
// ===========================================
// 
// COMO CONFIGURAR:
// 1. Crie uma conta em https://supabaseClient.com
// 2. Crie um novo projeto
// 3. VÃ¡ em Project Settings > API
// 4. Copie a "Project URL" e a "anon public" key
// 5. Cole abaixo nas variÃ¡veis SUPABASE_URL e SUPABASE_ANON_KEY
//
// ===========================================

// âš ï¸ CONFIGURE AQUI COM SUAS CREDENCIAIS DO SUPABASE âš ï¸
const SUPABASE_URL = 'https://tufcnxbveupoqrgdabfg.supabase.co';
// NÃ£o deixe chaves embutidas em arquivos versionados.
// Use a Anon Key pÃºblica aqui â€” NÃƒO a Service Role Key.
// Substitua por sua Anon Key ou injete via processo de build / variÃ¡vel de ambiente.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZmNueGJ2ZXVwb3FyZ2RhYmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NzE2NzcsImV4cCI6MjA4NTA0NzY3N30.gYn4KDSBjuzt0yYo8_ha4W3AJnvwP_xSwblmL0wvG_4';

// ImportaÃ§Ã£o do Supabase Client (via CDN)
// Adicionado no index.html: <script src="https://unpkg.com/@supabase/supabase-js@2"></script>

let supabaseClient = null;
let currentUser = null;

// Inicializa o cliente Supabase
function initSupabase() {
  console.log('Iniciando supabaseClient...');
  
  // Verifica se o objeto supabase estÃ¡ disponÃ­vel globalmente
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('âœ… Supabase inicializado com sucesso!');
    console.log('URL Supabase:', SUPABASE_URL);
    
    // Teste de conexÃ£o
    testConnection();
    
    return true;
  } else {
    console.error('âŒ Supabase JS NÃƒO carregado!');
    console.error('Verifique se o script estÃ¡ no index.html:');
    console.error('<script src="https://unpkg.com/@supabase/supabase-js@2"></script>');
    console.log('window.supabase =', typeof window.supabase);
    return false;
  }
}

// Testa a conexÃ£o com o Supabase
async function testConnection() {
  try {
    const { data, error } = await supabaseClient.from('profiles').select('count').limit(1);
    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.error('âŒ TABELAS NÃƒO CRIADAS! Execute o database-schema.sql no supabaseClient.');
        console.error('Abra: Supabase Dashboard > SQL Editor > New Query > Cole o conteúdo de database-schema.sql');
      } else {
        console.warn('âš ï¸ Erro ao testar conexÃ£o:', error.message);
      }
    } else {
      console.log('âœ… ConexÃ£o com Supabase OK - Tabelas existem');
    }
  } catch (e) {
    console.error('âŒ Erro de conexÃ£o:', e);
  }
}

// Verifica se estÃ¡ configurado corretamente
function isSupabaseConfigured() {
  return SUPABASE_URL !== 'https://SEU-PROJETO.supabase.co' && 
         SUPABASE_ANON_KEY !== 'SUA-ANON-KEY-AQUI' &&
         supabaseClient !== null;
}

// ===========================================
// AUTENTICAÃ‡ÃƒO
// ===========================================

function normalizeAuthEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const SUPABASE_ADMIN_HANDLES = Object.freeze([
  'carlos',
  'carlos.eduardoymail.com@gmail.com',
  'carlos.eduardoymail.com'
]);

function normalizeAdminIdentity(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@+/, '');
}

function matchesAdminIdentity(candidateRaw = '', adminRaw = '') {
  const candidate = normalizeAdminIdentity(candidateRaw);
  const admin = normalizeAdminIdentity(adminRaw);
  if (!candidate || !admin) return false;

  const localPart = candidate.includes('@') ? candidate.split('@')[0] : candidate;
  return (
    candidate === admin ||
    localPart === admin ||
    candidate.startsWith(`${admin}@`) ||
    localPart.startsWith(`${admin}.`) ||
    localPart.startsWith(`${admin}_`) ||
    localPart.startsWith(`${admin}-`)
  );
}

function isCurrentUserAdmin() {
  const candidates = [];
  if (currentUser && currentUser.email) candidates.push(currentUser.email);
  try {
    candidates.push(localStorage.getItem('ur_session'));
  } catch (e) {}
  let isAllowed = candidates.some((candidate) => SUPABASE_ADMIN_HANDLES.some((admin) => matchesAdminIdentity(candidate, admin)));
  if (!isAllowed) {
    try {
      const appAdminCheck = globalThis && typeof globalThis.isAdminControlUser === 'function'
        ? globalThis.isAdminControlUser
        : null;
      if (appAdminCheck) {
        const state = (globalThis && typeof globalThis.gameState !== 'undefined') ? globalThis.gameState : undefined;
        isAllowed = !!appAdminCheck(state);
      }
    } catch (e) {}
  }
  return isAllowed;
}

// Registrar novo usuÃ¡rio
async function supabaseSignUp(email, password, characterData) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase nÃ£o configurado. Configure as credenciais em supabaseClient.js');
  }

  const safeEmail = normalizeAuthEmail(email);
  if (!safeEmail || !safeEmail.includes('@')) {
    throw new Error('Email inválido para cadastro.');
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email: safeEmail,
    password,
    options: {
      data: {
        character_name: characterData.name,
        character_class: characterData.race
      }
    }
  });

  if (error) throw error;

  // Cria o perfil inicial
  if (data.user) {
    try {
      await createProfile(data.user.id, characterData);
    } catch (profileError) {
      // Não bloqueia o cadastro: o perfil pode ser criado no primeiro login confirmado.
      console.warn('⚠️ Conta criada, mas perfil ainda não foi criado:', profileError?.message || profileError);
    }
  }

  return data;
}

// Login
async function supabaseSignIn(email, password) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase nÃ£o configurado. Configure as credenciais em supabaseClient.js');
  }

  const safeEmail = normalizeAuthEmail(email);
  if (!safeEmail || !safeEmail.includes('@')) {
    throw new Error('Email inválido para login.');
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: safeEmail,
    password
  });

  if (error) throw error;

  currentUser = data.user;
  return data;
}

// Recuperação de senha via e-mail (Supabase Auth)
async function supabaseResetPassword(email, redirectTo = null) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase nÃ£o configurado. Configure as credenciais em supabaseClient.js');
  }
  const safeEmail = normalizeAuthEmail(email);
  if (!safeEmail) throw new Error('Email inválido para recuperação de senha.');

  const options = {};
  if (redirectTo) options.redirectTo = String(redirectTo);
  const { data, error } = await supabaseClient.auth.resetPasswordForEmail(safeEmail, options);
  if (error) throw error;
  return data;
}

// Logout
async function supabaseSignOut() {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;

  currentUser = null;
}

// Verifica sessÃ£o atual
async function supabaseGetSession() {
  if (!isSupabaseConfigured()) return null;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
  }
  return session;
}

// Listener de mudanÃ§a de auth
function onAuthStateChange(callback) {
  if (!isSupabaseConfigured()) return;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    callback(event, session);
  });
}

// ===========================================
// PERFIL DO USUÃRIO
// ===========================================

async function createProfile(userId, characterData) {
  const { error } = await supabaseClient.from('profiles').insert({
    id: userId,
    character_name: characterData.name,
    character_class: characterData.race,
    title: characterData.title || 'Viajante',
    aura_color: characterData.auraColor || '#ffdd57',
    level: 1,
    xp: 0,
    streak: 0,
    skill_points: 0,
    attributes: characterData.attributes || {},
    achievements: [],
    inventory: [],
    last_claim: null,
    play_time: 0
  });

  if (error) throw error;
}

async function getProfile() {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  // Se nÃ£o encontrou perfil, retorna null (serÃ¡ criado depois)
  if (error && error.code === 'PGRST116') {
    console.log('âš ï¸ Perfil nÃ£o encontrado, serÃ¡ criado automaticamente');
    return null;
  }
  if (error) throw error;
  return data;
}

// Garante que o perfil existe, criando se necessÃ¡rio
async function ensureProfileExists(characterData = {}) {
  if (!currentUser) return null;

  // Tenta buscar perfil existente
  const { data: existing } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', currentUser.id)
    .single();

  if (existing) {
    console.log('âœ… Perfil jÃ¡ existe');
    return existing;
  }

  // Cria perfil se nÃ£o existir
  console.log('Criando perfil automaticamente...');
  const { data, error } = await supabaseClient
    .from('profiles')
    .insert({
      id: currentUser.id,
      character_name: characterData.name || currentUser.email?.split('@')[0] || 'HerÃ³i',
      character_class: characterData.race || 'Equilibrado',
      title: characterData.title || 'Viajante',
      aura_color: characterData.auraColor || '#ffdd57',
      level: 1,
      xp: 0,
      streak: 0,
      skill_points: 0,
      attributes: {},
      achievements: [],
      inventory: [],
      last_claim: null,
      play_time: 0
    })
    .select()
    .single();

  if (error) {
    console.error('âŒ Erro ao criar perfil:', error);
    throw error;
  }
  
  console.log('âœ… Perfil criado com sucesso!');
  return data;
}

async function updateProfile(updates) {
  console.log('updateProfile chamado, currentUser:', currentUser?.id);
  if (!currentUser) {
    console.error('âŒ updateProfile: currentUser Ã© null');
    return;
  }

  // Garante que o perfil existe antes de atualizar
  await ensureProfileExists(updates);

  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentUser.id)
    .select();

  if (error) {
    console.error('âŒ Erro ao atualizar perfil:', error);
    throw error;
  }
  
  console.log('âœ… Perfil atualizado:', data);
}

function normalizeProfileInventory(rawInventory) {
  if (!rawInventory || typeof rawInventory !== 'object' || Array.isArray(rawInventory)) return {};
  return { ...rawInventory };
}

function buildRankSnapshotFromLocalData(localData = {}) {
  const safe = localData && typeof localData === 'object' ? localData : {};
  const level = Math.max(1, Math.min(9999, Number(safe.level || 1) || 1));
  const xp = Math.max(0, Math.floor(Number(safe.xp || 0) || 0));
  const streak = Math.max(0, Math.floor(Number(safe.streak || 0) || 0));
  const achievementsCount = Math.max(0, Math.floor(Array.isArray(safe.achievements) ? safe.achievements.length : Number(safe.achievementsCount || 0) || 0));
  const trophiesCount = Math.max(0, Math.floor(Array.isArray(safe.trophies) ? safe.trophies.length : Number(safe.trophiesCount || 0) || 0));
  const coins = Math.max(0, Math.floor(Number(safe.coins || 0) || 0));
  const arenaProgress = (safe.arenaProgress && typeof safe.arenaProgress === 'object' && !Array.isArray(safe.arenaProgress))
    ? safe.arenaProgress
    : {};

  const explicitPowerRaw = Number(safe.powerScore ?? safe.heroPowerScore ?? safe.arenaPowerScore ?? arenaProgress.powerScore ?? 0);
  const powerScore = Number.isFinite(explicitPowerRaw) && explicitPowerRaw > 0
    ? Math.max(0, Math.round(explicitPowerRaw))
    : Math.max(0, Math.round((level * 24) + (xp * 0.12) + (achievementsCount * 38) + (trophiesCount * 52) + (streak * 8)));

  const explicitArenaScoreRaw = Number(safe.arenaScore ?? arenaProgress.score ?? arenaProgress.arenaScore ?? 0);
  const arenaScore = Number.isFinite(explicitArenaScoreRaw) && explicitArenaScoreRaw > 0
    ? Math.max(0, Math.round(explicitArenaScoreRaw))
    : Math.max(0, Math.round((level * 28) + (powerScore * 0.75) + (achievementsCount * 34) + (trophiesCount * 46)));

  const explicitRankingRaw = Number(safe.rankingScore ?? safe.rankScore ?? arenaProgress.rankingScore ?? 0);
  const rankingScore = Number.isFinite(explicitRankingRaw)
    ? Math.max(0, Math.round(explicitRankingRaw))
    : Math.max(0, Math.round(
      (level * 520) +
      (powerScore * 0.86) +
      (arenaScore * 0.74) +
      (achievementsCount * 140) +
      (trophiesCount * 175) +
      (streak * 12) +
      (coins * 0.012)
    ));

  return {
    level,
    xp,
    streak,
    coins,
    powerScore,
    arenaScore,
    achievementsCount,
    trophiesCount,
    rankingScore,
    updatedAt: new Date().toISOString()
  };
}

function normalizeAdminCoinValue(value) {
  return Math.max(0, Math.min(999999999, Math.floor(Number(value) || 0)));
}

function normalizeAdminIsoDateInput(value) {
  if (value === null || value === undefined || value === '') return null;
  const safe = String(value || '').trim();
  if (!safe) return null;
  const parsed = new Date(safe);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Data inválida para atualização.');
  }
  return parsed.toISOString();
}

function areIsoDatesEquivalent(a, b) {
  const aMs = Number.isFinite(Date.parse(String(a || '').trim())) ? Date.parse(String(a || '').trim()) : 0;
  const bMs = Number.isFinite(Date.parse(String(b || '').trim())) ? Date.parse(String(b || '').trim()) : 0;
  if (!aMs && !bMs) return true;
  return aMs === bMs;
}

function validateAdminUpdatedProfileData(data, updates = {}) {
  const safe = data && typeof data === 'object' ? data : null;
  if (!safe) throw new Error('Resposta inválida ao atualizar usuário.');
  const inv = normalizeProfileInventory(safe.inventory);

  if (updates.name !== undefined) {
    const expected = String(updates.name || '').trim();
    const actual = String(safe.character_name || '').trim();
    if (expected && actual !== expected) {
      throw new Error('A nuvem recusou atualizar o nome do usuário (RLS/permissão).');
    }
  }
  if (updates.title !== undefined) {
    const expected = String(updates.title || '').trim();
    const actual = String(safe.title || '').trim();
    if (actual !== expected) {
      throw new Error('A nuvem recusou atualizar o título do usuário (RLS/permissão).');
    }
  }
  if (updates.level !== undefined) {
    const expected = Math.max(1, Math.min(9999, Math.floor(Number(updates.level) || 1)));
    const actual = Math.max(1, Math.floor(Number(safe.level) || 1));
    if (actual !== expected) {
      throw new Error('A nuvem recusou atualizar o nível do usuário (RLS/permissão).');
    }
  }
  if (updates.coins !== undefined) {
    const expected = normalizeAdminCoinValue(updates.coins);
    const actual = normalizeAdminCoinValue(inv.coins);
    if (actual !== expected) {
      throw new Error('A nuvem recusou atualizar moedas do usuário (RLS/permissão).');
    }
  }
  if (updates.relationshipStart !== undefined) {
    const expected = normalizeAdminIsoDateInput(updates.relationshipStart);
    const actual = safe.relationship_start || null;
    if (!areIsoDatesEquivalent(actual, expected)) {
      throw new Error('A nuvem recusou atualizar a data de namoro (RLS/permissão).');
    }
  }
}

async function adminListUsers(options = {}) {
  if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
  if (!currentUser) throw new Error('Faça login para usar o painel admin.');
  if (!isCurrentUserAdmin()) throw new Error('Acesso permitido apenas para admin.');

  const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(options.limit || 1000) || 1000)));
  const pageSize = Math.max(50, Math.min(500, Number(options.pageSize || 400) || 400));
  const search = String(options.search || '').trim();
  const sanitizedSearch = search.replace(/[(),]/g, ' ').trim();
  const rows = [];
  const seen = new Set();
  let offset = 0;

  while (rows.length < safeLimit) {
    const end = offset + pageSize - 1;
    let query = supabaseClient
      .from('profiles')
      .select('id, character_name, title, level, xp, relationship_start, inventory, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, end);

    if (sanitizedSearch) {
      query = query.or(`character_name.ilike.%${sanitizedSearch}%,title.ilike.%${sanitizedSearch}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    if (!batch.length) break;

    for (const item of batch) {
      const id = String(item?.id || '').trim();
      if (!id || seen.has(id)) continue;
      const inventory = normalizeProfileInventory(item?.inventory);
      if (inventory.adminDisabled === true || inventory.adminDeleted === true) continue;
      seen.add(id);
      rows.push(item);
      if (rows.length >= safeLimit) break;
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function listRankProfiles(options = {}) {
  if (!isSupabaseConfigured()) return [];
  if (!currentUser) return [];

  const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(options.limit || 1200) || 1200)));
  const pageSize = Math.max(60, Math.min(500, Number(options.pageSize || 300) || 300));

  // 1) Tenta RPC público de ranking (ideal para contornar RLS de profiles com segurança).
  const rpcCandidates = [
    { fn: 'list_rank_profiles', args: { p_limit: safeLimit } },
    { fn: 'list_rank_profiles', args: { limit_count: safeLimit } },
    { fn: 'list_rank_profiles', args: { limit: safeLimit } },
    { fn: 'list_rank_profiles', args: {} },
    { fn: 'get_rank_profiles', args: { p_limit: safeLimit } },
    { fn: 'get_public_rank_profiles', args: { p_limit: safeLimit } }
  ];
  for (const candidate of rpcCandidates) {
    const fn = String(candidate?.fn || '').trim();
    if (!fn) continue;
    const args = candidate?.args && typeof candidate.args === 'object' ? candidate.args : {};
    const { data, error } = await supabaseClient.rpc(fn, args);
    if (!error) {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.rows)) return data.rows;
      return [];
    }
    if (isRpcMissingFunctionError(error)) continue;
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === '42501') {
      // Sem permissão no RPC: cai para fallback local sem quebrar o app.
      break;
    }
  }

  // 2) Fallback para leitura direta da tabela profiles (depende de policy da nuvem).
  const rows = [];
  const seen = new Set();
  let offset = 0;

  while (rows.length < safeLimit) {
    const end = offset + pageSize - 1;
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, character_name, title, level, xp, streak, achievements, inventory, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, end);

    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    if (!batch.length) break;

    for (const item of batch) {
      const id = String(item?.id || '').trim();
      if (!id || seen.has(id)) continue;
      const inventory = normalizeProfileInventory(item?.inventory);
      if (inventory.adminDisabled === true || inventory.adminDeleted === true) continue;
      seen.add(id);
      rows.push(item);
      if (rows.length >= safeLimit) break;
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function adminUpdateUser(userId, updates = {}) {
  if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
  if (!currentUser) throw new Error('Faça login para usar o painel admin.');
  if (!isCurrentUserAdmin()) throw new Error('Acesso permitido apenas para admin.');

  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('Usuário inválido para atualização.');

  let profile = null;
  let profileError = null;
  {
    const result = await supabaseClient
      .from('profiles')
      .select('id, character_name, title, level, relationship_start, inventory')
      .eq('id', safeUserId)
      .maybeSingle();
    profile = result?.data || null;
    profileError = result?.error || null;
  }

  const payload = {};
  if (typeof updates.name === 'string') {
    const safeName = String(updates.name || '').trim().slice(0, 50);
    if (!safeName) throw new Error('Nome inválido.');
    payload.character_name = safeName;
  }
  if (typeof updates.title === 'string') {
    payload.title = String(updates.title || '').trim().slice(0, 60);
  }
  if (updates.level !== undefined) {
    payload.level = Math.max(1, Math.min(9999, Math.floor(Number(updates.level) || 1)));
  }

  if (updates.relationshipStart !== undefined) {
    payload.relationship_start = normalizeAdminIsoDateInput(updates.relationshipStart);
  }

  const shouldUpdateInventory = (
    updates.coins !== undefined ||
    updates.nofapStartAt !== undefined ||
    updates.nofapLastResetAt !== undefined ||
    updates.nofapShareInChat !== undefined ||
    updates.nofapBestDays !== undefined
  );
  if (shouldUpdateInventory) {
    const inventory = normalizeProfileInventory(profile?.inventory);
    if (updates.coins !== undefined) {
      inventory.coins = normalizeAdminCoinValue(updates.coins);
    }
    if (updates.nofapStartAt !== undefined) {
      inventory.nofapStartAt = normalizeAdminIsoDateInput(updates.nofapStartAt);
    }
    if (updates.nofapLastResetAt !== undefined) {
      inventory.nofapLastResetAt = normalizeAdminIsoDateInput(updates.nofapLastResetAt);
    }
    if (updates.nofapShareInChat !== undefined) {
      inventory.nofapShareInChat = !!updates.nofapShareInChat;
    }
    if (updates.nofapBestDays !== undefined) {
      inventory.nofapBestDays = Math.max(0, Math.floor(Number(updates.nofapBestDays) || 0));
    }
    payload.inventory = inventory;
  }

  if (!Object.keys(payload).length) {
    return profile || { id: safeUserId };
  }

  const profileSelectCols = 'id, character_name, title, level, xp, relationship_start, inventory, updated_at';
  const { error: updateError, count: updatedCountRaw } = await supabaseClient
    .from('profiles')
    .update(payload, { count: 'exact' })
    .eq('id', safeUserId);

  const updatedCount = Math.max(0, Number(updatedCountRaw || 0) || 0);
  if (!updateError && updatedCount > 0) {
    const { data: refreshedAfterUpdate, error: refreshAfterUpdateError } = await supabaseClient
      .from('profiles')
      .select(profileSelectCols)
      .eq('id', safeUserId)
      .maybeSingle();

    if (!refreshAfterUpdateError && refreshedAfterUpdate) {
      validateAdminUpdatedProfileData(refreshedAfterUpdate, updates);
      return refreshedAfterUpdate;
    }

    const optimistic = {
      id: safeUserId,
      character_name: payload.character_name !== undefined ? payload.character_name : (profile?.character_name || ''),
      title: payload.title !== undefined ? payload.title : (profile?.title || ''),
      level: payload.level !== undefined ? payload.level : Math.max(1, Math.floor(Number(profile?.level || 1) || 1)),
      xp: Math.max(0, Number(profile?.xp || 0) || 0),
      relationship_start: payload.relationship_start !== undefined ? payload.relationship_start : (profile?.relationship_start || null),
      inventory: payload.inventory !== undefined ? payload.inventory : normalizeProfileInventory(profile?.inventory),
      updated_at: new Date().toISOString()
    };
    validateAdminUpdatedProfileData(optimistic, updates);
    return optimistic;
  }

  const rpcPatch = {
    character_name: payload.character_name !== undefined ? payload.character_name : null,
    title: payload.title !== undefined ? payload.title : null,
    level: payload.level !== undefined ? payload.level : null,
    relationship_start: payload.relationship_start !== undefined ? payload.relationship_start : null,
    inventory: payload.inventory !== undefined ? payload.inventory : null
  };

  const rpcResult = await callAdminRpcWithFallback([
    {
      fn: 'admin_update_user_profile',
      args: {
        p_user_id: safeUserId,
        p_character_name: rpcPatch.character_name,
        p_title: rpcPatch.title,
        p_level: rpcPatch.level,
        p_relationship_start: rpcPatch.relationship_start,
        p_inventory: rpcPatch.inventory
      }
    },
    {
      fn: 'admin_update_user',
      args: {
        p_user_id: safeUserId,
        p_updates: rpcPatch
      }
    },
    {
      fn: 'admin_patch_profile',
      args: {
        p_user_id: safeUserId,
        p_patch: rpcPatch
      }
    },
    {
      fn: 'admin_set_profile_data',
      args: {
        p_user_id: safeUserId,
        p_data: rpcPatch
      }
    },
    {
      fn: 'admin_update_profile_json',
      args: {
        user_id: safeUserId,
        patch: rpcPatch
      }
    }
  ]);

  if (rpcResult.ok) {
    const { data: refreshed, error: refreshError } = await supabaseClient
      .from('profiles')
      .select(profileSelectCols)
      .eq('id', safeUserId)
      .single();
    if (!refreshError && refreshed) {
      validateAdminUpdatedProfileData(refreshed, updates);
      return refreshed;
    }
    if (rpcResult.data && typeof rpcResult.data === 'object') return rpcResult.data;
    return { id: safeUserId, ...rpcPatch };
  }

  const rawProfileError = String(profileError?.message || '').trim();
  const rawUpdateError = String(updateError?.message || '').trim();
  const updateCountHint = (!updateError && updatedCount === 0)
    ? 'Nenhuma linha foi atualizada (sem permissão admin na tabela profiles para esse usuário).'
    : '';
  const updateDetail = [rawUpdateError, updateCountHint].filter(Boolean).join(' ');
  const detail = updateDetail || rawProfileError;
  throw new Error(detail
    ? `Não foi possível atualizar usuário na nuvem: ${detail}`
    : 'Não foi possível atualizar usuário na nuvem. Verifique permissões admin (RLS) ou configure RPC admin.');
}

function isRpcMissingFunctionError(error) {
  if (!error) return false;
  const code = String(error.code || '').trim().toUpperCase();
  if (code === '42883' || code === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('could not find the function')
  );
}

function isTableNotFoundError(error) {
  if (!error) return false;
  const code = String(error.code || '').trim().toUpperCase();
  if (code === '42P01' || code === 'PGRST205') return true;
  const message = String(error.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

function isPermissionDeniedError(error) {
  if (!error) return false;
  const code = String(error.code || '').trim().toUpperCase();
  if (code === '42501') return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('rls') ||
    message.includes('not allowed')
  );
}

async function callAdminRpcWithFallback(candidates = []) {
  const list = Array.isArray(candidates) ? candidates : [];
  let lastError = null;
  for (const candidate of list) {
    const fn = String(candidate?.fn || '').trim();
    if (!fn) continue;
    const args = candidate && typeof candidate.args === 'object' ? candidate.args : {};
    const { data, error } = await supabaseClient.rpc(fn, args);
    if (!error) {
      return { ok: true, fn, data };
    }
    lastError = error;
    if (isRpcMissingFunctionError(error)) continue;
    return { ok: false, fn, error };
  }
  return { ok: false, error: lastError || new Error('RPC admin indisponível.') };
}

async function adminSetUserPassword(userId, newPassword) {
  if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
  if (!currentUser) throw new Error('Faça login para usar o painel admin.');
  if (!isCurrentUserAdmin()) throw new Error('Acesso permitido apenas para admin.');

  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('Usuário inválido para alterar senha.');

  const safePassword = String(newPassword || '').trim();
  if (safePassword.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');

  const rpcResult = await callAdminRpcWithFallback([
    { fn: 'admin_set_user_password', args: { p_user_id: safeUserId, p_new_password: safePassword } },
    { fn: 'admin_update_user_password', args: { p_user_id: safeUserId, p_new_password: safePassword } },
    { fn: 'admin_update_auth_password', args: { p_user_id: safeUserId, p_new_password: safePassword } },
    { fn: 'admin_set_password', args: { user_id: safeUserId, new_password: safePassword } }
  ]);

  if (!rpcResult.ok) {
    throw new Error('Não foi possível alterar a senha na nuvem. Configure a função RPC admin_set_user_password no Supabase.');
  }

  return {
    updated: true,
    mode: 'rpc',
    fn: rpcResult.fn || ''
  };
}

async function adminDeleteUser(userId, options = {}) {
  if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
  if (!currentUser) throw new Error('Faça login para usar o painel admin.');
  if (!isCurrentUserAdmin()) throw new Error('Acesso permitido apenas para admin.');

  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('Usuário inválido para remoção.');
  if (safeUserId === String(currentUser.id || '').trim()) {
    throw new Error('Não é permitido remover a própria conta admin.');
  }

  const hardDelete = options && options.hardDelete === true;
  const rpcResult = await callAdminRpcWithFallback([
    { fn: 'admin_delete_user', args: { p_user_id: safeUserId, p_hard_delete: hardDelete } },
    { fn: 'admin_remove_user', args: { p_user_id: safeUserId, p_hard_delete: hardDelete } },
    { fn: 'admin_delete_auth_user', args: { p_user_id: safeUserId } }
  ]);
  if (rpcResult.ok) {
    return { removed: true, mode: 'rpc', fn: rpcResult.fn || '' };
  }

  const userScopedTables = [
    'tasks',
    'finance_transactions',
    'work_sessions',
    'xp_events',
    'bible_notes',
    'oracle_messages',
    'oracle_memory'
  ];

  let hadPermissionRestriction = false;

  for (const table of userScopedTables) {
    const { error } = await supabaseClient.from(table).delete().eq('user_id', safeUserId);
    if (error && !isTableNotFoundError(error)) {
      if (isPermissionDeniedError(error)) {
        hadPermissionRestriction = true;
        continue;
      }
      throw error;
    }
  }

  const { error: profileError } = await supabaseClient
    .from('profiles')
    .delete()
    .eq('id', safeUserId);
  if (!profileError) {
    return { removed: true, mode: hadPermissionRestriction ? 'profile_only_partial' : 'profile_only' };
  }
  if (isPermissionDeniedError(profileError)) {
    hadPermissionRestriction = true;
  } else if (isTableNotFoundError(profileError)) {
    return { removed: true, mode: 'already_missing' };
  }

  // Fallback final: desativação lógica do perfil quando não existe permissão de DELETE.
  try {
    const softResult = await adminSoftDeleteUser(safeUserId, {
      reason: String(options?.reason || 'removed_by_admin').trim() || 'removed_by_admin'
    });
    if (softResult && softResult.removed === true) {
      return softResult;
    }
  } catch (softError) {
    if (!hadPermissionRestriction) throw softError;
  }

  if (hadPermissionRestriction) {
    throw new Error('Sem permissão de admin na nuvem para remover este usuário (RLS/RPC).');
  }
  throw profileError;
}

async function adminSoftDeleteUser(userId, options = {}) {
  if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
  if (!currentUser) throw new Error('Faça login para usar o painel admin.');
  if (!isCurrentUserAdmin()) throw new Error('Acesso permitido apenas para admin.');

  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('Usuário inválido para desativação.');
  if (safeUserId === String(currentUser.id || '').trim()) {
    throw new Error('Não é permitido desativar a própria conta admin.');
  }

  const { data: profile, error: profileReadError } = await supabaseClient
    .from('profiles')
    .select('id, inventory')
    .eq('id', safeUserId)
    .maybeSingle();
  if (profileReadError && !isPermissionDeniedError(profileReadError)) throw profileReadError;
  if (!profileReadError && (!profile || !profile.id)) {
    return { removed: true, mode: 'already_missing' };
  }

  const inventory = normalizeProfileInventory(profile?.inventory);
  inventory.adminDisabled = true;
  inventory.adminDisabledAt = new Date().toISOString();
  inventory.adminDisabledBy = String(currentUser.id || '').trim();
  inventory.adminDisabledReason = String(options?.reason || 'removed_by_admin').trim().slice(0, 60) || 'removed_by_admin';

  const { error: updateError, count: updatedCountRaw } = await supabaseClient
    .from('profiles')
    .update({ inventory }, { count: 'exact' })
    .eq('id', safeUserId);
  if (updateError) throw updateError;
  const updatedCount = Math.max(0, Number(updatedCountRaw || 0) || 0);
  if (updatedCount <= 0) {
    if (isPermissionDeniedError(profileReadError)) {
      throw new Error('Sem permissão para desativar este usuário na nuvem.');
    }
    return { removed: true, mode: 'already_missing' };
  }

  return { removed: true, mode: 'soft_disable' };
}

// ===========================================
// TAREFAS (TASKS)
// ===========================================

async function getTasks() {
  if (!currentUser) return [];

  const { data, error } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function addTask(task) {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('tasks')
    .insert({
      user_id: currentUser.id,
      title: task.title,
      status: task.status || 'pending',
      xp_reward: task.xpReward || 10,
      due_date: task.dueDate || null,
      category: task.category || 'geral'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateTask(taskId, updates) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

async function deleteTask(taskId) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

// ===========================================
// FINANÃ‡AS (FINANCE TRANSACTIONS)
// ===========================================

async function getFinances(filters = {}) {
  if (!currentUser) return [];

  let query = supabaseClient
    .from('finance_transactions')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

async function addFinance(transaction) {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('finance_transactions')
    .insert({
      user_id: currentUser.id,
      type: transaction.type, // 'income' ou 'expense'
      category: transaction.category,
      amount: transaction.amount,
      description: transaction.description || ''
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ===========================================
// ORACLE / BIBLIA - helpers para conversas e memÃ³ria
// ===========================================
async function saveOracleChatMessage(role, content, meta = {}) {
  if (!isSupabaseConfigured() || !currentUser) return null;

  const { data, error } = await supabaseClient
    .from('oracle_messages')
    .insert({ user_id: currentUser.id, role, content, meta })
    .select()
    .single();

  if (error) {
    console.error('âŒ Erro ao salvar oracle message:', error);
    return null;
  }
  return data;
}

async function addOracleMemory(title, fact, tags = [], importance = 5) {
  if (!isSupabaseConfigured() || !currentUser) return null;

  const { data, error } = await supabaseClient
    .from('oracle_memory')
    .insert({ user_id: currentUser.id, title, fact, tags, importance })
    .select()
    .single();

  if (error) {
    console.error('âŒ Erro ao salvar oracle memory:', error);
    return null;
  }
  return data;
}

async function searchOracleMemory(query) {
  if (!isSupabaseConfigured() || !currentUser) return [];

  // busca por tÃ­tulo, tags ou texto do fato (fuzzy simples via ilike)
  const { data, error } = await supabaseClient
    .from('oracle_memory')
    .select('*')
    .or(`title.ilike.%${query}%,fact.ilike.%${query}%`) // simple OR
    .eq('user_id', currentUser.id)
    .order('importance', { ascending: false })
    .limit(20);

  if (error) {
    console.error('âŒ Erro ao consultar oracle memory:', error);
    return [];
  }
  return data || [];
}

async function deleteFinance(transactionId) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from('finance_transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

// ===========================================
// SESSÃ•ES DE TRABALHO (WORK SESSIONS)
// ===========================================

async function getWorkSessions(filters = {}) {
  if (!currentUser) return [];

  let query = supabaseClient
    .from('work_sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('start_at', { ascending: false });

  if (filters.startDate) {
    query = query.gte('start_at', filters.startDate);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

async function addWorkSession(session) {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('work_sessions')
    .insert({
      user_id: currentUser.id,
      start_at: session.startAt || session.date || new Date().toISOString(),
      end_at: session.endAt || null,
      total_seconds: session.totalSeconds || Math.floor((session.duration || 0) / 1000),
      activity_type: session.activityType || session.type || 'work',
      notes: session.notes || JSON.stringify({
        inputVal: session.inputVal,
        financialVal: session.financialVal,
        isUnpaid: session.isUnpaid,
        week: session.week
      })
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteWorkSession(sessionId) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from('work_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

async function updateWorkSession(sessionId, updates = {}) {
  if (!currentUser || !sessionId) return null;

  const { data, error } = await supabaseClient
    .from('work_sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', currentUser.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ===========================================
// XP EVENTS (HISTÃ“RICO DE XP)
// ===========================================

async function addXpEvent(deltaXp, reason) {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('xp_events')
    .insert({
      user_id: currentUser.id,
      delta_xp: deltaXp,
      reason: reason
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getXpHistory(limit = 50) {
  if (!currentUser) return [];

  const { data, error } = await supabaseClient
    .from('xp_events')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ===========================================
// BÃBLIA - ANOTAÃ‡Ã•ES
// ===========================================
let bibleNotesCloudUnavailable = false;

function markBibleNotesTableUnavailable(error) {
  if (!isTableNotFoundError(error)) return false;
  if (!bibleNotesCloudUnavailable) {
    console.warn('⚠️ Tabela bible_notes ausente no Supabase. Entrando em modo local para anotações da Bíblia.');
  }
  bibleNotesCloudUnavailable = true;
  return true;
}

async function getBibleNotes() {
  if (!currentUser) return [];
  if (bibleNotesCloudUnavailable) return [];

  const { data, error } = await supabaseClient
    .from('bible_notes')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });

  if (error) {
    if (markBibleNotesTableUnavailable(error)) return [];
    throw error;
  }
  return data || [];
}

async function addBibleNote({ reference, content, tags }) {
  if (!currentUser) return null;

  const payload = {
    user_id: currentUser.id,
    reference: reference || null,
    content: content || '',
    tags: Array.isArray(tags) ? tags : []
  };
  const nowIso = new Date().toISOString();

  if (bibleNotesCloudUnavailable) {
    return {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      reference: payload.reference,
      content: payload.content,
      tags: payload.tags,
      created_at: nowIso,
      updated_at: nowIso,
      __localFallback: true
    };
  }

  const { data, error } = await supabaseClient
    .from('bible_notes')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (markBibleNotesTableUnavailable(error)) {
      return {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        reference: payload.reference,
        content: payload.content,
        tags: payload.tags,
        created_at: nowIso,
        updated_at: nowIso,
        __localFallback: true
      };
    }
    throw error;
  }
  return data;
}

async function updateBibleNote(id, fields = {}) {
  if (!currentUser) return null;

  const payload = {
    ...fields,
    updated_at: new Date().toISOString()
  };
  if (bibleNotesCloudUnavailable) {
    return {
      id,
      ...fields,
      updated_at: payload.updated_at,
      __localFallback: true
    };
  }

  const { data, error } = await supabaseClient
    .from('bible_notes')
    .update(payload)
    .eq('id', id)
    .eq('user_id', currentUser.id)
    .select('*')
    .single();

  if (error) {
    if (markBibleNotesTableUnavailable(error)) {
      return {
        id,
        ...fields,
        updated_at: payload.updated_at,
        __localFallback: true
      };
    }
    throw error;
  }
  return data;
}

async function deleteBibleNote(id) {
  if (!currentUser) return false;
  if (bibleNotesCloudUnavailable) return true;

  const { error } = await supabaseClient
    .from('bible_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) {
    if (markBibleNotesTableUnavailable(error)) return true;
    throw error;
  }
  return true;
}

// ===========================================
// ORÃCULO - MENSAGENS E MEMÃ“RIA
// ===========================================

async function saveOracleMessage(role, content, meta = {}) {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('oracle_messages')
    .insert({
      user_id: currentUser.id,
      role: role, // 'user' ou 'assistant'
      content: content,
      meta: meta
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOracleMessages(limit = 50) {
  if (!currentUser) return [];

  const { data, error } = await supabaseClient
    .from('oracle_messages')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse(); // Retorna em ordem cronolÃ³gica
}

async function saveOracleMemory(title, fact, tags = [], importance = 5) {
  if (!currentUser) return null;

  const { data, error } = await supabaseClient
    .from('oracle_memory')
    .insert({
      user_id: currentUser.id,
      title: title,
      fact: fact,
      tags: tags,
      importance: importance
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOracleMemories(searchTags = null) {
  if (!currentUser) return [];

  let query = supabaseClient
    .from('oracle_memory')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('importance', { ascending: false });

  if (searchTags && searchTags.length > 0) {
    query = query.overlaps('tags', searchTags);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

// ===========================================
// SALA DOS JOGADORES (REALTIME)
// ===========================================

function sanitizeRealtimeRoomName(value) {
  const safe = String(value || 'global')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return safe || 'global';
}

function getRealtimePresenceKey() {
  if (currentUser && currentUser.id) return currentUser.id;
  const rand = Math.random().toString(36).slice(2, 10);
  return `anon_${Date.now()}_${rand}`;
}

function joinPlayerChatRoom({ room = 'global', profile = null, onMessage = null, onStatus = null, onSignal = null } = {}) {
  if (!isSupabaseConfigured() || !supabaseClient || typeof supabaseClient.channel !== 'function') {
    throw new Error('Supabase Realtime indisponÃ­vel.');
  }

  const safeRoom = sanitizeRealtimeRoomName(room);
  const channelName = `ur_player_chat_${safeRoom}`;
  const channel = supabaseClient.channel(channelName, {
    config: {
      broadcast: { self: false, ack: true },
      presence: { key: getRealtimePresenceKey() }
    }
  });

  channel.on('broadcast', { event: 'chat-message' }, (event) => {
    const payload = event && event.payload ? event.payload : null;
    if (payload && typeof onMessage === 'function') {
      try { onMessage(payload); } catch (e) { console.warn('onMessage da sala falhou:', e); }
    }
  });

  channel.on('broadcast', { event: 'call-signal' }, (event) => {
    const payload = event && event.payload ? event.payload : null;
    if (payload && typeof onSignal === 'function') {
      try { onSignal(payload); } catch (e) { console.warn('onSignal da sala falhou:', e); }
    }
  });

  channel.on('presence', { event: 'sync' }, () => {
    if (typeof onStatus === 'function') {
      const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
      const online = Object.keys(state || {}).length;
      onStatus('PRESENCE_SYNC', { online, state });
    }
  });

  channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED' && typeof channel.track === 'function') {
      try {
        await channel.track({
          user_id: currentUser?.id || null,
          name: currentUser?.email || 'jogador',
          online_at: new Date().toISOString(),
          profile: profile && typeof profile === 'object' ? profile : null
        });
      } catch (e) {
        console.warn('Falha ao rastrear presenÃ§a na sala:', e);
      }
    }
    if (typeof onStatus === 'function') {
      const meta = {};
      if (err) {
        meta.error = err;
        meta.message = String(err?.message || err?.error_description || err || '').trim();
      }
      try { onStatus(status, meta); } catch (e) { console.warn('onStatus da sala falhou:', e); }
    }
  });

  return channel;
}

async function sendPlayerChatMessage(channel, payload = {}) {
  if (!channel || typeof channel.send !== 'function') {
    throw new Error('Canal da sala indisponivel.');
  }

  const kindRaw = String(payload.kind || '').toLowerCase();
  const allowedKinds = new Set(['text', 'sticker', 'audio', 'image_sticker', 'gif', 'video', 'animated_sticker', 'call', 'poker_invite', 'admin_news', 'admin_news_delete', 'admin_maintenance']);
  const kind = allowedKinds.has(kindRaw) ? kindRaw : 'text';
  const text = String(payload.text || '').trim();
  const stickerEmoji = String(payload.stickerEmoji || '').trim();
  const mediaData = String(payload.mediaData || '').trim();
  const mediaMime = String(payload.mediaMime || '').trim().slice(0, 80);
  const mediaName = String(payload.mediaName || '').trim().slice(0, 80);
  const mediaCaption = String(payload.mediaCaption || '').trim().slice(0, 80);
  const mediaDurationMs = Math.max(0, Number(payload.mediaDurationMs || 0) || 0);
  const phone = String(payload.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
  const callSessionId = String(payload.callSessionId || '').trim().slice(0, 80);
  const callState = String(payload.callState || '').trim().slice(0, 40);
  const privateTypeRaw = String(payload.privateType || '').trim().toLowerCase();
  const privateType = privateTypeRaw === 'blessing' ? 'blessing' : '';
  const targetUserId = privateType
    ? String(payload.targetUserId || '').trim().slice(0, 120)
    : '';
  const targetUsername = privateType
    ? String(payload.targetUsername || '').trim().slice(0, 50)
    : '';
  const inviteGame = String(payload.inviteGame || '').trim().toLowerCase().slice(0, 32);
  const inviteTargetTab = String(payload.inviteTargetTab || '').trim().toLowerCase().slice(0, 24);
  const inviteSessionId = String(payload.inviteSessionId || '').trim().slice(0, 80);
  const profileRaw = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
  const profileNofapRaw = profileRaw.nofap && typeof profileRaw.nofap === 'object' ? profileRaw.nofap : {};
  const profilePhotoRaw = String(profileRaw.photo || '').trim();
  const profilePhoto = (
    profilePhotoRaw.startsWith('data:image/') &&
    profilePhotoRaw.length <= 260000
  ) ? profilePhotoRaw : '';
  const normalizeIso = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
  };
  const adminNewsExpiresAt = kind === 'admin_news'
    ? (normalizeIso(payload.adminNewsExpiresAt || new Date(Date.now() + 86400000).toISOString()) || new Date(Date.now() + 86400000).toISOString())
    : '';
  const sanitizeAdminNewsTitle = (value) => String(value || '')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const normalizeAdminNewsMediaKind = (value) => {
    const safe = String(value || '').trim().toLowerCase();
    if (safe === 'image' || safe === 'video' || safe === 'youtube') return safe;
    return '';
  };
  const normalizeYoutubeEmbed = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (e) {
      return '';
    }
    const host = String(parsed.hostname || '').toLowerCase();
    let id = '';
    if (host.includes('youtube.com')) {
      id = String(parsed.searchParams.get('v') || '').trim();
      if (!id) {
        const parts = String(parsed.pathname || '').split('/').filter(Boolean);
        if (parts[0] === 'shorts' && parts[1]) id = parts[1];
        if (parts[0] === 'embed' && parts[1]) id = parts[1];
      }
    } else if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const parts = String(parsed.pathname || '').split('/').filter(Boolean);
      if (parts[0]) id = parts[0];
    }
    id = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    return id ? `https://www.youtube.com/embed/${id}` : '';
  };
  const sanitizeAdminNewsMediaUrl = (value, mediaKind) => {
    const MAX_URL_LEN = 2048;
    const IMAGE_DATA_MAX_LEN = Math.floor((850 * 1024 * 4) / 3) + 4096;
    const VIDEO_DATA_MAX_LEN = Math.floor((8 * 1024 * 1024 * 4) / 3) + 4096;
    const kindSafe = normalizeAdminNewsMediaKind(mediaKind);
    if (!kindSafe) return '';
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (kindSafe === 'youtube') return normalizeYoutubeEmbed(raw);
    const lower = raw.toLowerCase();
    if (lower.startsWith('data:')) {
      const validData = kindSafe === 'image'
        ? lower.startsWith('data:image/')
        : lower.startsWith('data:video/');
      if (!validData) return '';
      const maxDataLen = kindSafe === 'image' ? IMAGE_DATA_MAX_LEN : VIDEO_DATA_MAX_LEN;
      if (raw.length > maxDataLen) return '';
      return raw;
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (e) {
      return '';
    }
    const proto = String(parsed.protocol || '').toLowerCase();
    if (proto !== 'https:' && proto !== 'http:') return '';
    return parsed.toString().slice(0, MAX_URL_LEN);
  };
  const adminNewsTitle = kind === 'admin_news'
    ? sanitizeAdminNewsTitle(payload.adminNewsTitle || payload.title || '')
    : '';
  const adminNewsMediaKindRaw = kind === 'admin_news'
    ? normalizeAdminNewsMediaKind(payload.adminNewsMediaKind || payload.mediaKind || '')
    : '';
  const adminNewsMediaUrl = kind === 'admin_news'
    ? sanitizeAdminNewsMediaUrl(payload.adminNewsMediaUrl || payload.adminNewsMediaData || payload.mediaUrl || '', adminNewsMediaKindRaw)
    : '';
  const adminNewsMediaKind = adminNewsMediaUrl ? adminNewsMediaKindRaw : '';
  const adminNewsMediaPoster = kind === 'admin_news'
    ? sanitizeAdminNewsMediaUrl(payload.adminNewsMediaPoster || payload.mediaPoster || '', 'image')
    : '';
  const adminNewsTargetId = kind === 'admin_news_delete'
    ? String(payload.adminNewsTargetId || payload.targetNewsId || payload.targetId || '').trim().slice(0, 120)
    : '';
  const maintenanceActive = kind === 'admin_maintenance'
    ? !!payload.maintenanceActive
    : false;
  const maintenanceMessage = kind === 'admin_maintenance'
    ? String(payload.maintenanceMessage || payload.text || '').trim().slice(0, 260)
    : '';
  const profile = {
    userId: String(profileRaw.userId || payload.userId || currentUser?.id || '').trim().slice(0, 120),
    name: String(profileRaw.name || payload.username || 'Jogador').trim().slice(0, 50) || 'Jogador',
    avatar: String(profileRaw.avatar || payload.avatar || '🧑').trim().slice(0, 10) || '🧑',
    race: String(profileRaw.race || '').trim().slice(0, 40),
    title: String(profileRaw.title || '').trim().slice(0, 60),
    level: Math.max(1, Math.min(9999, Number(profileRaw.level) || 1)),
    rankLabel: String(profileRaw.rankLabel || '').trim().slice(0, 60),
    powerScore: Math.max(0, Math.min(999999999, Number(profileRaw.powerScore) || 0)),
    coins: Math.max(0, Math.min(999999999, Number(profileRaw.coins) || 0)),
    streak: Math.max(0, Math.min(99999, Number(profileRaw.streak) || 0)),
    achievementsCount: Math.max(0, Math.min(99999, Number(profileRaw.achievementsCount) || 0)),
    trophiesCount: Math.max(0, Math.min(99999, Number(profileRaw.trophiesCount) || 0)),
    hasCrown: !!profileRaw.hasCrown,
    hasHeroFrame: !!profileRaw.hasHeroFrame,
    hasNameGlow: !!profileRaw.hasNameGlow,
    hasNameMotion: !!profileRaw.hasNameMotion,
    hasRelationshipTrophy: !!profileRaw.hasRelationshipTrophy,
    hasSpecialStickers: !!profileRaw.hasSpecialStickers,
    hasProfilePhoto: !!profileRaw.hasProfilePhoto && !!profilePhoto,
    photo: !!profileRaw.hasProfilePhoto ? profilePhoto : '',
    updatedAt: normalizeIso(profileRaw.updatedAt || new Date().toISOString()),
    nofap: {
      shareInChat: !!profileNofapRaw.shareInChat,
      days: Math.max(0, Math.min(99999, Number(profileNofapRaw.days) || 0)),
      bestDays: Math.max(0, Math.min(99999, Number(profileNofapRaw.bestDays) || 0)),
      startedAt: normalizeIso(profileNofapRaw.startedAt)
    }
  };
  if (!profile.nofap.shareInChat) {
    profile.nofap.days = 0;
    profile.nofap.bestDays = 0;
    profile.nofap.startedAt = '';
  }

  const message = {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    text: kind === 'text' || kind === 'call' || kind === 'poker_invite' || kind === 'admin_news' || kind === 'admin_news_delete' || kind === 'admin_maintenance' ? text : '',
    stickerId: kind === 'sticker' ? String(payload.stickerId || '').trim().slice(0, 40) : '',
    stickerEmoji: kind === 'sticker' ? stickerEmoji : '',
    stickerLabel: kind === 'sticker' ? String(payload.stickerLabel || '').trim().slice(0, 40) : '',
    mediaData: (kind === 'audio' || kind === 'image_sticker' || kind === 'gif' || kind === 'video' || kind === 'animated_sticker') ? mediaData : '',
    mediaMime: (kind === 'audio' || kind === 'image_sticker' || kind === 'gif' || kind === 'video' || kind === 'animated_sticker') ? mediaMime : '',
    mediaName: (kind === 'audio' || kind === 'image_sticker' || kind === 'gif' || kind === 'video' || kind === 'animated_sticker') ? mediaName : '',
    mediaCaption: (kind === 'audio' || kind === 'image_sticker' || kind === 'gif' || kind === 'video' || kind === 'animated_sticker') ? mediaCaption : '',
    mediaDurationMs: kind === 'audio' ? mediaDurationMs : 0,
    phone: kind === 'call' ? phone : '',
    callSessionId: kind === 'call' ? callSessionId : '',
    callState: kind === 'call' ? callState : '',
    privateType,
    targetUserId,
    targetUsername,
    inviteGame: kind === 'poker_invite' ? inviteGame : '',
    inviteTargetTab: kind === 'poker_invite' ? inviteTargetTab : '',
    inviteSessionId: kind === 'poker_invite' ? inviteSessionId : '',
    adminNewsTitle,
    adminNewsMediaKind,
    adminNewsMediaUrl,
    adminNewsMediaPoster,
    adminNewsTargetId,
    adminNewsExpiresAt,
    maintenanceActive,
    maintenanceMessage,
    userId: String(payload.userId || currentUser?.id || ''),
    username: String(payload.username || 'Jogador').trim().slice(0, 50),
    avatar: String(payload.avatar || '🧑'),
    profile,
    createdAt: payload.createdAt || new Date().toISOString()
  };

  if (message.kind === 'text' && !message.text) throw new Error('Mensagem vazia.');
  if (message.kind === 'sticker' && !message.stickerEmoji) throw new Error('Imagem invalida.');
  if ((message.kind === 'audio' || message.kind === 'image_sticker' || message.kind === 'gif' || message.kind === 'video' || message.kind === 'animated_sticker') && !message.mediaData) {
    throw new Error('Midia invalida.');
  }
  if (message.kind === 'call' && !message.callSessionId) throw new Error('Sessao de ligacao invalida.');
  if (message.privateType === 'blessing' && !message.targetUserId) throw new Error('Destinatario do presente invalido.');
  if (message.kind === 'poker_invite' && !message.text && !message.inviteGame) throw new Error('Convite de poker invalido.');
  if (message.kind === 'admin_news' && !message.text && !message.adminNewsTitle && !message.adminNewsMediaUrl) {
    throw new Error('Noticia do admin invalida.');
  }
  if (message.kind === 'admin_news_delete' && !String(message.adminNewsTargetId || '').trim()) {
    throw new Error('Noticia alvo para exclusao invalida.');
  }
  if (message.kind === 'admin_maintenance' && !String(message.maintenanceMessage || message.text || '').trim()) {
    throw new Error('Mensagem de manutenção inválida.');
  }

  const result = await channel.send({
    type: 'broadcast',
    event: 'chat-message',
    payload: message
  });

  if (result !== 'ok') {
    throw new Error(`Falha no envio realtime: ${result}`);
  }

  return message;
}

async function sendPlayerCallSignal(channel, payload = {}) {
  if (!channel || typeof channel.send !== 'function') {
    throw new Error('Canal da sala indisponivel.');
  }

  const signalTypeRaw = String(payload.type || '').trim().toLowerCase();
  const allowedSignalTypes = new Set(['invite', 'join', 'offer', 'answer', 'ice', 'hangup', 'busy', 'heartbeat']);
  if (!allowedSignalTypes.has(signalTypeRaw)) {
    throw new Error('Tipo de sinal de ligação inválido.');
  }

  const sessionId = String(payload.sessionId || '').trim().slice(0, 80);
  if (!sessionId) throw new Error('Sessão de ligação ausente.');

  const signal = {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: signalTypeRaw,
    sessionId,
    fromUserId: String(payload.fromUserId || currentUser?.id || ''),
    fromName: String(payload.fromName || currentUser?.email || 'Jogador').trim().slice(0, 50),
    toUserId: String(payload.toUserId || '').trim().slice(0, 80),
    sdp: payload.sdp || null,
    candidate: payload.candidate || null,
    createdAt: payload.createdAt || new Date().toISOString()
  };

  const result = await channel.send({
    type: 'broadcast',
    event: 'call-signal',
    payload: signal
  });

  if (result !== 'ok') {
    throw new Error(`Falha no sinal realtime: ${result}`);
  }
  return signal;
}

function leavePlayerChatRoom(channel) {
  if (!supabaseClient || !channel) return false;
  try {
    supabaseClient.removeChannel(channel);
    return true;
  } catch (e) {
    console.warn('Falha ao sair da sala de chat:', e);
    return false;
  }
}

function joinArenaRoom({ room = 'global', profile = null, onEvent = null, onStatus = null, onPresence = null } = {}) {
  if (!isSupabaseConfigured() || !supabaseClient || typeof supabaseClient.channel !== 'function') {
    throw new Error('Supabase Realtime indisponível.');
  }

  const safeRoom = sanitizeRealtimeRoomName(room);
  const channelName = `ur_player_arena_${safeRoom}`;
  const channel = supabaseClient.channel(channelName, {
    config: {
      broadcast: { self: false, ack: true },
      presence: { key: getRealtimePresenceKey() }
    }
  });

  channel.on('broadcast', { event: 'arena-event' }, (event) => {
    const payload = event && event.payload ? event.payload : null;
    if (payload && typeof onEvent === 'function') {
      try { onEvent(payload); } catch (e) { console.warn('onEvent da arena falhou:', e); }
    }
  });

  channel.on('presence', { event: 'sync' }, () => {
    if (typeof onPresence === 'function') {
      const state = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
      try { onPresence(state || {}); } catch (e) { console.warn('onPresence da arena falhou:', e); }
    }
  });

  channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED' && typeof channel.track === 'function') {
      try {
        await channel.track({
          user_id: currentUser?.id || null,
          name: currentUser?.email || 'jogador',
          online_at: new Date().toISOString(),
          arenaProfile: profile && typeof profile === 'object' ? profile : null
        });
      } catch (e) {
        console.warn('Falha ao rastrear presença na arena:', e);
      }
    }
    if (typeof onStatus === 'function') {
      const meta = {};
      if (err) {
        meta.error = err;
        meta.message = String(err?.message || err?.error_description || err || '').trim();
      }
      try { onStatus(status, meta); } catch (e) { console.warn('onStatus da arena falhou:', e); }
    }
  });

  return channel;
}

async function sendArenaEvent(channel, payload = {}) {
  if (!channel || typeof channel.send !== 'function') {
    throw new Error('Canal da arena indisponível.');
  }

  const type = String(payload.type || '').trim().toLowerCase();
  const allowedTypes = new Set(['queue', 'challenge', 'accept', 'decline', 'state', 'cancel']);
  if (!allowedTypes.has(type)) {
    throw new Error('Tipo de evento da arena inválido.');
  }

  const event = {
    id: String(payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    type,
    sessionId: String(payload.sessionId || '').trim().slice(0, 80),
    userId: String(payload.userId || currentUser?.id || '').trim().slice(0, 80),
    toUserId: String(payload.toUserId || '').trim().slice(0, 80),
    createdAt: payload.createdAt || new Date().toISOString(),
    profile: payload.profile && typeof payload.profile === 'object' ? payload.profile : null,
    targetProfile: payload.targetProfile && typeof payload.targetProfile === 'object' ? payload.targetProfile : null,
    match: payload.match && typeof payload.match === 'object' ? payload.match : null,
    meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {}
  };

  const result = await channel.send({
    type: 'broadcast',
    event: 'arena-event',
    payload: event
  });

  if (result !== 'ok') {
    throw new Error(`Falha no envio da arena: ${result}`);
  }

  return event;
}

async function deleteOracleMemoriesByPolicy({ tags = [], sinceIso = '', term = '' } = {}) {
  if (!currentUser) return { removed: 0 };

  const normalizeLoose = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const sinceMs = Number.isFinite(Date.parse(String(sinceIso || '').trim()))
    ? Date.parse(String(sinceIso || '').trim())
    : NaN;
  const needle = normalizeLoose(term);
  const sourceTags = (Array.isArray(tags) && tags.length) ? tags : null;

  const memories = await getOracleMemories(sourceTags);
  const toDelete = (memories || []).filter((item) => {
    const createdMs = Number.isFinite(Date.parse(String(item?.created_at || '').trim()))
      ? Date.parse(String(item?.created_at || '').trim())
      : NaN;
    if (Number.isFinite(sinceMs)) {
      if (!Number.isFinite(createdMs)) return false;
      if (createdMs < sinceMs) return false;
    }

    if (needle) {
      const hay = normalizeLoose(`${item?.title || ''} ${item?.fact || ''} ${(item?.tags || []).join(' ')}`);
      if (!hay || !hay.includes(needle)) return false;
    }
    return true;
  });

  const ids = toDelete.map((item) => item?.id).filter(Boolean);
  if (!ids.length) return { removed: 0 };

  const { error } = await supabaseClient
    .from('oracle_memory')
    .delete()
    .eq('user_id', currentUser.id)
    .in('id', ids);

  if (error) throw error;
  return { removed: ids.length };
}

async function deleteOracleMemoriesByFacts({ facts = [], tags = [], sinceIso = '' } = {}) {
  if (!currentUser) return { removed: 0 };

  const normalizeLoose = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const factSet = new Set((Array.isArray(facts) ? facts : []).map((f) => normalizeLoose(f)).filter(Boolean));
  if (!factSet.size) return { removed: 0 };

  const sinceMs = Number.isFinite(Date.parse(String(sinceIso || '').trim()))
    ? Date.parse(String(sinceIso || '').trim())
    : NaN;
  const sourceTags = (Array.isArray(tags) && tags.length) ? tags : null;

  const memories = await getOracleMemories(sourceTags);
  const toDelete = (memories || []).filter((item) => {
    const createdMs = Number.isFinite(Date.parse(String(item?.created_at || '').trim()))
      ? Date.parse(String(item?.created_at || '').trim())
      : NaN;
    if (Number.isFinite(sinceMs)) {
      if (!Number.isFinite(createdMs) || createdMs < sinceMs) return false;
    }
    const normalizedFact = normalizeLoose(item?.fact || '');
    return !!normalizedFact && factSet.has(normalizedFact);
  });

  const ids = toDelete.map((item) => item?.id).filter(Boolean);
  if (!ids.length) return { removed: 0 };

  const { error } = await supabaseClient
    .from('oracle_memory')
    .delete()
    .eq('user_id', currentUser.id)
    .in('id', ids);

  if (error) throw error;
  return { removed: ids.length };
}

async function deleteAllUserData() {
  if (!currentUser) {
    console.error('âŒ deleteAllUserData: currentUser Ã© null');
    return false;
  }

  const userId = currentUser.id;
  console.log(`Iniciando exclusão de todos os dados para o usuário: ${userId}`);

  // Lista de tabelas que contÃªm dados do usuÃ¡rio e usam 'user_id'
  const tablesWithUserId = [
    'oracle_messages',
    'oracle_memory',
    'oracle_pending',
    'xp_events',
    'work_sessions',
    'finance_transactions',
    'finance_groups',
    'bible_notes',
    'bills',
    'tasks'
  ];

  try {
    const deletePromises = tablesWithUserId.map(table => {
      console.log(`   -> Deletando da tabela ${table}...`);
      return supabaseClient
        .from(table)
        .delete()
        .eq('user_id', userId);
    });
    
    console.log(`   -> Deletando da tabela profiles...`);
    deletePromises.push(
      supabaseClient
        .from('profiles')
        .delete()
        .eq('id', userId)
    );
        
    const results = await Promise.all(deletePromises);

    const hadError = results.some(r => r.error);
    if (hadError) console.warn('âš ï¸ Alguns dados podem nÃ£o ter sido removidos da nuvem.');

    console.log('âœ… ExclusÃ£o de dados na nuvem concluÃ­da.');
    return !hadError;

  } catch (error) {
    console.error('âŒ Erro catastrÃ³fico durante a exclusÃ£o de dados:', error);
    return false;
  }
}
// ===========================================
// ORÃCULO - PROCESSADOR DE AÃ‡Ã•ES
// ===========================================

// Processa as aÃ§Ãµes retornadas pelo OrÃ¡culo
async function processOracleActions(actions) {
  const results = [];

  for (const action of actions) {
    // aceita formato { type, payload } vindo do LLM
    const payload = action.payload || action;
    try {
      switch (action.type) {
        case 'finance.add':
          const financeResult = await addFinance({
            type: payload.amount > 0 ? 'income' : 'expense',
            category: payload.category || 'Outros',
            amount: Math.abs(payload.amount || 0),
            description: payload.description || ''
          });
          results.push({ success: true, action: 'finance.add', data: financeResult });
          // PÃ³s-transaÃ§Ã£o: anÃ¡lise financeira bÃ¡sica e alerts
          try {
            const intelligence = new FinanceIntelligence(supabaseClient);
            const alerts = await intelligence.checkForAlerts(currentUser?.id, financeResult);
            if (alerts && alerts.length) {
              showFinancialAlerts(alerts);
            }
            // Feedback simples: comparar com mÃ©dia da categoria
            const avg = await intelligence.getCategoryAverage(currentUser?.id, financeResult.category);
            if (avg && financeResult.amount > avg) {
              addBotMessage(`Este gasto de R$ ${financeResult.amount.toFixed(2)} está ${( (financeResult.amount/avg - 1) * 100 ).toFixed(0)}% acima da sua média para ${financeResult.category}.`);
            }
          } catch (e) {
            console.warn('Finance analysis failed:', e);
          }
          break;

        case 'task.add':
        case 'task.create': {
          const title = payload.title || payload.name || payload.text || action.title || action.name || action.text;
          if (!title) {
            results.push({ success: false, action: action.type, error: 'TÃ­tulo da tarefa ausente' });
            break;
          }
          let taskResult = null;
          if (currentUser) {
            try {
              taskResult = await addTask({
                title: title,
                xpReward: payload.xp || payload.xpReward || 10,
                dueDate: payload.date || payload.due_date || null
              });
            } catch (e) {
              console.warn('Falha ao criar tarefa no Supabase, fallback local:', e);
            }
          }
          if (!taskResult) {
            if (typeof createTask === 'function') {
              const msg = createTask(title);
              results.push({ success: true, action: action.type, data: { local: true, message: msg } });
            } else {
              results.push({ success: false, action: action.type, error: 'Sem sessÃ£o e sem fallback local' });
            }
            break;
          }
          results.push({ success: true, action: action.type, data: taskResult });
          break;
        }

        case 'task.complete':
          await updateTask(payload.task_id || action.task_id, { 
            status: 'completed',
            completed_at: new Date().toISOString()
          });
          results.push({ success: true, action: 'task.complete' });
          break;

        case 'memory.save':
          const memoryResult = await saveOracleMemory(
            payload.title || action.title,
            payload.fact || action.fact,
            payload.tags || action.tags || [],
            payload.importance || action.importance || 5
          );
          results.push({ success: true, action: 'memory.save', data: memoryResult });
          break;

        case 'xp.add':
          await addXpEvent(payload.amount || action.amount, payload.reason || action.reason || 'BÃ´nus do OrÃ¡culo');
          results.push({ success: true, action: 'xp.add', amount: payload.amount || action.amount });
          break;

        default:
          results.push({ success: false, action: action.type, error: 'AÃ§Ã£o desconhecida' });
      }
    } catch (error) {
      results.push({ success: false, action: action.type, error: error.message });
    }
  }

  return results;
}

// ===========================================
// UTILIDADES
// ===========================================

function normalizeArrayBackup(value, maxItems = 1200) {
  if (!Array.isArray(value)) return [];
  if (value.length <= maxItems) return value;
  return value.slice(-maxItems);
}

function normalizeIdQueue(value, maxItems = 2000) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  value.forEach((raw) => {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  if (out.length <= maxItems) return out;
  return out.slice(-maxItems);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function parseWorkNotesSafe(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'object') return rawValue;
  const text = String(rawValue || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return { notes: text };
  }
}

function workLogEntryKey(entry = {}) {
  const id = String(entry?.id || '').trim();
  if (id) return `id:${id}`;
  const date = String(entry?.date || '').trim();
  const type = String(entry?.type || '').trim();
  const inputVal = Number(entry?.inputVal ?? 0);
  const stamp = Number(entry?.timestamp || 0);
  return `k:${date}|${type}|${inputVal}|${stamp}`;
}

function workLogEntryUpdatedAtMs(entry = {}) {
  const iso = String(entry?.updatedAt || entry?.lastEditedAt || '').trim();
  const isoMs = Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : 0;
  const ts = Number(entry?.timestamp || 0);
  return Math.max(isoMs, Number.isFinite(ts) ? ts : 0);
}

function toBooleanWorkUnpaid(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

// Sincroniza dados locais com o Supabase
async function syncLocalToCloud(localData) {
  if (!isSupabaseConfigured() || !currentUser) return false;

  try {
    const rankSnapshot = buildRankSnapshotFromLocalData(localData);
    const safeInventory = {
      items: localData.inventory || [],
      job: localData.job || null,
      bills: localData.bills || [],
      coins: Math.max(0, Number(localData.coins || 0) || 0),
      shopUnlocks: localData.shopUnlocks || {},
      playerProfilePhoto: localData.playerProfilePhoto || null,
      cinemaLibrary: Array.isArray(localData.cinemaLibrary) ? localData.cinemaLibrary : [],
      cinemaActiveId: localData.cinemaActiveId || '',
      xpHistory: localData.xpHistory || {},
      lastTaskReset: localData.lastTaskReset || null,
      zenBackgroundImage: localData.zenBackgroundImage || null,
      zenMusic: localData.zenMusic || null,
      bibleHighlights: Array.isArray(localData.bibleHighlights) ? localData.bibleHighlights : [],
      gratitudeJournal: localData.gratitudeJournal || [],
      taskHistory: localData.taskHistory || [],
      tasksLastChangedAt: localData.tasksLastChangedAt || null,
      expenseGroups: localData.expenseGroups || [],
      financeMonthHistory: localData.financeMonthHistory || [],
      financeArchivedKeys: localData.financeArchivedKeys || [],
      financeCurrentMonth: localData.financeCurrentMonth || null,
      financeSelectedMonth: localData.financeSelectedMonth || null,
      financeLastManualResetAt: localData.financeLastManualResetAt || null,
      savings: localData.savings || { total: 0, goal: 0, history: [] },
      poker: localData.poker || { playerChips: 1000, cpuChips: 1000, handsPlayed: 0, wins: 0, losses: 0 },
      pokerOnlineBonusClaimed: !!localData.pokerOnlineBonusClaimed,
      nofapStartAt: localData.nofapStartAt || null,
      nofapLastResetAt: localData.nofapLastResetAt || null,
      nofapShareInChat: !!localData.nofapShareInChat,
      nofapBestDays: Math.max(0, Number(localData.nofapBestDays || 0) || 0),
      achievementsCount: Array.isArray(localData.achievements) ? localData.achievements.length : 0,
      trophiesCount: Array.isArray(localData.trophies) ? localData.trophies.length : 0,
      rankSnapshot,
      arenaProgress: localData.arenaProgress || {},
      // Backups extras para evitar perda se coleções principais falharem
      tasksBackup: normalizeArrayBackup(localData.dailyTasks || [], 800),
      workWeekPlanBackup: normalizeArrayBackup(localData.workWeekPlan || [], 420),
      deletedTaskIds: normalizeIdQueue(localData.deletedTaskIds || [], 2000),
      financesBackup: normalizeArrayBackup(localData.finances || [], 1200),
      workLogBackup: normalizeArrayBackup(localData.workLog || [], 1200),
      deletedWorkLogIds: normalizeIdQueue(localData.deletedWorkLogIds || [], 2000),
      adminHiddenRankUserIds: normalizeIdQueue(localData.adminHiddenRankUserIds || [], 2000)
    };

    // Atualiza perfil
    await updateProfile({
      character_name: localData.name,
      character_class: localData.race,
      title: localData.title,
      aura_color: localData.auraColor,
      level: localData.level,
      xp: localData.xp,
      streak: localData.streak,
      skill_points: localData.skillPoints || 0,
      attributes: localData.attributes,
      achievements: localData.achievements,
      updated_at: new Date().toISOString(),
      inventory: safeInventory
    });

    console.log('âœ… Dados sincronizados com a nuvem');
    return true;
  } catch (error) {
    console.error('âŒ Erro ao sincronizar:', error);
    return false;
  }
}

// Carrega dados da nuvem para local
async function syncCloudToLocal() {
  if (!isSupabaseConfigured() || !currentUser) return null;

  try {
    const profile = await getProfile();
    if (!profile) return null;

    // Carrega TODOS os dados do usuÃ¡rio
    const [tasksResult, financesResult, workSessionsResult, oracleMemoriesResult] = await Promise.allSettled([
      getTasks(),
      getFinances(),
      getWorkSessions(),
      getOracleMemories()
    ]);

    const collectionsLoaded =
      tasksResult.status === 'fulfilled' &&
      financesResult.status === 'fulfilled' &&
      workSessionsResult.status === 'fulfilled';

    if (!collectionsLoaded) {
      console.warn('⚠️ syncCloudToLocal: coleções principais vieram parciais. Usando fallback seguro.');
    }

    const tasks = tasksResult.status === 'fulfilled' ? (tasksResult.value || []) : [];
    const finances = financesResult.status === 'fulfilled' ? (financesResult.value || []) : [];
    const workSessions = workSessionsResult.status === 'fulfilled' ? (workSessionsResult.value || []) : [];
    const oracleMemories = oracleMemoriesResult.status === 'fulfilled' ? (oracleMemoriesResult.value || []) : [];

    // Converte tarefas do formato Supabase para formato local
    const localTasks = tasks.map(t => ({
      id: t.id,
      text: t.title,
      completed: t.status === 'completed',
      date: t.created_at,
      completedAt: t.completed_at,
      dueDate: t.due_date,
      xpReward: t.xp_reward,
      category: t.category
    }));

    // Converte finanÃ§as do formato Supabase para formato local
    const localFinances = finances.map(f => ({
      id: f.id,
      desc: f.description,
      value: f.amount,
      type: f.type,
      category: f.category,
      date: f.created_at
    }));

    // Converte sessÃµes de trabalho
    const localWorkLog = workSessions.map(w => {
      const extraData = parseWorkNotesSafe(w.notes);
      const safeDate = w.start_at ? w.start_at.split('T')[0] : new Date().toISOString().split('T')[0];
      return {
        id: w.id,
        date: safeDate,
        timestamp: w.start_at ? new Date(w.start_at).getTime() : Date.now(),
        duration: w.total_seconds ? w.total_seconds * 1000 : 0, // Converter segundos para ms
        type: extraData.type || w.activity_type || 'time_tracking',
        inputVal: extraData.inputVal !== undefined ? extraData.inputVal : (w.total_seconds ? w.total_seconds / 3600 : 0),
        financialVal: Number(extraData.financialVal || 0) || 0,
        isUnpaid: toBooleanWorkUnpaid(extraData.isUnpaid),
        week: extraData.week || null,
        month: extraData.month || safeDate.slice(0, 7),
        note: String(extraData.note || '').trim(),
        rateSnapshot: Number(extraData.rateSnapshot || 0) || 0,
        updatedAt: extraData.updatedAt || w.updated_at || w.start_at || new Date().toISOString()
      };
    });

    // Converte memÃ³rias do orÃ¡culo
    const localOracleMemory = {
      learned: oracleMemories.map(m => ({
        text: m.fact,
        date: m.created_at,
        tags: m.tags
      })),
      profile: {}
    };

    // Extrai informaÃ§Ãµes de perfil das memÃ³rias
    oracleMemories.forEach(m => {
      if (m.title && m.title !== 'memory') {
        localOracleMemory.profile[m.title] = m.fact;
      }
    });

    // Extrai dados extras do campo inventory (que guarda JSON extra)
    const inventoryData = profile.inventory || {};
    const extraData = typeof inventoryData === 'object' && !Array.isArray(inventoryData) 
      ? inventoryData 
      : { items: inventoryData };

    // Usa coleções principais; se vierem vazias/parciais, cai no backup do inventory
    const fallbackTasks = Array.isArray(extraData.tasksBackup) ? extraData.tasksBackup : [];
    const fallbackFinances = Array.isArray(extraData.financesBackup) ? extraData.financesBackup : [];
    const fallbackWorkLog = Array.isArray(extraData.workLogBackup) ? extraData.workLogBackup : [];
    const fallbackWorkWeekPlan = Array.isArray(extraData.workWeekPlanBackup)
      ? extraData.workWeekPlanBackup
      : (Array.isArray(extraData.workWeekPlan) ? extraData.workWeekPlan : []);
    const deletedTaskSet = new Set(normalizeIdQueue(extraData.deletedTaskIds || [], 2000).map((id) => String(id)));
    const deletedWorkSet = new Set(normalizeIdQueue(extraData.deletedWorkLogIds || [], 2000).map((id) => String(id)));

    const useTaskFallback = tasksResult.status !== 'fulfilled';
    const useFinanceFallback = financesResult.status !== 'fulfilled';

    const finalTasksRaw = useTaskFallback ? fallbackTasks : localTasks;
    const finalFinances = useFinanceFallback ? fallbackFinances : localFinances;
    const mergedWorkMap = new Map();

    (Array.isArray(localWorkLog) ? localWorkLog : []).forEach((entry) => {
      mergedWorkMap.set(workLogEntryKey(entry), entry);
    });

    // Preferir backup quando ele estiver mais novo ou quando marcar "não remunerado"
    (Array.isArray(fallbackWorkLog) ? fallbackWorkLog : []).forEach((entry) => {
      const key = workLogEntryKey(entry);
      const current = mergedWorkMap.get(key);
      if (!current) {
        mergedWorkMap.set(key, entry);
        return;
      }
      const backupUpdated = workLogEntryUpdatedAtMs(entry);
      const cloudUpdated = workLogEntryUpdatedAtMs(current);
      const backupUnpaid = toBooleanWorkUnpaid(entry?.isUnpaid);
      const cloudUnpaid = toBooleanWorkUnpaid(current?.isUnpaid);
      const shouldPreferBackup =
        backupUpdated >= cloudUpdated ||
        (backupUnpaid && !cloudUnpaid) ||
        String(entry?.note || '').trim().length > String(current?.note || '').trim().length;
      if (shouldPreferBackup) {
        mergedWorkMap.set(key, { ...current, ...entry });
      }
    });

    const finalWorkLogRaw = Array.from(mergedWorkMap.values())
      .sort((a, b) => workLogEntryUpdatedAtMs(b) - workLogEntryUpdatedAtMs(a));
    const finalTasks = (Array.isArray(finalTasksRaw) ? finalTasksRaw : [])
      .filter((t) => !deletedTaskSet.has(String(t?.id ?? '')));
    const finalWorkLog = (Array.isArray(finalWorkLogRaw) ? finalWorkLogRaw : [])
      .filter((w) => !deletedWorkSet.has(String(w?.id ?? '')));

    return {
      username: currentUser.email,
      name: profile.character_name,
      race: profile.character_class,
      title: profile.title,
      auraColor: profile.aura_color,
      level: profile.level,
      xp: profile.xp,
      streak: profile.streak,
      skillPoints: profile.skill_points,
      attributes: profile.attributes || {},
      achievements: profile.achievements || [],
      trophies: Array.isArray(extraData.trophies) ? extraData.trophies : [],
      inventory: extraData.items || [],
      coins: Math.max(0, Number(extraData.coins || 0) || 0),
      shopUnlocks: extraData.shopUnlocks || {},
      playerProfilePhoto: extraData.playerProfilePhoto || null,
      cinemaLibrary: Array.isArray(extraData.cinemaLibrary) ? extraData.cinemaLibrary : [],
      cinemaActiveId: extraData.cinemaActiveId || '',
      lastClaim: profile.last_claim,
      playTime: profile.play_time,
      relationshipStart: profile.relationship_start,
      relationshipPhoto: profile.relationship_photo,
      financialGoal: profile.financial_goal || 0,
      oraclePersonality: profile.oracle_personality || 'robot',
      // Dados extras do campo inventory
      job: extraData.job || null,
      bills: extraData.bills || [],
      xpHistory: extraData.xpHistory || {},
      lastTaskReset: extraData.lastTaskReset || null,
      zenBackgroundImage: extraData.zenBackgroundImage || null,
      zenMusic: extraData.zenMusic || null,
      bibleHighlights: Array.isArray(extraData.bibleHighlights) ? extraData.bibleHighlights : [],
        gratitudeJournal: extraData.gratitudeJournal || [],
      taskHistory: extraData.taskHistory || [],
      tasksLastChangedAt: extraData.tasksLastChangedAt || null,
      deletedTaskIds: normalizeIdQueue(extraData.deletedTaskIds || [], 2000),
      adminHiddenRankUserIds: normalizeIdQueue(extraData.adminHiddenRankUserIds || [], 2000),
      expenseGroups: extraData.expenseGroups || [],
      financeMonthHistory: extraData.financeMonthHistory || [],
      financeArchivedKeys: extraData.financeArchivedKeys || [],
      financeCurrentMonth: extraData.financeCurrentMonth || null,
      financeSelectedMonth: extraData.financeSelectedMonth || null,
      financeLastManualResetAt: extraData.financeLastManualResetAt || null,
      savings: extraData.savings || { total: 0, goal: 0, history: [] },
      poker: extraData.poker || { playerChips: 1000, cpuChips: 1000, handsPlayed: 0, wins: 0, losses: 0 },
      pokerOnlineBonusClaimed: !!extraData.pokerOnlineBonusClaimed,
      nofapStartAt: extraData.nofapStartAt || null,
      nofapLastResetAt: extraData.nofapLastResetAt || null,
      nofapShareInChat: !!extraData.nofapShareInChat,
      nofapBestDays: Math.max(0, Number(extraData.nofapBestDays || 0) || 0),
      cloudProfileUpdatedAt: profile.updated_at || extraData.cloudProfileUpdatedAt || null,
      arenaProgress: extraData.arenaProgress || {},
      // Dados de outras tabelas
      dailyTasks: finalTasks,
      finances: finalFinances,
      workLog: finalWorkLog,
      workWeekPlan: fallbackWorkWeekPlan,
      deletedWorkLogIds: normalizeIdQueue(extraData.deletedWorkLogIds || [], 2000),
      oracleMemory: localOracleMemory,
      __cloudCollectionsLoaded: collectionsLoaded
    };
  } catch (error) {
    console.error('âŒ Erro ao carregar da nuvem:', error);
    return null;
  }
}

// Sincroniza TUDO para a nuvem
async function syncAllToCloud(localData) {
  console.log('Iniciando sincronização com nuvem...');
  console.log('currentUser:', currentUser ? currentUser.id : 'NULL');
  console.log('isConfigured:', isSupabaseConfigured());
  
  if (!isSupabaseConfigured()) {
    console.error('âŒ Supabase nÃ£o configurado');
    return false;
  }
  
  if (!currentUser) {
    // Tenta recuperar sessÃ£o
    console.log('âš ï¸ currentUser Ã© null, tentando recuperar sessÃ£o...');
    const session = await supabaseGetSession();
    if (!session || !currentUser) {
      console.error('âŒ Sem usuÃ¡rio logado para sincronizar');
      return false;
    }
  }

  try {
    console.log('Salvando perfil...');
    const rankSnapshot = buildRankSnapshotFromLocalData(localData);
    // 1. Atualiza perfil com TODOS os campos
    await updateProfile({
      character_name: localData.name,
      character_class: localData.race,
      title: localData.title,
      aura_color: localData.auraColor,
      level: localData.level,
      xp: localData.xp,
      streak: localData.streak,
      skill_points: localData.skillPoints || 0,
      attributes: localData.attributes || {},
      achievements: localData.achievements || [],
      inventory: {
        items: localData.inventory || [],
        trophies: Array.isArray(localData.trophies) ? localData.trophies : [],
        coins: Math.max(0, Number(localData.coins || 0) || 0),
        achievementsCount: Array.isArray(localData.achievements) ? localData.achievements.length : 0,
        trophiesCount: Array.isArray(localData.trophies) ? localData.trophies.length : 0,
        rankSnapshot,
        shopUnlocks: localData.shopUnlocks || {},
        playerProfilePhoto: localData.playerProfilePhoto || null,
        cinemaLibrary: Array.isArray(localData.cinemaLibrary) ? localData.cinemaLibrary : [],
        cinemaActiveId: localData.cinemaActiveId || '',
        // Campos extras guardados aqui como JSON
        job: localData.job || null,
        bills: localData.bills || [],
        xpHistory: localData.xpHistory || {},
        lastTaskReset: localData.lastTaskReset || null,
        zenBackgroundImage: localData.zenBackgroundImage || null,
        zenMusic: localData.zenMusic || null,
          bibleHighlights: Array.isArray(localData.bibleHighlights) ? localData.bibleHighlights : [],
          gratitudeJournal: localData.gratitudeJournal || [],
          taskHistory: localData.taskHistory || [],
          tasksLastChangedAt: localData.tasksLastChangedAt || null,
          expenseGroups: localData.expenseGroups || [],
          financeMonthHistory: localData.financeMonthHistory || [],
          financeArchivedKeys: localData.financeArchivedKeys || [],
          financeCurrentMonth: localData.financeCurrentMonth || null,
          financeSelectedMonth: localData.financeSelectedMonth || null,
          financeLastManualResetAt: localData.financeLastManualResetAt || null,
          savings: localData.savings || { total: 0, goal: 0, history: [] },
          poker: localData.poker || { playerChips: 1000, cpuChips: 1000, handsPlayed: 0, wins: 0, losses: 0 },
          pokerOnlineBonusClaimed: !!localData.pokerOnlineBonusClaimed,
          nofapStartAt: localData.nofapStartAt || null,
          nofapLastResetAt: localData.nofapLastResetAt || null,
          nofapShareInChat: !!localData.nofapShareInChat,
          nofapBestDays: Math.max(0, Number(localData.nofapBestDays || 0) || 0),
          cloudProfileUpdatedAt: localData.cloudProfileUpdatedAt || null,
          arenaProgress: localData.arenaProgress || {},
        // Backups extras para recuperação segura
        tasksBackup: normalizeArrayBackup(localData.dailyTasks || [], 800),
        workWeekPlanBackup: normalizeArrayBackup(localData.workWeekPlan || [], 420),
        deletedTaskIds: normalizeIdQueue(localData.deletedTaskIds || [], 2000),
        financesBackup: normalizeArrayBackup(localData.finances || [], 1200),
        // Backup do workLog no campo inventory para nÃ£o perder dados
        workLogBackup: normalizeArrayBackup(localData.workLog || [], 1200),
        deletedWorkLogIds: normalizeIdQueue(localData.deletedWorkLogIds || [], 2000),
        adminHiddenRankUserIds: normalizeIdQueue(localData.adminHiddenRankUserIds || [], 2000)
      },
      last_claim: localData.lastClaim || null,
      play_time: localData.playTime || 0,
      relationship_start: localData.relationshipStart || null,
      relationship_photo: localData.relationshipPhoto || null,
      financial_goal: localData.financialGoal || 0,
      oracle_personality: localData.oraclePersonality || 'robot',
      updated_at: new Date().toISOString()
    });
    console.log('âœ… Perfil salvo!');

    // 2. Sincroniza tarefas (adiciona novas e atualiza existentes)
    let existingTasks = await getTasks();
    const existingIds = new Set(existingTasks.map(t => t.id));

    // 2a. Aplica fila de exclusões de tarefas (evita ressurgimento após sync).
    const pendingTaskDeletes = normalizeIdQueue(localData.deletedTaskIds || [], 2000).filter(isUuidLike);
    if (pendingTaskDeletes.length > 0) {
      const removedTaskIds = [];
      for (const taskId of pendingTaskDeletes) {
        try {
          await deleteTask(taskId);
          removedTaskIds.push(taskId);
        } catch (e) {
          console.warn('Falha ao aplicar exclusão pendente de tarefa:', taskId, e);
        }
      }
      if (removedTaskIds.length > 0) {
        const removedSet = new Set(removedTaskIds.map((id) => String(id)));
        existingTasks = existingTasks.filter((task) => !removedSet.has(String(task?.id)));
        removedTaskIds.forEach((id) => existingIds.delete(id));
        localData.deletedTaskIds = normalizeIdQueue(
          (localData.deletedTaskIds || []).filter((id) => !removedSet.has(String(id))),
          2000
        );
      }
    }

    // 2b. Adiciona novas e atualiza existentes
    if (localData.dailyTasks && localData.dailyTasks.length > 0) {
      // TambÃ©m rastreia por tÃ­tulo+data para evitar duplicatas
      const existingTexts = new Set(existingTasks.map(t => `${t.title}_${t.created_at?.split('T')[0]}`));
      
      for (const task of localData.dailyTasks) {
        // Verifica se jÃ¡ existe por ID ou por texto+data
        const taskKey = `${task.text}_${task.date?.split('T')[0] || new Date().toISOString().split('T')[0]}`;
        const alreadyExists = existingIds.has(task.id) || existingTexts.has(taskKey);
        
        // Se Ã© uma tarefa nova (id numÃ©rico local, nÃ£o UUID) e nÃ£o existe no servidor
        if (typeof task.id === 'number' && !alreadyExists) {
          const newTask = await addTask({
            title: task.text,
            status: task.completed ? 'completed' : 'pending',
            xpReward: task.xpReward || 10,
            dueDate: task.dueDate
          });
          
          if (newTask) {
            task.id = newTask.id;
            // Adiciona ao set para evitar duplicatas na mesma sessÃ£o
            existingTexts.add(taskKey);
          }
        } else if (typeof task.id === 'string' && existingIds.has(task.id)) {
          // Atualiza tarefa existente (status e metadados)
          const existingTask = existingTasks.find(t => t.id === task.id);
          const nextStatus = task.completed ? 'completed' : 'pending';
          if (existingTask && (
            existingTask.status !== nextStatus ||
            String(existingTask.title || '') !== String(task.text || '') ||
            String(existingTask.category || '') !== String(task.category || 'geral') ||
            String(existingTask.due_date || '') !== String(task.dueDate || '')
          )) {
            await updateTask(task.id, {
              title: task.text,
              status: nextStatus,
              category: task.category || 'geral',
              due_date: task.dueDate || null,
              completed_at: task.completed ? new Date().toISOString() : null
            });
          }
        }
      }
    }

    // 3. Sincroniza finanÃ§as
    if (localData.finances && localData.finances.length > 0) {
      const existingFinances = await getFinances();
      const existingIds = new Set(existingFinances.map(f => f.id));
      
      for (const fin of localData.finances) {
        if (typeof fin.id === 'number' && !existingIds.has(fin.id)) {
          const newFin = await addFinance({
            type: fin.type,
            category: fin.category,
            amount: fin.value,
            description: fin.desc
          });
          
          if (newFin) {
            fin.id = newFin.id;
          }
        }
      }
    }

    // 4. Sincroniza sessÃµes de trabalho (workLog)
    const pendingWorkDeletes = normalizeIdQueue(localData.deletedWorkLogIds || [], 2000).filter(isUuidLike);
    if (pendingWorkDeletes.length > 0) {
      const removedWorkIds = [];
      for (const workId of pendingWorkDeletes) {
        try {
          await deleteWorkSession(workId);
          removedWorkIds.push(workId);
        } catch (e) {
          console.warn('Falha ao aplicar exclusão pendente de registro de ponto:', workId, e);
        }
      }
      if (removedWorkIds.length > 0) {
        const removedSet = new Set(removedWorkIds.map((id) => String(id)));
        localData.deletedWorkLogIds = normalizeIdQueue(
          (localData.deletedWorkLogIds || []).filter((id) => !removedSet.has(String(id))),
          2000
        );
      }
    }

    if (localData.workLog && localData.workLog.length > 0) {
      const existingWorkSessions = await getWorkSessions();
      const existingIds = new Set(existingWorkSessions.map(w => String(w.id)));

      for (const work of localData.workLog) {
        const safeId = String(work?.id || '').trim();
        const startAt = Number.isFinite(Number(work?.timestamp))
          ? new Date(Number(work.timestamp)).toISOString()
          : (work?.date ? `${work.date}T00:00:00.000Z` : new Date().toISOString());
        const payload = {
          start_at: startAt,
          end_at: null,
          total_seconds: work?.duration ? Math.floor(Number(work.duration) / 1000) : 0,
          activity_type: work?.type || 'production',
          notes: JSON.stringify({
            inputVal: work?.inputVal,
            financialVal: Number(work?.financialVal || 0) || 0,
            isUnpaid: toBooleanWorkUnpaid(work?.isUnpaid),
            week: work?.week || null,
            month: work?.month || (work?.date ? String(work.date).slice(0, 7) : null),
            note: String(work?.note || '').trim(),
            rateSnapshot: Number(work?.rateSnapshot || 0) || 0,
            type: work?.type || 'production',
            updatedAt: work?.updatedAt || new Date().toISOString()
          })
        };

        try {
          // Registro existente na nuvem: atualiza (corrige edição de não remunerado)
          if (safeId && existingIds.has(safeId) && isUuidLike(safeId)) {
            await updateWorkSession(safeId, payload);
            continue;
          }

          // Registro novo/local: cria na nuvem
          const newWork = await addWorkSession({
            date: work?.date,
            startAt: payload.start_at,
            totalSeconds: payload.total_seconds,
            activityType: payload.activity_type,
            inputVal: work?.inputVal,
            financialVal: Number(work?.financialVal || 0) || 0,
            isUnpaid: toBooleanWorkUnpaid(work?.isUnpaid),
            week: work?.week || null,
            notes: payload.notes
          });

          if (newWork) {
            work.id = newWork.id;
            existingIds.add(String(newWork.id));
          }
        } catch (e) {
          console.warn('Erro ao sincronizar sessÃ£o de trabalho:', e);
        }
      }
    }

    // 5. Sincroniza memÃ³rias do orÃ¡culo
    if (localData.oracleMemory) {
      const existingMemories = await getOracleMemories();
      const existingFacts = new Set(existingMemories.map(m => m.fact));
      
      // Salva informaÃ§Ãµes de perfil
      if (localData.oracleMemory.profile) {
        for (const [key, value] of Object.entries(localData.oracleMemory.profile)) {
          if (value && !existingFacts.has(value)) {
            await saveOracleMemory(key, value, ['profile'], 10);
          }
        }
      }
      
      // Salva memÃ³rias aprendidas
      if (localData.oracleMemory.learned) {
        for (const memory of localData.oracleMemory.learned) {
          if (!existingFacts.has(memory.text)) {
            await saveOracleMemory('memory', memory.text, memory.tags || [], 5);
          }
        }
      }
    }

    console.log('âœ… Todos os dados sincronizados com a nuvem');
    return true;
  } catch (error) {
    console.error('âŒ Erro ao sincronizar:', error);
    return false;
  }
}

// Exporta funÃ§Ãµes para uso global
// ===========================================
// FINANCE INTELLIGENCE - anÃ¡lise simples pÃ³s-transaÃ§Ã£o
// ===========================================

class FinanceIntelligence {
  constructor(client = supabaseClient) {
    this.client = client;
  }

  // Retorna as Ãºltimas N transaÃ§Ãµes do usuÃ¡rio
  async getRecentTransactions(userId, limit = 50) {
    if (!this.client || !userId) return [];
    const { data, error } = await this.client
      .from('finance_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('FinanceIntelligence.getRecentTransactions error', error);
      return [];
    }
    return data || [];
  }

  // Calcula mÃ©dia simples da categoria com base nas Ãºltimas N transaÃ§Ãµes dessa categoria
  async getCategoryAverage(userId, category, lookback = 90) {
    if (!this.client || !userId || !category) return 0;
    try {
      const fromDate = new Date(Date.now() - (lookback * 24 * 60 * 60 * 1000)).toISOString();
      const { data, error } = await this.client
        .from('finance_transactions')
        .select('amount')
        .eq('user_id', userId)
        .eq('category', category)
        .gte('created_at', fromDate)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.warn('FinanceIntelligence.getCategoryAverage error', error);
        return 0;
      }
      if (!data || data.length === 0) return 0;
      const sum = data.reduce((s, r) => s + (r.amount || 0), 0);
      return sum / data.length;
    } catch (e) {
      console.warn('FinanceIntelligence.getCategoryAverage failed', e);
      return 0;
    }
  }

  // Retorna alertas simples baseados na transaÃ§Ã£o
  async checkForAlerts(userId, transaction) {
    const alerts = [];
    if (!transaction) return alerts;

    // Alerta: valor muito alto absoluto
    const HIGH_VALUE_THRESHOLD = 5000; // ajuste por regiÃ£o
    if (transaction.amount >= HIGH_VALUE_THRESHOLD) {
      alerts.push({ type: 'high_amount', message: `Valor alto detectado: R$ ${transaction.amount.toFixed(2)}.` });
    }

    // Alerta: gasto acima da mÃ©dia da categoria
    try {
      const avg = await this.getCategoryAverage(userId, transaction.category || 'Outros');
      if (avg > 0 && transaction.amount > avg * 1.5) {
        const pct = ((transaction.amount / avg - 1) * 100).toFixed(0);
        alerts.push({ type: 'above_average', message: `Este gasto estÃ¡ ${pct}% acima da sua mÃ©dia para ${transaction.category}.` });
      }
    } catch (e) {
      console.warn('FinanceIntelligence.checkForAlerts average check failed', e);
    }

    // Alerta: muitos gastos no mesmo dia (simples heurÃ­stica)
    try {
      const today = new Date().toISOString().slice(0,10);
      const { data: todays, error } = await this.client
        .from('finance_transactions')
        .select('id, amount')
        .eq('user_id', userId)
        .like('created_at', `${today}%`)
        .limit(50);
      if (!error && todays && todays.length >= 10) {
        alerts.push({ type: 'many_today', message: `VocÃª jÃ¡ registrou ${todays.length} transaÃ§Ãµes hoje. EstÃ¡ tudo bem?` });
      }
    } catch (e) {
      console.warn('FinanceIntelligence.checkForAlerts daily check failed', e);
    }

    return alerts;
  }
}

// Mostra alerts no chat do OrÃ¡culo (usa addBotMessage se disponÃ­vel)
function showFinancialAlerts(alerts = []) {
  if (!alerts || alerts.length === 0) return;
  alerts.forEach(a => {
    const text = `âš ï¸ ${a.message}`;
    if (typeof addBotMessage === 'function') {
      try { addBotMessage(text); } catch (e) { console.log('addBotMessage error', e); }
    } else if (window && window.addBotMessage) {
      try { window.addBotMessage(text); } catch (e) { console.log('window.addBotMessage error', e); }
    } else {
      console.log('Financial alert:', text);
    }
  });
}

window.SupabaseService = {
  init: initSupabase,
  isConfigured: isSupabaseConfigured,
  getCurrentUser: () => currentUser,
  
  // Auth
  signUp: supabaseSignUp,
  signIn: supabaseSignIn,
  resetPassword: supabaseResetPassword,
  signOut: supabaseSignOut,
  getSession: supabaseGetSession,
  onAuthStateChange,
  
  // Profile
  getProfile,
  ensureProfile: ensureProfileExists,
  updateProfile,
  isCurrentUserAdmin,
  adminListUsers,
  listRankProfiles,
  adminUpdateUser,
  adminSetUserPassword,
  adminDeleteUser,
  adminSoftDeleteUser,
  
  // Tasks
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  
  // Finance
  getFinances,
  addFinance,
  deleteFinance,
  
  // Work
  getWorkSessions,
  addWorkSession,
  deleteWorkSession,
  
  // XP
  addXpEvent,
  getXpHistory,

  // BÃ­blia
  getBibleNotes,
  addBibleNote,
  updateBibleNote,
  deleteBibleNote,
  
  // Oracle
  saveOracleMessage,
  getOracleMessages,
  saveOracleMemory,
  getOracleMemories,
  deleteOracleMemoriesByPolicy,
  deleteOracleMemoriesByFacts,
  processOracleActions,

  // Sala dos jogadores (Realtime)
  joinPlayerChatRoom,
  sendPlayerChatMessage,
  sendPlayerCallSignal,
  leavePlayerChatRoom,
  joinArenaRoom,
  sendArenaEvent,
  
  deleteAllUserData,
  // Sync
  syncLocalToCloud,
  syncCloudToLocal,
  syncAllToCloud
};

console.log('Supabase Service carregado');

