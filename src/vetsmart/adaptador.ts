import type { DadosSincronizados } from '../tipos';
import { hojeCivil } from '../regras/datas';
import { interpretarPaciente, interpretarTutor, interpretarVacinas, type ObjetoParse } from './parse';
import { ORIGEM_PEDIR_SESSAO, ORIGEM_SESSAO, type SessaoParse } from './sessao';

export type Progresso = (etapa: string, feitos: number, total?: number) => void;

const POR_PAGINA = 1000;
const PAUSA_MS = 250;

let sessaoAtual: SessaoParse | null = null;

/** Content script: guarda a sessão que o interceptor (world MAIN) vê nas chamadas da página. */
export function escutarSessao(): void {
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data as { origem?: string; sessao?: SessaoParse } | undefined;
    if (d?.origem === ORIGEM_SESSAO && d.sessao) {
      // Campos opcionais ausentes numa chamada não apagam o que já foi visto em outra.
      const definidos = Object.fromEntries(Object.entries(d.sessao).filter(([, v]) => v !== undefined));
      sessaoAtual = { ...sessaoAtual, ...definidos } as SessaoParse;
    }
  });
  window.postMessage({ origem: ORIGEM_PEDIR_SESSAO }, location.origin);
}

async function obterSessao(): Promise<SessaoParse> {
  if (!sessaoAtual) {
    window.postMessage({ origem: ORIGEM_PEDIR_SESSAO }, location.origin);
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!sessaoAtual) {
    throw new Error('Não encontrei a sessão do VetSmart. Navegue um pouco (abra a lista de tutores ou um paciente) e tente de novo.');
  }
  return sessaoAtual;
}

class ErroParse extends Error {}

interface Opcoes {
  keys?: string;
  include?: string;
}

async function consultar(s: SessaoParse, classe: string, where: Record<string, unknown>, op: Opcoes): Promise<ObjetoParse[]> {
  const corpo = {
    where,
    limit: POR_PAGINA,
    order: 'objectId',
    ...(op.keys ? { keys: op.keys } : {}),
    ...(op.include ? { include: op.include } : {}),
    _method: 'GET',
    _ApplicationId: s.appId,
    _ClientVersion: s.clientVersion,
    _InstallationId: s.installationId,
    _SessionToken: s.token,
  };
  const r = await fetch(`${s.servidor}/classes/${classe}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as { results?: ObjetoParse[]; code?: number; error?: string };
  if (!r.ok || !json.results) {
    if (json.code === 209) throw new ErroParse('Sessão do VetSmart expirada. Recarregue a página, entre de novo e sincronize.');
    throw new ErroParse(`VetSmart recusou a consulta de ${classe} (${r.status}${json.error ? `: ${json.error}` : ''}).`);
  }
  return json.results;
}

/** Percorre a classe inteira em ordem de objectId (paginação por chave, sem limite de skip). */
async function listarTudo(
  s: SessaoParse,
  classe: string,
  rotulo: string,
  progresso: Progresso,
  op: Opcoes = {},
): Promise<ObjetoParse[]> {
  const filtro: Record<string, unknown> = { isDeleted: false };
  if (s.clinicId) filtro.clinicId = s.clinicId;
  const todos: ObjetoParse[] = [];
  let ultimo: string | null = null;
  for (;;) {
    const where: Record<string, unknown> = ultimo ? { ...filtro, objectId: { $gt: ultimo } } : filtro;
    const pagina = await consultar(s, classe, where, op);
    todos.push(...pagina);
    progresso(rotulo, todos.length);
    if (pagina.length < POR_PAGINA) return todos;
    ultimo = pagina[pagina.length - 1]!.objectId;
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
}

/**
 * Baixa tutores, pacientes e vacinas do VetSmart usando a sessão da página.
 * Roda no content script de prontuario.vetsmart.com.br.
 */
export async function sincronizarVetSmart(progresso: Progresso): Promise<DadosSincronizados> {
  const s = await obterSessao();
  const tutores = (await listarTudo(s, 'Owner', 'Tutores', progresso, { keys: 'name,phone,isDeleted' })).flatMap(
    (o) => interpretarTutor(o) ?? [],
  );
  const pacientes = (
    await listarTudo(s, 'Patient', 'Pacientes', progresso, { keys: 'name,specie,birthdate,birthday,owner,ownerId,deceased,isDeleted' })
  ).flatMap((o) => interpretarPaciente(o) ?? []);
  const vacinas = interpretarVacinas(
    await listarTudo(s, 'Vaccine', 'Vacinas', progresso, {
      keys: 'patient,patientId,vaccine,vaccineType,documentDate,parentVaccine,ignoreReminder,isDeleted',
    }),
    hojeCivil(),
  );
  return { tutores, pacientes, vacinas };
}
