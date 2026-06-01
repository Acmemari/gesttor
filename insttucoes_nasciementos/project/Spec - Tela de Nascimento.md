# Especificação de Desenvolvimento — Tela de Nascimento
**Sistema:** INTTEGRA Pecuário — Sistema Individual
**Módulo:** Movimentação › Nascimento
**Versão da spec:** 1.0 — 01/06/2026

---

## 1. Conceito central: dupla camada

A tela opera em **duas camadas que nunca se travam entre si**:

- **Camada de Estoque (quantidade):** a *quantidade total* de nascidos é a **âncora**. É o número que sempre concilia e move o saldo do rebanho. Salvar SEMPRE soma a quantidade total ao estoque.
- **Camada Individual (identificação):** o detalhamento animal-a-animal (brinco, categoria, peso etc.) **enriquece** a informação, mas é opcional no momento do lançamento. O que não for identificado vira pendência na **Mesa de Conciliação** — nunca um erro que bloqueia.

> Regra de ouro: **a divergência de identificação não bloqueia o estoque.** O único bloqueio possível seria uma saída maior que o saldo — o que não se aplica a nascimento (que é sempre entrada).

---

## 2. Estrutura da tela

### 2.1 Cabeçalho (campos do lançamento — sempre visíveis)
Distribuídos em duas linhas:

- **Linha 1:** `Safra` · `Data` · `Proprietário`
- **Linha 2:** `Fazenda` · `Retiro` · `Local`

Esses dados valem para o lançamento inteiro (não por animal).

### 2.2 Quantidade total (âncora)
- Campo numérico **obrigatório**: `Quantidade total (cab.)`.
- É a base de verificação de toda a conciliação.

### 2.3 Botão "distribuição vem do ID" (ícone de brinco)
Um botão de alternância (toggle) com ícone de brinco bovino define **dois modos**:

| Modo | Estado | Comportamento |
|------|--------|---------------|
| **Desligado** | distribuição por categoria | O usuário informa as categorias e quantidades manualmente (grid de categorias). |
| **Ligado** | distribuição vem do detalhamento | O grid de categorias fica **bloqueado** e é **preenchido automaticamente** conforme os animais são identificados no "Lançamento Rápido". |

---

## 3. Modo DESLIGADO — distribuição por categoria

- Linha de entrada: `Quantidade` + `Categoria` (lookup) + botão **"+ mais"**.
- Cada clique em "+ mais" adiciona a dupla (categoria + quantidade) a uma **lista editável** abaixo, com total somado no rodapé e ações de **editar/remover**.
- Adicionar a mesma categoria duas vezes **soma** as quantidades.
- A soma das categorias **não pode exceder** a quantidade total (validação ao salvar).
- Categorias declaradas aqui são guardadas como `catDecl` (referência); o que sobrar da quantidade total fica como **"sem categoria (a detalhar)"**.

---

## 4. Modo LIGADO — "Lançamento Rápido" (detalhamento inline)

Bloco com cabeçalho **"Lançamento Rápido"** + ícone de **lápis** (abre a configuração de campos).

### 4.1 Layout em duas linhas
- **Linha superior (repete em todos os lançamentos):** campos cujos valores se mantêm de um animal para o outro (padrão: `Data`, `Raça`, `Lote`) + botão **Sanitário**.
- **Divisória discreta** entre as duas linhas.
- **Linha de lançamento (por animal):** campos preenchidos a cada animal (padrão: `Apelido/ID`, `ID Eletrônica`, `Nº SISBOV`, `Sexo`, `Categoria`, `Porte`, `Colostro?`, `Peso nasc.`, `Pesagem`) + botão **Adicionar**.

### 4.2 Botão "Adicionar"
- Cria uma ficha individual vinculada ao nascimento.
- **Obrigatórios:** `Apelido/ID` e `Categoria`. (Peso NÃO é obrigatório.)
- Não permite ultrapassar a quantidade total.
- A categoria informada **alimenta o grid de categorias** automaticamente (camada individual refinando a camada de estoque).
- Os animais adicionados aparecem numa **tabela** abaixo, com ação de remover.

### 4.3 Numeração automática (Apelido/ID)
- Flag configurável (chip "Nº auto" no campo Apelido/ID dentro da configuração).
- Quando ativa: ao clicar em **Adicionar**, o próximo `Apelido/ID` é sugerido em sequência, **preservando zeros à esquerda e prefixos/sufixos** (ex.: `001` → `002`; `BZ-09` → `BZ-10`).

### 4.4 Sanitário
- Botão recolhível na linha superior. Abre um formulário de aplicações:
  - `Tipo de Aplicação` (Aplicação Única / Protocolo)
  - `Protocolo Sanitário` (habilitado só no modo Protocolo)
  - `Vacina/Medicamento` · `Unidade de Medida` (auto) · `Tipo de Dose` (Fixa/Por Peso) · `Dose` · `Por Cada (X) Kg` · **Adicionar**
  - Tabela de aplicações com **custo por aplicação** e **custo total** somado.

