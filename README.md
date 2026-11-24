# MG-TRACK — Rastreamento Veicular e Gestão

Sistema web construído a partir de [mg-track-sistema.md](mg-track-sistema.md): mesmo menu, rotas, módulos e paleta de cores.
Hospedagem na **Vercel** com banco **PostgreSQL** (Neon ou Supabase). O banco começa **vazio**: só são criados o usuário administrador e as 5 categorias de OS do sistema atual.

## Publicar na Vercel + Neon

1. Em [vercel.com](https://vercel.com), entre com o GitHub e clique em **Add New → Project**. Importe o repositório `FabioProjetos-dev/mgtrack`. Em *Framework Preset*, deixe **Other**. **Ainda não faça o deploy.**
2. Em **Environment Variables**, adicione:
   - `ADMIN_PASSWORD`: senha do administrador (login `admin`, ou o que você definir em `ADMIN_LOGIN`).
   - `INTEGRATION_TOKEN`: um token longo e aleatório para a API dos rastreadores (opcional).
3. Clique em **Deploy**.
4. No projeto, abra a aba **Storage → Create Database → Neon (Postgres)**. Escolha a região **São Paulo (sa-east-1)** e conecte ao projeto. A Vercel cria a variável `DATABASE_URL` sozinha.
5. Vá em **Deployments → ⋯ → Redeploy** para que o app passe a usar o banco.
6. Acesse o link do projeto e entre com `admin` e a senha definida. As tabelas são criadas no primeiro acesso.
7. Troque a senha em **Minha Conta**.

**Usando Supabase em vez de Neon:** em Supabase → *Project Settings → Database → Connection string*, copie a string do **Transaction pooler** (porta 6543). Na Vercel, cadastre-a como `DATABASE_URL`.

> As variáveis `ADMIN_LOGIN` e `ADMIN_PASSWORD` só valem na **primeira** inicialização, enquanto o banco ainda não tem usuários.

## Desenvolvimento local

```bash
npm install
cp .env.example .env   # opcional: coloque a DATABASE_URL do Neon/Supabase
npm run dev            # http://localhost:3000
```

Sem `DATABASE_URL`, o servidor local usa um Postgres embutido (PGlite) gravado em `data/pg`, sem precisar instalar nada.
`npm run reset` **apaga todas as tabelas** do banco configurado e recria a estrutura vazia.

## Integração com rastreadores

Não há mais simulador. As posições chegam pela API de integração, chamada pelo servidor de comunicação dos rastreadores (GT06, Suntech, Teltonika etc.):

```http
POST /api/integracao/posicoes
Authorization: Bearer <INTEGRATION_TOKEN>
Content-Type: application/json

[{ "imei": "864000000000001", "lat": -19.92, "lng": -43.94, "velocidade": 62, "ignicao": true,
   "odometro": 15230.5, "data": "2026-11-24 15:30:00", "evento": "Botão de pânico" }]
```

- O `imei` precisa estar cadastrado em **Equipamentos** e vinculado a um **Veículo**.
- `data` é opcional e usa o horário de Brasília. `evento` também é opcional e aceita os tipos do cadastro de eventos.
- A mudança de ignição e o excesso de velocidade (acima do limite do veículo) viram eventos automaticamente.
- A resposta traz os **comandos pendentes** de cada veículo, que passam a "Enviado". Depois de executar um comando, informe o resultado em `POST /api/integracao/comandos/{id}/resposta` com `{ "status": "Confirmado" }` ou `{ "status": "Falhou" }`.

## Funcionalidades

- **Layout** do documento: header com contadores, sidebar recolhível com busca, paleta `#2B3643` / `#364150` / `#36C6D3`. Também funciona no celular.
- **Dashboards** de Gestão (cards, conectividade, vendas, OS, saúde dos equipamentos, aniversariantes), Financeiro e de Atendimentos.
- **Monitoramento** em mapa e em grade, com cercas, comandos e tratamento de eventos.
- **Cadastros** de todos os módulos do menu, com pesquisa, filtros, ordenação, paginação, exportação CSV e impressão.
- **Regras de negócio**:
  - a OS finalizada de instalação ou retirada vincula ou desvincula o equipamento do veículo;
  - a transferência move o equipamento de estoque;
  - o contrato gera as mensalidades;
  - na conta a receber é possível dar baixa, gerar cobrança e criar a nota fiscal;
  - toda alteração fica registrada no log de auditoria.
- **42 relatórios**, agenda de OS, estoque por técnico, comandos em massa e para equipamentos offline, câmeras, novidades e minha conta.

## Estrutura

```
api/index.js         Função serverless da Vercel (atende /api/*)
server.js            Servidor local
src/app.js           App Express: sessão (cookie httpOnly, scrypt), rotas
src/db.js            Conexão Postgres/PGlite, migração automática e usuário inicial
src/schema.js        Esquema único das entidades → tabelas, API e formulários
src/crud.js          API REST genérica, regras de negócio e ações
src/dashboard.js     Dashboards, header e monitoramento
src/reports.js       Relatórios
src/integration.js   API para os rastreadores
public/              Front-end (HTML/CSS/JS puro, servido pela CDN da Vercel)
```

Para incluir um campo ou módulo, edite `src/schema.js`. A coluna é criada sozinha no próximo acesso.

## Pendências para produção

- Aplicar as permissões por grupo (hoje o cadastro existe, mas todos os usuários veem tudo).
- Integrar os gateways de verdade: boleto/Pix, NFS-e da prefeitura, Serasa, SMS, WhatsApp e push. Hoje eles só ficam registrados no sistema.
