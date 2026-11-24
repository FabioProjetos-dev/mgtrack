# MG-TRACK — Rastreamento Veicular e Gestão

Sistema web construído a partir de [mg-track-sistema.md](mg-track-sistema.md): mesmo menu, rotas, módulos e paleta de cores.

## Como executar

Requisitos: **Node.js 22.5+** (usa o SQLite nativo `node:sqlite`).

```bash
npm install
npm start            # http://localhost:3000
npm run reset        # recria o banco com dados de demonstração
```

Login de demonstração: **admin / admin123** (outros usuários do seed usam a senha `123456`).

Variáveis de ambiente: `PORT` (padrão 3000) e `SIMULADOR=0` para desligar o simulador de rastreadores.

## O que está implementado

- **Layout** do documento: header `#2B3643` com badges (atendimentos, contas vencidas, notificações, novidades), sidebar `#364150` recolhível com busca, item ativo `#36C6D3`, Open Sans 14px e Font Awesome. Também funciona no celular.
- **Dashboard de Gestão**: os 4 cards, os gauges de conectividade (Online / ≤24h / ≤36h / +36h, que abrem o relatório ao clicar), o gráfico de vendas por consultor com filtro de mês, o gráfico de OS por mês e categoria (filtros de técnicos, estoque, categorias, período e status), os widgets de saúde dos equipamentos e os aniversariantes.
- **Dashboard Financeiro** e **Dashboard de Atendimentos** (com NPS).
- **Painel de Monitoramento** com mapa (Leaflet/OpenStreetMap), filtros, cercas, comandos de bloqueio e desbloqueio no popup e eventos para tratar. Também há o **Painel 2**, em grade.
- **Cadastros** (CRUD completo) de todos os módulos do menu: pesquisa, filtros, ordenação, paginação, exportação CSV e impressão.
- **Regras de negócio**:
  - Quando uma OS de instalação é finalizada, o equipamento passa para "Instalado" e é vinculado ao veículo. Na retirada, ele é desvinculado.
  - Uma transferência move o equipamento de estoque.
  - O contrato tem a ação "Gerar 12 mensalidades", que cria as contas a receber.
  - Na conta a receber é possível dar baixa, gerar cobrança e emitir a nota fiscal.
  - Comandos enviados a equipamentos offline ficam pendentes até a reconexão.
  - Toda inclusão, alteração e exclusão fica registrada no log de auditoria.
- **42 relatórios** calculados: telemetria, conectividade, financeiro, comercial, atendimento, manutenção e sinistros.
- **Agenda de OS** (calendário), **estoque** por técnico, **envio de comandos em massa**, **câmeras**, **novidades** e **minha conta**.

## Estrutura

```
server.js            Express: autenticação por sessão (cookie httpOnly, senha com scrypt) e montagem das rotas
src/schema.js        Esquema único das entidades → gera tabelas, API e formulários
src/db.js            SQLite (data/mgtrack.db) e migração automática
src/crud.js          API REST genérica, regras de negócio (hooks) e ações
src/dashboard.js     Dashboards, header e dados do monitoramento
src/reports.js       Relatórios
src/seed.js          Dados de demonstração
src/simulator.js     Simulador de rastreadores (posições, eventos e fila de comandos)
public/              SPA (HTML/CSS/JS puro, sem build)
```

Para incluir um campo ou um módulo, edite `src/schema.js`. A tabela é migrada sozinha e a tela é gerada automaticamente. Para colocar a tela no menu, adicione uma entrada em `public/js/menu.js`.

## Próximos passos para produção

- Trocar `src/simulator.js` pela integração real com o servidor de comunicação dos rastreadores (protocolos GT06, Suntech, Teltonika etc.).
- Aplicar as permissões por grupo (hoje o cadastro existe, mas todos os usuários veem todos os módulos).
- Integrar os gateways de verdade: boleto/Pix, NFS-e da prefeitura, Serasa, SMS, WhatsApp e push.
