# Processo de Gestão de Lotes

**Sistema Pecuário Inttegra · Camada Individual / Dupla Camada de Controle**

Texto de design do produto. Complementa e aprofunda o [artefato-lote-como-entidade](artefato-lote-como-entidade.md): aqui o foco é o **processo** — como o lote nasce, vive, muda de local, muda de nutrição e morre, sem ferir nenhum dos cinco invariantes.

---

## 1. O nó: a definição do lote contém uma contradição em movimento

A definição de trabalho é boa e bate com o campo: *um lote é um grupo de animais submetidos ao mesmo manejo reprodutivo, nutricional ou de local*. O problema é que essa frase descreve o lote pelo seu **estado** num instante — e os três elementos que a compõem **mudam**: o local muda (rodízio, troca de retiro, vai pro confinamento), a nutrição muda (adaptação → terminação, água → suplemento), o protocolo reprodutivo muda (entra em IATF, sai da estação de monta).

Daí o nó. Se o lote **é** o seu manejo atual, então toda troca de dieta ou de pasto cria um lote novo — explosão de lotes, histórico picotado, comparação impossível. Se o lote **nunca** muda independente do manejo, ele perde o sentido de ser uma unidade gerenciada.

A saída é a mesma decisão que já tomamos para o animal — e que sobe um nível aqui: **separar a identidade do lote (por que ele existe) do seu estado de manejo ao longo do tempo (onde está, como está sendo tratado)**. Assim como o "lote atual do animal" é estado derivado do último movimento, o **"manejo atual do lote" (local + nutrição + protocolo) é estado derivado do último evento de manejo** — não um campo fixo, não uma redefinição que parte o lote em dois.

> **Regra-mãe da gestão de lotes:** o lote é identidade estável; manejo é uma **linha do tempo de eventos** sobre essa identidade.

A identidade do lote é a sua **finalidade** (a intenção de manejo: recria a pasto, terminação em confinamento, lote reprodutivo IATF, uniformização de peso). É isso que não muda enquanto o lote viver. Local, nutrição e protocolo são *como* essa finalidade está sendo executada agora — e podem mudar quantas vezes for preciso sem trocar o lote.

---

## 2. Os três controles do lote

Gerir um lote é operar **três controles independentes** sobre uma identidade fixa. Cada controle responde a uma pergunta, muda só por um evento auditável, e tem sempre a **mesma anatomia**: um evento que altera o estado → um estado atual derivado (leitura) → um histórico (a linha do tempo). Nenhum dos três apaga a identidade do lote e nenhum trava o estoque.

| Controle | Pergunta | Evento (única forma de mudar) | Estado atual (derivado) |
|---|---|---|---|
| **1. Composição** | *Quais* animais estão nele? | **Movimento de Alocação** (animal entra / sai / muda de lote) | conjunto de animais + saldo por categoria |
| **2. Localização** | *Onde* ele está? | **Transferência de Lote** (o lote inteiro muda de retiro/pasto/curral) | local atual |
| **3. Regime nutricional** | *Como* ele é alimentado? | **Mudança de Regime** (nova dieta/suplemento entra em vigor) | dieta/suplementação vigente |

A chave do sistema é que os três são **independentes**: trocar a dieta não move o lote, mover o lote não troca os animais, receber animais não muda a dieta. E como os três compartilham a mesma anatomia — **evento → estado atual → histórico** — o sistema inteiro é uma única mecânica aplicada três vezes: simples de construir e de operar. O protocolo reprodutivo, quando entrar, é um **quarto controle** com a mesma anatomia (Fase 4 do roadmap).

### 2.1 Composição — quem está no lote
Já está coberto pela RN-Alocação do artefato anterior: mover N cabeças do Lote A para o Lote B é um movimento quantitativo que ajusta o saldo dos dois lados na hora; os não identificados viram pendência na Mesa, nunca bloqueio. Nada muda aqui.

### 2.2 Local — onde o lote está
Quando o **lote inteiro** muda de lugar (sai do retiro Sede para o retiro Brejo, ou vai pro confinamento), isso é **um** evento de Transferência de Lote — não cinquenta movimentos de animal. O local é estado do lote; o animal **herda** o local do lote em que está. Mover o lote move o local derivado de todos os seus animais de uma vez, e desloca o saldo na dimensão de estoque "retiro/local".

Isso é diferente, e precisa ficar diferente, do animal mudar **entre** lotes (seção 2.1). Um é "o lote andou"; o outro é "o bicho trocou de grupo". Confundir os dois é o erro clássico que enche o sistema de movimentação falsa.

