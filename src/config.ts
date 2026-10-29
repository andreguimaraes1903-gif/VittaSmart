import { storage } from 'wxt/utils/storage';
import type { Config } from './tipos';

export const CONFIG_PADRAO: Config = {
  diasAntecedencia: 7,
  diasAtrasoVacina: 30,
  horaNotificacao: 9,
  modeloAniversario:
    'Olá, {tutor}! 🎂 No dia {data} o(a) {pet} completa {idade}. Toda a equipe deseja muitas felicidades e lambeijos! 🐾',
  modeloVacina:
    'Olá, {tutor}! 💉 Passando para lembrar que a vacina {vacina} do(a) {pet} está prevista para {data}. Vamos agendar um horário?',
  modeloVacinaAtrasada:
    'Olá, {tutor}! 💉 A vacina {vacina} do(a) {pet} estava prevista para {data} e ainda não consta como aplicada. Vamos agendar um horário?',
  modeloRetorno: 'Olá, {tutor}! 📅 Passando para lembrar que o retorno do(a) {pet} está marcado para {data}. Podemos confirmar o horário?',
  diagnostico: false,
};

export const configItem = storage.defineItem<Config>('local:config', {
  fallback: CONFIG_PADRAO,
});

export async function lerConfig(): Promise<Config> {
  return { ...CONFIG_PADRAO, ...(await configItem.getValue()) };
}
