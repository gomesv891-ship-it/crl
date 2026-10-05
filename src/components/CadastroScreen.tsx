import React, { useState, useEffect } from 'react';
import {
  Home,
  UserPlus,
  User,
  Phone,
  ChevronDown,
  Info,
  Star,
  FileText,
  Save,
  CheckCircle2,
  Loader2,
  Calculator,
  CheckSquare,
  Users,
  AlertCircle,
  X,
} from 'lucide-react';
import { ClientFormData, ClientRecord, ClientType } from '../types';
import { addClientActivity } from '../utils/activities';
import { filterClientsForUser, getSellerIdForUser } from '../utils/userDataFilter';
import { saveItemToSupabase } from '../utils/supabaseClient';

interface CadastroScreenProps {
  currentUserName: string;
  selectedClient?: ClientRecord | null;
  onQuickAction?: (
    action: 'Calculadora' | 'Orçamentos' | 'Tarefas' | 'Clientes',
    client: ClientRecord,
    options?: { createOrcamento?: boolean; openNewTaskModal?: boolean }
  ) => void;
  onClientSaved?: (client: ClientRecord) => void;
}

const CLIENT_TYPES: ClientType[] = [
  'Arquiteto',
  'Cliente Final',
  'Construtora',
  'Engenheiro',
  'Instalador',
  'Revenda',
];