### 2.3 Plano de manejo — como o lote é tratado
Mudança de dieta (adaptação → crescimento → terminação), de suplementação (seca → águas), ou de protocolo reprodutivo (abre estação de monta, faz IATF, encerra estação) é um **Evento de Manejo do Lote**: registra o que entrou em vigor, a partir de qual data, e quem definiu. O plano anterior não é apagado — vira passado na linha do tempo. Assim dá pra responder depois "que dieta esse lote recebeu entre 10/03 e 28/04" e cruzar com o ganho de peso do período.

---

## 3. O estado atual do lote é derivado — você não edita, você movimenta

A ficha do lote mostra, em **leitura**, o estado atual reconstruído a partir dos eventos:

- **Local atual** = última Transferência de Lote.
- **Plano nutricional atual** = último Evento de Manejo (nutricional).
- **Protocolo reprodutivo atual** = último Evento de Manejo (reprodutivo).
- **Saldo de cabeças e composição por categoria** = soma dos Movimentos de Alocação (nunca a contagem da tabela de animais).

Nenhum desses campos é editável solto. Mudar qualquer um deles é **lançar o evento correspondente**. É o mesmo princípio do "lote atual do animal": estado é consequência de movimento, não um valor que alguém digita por cima do anterior e perde a história.

A ficha também mostra a **linha do tempo do lote**: a sequência de transferências, eventos de manejo e entradas/saídas de animais — a biografia do lote, base de toda análise de desempenho mais à frente (GMD por fase de dieta, resposta ao protocolo, etc.).

---

## 4. A pergunta difícil: novo evento no mesmo lote OU lote novo?

Esse é o ponto onde o operador trava. A definição diz "mesmo manejo", então quando o manejo muda, é tentador criar outro lote. O teste para decidir é simples e gira em torno da **finalidade**:

- **Se a mudança executa a MESMA finalidade** → é **evento no mesmo lote**. Exemplo: lote de terminação que passa da dieta de adaptação para a de terminação plena — mesma intenção (engordar pra abate), fases planejadas. Mesmo lote, Evento de Manejo.
- **Se a mudança reflete uma finalidade NOVA para aqueles animais** → os animais **migram para outro lote**. Exemplo: bezerros que estavam num lote de "recria a pasto" agora vão para "confinamento de terminação" — outra intenção, outro regime, outra comparação. Movimento de Alocação para um lote de finalidade diferente.

Regra prática para o time: **"Mudou o jeito de fazer? Evento. Mudou o que se quer fazer? Lote novo."** A finalidade é a cerca da identidade do lote; tudo que cabe dentro dela é evento, o que estoura pra fora é remanejo.

Casos derivados, todos resolvidos com peças que já existem (sem inventar mecanismo novo):

- **Dividir um lote** (parte vira lote uniforme de mais pesados): cria o lote novo + Movimento de Alocação da parcela. O lote de origem continua o mesmo.
- **Juntar dois lotes**: Movimento de Alocação de todos para o lote destino + **encerrar** o lote que esvaziou (não deletar — o histórico fica consultável).
- **Lote que termina o ciclo** (todos vendidos/abatidos): saídas por Movimento de Alocação/venda zeram o saldo; o gerente **encerra** o lote. Encerrado some das listas operacionais e permanece na consulta histórica.

---

## 5. Convivência com os invariantes

Tudo acima nasce quantitativo e respeita a Dupla Camada:

- **Não trava o estoque.** Transferir o lote ou trocar a dieta move/registra na hora, mesmo que nem todos os brincos estejam conferidos. Identificação incompleta vira pendência na Mesa de Conciliação, nunca bloqueio. *(Fundamento 3.)*
- **"Não identificado" é normal.** Um lote pode ter cabeças sem ficha individual; o saldo quantitativo do lote continua íntegro mesmo assim.
- **ID interno é a chave.** O lote tem ID interno imutável; nome/código do lote e brinco do animal são atributos. Renomear o lote não mexe na identidade nem no histórico.
- **Estoque é soma de movimentos.** O saldo do lote (e por local, e por categoria) é sempre a soma dos movimentos — nunca um campo "quantidade" gravado na ficha do lote.
- **Divergência vai pra Mesa, não pro bloqueio.** Inventário do lote que não bate, transferência com brincos faltando, animal que aparece em lote errado: tudo vira cartão de conciliação, resolvido de forma assíncrona no escritório, com responsável e justificativa.

