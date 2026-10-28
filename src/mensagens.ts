import { browser } from 'wxt/browser';
import type { Backup } from './db';
import type { RegistroErro } from './erros';
import type { DadosSincronizados, Lembrete } from './tipos';
import type { CapturaDiagnostico, RegistroDiagnostico } from './vetsmart/diagnostico';

/** Pedidos que a UI (popup, opções, content script) faz ao background. */
export type Pedido =
  | { tipo: 'lembretes' }
  | { tipo: 'marcarEnviado'; chave: string; enviado: boolean }
  | { tipo: 'salvarDados'; dados: DadosSincronizados; origem: string }
  | { tipo: 'carregarDemo' }
  | { tipo: 'exportar' }
  | { tipo: 'importar'; backup: Backup }
  | { tipo: 'apagarTudo' }
  | { tipo: 'registrarDiagnostico'; captura: Omit<CapturaDiagnostico, 'origem'> }
  | { tipo: 'lerDiagnostico' }
  | { tipo: 'limparDiagnostico' }
  | { tipo: 'notificarAgora' }
  | { tipo: 'abrirOpcoes' }
  | { tipo: 'registrarErro'; erro: Omit<RegistroErro, 'id' | 'em' | 'versao' | 'navegador'> }
  | { tipo: 'lerErros' }
  | { tipo: 'limparErros' };

export interface RespostaLembretes {
  lembretes: Lembrete[];
  ultimaSincronizacao: string | null;
  origemDados: string | null;
  totais: { pacientes: number; tutores: number; vacinas: number };
}

export interface ResultadoNotificacao {
  enviada: boolean;
  pendentes: number;
  /** Falso quando o Chrome bloqueou as notificações da extensão. */
  permitida: boolean;
}

type Respostas = {
  lembretes: RespostaLembretes;
  exportar: Backup;
  lerDiagnostico: RegistroDiagnostico[];
  lerErros: RegistroErro[];
  notificarAgora: ResultadoNotificacao;
};

export type RespostaDe<T extends Pedido['tipo']> = T extends keyof Respostas ? Respostas[T] : void;

type Envelope = { ok: true; valor: unknown } | { ok: false; erro: string };

const EXTENSAO_ATUALIZADA = 'A extensão foi atualizada. Recarregue a página do VetSmart (F5).';

export async function pedir<P extends Pedido>(pedido: P): Promise<RespostaDe<P['tipo']>> {
  // Content script de antes de recarregar a extensão perde o runtime.
  if (!browser.runtime?.id) throw new Error(EXTENSAO_ATUALIZADA);
  let r: Envelope | undefined;
  try {
    r = (await browser.runtime.sendMessage(pedido)) as Envelope | undefined;
  } catch (e) {
    if (e instanceof Error && /context invalidated/i.test(e.message)) throw new Error(EXTENSAO_ATUALIZADA);
    throw e;
  }
  if (!r) throw new Error('Sem resposta da extensão. Recarregue a página.');
  if (!r.ok) throw new Error(r.erro);
  return r.valor as RespostaDe<P['tipo']>;
}

export function embrulhar(p: Promise<unknown>): Promise<Envelope> {
  return p.then(
    (valor) => ({ ok: true as const, valor }),
    (e: unknown) => ({ ok: false as const, erro: e instanceof Error ? e.message : String(e) }),
  );
}
