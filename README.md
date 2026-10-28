# VittaSmart – Lembretes

Extensão do Chrome que avisa **aniversários** e **próximas vacinas** dos pacientes do
[VetSmart](https://prontuario.vetsmart.com.br) e abre o **WhatsApp do tutor** com a mensagem já escrita.

- Botão flutuante 🐾 dentro do VetSmart, com as abas Aniversários e Vacinas.
- O ícone da extensão abre o mesmo painel e mostra o número de pendências.
- Um resumo diário chega como notificação do Chrome, no horário configurado.
- "Marcar enviado" registra cada aviso enviado para ele não aparecer de novo.
- Os modelos de mensagem são editáveis (`{tutor}`, `{pet}`, `{data}`, `{idade}`, `{vacina}`).
- Os dados ficam **só no navegador**, no IndexedDB da extensão, com backup em JSON.

## Instalar (modo desenvolvedor)

```bash
npm install
npm run build
```

1. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `.output/chrome-mv3`.
3. Fixe a extensão na barra do Chrome.

Para testar sem o VetSmart: **Opções → Carregar dados fictícios (demonstração)**.

## Sincronização

O VetSmart usa um servidor Parse (`parse.vetsmart.com.br`). A extensão aproveita o login que já está aberto: o script `interceptor` lê as credenciais que a própria página envia e guarda só em memória. Ao clicar em **Sincronizar**, ela baixa as classes `Owner`, `Patient` e `Vaccine` da clínica, em páginas de 1000 registros.

- Pacientes falecidos ou excluídos ficam de fora.
- Para cada vacina de um paciente, vale só a dose aplicada mais recente.
- Se aparecer "Não encontrei a sessão", navegue um pouco no VetSmart (abra um tutor ou paciente) e tente de novo.

**Diagnóstico:** em Opções, gera um relatório com a estrutura das chamadas do VetSmart (nomes de campos e máscaras como `99/99`, nunca os valores). Serve para ajustar o adaptador se o VetSmart mudar.

## Desenvolvimento

```bash
npm run dev        # abre um Chrome com a extensão e recarga automática
npm test           # Vitest (regras de datas, WhatsApp, modelos, diagnóstico)
npm run typecheck
npm run build      # gera .output/chrome-mv3
npm run zip        # pacote .zip para distribuir
```

Estrutura:

| Caminho | Papel |
| --- | --- |
| `entrypoints/background.ts` | Banco (Dexie/IndexedDB), mensagens, alarme diário, notificação e badge |
| `entrypoints/vetsmart.content.tsx` | Botão flutuante e painel dentro do VetSmart (Shadow DOM); dispara a sincronização |
| `entrypoints/interceptor.content.ts` | Modo diagnóstico (world MAIN): captura a estrutura de fetch e XHR |
| `entrypoints/popup`, `entrypoints/options` | Painel do ícone e página de opções |
| `src/regras/` | Regras puras e testadas: aniversários, vacinas, WhatsApp, modelos |
| `src/vetsmart/adaptador.ts` | Único ponto que conhece a API do VetSmart |

## LGPD

Este repositório é público: **nunca** faça commit de backups, relatórios ou HARs com dados de clientes (o `.gitignore` já bloqueia os nomes padrão). Nenhum dado sai do navegador: a extensão não envia nada para servidores externos. O WhatsApp só é aberto quando você clica.
