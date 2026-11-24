# MG-TRACK Rastreamento Veicular — Contexto do Sistema

> Documento de referência para dar contexto a outro projeto sobre como o sistema MG-TRACK funciona: estrutura de navegação, módulos, funções e identidade visual.
> Levantado a partir do painel web em `https://mg.trackrastreamentoveicular.com.br/` (novembro/2026).
> Observação: o Dashboard de Gestão foi inspecionado em detalhe; a descrição das demais telas é baseada nos nomes e rotas do menu.

---

## 1. Visão geral

O MG-TRACK é uma plataforma SaaS de **rastreamento veicular e gestão de empresa de rastreamento**. Ela cobre:

- **Operação de rastreamento**: veículos, monitoramento em tempo real, cercas, alertas, comandos aos equipamentos, rotas, videomonitoramento.
- **Gestão de ativos**: equipamentos (rastreadores), estoque por técnico/região, chips e operadoras.
- **Gestão comercial e financeira**: contratos, comodato, cobranças, contas a pagar/receber, fluxo de caixa, nota fiscal, comissões.
- **Operação de campo**: ordens de serviço (instalação, manutenção, retirada), agenda e técnicos.
- **Pós-venda**: atendimentos/chat, assistência veicular (24h), sinistros, vistorias, checklists.
- **Relatórios** operacionais (km, paradas, velocidade, eventos, offline etc.).

### Modelo de negócio refletido no sistema
- **Clientes Comodato**: o cliente usa o rastreador emprestado pela empresa (vínculo por termo de comodato).
- **Clientes Plataforma**: o cliente usa apenas a plataforma (equipamento próprio ou de terceiros).
- Controle de **estoque de rastreadores** distribuído entre estoque central e estoques de cada técnico (carro/moto/simples/retiradas).

### Stack/tema percebido no front-end
- Layout tipo **admin template (estilo Metronic)**: header escuro fixo, sidebar escura recolhível à esquerda, conteúdo com fundo branco.
- Fonte: **Open Sans**, 14px, sans-serif.
- Ícones: **Font Awesome**.
- Gráficos: **amCharts** (barras/colunas) e gauges circulares (knob).
- Existe uma **"nova versão"** sendo migrada: rotas com prefixo `/new/...` usam a interface moderna; o Dashboard exibe um aviso "Nova Versão Disponível!" com botão "Acessar nova versão".

---

