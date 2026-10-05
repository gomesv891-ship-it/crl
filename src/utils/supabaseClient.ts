import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Default project configuration provided by the user
export const DEFAULT_SUPABASE_URL = 'https://rewcifdxtwvwabnxbafx.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_6oTfXVQa1z45xtlAfSyK2g_Ad2gs-el';

// Storage keys for user credentials (persisted in localStorage, with defaults fallback)
export const STORAGE_SUPABASE_URL_KEY = 'fenix_supabase_url';
export const STORAGE_SUPABASE_KEY_KEY = 'fenix_supabase_anon_key';
export const STORAGE_SUPABASE_AUTO_SYNC_KEY = 'fenix_supabase_auto_sync';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
}

export interface SupabaseSyncStatus {
  connected: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  error: string | null;
  tablesStatus?: Record<string, { count: number; error?: string }>;
}

let supabaseClientInstance: SupabaseClient | null = null;
let currentClientUrl = '';
let currentClientKey = '';

// Limpeza de segurança defensiva: remover credenciais legadas do localStorage
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(STORAGE_SUPABASE_URL_KEY);
    localStorage.removeItem(STORAGE_SUPABASE_KEY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Retrieves the current configured URL directly from project configuration/environment
 */
export function getSupabaseUrl(): string {
  // Garantir que não existam credenciais legadas no localStorage
  try {
    localStorage.removeItem(STORAGE_SUPABASE_URL_KEY);
  } catch {
    // ignore
  }
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return normalizeSupabaseUrl(envUrl.trim());
  }
  return DEFAULT_SUPABASE_URL;
}

/**
 * Cleans and normalizes URL by removing trailing slashes and /rest/v1 if included
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  let u = rawUrl.trim();
  // Remove /rest/v1 or /rest/v1/ suffix if pasted
  u = u.replace(/\/rest\/v1\/?$/, '');
  // Remove trailing slashes
  u = u.replace(/\/+$/, '');
  return u;
}

/**
 * Retrieves the current configured Anon Key directly from project configuration/environment
 */
export function getSupabaseAnonKey(): string {
  // Garantir que não existam credenciais legadas no localStorage
  try {
    localStorage.removeItem(STORAGE_SUPABASE_KEY_KEY);
  } catch {
    // ignore
  }
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

/**
 * Check if auto-sync is enabled (defaults to true)
 */
export function isSupabaseAutoSyncEnabled(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_SUPABASE_AUTO_SYNC_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {
    // ignore
  }
  return true;
}

export function setSupabaseAutoSyncEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_SUPABASE_AUTO_SYNC_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('fenix_supabase_config_changed'));
  } catch {
    // ignore
  }
}

/**
 * Saves sync settings without storing credentials in localStorage
 */
export function saveSupabaseConfig(_url?: string, _anonKey?: string, autoSync = true) {
  try {
    localStorage.removeItem(STORAGE_SUPABASE_URL_KEY);
    localStorage.removeItem(STORAGE_SUPABASE_KEY_KEY);
    localStorage.setItem(STORAGE_SUPABASE_AUTO_SYNC_KEY, autoSync ? 'true' : 'false');
    // Invalidate client instance so it rebuilds on next call
    supabaseClientInstance = null;
    currentClientUrl = '';
    currentClientKey = '';
    window.dispatchEvent(new CustomEvent('fenix_supabase_config_changed'));
  } catch (err) {
    console.error('Erro ao salvar configurações de sincronização do Supabase:', err);
  }
}

/**
 * Gets or initializes the Supabase client safely
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) return null;

  if (supabaseClientInstance && currentClientUrl === url && currentClientKey === key) {
    return supabaseClientInstance;
  }

  try {
    supabaseClientInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    currentClientUrl = url;
    currentClientKey = key;
    return supabaseClientInstance;
  } catch (err) {
    console.error('Falha ao inicializar cliente Supabase:', err);
    return null;
  }
}

// Global sync state and listeners
let currentSyncStatus: SupabaseSyncStatus = {
  connected: false,
  isSyncing: false,
  lastSyncTime: null,
  error: null,
};

const listeners = new Set<(status: SupabaseSyncStatus) => void>();

export function getSupabaseSyncStatus(): SupabaseSyncStatus {
  return { ...currentSyncStatus };
}

export function subscribeSupabaseSyncStatus(listener: (status: SupabaseSyncStatus) => void): () => void {
  listeners.add(listener);
  listener({ ...currentSyncStatus });
  return () => {
    listeners.delete(listener);
  };
}

function notifyStatus() {
  const status = { ...currentSyncStatus };
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      // ignore
    }
  });
  window.dispatchEvent(new CustomEvent('fenix_supabase_status_changed', { detail: status }));
}

/**
 * Tests connection with Supabase by issuing a lightweight health check
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; error?: string; message?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Credenciais do Supabase não configuradas.' };
  }

  try {
    currentSyncStatus.isSyncing = true;
    notifyStatus();

    // Probe the rest endpoint with the anon key
    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();
    const res = await fetch(`${url}/rest/v1/fenix_kv_store?select=key&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (res.status === 200) {
      currentSyncStatus.connected = true;
      currentSyncStatus.error = null;
      currentSyncStatus.isSyncing = false;
      notifyStatus();
      return { success: true, message: 'Conectado com sucesso ao Supabase! Tabela sincronizada.' };
    }

    // If 404, table doesn't exist yet, but credentials and network are 100% valid!
    if (res.status === 404) {
      currentSyncStatus.connected = true;
      currentSyncStatus.error = null;
      currentSyncStatus.isSyncing = false;
      notifyStatus();
      return {
        success: true,
        message: 'Conectado ao Supabase com sucesso! (Tabela de sincronização pronta para ser criada via script SQL).',
      };
    }

    if (res.status === 401 || res.status === 403) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Chave anon/publishable inválida ou sem permissão (${res.status}): ${errText}`);
    }

    currentSyncStatus.connected = true;
    currentSyncStatus.error = null;
    currentSyncStatus.isSyncing = false;
    notifyStatus();
    return { success: true, message: `Conectado ao projeto Supabase (status HTTP ${res.status}).` };
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha ao conectar com o Supabase.';
    currentSyncStatus.connected = false;
    currentSyncStatus.error = errorMsg;
    currentSyncStatus.isSyncing = false;
    notifyStatus();
    return { success: false, error: errorMsg };
  }
}

/**
 * List of primary localStorage collections to sync with Supabase
 */
export const SYNC_COLLECTIONS: { key: string; label: string; description: string }[] = [
  { key: 'fenix_clients_db', label: 'Clientes', description: 'Cadastro e perfil dos clientes' },
  { key: 'fenix_orcamentos_history', label: 'Histórico de Orçamentos', description: 'Todos os orçamentos emitidos' },
  { key: 'fenix_saved_orcamentos', label: 'Orçamentos Salvos', description: 'Modelos e propostas gravadas' },
  { key: 'fenix_product_items_data', label: 'Produtos', description: 'Catálogo de itens e preços' },
  { key: 'fenix_product_categories_data', label: 'Categorias de Produtos', description: 'Categorias oficiais' },
  { key: 'fenix_product_groups_data', label: 'Grupos de Produtos', description: 'Grupos de acabamentos' },
  { key: 'fenix_followup_cards_v2', label: 'Follow-up (Cards)', description: 'Pipeline de acompanhamento comercial' },
  { key: 'fenix_prospeccao_clients_db', label: 'Prospecção', description: 'Clientes e contatos em prospecção' },
  { key: 'fenix_tarefas_db', label: 'Tarefas', description: 'Lista e status de tarefas da equipe' },
  { key: 'fenix_pos_vendas_db', label: 'Pós-Vendas', description: 'Atendimentos de pós-venda' },
  { key: 'fenix_boletos_db', label: 'Boletos', description: 'Controle de boletos e vencimentos' },
  { key: 'fenix_pendencias_v1', label: 'Pendências', description: 'Avisos e pendências operacionais' },
  { key: 'fenix_header_notifications_v2', label: 'Notificações', description: 'Notificações do sistema e alertas entre usuários' },
  { key: 'fenix_activities_db', label: 'Atividades e Histórico', description: 'Registro de atividades e eventos' },
  { key: 'fenix_notes_db', label: 'Anotações', description: 'Blocos de notas e registros internos' },
  { key: 'fenix_usuarios_v2', label: 'Usuários do Sistema', description: 'Contas, cargos e módulos autorizados' },
  { key: 'fenix_auth_users_v2', label: 'Contas de Acesso (Auth)', description: 'Senhas, logins e status dos usuários' },
  { key: 'fenix_metas_sales_db', label: 'Vendas das Metas', description: 'Lançamentos de vendas do mês' },
  { key: 'fenix_visitas_db', label: 'Visitas Técnicas', description: 'Vistorias e medições' },
  { key: 'fenix_agendamento_visitas', label: 'Visitas Técnicas (Oficial)', description: 'Vistorias e medições oficiais' },
  { key: 'fenix_instalacoes_db', label: 'Instalações', description: 'Obras e cronogramas de montagem' },
  { key: 'fenix_agendamento_instalacoes', label: 'Instalações (Oficial)', description: 'Obras e cronogramas de montagem oficiais' },
  { key: 'fenix_retornos_db', label: 'Retornos Operacionais', description: 'Retornos e assistências técnicas' },
  { key: 'fenix_agendamento_retornos', label: 'Retornos Operacionais (Oficial)', description: 'Retornos e assistências técnicas oficiais' },
  { key: 'fenix_instaladores_db', label: 'Instaladores', description: 'Equipes e montadores cadastrados' },
  { key: 'fenix_agendamento_instaladores', label: 'Instaladores (Oficial)', description: 'Equipes e montadores cadastrados oficiais' },
  { key: 'fenix_estoque_items', label: 'Estoque (Itens)', description: 'Produtos, saldos e status do estoque' },
  { key: 'fenix_estoque_categories', label: 'Estoque (Categorias)', description: 'Categorias manuais e independentes de estoque' },
  { key: 'fenix_estoque_groups', label: 'Estoque (Grupos)', description: 'Grupos manuais e independentes de estoque' },
  { key: 'fenix_estoque_movimentacoes', label: 'Movimentações de Estoque', description: 'Entradas, Saídas - Venda e Saídas - Outro' },
  { key: 'fenix_estoque_insumos_v1', label: 'Insumos de Loja', description: 'Materiais de consumo e ferramentas' },
  { key: 'fenix_vendas_gerencial', label: 'Gestão de Vendas (Diretoria)', description: 'Vendas, custos, lucros e margens' },
  { key: 'fenix_chat_messages', label: 'Chat Interno (Mensagens)', description: 'Mensagens de chat em tempo real da equipe' },
  { key: 'fenix_user_presence', label: 'Chat Interno (Presença)', description: 'Status Online/Offline e batimentos de presença' },
  { key: 'fenix_marketplace_sales_db', label: 'Vendas Marketplace (Jeferson)', description: 'Lançamentos de vendas marketplace' },
  { key: 'fenix_estoque_insumos_movs_v1', label: 'Insumos de Loja (Movimentações)', description: 'Entradas e saídas de insumos' },
  { key: 'fenix_product_costs_db', label: 'Custos dos Produtos (Diretoria)', description: 'Tabela oficial de custos' },
  { key: 'fenix_custos_estrutura_v1', label: 'Custos de Estrutura', description: 'Custos fixos e operacionais' },
  { key: 'fenix_custos_comissoes_v1', label: 'Custos de Comissões', description: 'Comissões comerciais' },
  { key: 'fenix_custos_nota_fiscal_v1', label: 'Custos de Nota Fiscal', description: 'Alíquotas fiscais' },
  { key: 'fenix_custos_rateio_v1', label: 'Custos de Rateio', description: 'Rateios de custos' },
  { key: 'fenix_custos_tarkett_itens_v1', label: 'Itens Tarkett', description: 'Tabela de itens e acabamentos Tarkett' },
  { key: 'fenix_tarkett_produtos_catalogo', label: 'Catálogo Tarkett', description: 'Produtos do catálogo Tarkett' },
  { key: 'fenix_calculadora_rendimentos', label: 'Rendimentos da Calculadora', description: 'Base independente de rendimentos técnicos' },
  { key: 'fenix_custos_variaveis_v1', label: 'Custos Variáveis', description: 'Configuração de custos variáveis' },
  { key: 'fenix_custos_pedido_regras_v1', label: 'Regras de Custos do Pedido', description: 'Regras de custos automáticos por pedido' },
  { key: 'fenix_custos_pagamentos_v1', label: 'Taxas de Meios de Pagamento', description: 'Taxas de cartão, boleto e formas de pagamento' },
  { key: 'fenix_custos_marketplace_v1', label: 'Custos de Marketplace', description: 'Comissões e taxas de canais de venda' },
  { key: 'fenix_tarkett_simulacoes_v1', label: 'Simulações Tarkett', description: 'Histórico de simulações oficiais Tarkett' },
  { key: 'fenix_whatsapp_templates_by_category', label: 'Modelos WhatsApp', description: 'Modelos de mensagens do WhatsApp por categoria' },
  { key: 'fenix_config_whatsapp_categories_v2', label: 'Modelos WhatsApp (Backup)', description: 'Modelos de mensagens do WhatsApp' },
  { key: 'fenix_config_mensagem_orcamento', label: 'Mensagem de Orçamento', description: 'Modelo oficial de envio de orçamento' },
  { key: 'fenix_metas_config_data', label: 'Configurações de Metas', description: 'Parâmetros e metas mensais' },
  { key: 'fenix_individual_metas_map', label: 'Metas Individuais de Consultoras', description: 'Metas por vendedora' },
];

