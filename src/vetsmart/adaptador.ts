import type { DadosSincronizados } from '../tipos';
import { pedir } from '../mensagens';
import { hojeCivil } from '../regras/datas';
import { POR_PAGINA, type OpcoesConsulta, type PedidoConsulta, type RespostaConsulta } from './consulta';
import { interpretarPaciente, interpretarTutor, interpretarVacinas, type ObjetoParse } from './parse';
import { ORIGEM_CONSULTA, ORIGEM_PEDIR_SESSAO, ORIGEM_RESPOSTA, ORIGEM_SESSAO, type ResumoSessao } from './sessao';

export type Progresso = (etapa: string, feitos: number, total?: number) => void;

const PAUSA_MS = 250;
const TEMPO_MAXIMO_MS = 90_000;
/** Maior atraso aceito nas Opções (Vacinas atrasadas). */
export const ATRASO_MAXIMO_DIAS = 365;

let sessaoAtual: ResumoSessao | null = null;
const pendentes = new Map<string, (r: RespostaConsulta) => void>();

/**
 * Content script: guarda o resumo da sessão que o interceptor (world MAIN) vê
 * nas chamadas da página e recebe as respostas das consultas pedidas a ele.
 */
export function escutarSessao(): void {
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data as { origem?: string; sessao?: ResumoSessao; id?: string } | undefined;
    if (d?.origem === ORIGEM_SESSAO && d.sessao) {
      // Campos opcionais ausentes numa chamada não apagam o que já foi visto em outra.
      const definidos = Object.fromEntries(Object.entries(d.sessao).filter(([, v]) => v !== undefined));
      sessaoAtual = { ...sessaoAtual, ...definidos } as ResumoSessao;
    } else if (d?.origem === ORIGEM_RESPOSTA && d.id) {
      pendentes.get(d.id)?.(d as RespostaConsulta);
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
    temInstallationId: sessaoAtual?.temInstallationId,
    clientVersion: sessaoAtual?.clientVersion,
  };
}

async function obterSessao(): Promise<ResumoSessao> {
  if (!sessaoAtual) {
    window.postMessage({ origem: ORIGEM_PEDIR_SESSAO }, location.origin);
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!sessaoAtual?.clinicId) {
    throw new Error('Não encontrei a sessão do VetSmart. Navegue um pouco (abra a lista de tutores ou um paciente) e tente de novo.');
  }
  return sessaoAtual;
}

/**
 * A consulta em si roda no interceptor (world MAIN), com a sessão da página;
 * aqui só pedimos e esperamos a resposta. Erros técnicos vão para o relatório.
 */