Único caso de bloqueio (exige autorização): destino inexistente, lote já encerrado como destino, ou animal já vendido/morto sendo movimentado — erro crítico, igual à RN-Alocação.

---

## 6. Modelo de dados (incremento conceitual)

Sobre o modelo do artefato anterior, somam-se duas entidades de evento e o estado derivado de manejo:

| Entidade | Responsabilidade | Completude |
|---|---|---|
| **Lote** | ID interno, nome/código, **finalidade** (identidade), sistema produtivo, status (ativo/encerrado), datas de abertura/encerramento | Sempre íntegra |
| **Transferência de Lote** | tipo de local (retiro/pasto/setor/confinamento), local origem, local destino, data, responsável | Sempre completa |
| **Evento de Manejo do Lote** | dimensão (nutricional / reprodutivo), descrição do plano (dieta, suplemento, protocolo), data de início, responsável | Sempre completa |
| **Movimento de Alocação** | (já existe) entrada/mudança/saída de animais, lote origem/destino, qtde, data, responsável | Sempre completo |
| **Estoque por Lote/Local** | saldo por dimensões (fazenda, retiro/local, lote, categoria, sexo, raça) | Sempre íntegro — soma dos movimentos |

```
LOTE (identidade = finalidade)
  ├─ Transferência de Lote (evento)      → "local atual do lote"      (DERIVADO, leitura)
  ├─ Evento de Manejo do Lote (evento)   → "plano/protocolo atual"    (DERIVADO, leitura)
  └─ Movimento de Alocação (evento) ──N:N── Vínculo ── ANIMAL
        └─ move saldo em → Estoque por Lote/Local (soma dos movimentos)

"local atual do animal" = local atual do LOTE em que ele está  (DERIVADO)
```

Regras de ouro reforçadas: o lote atual do animal e o local atual do lote são **derivados** do último evento; nunca somar a tabela de animais para apurar saldo; chave é sempre o ID interno (do lote e do animal).

---

## 7. Fluxo de tela (não bloqueante, 3 passos)

O padrão é o mesmo da camada individual: rápido no curral, rico depois, conciliado no escritório.

1. **Lançamento rápido (campo).** O operador escolhe o lote e a ação — *mover o lote* (aponta o local destino), *trocar o manejo* (escolhe nova dieta/protocolo), ou *remanejar animais* (lote destino + quantidade/escaneamento). Data e responsável automáticos. Confirma e segue.
2. **Enriquecimento individual (quando há tempo/sinal).** Associa os brincos/IDs específicos quando o evento envolve animais nomeados (remanejo). Não identificados ficam como pendência.
3. **Mesa de Conciliação (escritório).** Transferências e remanejos com identificação incompleta, inventários de lote que não fecham e divergências de local/manejo aparecem como cartões. O gerente vincula retroativamente, confirma "sem brinco" ou deixa pendente — sempre com auditoria.

---

## 8. Fronteiras conhecidas (deixar explícito, decidir depois)

- **Lote ocupando mais de um local ao mesmo tempo** (pastejo rotacionado, lote dividido em piquetes da mesma área): por ora, rotação dentro da mesma área de manejo **não é** Transferência de Lote — só vira evento quando muda o retiro/setor de fato. Se dois grupos passam a ser tratados diferente, são dois lotes. Modelar "local multivalorado" fica para depois, se o campo exigir.
- **Nutrição e protocolo como entidades de catálogo** (planos reutilizáveis com custo, ingredientes, etc.): no momento o plano é texto/atributo dentro do Evento de Manejo. Virar catálogo estruturado é evolução natural quando entrarmos em custos e eficiência alimentar (Fase 3 do roadmap).

---

## 9. Checklist de invariantes (verificado)

- [x] Não trava o estoque — transferir lote / trocar manejo registra na hora.
- [x] "Não identificado" tratado como estado normal — vira pendência, não erro.
- [x] ID interno como chave (lote e animal); nome e brinco são atributos.
- [x] Divergência vai para a Mesa de Conciliação, não para bloqueio.
- [x] Saldo é soma dos movimentos — nunca campo fixo na ficha do lote.
- [x] Local e manejo atuais do lote são **derivados** do último evento, nunca editáveis soltos.
- [x] Identidade do lote = finalidade; muda o "como" → evento, muda o "o quê" → lote novo.
- [x] Coerente com artefato-lote-como-entidade e com os 10 fundamentos da Dupla Camada.