// Registro de timestamps locais para supressão de eco no Realtime (evita re-renderizações e loops)
const lastSelfSavedTimestamps: Record<string, string> = {};

export function recordSelfSave(key: string, timestampIso: string) {
  lastSelfSavedTimestamps[key] = timestampIso;
}

export function isRecentSelfSave(key: string, timestampIso?: string): boolean {
  if (!timestampIso) return false;
  return lastSelfSavedTimestamps[key] === timestampIso;
}

// ==============================================================================
// GESTÃO DE CACHE EM MEMÓRIA (SUPABASE COMO FONTE OFICIAL DA VERDADE)
// ==============================================================================
export interface MemoryCacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const memoryStore = new Map<string, MemoryCacheEntry>();
const inFlightPullRequests = new Map<string, Promise<any>>();
const MEMORY_CACHE_TTL_MS = 30000; // 30s de cache rápido em memória

/**
 * Lê do cache em memória (se disponível e dentro do TTL)
 */
export function getMemoryCollection<T = any>(key: string, maxAgeMs = MEMORY_CACHE_TTL_MS): T | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    return null;
  }
  return entry.data as T;
}

/**
 * Grava ou atualiza uma coleção no cache em memória
 */
export function setMemoryCollection<T = any>(key: string, data: T): void {
  memoryStore.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalida o cache em memória de uma coleção
 */
export function invalidateMemoryCollection(key: string): void {
  memoryStore.delete(key);
}

/**
 * Obtém os dados de uma coleção com prioridade total para o Supabase:
 * 1. Cache em memória fresco (0ms)
 * 2. Consulta direta à base oficial do Supabase
 * 3. Fallback defensivo em localStorage
 */
export async function getCollectionWithSupabasePriority<T = any[]>(key: string, idField = 'id'): Promise<T> {
  const mem = getMemoryCollection<T>(key);
  if (mem !== null && mem !== undefined) {
    return mem;
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: row, error } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', key)
        .maybeSingle();

      if (!error && row && row.data !== undefined) {
        let parsed = row.data;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {}
        }
        setMemoryCollection(key, parsed);
        try {
          localStorage.setItem(key, typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
        } catch {}
        return parsed as T;
      }
    } catch (e) {
      console.warn(`[SUPABASE-GET] Fallback para ${key}:`, e);
    }
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      setMemoryCollection(key, parsed);
      return parsed as T;
    }
  } catch {}

  return ([] as unknown) as T;
}

// Fila offline para proteção total contra perda de dados em falhas de rede
const OFFLINE_SYNC_QUEUE_KEY = 'fenix_pending_sync_queue_v1';

export interface PendingSyncItem {
  id: string;
  collectionKey: string;
  item: any;
  idField: string;
  user: string;
  timestamp: number;
}

export function queuePendingItem(collectionKey: string, item: any, idField: string, user: string) {
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    const queue: PendingSyncItem[] = raw ? JSON.parse(raw) : [];
    const itemId = String(item[idField] ?? item.id ?? Date.now());
    const filtered = queue.filter(
      (q) => !(q.collectionKey === collectionKey && String(q.item[idField] ?? q.item.id) === itemId)
    );
    filtered.push({
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      collectionKey,
      item,
      idField,
      user,
      timestamp: Date.now(),
    });
    localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Erro ao registrar item na fila offline:', err);
  }
}

/**
 * Utilitário de timeout seguro: se a promessa exceder timeoutMs, retorna fallbackValue sem travar
 */
export function withTimeout<T = any>(
  promiseOrThenable: any,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  const promise = Promise.resolve(promiseOrThenable);
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackValue);
    }, timeoutMs);
  });
  return Promise.race([
    promise
      .then((res) => {
        clearTimeout(timer);
        return res;
      })
      .catch((err) => {
        clearTimeout(timer);
        console.warn('Promise capturada com fallback no withTimeout:', err);
        return fallbackValue;
      }),
    timeoutPromise,
  ]);
}

/**
 * Utilitário de resiliência com retentativa exponencial e detecção aprofundada de erros transitórios
 * (como PGRST002 "schema cache reload", 503 "Service Unavailable", 57014 "statement timeout", 55P03 lock timeouts e quedas de rede).
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 300
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.code === 'PGRST002' ||
        err?.code === '57014' ||
        err?.code === '55P03' ||
        err?.code === 'PGRST000' ||
        err?.status === 500 ||
        err?.status === 502 ||
        err?.status === 503 ||
        err?.status === 504 ||
        err?.message?.includes('schema cache') ||
        err?.message?.includes('statement timeout') ||
        err?.message?.includes('lock timeout') ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network') ||
        err?.message?.includes('aborted');

      if (attempt < maxRetries && isTransient) {
        const jitter = Math.floor(Math.random() * 150);
        const delay = Math.round(baseDelayMs * Math.pow(1.5, attempt - 1)) + jitter;
        console.warn(`[SUPABASE-RETRY] Tentativa ${attempt}/${maxRetries} falhou com erro transitório (${err?.code || err?.message}). Aguardando ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * SQL script to easily create and harden the synchronization table in Supabase SQL Editor
 * Includes strict RLS policies (preventing arbitrary deletes, validating allowed keys and payload sizes)
 */
