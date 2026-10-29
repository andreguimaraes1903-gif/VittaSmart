import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { apagarTudo, db, exportarBackup, importarBackup, lerDados, lerMeta, registrarErro, salvarDados } from '@/src/db';
import type { RegistroErro } from '@/src/erros';
import { configItem, lerConfig } from '@/src/config';
import { dadosDemo } from '@/src/demo';
import { embrulhar, type Pedido, type RespostaLembretes, type ResultadoNotificacao } from '@/src/mensagens';
import { contarPendentes, montarLembretes, type Pendentes } from '@/src/regras/lembretes';
import { hojeCivil } from '@/src/regras/datas';
import { juntarLista } from '@/src/regras/modelo';
import { mesclar, type Estrutura } from '@/src/vetsmart/estrutura';

const ALARME = 'resumo-diario';

async function calcularLembretes(): Promise<RespostaLembretes> {
  const [dados, envios, config, ultimaSincronizacao, origemDados] = await Promise.all([
    lerDados(),
    db.envios.toArray(),
    lerConfig(),
    lerMeta('ultimaSincronizacao'),
    lerMeta('origemDados'),
  ]);
  const lembretes = montarLembretes(dados, new Set(envios.map((e) => e.chave)), hojeCivil(), config);
  return {
    lembretes,
    ultimaSincronizacao,
    origemDados,
    totais: { pacientes: dados.pacientes.length, tutores: dados.tutores.length, vacinas: dados.vacinas.length, retornos: dados.retornos.length },
  };
}

async function atualizarBadge(): Promise<Pendentes> {
  const { lembretes } = await calcularLembretes();
  const p = contarPendentes(lembretes);
  await browser.action.setBadgeText({ text: p.total ? String(p.total) : '' });
  await browser.action.setBadgeBackgroundColor({ color: '#0f766e' });
  return p;
}

/**
 * Resumo diário. No teste, notifica mesmo sem pendências e com id novo:
 * o Windows não mostra de novo uma notificação que só foi atualizada.
 */
async function notificar(teste = false): Promise<ResultadoNotificacao> {
  const p = await atualizarBadge();
  const pendentes = p.total;
  const permitida = (await browser.notifications.getPermissionLevel()) === 'granted';
  if (!permitida) return { enviada: false, pendentes, permitida };
  if (!pendentes && !teste) return { enviada: false, pendentes, permitida };
  const { diasAntecedencia } = await lerConfig();
  const partes = [
    p.aniversarios && `${p.aniversarios} aniversário${p.aniversarios > 1 ? 's' : ''}`,
    p.vacinas && `${p.vacinas} vacina${p.vacinas > 1 ? 's' : ''}`,
    p.retornos && `${p.retornos} retorno${p.retornos > 1 ? 's' : ''}`,
  ].filter(Boolean) as string[];
  await browser.notifications.clear(ALARME);
  await browser.notifications.create(teste ? `teste-${Date.now()}` : ALARME, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: teste ? 'Teste de notificação' : 'Lembretes do dia',
    message: pendentes
      ? `${juntarLista(partes)} para avisar (próximos ${diasAntecedencia} dias e vacinas atrasadas).`
      : 'Nenhum lembrete pendente agora. As notificações estão funcionando.',
    priority: 2,
  });
  return { enviada: true, pendentes, permitida };
}

async function agendarAlarme(): Promise<void> {
  const { horaNotificacao } = await lerConfig();
  const proximo = new Date();
  proximo.setHours(horaNotificacao, 0, 0, 0);
  if (proximo.getTime() <= Date.now()) proximo.setDate(proximo.getDate() + 1);
  await browser.alarms.create(ALARME, { when: proximo.getTime(), periodInMinutes: 24 * 60 });
}

function registrarErroComp(e: Omit<RegistroErro, 'id' | 'em' | 'versao' | 'navegador'>) {
  return registrarErro({ ...e, em: new Date().toISOString(), versao: browser.runtime.getManifest().version, navegador: navigator.userAgent });
}

async function tratar(p: Pedido): Promise<unknown> {
  switch (p.tipo) {
    case 'lembretes':
      return calcularLembretes();
    case 'marcarEnviado':
      if (p.enviado) await db.envios.put({ chave: p.chave, em: new Date().toISOString() });
      else await db.envios.delete(p.chave);
      await atualizarBadge();
      return;
    case 'salvarDados':
      await salvarDados(p.dados, p.origem, p.origem === 'vetsmart' ? 'mesclar' : 'substituir');
      await atualizarBadge();
      return;
    case 'carregarDemo':
      await salvarDados(dadosDemo(hojeCivil()), 'demonstração');
      await atualizarBadge();
      return;
    case 'exportar':
      return exportarBackup();
    case 'importar':
      await importarBackup(p.backup);
      await atualizarBadge();
      return;
    case 'apagarTudo':
      await apagarTudo();
      await atualizarBadge();
      return;
    case 'registrarDiagnostico': {
      const chave = `${p.captura.metodo} ${p.captura.url}`;
      const anterior = await db.diagnostico.get(chave);
      // Mescla com as capturas anteriores: uma resposta vazia não apaga a estrutura já vista.
      const juntar = (a: Estrutura | undefined, b: Estrutura | undefined) => (b ? mesclar(a, b) : a);
      await db.diagnostico.put({
        ...p.captura,
        chave,
        corpo: juntar(anterior?.corpo, p.captura.corpo),
        resposta: juntar(anterior?.resposta, p.captura.resposta),
        cabecalhos: [...new Set([...(anterior?.cabecalhos ?? []), ...p.captura.cabecalhos])],
        vezes: (anterior?.vezes ?? 0) + 1,
        ultimaVez: new Date().toISOString(),
      });
      return;
    }
    case 'lerDiagnostico':
      return db.diagnostico.toArray();
    case 'limparDiagnostico':
      await db.diagnostico.clear();
      return;
    case 'notificarAgora':
      return notificar(true);
    case 'registrarErro':
      await registrarErroComp(p.erro);
      return;
    case 'lerErros':
      return db.erros.orderBy('em').reverse().toArray();
    case 'limparErros':
      await db.erros.clear();
      return;
    case 'abrirOpcoes':
      await browser.runtime.openOptionsPage();
      return;
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void agendarAlarme();
    void atualizarBadge();
  });
  browser.runtime.onStartup.addListener(() => {
    void atualizarBadge();
  });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARME) void notificar();
  });
  browser.notifications.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') });
  });
  configItem.watch(() => {
    void agendarAlarme();
    void atualizarBadge();
  });

  browser.runtime.onMessage.addListener((msg, _sender, responder) => {
    const pedido = msg as Pedido;
    const execucao = tratar(pedido).catch(async (e: unknown) => {
      if (pedido.tipo !== 'registrarErro') {
        const tecnica = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        await registrarErroComp({ contexto: `Extensão: ${pedido.tipo}`, mensagem: tecnica, tecnica: e instanceof Error ? e.stack : undefined }).catch(() => undefined);
      }
      throw e;
    });
    embrulhar(execucao).then(responder);
    return true; // resposta assíncrona
  });
});
