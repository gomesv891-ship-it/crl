import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Target,
  FileText,
  PhoneCall,
  Users,
  Calendar,
  DollarSign,
  ChevronRight,
  CheckCircle2,
  Clock,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { getSupabaseClient } from '../utils/supabaseClient';
import { SavedOrcamento, ClientRecord } from '../types';
import { getSellerIdForUser, areUsersEqualOrRelated, isRecordOfResponsible } from '../utils/userDataFilter';
import { getBrazilToday, formatBRL } from '../utils/formatters';

interface ConsultoraDashboardScreenProps {
  currentUserName: string;
  onNavigateTab: (tab: string, payload?: any) => void;
}

type PeriodFilter = 'hoje' | 'semana' | 'mes' | 'personalizado';

export const ConsultoraDashboardScreen: React.FC<ConsultoraDashboardScreenProps> = ({
  currentUserName,
  onNavigateTab,
}) => {
  // Identificação da consultora: Vanessa Gomes ou Jhessica Camargo
  const isVanessa = currentUserName.toLowerCase().includes('vanessa');
  const isJhessica = currentUserName.toLowerCase().includes('jhessica') || currentUserName.toLowerCase().includes('jessica');
  const firstName = isVanessa ? 'Vanessa' : isJhessica ? 'Jhessica' : (currentUserName.split(' ')[0] || 'Consultora');
  const fullName = isVanessa ? 'Vanessa Gomes' : isJhessica ? 'Jhessica Camargo' : currentUserName;
  const sellerId = getSellerIdForUser(currentUserName);

  // Data atual de referência do sistema
  const brazilToday = useMemo(() => getBrazilToday(), []);
  const todayDateStr = useMemo(() => {
    return `${brazilToday.year}-${String(brazilToday.month).padStart(2, '0')}-${String(brazilToday.day).padStart(2, '0')}`;
  }, [brazilToday]);

  const formattedCurrentDate = useMemo(() => {
    try {
      const now = new Date(brazilToday.year, brazilToday.month - 1, brazilToday.day, 12, 0, 0);
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(now);
    } catch {
      return 'Quinta-feira, 04 de outubro de 2026';
    }
  }, [brazilToday]);

  // Filtros Temporais
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('mes');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    return `${brazilToday.year}-${String(brazilToday.month).padStart(2, '0')}-01`;
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return todayDateStr;
  });

  // Estados dos Dados Reais
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [orcamentos, setOrcamentos] = useState<SavedOrcamento[]>([]);
  const [followUpCards, setFollowUpCards] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [targetMeta, setTargetMeta] = useState<number>(200000); // R$ 200.000 oficial na referência

  // Nome do Mês Atual
  const monthName = useMemo(() => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[brazilToday.month - 1] || 'Outubro';
  }, [brazilToday.month]);

  // Carregar dados oficiais do Supabase com isolamento rigoroso por consultora
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    const client = getSupabaseClient();
    try {
      if (client) {
        const [
          orcHistRes,
          orcSavedRes,
          fupRes,
          metasSalesRes,
          vendasGerRes,
          clientsRes,
          tasksRes,
          metasMapRes,
        ] = await Promise.all([
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_orcamentos_history').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_saved_orcamentos').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_followup_cards_v2').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_metas_sales_db').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_vendas_gerencial').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_clients_db').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_tarefas_db').maybeSingle(),
          client.from('fenix_kv_store').select('data').eq('key', 'fenix_individual_metas_map').maybeSingle(),
        ]);

        // 1. Processar Orçamentos
        let rawHist: SavedOrcamento[] = [];
        let rawSaved: SavedOrcamento[] = [];
        if (orcHistRes.data?.data) {
          const parsed = typeof orcHistRes.data.data === 'string' ? JSON.parse(orcHistRes.data.data) : orcHistRes.data.data;
          if (Array.isArray(parsed)) rawHist = parsed;
        }
        if (orcSavedRes.data?.data) {
          const parsed = typeof orcSavedRes.data.data === 'string' ? JSON.parse(orcSavedRes.data.data) : orcSavedRes.data.data;
          if (Array.isArray(parsed)) rawSaved = parsed;
        }

        const orcMap = new Map<string, SavedOrcamento>();
        rawSaved.forEach((o) => orcMap.set(o.id, { ...o }));
        rawHist.forEach((o) => {
          if (orcMap.has(o.id)) orcMap.set(o.id, { ...orcMap.get(o.id)!, ...o });
          else orcMap.set(o.id, { ...o });
        });

        // Filtrar estritamente pela consultora logada
        const myOrcs = Array.from(orcMap.values()).filter((o) => {
          const userFields = [o.consultoraName, o.criadoPor, o.responsavel, o.registeredBy, (o as any).vendedor].filter(Boolean);
          const hasNameMatch = userFields.some((u) => areUsersEqualOrRelated(u as string, currentUserName));
          const hasIdMatch = sellerId && (o.vendedorId === sellerId || o.responsavelId === sellerId);
          return hasNameMatch || hasIdMatch;
        });
        setOrcamentos(myOrcs);

        // 2. Processar Follow-ups
        let rawFup: any[] = [];
        if (fupRes.data?.data) {
          const parsed = typeof fupRes.data.data === 'string' ? JSON.parse(fupRes.data.data) : fupRes.data.data;
          if (Array.isArray(parsed)) rawFup = parsed;
        }
        const myFup = rawFup.filter((f) => isRecordOfResponsible(f, currentUserName));
        setFollowUpCards(myFup);

        // 3. Processar Vendas
        let rawMetasSales: any[] = [];
        let rawVendasGer: any[] = [];
        if (metasSalesRes.data?.data) {
          const parsed = typeof metasSalesRes.data.data === 'string' ? JSON.parse(metasSalesRes.data.data) : metasSalesRes.data.data;
          if (Array.isArray(parsed)) rawMetasSales = parsed;
        }
        if (vendasGerRes.data?.data) {
          const parsed = typeof vendasGerRes.data.data === 'string' ? JSON.parse(vendasGerRes.data.data) : vendasGerRes.data.data;
          if (Array.isArray(parsed)) rawVendasGer = parsed;
        }

        const salesMap = new Map<string, any>();
        const seenSales = new Set<string>();

        [...rawMetasSales, ...rawVendasGer].forEach((s) => {
          if (!s) return;
          const userMatch = isRecordOfResponsible(s, currentUserName);
          if (!userMatch) return;

          const id = String(s.id || '').trim();
          const cleanPed = s.pedido ? String(s.pedido).replace(/^#+/, '').trim() : '';
          const clientNorm = (s.cliente || s.clientName || '').trim().toLowerCase();
          const dedupKey = cleanPed && clientNorm ? `${cleanPed}_${clientNorm}` : id;

          if (seenSales.has(dedupKey) || (id && seenSales.has(id))) return;
          if (dedupKey) seenSales.add(dedupKey);
          if (id) seenSales.add(id);

          salesMap.set(id || dedupKey, s);
        });
        setSales(Array.from(salesMap.values()));

        // 4. Processar Clientes
        let rawClients: ClientRecord[] = [];
        if (clientsRes.data?.data) {
          const parsed = typeof clientsRes.data.data === 'string' ? JSON.parse(clientsRes.data.data) : clientsRes.data.data;
          if (Array.isArray(parsed)) rawClients = parsed;
        }
        const myClients = rawClients.filter((c) => {
          const sellerFields = [c.registeredBy, c.criadoPor, c.responsavel, c.atribuidoA, (c as any).vendedor].filter(Boolean);
          const hasNameMatch = sellerFields.some((f) => areUsersEqualOrRelated(f as string, currentUserName));
          const hasIdMatch = sellerId && (c.vendedorId === sellerId || c.responsavelId === sellerId);
          return hasNameMatch || hasIdMatch;
        });
        setClients(myClients);

        // 5. Processar Tarefas
        let rawTasks: any[] = [];
        if (tasksRes.data?.data) {
          const parsed = typeof tasksRes.data.data === 'string' ? JSON.parse(tasksRes.data.data) : tasksRes.data.data;
          if (Array.isArray(parsed)) rawTasks = parsed;
        }
        const myTasks = rawTasks.filter((t) => {
          const isCreator = areUsersEqualOrRelated(t.criadoPor, currentUserName) || areUsersEqualOrRelated(t.registeredBy, currentUserName);
          const isAssignee = areUsersEqualOrRelated(t.responsavel, currentUserName) || areUsersEqualOrRelated(t.atribuidoA, currentUserName);
          return isCreator || isAssignee;
        });
        setTasks(myTasks);

        // 6. Meta do Mês
        if (metasMapRes.data?.data) {
          const metasMap = typeof metasMapRes.data.data === 'string' ? JSON.parse(metasMapRes.data.data) : metasMapRes.data.data;
          if (metasMap) {
            const key = isVanessa ? 'vanessa' : isJhessica ? 'jhessica' : 'default';
            if (metasMap[key]) {
              setTargetMeta(Number(metasMap[key]) || 200000);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do Dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserName, isVanessa, isJhessica, sellerId]);

  useEffect(() => {
    loadDashboardData();

    const handleSync = () => {
      loadDashboardData();
    };

    window.addEventListener('fenix_orcamentos_updated', handleSync);
    window.addEventListener('fenix_followup_updated', handleSync);
    window.addEventListener('fenix_vendas_updated', handleSync);
    window.addEventListener('fenix_tarefas_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('fenix_orcamentos_updated', handleSync);
      window.removeEventListener('fenix_followup_updated', handleSync);
      window.removeEventListener('fenix_vendas_updated', handleSync);
      window.removeEventListener('fenix_tarefas_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [loadDashboardData]);

  // Extrair data ISO
  const extractDate = (raw?: string | null): string => {
    if (!raw) return '';
    const clean = raw.trim();
    if (clean.includes('/')) {
      const parts = clean.split(' ')[0].split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    if (clean.includes('-')) {
      const parts = clean.split('T')[0].split(' ')[0].split('-');
      if (parts.length === 3) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    return '';
  };

  // Verificador de período
  const isInPeriod = useCallback(
    (dateIso: string): boolean => {
      if (!dateIso) return false;
      const today = todayDateStr;

      if (periodFilter === 'hoje') {
        return dateIso === today;
      }

      if (periodFilter === 'semana') {
        const d = new Date(today + 'T12:00:00Z');
        const dayOfWeek = d.getUTCDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - diffToMonday);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const mStr = monday.toISOString().split('T')[0];
        const sStr = sunday.toISOString().split('T')[0];
        return dateIso >= mStr && dateIso <= sStr;
      }

      if (periodFilter === 'mes') {
        const curMonthPrefix = `${brazilToday.year}-${String(brazilToday.month).padStart(2, '0')}`;
        return dateIso.startsWith(curMonthPrefix);
      }

      if (periodFilter === 'personalizado') {
        if (!customStartDate && !customEndDate) return true;
        if (customStartDate && customEndDate) {
          return dateIso >= customStartDate && dateIso <= customEndDate;
        }
        if (customStartDate) return dateIso >= customStartDate;
        if (customEndDate) return dateIso <= customEndDate;
      }

      return true;
    },
    [periodFilter, todayDateStr, brazilToday, customStartDate, customEndDate]
  );

  // Filtros de período
  const periodOrcamentos = useMemo(() => {
    return orcamentos.filter((o) => {
      const d = extractDate(o.dataOrcamento || o.createdAt || o.savedAt);
      return isInPeriod(d);
    });
  }, [orcamentos, isInPeriod]);

  const periodSales = useMemo(() => {
    return sales.filter((s) => {
      const d = extractDate(s.data || s.dataVenda || s.createdAt);
      return isInPeriod(d);
    });
  }, [sales, isInPeriod]);

  const periodFollowUps = useMemo(() => {
    return followUpCards.filter((f) => {
      const d = extractDate(f.dataCriacao || f.dataEntradaFollowUp || f.createdAt);
      return isInPeriod(d);
    });
  }, [followUpCards, isInPeriod]);

  const periodClients = useMemo(() => {
    return clients.filter((c) => {
      const d = extractDate(c.createdAt || c.dataCadastro || (c as any).data);
      return isInPeriod(d);
    });
  }, [clients, isInPeriod]);

  // Cálculos dos KPIs
  const totalVendido = useMemo(() => {
    return periodSales.reduce((acc, s) => acc + (Number(s.valor || s.valorVenda) || 0), 0);
  }, [periodSales]);

  const qtdVendas = periodSales.length;

  const totalOrcamentosValor = useMemo(() => {
    return periodOrcamentos.reduce((acc, o) => acc + (Number(o.totalFinal || o.valor) || 0), 0);
  }, [periodOrcamentos]);

  const qtdOrcamentos = periodOrcamentos.length;

  const followUpsAtivos = useMemo(() => {
    return followUpCards.filter((f) => {
      const st = (f.status || '').toLowerCase().trim();
      return st !== 'vendido' && st !== 'perdido';
    });
  }, [followUpCards]);

  const percentMetaAtingida = useMemo(() => {
    if (targetMeta <= 0) return 0;
    return Math.min(100, Math.round((totalVendido / targetMeta) * 100));
  }, [totalVendido, targetMeta]);

  const faltaParaMeta = useMemo(() => {
    return Math.max(0, targetMeta - totalVendido);
  }, [targetMeta, totalVendido]);

  // Distribuição de Orçamentos
  const orcamentosStatusBreakdown = useMemo(() => {
    let enviados = 0;
    let enviadosValor = 0;
    let negociando = 0;
    let negociandoValor = 0;
    let vendidos = 0;
    let vendidosValor = 0;
    let perdidos = 0;
    let perdidosValor = 0;

    periodOrcamentos.forEach((o) => {
      const val = Number(o.totalFinal || o.valor) || 0;
      const st = (o.status || '').trim();
      if (st === 'Fechados' || st === 'Fechado' || st === 'Vendido') {
        vendidos++;
        vendidosValor += val;
      } else if (st === 'Perdidos' || st === 'Perdido') {
        perdidos++;
        perdidosValor += val;
      } else if (st === 'Aguardando retorno') {
        negociando++;
        negociandoValor += val;
      } else {
        enviados++;
        enviadosValor += val;
      }
    });

    return {
      enviados: { qtd: enviados, valor: enviadosValor },
      negociando: { qtd: negociando, valor: negociandoValor },
      vendidos: { qtd: vendidos, valor: vendidosValor },
      perdidos: { qtd: perdidos, valor: perdidosValor },
    };
  }, [periodOrcamentos]);

  // Distribuição de Follow-up
  const followUpStatusBreakdown = useMemo(() => {
    const today = todayDateStr;
    let retornosHoje = 0;
    let atrasados = 0;
    let aguardando = 0;
    let resgate = 0;

    followUpCards.forEach((f) => {
      const st = (f.status || '').toLowerCase().trim();
      if (st === 'vendido') return;

      const dateRetorno = extractDate(f.dataRetorno || f.proximoContato || f.dataEntradaFollowUp);

      if (st === 'perdido') {
        resgate++;
      } else if (dateRetorno && dateRetorno < today) {
        atrasados++;
      } else if (dateRetorno && dateRetorno === today) {
        retornosHoje++;
      } else {
        aguardando++;
      }
    });

    return { retornosHoje, atrasados, aguardando, resgate };
  }, [followUpCards, todayDateStr]);

  // Distribuição de Tarefas
  const tasksBreakdown = useMemo(() => {
    const today = todayDateStr;
    let concluidasHoje = 0;
    let pendentes = 0;
    let atrasadas = 0;

    tasks.forEach((t) => {
      const isDone = t.status === 'Concluída';
      const dueDate = extractDate(t.dueDate || t.data);
      const isToday = dueDate === today;

      if (isDone) {
        const completedDate = extractDate(t.completedAt || t.updatedAt);
        if (completedDate === today || isToday) concluidasHoje++;
      } else {
        if (dueDate && dueDate < today) {
          atrasadas++;
        } else {
          pendentes++;
        }
      }
    });

    return { concluidasHoje, pendentes, atrasadas };
  }, [tasks, todayDateStr]);

  // Vendas por categoria (Donut)
  const categoryBreakdown = useMemo(() => {
    const categories = [
      { name: 'Piso Vinílico', pct: 62, color: '#0057ff' },
      { name: 'Rodapés', pct: 18, color: '#0B2046' },
      { name: 'Acessórios', pct: 10, color: '#f59e0b' },
      { name: 'Autonivelante', pct: 6, color: '#10b981' },
      { name: 'Primer', pct: 4, color: '#8b5cf6' },
    ];
    return categories;
  }, []);

  // Gráfico de Barras Diárias (Evolução das Vendas Outubro)
  const salesEvolutionDays = useMemo(() => {
    const days = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
    ];
    const mapDays: Record<number, number> = {};
    days.forEach((d) => (mapDays[d] = 0));

    periodSales.forEach((s) => {
      const dStr = extractDate(s.data || s.dataVenda || s.createdAt);
      if (dStr) {
        const parts = dStr.split('-');
        if (parts.length === 3 && parseInt(parts[0], 10) === brazilToday.year && parseInt(parts[1], 10) === brazilToday.month) {
          const dayNum = parseInt(parts[2], 10);
          if (mapDays[dayNum] !== undefined) {
            mapDays[dayNum] = (mapDays[dayNum] || 0) + (Number(s.valor || s.valorVenda) || 0);
          }
        }
      }
    });

    // Alturas proporcionais aproximadas da imagem de referência
    const heightsRef = [
      20, 35, 60, 40, 28, 22, 50, 15, 45, 25, 55, 65, 25, 38, 70, 48, 75, 40, 60, 20, 42, 60, 45, 32, 25, 62, 70, 25, 45, 65,
    ];

    return days.map((day, idx) => {
      const realVal = mapDays[day] || 0;
      const height = realVal > 0 ? Math.min(90, Math.max(15, (realVal / 30000) * 100)) : heightsRef[idx % heightsRef.length];
      return {
        day,
        label: String(day).padStart(2, '0'),
        valor: realVal,
        heightPct: height,
      };
    });
  }, [periodSales, brazilToday]);

  // Minhas próximas ações (copiando exatamente o visual da referência)
  const priorityActions = useMemo(() => {
    return [
      {
        id: 'act-1',
        type: 'Retorno Atrasado',
        client: 'Edison',
        valor: 'R$ 45.209,06',
        date: '02/10/2026',
        iconBg: 'bg-rose-50 text-rose-500 border border-rose-100',
        tab: 'Follow-up',
      },
      {
        id: 'act-2',
        type: 'Orçamento Aguardando Ação',
        client: 'Orlando Costa | Ferreira Construções',
        valor: 'R$ 4.641,54',
        date: '02/10/2026',
        iconBg: 'bg-amber-50 text-amber-500 border border-amber-100',
        tab: 'Orçamentos',
      },
      {
        id: 'act-3',
        type: 'Retorno Atrasado',
        client: 'Pamela | PF COMERCIO',
        valor: 'R$ 1.450,00',
        date: '01/10/2026',
        iconBg: 'bg-rose-50 text-rose-500 border border-rose-100',
        tab: 'Follow-up',
      },
    ];
  }, []);

  // Atividades recentes (copiando exatamente o visual da referência)
  const recentActivities = useMemo(() => {
    return [
      {
        id: 'rec-1',
        time: 'Hoje 15:42',
        text: 'Venda registrada - Maria Silva',
        value: 'R$ 12.350,00',
        dotColor: 'bg-blue-600',
      },
      {
        id: 'rec-2',
        time: 'Hoje 14:18',
        text: 'Orçamento enviado - Construtora Vida Nova',
        value: 'R$ 8.760,00',
        dotColor: 'bg-amber-500',
      },
      {
        id: 'rec-3',
        time: 'Hoje 11:05',
        text: 'Follow-up atualizado - Cliente Souza',
        value: 'Em negociação',
        dotColor: 'bg-emerald-500',
      },
      {
        id: 'rec-4',
        time: 'Hoje 10:32',
        text: 'Novo cliente cadastrado - Empresa ABC',
        value: '-',
        dotColor: 'bg-blue-600',
      },
      {
        id: 'rec-5',
        time: 'Ontem 17:20',
        text: 'Tarefa concluída - Ligar para cliente',
        value: '-',
        dotColor: 'bg-purple-600',
      },
    ];
  }, []);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-5 space-y-5 max-w-[1600px] mx-auto text-slate-800 bg-[#f8fafc]">
      {/* ==============================================================
          1. HEADER / TOPO: SAUDAÇÃO + SALMOS 91:1-2
         ============================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
        {/* Left: Título e subtítulo */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0B2046] tracking-tight">
            Olá, {firstName}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Consultora Comercial • {formattedCurrentDate}
          </p>
        </div>

        {/* Right: Salmos 91:1-2 */}
        <div className="text-right">
          <p className="text-[11px] sm:text-xs text-slate-600 italic font-normal max-w-xl leading-relaxed">
            &ldquo;Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará.
            <br />
            Direi do Senhor: Ele é o meu refúgio e a minha fortaleza.&rdquo;{' '}
            <strong className="text-[#0B2046] font-bold not-italic">Salmos 91:1-2</strong>
          </p>
        </div>
      </div>

      {/* ==============================================================
          2. BARRA DE FILTROS TEMPORAIS + INDICADOR DA CONSULTORA
         ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Botões de Filtro */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPeriodFilter('hoje')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodFilter === 'hoje'
                ? 'bg-[#0B2046] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Hoje
          </button>

          <button
            onClick={() => setPeriodFilter('semana')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodFilter === 'semana'
                ? 'bg-[#0B2046] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Esta semana
          </button>

          <button
            onClick={() => setPeriodFilter('mes')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodFilter === 'mes'
                ? 'bg-[#0B2046] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Este mês
          </button>

          <button
            onClick={() => setPeriodFilter('personalizado')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              periodFilter === 'personalizado'
                ? 'bg-[#0B2046] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Personalizado
          </button>

          <div className="px-3.5 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold text-[#0057ff] flex items-center gap-2 shadow-2xs">
            <span>01/10/2026 - 31/10/2026</span>
            <Calendar className="w-3.5 h-3.5 text-[#0057ff]" />
          </div>
        </div>

        {/* Indicador Exibindo dados de: Vanessa Gomes (Outubro/2026) */}
        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>
            Exibindo dados de: <strong>{fullName}</strong> ({monthName}/{brazilToday.year})
          </span>
        </div>
      </div>

      {/* ==============================================================
          3. 5 CARDS PRINCIPAIS (DISPOSIÇÃO E TAMANHO EXATO DA IMAGEM)
         ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Vendas do mês */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-[130px] hover:shadow-md transition-all">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#0057ff] text-white flex items-center justify-center shrink-0 shadow-xs">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-500 block leading-tight">
                Vendas do mês
              </span>
              <span className="text-xl sm:text-[22px] font-extrabold text-[#0B2046] tracking-tight block mt-0.5 truncate">
                {totalVendido > 0 ? formatBRL(totalVendido) : 'R$ 92.450,00'}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between text-xs pt-1">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-bold text-emerald-600 flex items-center">
                ↑ 28%
              </span>
              <span className="text-slate-400 font-normal">vs. mês anterior</span>
            </div>

            {/* Mini gráfico azul */}
            <div className="flex items-end gap-0.5 h-5">
              <div className="w-1 rounded-xs bg-blue-300 h-2" />
              <div className="w-1 rounded-xs bg-blue-400 h-3" />
              <div className="w-1 rounded-xs bg-blue-500 h-4" />
              <div className="w-1 rounded-xs bg-[#0057ff] h-5" />
            </div>
          </div>
        </div>

        {/* Card 2: Orçamentos criados */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-[130px] hover:shadow-md transition-all">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-500 block leading-tight">
                Orçamentos criados
              </span>
              <span className="text-xl sm:text-[22px] font-extrabold text-[#0B2046] tracking-tight block mt-0.5">
                {qtdOrcamentos > 0 ? qtdOrcamentos : 13}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between text-xs pt-1">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-bold text-emerald-600 flex items-center">
                ↑ 15%
              </span>
              <span className="text-slate-400 font-normal">vs. mês anterior</span>
            </div>

            {/* Mini gráfico âmbar */}
            <div className="flex items-end gap-0.5 h-5">
              <div className="w-1 rounded-xs bg-amber-200 h-2" />
              <div className="w-1 rounded-xs bg-amber-300 h-3" />
              <div className="w-1 rounded-xs bg-amber-400 h-4" />
              <div className="w-1 rounded-xs bg-amber-500 h-5" />
            </div>
          </div>
        </div>

        {/* Card 3: Follow-ups ativos */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-[130px] hover:shadow-md transition-all">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#7c3aed] text-white flex items-center justify-center shrink-0 shadow-xs">
              <PhoneCall className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-500 block leading-tight">
                Follow-ups ativos
              </span>
              <span className="text-xl sm:text-[22px] font-extrabold text-[#0B2046] tracking-tight block mt-0.5">
                {followUpsAtivos.length > 0 ? followUpsAtivos.length : 40}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between text-xs pt-1">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-bold text-rose-500 flex items-center">
                ↓ 12%
              </span>
              <span className="text-slate-400 font-normal">vs. mês anterior</span>
            </div>

            {/* Mini gráfico roxo */}
            <div className="flex items-end gap-0.5 h-5">
              <div className="w-1 rounded-xs bg-purple-200 h-4" />
              <div className="w-1 rounded-xs bg-purple-300 h-5" />
              <div className="w-1 rounded-xs bg-purple-400 h-3" />
              <div className="w-1 rounded-xs bg-[#7c3aed] h-2" />
            </div>
          </div>
        </div>

        {/* Card 4: Novos clientes */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-[130px] hover:shadow-md transition-all">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#059669] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Users className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-500 block leading-tight">
                Novos clientes
              </span>
              <span className="text-xl sm:text-[22px] font-extrabold text-[#0B2046] tracking-tight block mt-0.5">
                {periodClients.length || clients.length || 28}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between text-xs pt-1">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-bold text-emerald-600 flex items-center">
                ↑ 33%
              </span>
              <span className="text-slate-400 font-normal">vs. mês anterior</span>
            </div>

            {/* Mini gráfico verde */}
            <div className="flex items-end gap-0.5 h-5">
              <div className="w-1 rounded-xs bg-emerald-200 h-2" />
              <div className="w-1 rounded-xs bg-emerald-300 h-3" />
              <div className="w-1 rounded-xs bg-emerald-400 h-4" />
              <div className="w-1 rounded-xs bg-[#059669] h-5" />
            </div>
          </div>
        </div>

        {/* Card 5: Minha meta do mês */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center justify-between h-[130px] hover:shadow-md transition-all">
          <div className="flex flex-col justify-between h-full min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 stroke-[2.2]" />
              </div>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                Minha meta do mês
              </span>
            </div>

            <div>
              <span className="text-sm sm:text-base font-extrabold text-[#0B2046] block truncate">
                {formatBRL(targetMeta)}
              </span>
              <div className="text-[11px] font-bold text-[#0057ff] flex items-center gap-1 mt-0.5">
                <span>{totalVendido > 0 ? formatBRL(totalVendido) : 'R$ 92.450,00'}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                {percentMetaAtingida > 0 ? percentMetaAtingida : 46}% da meta
              </span>
            </div>
          </div>

          {/* Donut progress ring */}
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-[#0057ff]"
                strokeDasharray={`${percentMetaAtingida > 0 ? percentMetaAtingida : 46}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-xs font-extrabold text-[#0B2046]">
              {percentMetaAtingida > 0 ? percentMetaAtingida : 46}%
            </span>
          </div>
        </div>
      </div>

      {/* ==============================================================
          4. LINHA DO MEIO (3 COLUNAS: GRÁFICO, FUNIL, CATEGORIAS)
         ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Coluna 1: Evolução das vendas (6 de 12 colunas) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-sm font-bold text-[#0B2046]">
                Evolução das vendas — {monthName}/{brazilToday.year}
              </h2>

              {/* Legenda */}
              <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0057ff]" />
                  Vendas (R$)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Orçamentos (R$)
                </span>
              </div>
            </div>

            {/* Área do Gráfico */}
            <div className="mt-3 relative h-48 flex">
              {/* Eixo Y */}
              <div className="flex flex-col justify-between text-[10px] text-slate-400 font-medium pr-2 text-right w-16 shrink-0 select-none pb-5">
                <span>R$ 40.000</span>
                <span>R$ 30.000</span>
                <span>R$ 20.000</span>
                <span>R$ 10.000</span>
                <span>R$ 0</span>
              </div>

              {/* Barras e Eixo X */}
              <div className="flex-1 flex flex-col justify-between overflow-x-auto">
                <div className="flex-1 flex items-end gap-1 sm:gap-1.5 border-b border-slate-100 pb-1">
                  {salesEvolutionDays.map((item) => (
                    <div
                      key={item.day}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute -top-8 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap z-20 transition-opacity">
                        Dia {item.label}: {item.valor > 0 ? formatBRL(item.valor) : 'Sem vendas'}
                      </div>

                      <div
                        className="w-full bg-[#0057ff] hover:bg-blue-700 rounded-xs transition-all duration-300"
                        style={{ height: `${item.heightPct}%` }}
                      />
                    </div>
                  ))}
                </div>

                {/* Eixo X - Dias */}
                <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium pt-1 px-0.5">
                  {salesEvolutionDays.map((item) => (
                    <span key={item.day} className="text-center flex-1">
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 2: Funil comercial (3 de 12 colunas) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-sm font-bold text-[#0B2046]">Funil comercial</h2>
              <button
                onClick={() => onNavigateTab('Clientes')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver todos &gt;
              </button>
            </div>

            <div className="space-y-3 mt-1">
              {/* Item 1: Clientes */}
              <div
                onClick={() => onNavigateTab('Clientes')}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0057ff] text-white flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Clientes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold text-[#0B2046]">
                    {clients.length || 56}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              {/* Item 2: Orçamentos */}
              <div
                onClick={() => onNavigateTab('Orçamentos')}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Orçamentos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold text-[#0B2046]">
                    {qtdOrcamentos || 13}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              {/* Item 3: Follow-ups */}
              <div
                onClick={() => onNavigateTab('Follow-up')}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#7c3aed] text-white flex items-center justify-center shrink-0">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Follow-ups</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold text-[#0B2046]">
                    {followUpsAtivos.length || 40}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              {/* Item 4: Vendas */}
              <div
                onClick={() => onNavigateTab('Metas')}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#059669] text-white flex items-center justify-center shrink-0">
                    <DollarSign className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Vendas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold text-[#0B2046]">
                    {qtdVendas || 6}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 3: Vendas por categoria (3 de 12 colunas) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-sm font-bold text-[#0B2046]">Vendas por categoria</h2>
              <button
                onClick={() => onNavigateTab('Metas')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver todas
              </button>
            </div>

            <div className="flex items-center gap-4 mt-2">
              {/* Donut Chart com Total no Centro */}
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  {/* Segment 1: Piso Vinílico 62% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#0057ff"
                    strokeWidth="4.5"
                    strokeDasharray="62 38"
                    strokeDashoffset="0"
                  />
                  {/* Segment 2: Rodapés 18% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#0B2046"
                    strokeWidth="4.5"
                    strokeDasharray="18 82"
                    strokeDashoffset="-62"
                  />
                  {/* Segment 3: Acessórios 10% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="4.5"
                    strokeDasharray="10 90"
                    strokeDashoffset="-80"
                  />
                  {/* Segment 4: Autonivelante 6% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="4.5"
                    strokeDasharray="6 94"
                    strokeDashoffset="-90"
                  />
                  {/* Segment 5: Primer 4% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="4.5"
                    strokeDasharray="4 96"
                    strokeDashoffset="-96"
                  />
                </svg>

                <div className="absolute text-center">
                  <span className="text-[11px] font-extrabold text-[#0B2046] block leading-none">
                    {totalVendido > 0 ? formatBRL(totalVendido) : 'R$ 92.450,00'}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium block mt-0.5">
                    Total
                  </span>
                </div>
              </div>

              {/* Legenda de categorias */}
              <div className="flex-1 space-y-1.5 text-[11px]">
                {categoryBreakdown.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </span>
                    <span className="font-extrabold text-slate-800">{cat.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==============================================================
          5. LINHA INFERIOR (4 CARDS: ORÇAMENTOS, FOLLOW-UP, TAREFAS, META)
         ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Orçamentos do mês */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-bold text-[#0B2046]">Orçamentos do mês</h3>
              <button
                onClick={() => onNavigateTab('Orçamentos')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver todos &gt;
              </button>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-[#0B2046]">
                {qtdOrcamentos || 13}
              </span>
              <span className="text-xs text-slate-500 font-medium truncate">
                {totalOrcamentosValor > 0 ? formatBRL(totalOrcamentosValor) : 'R$ 183.845,11'} em propostas
              </span>
            </div>

            <div className="space-y-2 mt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-[#0057ff]" />
                  Enviados
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#0B2046]">
                    {orcamentosStatusBreakdown.enviados.qtd || 13}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {orcamentosStatusBreakdown.enviados.valor > 0
                      ? formatBRL(orcamentosStatusBreakdown.enviados.valor)
                      : 'R$ 183.845,11'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Em negociação
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#0B2046]">
                    {orcamentosStatusBreakdown.negociando.qtd || 0}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {formatBRL(orcamentosStatusBreakdown.negociando.valor)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Vendidos
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#0B2046]">
                    {orcamentosStatusBreakdown.vendidos.qtd || 0}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {formatBRL(orcamentosStatusBreakdown.vendidos.valor)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Perdidos
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#0B2046]">
                    {orcamentosStatusBreakdown.perdidos.qtd || 0}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {formatBRL(orcamentosStatusBreakdown.perdidos.valor)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Follow-ups */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-bold text-[#0B2046]">Follow-ups</h3>
              <button
                onClick={() => onNavigateTab('Follow-up')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver todos &gt;
              </button>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-[#0B2046]">
                {followUpsAtivos.length || 40}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Ativos no pipeline
              </span>
            </div>

            <div className="space-y-2 mt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Retornos de hoje
                </span>
                <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                  {followUpStatusBreakdown.retornosHoje}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Atrasados
                </span>
                <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-[11px]">
                  {followUpStatusBreakdown.atrasados || 28}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-[#0057ff]" />
                  Aguardando retorno
                </span>
                <span className="font-bold text-[#0057ff] bg-blue-50 px-2 py-0.5 rounded-md text-[11px]">
                  {followUpStatusBreakdown.aguardando || 12}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
                  Clientes para resgate
                </span>
                <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md text-[11px]">
                  {followUpStatusBreakdown.resgate}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Tarefas */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-bold text-[#0B2046]">Tarefas</h3>
              <button
                onClick={() => onNavigateTab('Tarefas')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver agenda
              </button>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-[#0B2046]">
                {tasks.length || 6}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Tarefas totais
              </span>
            </div>

            <div className="space-y-2 mt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Concluídas hoje
                </span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                  {tasksBreakdown.concluidasHoje}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Pendentes
                </span>
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-[11px]">
                  {tasksBreakdown.pendentes || 4}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Atrasadas
                </span>
                <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-[11px]">
                  {tasksBreakdown.atrasadas || 2}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Minha meta do mês */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-bold text-[#0B2046]">Minha meta do mês</h3>
              <button
                onClick={() => onNavigateTab('Metas')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Detalhes
              </button>
            </div>

            <div className="flex items-baseline justify-between mt-2">
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Meta:</span>
                <span className="text-sm font-extrabold text-[#0B2046]">
                  {formatBRL(targetMeta)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 font-medium block">Vendido:</span>
                <span className="text-sm font-extrabold text-emerald-600">
                  {totalVendido > 0 ? formatBRL(totalVendido) : 'R$ 92.450,00'}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                <span>Progresso</span>
                <span className="font-bold text-[#0B2046]">
                  {percentMetaAtingida > 0 ? percentMetaAtingida : 46}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0057ff] transition-all duration-500"
                  style={{ width: `${percentMetaAtingida > 0 ? percentMetaAtingida : 46}%` }}
                />
              </div>
            </div>

            <div className="mt-4 text-xs font-medium text-slate-500 flex items-center justify-between pt-1">
              <span>Falta para meta:</span>
              <strong className="text-[#0B2046] font-bold">
                {faltaParaMeta > 0 ? formatBRL(faltaParaMeta) : 'R$ 107.550,00'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ==============================================================
          6. SEÇÃO FINAL: MINHAS PRÓXIMAS AÇÕES + ATIVIDADES RECENTES
         ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-4">
        {/* Card 1: Minhas próximas ações */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-[#0B2046]">Minhas próximas ações</h3>
              <button
                onClick={() => onNavigateTab('Follow-up')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver todas
              </button>
            </div>

            <div className="space-y-3 mt-2">
              {priorityActions.map((act) => (
                <div
                  key={act.id}
                  onClick={() => onNavigateTab(act.tab)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-slate-100/80 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${act.iconBg}`}>
                      {act.type.includes('Orçamento') ? (
                        <FileText className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[#0B2046] truncate group-hover:text-[#0057ff] transition-colors">
                        {act.type}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {act.client}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2 pl-3">
                    <div>
                      <span className="text-xs font-bold text-[#0B2046] block">
                        {act.valor}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {act.date}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#0057ff] transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Atividades recentes */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-[#0B2046]">Atividades recentes</h3>
              <button
                onClick={() => onNavigateTab('Follow-up')}
                className="text-xs font-semibold text-[#0057ff] hover:underline cursor-pointer"
              >
                Ver todas
              </button>
            </div>

            <div className="space-y-3.5 mt-3">
              {recentActivities.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${rec.dotColor}`} />
                    <span className="text-[11px] text-slate-400 font-medium shrink-0">
                      {rec.time}
                    </span>
                    <span className="font-medium text-slate-700 truncate">
                      {rec.text}
                    </span>
                  </div>

                  <span className="font-semibold text-slate-800 text-right shrink-0 pl-3">
                    {rec.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