export const SUPABASE_SETUP_SQL = `-- ==============================================================================
-- ATUALIZAÇÃO E BLINDAGEM DE SEGURANÇA (RLS) - CRM FÊNIX WORLD
-- Execute este script no "SQL Editor" do Supabase:
-- https://supabase.com/dashboard/project/rewcifdxtwvwabnxbafx/sql
-- ==============================================================================

-- 1. Garante que a tabela existe com tipos e restrições seguras
CREATE TABLE IF NOT EXISTS public.fenix_kv_store (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz DEFAULT now(),
    updated_by text DEFAULT 'CRM Fênix'
);

-- 2. Habilita obrigatoriamente Row Level Security (RLS)
ALTER TABLE public.fenix_kv_store ENABLE ROW LEVEL SECURITY;

-- 3. Remove políticas antigas/permissivas demais para aplicar as regras blindadas
DROP POLICY IF EXISTS "Permitir leitura anonima no CRM" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "Permitir insercao e atualizacao anonima no CRM" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Leitura de dados autenticados e anonimos" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Insercao de colecoes validas" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Atualizacao de colecoes validas" ON public.fenix_kv_store;
DROP POLICY IF EXISTS "CRM Fenix: Bloqueio de exclusao acidental" ON public.fenix_kv_store;

-- 4. POLÍTICA DE LEITURA (SELECT):
-- Permite leitura apenas de chaves legítimas do sistema Fênix
CREATE POLICY "CRM Fenix: Leitura de colecoes validas"
ON public.fenix_kv_store
FOR SELECT
TO anon, authenticated
USING (
    key LIKE 'fenix_%'
);

-- 5. POLÍTICA DE INSERÇÃO (INSERT):
-- Previne injeção de tabelas desconhecidas ou spam (limite de 15MB por payload)
CREATE POLICY "CRM Fenix: Insercao de colecoes validas"
ON public.fenix_kv_store
FOR INSERT
TO anon, authenticated
WITH CHECK (
    key LIKE 'fenix_%'
    AND length(key) <= 120
    AND pg_column_size(data) <= 15728640
);

-- 6. POLÍTICA DE ATUALIZAÇÃO (UPDATE):
-- Permite atualizar registros existentes mantendo a integridade
CREATE POLICY "CRM Fenix: Atualizacao de colecoes validas"
ON public.fenix_kv_store
FOR UPDATE
TO anon, authenticated
USING (key LIKE 'fenix_%')
WITH CHECK (
    key LIKE 'fenix_%'
    AND length(key) <= 120
    AND pg_column_size(data) <= 15728640
);

-- 7. POLÍTICA DE EXCLUSÃO (DELETE):
-- Nenhuma requisição anônima pública pode apagar registros inteiros acidentalmente
CREATE POLICY "CRM Fenix: Bloqueio de exclusao publica"
ON public.fenix_kv_store
FOR DELETE
TO authenticated
USING (key LIKE 'fenix_%');

-- ==============================================================================
-- 8. CRIAÇÃO E CONFIGURAÇÃO DOS BUCKETS NO SUPABASE STORAGE
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('catalogos', 'catalogos', true, 104857600, NULL),
  ('documentos', 'documentos', true, 104857600, NULL),
  ('modelos', 'modelos', true, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de RLS para acesso e upload aos arquivos no Supabase Storage:
DROP POLICY IF EXISTS "CRM Fenix Storage: Leitura publica de arquivos" ON storage.objects;
DROP POLICY IF EXISTS "CRM Fenix Storage: Upload de arquivos" ON storage.objects;
DROP POLICY IF EXISTS "CRM Fenix Storage: Atualizacao de arquivos" ON storage.objects;
DROP POLICY IF EXISTS "CRM Fenix Storage: Exclusao de arquivos" ON storage.objects;

CREATE POLICY "CRM Fenix Storage: Leitura publica de arquivos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('catalogos', 'documentos', 'modelos'));

CREATE POLICY "CRM Fenix Storage: Upload de arquivos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id IN ('catalogos', 'documentos', 'modelos'));

CREATE POLICY "CRM Fenix Storage: Atualizacao de arquivos"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id IN ('catalogos', 'documentos', 'modelos'));

CREATE POLICY "CRM Fenix Storage: Exclusao de arquivos"
ON storage.objects FOR DELETE
TO public
USING (bucket_id IN ('catalogos', 'documentos', 'modelos'));

-- Confirmação
SELECT 'Políticas RLS e Buckets de Storage do CRM Fênix aplicados e blindados com sucesso!' AS status;
`;

/**
 * Sends all local data from localStorage to Supabase (Backup / Push)
 */
export async function pushAllLocalDataToSupabase(currentUser = 'Vanessa Gomes'): Promise<{
  success: boolean;
  syncedCount: number;
  error?: string;
  details?: Record<string, boolean>;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, syncedCount: 0, error: 'Supabase não inicializado.' };
  }

  currentSyncStatus.isSyncing = true;
  notifyStatus();

  let syncedCount = 0;
  const details: Record<string, boolean> = {};

  try {
    for (const col of SYNC_COLLECTIONS) {
      try {
        const raw = localStorage.getItem(col.key);
        if (raw === null) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        const payload = {
          key: col.key,
          data: parsed,
          updated_at: new Date().toISOString(),
          updated_by: currentUser,
        };

        const { error } = await client
          .from('fenix_kv_store')
          .upsert(payload, { onConflict: 'key' });

        if (error) {
          console.warn(`Erro ao sincronizar chave ${col.key} no Supabase:`, error);
          details[col.key] = false;
        } else {
          syncedCount++;
          details[col.key] = true;
        }
      } catch (colErr) {
        console.warn(`Exceção na chave ${col.key}:`, colErr);
        details[col.key] = false;
      }
    }

    currentSyncStatus.connected = true;
    currentSyncStatus.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
    currentSyncStatus.error = null;
    currentSyncStatus.isSyncing = false;
    notifyStatus();

    return {
      success: syncedCount > 0,
      syncedCount,
      details,
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Erro durante sincronização com Supabase.';
    currentSyncStatus.isSyncing = false;
    currentSyncStatus.error = errorMsg;
    notifyStatus();
    return { success: false, syncedCount, error: errorMsg };
  }
}

/**
 * Dispatches targeted and general events to notify all active UI components
 */
export function dispatchCollectionEvents(collectionKey: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage'));
  if (collectionKey === 'fenix_clients_db') window.dispatchEvent(new Event('fenix_clients_updated'));
  if (collectionKey.includes('orcamento')) window.dispatchEvent(new Event('fenix_orcamentos_updated'));
  if (collectionKey.includes('followup')) window.dispatchEvent(new Event('fenix_followup_updated'));
  if (collectionKey.includes('tarefas')) window.dispatchEvent(new Event('fenix_tarefas_updated'));
  if (collectionKey.includes('metas')) {
    window.dispatchEvent(new Event('fenix_metas_updated'));
    window.dispatchEvent(new Event('fenix_metas_config_updated'));
  }
  if (collectionKey.includes('usuarios') || collectionKey.includes('auth')) {
    window.dispatchEvent(new Event('fenix_auth_updated'));
    window.dispatchEvent(new Event('fenix_users_updated'));
  }
  if (collectionKey.includes('notes')) window.dispatchEvent(new Event('fenix_notes_updated'));
  if (collectionKey.includes('pendencias')) window.dispatchEvent(new Event('fenix_pendencias_updated'));
  if (collectionKey.includes('notification')) window.dispatchEvent(new Event('fenix_notifications_updated'));
  if (collectionKey.includes('product')) window.dispatchEvent(new Event('fenix_products_updated'));
  if (
    collectionKey.includes('pos_vendas') ||
    collectionKey.includes('agendamento') ||
    collectionKey.includes('visitas') ||
    collectionKey.includes('instalac') ||
    collectionKey.includes('retorno') ||
    collectionKey.includes('instalador')
  ) {
    window.dispatchEvent(new Event('fenix_pos_vendas_updated'));
    window.dispatchEvent(new Event('fenix_agendamento_updated'));
  }
  if (collectionKey.includes('boletos')) window.dispatchEvent(new Event('fenix_boletos_updated'));
  if (collectionKey.includes('estoque')) {
    window.dispatchEvent(new Event('fenix_estoque_updated'));
    window.dispatchEvent(new Event('fenix_estoque_items'));
    window.dispatchEvent(new Event('fenix_estoque_movimentacoes'));
  }
  if (collectionKey.includes('vendas')) {
    window.dispatchEvent(new Event('fenix_vendas_updated'));
    window.dispatchEvent(new Event('fenix_vendas_gerencial_updated'));
  }
  if (collectionKey.includes('marketplace')) window.dispatchEvent(new Event('fenix_marketplace_sales_updated'));
  if (collectionKey.includes('chat')) window.dispatchEvent(new Event('fenix_chat_updated'));
  if (collectionKey.includes('presence')) window.dispatchEvent(new Event('fenix_presence_updated'));
  if (collectionKey.includes('rendimentos')) window.dispatchEvent(new Event('fenix_rendimentos_updated'));
  if (collectionKey.includes('custos')) {
    window.dispatchEvent(new Event('fenix_custos_config_updated'));
    window.dispatchEvent(new Event('fenix_custos_variaveis_updated'));
    window.dispatchEvent(new Event('fenix_custos_tarkett_updated'));
  }
  if (collectionKey.includes('tarkett')) {
    window.dispatchEvent(new Event('fenix_tarkett_produtos_updated'));
    window.dispatchEvent(new Event('fenix_custos_tarkett_updated'));
  }
  if (collectionKey.includes('whatsapp') || collectionKey.includes('msg')) window.dispatchEvent(new Event('fenix_orcamento_msg_updated'));
  if (collectionKey.includes('usuarios') || collectionKey.includes('auth')) {
    window.dispatchEvent(new Event('fenix_auth_updated'));
    window.dispatchEvent(new Event('fenix_users_updated'));
  }
  if (collectionKey.includes('metas')) {
    window.dispatchEvent(new Event('fenix_metas_config_updated'));
    window.dispatchEvent(new Event('fenix_metas_updated'));
  }
  if (collectionKey.includes('notif_prefs')) {
    window.dispatchEvent(new Event('fenix_notif_prefs_updated'));
  }
}

/**
 * Helper to ensure a list has strictly unique items by an idField.
 */
