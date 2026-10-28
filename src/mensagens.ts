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

type Respostas = {
  lembretes: RespostaLembretes;
  exportar: Backup;
  lerDiagnostico: RegistroDiagnostico[];
  lerErros: RegistroErro[];
};

export type RespostaDe<T extends Pedido['tipo']> = T extends keyof Respostas ? Respostas[T] : void;

type Envelope = { ok: true; valor: unknown } | { ok: false; erro: string };

export async function pedir<P extends Pedido>(pedido: P): Promise<RespostaDe<P['tipo']>> {
  const r = (await browser.runtime.sendMessage(pedido)) as Envelope | undefined;
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
