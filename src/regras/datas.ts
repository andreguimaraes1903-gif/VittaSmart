import type { DataCivil } from '../tipos';

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function partes(data: DataCivil): [number, number, number] | null {
  const m = RE_DATA.exec(data);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function montar(ano: number, mes: number, dia: number): DataCivil {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Data civil de hoje no fuso do computador. */
export function hojeCivil(agora: Date = new Date()): DataCivil {
  return montar(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
}

function emDiasUtc(data: DataCivil): number {
  const p = partes(data);
  if (!p) return NaN;
  return Date.UTC(p[0], p[1] - 1, p[2]) / 86_400_000;
}

/** Quantos dias de `de` até `ate` (negativo se `ate` já passou). */
export function diasEntre(de: DataCivil, ate: DataCivil): number {
  return Math.round(emDiasUtc(ate) - emDiasUtc(de));
}

export function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/** Converte "dd/mm/aaaa", "aaaa-mm-dd" ou ISO com hora para data civil. */
export function paraDataCivil(valor: unknown): DataCivil | null {
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) return validar(montar(Number(br[3]), Number(br[2]), Number(br[1])));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return validar(montar(Number(iso[1]), Number(iso[2]), Number(iso[3])));
  return null;
}

function validar(data: DataCivil): DataCivil | null {
  const p = partes(data);
  if (!p) return null;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2] ? data : null;
}

export function formatarData(data: DataCivil): string {
  const p = partes(data);
  return p ? `${String(p[2]).padStart(2, '0')}/${String(p[1]).padStart(2, '0')}` : data;
}

export function descreverPrazo(diasAte: number): string {
  if (diasAte === 0) return 'hoje';
  if (diasAte === 1) return 'amanhã';
  if (diasAte > 1) return `em ${diasAte} dias`;
  if (diasAte === -1) return 'atrasada há 1 dia';
  return `atrasada há ${-diasAte} dias`;
}