export function deduplicateListById<T = any>(list: T[], idField = 'id'): T[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of list) {
    if (!item) continue;
    const val = (item as any)[idField] ?? (item as any).id ?? (item as any)._id ?? (item as any).idOrcamento ?? (item as any).pedido ?? (item as any).codigo;
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const key = String(val).trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Merge seguro e atômico de duas listas (remota e local):
 * - Preserva todos os registros existentes.
 * - Atualiza os campos dos registros coincidentes pelo ID.
 * - NUNCA descarta itens remotos ou locais.
 */
export function safeMergeLists<T = any>(
  primaryList: T[],
  secondaryList: T[],
  idField = 'id'
): T[] {
  if (!Array.isArray(primaryList)) primaryList = [];
  if (!Array.isArray(secondaryList)) secondaryList = [];

  const map = new Map<string, T>();

  const extractId = (item: any): string | null => {
    if (!item || typeof item !== 'object') return null;
    const v =
      item[idField] ??
      item.id ??
      item._id ??
      item.idOrcamento ??
      item.orcamentoId ??
      item.pedido ??
      item.codigo ??
      item.uuid;
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
    return null;
  };

  // 1. Processa lista primária (ex: dados remotos já persistidos)
  for (const item of primaryList) {
    if (!item) continue;
    const key = extractId(item);
    if (key) {
      map.set(key, item);
    } else {
      map.set(`gen_key_${Math.random().toString(36).slice(2)}`, item);
    }
  }

  // 2. Mescla lista secundária (ex: alterações mais recentes ou locais)
  for (const item of secondaryList) {
    if (!item) continue;
    const key = extractId(item);
    if (key) {
      const existing = map.get(key);
      if (existing) {
        // Merge seguro mantendo campos pré-existentes e protegendo status 'Vendido' / 'Fechado'
        const existingStatus = String((existing as any).status || '').trim();
        const incomingStatus = String((item as any).status || '').trim();
        const isExistingSold = existingStatus === 'Vendido' || existingStatus === 'Fechado' || existingStatus === 'Fechados';
        const isIncomingSold = incomingStatus === 'Vendido' || incomingStatus === 'Fechado' || incomingStatus === 'Fechados';

        const merged: any = { ...existing, ...item };
        // Se o registro já estava como Vendido e o item secundário tem status diferente sem atualização mais nova, preserva Vendido
        if (isExistingSold && !isIncomingSold) {
          const existingUpdated = (existing as any).dataAtualizacao || (existing as any).updatedAt;
          const incomingUpdated = (item as any).dataAtualizacao || (item as any).updatedAt;
          if (!incomingUpdated || (existingUpdated && new Date(existingUpdated).getTime() >= new Date(incomingUpdated).getTime())) {
            merged.status = (existing as any).status;
            if ((existing as any).pedido) merged.pedido = (existing as any).pedido;
            if ((existing as any).formaPagamento) merged.formaPagamento = (existing as any).formaPagamento;
            if ((existing as any).formasPagamento) merged.formasPagamento = (existing as any).formasPagamento;
          }
        } else if (isIncomingSold) {
          merged.status = 'Vendido';
        }
        map.set(key, merged);
      } else {
        map.set(key, item);
      }
    } else {
      map.set(`gen_key_${Math.random().toString(36).slice(2)}`, item);
    }
  }

  return Array.from(map.values());
}

/**
 * Esvazia e processa a fila de operações pendentes geradas em momentos de instabilidade/offline
 */
export async function drainPendingSyncQueue(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    if (!raw) return 0;
    const queue: PendingSyncItem[] = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return 0;

    let synced = 0;
    const remaining: PendingSyncItem[] = [];

    for (const q of queue) {
      try {
        const res = await saveItemToSupabase(q.collectionKey, q.item, q.idField, q.user);
        if (res.success) {
          synced++;
        } else {
          remaining.push(q);
        }
      } catch {
        remaining.push(q);
      }
    }

    if (remaining.length === 0) {
      localStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
    } else {
      localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(remaining));
    }
    return synced;
  } catch {
    return 0;
  }
}

/**
 * Initializes a Supabase Realtime channel subscription to receive instant updates
 * whenever any row in fenix_kv_store changes across any connected client.
 * Com supressão de eco local para evitar re-renderizações e loops infinitos.
 */
export function initSupabaseRealtimeSubscription(): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const channel = client
      .channel('fenix_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fenix_kv_store' },
        (payload: any) => {
          if (payload?.new && payload.new.key && payload.new.data !== undefined) {
            const key = payload.new.key;
            // Arquivos binários/PDFs em base64 não devem ser gravados via stream simples
            if (key.startsWith('fenix_file_') || key.startsWith('fenix_test_')) {
              return;
            }

            // Supressão de eco: se a alteração foi originada por esta própria sessão, não re-renderizar
            const updatedAt = payload.new.updated_at;
            if (isRecentSelfSave(key, updatedAt)) {
              return;
            }

            // Presença de usuários: despacha evento específico sem re-renderizar todo o CRM
            if (key === 'fenix_user_presence') {
              try {
                localStorage.setItem(key, typeof payload.new.data === 'string' ? payload.new.data : JSON.stringify(payload.new.data));
                window.dispatchEvent(new Event('fenix_presence_updated'));
              } catch {}
              return;
            }

            try {
              let parsedData = payload.new.data;
              if (typeof parsedData === 'string') {
                try {
                  parsedData = JSON.parse(parsedData);
                } catch {}
              }

              // Proteção anti-sobrescrita: se recebido array vazio e o local tem dados, preservar local!
              const currentLocalRaw = localStorage.getItem(key);
              let localList: any[] = [];
              if (currentLocalRaw) {
                try {
                  const p = JSON.parse(currentLocalRaw);
                  if (Array.isArray(p)) localList = p;
                } catch {}
              }

              if (Array.isArray(parsedData)) {
                if (parsedData.length === 0 && localList.length > 0) {
                  console.warn(`[REALTIME-PROTECTION] Ignorada tentativa de wipe em ${key} via Realtime.`);
                  return;
                }
                const merged = safeMergeLists(parsedData, localList, 'id');
                setMemoryCollection(key, merged);
                const stringVal = JSON.stringify(merged);
                if (currentLocalRaw !== stringVal) {
                  localStorage.setItem(key, stringVal);
                  dispatchCollectionEvents(key);
                }
              } else {
                setMemoryCollection(key, parsedData);
                const stringVal = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData);
                if (currentLocalRaw !== stringVal) {
                  localStorage.setItem(key, stringVal);
                  dispatchCollectionEvents(key);
                }
              }
            } catch (e) {
              console.warn('Erro ao atualizar cache local via Realtime:', e);
            }
          }
        }
      )
      .subscribe();

    return () => {
      try {
        client.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  } catch (err) {
    console.warn('Realtime Supabase não pôde ser iniciado:', err);
    return null;
  }
}

/**
 * Mapeamento de coleções por módulo/aba para carregamento on-demand (lazy load).
 * O sistema carrega os dados de cada módulo somente quando a aba for acessada.
 */
