/**
 * Utilitários de formatação para data e moeda no padrão brasileiro (pt-BR / America/Sao_Paulo)
 */

export function formatBRL(val?: number | null): string {
  if (val === undefined || val === null || isNaN(Number(val))) return 'R$ 0,00';
  return Number(val).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumberBR(val?: number | null): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0';
  return Number(val).toLocaleString('pt-BR');
}

export function getBrazilToday(): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '4', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value || '10', 10);
    const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
    return { year, month, day };
  } catch {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
}