### 4.5 Dados Adicionais
- Botão verde recolhível abaixo da linha de lançamento.
- Campos (padrão): `Nome Completo`, `Peso ao Nascer`, `Grau de Sangue`, `RGN/Tatuagem`, `Pelagem`, `Tipo de Chifre`, `RGD`, `Série Alfa`, `Pai - ID Usual`, `Mãe - ID Usual`, `Observação`.

---

## 5. Configuração de campos (ícone de lápis)

Abre um **modal em formato de tabela**. Permite ao usuário decidir, por campo, onde ele aparece.

### 5.1 Colunas (destinos)
| Coluna | Cor da pílula | Significado |
|--------|---------------|-------------|
| **Linha Superior** | âmbar | Campo repete em todos os lançamentos. |
| **Linha Tabela Lançamento** | verde | Campo preenchido por animal. |
| **Dados Adicionais** | azul | Campo recolhido na seção verde. |
| **Desativado** | vermelho | Campo **não aparece** em nenhum grupo. |

- Cada linha = um campo do sistema. Clicar numa pílula define o destino (aplicação ao vivo).
- Botão **"Restaurar padrão"** e **"Concluir"**.

### 5.2 Casos especiais
- **Apelido/ID:** travado em "Tabela Lançamento" (só permite Tabela ou Desativar). Exibe o chip **"Nº auto"** (numeração automática). É obrigatório.
- **Sanitário:** só permite "Linha Superior" ou "Desativar".
- **Categoria:** obrigatória; aparece no topo da lista junto ao Apelido/ID.

---

## 6. Regras de salvamento (botão Salvar)

1. **Quantidade total é obrigatória** (≥ 1).
2. **Modo DESLIGADO:** soma das categorias declaradas não pode exceder a quantidade total.
3. **Modo LIGADO:** só libera o Salvar quando **a quantidade de animais identificados = quantidade total**. Enquanto faltar, o botão fica desabilitado com indicação do quanto falta.
4. Ao salvar:
   - Gera **um único movimento de nascimento** ancorado na quantidade total (`categoria: null`, `catDecl: [...]` opcional).
   - `naoIdentificados = total − identificados`.
   - `status = 'pendente'` se houver não identificados; `'conciliado'` caso contrário.
   - O estoque é somado **pela quantidade total**, independentemente da identificação.

---

## 7. Derivações (NUNCA campos fixos)

- **Saldo da categoria** = estoque de partida + entradas (contribuição do nascimento) − saídas.
  - A contribuição do nascimento para uma categoria = animais já detalhados naquela categoria + saldo declarado ainda não detalhado.
- **Sem categoria (a detalhar)** = quantidade total do movimento − soma das contribuições por categoria.
- **Estoque total** = agnóstico de categoria (partida + entradas − saídas). A quantidade é a âncora.
- **GMD / curva de peso** = derivado das pesagens (a pesagem de nascimento entra como primeiro ponto).

---

## 8. Integração com a Mesa de Conciliação

- Todo nascimento com `naoIdentificados > 0` gera um **cartão** na Mesa.
- O cartão mostra: "X de N ainda sem identificação".
- Resolver o cartão cria as fichas faltantes / vincula brincos, reduz `naoIdentificados` e, ao zerar, marca `status = 'conciliado'` com responsável e auditoria.
- **A divergência nunca trava o estoque** — só fica pendente na camada individual.

---

## 9. Estados de validação / feedback

- Toast de sucesso ao salvar (verde) com resumo: total somado + quantos foram à Mesa.
- Toast de aviso (laranja) quando houver não identificados.
- Toast crítico (vermelho) apenas para erro real (ex.: quantidade inválida).
- Resumo ao vivo da distribuição: "X de N por categoria · Y a detalhar".

---

## 10. Checklist de aceite

- [ ] Quantidade total é obrigatória e é a âncora do estoque.
- [ ] Toggle do brinco alterna entre grid manual e detalhamento inline.
- [ ] Grid de categorias bloqueia e se autopreenche no modo ID.
- [ ] Lançamento Rápido tem linha superior (repete) e linha por animal.
- [ ] Lápis abre tabela de configuração com 4 destinos incl. Desativado.
- [ ] Apelido/ID travado na Tabela + numeração automática funcional.
- [ ] Sanitário só Superior/Desativado, com cálculo de custo.
- [ ] Dados Adicionais recolhível e configurável.
- [ ] Salvar só libera quando identificados = total (modo ID).
- [ ] Pendências vão para a Mesa; estoque nunca é travado.
- [ ] Saldos por categoria são derivados, nunca digitados.
