import { getStoredRendimentos } from './rendimentosService';
import { getDynamicProductCatalog, CatalogProduct } from '../data/productCatalog';
import { PISO_PRODUCTS } from './calculadoraEngine';

/**
 * Normaliza strings para comparação insensível a acentuação e caixa alta.
 */
function normalizeStr(val?: string): string {
  return (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Converte string ou número em valor numérico float de forma segura.
 * Suporta formatos brasileiros "4,74" e internacionais "4.74".
 */
export function parseBRLNumber(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = String(val)
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!clean) return 0;
  if (clean.includes(',') && clean.includes('.')) {
    // Ex: 1.250,50
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (clean.includes(',')) {
    return parseFloat(clean.replace(',', '.')) || 0;
  }
  return parseFloat(clean) || 0;
}

/**
 * Formata um número no padrão BRL com 2 casas decimais (ex: 57,00).
 */
export function formatBRLQty(val: number): string {
  if (isNaN(val) || val <= 0) return '0,00';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Identifica com precisão cirúrgica se o produto selecionado pertence à categoria PISO VINÍLICO.
 * Regra: NUNCA deve retornar true para colas, rodapés, mantas, primers, massas ou outros insumos.
 */
export function isPisoVinilicoProduct(
  productName?: string,
  categoryName?: string,
  categoryId?: string,
  productObj?: CatalogProduct | null
): boolean {
  const normCat = normalizeStr(categoryName);
  const normName = normalizeStr(productName);

  // Insumos que NÃO são pisos vinílicos, mesmo que contenham "vinílico" no nome ou na categoria
  if (
    normCat.includes('COLA') ||
    normCat.includes('RODAPE') ||
    normCat.includes('MANTA') ||
    normCat.includes('PRIMER') ||
    normCat.includes('PERFIL') ||
    normCat.includes('MASSA') ||
    normCat.includes('AUTONIVELANTE') ||
    normName.includes('COLA') ||
    normName.includes('RODAPE') ||
    normName.includes('PRIMER') ||
    normName.includes('PERFIL') ||
    normName.includes('MANTA') ||
    normName.includes('MASSA')
  ) {
    return false;
  }

  // ID oficial da categoria PISOS VINÍLICOS
  if (
    categoryId === '0368b74c-2647-4e35-aeee-a3a5667561fd' ||
    categoryId === 'cat_pisos_vinilicos'
  ) {
    return true;
  }

  // Nome da categoria
  if (
    normCat === 'PISOS VINILICOS' ||
    normCat === 'PISO VINILICO' ||
    normCat.startsWith('PISOS VINILICOS') ||
    normCat.startsWith('PISO VINILICO')
  ) {
    return true;
  }

  // Busca no catálogo oficial de produtos
  const catalog = getDynamicProductCatalog();
  const matchedProd =
    productObj ||
    catalog.find(
      (p) =>
        normalizeStr(p.name) === normName ||
        (normName.length > 5 && normalizeStr(p.name).includes(normName))
    );

  if (matchedProd) {
    const cNorm = normalizeStr(matchedProd.category);
    if (
      cNorm === 'PISOS VINILICOS' ||
      cNorm === 'PISO VINILICO' ||
      matchedProd.categoryId === '0368b74c-2647-4e35-aeee-a3a5667561fd'
    ) {
      return true;
    }
  }

  // Se a categoria for Geral/indefinida, mas o nome do produto é explicitamente um Piso Vinílico
  if (
    normName.startsWith('PISO VINILICO') ||
    normName.startsWith('PISOS VINILICOS') ||
    normName.includes('PISO VINILFORTE') ||
    normName.includes('PISO FLEXFLOOR') ||
    normName.includes('PISO VEXA') ||
    normName.includes('PISO AMBIENTA') ||
    normName.includes('PISO OSPEFLOOR')
  ) {
    return true;
  }

  return false;
}

/**
 * Busca o rendimento em m² por caixa cadastrado no produto.
 * 1. Consulta os rendimentos oficiais cadastrados no sistema (rendimentosService).
 * 2. Faz parse no nome ou subtítulo do produto (ex: "[cx 5,70m²]", "[cx 4,72m²]", "5,70 m²/cx").
 * 3. Consulta a lista pré-definida de pisos da calculadora.
 * 4. Retorna 0 caso não localize.
 */
export function getProductM2PerBox(productName: string, subtitle?: string): number {
  const cleanName = (productName || '').trim();
  const text = `${cleanName} ${subtitle || ''}`;

  // 1. Rendimentos oficiais cadastrados
  try {
    const rendimentos = getStoredRendimentos();
    if (rendimentos && rendimentos.length > 0) {
      const pNorm = normalizeStr(cleanName);
      const match = rendimentos.find((r) => {
        if (!r.produto) return false;
        const rNorm = normalizeStr(r.produto);
        return pNorm === rNorm || pNorm.includes(rNorm) || rNorm.includes(pNorm);
      });
      if (match && match.rendimento) {
        const val = parseBRLNumber(match.rendimento);
        if (val > 0) return val;
      }
    }
  } catch {}

  // 2. Extração via Regex no texto do produto / subtítulo
  // Exemplos reais do sistema:
  // "Piso FLEXFLOOR PREMIUM 2mm (capa 0,20mm) [cx 5,70m²] - NOVA LINHA" -> 5.70
  // "Piso Vinílico Flexfloor Premium 2mm (capa 0,20mm) [cx 4,72m²]" -> 4.72
  // "Piso Vinílico Ambienta Series 3mm [cx 3,58m²]" -> 3.58
  const matchBox =
    text.match(/\[\s*cx\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?\s*\]/i) ||
    text.match(/\(\s*cx\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?\s*\)/i) ||
    text.match(/\[\s*cx\s*([0-9]+(?:[.,][0-9]+)?)[^\]]*\]/i) ||
    text.match(/\(\s*cx\s*([0-9]+(?:[.,][0-9]+)?)[^)]*\)/i) ||
    text.match(/cx\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?/i) ||
    text.match(/([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?\s*(?:\/|\s*por\s*)\s*c(?:x|aixa)/i) ||
    text.match(/caixa[:\s]*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?/i) ||
    text.match(/([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?\s*\/caixa/i);

  if (matchBox) {
    const val = parseBRLNumber(matchBox[1]);
    if (val > 0) return val;
  }

  // 3. Fallback na base da calculadora
  try {
    const piso = PISO_PRODUCTS.find(
      (p) => normalizeStr(p.name) === normalizeStr(cleanName)
    );
    if (piso && piso.defaultM2PerBox > 0) {
      return piso.defaultM2PerBox;
    }
  } catch {}

  // Se o nome do produto ou detalhe tiver apenas 5,70 m² ou similar
  const genericM2Match = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*m[²2]/i);
  if (genericM2Match) {
    const val = parseBRLNumber(genericM2Match[1]);
    if (val > 0 && val < 20) {
      // Rendimento típico de caixa de piso vinílico fica entre 1 e 10 m²
      return val;
    }
  }

  // Fallback padrão se for Piso Vinílico reconhecido mas sem m²/cx especificado
  return 0;
}

/**
 * Detecta e extrai a quantidade de caixas no campo DETALHE.
 * Aceita: "10 CAIXAS", "10 CAIXA", "10 caixas", "10 caixa", "1 CAIXA", "1 CAIXAS", etc.
 * Retorna o número de caixas ou null se não contiver quantidade de caixas.
 */
export function parseBoxesFromDetail(detailText: string): number | null {
  if (!detailText || !detailText.trim()) return null;
  const match = detailText.match(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*caixas?\b/i);
  if (match) {
    const num = parseBRLNumber(match[1]);
    if (num > 0) return num;
  }
  return null;
}

/**
 * Atualiza o texto do detalhe com a nova quantidade de caixas,
 * mantendo eventuais outras informações preenchidas pelo usuário (ex: cor, acabamento, lote).
 */
export function formatBoxesInDetail(boxes: number, existingDetail?: string): string {
  const boxText = `${boxes} ${boxes === 1 ? 'CAIXA' : 'CAIXAS'}`;
  const clean = (existingDetail || '').trim();

  if (!clean) {
    return boxText;
  }

  // Se já contém menção a caixas, substitui apenas a parte das caixas
  const boxPattern = /(?:^|[^\d.,])\d+(?:[.,]\d+)?\s*caixas?\b/i;
  if (boxPattern.test(clean)) {
    // Substitui a menção de caixas existente
    return clean.replace(
      /(\d+(?:[.,]\d+)?\s*caixas?)/i,
      boxText
    );
  }

  // Se contém apenas outras informações (ex: "Cor Carvalho"), anexa com hífen
  return `${clean} - ${boxText}`;
}

/**
 * Converte CAIXAS em M² (sentido Detalhe -> Quantidade):
 * Exemplo: 10 CAIXAS com rendimento 5,70 m²/caixa -> 57,00 m².
 */
export function calculateM2FromBoxes(
  boxes: number,
  m2PerBox: number
): { m2Total: number; m2Formatted: string } {
  const m2Total = Math.round(boxes * m2PerBox * 100) / 100;
  return {
    m2Total,
    m2Formatted: formatBRLQty(m2Total),
  };
}

/**
 * Converte M² em CAIXAS (sentido Quantidade -> Detalhe):
 * Sempre arredondando para caixa inteira com Math.ceil!
 * Recalcula a metragem final comprada baseada no número de caixas inteiras.
 * Exemplo: 4,74 m² com rendimento 5,70 m²/caixa:
 * 4,74 ÷ 5,70 = 0,8315... -> Math.ceil = 1 CAIXA
 * Quantidade final = 1 × 5,70 = 5,70 m²
 * Detalhe = 1 CAIXA
 */
export function calculateBoxesFromM2(
  informedM2: number,
  m2PerBox: number,
  existingDetail?: string
): {
  boxes: number;
  finalM2: number;
  finalM2Formatted: string;
  boxText: string;
  updatedDetail: string;
} {
  if (m2PerBox <= 0 || informedM2 <= 0) {
    return {
      boxes: 0,
      finalM2: informedM2,
      finalM2Formatted: formatBRLQty(informedM2),
      boxText: '',
      updatedDetail: existingDetail || '',
    };
  }

  const boxes = Math.ceil(informedM2 / m2PerBox);
  const finalM2 = Math.round(boxes * m2PerBox * 100) / 100;
  const boxText = `${boxes} ${boxes === 1 ? 'CAIXA' : 'CAIXAS'}`;
  const updatedDetail = formatBoxesInDetail(boxes, existingDetail);

  return {
    boxes,
    finalM2,
    finalM2Formatted: formatBRLQty(finalM2),
    boxText,
    updatedDetail,
  };
}

// ============================================================================
// REGRAS OFICIAIS — TETO VINÍLICO (1,19 m² POR RÉGUA)
// ============================================================================

/**
 * Identifica com precisão se o produto selecionado pertence à categoria TETO VINÍLICO.
 * Regra: NUNCA aplicar para perfis, cantoneiras, emendas, colas, rodapés ou outros materiais.
 */
export function isTetoVinilicoProduct(
  productName?: string,
  categoryName?: string,
  categoryId?: string,
  productObj?: CatalogProduct | null
): boolean {
  const normCat = normalizeStr(categoryName);
  const normName = normalizeStr(productName);

  // Insumos e perfis que NÃO são a régua principal de teto vinílico
  if (
    normName.includes('PERFIL') ||
    normName.includes('CANTONEIRA') ||
    normName.includes('EMENDA') ||
    normName.includes('ACABAMENTO') ||
    normName.includes('COLA') ||
    normName.includes('RODAPE') ||
    normCat.includes('COLA') ||
    normCat.includes('RODAPE') ||
    normCat.includes('PERFIL')
  ) {
    return false;
  }

  // 1. Categoria direta
  if (normCat.includes('TETO') || normCat.includes('FORRO')) {
    return true;
  }

  // 2. Nome do produto
  if (
    normName.includes('TETO VINILICO') ||
    normName.includes('TETO VINILFORTE') ||
    normName.includes('TETO PIX') ||
    normName.startsWith('TETO VINILICO') ||
    normName.startsWith('TETO VINILFORTE') ||
    (normName.startsWith('TETO') && !normName.includes('COLA'))
  ) {
    return true;
  }

  // 3. Busca no catálogo oficial de produtos
  const catalog = getDynamicProductCatalog();
  const matchedProd =
    productObj ||
    catalog.find(
      (p) =>
        normalizeStr(p.name) === normName ||
        (normName.length > 5 && normalizeStr(p.name).includes(normName))
    );

  if (matchedProd) {
    const cNorm = normalizeStr(matchedProd.category);
    if (cNorm.includes('TETO') || cNorm.includes('FORRO')) {
      return true;
    }
  }

  return false;
}

/**
 * Retorna o rendimento do Teto Vinílico em m² por régua.
 * Conforme cadastrado no sistema Fênix: 1,19 m² por régua.
 */
export function getTetoM2PerRegua(productName?: string, subtitle?: string): number {
  const cleanName = (productName || '').trim();
  const text = `${cleanName} ${subtitle || ''}`;

  // 1. Rendimentos cadastrados na base oficial
  try {
    const rendimentos = getStoredRendimentos();
    if (rendimentos && rendimentos.length > 0) {
      const pNorm = normalizeStr(cleanName);
      const match = rendimentos.find((r) => {
        if (!r.produto) return false;
        const rNorm = normalizeStr(r.produto);
        return (
          rNorm.includes('TETO') &&
          (pNorm === rNorm || pNorm.includes(rNorm) || rNorm.includes(pNorm))
        );
      });
      if (match && match.rendimento) {
        const val = parseBRLNumber(match.rendimento);
        if (val > 0) return val;
      }
    }
  } catch {}

  // 2. Extração via Regex no texto do produto / subtítulo se houver indicação explícita
  const matchRegua =
    text.match(/([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?\s*(?:\/|\s*por\s*)\s*r[eé]gua/i) ||
    text.match(/\[\s*r[eé]gua\s*([0-9]+(?:[.,][0-9]+)?)\s*m[²2]?\s*\]/i);

  if (matchRegua) {
    const val = parseBRLNumber(matchRegua[1]);
    if (val > 0) return val;
  }

  // 3. Rendimento oficial cadastrado: 1,19 m² por régua
  return 1.19;
}

/**
 * Detecta e extrai a quantidade de réguas no campo DETALHE.
 * Aceita: "10 RÉGUAS", "10 REGUAS", "10 RÉGUA", "10 REGUA", "10 réguas", "10 reguas", etc.
 */
export function parseReguasFromDetail(detailText: string): number | null {
  if (!detailText || !detailText.trim()) return null;
  const match = detailText.match(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*r[eé]guas?\b/i);
  if (match) {
    const num = parseBRLNumber(match[1]);
    if (num > 0) return num;
  }
  return null;
}

/**
 * Atualiza o texto do detalhe com a nova quantidade de réguas,
 * mantendo eventuais outras informações preenchidas (ex: acabamento, cor).
 */
export function formatReguasInDetail(reguas: number, existingDetail?: string): string {
  const reguaText = `${reguas} ${reguas === 1 ? 'RÉGUA' : 'RÉGUAS'}`;
  const clean = (existingDetail || '').trim();

  if (!clean) {
    return reguaText;
  }

  const reguaPattern = /(?:^|[^\d.,])\d+(?:[.,]\d+)?\s*r[eé]guas?\b/i;
  if (reguaPattern.test(clean)) {
    return clean.replace(
      /(\d+(?:[.,]\d+)?\s*r[eé]guas?)/i,
      reguaText
    );
  }

  return `${clean} - ${reguaText}`;
}

/**
 * Converte RÉGUAS em M² para Teto Vinílico (sentido Detalhe -> Quantidade):
 * Exemplo: 10 RÉGUAS × 1,19 = 11,90 m²
 * Resultado:
 * Quantidade: 11,90 m²
 * Detalhe: 10 RÉGUAS
 */
export function calculateM2FromReguas(
  reguas: number,
  m2PerRegua: number = 1.19
): { m2Total: number; m2Formatted: string } {
  const m2Total = Math.round(reguas * m2PerRegua * 100) / 100;
  return {
    m2Total,
    m2Formatted: formatBRLQty(m2Total),
  };
}

/**
 * Converte M² em RÉGUAS para Teto Vinílico (sentido Quantidade -> Detalhe):
 * Regra:
 * - 10,00 m² ÷ 1,19 = 8,40
 * - Arredondar para cima (Math.ceil) = 9 RÉGUAS
 * - Nunca permitir régua fracionada.
 * - Quantidade final = 9 × 1,19 = 10,71 m²
 * - Detalhe = 9 RÉGUAS
 */
export function calculateReguasFromM2(
  informedM2: number,
  m2PerRegua: number = 1.19,
  existingDetail?: string
): {
  reguas: number;
  finalM2: number;
  finalM2Formatted: string;
  reguasText: string;
  updatedDetail: string;
} {
  if (m2PerRegua <= 0 || informedM2 <= 0) {
    return {
      reguas: 0,
      finalM2: informedM2,
      finalM2Formatted: formatBRLQty(informedM2),
      reguasText: '',
      updatedDetail: existingDetail || '',
    };
  }

  const reguas = Math.ceil(informedM2 / m2PerRegua);
  const finalM2 = Math.round(reguas * m2PerRegua * 100) / 100;
  const reguasText = `${reguas} ${reguas === 1 ? 'RÉGUA' : 'RÉGUAS'}`;
  const updatedDetail = formatReguasInDetail(reguas, existingDetail);

  return {
    reguas,
    finalM2,
    finalM2Formatted: formatBRLQty(finalM2),
    reguasText,
    updatedDetail,
  };
}
