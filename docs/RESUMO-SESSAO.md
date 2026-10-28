# Resumo da sessão: extensão VittaSmart (lembretes do VetSmart)

## Objetivo
Extensão do Chrome que lê o VetSmart (https://prontuario.vetsmart.com.br) e avisa **aniversários de pacientes** e **próximas doses de vacina**. Cada aviso tem um botão que abre o WhatsApp do tutor com a mensagem pronta. O envio não é automático: o usuário confere e aperta "Enviar".

## O que já está pronto (v0.4.1 + ajustes sem versão nova)
- **Stack:** WXT + React + TypeScript, Manifest V3. Comandos: `npm install`, `npm test` (Vitest, 31 testes), `npm run typecheck`, `npm run build` (gera `.output/chrome-mv3`) e `npm run zip`.
- **Botão flutuante** "Lembretes" dentro do VetSmart, em Shadow DOM (`entrypoints/vetsmart.content.tsx`). O painel (`src/ui/Painel.tsx`) tem as abas Aniversários e Vacinas, agrupa por prazo (Atrasadas, Hoje, Amanhã, Próximos dias) e tem os botões "Enviar lembrete" (link wa.me) e "Já enviei".
- **Popup** do ícone, **Opções** (dias de antecedência, hora da notificação, modelos de mensagem, backup, dados fictícios, diagnóstico e relatório de erros), notificação diária e badge (`entrypoints/background.ts`).
- **Banco local:** IndexedDB via Dexie (`src/db.ts`), acessado só pelo background. A UI fala com ele por mensagens (`src/mensagens.ts`).
- **Regras puras e testadas** em `src/regras/`: aniversários (29/02, virada de ano), vacinas, normalização de telefone e modelos de mensagem.
- **Diagnóstico** (`entrypoints/interceptor.content.ts`, world MAIN): registra só a estrutura das chamadas do VetSmart, sem nenhum valor.
- **Relatório de erros e sincronização**: fica em IndexedDB e é exportado em JSON pelas Opções. Não inclui token nem dados de pacientes.

## O que se sabe da API interna do VetSmart
- É um **Parse Server** em `https://parse.vetsmart.com.br/parse`. As chamadas são `POST /classes/<Classe>` com corpo `text/plain` em JSON: `where`, `limit`, `order`, `keys`, `include`, `_method: "GET"`, `_ApplicationId`, `_ClientVersion`, `_InstallationId` e `_SessionToken`.
- A sessão é capturada das chamadas que a própria página faz (`src/vetsmart/sessao.ts`). O VetSmart filtra por `where.clinic = {__type:'Pointer', className, objectId}`.
- **Owner** (tutor): `name`, `phone`, `isDeleted`, `clinicId`.
- **Patient**: `name`, `specie`, `birthdate {__type:'Date', iso}`, `birthday` (texto "9999", provavelmente MMDD), `owner` (ponteiro), `ownerId`, `deceased` ("0" ou "1"), `isDeleted`, `clinicId`.
- **Vaccine**: `patient` / `patientId`, `vaccine` (nome), `vaccineType`, `vaccineId`, `documentDate`, `parentVaccine` (ponteiro para a dose anterior), `ignoreReminder`, `isDeleted`.
  - Existe um **campo booleano de 10 letras**, usado no `where` da tela de vacinas, que provavelmente separa dose aplicada de dose programada. O nome se perdeu no diagnóstico.
- Consultar a classe Vaccine inteira dá **HTTP 504**. Por isso a extensão busca só doses a partir de ontem (`documentDate >= ontem`), ordenadas por data, 200 por página e com nova tentativa.
- As consultas da sincronização saem do **background** (`src/vetsmart/consulta.ts`). Feitas de dentro da página, deram "Failed to fetch".

## Problema em aberto
A última sincronização terminou **sem erro, mas com 0 pacientes, 0 tutores e 0 vacinas**. Hipóteses:
1. O filtro de clínica (ponteiro ou `clinicId`) não bate com o que a página usa.
2. `isDeleted: false` exclui registros que não têm esse campo.
3. A sessão foi capturada de uma chamada de outra clínica ou de outro contexto.

Os ajustes já feitos (sem versão nova) **testam variações de filtro** com 1 registro, usam a primeira que encontrar algo e anotam cada teste no relatório. Tutores e pacientes agora são **mesclados**, sem apagar os já salvos. Vacinas são substituídas, porque só interessam as próximas doses.

## O que validar navegando no Chrome (DevTools → Network, filtro "parse.vetsmart")
1. Na **lista de tutores** e na **lista de pacientes**: copiar o corpo exato da requisição `classes/Owner` e `classes/Patient`, principalmente `where`, `order`, `limit` e `keys`, e conferir se a resposta traz `results`.
2. Na **aba de vacinas de um animal com dose aplicada e dose programada**: copiar o `where` de `classes/Vaccine` e descobrir o nome do campo booleano de 10 letras e o que ele significa (aplicada ou programada).
3. Conferir se existe uma tela ou função do próprio VetSmart que lista lembretes de vacinas, por exemplo uma chamada em `functions/...`. Seria o caminho mais leve.
4. Ajustar `src/vetsmart/adaptador.ts` e `src/vetsmart/parse.ts`, rodar testes, typecheck e build, recarregar a extensão e sincronizar de verdade.

## Regras do projeto
- Código, textos e commits em português do Brasil. O repositório é **público**: nunca commitar dados reais (backups, relatórios, HAR).
- `src/vetsmart/adaptador.ts` é o único arquivo que conhece a API do VetSmart.
- Pendências: liberar o push para `andreguimaraes1903-gif/VittaSmart` (branch `claude/nuvemvet-vetsmart-migration-tq2fj2`) e mostrar vacinas atrasadas depois que o campo booleano for identificado.
