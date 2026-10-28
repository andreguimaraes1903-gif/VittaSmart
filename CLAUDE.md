# CLAUDE.md

Extensão Chrome (WXT + React + TypeScript, MV3) que lê dados do VetSmart e gera lembretes de aniversários e vacinas com link para o WhatsApp do tutor. Código, textos e commits em **português do Brasil**.

- Comandos: `npm test`, `npm run typecheck`, `npm run build`. Rode os três antes de concluir.
- O IndexedDB (Dexie, `src/db.ts`) só é acessado pelo background. A UI fala com ele por `pedir()` de `src/mensagens.ts`.
- Regras de negócio puras ficam em `src/regras/`, com testes. Datas são civis (`AAAA-MM-DD`).
- `src/vetsmart/adaptador.ts` é o único arquivo que conhece a API interna do VetSmart.
- Repositório público: nunca commitar dados reais de pacientes ou tutores. Fixtures são sempre fictícias.