## 2. Estrutura de layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo] [☰ recolher]        📞(badge) $  🔔(badge) 📰  [Usuário ▾]│  ← Header (#2B3643)
├───────────────┬──────────────────────────────────────────────────┤
│ Sidebar       │  Aviso de nova versão (opcional)                 │
│ (#364150)     │  Título da página                                │
│ item ativo    │  Cards de indicadores                            │
│ (#36C6D3)     │  Widgets / tabelas / gráficos                    │
│               │                                                  │
│               │  © 2026 MG-TRACK RASTREAMENTO VEICULAR (rodapé)   │
└───────────────┴──────────────────────────────────────────────────┘
```

### Barra superior (header)
| Ícone | Função |
|---|---|
| 📞 Telefone (com badge de contagem) | Atendimentos pendentes/abertos |
| $ Cifrão | Atalho/alertas financeiros |
| 🔔 Sino (badge) | Notificações do sistema |
| 📰 Jornal | Novidades do sistema |
| Avatar + nome do usuário ▾ | Menu: **Minha Conta**, **Configurações**, **Sair** |

Badges do header usam a cor de destaque ciano (`#36C6D3`). Itens novos no menu usam badge vermelho "novo" (`#ED6B75`).

---

## 3. Menu lateral completo (abas, submenus e rotas)

### Dashboard de Gestão — `/dashboard-gestao/`
### Dashboard Financeiro — `/dashboard-financeiro/`

### Pessoas
| Submenu | Rota |
|---|---|
| Pessoas | `/pessoa/` |
| Usuários | `/usuario/list/` |
| Motoristas | `/pessoa/motorista/` |
| Categoria | `/pessoa/grupo/` |
| Indicações | `/pessoa/indicacao/` |
| ListSystem | `/pessoa/listsystem/` |
| Cadastros Pendentes | `/pessoa/cadastro-pendente/` |
| Grupos de Permissões | `/usuario/permissions-groups-list/` |
| Grupos de Horários | `/pessoa/grupos-horarios-list/` |
| Grupo de Pessoas | `/pessoa/pessoa_grupo/` |
| Consulta Serasa | `/pessoa/consulta-serasa/` |

### Veículos
| Submenu | Rota |
|---|---|
| Veículos | `/veiculo/list/` |
| Painel de Monitoramento | `/veiculo/painel-monitoramento/` |
| Painel de Monitoramento 2 | `/veiculo/painel-monitoramento-h/` |
| Monitoramento de Eventos | `/veiculo/monitoramento-eventos/` |
| Histórico | `/relatorio/historico-destinatarios/` |
| Rotas | `/veiculo/rotas-list/` |
| Destinatários | `/tarefa/destinatarios/` |
| Grupos | `/veiculo/grupos/` |
| Cercas | `/veiculo/cercas/list/` |
| Alertas | `/new/vehicles/alerts` |
| Comandos de Eventos | `/equipamento/comando_eventos/` |
| Envio de Comandos em Massa | `/equipamento/envio_comando/` |
| Comandos Pendentes | `/equipamento/comandos_pendentes/` |
| Notificações de Eventos | `/equipamento/notificacao_eventos/` |
| Gerenciar Entradas e Saídas | `/veiculo/ios-list/` |

### Equipamentos
| Submenu | Rota |
|---|---|
| Equipamentos | `/equipamento/` |
| Vendas | `/equipamento/venda-equipamento/` |
| Estoque | `/equipamento/estoque/` |
| Comandos para equipamento offline | `/equipamento/comando-equipamento-offline/` |
| Comandos Personalizados | `/new/equipamentos/comandos-personalizados` |
| Transferência de Equipamentos | `/equipamento/relatorio-transferencia-list/` |

### Chips
| Submenu | Rota |
|---|---|
| Chip | `/chip/` |
| Operadora | `/chip/operadora/` |

### Financeiro
| Submenu | Rota |
|---|---|
| Contas a receber | `/financeiro/contas-receber/` |
| Contas a pagar | `/financeiro/contas-pagar/` |
| Contas recorrentes | `/financeiro/contas-recorrente/` |
| Grupo de contas | `/financeiro/grupo-contas/` |
| Relatório de vendas | `/financeiro/grupo-contas/list-vendas/` |
| Banco | `/financeiro/banco/` |
| Centro de custos | `/financeiro/centro-custos/` |
| Categoria | `/financeiro/categoria/` |
| Resumo | `/financeiro/resumo/` |
| Extrato | `/relatorio/banco-extrato/` |
| Fluxo de Caixa | `/financeiro/fluxo-caixa/` |
| Clientes sem financeiro | `/relatorio/rel-clientes-sem-financeiro/` |
| Veículos Sem Financeiro | `/financeiro/veiculos-sem-financeiro/` |
| Relatório Inadimplentes | `/financeiro/rel-inadimplentes` |
| Relatório faturamento | `/financeiro/rel-faturamento` |

### Cobranças
| Submenu | Rota |
|---|---|
| Cobrança | `/financeiro/cobranca/` |
| Comissionamento | `/new/collections/commission` |

### Contratos
| Submenu | Rota |
|---|---|
| Serviços | `/contrato/servico/` |
| Contrato | `/contrato/` |
| Termo de rescisão | `/contrato/termo_rescisao/` |
| Termo de comodato | `/contrato/termo_comodato/` |
| Termo de Uso | `/contrato/termo_de_uso/` |
| Pedido | `/contrato/pedido/` |
| Próximos a vencer | `/contrato/proximos_vencer/` |
| Planilha de contas a Receber | `/contrato/proximas-a-vencer/` |
| Consultores | `/contrato/consultor/list/` |

### Nota Fiscal
| Submenu | Rota |
|---|---|
| Nota Fiscal | `/new/nota-fiscal/overview/` |
| Serviços de Nota Fiscal | `/nota-fiscal/servico-nfs/` |
| Relatório de Nota Faturada | `/nota-fiscal/relatorio-nota-faturada/` |
| Empresas | `/new/nota-fiscal/business/` |

### Atendimentos
| Submenu | Rota |
|---|---|
| Dashboard | `/atendimentos/dashboard/` |
| Atendimentos | `/atendimentos/` |
| Atendimentos Plataforma | `/atendimentos/atendimentos-list-plataforma/` |
| Tags | `/atendimentos/tags-list/` |
| Chats (novo) | `/new/atendimentos/chats` |
| Projetos | `/atendimentos/projetos-list/` |
| Relatório de produtividade | `/atendimentos/rel-usuario/` |
| Atendimentos (NPS) | `/atendimentos/rel-services-nps/` |

### Ordens de serviço
| Submenu | Rota |
|---|---|
| Ordens de serviço | `/ordem_servico/` |
| Agenda | `/ordem_servico/calendar-os/` |
| Categorias | `/ordem_servico/categoria/` |
| Técnicos | `/ordem_servico/tecnico/list/` |

### Assistência Veicular
| Submenu | Rota |
|---|---|
| Planos | `/veiculo/list-assistances/` |
| Solicitações | `/assistencia-veicular/solicitations/` |
| Histórico de inclusões | `/relatorio/rel-historico-assistencias/` |
| Veículos com assistência | `/veiculo/vehicles-with-assistance/` |
| Prestadores | `/assistencia-veicular/prestador/list/` |
| Serviços | `/assistencia-veicular/servico/list/` |
| Motivos | `/assistencia-veicular/motive/list/` |

### Manutenções
| Submenu | Rota |
|---|---|
| Plano de Manutenção | `/plano-manutencao/create/` |
| Manutenções | `/manutencao/list/` |
| Relatório de plano de manutenção | `/relatorio/rel-plano-manutencao/` |
| Despesas | `/manutencao/despesas-list/` |

### Videomonitoramento *(novo)*
| Submenu | Rota |
|---|---|
| Ao vivo | `/cameras/streaming/` |
| Histórico | `/cameras/historico/` |

### Sinistros
| Submenu | Rota |
|---|---|
| Sinistros | `/sinistros/list/` |
| Tipos de Sinistro | `/sinistros/tipos-list/` |
| Categorias de ocorrências | `/sinistros/categorias-list/` |
| Relatório de sinistros | `/sinistros/rel-sinistros-criados` |

### Vistorias
| Submenu | Rota |
|---|---|
| Questionários | `/vistoria/questionario/` |
| Vistorias | `/vistoria/questionario/resposta/` |

### CheckSystem *(novo)*
| Submenu | Rota |
|---|---|
| Formulários | `/checksystem/form/` |
| Questionários | `/checksystem/questionnaire/` |

### Relatórios
| Submenu | Rota |
|---|---|
| Rotas por ignição | `/relatorio/rel-rotas/` |
| Percurso e motorista | `/relatorio/rel-km-veiculos/` |
| Estatísticas por veículo | `/relatorio/rel-km-dia/` |
| Estatísticas por cliente | `/relatorio/rel-estatistica-cliente/` |
| Relatório de cercas | `/relatorio/rel-cercas/` |
| Relatório de pontos de interesse | `/relatorio/rel-pontos-ref/` |
| Relatório de excesso de velocidade | `/relatorio/rel-velocidade/` |
| Relatório de paradas | `/relatorio/rel-paradas/` |
| Relatório de rotas (POI) | `/relatorio/rel-rotas-poi/0` |
| Relatório de cadastro e exclusão de veículos | `/relatorio/rel-vehicle-registration/` |
| Consumo de combustível | `/relatorio/rel-combustivel/` |
| Chips não utilizados | `/relatorio/rel-chips-nao-utilizados/` |
| Usuários sem veículos | `/relatorio/rel-usuario-sem-veiculos/` |
| Relatório de eventos | `/relatorio/rel-eventos/` |
| Relatório de comandos | `/relatorio/rel-comandos/` |
| Relatório de âncoras | `/relatorio/rel-ancora/` |
| Offline até 24h | `/relatorio/rel-offline/1/` |
| Offline até 36h | `/relatorio/rel-offline/2/` |
| Offline há mais de 36h | `/relatorio/rel-offline/3/` |
| Relatório de log | `/relatorio/relatorio-log/` |
| Relatório de sensores | `/relatorio/rel-entrada-saida/` |
| Relatório de comissão consultor | `/relatorio/rel-comissao-vendedor/` |
| Relatório jornada de motorista | `/relatorio/rel-jornada-motorista/` |
| Relatório Tratativas | `/relatorio/rel-tratativas/` |

### Anúncios *(novo)* — `/new/announcements`

### Configurações
| Submenu | Rota |
|---|---|
| Painel de SMS | `/new/settings/notifications/sms` |
| Painel de Whatsapp | `/new/settings/notifications/whatsapp` |
| Painel de Email | `/new/settings/notifications/email` |
| Painel de Push Notification | `/new/settings/notifications/push` |
| Histórico de Envio de Mensagens | `/new/settings/notifications/history` |

### Novidades — `/home/novidades/`

---

## 4. Funções por módulo

### Dashboard de Gestão (tela inicial)
1. **Cards de indicadores** (4 cards coloridos com ícone de fundo):
   - **Total de Veículos** (azul) — com ícone de info.
   - **Clientes Comodato** (vermelho).
   - **Clientes Plataforma** (ciano).
   - **Rastreadores em Estoque** (roxo).
2. **Status de conectividade da frota** (4 gauges circulares em %, cada um clicável → relatório):
   - Veículos Online · Offline até 24h · Offline até 36h · Offline +36h.
3. **Gráfico VENDAS** — colunas por vendedor/consultor, filtro por mês (seletor `MM/AAAA` com os últimos 13 meses); painel recolhível e expansível.
4. **Gráfico ORDENS DE SERVIÇO** — evolução mensal por categoria, com filtros:
   - Técnicos (multi-seleção, com opção "Cadastrar").
   - Estoque (estoques por técnico/região: carro, moto, simples, retiradas, extraviados, revisão etc.).
   - Categorias: Buscar equipamento, Instalação com bloqueio, Instalação simples, Manutenção, Retirada.
   - Períodos: Criação, Agendamento, Finalizado.
   - Status: Aberto, Tarefa iniciada, Serviço iniciado, Não realizado, Finalizado, Cancelado.
5. **Widgets de saúde dos equipamentos** (com filtro "Hoje"):
   - Veículos com excesso de posições.
   - Prováveis equipamentos travados.
   - Veículos com posição antiga (mostra veículo, última posição e última conexão).
6. **Aniversariantes** — clientes aniversariantes (Mês passado / Este mês / Próximo mês), com "Mostrar mais".

### Demais módulos (resumo funcional)
- **Pessoas**: cadastro de clientes/pessoas, usuários de acesso, motoristas, categorias, indicações, cadastros pendentes de aprovação, permissões por grupo, grupos de horário de acesso, agrupamento de pessoas e consulta de crédito (Serasa).
- **Veículos**: cadastro de veículos, painéis de monitoramento em mapa/tempo real, monitoramento de eventos (central), rotas, cercas eletrônicas, alertas, destinatários de notificações, envio de comandos (individual, em massa, pendentes), entradas/saídas (sensores, bloqueio).
- **Equipamentos**: cadastro de rastreadores, vendas de equipamento, estoque, comandos para equipamentos offline, comandos personalizados e transferência entre estoques.
- **Chips**: chips M2M/SIM vinculados aos equipamentos e operadoras.
- **Financeiro**: contas a pagar/receber/recorrentes, bancos, centros de custo, categorias, extrato, fluxo de caixa, resumo, inadimplência, faturamento, auditoria de clientes/veículos sem financeiro.
- **Cobranças**: geração/gestão de cobranças e comissionamento.
- **Contratos**: serviços contratáveis, contratos, termos (comodato, rescisão, uso), pedidos, vencimentos próximos, consultores (vendedores).
- **Nota Fiscal**: emissão e visão geral de NFS-e, serviços de nota, empresas emissoras, relatório de notas faturadas.
- **Atendimentos**: helpdesk com dashboard, tickets, tags, chats, projetos, produtividade por usuário e pesquisa NPS.
- **Ordens de serviço**: OS de instalação/manutenção/retirada, agenda (calendário), categorias e técnicos.
- **Assistência Veicular**: planos de assistência 24h, solicitações, prestadores, serviços, motivos e veículos cobertos.
- **Manutenções**: planos de manutenção preventiva, manutenções registradas e despesas.
- **Videomonitoramento**: câmeras ao vivo e histórico de gravações.
- **Sinistros**: registro de ocorrências (roubo/furto/acidente), tipos e categorias.
- **Vistorias / CheckSystem**: questionários e formulários de checklist/vistoria e suas respostas.
- **Relatórios**: telemetria (km, rotas, paradas, velocidade, cercas, POIs, combustível, sensores, jornada), auditoria (log, comandos, eventos), conectividade (offline 24h/36h/+36h) e comercial (comissão).
- **Anúncios**: comunicados exibidos aos usuários/clientes.
- **Configurações**: canais de notificação (SMS, WhatsApp, E-mail, Push) e histórico de envios.

---

## 5. Paleta de cores

### Estrutura
| Uso | Hex | RGB |
|---|---|---|
| Header (barra superior) | `#2B3643` | 43, 54, 67 |
| Sidebar (fundo) | `#364150` | 54, 65, 80 |
| Item ativo do menu / destaque principal / badges | `#36C6D3` | 54, 198, 211 |
| Texto do menu | `#FFFFFF` | 255, 255, 255 |
| Texto secundário do menu / submenus | `#B4BCC8` | 180, 188, 200 |
| Fundo do conteúdo | `#FFFFFF` | 255, 255, 255 |
| Fundo de painéis/linhas alternadas | `#FAFAFA` | 250, 250, 250 |

### Texto
| Uso | Hex |
|---|---|
| Texto principal | `#333333` |
| Texto secundário | `#555555` |
| Texto neutro | `#666666` |
| Títulos de widget / cinza-azulado | `#606C7D` |
| Texto apagado (muted) | `#82949A` |
| Links | `#337AB7` |

### Cards de indicadores (dashboard)
| Card | Hex |
|---|---|
| Azul (Total de Veículos) | `#3598DC` |
| Vermelho (Clientes Comodato) | `#E7505A` |
| Ciano (Clientes Plataforma) | `#32C5D2` |
| Roxo (Rastreadores em Estoque) | `#8E44AD` |

### Estados e componentes
| Uso | Hex |
|---|---|
| Badge "novo" / perigo | `#ED6B75` |
| Botão info ("Acessar nova versão") | `#659BE0` |
| Barras dos gráficos (amCharts) | `#67B7DC` |
| Gauge "Online" | verde-água (≈ `#26C281`) |
| Gauge "Offline até 24h" | amarelo (≈ `#F1C40F`) |
| Gauges "Offline 36h / +36h" | vermelho (≈ `#E7505A`) |

> Valores marcados com ≈ foram estimados visualmente; os demais foram lidos do CSS computado.

### Tipografia
- Família: `"Open Sans", sans-serif`
- Tamanho base: `14px`
- Títulos de página em peso leve (light), números dos cards grandes e finos.

---

## 6. Convenções úteis para outro projeto
- Rotas legadas seguem o padrão `/<modulo>/<acao>/` (ex.: `/veiculo/list/`, `/financeiro/contas-receber/`); relatórios ficam em `/relatorio/rel-<nome>/`.
- Rotas novas (interface moderna) usam `/new/<modulo-em-ingles>/...` (ex.: `/new/vehicles/alerts`, `/new/settings/notifications/sms`).
- Entidades centrais e relacionamentos:
  - **Pessoa (cliente)** → possui **Veículos** e **Contratos**.
  - **Veículo** → possui **Equipamento (rastreador)** → possui **Chip** (operadora).
  - **Equipamento** → pertence a um **Estoque** (central ou de técnico) até ser instalado via **Ordem de Serviço**.
  - **Contrato** → gera **Contas a receber / Cobranças** → gera **Nota Fiscal**.
  - **Consultor** → recebe **Comissão** sobre vendas/contratos.
- Status de OS: Aberto → Tarefa iniciada → Serviço iniciado → Finalizado (ou Não realizado / Cancelado).
- Conectividade do veículo é classificada em 4 faixas: Online, Offline ≤24h, Offline ≤36h, Offline >36h.