function consultar(classe: string, where: Record<string, unknown>, op: OpcoesConsulta): Promise<ObjetoParse[]> {
  const id = crypto.randomUUID();
  return new Promise<ObjetoParse[]>((resolver, rejeitar) => {
    const limite = setTimeout(() => {
      pendentes.delete(id);
      rejeitar(new Error('O VetSmart não respondeu a tempo. Recarregue a página (F5) e tente de novo.'));
    }, TEMPO_MAXIMO_MS);
    pendentes.set(id, (r) => {
      clearTimeout(limite);
      pendentes.delete(id);
      if (r.ok) {
        resolver(r.resultados);
        return;
      }
      if (r.tecnica) {
        void pedir({ tipo: 'registrarErro', erro: { contexto: `Sincronização: ${classe}`, mensagem: r.mensagem, tecnica: r.tecnica, detalhes: r.detalhes } }).catch(
          () => undefined,
        );
      }
      rejeitar(new Error(r.mensagem));
    });
    const pedido: PedidoConsulta = { origem: ORIGEM_CONSULTA, id, classe, where, op };
    window.postMessage(pedido, location.origin);
  });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ehTempoEsgotado = (e: unknown) => e instanceof Error && /HTTP 50[234]|conectar ao servidor/.test(e.message);

/**
 * Uma página com nova tentativa: em 502/503/504 ou falha de rede espera e
 * tenta de novo com a metade do tamanho (mínimo 50), até 3 vezes.
 */
async function consultarComRetentativa(
  classe: string,
  where: Record<string, unknown>,
  op: OpcoesConsulta,
  aoReduzir: (limit: number) => void,
): Promise<ObjetoParse[]> {
  let limit = op.limit ?? POR_PAGINA;
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await consultar(classe, where, { ...op, limit });
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

/** O mesmo filtro que o VetSmart usa nas listas: ponteiro da clínica e não excluídos. */
function filtroClinica(s: ResumoSessao): Record<string, unknown> {
  return { clinic: { __type: 'Pointer', className: s.clinicClasse ?? 'Clinic', objectId: s.clinicId }, isDeleted: false };
}

/** Percorre a classe inteira em ordem de objectId (paginação por chave, sem limite de skip). */
async function listarTudo(
  s: ResumoSessao,
  classe: string,
  rotulo: string,
  progresso: Progresso,
  op: OpcoesConsulta = {},
): Promise<ObjetoParse[]> {
  const filtro = filtroClinica(s);
  const todos: ObjetoParse[] = [];
  let ultimo: string | null = null;
  let limit = op.limit ?? POR_PAGINA;
  progresso(rotulo, 0);
  for (;;) {
    const where: Record<string, unknown> = ultimo ? { ...filtro, objectId: { $gt: ultimo } } : filtro;
    const pagina = await consultarComRetentativa(classe, where, { ...op, limit }, (l) => (limit = l));
    todos.push(...pagina);
    progresso(rotulo, todos.length);
    if (pagina.length < limit) return todos;
    ultimo = pagina[pagina.length - 1]!.objectId;
    await espera(PAUSA_MS);
  }
}

/**
 * Doses programadas (`isReminder: true`): as futuras e as atrasadas, como a tela
 * de Vacinas do VetSmart separa "Programadas" e "Atrasadas". Busca até o limite
 * máximo de atraso das Opções; a janela escolhida é aplicada nas regras, então
 * mudar o limite não exige nova sincronização. Aplicadas (`isReminder: false`)
 * não interessam aos lembretes.
 */
async function listarVacinasProgramadas(s: ResumoSessao, progresso: Progresso): Promise<ObjetoParse[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - ATRASO_MAXIMO_DIAS);
  desde.setHours(0, 0, 0, 0);
  const where = { ...filtroClinica(s), isReminder: true, documentDate: { $gte: { __type: 'Date', iso: desde.toISOString() } } };
  const op: OpcoesConsulta = {
    keys: 'patient,patientId,vaccine,vaccineType,documentDate,isReminder,ignoreReminder,isDeleted',
    order: 'documentDate,objectId',
  };
  const todos: ObjetoParse[] = [];
  let limit = 500;
  progresso('Vacinas', 0);
  for (;;) {
    const pagina = await consultarComRetentativa('Vaccine', where, { ...op, limit, skip: todos.length }, (l) => (limit = l));
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
  const brutosVacinas = await listarVacinasProgramadas(s, progresso);
  const tutores = brutosTutores.flatMap((o) => interpretarTutor(o) ?? []);
  const pacientes = brutosPacientes.flatMap((o) => interpretarPaciente(o) ?? []);
  const vacinas = interpretarVacinas(brutosVacinas, hojeCivil());
  registrarInfo('Sincronização concluída', `${pacientes.length} pacientes, ${tutores.length} tutores, ${vacinas.length} doses programadas.`, {
    recebidos: { tutores: brutosTutores.length, pacientes: brutosPacientes.length, vacinas: brutosVacinas.length },
    aproveitados: { tutores: tutores.length, pacientes: pacientes.length, vacinas: vacinas.length },
    pacientesComNascimento: pacientes.filter((p) => p.nascimento).length,
    tutoresComTelefone: tutores.filter((t) => t.telefone).length,
  });
  return { tutores, pacientes, vacinas };
}
