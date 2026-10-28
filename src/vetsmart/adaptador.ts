import type { DadosSincronizados } from '../tipos';
import { pedir } from '../mensagens';
import { hojeCivil } from '../regras/datas';
import { POR_PAGINA, type OpcoesConsulta } from './consulta';
import { interpretarPaciente, interpretarTutor, interpretarVacinas, type ObjetoParse } from './parse';
import { ORIGEM_PEDIR_SESSAO, ORIGEM_SESSAO, type SessaoParse } from './sessao';

export type Progresso = (etapa: string, feitos: number, total?: number) => void;

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

/** Estado da sessão capturada, sem credenciais (para o relatório de erros). */
export function estadoSessao(): Record<string, unknown> {
  return {
    sessaoCapturada: !!sessaoAtual,
    servidor: sessaoAtual?.servidor,
    temClinica: !!sessaoAtual?.clinicId,
    clinicClasse: sessaoAtual?.clinicClasse,
    temInstallationId: !!sessaoAtual?.installationId,
    clientVersion: sessaoAtual?.clientVersion,
  };
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

/** A consulta em si roda no background (ver consulta.ts). */
async function consultar(s: SessaoParse, classe: string, where: Record<string, unknown>, op: OpcoesConsulta): Promise<ObjetoParse[]> {
  return pedir({ tipo: 'consultarParse', sessao: s, classe, where, op });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ehTempoEsgotado = (e: unknown) => e instanceof Error && /HTTP 50[234]|conectar ao servidor/.test(e.message);

/**
 * Uma página com nova tentativa: em 502/503/504 ou falha de rede espera e
 * tenta de novo com a metade do tamanho (mínimo 50), até 3 vezes.
 */
async function consultarComRetentativa(
  s: SessaoParse,
  classe: string,
  where: Record<string, unknown>,
  op: OpcoesConsulta,
  aoReduzir: (limit: number) => void,
): Promise<ObjetoParse[]> {
  let limit = op.limit ?? POR_PAGINA;
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await consultar(s, classe, where, { ...op, limit });
    } catch (e) {
      if (tentativa >= 3 || !ehTempoEsgotado(e)) throw e;
      limit = Math.max(50, Math.floor(limit / 2));
      aoReduzir(limit);
      await espera(2000 * (tentativa + 1));
    }
  }
}

function registrarInfo(contexto: string, mensagem: string, detalhes: Record<string, unknown>) {
  void pedir({ tipo: 'registrarErro', erro: { nivel: 'info', contexto, mensagem, detalhes } }).catch(() => undefined);
}

/** Filtros candidatos, do mais específico (igual ao VetSmart) ao mais aberto. */
function variantesDeFiltro(s: SessaoParse, extra: Record<string, unknown>): { nome: string; where: Record<string, unknown> }[] {
  const v: { nome: string; where: Record<string, unknown> }[] = [];
  if (s.clinicId && s.clinicClasse) {
    v.push({ nome: 'clínica (ponteiro)', where: { isDeleted: false, clinic: { __type: 'Pointer', className: s.clinicClasse, objectId: s.clinicId }, ...extra } });
  }
  if (s.clinicId) v.push({ nome: 'clínica (clinicId)', where: { isDeleted: false, clinicId: s.clinicId, ...extra } });
  v.push({ nome: 'sem clínica', where: { isDeleted: false, ...extra } });
  v.push({ nome: 'sem filtros', where: { ...extra } });
  return v;
}

/**
 * Testa as variantes com 1 registro e fica com a primeira que trouxer algo
 * (o resultado de cada teste vai para o relatório).
 */
