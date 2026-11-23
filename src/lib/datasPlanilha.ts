import type { Period } from '../data/periodos';

// Datas de hotelaria vindas da aba "Datas" da planilha de leads, editada pelo
// dono do hotel. Servidas pelo doGet do Apps Script (docs/apps-script-planilha.gs)
// na mesma URL que recebe os leads, com ?acao=datas.
//
// Devolve null em qualquer falha (rede, timeout, aba ausente, resposta
// estranha) para quem chama cair nas datas fixas de src/data/periodos.ts.
// Lista vazia NÃO é falha: significa que o dono tirou todas as datas.

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function periodoValido(p: unknown): p is Period {
  if (!p || typeof p !== 'object') return false;
  const x = p as Record<string, unknown>;
  return (
    typeof x.periodo_id === 'string' &&
    typeof x.nome === 'string' &&
    typeof x.data_entrada === 'string' && DATA_ISO.test(x.data_entrada) &&
    typeof x.data_saida === 'string' && DATA_ISO.test(x.data_saida) &&
    typeof x.num_diarias === 'number'
  );
}

export async function carregarDatasDaPlanilha(
  webhookUrl: string,
  timeoutMs = 6000, // Apps Script costuma responder em 1–3s; acima disso, datas fixas
): Promise<Period[] | null> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);

  try {
    const url = new URL(webhookUrl);
    url.searchParams.set('acao', 'datas');

    const res = await fetch(url.toString(), { signal: controle.signal });
    if (!res.ok) return null;

    const corpo = await res.json();
    if (!corpo?.ok || !Array.isArray(corpo.periodos)) return null;

    return corpo.periodos.filter(periodoValido);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Data de hoje no fuso do navegador, em AAAA-MM-DD. */
export function hojeIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