export const TAB_COLLECTIONS_MAP: Record<string, string[]> = {
  'Clientes': ['fenix_clients_db'],
  'Cadastro': ['fenix_clients_db'],
  'Calculadora': ['fenix_clients_db', 'fenix_product_items_data', 'fenix_product_categories_data', 'fenix_product_groups_data', 'fenix_calculadora_rendimentos'],
  'Orçamentos': ['fenix_clients_db', 'fenix_saved_orcamentos', 'fenix_orcamentos_history'],
  'Agenda': ['fenix_tarefas_db', 'fenix_clients_db'],
  'Tarefas': ['fenix_tarefas_db', 'fenix_clients_db'],
  'Follow-up': ['fenix_followup_cards_v2', 'fenix_clients_db', 'fenix_saved_orcamentos', 'fenix_orcamentos_history', 'fenix_metas_sales_db'],
  'FollowUp': ['fenix_followup_cards_v2', 'fenix_clients_db', 'fenix_saved_orcamentos', 'fenix_orcamentos_history', 'fenix_metas_sales_db'],
  'Obras': ['fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'Pós-Vendas': ['fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'PosVendas': ['fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'Pós Vendas': ['fenix_pos_vendas_db', 'fenix_agendamento_visitas', 'fenix_agendamento_instalacoes', 'fenix_agendamento_retornos', 'fenix_agendamento_instaladores', 'fenix_clients_db'],
  'Boletos': ['fenix_boletos_db', 'fenix_clients_db'],
  'Pendências': ['fenix_pendencias_v1'],
  'Pendencias': ['fenix_pendencias_v1'],
  'Notas': ['fenix_notes_db'],
  'Metas': ['fenix_metas_sales_db', 'fenix_followup_cards_v2', 'fenix_clients_db', 'fenix_pos_vendas_db', 'fenix_deleted_vendas_ids', 'fenix_vendas_gerencial', 'fenix_metas_config_data'],
  'Meta': ['fenix_metas_sales_db', 'fenix_followup_cards_v2', 'fenix_clients_db', 'fenix_pos_vendas_db', 'fenix_deleted_vendas_ids', 'fenix_vendas_gerencial', 'fenix_metas_config_data'],
  'Produtos': ['fenix_product_items_data', 'fenix_product_categories_data', 'fenix_product_groups_data', 'fenix_product_costs_db', 'fenix_custos_tarkett_itens_v1', 'fenix_tarkett_produtos_catalogo'],
  'Configurações': [
    'fenix_usuarios_v2',
    'fenix_auth_users_v2',
    'fenix_custos_estrutura_v1',
    'fenix_custos_rateio_v1',
    'fenix_custos_pedido_regras_v1',
    'fenix_custos_nota_fiscal_v1',
    'fenix_custos_pagamentos_v1',
    'fenix_custos_comissoes_v1',
    'fenix_custos_marketplace_v1',
    'fenix_custos_tarkett_itens_v1',
    'fenix_tarkett_produtos_catalogo',
    'fenix_tarkett_simulacoes_v1',
    'fenix_custos_variaveis_v1',
    'fenix_whatsapp_templates_by_category',
    'fenix_config_whatsapp_categories_v2',
    'fenix_config_mensagem_orcamento',
    'fenix_metas_config_data',
    'fenix_individual_metas_map',
  ],
  'Configuracoes': [
    'fenix_usuarios_v2',
    'fenix_auth_users_v2',
    'fenix_custos_estrutura_v1',
    'fenix_custos_rateio_v1',
    'fenix_custos_pedido_regras_v1',
    'fenix_custos_nota_fiscal_v1',
    'fenix_custos_pagamentos_v1',
    'fenix_custos_comissoes_v1',
    'fenix_custos_marketplace_v1',
    'fenix_custos_tarkett_itens_v1',
    'fenix_tarkett_produtos_catalogo',
    'fenix_tarkett_simulacoes_v1',
    'fenix_custos_variaveis_v1',
    'fenix_whatsapp_templates_by_category',
    'fenix_config_whatsapp_categories_v2',
    'fenix_config_mensagem_orcamento',
    'fenix_metas_config_data',
    'fenix_individual_metas_map',
  ],
  'Settings': [
    'fenix_usuarios_v2',
    'fenix_auth_users_v2',
    'fenix_custos_estrutura_v1',
    'fenix_custos_rateio_v1',
    'fenix_custos_pedido_regras_v1',
    'fenix_custos_nota_fiscal_v1',
    'fenix_custos_pagamentos_v1',
    'fenix_custos_comissoes_v1',
    'fenix_custos_marketplace_v1',
    'fenix_custos_tarkett_itens_v1',
    'fenix_tarkett_produtos_catalogo',
    'fenix_tarkett_simulacoes_v1',
    'fenix_custos_variaveis_v1',
    'fenix_whatsapp_templates_by_category',
    'fenix_config_whatsapp_categories_v2',
    'fenix_config_mensagem_orcamento',
    'fenix_metas_config_data',
    'fenix_individual_metas_map',
  ],
  'Estoque': ['fenix_estoque_items', 'fenix_estoque_categories', 'fenix_estoque_groups', 'fenix_estoque_movimentacoes'],
  'Controle de Estoque': ['fenix_estoque_items', 'fenix_estoque_categories', 'fenix_estoque_groups', 'fenix_estoque_movimentacoes'],
  'Materiais': ['fenix_estoque_items', 'fenix_estoque_categories', 'fenix_estoque_groups', 'fenix_estoque_movimentacoes'],
  'Vendas': ['fenix_vendas_gerencial', 'fenix_metas_sales_db', 'fenix_marketplace_sales_db', 'fenix_clients_db', 'fenix_deleted_vendas_ids', 'fenix_orcamentos_history', 'fenix_saved_orcamentos', 'fenix_followup_cards_v2', 'fenix_tarefas_db', 'fenix_individual_metas_map'],
  'Notificações': ['fenix_header_notifications_v2'],
  'Notificacoes': ['fenix_header_notifications_v2'],
};

const moduleLastSyncTime: Record<string, number> = {};

/**
 * Sincroniza em segundo plano apenas os dados da aba/módulo selecionado.
 * Cache ágil de 2 segundos para permitir alternância fluida entre abas sem perder alterações.
 */
export async function syncModuleData(tabName: string, force = false): Promise<void> {
  const keys = TAB_COLLECTIONS_MAP[tabName];
  if (!keys || keys.length === 0) return;

  const now = Date.now();
  if (!force && moduleLastSyncTime[tabName] && now - moduleLastSyncTime[tabName] < 2000) {
    return;
  }
  moduleLastSyncTime[tabName] = now;

  // Carrega apenas as coleções daquele módulo com timeout e de forma não-bloqueante
  await pullDataFromSupabase(keys);
}

/**
 * Consulta e recarrega diretamente uma coleção oficial do Supabase.
 * - Fonte da verdade: Supabase kv_store.
 * - Atualiza o cache em memória e localStorage com a resposta confirmada do banco.
 * - Retorna a lista oficial confirmada do Supabase.
 */
export async function fetchCollectionFromSupabase<T = any>(
  collectionKey: string,
  timeoutMs = 10000
): Promise<T[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: row, error } = await withTimeout(
        executeWithRetry(async () => {
          return await client
            .from('fenix_kv_store')
            .select('data')
            .eq('key', collectionKey)
            .maybeSingle();
        }, 3, 400),
        timeoutMs,
        { data: null, error: new Error('Timeout') }
      );

      if (!error && row && row.data !== undefined && row.data !== null) {
        let rData = row.data;
        if (typeof rData === 'string') {
          try { rData = JSON.parse(rData); } catch {}
        }
        if (Array.isArray(rData)) {
          setMemoryCollection(collectionKey, rData);
          try {
            localStorage.setItem(collectionKey, JSON.stringify(rData));
          } catch {}
          // Leitura pura: não dispara evento de mutação para evitar loops de recarregamento
          return rData as T[];
        }
      }
    } catch (err) {
      console.warn(`Erro ao consultar ${collectionKey} no Supabase:`, err);
    }
  }

  // Fallback seguro para memória e localStorage em caso de offline
  const mem = getMemoryCollection<T[]>(collectionKey);
  if (Array.isArray(mem) && mem.length > 0) return mem;
  try {
    const raw = localStorage.getItem(collectionKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Consulta e atualiza uma única coleção do Supabase com timeout seguro de 8 segundos
 */
export async function pullCollectionFromSupabase(key: string, timeoutMs = 8000): Promise<boolean> {
  const res = await withTimeout(pullDataFromSupabase([key]), timeoutMs, { success: false, pulledCount: 0 });
  return res.success;
}

/**
 * Consulta e atualiza um conjunto específico de coleções do Supabase com timeout seguro
 */
export async function pullCollectionsFromSupabase(keys: string[], timeoutMs = 10000): Promise<boolean> {
  const res = await withTimeout(pullDataFromSupabase(keys), timeoutMs, { success: false, pulledCount: 0 });
  return res.success;
}

/**
 * Lista de chaves oficiais que compõem todas as configurações do sistema
 */
export const CONFIG_COLLECTION_KEYS: readonly string[] = [
  'fenix_usuarios_v2',
  'fenix_auth_users_v2',
  'fenix_custos_estrutura_v1',
  'fenix_custos_rateio_v1',
  'fenix_custos_pedido_regras_v1',
  'fenix_custos_nota_fiscal_v1',
  'fenix_custos_pagamentos_v1',
  'fenix_custos_comissoes_v1',
  'fenix_custos_marketplace_v1',
  'fenix_custos_tarkett_itens_v1',
  'fenix_tarkett_produtos_catalogo',
  'fenix_tarkett_simulacoes_v1',
  'fenix_custos_variaveis_v1',
  'fenix_whatsapp_templates_by_category',
  'fenix_config_whatsapp_categories_v2',
  'fenix_config_mensagem_orcamento',
  'fenix_metas_config_data',
  'fenix_metas_config_v2',
  'fenix_individual_metas_map',
  'fenix_metas_individuais_v1',
  'fenix_notificacoes_config_v2',
];

/**
 * Carrega e sincroniza todas as configurações oficiais do Supabase.
 * Chamado automaticamente na inicialização do sistema (após deploy e em todo boot)
 * para garantir que dados existentes nunca sejam perdidos ou substituídos por valores vazios.
 */
export async function loadAllConfigurationsFromSupabase(): Promise<boolean> {
  const res = await pullDataFromSupabase([...CONFIG_COLLECTION_KEYS]);
  // Notifica todos os módulos que as configurações estão disponíveis
  for (const k of CONFIG_COLLECTION_KEYS) {
    dispatchCollectionEvents(k);
  }
  return res.success;
}

/**
 * Pulls data from Supabase into localStorage (Restore / Pull).
 * - Otimizado para consultar coleções em lotes estritos (evita timeout 57014 e tráfego excessivo).
 * - Suporta specificKeys: quando informado, consulta APENAS as chaves necessárias daquele módulo.
 * - Por padrão, não carrega arquivos gigantes (catálogos, documentos pesados) antes do usuário acessar a aba.
 * - Proteção total anti-wipe: nunca sobrescreve dados locais com arrays vazios.
 * - Merge inteligente de registros existentes sem descartar nada.
 */
export async function pullDataFromSupabase(specificKeys?: string[]): Promise<{
  success: boolean;
  pulledCount: number;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, pulledCount: 0, error: 'Supabase não inicializado.' };
  }

  // Deduplicação de requisições idênticas em trânsito (previne rajadas de queries simultâneas)
  const requestFingerprint = specificKeys && specificKeys.length > 0 ? specificKeys.slice().sort().join(',') : '__ALL__';
  const existingInFlight = inFlightPullRequests.get(requestFingerprint);
  if (existingInFlight) {
    return existingInFlight;
  }

  const pullPromise = (async () => {
    currentSyncStatus.isSyncing = true;
    notifyStatus();

    try {
      let targetKeys: string[];

      if (specificKeys && Array.isArray(specificKeys) && specificKeys.length > 0) {
        targetKeys = specificKeys;
      } else {
        // Exclui coleções muito pesadas no pull genérico (elas serão carregadas sob demanda ao abrir a aba correspondente)
        const HEAVY_KEYS = new Set<string>();
        targetKeys = SYNC_COLLECTIONS.filter((c) => !HEAVY_KEYS.has(c.key)).map((c) => c.key);
      }

      let allRows: any[] = [];

      // Consulta em chunks pequenos para evitar statement timeout (57014)
      const chunkSize = 10;
      for (let i = 0; i < targetKeys.length; i += chunkSize) {
        const slice = targetKeys.slice(i, i + chunkSize);
        try {
          const rowsChunk = await withTimeout(
            executeWithRetry(async () => {
              const { data, error } = await client
                .from('fenix_kv_store')
                .select('key, data, updated_at')
                .in('key', slice);

              if (error) throw error;
              return data || [];
            }, 3, 500),
            10000,
            []
          );

          if (Array.isArray(rowsChunk)) {
            allRows = allRows.concat(rowsChunk);
          }
        } catch (chunkErr) {
          console.warn(`[SUPABASE-PULL] Falha não bloqueante ao consultar lote de coleções:`, chunkErr);
        }
      }

      if (!Array.isArray(allRows) || allRows.length === 0) {
        currentSyncStatus.isSyncing = false;
        notifyStatus();
        drainPendingSyncQueue().catch(() => {});
        return { success: true, pulledCount: 0 };
      }

      let pulledCount = 0;
      for (const item of allRows) {
        if (item.key && item.data !== undefined) {
          try {
            let parsedData = item.data;
            if (typeof parsedData === 'string') {
              try {
                parsedData = JSON.parse(parsedData);
              } catch {}
            }

            const currentLocalRaw = localStorage.getItem(item.key);
            let localList: any[] = [];
            if (currentLocalRaw) {
              try {
                const p = JSON.parse(currentLocalRaw);
                if (Array.isArray(p)) localList = p;
              } catch {}
            }

            let finalData: any = parsedData;

            // PROTEÇÃO TOTAL CONTRA SOBRESCRITA E RESURREIÇÃO DE ITENS EXCLUÍDOS
            if (Array.isArray(parsedData)) {
              // Verifica se há itens pendentes na fila offline para esta coleção
              let pendingItems: any[] = [];
              try {
                const rawQ = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
                if (rawQ) {
                  const q: PendingSyncItem[] = JSON.parse(rawQ);
                  if (Array.isArray(q)) {
                    pendingItems = q.filter((it) => it.collectionKey === item.key).map((it) => it.item);
                  }
                }
              } catch {}

              if (parsedData.length === 0 && localList.length > 0) {
                // Remote row is empty but local has items: preserve local data and sync it back!
                finalData = localList;
                saveWholeCollectionToSupabase(item.key, localList).catch(() => {});
              } else if (parsedData.length > 0) {
                if (item.key === 'fenix_metas_sales_db') {
                  const salesMap = new Map<string, any>();
                  const seenSalesKeys = new Set<string>();

                  // Remote parsedData from Supabase is authoritative
                  for (const p of parsedData) {
                    if (!p) continue;
                    const id = String(p.id || '').trim();
                    const cleanPed = p.pedido ? String(p.pedido).replace(/^#+/, '').trim() : '';
                    const clientNorm = (p.cliente || p.clientName || '').trim().toLowerCase();
                    const fupId = p.followUpId ? String(p.followUpId) : '';
                    const orcId = p.orcamentoId ? String(p.orcamentoId) : '';
                    const dedupKey = cleanPed && clientNorm ? `${cleanPed}_${clientNorm}` : '';

                    const primaryKey = id || (cleanPed ? `ped_${cleanPed}` : `sale_${Math.random()}`);
                    salesMap.set(primaryKey, p);
                    if (id) seenSalesKeys.add(id);
                    if (fupId) seenSalesKeys.add(fupId);
                    if (orcId) seenSalesKeys.add(orcId);
                    if (dedupKey) seenSalesKeys.add(dedupKey);
                    if (cleanPed) seenSalesKeys.add(`ped_${cleanPed}`);
                  }

                  // Preserve local sales that are not yet in remote
                  for (const loc of [...localList, ...pendingItems]) {
                    if (!loc) continue;
                    const id = String(loc.id || '').trim();
                    const cleanPed = loc.pedido ? String(loc.pedido).replace(/^#+/, '').trim() : '';
                    const clientNorm = (loc.cliente || loc.clientName || '').trim().toLowerCase();
                    const fupId = loc.followUpId ? String(loc.followUpId) : '';
                    const orcId = loc.orcamentoId ? String(loc.orcamentoId) : '';
                    const dedupKey = cleanPed && clientNorm ? `${cleanPed}_${clientNorm}` : '';

                    if (
                      (id && seenSalesKeys.has(id)) ||
                      (fupId && seenSalesKeys.has(fupId)) ||
                      (orcId && seenSalesKeys.has(orcId)) ||
                      (dedupKey && seenSalesKeys.has(dedupKey)) ||
                      (cleanPed && seenSalesKeys.has(`ped_${cleanPed}`))
                    ) {
                      continue;
                    }

                    const primaryKey = id || (cleanPed ? `ped_${cleanPed}` : `sale_${Math.random()}`);
                    salesMap.set(primaryKey, loc);
                    if (id) seenSalesKeys.add(id);
                    if (fupId) seenSalesKeys.add(fupId);
                    if (orcId) seenSalesKeys.add(orcId);
                    if (dedupKey) seenSalesKeys.add(dedupKey);
                    if (cleanPed) seenSalesKeys.add(`ped_${cleanPed}`);
                  }
                  finalData = Array.from(salesMap.values());
                } else {
                  // Supabase parsedData é a fonte oficial permanente dos dados
                  const map = new Map<string, any>();
                  for (const p of parsedData) {
                    if (!p) continue;
                    const pId = String(p.id ?? p.idOrcamento ?? p.codigo ?? p._id ?? p.pedido ?? '').trim();
                    if (pId) map.set(pId, p);
                    else map.set(`rem_${Math.random()}`, p);
                  }
                  // Mescla apenas itens offline pendentes que ainda não subiram para o Supabase
                  for (const p of pendingItems) {
                    if (!p) continue;
                    const pId = String(p.id ?? p.idOrcamento ?? p.codigo ?? p._id ?? p.pedido ?? '').trim();
                    if (pId && !map.has(pId)) map.set(pId, p);
                  }
                  finalData = Array.from(map.values());
                }
              } else {
                // O estado retornado pelo Supabase é a fonte da verdade
                finalData = parsedData;
              }
            }

            const stringVal = typeof finalData === 'string' ? finalData : JSON.stringify(finalData);

            // Atualiza cache em memória oficial e localStorage com dados oficiais do Supabase
            setMemoryCollection(item.key, finalData);
            localStorage.setItem(item.key, stringVal);
            pulledCount++;
            dispatchCollectionEvents(item.key);

            // Espelhamento resiliente de chaves de configurações para compatibilidade e disponibilidade imediata
            if (item.key === 'fenix_metas_config_data') {
              setMemoryCollection('fenix_metas_config_v2', finalData);
              try { localStorage.setItem('fenix_metas_config_v2', stringVal); } catch {}
              if (finalData && typeof finalData === 'object' && finalData.metaValor) {
                try { localStorage.setItem('fenix_metas_target_value', String(finalData.metaValor)); } catch {}
              }
              dispatchCollectionEvents('fenix_metas_config_v2');
            } else if (item.key === 'fenix_individual_metas_map') {
              setMemoryCollection('fenix_metas_individuais_v1', finalData);
              try { localStorage.setItem('fenix_metas_individuais_v1', stringVal); } catch {}
              dispatchCollectionEvents('fenix_metas_individuais_v1');
            } else if (item.key === 'fenix_whatsapp_templates_by_category') {
              setMemoryCollection('fenix_config_whatsapp_categories_v2', finalData);
              try { localStorage.setItem('fenix_config_whatsapp_categories_v2', stringVal); } catch {}
              if (finalData && typeof finalData === 'object' && finalData['Envio de Orçamento']) {
                setMemoryCollection('fenix_config_mensagem_orcamento', finalData['Envio de Orçamento']);
                try { localStorage.setItem('fenix_config_mensagem_orcamento', finalData['Envio de Orçamento']); } catch {}
              }
              dispatchCollectionEvents('fenix_whatsapp_templates_by_category');
            }
          } catch (storageErr) {
            console.error(`Erro ao gravar ${item.key} no localStorage:`, storageErr);
          }
        }
      }

      currentSyncStatus.connected = true;
      currentSyncStatus.lastSyncTime = new Date().toLocaleTimeString('pt-BR');
      currentSyncStatus.error = null;
      currentSyncStatus.isSyncing = false;
      notifyStatus();

      // Drena a fila offline em background
      drainPendingSyncQueue().catch(() => {});

      return { success: true, pulledCount };
    } catch (err: any) {
      const errorMsg = err?.message || 'Não foi possível carregar os dados. Operando com dados locais.';
      currentSyncStatus.isSyncing = false;
      currentSyncStatus.error = errorMsg;
      notifyStatus();
      return { success: false, pulledCount: 0, error: errorMsg };
    } finally {
      inFlightPullRequests.delete(requestFingerprint);
    }
  })();

  inFlightPullRequests.set(requestFingerprint, pullPromise);
  return pullPromise;
}

/**
 * Saves a single item into a collection stored in Supabase fenix_kv_store.
 * - Concurrency protection: fetches current remote records first.
 * - Merge seguro com base local e remota sem perder registros.
 * - Automatic retry with exponential backoff on transient errors.
 * - Fila offline automática em caso de desconexão.
 */
export async function saveItemToSupabase<T extends Record<string, any>>(
  collectionKey: string,
  item: T,
  idFieldOrUser = 'id',
  currentUser?: string
): Promise<{ success: boolean; data?: T; list?: T[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
    };
  }

  // Resolve idField vs currentUser defensivamente
  let idField = 'id';
  let resolvedUser = currentUser;

  if (currentUser === undefined) {
    if (idFieldOrUser && idFieldOrUser !== 'id' && idFieldOrUser !== '_id' && !(idFieldOrUser in item)) {
      resolvedUser = idFieldOrUser;
      idField = 'id';
    } else {
      idField = idFieldOrUser || 'id';
    }
  } else {
    idField = idFieldOrUser || 'id';
  }

  const user = resolvedUser || (typeof localStorage !== 'undefined' ? (localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')) : null) || 'Usuário Fênix';

  // Garante que o item possua um identificador válido
  let itemId = (item as any)[idField] ?? (item as any).id ?? (item as any)._id ?? (item as any).idOrcamento ?? (item as any).pedido;
  if (itemId === undefined || itemId === null || String(itemId).trim() === '') {
    itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    (item as any)[idField] = itemId;
  }

  try {
    return await executeWithRetry(async () => {
      // 1. FLUXO OFICIAL: Consulta estado mais recente diretamente do SUPABASE (Fonte da Verdade)
      let remoteList: T[] = [];
      const { data: remoteRow, error: fetchErr } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', collectionKey)
        .maybeSingle();

      if (fetchErr) {
        throw fetchErr;
      }

      if (remoteRow && remoteRow.data !== undefined && remoteRow.data !== null) {
        let rData = remoteRow.data;
        if (typeof rData === 'string') {
          try {
            rData = JSON.parse(rData);
          } catch {}
        }
        if (Array.isArray(rData)) {
          remoteList = rData;
        }
      }

      // Se a base remota estava vazia, utiliza memória/local como fallback inicial
      if (remoteList.length === 0) {
        let localList: T[] = [];
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(collectionKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) localList = parsed;
            }
          }
        } catch {}
        const memList = getMemoryCollection<T[]>(collectionKey) || [];
        remoteList = safeMergeLists(memList, localList, idField);
      }

      // 2. Atualiza ou insere o item com correspondência rigorosa de ID
      const cleanItemId = String(itemId).trim();
      const existingIndex = remoteList.findIndex((x: any) => {
        if (!x) return false;
        const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
        return xId === cleanItemId;
      });

      let updatedList: T[];
      if (existingIndex >= 0) {
        const existingItem = remoteList[existingIndex];
        const updatedItem = {
          ...existingItem,
          ...item,
          [idField]: itemId,
          updatedAt: (item as any).updatedAt || new Date().toISOString(),
        };
        updatedList = remoteList.map((x: any, idx: number) => {
          if (idx === existingIndex) {
            return updatedItem;
          }
          return x;
        });
      } else {
        updatedList = [item, ...remoteList];
      }

      // Proteção anti-perda
      if (remoteList.length > 0 && updatedList.length === 0) {
        throw new Error('Falha de integridade: a lista não pode ser esvaziada durante o salvamento.');
      }

      const nowIso = new Date().toISOString();
      recordSelfSave(collectionKey, nowIso);

      // 3. SALVAR NO SUPABASE (Fonte Oficial da Verdade)
      const { error: upsertErr } = await client
        .from('fenix_kv_store')
        .upsert(
          {
            key: collectionKey,
            data: updatedList,
            updated_at: nowIso,
            updated_by: user,
          },
          { onConflict: 'key' }
        );

      if (upsertErr) {
        throw upsertErr;
      }

      // Sincronização espelhada obrigatória para chaves de orçamentos
      if (collectionKey === 'fenix_saved_orcamentos' || collectionKey === 'fenix_orcamentos_history') {
        const siblingKey = collectionKey === 'fenix_saved_orcamentos' ? 'fenix_orcamentos_history' : 'fenix_saved_orcamentos';
        void Promise.resolve(
          client
            .from('fenix_kv_store')
            .upsert(
              {
                key: siblingKey,
                data: updatedList,
                updated_at: nowIso,
                updated_by: user,
              },
              { onConflict: 'key' }
            )
        ).catch(() => {});
        setMemoryCollection(siblingKey, updatedList);
        try { localStorage.setItem(siblingKey, JSON.stringify(updatedList)); } catch {}
      }

      // 4. CONFIRMAR O SALVAMENTO E RECARREGAR O REGISTRO SALVO DIRETAMENTE DO SUPABASE
      let confirmedList: T[] = updatedList;
      try {
        const { data: reloadedRow, error: reloadErr } = await client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', collectionKey)
          .maybeSingle();

        if (!reloadErr && reloadedRow && reloadedRow.data !== undefined && reloadedRow.data !== null) {
          let rData = reloadedRow.data;
          if (typeof rData === 'string') {
            try { rData = JSON.parse(rData); } catch {}
          }
          if (Array.isArray(rData) && rData.length > 0) {
            confirmedList = rData;
          }
        }
      } catch (reloadErr) {
        console.warn(`[SUPABASE] Aviso ao recarregar confirmação de ${collectionKey}:`, reloadErr);
      }

      // 5. ATUALIZAR CACHE LOCAL E DISPARAR EVENTOS COM OS DADOS CONFIRMADOS DO SUPABASE
      setMemoryCollection(collectionKey, confirmedList);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(collectionKey, JSON.stringify(confirmedList));
          dispatchCollectionEvents(collectionKey);
        }
      } catch (e) {
        console.warn('Erro ao atualizar cache local:', e);
      }

      const confirmedItem = confirmedList.find((x: any) => {
        const xId = String(x?.[idField] ?? x?.id ?? x?._id ?? x?.idOrcamento ?? x?.pedido ?? '').trim();
        return xId === cleanItemId;
      }) || item;

      return {
        success: true,
        data: confirmedItem,
        list: confirmedList,
      };
    });
  } catch (err: any) {
    console.error(`Erro ao salvar item em ${collectionKey} no Supabase:`, err);
    queuePendingItem(collectionKey, item, idField, user);

    const errorMessage =
      err?.message ||
      err?.error_description ||
      (typeof err === 'string' ? err : 'Não foi possível salvar no banco de dados Supabase.');

    return {
      success: false,
      error: errorMessage,
      data: item,
    };
  }
}