async function escolherFiltro(s: SessaoParse, classe: string, extra: Record<string, unknown>, op: OpcoesConsulta): Promise<Record<string, unknown>> {
  const testes: { variante: string; encontrou: number | string }[] = [];
  const variantes = variantesDeFiltro(s, extra);
  for (const v of variantes) {
    try {
      const amostra = await consultarComRetentativa(s, classe, v.where, { ...op, keys: 'objectId', limit: 1, skip: 0 }, () => undefined);
      testes.push({ variante: v.nome, encontrou: amostra.length });
      if (amostra.length) {
        registrarInfo(`Sincronização: ${classe}`, `Usando o filtro "${v.nome}".`, { testes });
        return v.where;
      }
    } catch (e) {
      testes.push({ variante: v.nome, encontrou: `erro: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  registrarInfo(`Sincronização: ${classe}`, 'Nenhum registro encontrado em nenhum filtro.', { testes, ...estadoSessao() });
  return variantes[0]!.where;
}

/** Percorre a classe inteira em ordem de objectId (paginação por chave, sem limite de skip). */
async function listarTudo(
  s: SessaoParse,
  classe: string,
  rotulo: string,
  progresso: Progresso,
  op: OpcoesConsulta = {},
): Promise<ObjetoParse[]> {
  progresso(`${rotulo}: verificando`, 0);
  const filtro = await escolherFiltro(s, classe, {}, op);
  const todos: ObjetoParse[] = [];
  let ultimo: string | null = null;
  let limit = op.limit ?? POR_PAGINA;
  for (;;) {
    const where: Record<string, unknown> = ultimo ? { ...filtro, objectId: { $gt: ultimo } } : filtro;
    const pagina = await consultarComRetentativa(s, classe, where, { ...op, limit }, (l) => (limit = l));
    todos.push(...pagina);
    progresso(rotulo, todos.length);
    if (pagina.length < limit) return todos;
    ultimo = pagina[pagina.length - 1]!.objectId;
    await espera(PAUSA_MS);
  }
}

/**
 * Só as doses com data a partir de ontem (as que podem virar lembrete),
 * em ordem de data como o próprio VetSmart consulta. Muito mais leve que a
 * classe inteira, que estourava o tempo do servidor (HTTP 504).
 */
async function listarVacinasFuturas(s: SessaoParse, progresso: Progresso): Promise<ObjetoParse[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - 1);
  desde.setHours(0, 0, 0, 0);
  const op: OpcoesConsulta = {
    keys: 'patient,patientId,vaccine,vaccineType,documentDate,parentVaccine,ignoreReminder,isDeleted',
    order: 'documentDate,objectId',
  };
  progresso('Vacinas: verificando', 0);
  const where = await escolherFiltro(s, 'Vaccine', { documentDate: { $gte: { __type: 'Date', iso: desde.toISOString() } } }, op);
  const todos: ObjetoParse[] = [];
  let limit = 200;
  for (;;) {
    const pagina = await consultarComRetentativa(s, 'Vaccine', where, { ...op, limit, skip: todos.length }, (l) => (limit = l));
    todos.push(...pagina);
    progresso('Vacinas', todos.length);
    if (pagina.length < limit) return todos;
    await espera(PAUSA_MS);
  }
}

/**
 * Baixa tutores, pacientes e vacinas do VetSmart usando a sessão da página.
 * Roda no content script de prontuario.vetsmart.com.br.
 */
export async function sincronizarVetSmart(progresso: Progresso): Promise<DadosSincronizados> {
  const s = await obterSessao();
  const brutosTutores = await listarTudo(s, 'Owner', 'Tutores', progresso, { keys: 'name,phone,isDeleted' });
  const brutosPacientes = await listarTudo(s, 'Patient', 'Pacientes', progresso, {
    keys: 'name,specie,birthdate,birthday,owner,ownerId,deceased,isDeleted',
  });
  const brutosVacinas = await listarVacinasFuturas(s, progresso);
  const tutores = brutosTutores.flatMap((o) => interpretarTutor(o) ?? []);
  const pacientes = brutosPacientes.flatMap((o) => interpretarPaciente(o) ?? []);
  const vacinas = interpretarVacinas(brutosVacinas, hojeCivil());
  registrarInfo('Sincronização concluída', `${pacientes.length} pacientes, ${tutores.length} tutores, ${vacinas.length} próximas doses.`, {
    recebidos: { tutores: brutosTutores.length, pacientes: brutosPacientes.length, vacinas: brutosVacinas.length },
    aproveitados: { tutores: tutores.length, pacientes: pacientes.length, vacinas: vacinas.length },
    pacientesComNascimento: pacientes.filter((p) => p.nascimento).length,
    tutoresComTelefone: tutores.filter((t) => t.telefone).length,
  });
  return { tutores, pacientes, vacinas };
}
