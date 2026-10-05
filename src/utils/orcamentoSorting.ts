import type { SavedOrcamento } from '../types';

export interface OrcamentoBrazilCreationDate {
  year: number;
  month: number; // 1 a 12
  day: number; // 1 a 31
  dateStr: string; // DD/MM/YYYY
  timestamp: number;
}

/**
 * Retorna o dia de hoje no fuso horário oficial do Brasil (America/Sao_Paulo).
 */
export function getBrazilToday(): { year: number; month: number; day: number; dateStr: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return {
      year,
      month,
      day,
      dateStr: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    };
  } catch {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return {
      year,
      month,
      day,
      dateStr: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    };
  }
}

/**
 * Extrai a data de criação do orçamento respeitando rigorosamente o fuso horário do Brasil (America/Sao_Paulo - UTC-3).
 * REGRA ESTRITA:
 * - Usar exclusivamente a data de CRIAÇÃO registrada no Supabase / sistema.
 * - NUNCA usar data de edição, atualização, acesso, visualização ou alteração (updatedAt, dataAtualizacao, etc.).
 */
export function getOrcamentoCreationBrazilDate(orc: SavedOrcamento): OrcamentoBrazilCreationDate | null {
  if (!orc) return null;

  // 1. dataOrcamento ou dataCriacao expressa (DD/MM/YYYY ou YYYY-MM-DD)
  const candidateDateStr = (orc.dataOrcamento || (orc as any).dataCriacao || '').trim();
  if (candidateDateStr) {
    const clean = candidateDateStr.replace(/\s*(às\s*)?\d{1,2}:\d{2}(:\d{2})?.*$/i, '').trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          let ts = new Date(y, m - 1, d, 12, 0, 0).getTime();
          const rawCreated = (orc as any).createdAt || (orc as any).created_at;
          if (rawCreated) {
            const parsedCreated = new Date(rawCreated).getTime();
            if (!isNaN(parsedCreated) && parsedCreated > 0) {
              ts = parsedCreated;
            }
          }
          return {
            year: y,
            month: m,
            day: d,
            dateStr: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
            timestamp: ts,
          };
        }
      }
    } else if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          let ts = new Date(y, m - 1, d, 12, 0, 0).getTime();
          const rawCreated = (orc as any).createdAt || (orc as any).created_at;
          if (rawCreated) {
            const parsedCreated = new Date(rawCreated).getTime();
            if (!isNaN(parsedCreated) && parsedCreated > 0) {
              ts = parsedCreated;
            }
          }
          return {
            year: y,
            month: m,
            day: d,
            dateStr: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
            timestamp: ts,
          };
        }
      }
    }
  }

  // 2. createdAt / created_at registrado no Supabase (avaliado no fuso horário do Brasil)
  const rawCreatedAt = (orc as any).createdAt || (orc as any).created_at;
  if (rawCreatedAt) {
    const d = new Date(rawCreatedAt);
    if (!isNaN(d.getTime())) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .format(d)
          .split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          return {
            year: y,
            month: m,
            day,
            dateStr: `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
            timestamp: d.getTime(),
          };
        }
      } catch {}
    }
  }

  // 3. savedAt (quando o orçamento foi persistido pela primeira vez, caso createdAt inexista)
  if (orc.savedAt) {
    const d = new Date(orc.savedAt);
    if (!isNaN(d.getTime())) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .format(d)
          .split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          return {
            year: y,
            month: m,
            day,
            dateStr: `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
            timestamp: d.getTime(),
          };
        }
      } catch {}
    }
  }

  // 4. Timestamp milissegundo embutido no id (ex: orc_1727740800000)
  if (orc.id) {
    const m = String(orc.id).match(/(\d{12,14})/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > 1500000000000 && num < 2500000000000) {
        const d = new Date(num);
        try {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
            .format(d)
            .split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            return {
              year: y,
              month,
              day,
              dateStr: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${y}`,
              timestamp: num,
            };
          }
        } catch {}
      }
    }
  }

  // NUNCA usar updatedAt como data de criação!
  return null;
}

/**
 * Retorna o timestamp de milissegundos preciso da DATA DE CRIAÇÃO de um orçamento.
 * REGRA ESTRITA: NUNCA usar updatedAt.
 */
export function getOrcamentoCreationTimestamp(orc: SavedOrcamento): number {
  if (!orc) return 0;
  const parsed = getOrcamentoCreationBrazilDate(orc);
  if (parsed) {
    return parsed.timestamp;
  }
  return 0;
}

/**
 * Ordena orçamentos do mais recente para o mais antigo com base na DATA DE CRIAÇÃO.
 * Desempata por ID de forma estável.
 */
export function compareOrcamentosByCreationDateDesc(a: SavedOrcamento, b: SavedOrcamento): number {
  const timeA = getOrcamentoCreationTimestamp(a);
  const timeB = getOrcamentoCreationTimestamp(b);

  if (timeB !== timeA) {
    return timeB - timeA;
  }

  const idA = String(a.id || '');
  const idB = String(b.id || '');
  return idB.localeCompare(idA);
}

/**
 * Formata a data de criação estritamente sem hora (apenas DD/MM/YYYY), no fuso horário do Brasil.
 */
export function formatOrcamentoCreationDate(dateVal?: string): string {
  if (!dateVal || !dateVal.trim()) {
    const today = getBrazilToday();
    return today.dateStr;
  }
  let str = dateVal.trim();
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .format(d)
          .split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      } catch {}
    }
    str = str.split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  str = str.replace(/\s*(às\s*)?\d{1,2}:\d{2}(:\d{2})?.*$/i, '').trim();
  return str || dateVal;
}