/**
 * Deletes a single item from a collection in Supabase fenix_kv_store.
 * - Concurrency protection: fetches current remote records first.
 * - Remove estritamente o item correspondente pelo ID, preservando todos os demais.
 * - Automatic retry with exponential backoff on transient errors.
 */
export async function deleteItemFromSupabase(
  collectionKey: string,
  itemId: string | number,
  idFieldOrUser = 'id',
  currentUser?: string
): Promise<{ success: boolean; list?: any[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
    };
  }

  // Resolve idField vs currentUser defensivamente
  let idField = 'id';
  let resolvedUser = currentUser;

  if (currentUser === undefined) {
    if (idFieldOrUser && idFieldOrUser !== 'id' && idFieldOrUser !== '_id') {
      resolvedUser = idFieldOrUser;
      idField = 'id';
    } else {
      idField = idFieldOrUser || 'id';
    }
  } else {
    idField = idFieldOrUser || 'id';
  }

  const user = resolvedUser || (typeof localStorage !== 'undefined' ? (localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')) : null) || 'Usuário Fênix';

  return executeWithRetry(async () => {
    // 1. FLUXO OFICIAL: Consulta estado mais recente diretamente do SUPABASE
    let remoteList: any[] = [];
    const { data: remoteRow, error: fetchErr } = await client
      .from('fenix_kv_store')
      .select('data')
      .eq('key', collectionKey)
      .maybeSingle();

    if (fetchErr) {
      throw fetchErr;
    }

    if (remoteRow && remoteRow.data !== undefined && remoteRow.data !== null) {
      let rData = remoteRow.data;
      if (typeof rData === 'string') {
        try {
          rData = JSON.parse(rData);
        } catch {}
      }
      if (Array.isArray(rData)) {
        remoteList = rData;
      }
    }

    const cleanDeleteId = String(itemId).trim();
    const updatedList = remoteList.filter((x: any) => {
      if (!x) return false;
      const xId = String(x[idField] ?? x.id ?? x._id ?? x.idOrcamento ?? x.pedido ?? '').trim();
      return xId !== cleanDeleteId;
    });

    const nowIso = new Date().toISOString();
    recordSelfSave(collectionKey, nowIso);

    // 2. Grava no Supabase primeiro
    const { error: upsertErr } = await client
      .from('fenix_kv_store')
      .upsert(
        {
          key: collectionKey,
          data: updatedList,
          updated_at: nowIso,
          updated_by: user,
        },
        { onConflict: 'key' }
      );

    if (upsertErr) {
      throw upsertErr;
    }

    if (collectionKey === 'fenix_saved_orcamentos' || collectionKey === 'fenix_orcamentos_history') {
      const siblingKey = collectionKey === 'fenix_saved_orcamentos' ? 'fenix_orcamentos_history' : 'fenix_saved_orcamentos';
      void Promise.resolve(
        client
          .from('fenix_kv_store')
          .upsert(
            {
              key: siblingKey,
              data: updatedList,
              updated_at: nowIso,
              updated_by: user,
            },
            { onConflict: 'key' }
          )
      ).catch(() => {});
      setMemoryCollection(siblingKey, updatedList);
      try { localStorage.setItem(siblingKey, JSON.stringify(updatedList)); } catch {}
    }

    // 3. CONFIRMAÇÃO DO SALVAMENTO: Recarrega estado confirmado diretamente do Supabase
    let confirmedList: any[] = updatedList;
    try {
      const { data: reloadedRow, error: reloadErr } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', collectionKey)
        .maybeSingle();

      if (!reloadErr && reloadedRow && reloadedRow.data !== undefined && reloadedRow.data !== null) {
        let rData = reloadedRow.data;
        if (typeof rData === 'string') {
          try { rData = JSON.parse(rData); } catch {}
        }
        if (Array.isArray(rData)) {
          confirmedList = rData;
        }
      }
    } catch (reloadErr) {
      console.warn(`[SUPABASE] Aviso ao recarregar confirmação pós-exclusão de ${collectionKey}:`, reloadErr);
    }

    setMemoryCollection(collectionKey, confirmedList);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(collectionKey, JSON.stringify(confirmedList));
        dispatchCollectionEvents(collectionKey);
      }
    } catch (e) {
      console.warn('Erro ao atualizar cache local:', e);
    }

    return { success: true, list: confirmedList };
  }).catch((err) => {
    console.error(`Erro ao excluir de ${collectionKey} no Supabase:`, err);
    return {
      success: false,
      error: err?.message || 'Não foi possível excluir o item do banco de dados.',
    };
  });
}

