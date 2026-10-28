/** Credenciais que o próprio VetSmart usa nas chamadas ao Parse (capturadas da página; ficam só em memória). */
export interface SessaoParse {
  servidor: string; // ex.: https://parse.vetsmart.com.br/parse
  appId: string;
  token: string;
  installationId?: string;
  clientVersion?: string;
  clinicId?: string;
  /** className do ponteiro da clínica usado pelo VetSmart (ex.: "Clinic"). */
  clinicClasse?: string;
  /** Valor de `include` que o VetSmart usa ao listar vacinas (ex.: "vaccine"). */
  incluirVacina?: string;
}

export const ORIGEM_SESSAO = 'vittasmart-sessao';
export const ORIGEM_PEDIR_SESSAO = 'vittasmart-pedir-sessao';

/** Extrai a sessão do corpo de uma chamada do SDK do Parse. */
export function sessaoDoCorpo(url: string, corpo: unknown): SessaoParse | null {
  if (typeof corpo !== 'string' || !corpo.includes('_SessionToken')) return null;
  const m = /^(https:\/\/[^/]*vetsmart\.com\.br\/[^/]+)\/(classes|functions)\//.exec(url);
  if (!m) return null;
  try {
    const j = JSON.parse(corpo) as Record<string, unknown>;
    if (typeof j._ApplicationId !== 'string' || typeof j._SessionToken !== 'string') return null;
    const where = j.where as { clinic?: { objectId?: unknown; className?: unknown }; clinicId?: unknown } | undefined;
    const clinica = where?.clinic?.objectId ?? where?.clinicId ?? j.clinicId;
    return {
      servidor: m[1]!,
      appId: j._ApplicationId,
      token: j._SessionToken,
      installationId: typeof j._InstallationId === 'string' ? j._InstallationId : undefined,
      clientVersion: typeof j._ClientVersion === 'string' ? j._ClientVersion : undefined,
      clinicId: typeof clinica === 'string' ? clinica : undefined,
      clinicClasse: typeof where?.clinic?.className === 'string' ? where.clinic.className : undefined,
      incluirVacina: url.endsWith('/classes/Vaccine') && typeof j.include === 'string' ? j.include : undefined,
    };
  } catch {
    return null;
  }
}
