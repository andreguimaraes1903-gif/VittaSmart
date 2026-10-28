import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'VittaSmart – Lembretes',
    description:
      'Avisa aniversários e próximas vacinas dos pacientes do VetSmart e abre o WhatsApp do tutor com a mensagem pronta.',
    permissions: ['storage', 'unlimitedStorage', 'alarms', 'notifications'],
    host_permissions: ['https://prontuario.vetsmart.com.br/*'],
    action: { default_title: 'Lembretes VittaSmart' },
  },
});