export const DELETED_CLIENTS_KEY = 'fenix_deleted_clients_ids';

export function getDeletedClientIds(): Set<string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(DELETED_CLIENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((s) => String(s).trim()).filter(Boolean));
        }
      }
    }
  } catch {}
  return new Set();
}

export async function addDeletedClientId(id: string, usuario: string): Promise<void> {
  try {
    const cleanId = String(id).trim();
    if (!cleanId) return;
    const set = getDeletedClientIds();
    set.add(cleanId);
    const arr = Array.from(set);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DELETED_CLIENTS_KEY, JSON.stringify(arr));
      } catch {}
    }
    await saveWholeCollectionToSupabase(DELETED_CLIENTS_KEY, arr, usuario);
  } catch (err) {
    console.warn('Erro ao registrar ID do cliente excluído:', err);
  }
}

/**
 * Exclui um cliente REALMENTE e DIRETAMENTE do banco de dados Supabase (fenix_kv_store).
 * 1. Conecta ao Supabase e busca a lista oficial atual da nuvem (chave fenix_clients_db).
 * 2. Remove o registro comparando o ID exato (suportando id e _id).
 * 3. Persiste a alteração no Supabase e aguarda a confirmação do banco.
 * 4. Registra o ID excluído na lista de bloqueio para impedir ressuscitação por cache antigo.
 * 5. Atualiza o cache local e em memória SOMENTE após a resposta positiva do Supabase.
 */
