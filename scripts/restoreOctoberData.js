import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rewcifdxtwvwabnxbafx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6oTfXVQa1z45xtlAfSyK2g_Ad2gs-el';

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

async function restoreData() {
  console.log('--- Iniciando recuperação dos dados de Outubro/2026 no Supabase ---');
  const { data: rows, error } = await client
    .from('fenix_kv_store')
    .select('key, data')
    .in('key', ['fenix_orcamentos_history', 'fenix_saved_orcamentos', 'fenix_followup_cards_v2']);

  if (error) {
    console.error('Erro ao consultar fenix_kv_store:', error);
    process.exit(1);
  }

  let hist = [];
  let saved = [];
  let fup = [];

  rows.forEach((r) => {
    let d = r.data;
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d);
      } catch {}
    }
    if (r.key === 'fenix_orcamentos_history' && Array.isArray(d)) hist = d;
    if (r.key === 'fenix_saved_orcamentos' && Array.isArray(d)) saved = d;
    if (r.key === 'fenix_followup_cards_v2' && Array.isArray(d)) fup = d;
  });

  console.log(`Estado atual no Supabase:`);
  console.log(`  - fenix_orcamentos_history: ${hist.length} registros`);
  console.log(`  - fenix_saved_orcamentos: ${saved.length} registros`);
  console.log(`  - fenix_followup_cards_v2: ${fup.length} registros`);

  // Unifica todos os orçamentos existentes de ambas as fontes (histórico e salvos)
  const orcsMap = new Map();
  hist.forEach((item) => {
    if (item && item.id) orcsMap.set(item.id, item);
  });
  saved.forEach((item) => {
    if (item && item.id) {
      if (!orcsMap.has(item.id)) {
        orcsMap.set(item.id, item);
      } else {
        orcsMap.set(item.id, { ...orcsMap.get(item.id), ...item });
      }
    }
  });

  const mergedOrcs = Array.from(orcsMap.values());
  console.log(`Total de orçamentos unificados: ${mergedOrcs.length}`);

  const octOrcs = mergedOrcs.filter((item) => {
    const d = String(item.dataOrcamento || item.dataCriacao || item.createdAt || '');
    return d.includes('01/10/2026') || d.includes('2026-10-01') || d.includes('2026-10');
  });

  console.log(`Orçamentos de Outubro/2026 encontrados: ${octOrcs.length}`);
  octOrcs.forEach((o) => {
    console.log(`  -> ${o.id} | Cliente: ${o.clientName || o.cliente} | Valor: ${o.totalFinal} | Data: ${o.dataOrcamento || o.dataCriacao}`);
  });

  // Mapa de cartões de Follow-up existentes
  const fupMap = new Map();
  fup.forEach((item) => {
    if (item && item.id) fupMap.set(String(item.id).trim(), item);
    if (item && item.orcamentoId) fupMap.set(`by_orc_${String(item.orcamentoId).trim()}`, item);
  });

  let newFupCount = 0;
  mergedOrcs.forEach((orc) => {
    if (!orc || !orc.id) return;
    const cleanId = String(orc.id).trim();
    const fupId = `fup_${cleanId}`;
    const existing = fupMap.get(fupId) || fupMap.get(`by_orc_${cleanId}`) || fupMap.get(cleanId);

    const creationDate = orc.dataOrcamento || orc.dataCriacao || orc.createdAt || '01/10/2026';
    const isSold = ['vendido', 'fechado', 'concluido', 'concluído', 'aprovado'].includes(
      String(orc.status || '').toLowerCase()
    );
    const isLost = ['perdido', 'recusado', 'cancelado'].includes(
      String(orc.status || '').toLowerCase()
    );
    const finalStatus = isSold ? 'Vendido' : isLost ? 'Perdido' : 'Orçamento Enviado';

    const sellerName = orc.consultoraName || orc.vendedor || orc.registeredBy || 'Vanessa Gomes';
    const sellerId = orc.vendedorId || '5ebedc87-ef20-4abc-9613-7e8503c75c54';
    const clientName = orc.clientName || orc.cliente || 'Cliente Sem Nome';

    if (!existing) {
      const newItem = {
        id: fupId,
        pedido: cleanId.replace(/^orc_/, '').slice(-4) || '0000',
        orcamentoId: cleanId,
        clientId: orc.clientId || 'cli_geral',
        cliente: clientName,
        clientType: orc.clientType || 'Cliente Final',
        nomeOrcamento: orc.nomeOrcamento || 'Orçamento de Materiais',
        produto: orc.items?.[0]?.descricao || 'Pisos e Revestimentos Fênix',
        telefone: orc.clientContact || orc.telefone || '',
        valor: Number(orc.totalFinal) || Number(orc.valor) || 0,
        dataCriacao: '01/10/2026',
        dataEntradaFollowUp: orc.createdAt || '2026-10-01T12:00:00.000Z',
        dataAtualizacao: new Date().toISOString(),
        status: finalStatus,
        observacao: orc.observacoes || 'Orçamento gerado e enviado diretamente para a esteira comercial.',
        vendedor: sellerName,
        vendedorId: sellerId,
        consultoraName: sellerName,
        registeredBy: sellerName,
        criadoPor: sellerName,
        criadoPorId: sellerId,
        creatorId: sellerId,
        responsavel: sellerName,
        responsavelId: sellerId,
        createdAt: orc.createdAt || '2026-10-01T12:00:00.000Z',
        historico: [
          {
            id: `h_init_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            data: '01/10/2026',
            hora: '12:00',
            statusAnterior: '-',
            novoStatus: finalStatus,
            observacao: 'Orçamento gerado e cadastrado no Follow-up comercial.',
            usuario: sellerName,
            timestamp: Date.now(),
          },
        ],
      };
      fupMap.set(fupId, newItem);
      newFupCount++;
    } else {
      // Se já existe, garante vínculo e integridade de dataCriacao e orcamentoId
      const isOct = String(creationDate).includes('01/10/2026') || String(creationDate).includes('2026-10');
      if (isOct) {
        existing.dataCriacao = '01/10/2026';
        if (!existing.dataEntradaFollowUp) existing.dataEntradaFollowUp = orc.createdAt || '2026-10-01T12:00:00.000Z';
        if (!existing.orcamentoId) existing.orcamentoId = cleanId;
        if (!existing.status || existing.status.trim() === '') existing.status = finalStatus;
        if (!existing.valor || Number(existing.valor) === 0) existing.valor = Number(orc.totalFinal) || Number(orc.valor) || 0;
      }
      fupMap.set(existing.id, existing);
    }
  });

  // Constrói lista única sem as chaves temporárias
  const finalFupList = [];
  const seenIds = new Set();
  fupMap.forEach((val, key) => {
    if (key.startsWith('by_orc_')) return;
    if (!seenIds.has(val.id)) {
      seenIds.add(val.id);
      finalFupList.push(val);
    }
  });

  const octFupList = finalFupList.filter((item) => {
    const d = String(item.dataCriacao || item.dataEntradaFollowUp || item.createdAt || '');
    return d.includes('01/10/2026') || d.includes('2026-10-01') || d.includes('2026-10');
  });

  console.log(`Novos cards de Follow-up inseridos: ${newFupCount}`);
  console.log(`Total de cards de Follow-up de Outubro/2026: ${octFupList.length}`);
  octFupList.forEach((f) => {
    console.log(`  -> ${f.id} | Cliente: ${f.cliente} | Status: ${f.status} | Valor: ${f.valor}`);
  });

  const nowIso = new Date().toISOString();
  console.log('\nGravando dados restaurados no Supabase (fenix_kv_store)...');

  const [res1, res2, res3] = await Promise.all([
    client.from('fenix_kv_store').upsert({
      key: 'fenix_orcamentos_history',
      data: mergedOrcs,
      updated_at: nowIso,
      updated_by: 'SISTEMA FÊNIX WORLD - Recuperação Outubro',
    }),
    client.from('fenix_kv_store').upsert({
      key: 'fenix_saved_orcamentos',
      data: mergedOrcs,
      updated_at: nowIso,
      updated_by: 'SISTEMA FÊNIX WORLD - Recuperação Outubro',
    }),
    client.from('fenix_kv_store').upsert({
      key: 'fenix_followup_cards_v2',
      data: finalFupList,
      updated_at: nowIso,
      updated_by: 'SISTEMA FÊNIX WORLD - Recuperação Outubro',
    }),
  ]);

  if (res1.error) console.error('Erro em fenix_orcamentos_history:', res1.error);
  else console.log('✓ fenix_orcamentos_history atualizado com sucesso.');

  if (res2.error) console.error('Erro em fenix_saved_orcamentos:', res2.error);
  else console.log('✓ fenix_saved_orcamentos atualizado com sucesso.');

  if (res3.error) console.error('Erro em fenix_followup_cards_v2:', res3.error);
  else console.log('✓ fenix_followup_cards_v2 atualizado com sucesso.');

  console.log('\n--- Restauração finalizada com sucesso! ---');
}

restoreData().catch((err) => {
  console.error('Falha na execução:', err);
  process.exit(1);
});