export const CadastroScreen: React.FC<CadastroScreenProps> = ({
  currentUserName,
  selectedClient = null,
  onQuickAction,
  onClientSaved,
}) => {
  const [formData, setFormData] = useState<ClientFormData>({
    name: selectedClient?.name || '',
    whatsapp: selectedClient?.whatsapp || '',
    clientType: selectedClient?.clientType || '',
    isImportant: selectedClient?.isImportant || false,
    notes: selectedClient?.notes || '',
  });

  const [activeClient, setActiveClient] = useState<ClientRecord | null>(selectedClient || null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [lastSavedName, setLastSavedName] = useState('');
  const [savedClientsList, setSavedClientsList] = useState<ClientRecord[]>([]);
  const [savedSuccessClient, setSavedSuccessClient] = useState<ClientRecord | null>(null);

  // Load existing clients from storage on mount & keep in sync with updates
  useEffect(() => {
    const refreshList = () => {
      try {
        const stored = localStorage.getItem('fenix_clients_db');
        if (stored) {
          setSavedClientsList(filterClientsForUser(JSON.parse(stored), currentUserName));
        }
      } catch {
        // ignore
      }
    };

    refreshList();
    window.addEventListener('fenix_clients_updated', refreshList);
    window.addEventListener('storage', refreshList);

    return () => {
      window.removeEventListener('fenix_clients_updated', refreshList);
      window.removeEventListener('storage', refreshList);
    };
  }, [currentUserName]);

  // Sync if selectedClient prop changes externally
  useEffect(() => {
    if (selectedClient) {
      setActiveClient(selectedClient);
      setFormData({
        name: selectedClient.name || '',
        whatsapp: selectedClient.whatsapp || '',
        clientType: selectedClient.clientType || '',
        isImportant: !!selectedClient.isImportant,
        notes: selectedClient.notes || '',
      });
      setSubmitError(null);
      setErrors({});
    }
  }, [selectedClient]);

  // Auto-mask WhatsApp: (XX) XXXXX-XXXX
  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    let formatted = '';
    if (digits.length === 0) {
      formatted = '';
    } else if (digits.length <= 2) {
      formatted = `(${digits}`;
    } else if (digits.length <= 7) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    }

    setFormData((prev) => ({ ...prev, whatsapp: formatted }));
    if (errors.whatsapp) {
      setErrors((prev) => ({ ...prev, whatsapp: '' }));
    }
    if (submitError) setSubmitError(null);
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Informe o Nome ou Razão Social';
    }

    const digits = formData.whatsapp.replace(/\D/g, '');
    if (!formData.whatsapp.trim() || digits.length < 10) {
      newErrors.whatsapp = 'Informe um WhatsApp válido com DDD';
    }

    if (!formData.clientType) {
      newErrors.clientType = 'Selecione o Tipo de Cliente';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setSubmitError(null);

    try {
      const newClient: ClientRecord = {
        name: formData.name.trim(),
        whatsapp: formData.whatsapp.trim(),
        clientType: (formData.clientType as ClientType) || 'Cliente Final',
        isImportant: formData.isImportant,
        notes: formData.notes?.trim() || undefined,
        status: activeClient?.status || 'ativo',
        id: activeClient?.id || `cli_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        registeredAt: activeClient?.registeredAt || new Date().toISOString(),
        registeredBy: activeClient?.registeredBy || currentUserName || 'Vanessa Gomes',
        vendedorId: activeClient?.vendedorId || getSellerIdForUser(currentUserName || 'Vanessa Gomes'),
      };

      // 1. Gravação oficial no Supabase com confirmação estrita antes do feedback
      const res = await saveItemToSupabase('fenix_clients_db', newClient, 'id', currentUserName);
      if (!res.success) {
        // Exibe o erro real e NÃO limpa o formulário para o usuário não perder dados
        setSubmitError(res.error || 'Erro ao salvar cliente no banco de dados Supabase.');
        setIsSaving(false);
        return;
      }

      const confirmedClient: ClientRecord = (res.data as ClientRecord) || newClient;

      // 2. Registrar auditoria do cliente
      try {
        if (activeClient?.id) {
          addClientActivity({
            clientId: confirmedClient.id,
            type: 'cadastro_atualizado',
            title: 'Cadastro atualizado',
            description: `Cadastro atualizado no sistema como ${confirmedClient.clientType}.`,
            date: new Date().toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
            userName: currentUserName || 'Vanessa Gomes',
            relevantInfo: confirmedClient.notes ? `Obs: ${confirmedClient.notes}` : undefined,
          });
        } else {
          addClientActivity({
            clientId: confirmedClient.id,
            type: 'cadastro',
            title: 'Cliente cadastrado no sistema',
            description: `Cliente cadastrado com sucesso como ${confirmedClient.clientType}.`,
            date: new Date().toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
            userName: currentUserName || 'Vanessa Gomes',
            relevantInfo: confirmedClient.notes ? `Obs: ${confirmedClient.notes}` : undefined,
          });
        }
      } catch {}

      // 3. Atualiza somente a lista afetada sem recarregar o sistema inteiro
      setSavedClientsList((prev) => {
        const filtered = prev.filter((c) => c.id !== confirmedClient.id);
        return [confirmedClient, ...filtered];
      });

      setLastSavedName(confirmedClient.name);
      setActiveClient(confirmedClient);
      setIsSaving(false);
      setShowSuccessToast(false);
      setSavedSuccessClient(confirmedClient);
      onClientSaved?.(confirmedClient);
    } catch (err: any) {
      setIsSaving(false);
      setSubmitError(err?.message || 'Erro ao salvar cliente. Verifique a conexão e tente novamente.');
    }
  };

  const handleCancel = () => {
    setFormData({
      name: '',
      whatsapp: '',
      clientType: '',
      isImportant: false,
      notes: '',
    });
    setActiveClient(null);
    setErrors({});
    setSubmitError(null);
    setSavedSuccessClient(null);
  };

  const handleSelectExistingClient = (clientId: string) => {
    const client = savedClientsList.find((c) => c.id === clientId);
    if (client) {
      setActiveClient(client);
      setFormData({
        name: client.name,
        whatsapp: client.whatsapp,
        clientType: client.clientType,
        isImportant: client.isImportant,
        notes: client.notes,
      });
      setErrors({});
    }
  };

  const handleGoToQuickAction = async (
    action: 'Calculadora' | 'Orçamentos' | 'Tarefas',
    options?: { createOrcamento?: boolean; openNewTaskModal?: boolean }
  ) => {
    const clientToUse: ClientRecord = activeClient || {
      id: `cli_${Date.now()}`,
      name: formData.name.trim() || 'Cliente em Cadastro',
      whatsapp: formData.whatsapp,
      clientType: formData.clientType || 'Cliente Final',
      isImportant: formData.isImportant,
      notes: formData.notes,
      registeredAt: new Date().toISOString(),
      registeredBy: currentUserName || 'Vanessa Gomes',
      vendedorId: getSellerIdForUser(currentUserName || 'Vanessa Gomes'),
    };

    if (formData.name.trim() && !activeClient) {
      try {
        const stored = localStorage.getItem('fenix_clients_db');
        const list: ClientRecord[] = stored ? JSON.parse(stored) : [];
        list.push(clientToUse);
        localStorage.setItem('fenix_clients_db', JSON.stringify(list));
        await saveItemToSupabase('fenix_clients_db', clientToUse, 'id', currentUserName);
      } catch {
        // ignore
      }
    }

    localStorage.setItem('fenix_active_client', JSON.stringify(clientToUse));
    setActiveClient(clientToUse);
    onClientSaved?.(clientToUse);
    onQuickAction?.(action, clientToUse, options);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 sm:py-8 space-y-6">
      {/* Breadcrumb row: Home > Cadastro > Novo Cliente */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
        <Home className="w-4 h-4 text-slate-400" />
        <span className="text-slate-400">›</span>
        <span className="hover:text-slate-700 cursor-pointer">Cadastro</span>
        <span className="text-slate-400">›</span>
        <span className="text-slate-900 font-semibold">Novo Cliente</span>
      </nav>

      {/* Page Title Row: Large blue outline UserPlus icon + Heading */}
      <div className="flex items-start gap-4 pb-1">
        <div className="text-[#0057ff] flex-shrink-0 pt-0.5">
          <UserPlus className="w-9 h-9 sm:w-11 sm:h-11 stroke-[2]" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#091122] tracking-tight">
            Cadastro de Cliente
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
            Preencha as informações abaixo para cadastrar um novo cliente.
          </p>
        </div>
      </div>

      {/* TELA / MODAL APÓS CADASTRAR CLIENTE: Restaurada com os 3 cards e Permanecer na Lista de Clientes */}
      {savedSuccessClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-xl w-full flex flex-col my-auto overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0052cc] flex items-center justify-center flex-shrink-0 border border-blue-100 shadow-2xs">
                  <User className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-[#091122] tracking-tight">
                    Cliente Cadastrado
                  </h2>
                  <p className="text-xs text-slate-500 font-normal">
                    Registro salvo com sucesso. Escolha o próximo passo:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const cli = savedSuccessClient;
                  setSavedSuccessClient(null);
                  handleCancel();
                  onQuickAction?.('Clientes', cli);
                }}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Cards */}
            <div className="p-6 sm:p-8 flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-sm">
                <CheckCircle2 className="w-9 h-9 stroke-[2.4]" />
              </div>

              <div className="space-y-1.5 max-w-md">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#0052cc] text-xs font-bold border border-blue-100 mb-1">
                  <span>{savedSuccessClient.clientType}</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-[#091122] tracking-tight">
                  &ldquo;{savedSuccessClient.name}&rdquo; salvo com sucesso!
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-normal">
                  O que você deseja fazer agora com este cliente?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full pt-1">
                {/* Card 1: Tarefas */}
                <button
                  type="button"
                  onClick={() => {
                    const cli = savedSuccessClient;
                    setSavedSuccessClient(null);
                    handleCancel();
                    handleGoToQuickAction('Tarefas', { openNewTaskModal: true });
                  }}
                  className="p-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-800 flex flex-col items-center justify-center text-center gap-2 shadow-sm transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#0052cc] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckSquare className="w-6 h-6 text-[#0052cc] stroke-[2.2]" />
                  </div>
                  <span className="text-sm font-bold text-slate-900">Tarefas</span>
                  <span className="text-[11px] text-slate-500 font-medium leading-tight">
                    Agendar pendência, follow-up ou contato
                  </span>
                </button>

                {/* Card 2: Orçamento */}
                <button
                  type="button"
                  onClick={() => {
                    const cli = savedSuccessClient;
                    setSavedSuccessClient(null);
                    handleCancel();
                    handleGoToQuickAction('Orçamentos', { createOrcamento: true });
                  }}
                  className="p-4 rounded-2xl bg-[#0052cc] hover:bg-[#0047b3] text-white flex flex-col items-center justify-center text-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-white stroke-[2.2]" />
                  </div>
                  <span className="text-sm font-bold">Orçamento</span>
                  <span className="text-[11px] text-blue-100 font-medium leading-tight">
                    Proposta comercial com tabela de {savedSuccessClient.clientType}
                  </span>
                </button>

                {/* Card 3: Calculadora */}
                <button
                  type="button"
                  onClick={() => {
                    const cli = savedSuccessClient;
                    setSavedSuccessClient(null);
                    handleCancel();
                    handleGoToQuickAction('Calculadora');
                  }}
                  className="p-4 rounded-2xl bg-[#091122] hover:bg-black text-white flex flex-col items-center justify-center text-center gap-2 shadow-lg shadow-slate-900/20 transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Calculator className="w-6 h-6 text-white stroke-[2.2]" />
                  </div>
                  <span className="text-sm font-bold">Calculadora</span>
                  <span className="text-[11px] text-slate-300 font-medium leading-tight">
                    Cálculo técnico de pisos, m², caixas e cola
                  </span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 w-full flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const cli = savedSuccessClient;
                    setSavedSuccessClient(null);
                    handleCancel();
                    onQuickAction?.('Clientes', cli);
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  Permanecer na Lista de Clientes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Single Composition Form Card: Wider & Balanced across the available space */}
      <div className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200/90 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04)] p-6 sm:p-9">
        {/* Section Heading inside Card */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#091122] tracking-tight">
              Informações do Cliente
            </h2>
            {activeClient && (
              <p className="text-xs text-blue-600 font-medium mt-0.5">
                Editando cliente: <strong className="font-semibold">{activeClient.name}</strong>
              </p>
            )}
          </div>
          {activeClient && (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-[#0057ff] hover:underline font-semibold cursor-pointer self-start sm:self-auto"
            >
              + Limpar para Novo Cadastro
            </button>
          )}
        </div>

        {/* Banner de Erro Real do Supabase */}
        {submitError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">Não foi possível salvar no banco de dados</p>
              <p className="text-xs mt-0.5 text-rose-700 leading-relaxed">{submitError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Campo: Nome / Razão Social * */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-2 tracking-tight">
              Nome / Razão Social <span className="text-[#0057ff]">*</span>
            </label>
            <div
              className={`h-12 sm:h-13 rounded-xl border transition-all flex items-center px-4 ${
                errors.name
                  ? 'border-rose-300 bg-rose-50/20 ring-3 ring-rose-200/60'
                  : 'border-slate-200 bg-white hover:border-slate-300 focus-within:border-[#0057ff] focus-within:ring-4 focus-within:ring-[#0057ff]/10'
              }`}
            >
              <User className="w-4 h-4 text-slate-400 mr-3 flex-shrink-0 stroke-[1.8]" />
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                placeholder="Digite o nome ou razão social do cliente"
                className="w-full bg-transparent text-slate-800 text-sm placeholder:text-slate-400 outline-none font-medium"
              />
            </div>
            {errors.name && (
              <p className="text-xs text-rose-500 mt-1.5 ml-1 font-medium">{errors.name}</p>
            )}
          </div>

          {/* Row: WhatsApp * & Tipo de Cliente * */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Campo: WhatsApp * */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-2 tracking-tight">
                WhatsApp <span className="text-[#0057ff]">*</span>
              </label>
              <div
                className={`h-12 sm:h-13 rounded-xl border transition-all flex items-center px-4 ${
                  errors.whatsapp
                    ? 'border-rose-300 bg-rose-50/20 ring-3 ring-rose-200/60'
                    : 'border-slate-200 bg-white hover:border-slate-300 focus-within:border-[#0057ff] focus-within:ring-4 focus-within:ring-[#0057ff]/10'
                }`}
              >
                <Phone className="w-4 h-4 text-slate-400 mr-3 flex-shrink-0 stroke-[1.8]" />
                <input
                  type="tel"
                  value={formData.whatsapp}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-transparent text-slate-800 text-sm placeholder:text-slate-400 outline-none font-medium"
                />
              </div>
              {errors.whatsapp && (
                <p className="text-xs text-rose-500 mt-1.5 ml-1 font-medium">
                  {errors.whatsapp}
                </p>
              )}
            </div>

            {/* Campo: Tipo de Cliente * */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-2 tracking-tight">
                Tipo de Cliente <span className="text-[#0057ff]">*</span>
              </label>
              <div
                className={`relative h-12 sm:h-13 rounded-xl border transition-all flex items-center px-4 ${
                  errors.clientType
                    ? 'border-rose-300 bg-rose-50/20 ring-3 ring-rose-200/60'
                    : 'border-slate-200 bg-white hover:border-slate-300 focus-within:border-[#0057ff] focus-within:ring-4 focus-within:ring-[#0057ff]/10'
                }`}
              >
                <select
                  value={formData.clientType}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      clientType: e.target.value as ClientType,
                    });
                    if (errors.clientType) setErrors({ ...errors, clientType: '' });
                  }}
                  className={`w-full bg-transparent text-sm outline-none cursor-pointer appearance-none font-medium ${
                    formData.clientType ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  <option value="" disabled>
                    Selecione o tipo
                  </option>
                  {CLIENT_TYPES.map((type) => (
                    <option key={type} value={type} className="text-slate-800">
                      {type}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-4 stroke-[2]" />
              </div>
              {errors.clientType && (
                <p className="text-xs text-rose-500 mt-1.5 ml-1 font-medium">
                  {errors.clientType}
                </p>
              )}
            </div>
          </div>

          {/* Campo: Cliente Importante */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <label className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                Cliente Importante
              </label>
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-3">
              {/* Botão Sim */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isImportant: true })}
                className={`h-10 sm:h-11 px-5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer select-none ${
                  formData.isImportant
                    ? 'border-[#0057ff] bg-blue-50/80 text-[#0057ff] shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${
                    formData.isImportant
                      ? 'fill-[#0057ff] text-[#0057ff]'
                      : 'fill-none text-[#0057ff]'
                  }`}
                />
                <span>Sim</span>
              </button>

              {/* Botão Não */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isImportant: false })}
                className={`h-10 sm:h-11 px-5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer select-none ${
                  !formData.isImportant
                    ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <Star className="w-4 h-4 fill-none text-[#0057ff]" />
                <span>Não</span>
              </button>
            </div>
          </div>

          {/* Campo: Observações */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-2 tracking-tight">
              Observações
            </label>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 hover:border-slate-300 focus-within:border-[#0057ff] focus-within:ring-4 focus-within:ring-[#0057ff]/10 transition-all">
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0 stroke-[1.8]" />
                <textarea
                  rows={4}
                  maxLength={500}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Adicione observações sobre o cliente..."
                  className="w-full bg-transparent text-slate-800 text-sm placeholder:text-slate-400 outline-none resize-none font-medium leading-relaxed"
                />
              </div>
              <div className="text-right pt-2 text-xs text-slate-400">
                {(formData.notes || '').length}/500
              </div>
            </div>
          </div>

          {/* Bottom Actions: Cancelar & Salvar Cliente */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCancel}
              className="h-11 px-6 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="h-11 px-7 rounded-xl bg-[#0057ff] hover:bg-[#0047db] active:scale-[0.99] text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-md shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-80"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 stroke-[2.2]" />
                  <span>Salvar Cliente</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