export async function deleteClientDirectlyFromSupabase(
  clientId: string,
  usuario?: string
): Promise<{ success: boolean; error?: string; updatedList?: any[] }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Não foi possível conectar ao banco de dados Supabase. Verifique sua conexão e tente novamente.',
    };
  }

  const cleanTargetId = String(clientId || '').trim();
  if (!cleanTargetId) {
    return {
      success: false,
      error: 'ID do cliente inválido ou não informado.',
    };
  }

  const user = usuario || (typeof localStorage !== 'undefined' ? (localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username')) : null) || 'Usuário Fênix';

  try {
    return await executeWithRetry(async () => {
      // 1. Busca estado oficial direto do Supabase
      const { data: remoteRow, error: fetchErr } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', 'fenix_clients_db')
        .maybeSingle();

      if (fetchErr) {
        throw new Error(`Falha ao consultar banco de dados: ${fetchErr.message}`);
      }

      let currentList: any[] = [];
      if (remoteRow && remoteRow.data !== undefined) {
        let rData = remoteRow.data;
        if (typeof rData === 'string') {
          try {
            rData = JSON.parse(rData);
          } catch {}
        }
        if (Array.isArray(rData)) {
          currentList = rData;
        }
      }

      // Se por ventura o banco remoto retornou vazio mas temos dados locais, usar o local como base defensiva
      if (currentList.length === 0) {
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('fenix_clients_db');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) currentList = parsed;
            }
          }
        } catch {}
      }

      // 2. Filtra o registro pelo ID correto
      const updatedList = currentList.filter((item: any) => {
        if (!item) return false;
        const itemId = String(item.id ?? item._id ?? '').trim();
        return itemId !== cleanTargetId;
      });

      const nowIso = new Date().toISOString();
      recordSelfSave('fenix_clients_db', nowIso);

      // 3. Upsert definitivo no Supabase
      const { error: upsertErr } = await client
        .from('fenix_kv_store')
        .upsert(
          {
            key: 'fenix_clients_db',
            data: updatedList,
            updated_at: nowIso,
            updated_by: user,
          },
          { onConflict: 'key' }
        );

      if (upsertErr) {
        throw new Error(`Erro ao salvar exclusão no Supabase: ${upsertErr.message}`);
      }

      // 4. Registra na lista de IDs excluídos no Supabase para nunca mais ressuscitar
      await addDeletedClientId(cleanTargetId, user);

      // 5. Atualiza cache em memória e localStorage somente após confirmação do Supabase
      setMemoryCollection('fenix_clients_db', updatedList);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('fenix_clients_db', JSON.stringify(updatedList));
          dispatchCollectionEvents('fenix_clients_db');
        }
      } catch (e) {
        console.warn('Erro ao atualizar cache local após exclusão:', e);
      }

      return {
        success: true,
        updatedList,
      };
    }, 2, 300);
  } catch (err: any) {
    console.error('Erro ao excluir cliente no Supabase:', err);
    return {
      success: false,
      error: err?.message || 'Falha ao excluir o cliente no banco de dados Supabase.',
    };
  }
}

/**
 * Saves a whole collection payload into Supabase fenix_kv_store with ANTI-WIPE GUARD.
 * 1. Anti-wipe: blocks empty array overwrites if collection currently has data.
 * 2. Deduplicates items strictly by ID.
 * 3. Automatic retry for transient database errors.
 * 4. Updates local cache only upon Supabase confirmation.
 */
export async function saveWholeCollectionToSupabase(
  collectionKey: string,
  data: any,
  currentUser?: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
    };
  }

  const user = currentUser || localStorage.getItem('fenix_active_user_name') || localStorage.getItem('fenix_saved_username') || 'Usuário Fênix';

  // 1. ANTI-WIPE E ANTI-RESET PROTECTION:
  // Se incoming for vazio (array vazio ou objeto vazio sem chaves), NUNCA permitir que apague dados existentes no Supabase!
  const isIncomingEmpty =
    (Array.isArray(data) && data.length === 0) ||
    (!Array.isArray(data) && typeof data === 'object' && data !== null && Object.keys(data).length === 0);

  if (isIncomingEmpty) {
    const existingLocal = localStorage.getItem(collectionKey);
    if (existingLocal) {
      try {
        const parsed = JSON.parse(existingLocal);
        const hasLocalData =
          (Array.isArray(parsed) && parsed.length > 0) ||
          (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0);
        if (hasLocalData) {
          console.warn(`[ANTI-WIPE] Bloqueada tentativa de sobrescrever ${collectionKey} com dados vazios a partir do cache local.`);
          return { success: true };
        }
      } catch {}
    }
  }

  return executeWithRetry(async () => {
    // Verificação remota no Supabase antes de gravar dados vazios (protege no deploy mesmo com cache local vazio)
    if (isIncomingEmpty) {
      try {
        const { data: remoteRow } = await client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', collectionKey)
          .maybeSingle();

        if (remoteRow && remoteRow.data !== undefined && remoteRow.data !== null) {
          let remoteParsed = remoteRow.data;
          if (typeof remoteParsed === 'string') {
            try { remoteParsed = JSON.parse(remoteParsed); } catch {}
          }
          const hasRemoteData =
            (Array.isArray(remoteParsed) && remoteParsed.length > 0) ||
            (!Array.isArray(remoteParsed) && typeof remoteParsed === 'object' && remoteParsed !== null && Object.keys(remoteParsed).length > 0);

          if (hasRemoteData) {
            console.warn(`[ANTI-WIPE] Bloqueada tentativa de sobrescrever ${collectionKey} com dados vazios. Preservando configurações existentes do Supabase.`);
            setMemoryCollection(collectionKey, remoteParsed);
            try {
              localStorage.setItem(collectionKey, typeof remoteParsed === 'string' ? remoteParsed : JSON.stringify(remoteParsed));
              dispatchCollectionEvents(collectionKey);
            } catch {}
            return { success: true };
          }
        }
      } catch (checkErr) {
        console.warn(`[ANTI-WIPE] Erro ao consultar ${collectionKey} no Supabase para proteção:`, checkErr);
      }
    }

    let dataToSave = Array.isArray(data) ? deduplicateListById(data) : data;

    // Proteção para usuários: nunca perder usuários cadastrados no Supabase
    if (collectionKey === 'fenix_usuarios_v2' && Array.isArray(data)) {
      try {
        const { data: remoteRow } = await client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', 'fenix_usuarios_v2')
          .maybeSingle();

        if (remoteRow && Array.isArray(remoteRow.data) && remoteRow.data.length > 0) {
          const userMap = new Map<string, any>();
          for (const u of remoteRow.data) {
            if (!u) continue;
            const uid = String(u.id || u.email || u.nome || '').trim().toLowerCase();
            if (uid) userMap.set(uid, u);
          }
          for (const u of data) {
            if (!u) continue;
            const uid = String(u.id || u.email || u.nome || '').trim().toLowerCase();
            if (uid) {
              const existing = userMap.get(uid);
              userMap.set(uid, existing ? { ...existing, ...u } : u);
            }
          }
          dataToSave = Array.from(userMap.values());
        }
      } catch {}
    }

    // Proteção para contas de autenticação: nunca perder contas cadastradas no Supabase
    if (collectionKey === 'fenix_auth_users_v2' && data && typeof data === 'object' && !Array.isArray(data)) {
      try {
        const { data: remoteRow } = await client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', 'fenix_auth_users_v2')
          .maybeSingle();

        if (remoteRow && remoteRow.data && typeof remoteRow.data === 'object' && !Array.isArray(remoteRow.data)) {
          dataToSave = { ...remoteRow.data, ...data };
        }
      } catch {}
    }

    // Proteção absoluta para fenix_metas_sales_db: nunca truncar ou perder vendas remotas existentes
    if (collectionKey === 'fenix_metas_sales_db' && Array.isArray(data)) {
      try {
        const { data: remoteRow } = await client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', 'fenix_metas_sales_db')
          .maybeSingle();

        if (remoteRow && Array.isArray(remoteRow.data) && remoteRow.data.length > 0) {
          const remoteList = remoteRow.data;
          const salesMap = new Map<string, any>();
          const seenKeys = new Set<string>();

          remoteList.forEach((s: any) => {
            if (!s) return;
            const id = String(s.id || '').trim();
            const cleanPed = s.pedido ? String(s.pedido).replace(/^#+/, '').trim() : '';
            const clientNorm = (s.cliente || s.clientName || '').trim().toLowerCase();
            const fupId = s.followUpId ? String(s.followUpId) : '';
            const orcId = s.orcamentoId ? String(s.orcamentoId) : '';
            const dedupKey = cleanPed && clientNorm ? `${cleanPed}_${clientNorm}` : '';

            const k = id || (cleanPed ? `ped_${cleanPed}` : `sale_${Math.random()}`);
            salesMap.set(k, s);
            if (id) seenKeys.add(id);
            if (fupId) seenKeys.add(fupId);
            if (orcId) seenKeys.add(orcId);
            if (dedupKey) seenKeys.add(dedupKey);
            if (cleanPed) seenKeys.add(`ped_${cleanPed}`);
          });

          data.forEach((s: any) => {
            if (!s) return;
            const id = String(s.id || '').trim();
            const cleanPed = s.pedido ? String(s.pedido).replace(/^#+/, '').trim() : '';
            const clientNorm = (s.cliente || s.clientName || '').trim().toLowerCase();
            const fupId = s.followUpId ? String(s.followUpId) : '';
            const orcId = s.orcamentoId ? String(s.orcamentoId) : '';
            const dedupKey = cleanPed && clientNorm ? `${cleanPed}_${clientNorm}` : '';

            if (
              (id && seenKeys.has(id)) ||
              (fupId && seenKeys.has(fupId)) ||
              (orcId && seenKeys.has(orcId)) ||
              (dedupKey && seenKeys.has(dedupKey)) ||
              (cleanPed && seenKeys.has(`ped_${cleanPed}`))
            ) {
              return;
            }

            const k = id || (cleanPed ? `ped_${cleanPed}` : `sale_${Math.random()}`);
            salesMap.set(k, s);
            if (id) seenKeys.add(id);
            if (fupId) seenKeys.add(fupId);
            if (orcId) seenKeys.add(orcId);
            if (dedupKey) seenKeys.add(dedupKey);
            if (cleanPed) seenKeys.add(`ped_${cleanPed}`);
          });

          dataToSave = Array.from(salesMap.values());
        }
      } catch {}
    }

    const nowIso = new Date().toISOString();
    recordSelfSave(collectionKey, nowIso);

    const { error: upsertErr } = await client
      .from('fenix_kv_store')
      .upsert(
        {
          key: collectionKey,
          data: dataToSave,
          updated_at: nowIso,
          updated_by: user,
        },
        { onConflict: 'key' }
      );

    if (upsertErr) {
      throw upsertErr;
    }

    setMemoryCollection(collectionKey, dataToSave);
    try {
      localStorage.setItem(collectionKey, typeof dataToSave === 'string' ? dataToSave : JSON.stringify(dataToSave));
      dispatchCollectionEvents(collectionKey);
    } catch (e) {
      console.warn('Erro ao atualizar cache local:', e);
    }

    return { success: true };
  }).catch((err) => {
    console.error(`Erro ao salvar ${collectionKey} no Supabase:`, err);
    return {
      success: false,
      error: err?.message || 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
    };
  });
}
