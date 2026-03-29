Quero melhorar a qualidade do meu RAG para consulta de livros já indexados no banco. Hoje a aplicação já faz upload dos livros, gera embeddings com Voyage e consulta os chunks armazenados no Postgres + pgvector, mas em vários casos a IA não encontra informações que realmente estão no livro.
Objetivo da melhoria
Implementar uma camada de reranking com Voyage entre a busca vetorial e a geração da resposta final, para aumentar a precisão da recuperação de contexto.
Hoje o pipeline atual é algo próximo de:
pergunta do usuário
→ embedding da pergunta
→ busca no pgvector
→ retorno dos top chunks
→ envio direto desses chunks para o modelo de resposta
Quero alterar para este fluxo:
pergunta do usuário
→ embedding da pergunta
→ busca inicial no pgvector com mais candidatos
→ reranking desses candidatos usando Voyage Reranker
→ seleção dos melhores chunks
→ montagem do contexto final
→ envio ao modelo de resposta
________________________________________
Requisitos funcionais
1. Busca inicial no pgvector
A busca vetorial inicial não deve mais retornar apenas 5 ou 6 chunks finais.
Ela deve retornar um conjunto maior de candidatos para o reranker trabalhar.
Regra
•	buscar inicialmente entre 20 e 30 chunks 
•	valor inicial recomendado: 30 
•	esse número deve ficar configurável em constante ou configuração do backend 
Observação
A busca inicial deve manter junto os metadados de cada chunk, por exemplo:
•	id 
•	content ou text 
•	page 
•	chapter 
•	section 
•	book_id 
•	title 
•	chunk_index 
•	outros campos existentes 
O reranker vai receber apenas os textos, mas depois precisaremos remontar os metadados originais com base no índice retornado.
________________________________________
2. Implementar reranking com Voyage
Após a busca inicial no pgvector, quero chamar a API de reranking da Voyage para reordenar os chunks encontrados com base na pergunta original do usuário.
Requisitos da chamada
Criar uma função dedicada no backend, algo como:
•	rerankChunks(query, chunks, topK)
ou nome equivalente 
Essa função deve:
1.	receber a pergunta original do usuário 
2.	receber a lista de chunks retornados pela busca vetorial 
3.	chamar a API da Voyage Reranker 
4.	retornar os chunks ordenados por relevância 
5.	preservar metadados do chunk original 
6.	expor também o score de reranking 
Comportamento esperado
•	usar a pergunta original do usuário como query 
•	usar os textos dos chunks como documents 
•	pedir ao reranker para retornar apenas os melhores resultados 
•	valor inicial recomendado de saída do reranker: 5 chunks 
•	isso também deve ficar configurável 
Configuração inicial sugerida
•	initialRetrievalLimit = 30 
•	rerankTopK = 5 
________________________________________
3. Estrutura de código
Quero uma implementação organizada, limpa e fácil de manter.
Criar ou adaptar funções separadas para:
1.	gerar embedding da pergunta 
2.	buscar chunks no pgvector 
3.	reranquear os chunks 
4.	expandir contexto com chunks vizinhos 
5.	montar o contexto final 
6.	chamar o modelo de resposta 
Não quero tudo misturado em uma única função grande.
________________________________________
4. Preservar metadados
A resposta do reranker normalmente devolve índice e score.
Precisamos usar esse índice para mapear de volta ao chunk original retornado pelo banco.
Quero que cada chunk final contenha:
•	id 
•	content 
•	page 
•	chapter 
•	section 
•	book_id 
•	chunk_index 
•	vectorScore se existir 
•	rerankScore 
________________________________________
5. Expansão de contexto com chunks vizinhos
Depois que os melhores chunks forem reranqueados, quero melhorar ainda mais a qualidade do contexto incluindo chunks vizinhos quando fizer sentido.
Regra desejada
Para cada chunk selecionado pelo reranker:
•	tentar buscar o chunk anterior 
•	tentar buscar o chunk seguinte 
Isso deve acontecer com base em algo como:
•	mesmo book_id 
•	chunk_index - 1 
•	chunk_index + 1 
Objetivo
Evitar respostas cortadas quando a informação está dividida entre chunks contíguos.
Regras importantes
•	não duplicar chunks 
•	manter a ordem correta do texto 
•	se o chunk vizinho não existir, ignorar sem erro 
•	essa expansão deve ser opcional e configurável com flag tipo: 
o	expandNeighbors = true 
________________________________________
6. Montagem do contexto final
Depois do reranking e da expansão opcional, montar um contexto final limpo para enviar ao modelo de resposta.
Requisitos
Cada bloco do contexto deve trazer:
•	título ou identificação do trecho 
•	conteúdo do chunk 
•	metadados quando disponíveis, por exemplo: 
o	livro 
o	capítulo 
o	seção 
o	página 
Exemplo de formato esperado
[Livro: Nome do Livro | Capítulo: X | Página: 37 | Chunk: 128]
texto do trecho...

[Livro: Nome do Livro | Capítulo: X | Página: 38 | Chunk: 129]
texto do trecho...
Regras
•	limitar a quantidade total de texto enviada ao modelo final 
•	evitar duplicatas 
•	preservar ordem lógica 
•	priorizar os chunks reranqueados e seus vizinhos 
________________________________________
7. Prompt da resposta final
Quero reforçar o comportamento do modelo final para responder com base no contexto recuperado.
Ajustar o prompt final para:
•	responder usando apenas o contexto recuperado 
•	não inventar informações 
•	se não encontrar evidência suficiente, dizer isso claramente 
•	citar página, capítulo ou seção quando disponível 
•	responder em linguagem natural e clara 
Exemplo de instrução no prompt
Algo equivalente a:
Responda usando apenas o contexto fornecido.
Se a resposta não estiver claramente presente no contexto, diga que não encontrou evidência suficiente no material consultado.
Sempre cite página, capítulo ou seção quando esses metadados estiverem disponíveis.
________________________________________
Requisitos técnicos
8. Variáveis de ambiente
Verificar se a aplicação já possui VOYAGE_API_KEY.
Se não existir, preparar o uso correto via ambiente.
Regras
•	nunca hardcodar chave 
•	usar process.env.VOYAGE_API_KEY 
•	validar existência da chave 
•	se a chave não existir, registrar erro claro no backend 
________________________________________
9. Criar serviço dedicado para Voyage
Quero uma camada de serviço para integração com Voyage, algo como:
•	services/voyage.ts 
•	lib/voyage.ts 
•	ou padrão equivalente do projeto 
Esse serviço deve conter:
•	função para embedding, se já existir manter ou melhorar 
•	nova função para rerank 
•	tipagem clara 
•	tratamento de erro 
•	logs úteis 
________________________________________
10. Tratamento de erro
Implementar fallback seguro.
Se o reranker falhar:
o sistema não deve quebrar a resposta inteira.
Fallback esperado
Se houver falha no reranking:
•	registrar erro no log 
•	seguir com os resultados da busca vetorial original 
•	ainda assim responder ao usuário 
Importante
O reranker melhora qualidade, mas não pode tornar o sistema frágil.
________________________________________
11. Logs e observabilidade
Quero logs suficientes para depuração.
Registrar:
•	pergunta recebida 
•	quantidade de chunks retornados pela busca vetorial 
•	quantidade enviada ao reranker 
•	quantidade retornada pelo reranker 
•	ids dos chunks finais selecionados 
•	score de reranking dos chunks finais 
•	tempo aproximado de cada etapa, se possível 
Importante
Não logar conteúdo sensível desnecessariamente em produção.
Se houver modo dev, pode logar mais detalhes.
________________________________________
12. Configurações centralizadas
Criar constantes configuráveis, por exemplo:
const INITIAL_RETRIEVAL_LIMIT = 30
const RERANK_TOP_K = 5
const EXPAND_NEIGHBORS = true
const MAX_CONTEXT_CHUNKS = 8
Esses valores não devem ficar espalhados pelo código.
________________________________________
Sugestão de arquitetura
Quero que a implementação siga uma estrutura parecida com esta:
user question
→ embedQuery()
→ searchVectorChunks()
→ rerankChunks()
→ expandNeighborChunks()
→ buildFinalContext()
→ generateAnswer()
________________________________________
Tipos sugeridos
Criar tipagens explícitas, algo nessa linha:
type RetrievedChunk = {
  id: string
  content: string
  bookId?: string
  title?: string
  chapter?: string
  section?: string
  page?: number
  chunkIndex?: number
  vectorScore?: number
}

type RerankedChunk = RetrievedChunk & {
  rerankScore: number
}

type RetrievalPipelineResult = {
  initialCount: number
  rerankedCount: number
  finalCount: number
  chunks: RerankedChunk[]
  context: string
}
Adaptar aos nomes reais do projeto.
________________________________________
Fluxo detalhado esperado
Etapa 1 — embedding da pergunta
Usar a função já existente de embedding da query.
Etapa 2 — busca vetorial
Buscar no pgvector os 30 chunks mais próximos.
Etapa 3 — reranking
Enviar para Voyage:
•	query original do usuário 
•	lista dos textos dos 30 chunks 
Receber os melhores 5 e reconstruir a lista com metadados originais.
Etapa 4 — expansão opcional
Buscar chunk anterior e posterior de cada chunk vencedor.
Etapa 5 — deduplicação
Remover duplicados por id.
Etapa 6 — ordenação final
Ordenar os chunks finais de forma coerente para leitura:
•	preferencialmente por livro e chunk_index 
•	ou outra lógica consistente 
Etapa 7 — montagem do contexto
Gerar uma string final de contexto bem formatada.
Etapa 8 — geração da resposta
Enviar esse contexto ao modelo de resposta com prompt reforçado.
________________________________________
Requisitos de implementação no banco
Se a tabela de chunks já existir, reutilizar.
Se necessário, verificar se os campos abaixo existem ou equivalentes:
•	id 
•	book_id 
•	content 
•	embedding 
•	page 
•	chapter 
•	section 
•	chunk_index 
Se algum campo importante para expansão de vizinhos não existir, identificar a lacuna e propor a menor mudança necessária.
________________________________________
Requisitos de qualidade
Quero que o código entregue:
•	seja limpo 
•	modular 
•	tipado 
•	sem duplicação desnecessária 
•	com nomes claros 
•	preparado para manutenção futura 
Também quero que o agente:
1.	localize onde hoje ocorre a busca RAG 
2.	identifique a função atual de recuperação de chunks 
3.	implemente a nova pipeline com o menor impacto possível no restante do sistema 
4.	preserve compatibilidade com o fluxo atual 
5.	evite quebrar telas, rotas ou contratos existentes 
________________________________________
Entregáveis esperados
Ao final, quero que você:
1.	implemente a nova pipeline de recuperação com reranker 
2.	mostre claramente quais arquivos foram criados ou alterados 
3.	explique o fluxo final 
4.	destaque qualquer dependência adicional, se existir 
5.	informe como testar 
6.	informe como ajustar os parâmetros principais 
________________________________________
Testes desejados
Quero testes manuais e, se fizer sentido, testes automatizados.
Testes manuais mínimos
1.	fazer uma pergunta cuja resposta esteja claramente em um livro 
2.	comparar resultado com e sem reranker 
3.	validar que chunks mais relevantes passaram a ser escolhidos 
4.	validar que o sistema continua funcionando se o reranker falhar 
5.	validar que metadados como página/capítulo continuam aparecendo 
Se houver testes automatizados
Criar pelo menos testes para:
•	mapeamento correto do índice retornado pelo reranker para o chunk original 
•	fallback em caso de falha da API 
•	deduplicação de chunks vizinhos 
•	montagem do contexto final 
________________________________________
Implementação desejada
Pode implementar usando a abordagem mais compatível com o stack atual do projeto.
Se já existir cliente HTTP padrão no projeto, reutilizar.
Se já existir pasta de services/lib para integrações externas, seguir o padrão existente.
________________________________________
Importante
Antes de codar:
1.	analise o fluxo atual de RAG no projeto 
2.	localize o ponto exato onde o pgvector é consultado 
3.	identifique o melhor ponto de inserção do reranker 
4.	só depois implemente 
Se encontrar alguma inconsistência estrutural que impeça uma boa implementação, me informe e proponha a correção mínima necessária.
________________________________________
Se quiser uma versão ainda mais objetiva para colar no agente
Analise o pipeline atual de RAG da aplicação e implemente uma camada de reranking com Voyage entre a busca no pgvector e a geração da resposta final.

Objetivo:
- melhorar a recuperação de trechos dos livros já indexados
- aumentar precisão do contexto enviado ao modelo final

Requisitos:
- busca inicial no pgvector com 30 chunks
- reranking com Voyage usando a pergunta original e os 30 chunks recuperados
- retornar os 5 melhores chunks reranqueados
- preservar metadados originais dos chunks
- incluir rerankScore
- implementar fallback para busca vetorial original se a API de rerank falhar
- expandir contexto com chunk anterior e posterior quando possível
- deduplicar chunks
- ordenar chunks finais de forma coerente
- montar contexto final com livro/capítulo/página/chunk
- reforçar prompt final para responder apenas com base no contexto
- manter código modular, tipado e limpo
- criar logs úteis













INSTRUÇÃO TÉCNICA – IMPLEMENTAÇÃO DE RERANKER (VOYAGE) NO RAG
🎯 CONTEXTO
A aplicação já possui:
•	Upload de livros 
•	Processamento em chunks 
•	Embeddings com Voyage 
•	Armazenamento em Postgres + pgvector 
•	Consulta vetorial funcionando 
•	Modelo de resposta (Claude) 
Problema atual
O sistema não encontra informações que existem nos livros, indicando problema de recuperação (retrieval) e não de geração.
________________________________________
🎯 OBJETIVO
Implementar uma pipeline de recuperação avançada com:
•	aumento de recall 
•	reranking com Voyage 
•	expansão de contexto 
•	montagem robusta de contexto 
•	resposta com estilo definido 
________________________________________
🧱 ARQUITETURA FINAL ESPERADA
User Query
  ↓
Query Rewriting (opcional - fase 2)
  ↓
Embedding (Voyage)
  ↓
Vector Search (pgvector, top 30)
  ↓
Voyage Reranker (top 5)
  ↓
Context Expansion (neighbors)
  ↓
Deduplication + Ordering
  ↓
Context Builder
  ↓
LLM (Claude)
  ↓
Resposta final (com estilo definido)
________________________________________
⚙️ CONFIGURAÇÕES GLOBAIS (CRIAR CONSTANTS)
Criar arquivo:
// src/config/rag.ts
export const RAG_CONFIG = {
  INITIAL_RETRIEVAL_LIMIT: 30,
  RERANK_TOP_K: 5,
  MAX_CONTEXT_CHUNKS: 8,
  EXPAND_NEIGHBORS: true,
  MAX_CONTEXT_LENGTH: 12000,
}
________________________________________
🧩 TIPOS (OBRIGATÓRIO)
Criar:
// src/types/rag.ts

export type RetrievedChunk = {
  id: string
  content: string
  bookId: string
  title?: string
  chapter?: string
  section?: string
  page?: number
  chunkIndex: number
  vectorScore?: number
}

export type RerankedChunk = RetrievedChunk & {
  rerankScore: number
}

export type RetrievalResult = {
  initialCount: number
  rerankedCount: number
  finalCount: number
  chunks: RerankedChunk[]
  context: string
}
________________________________________
🧠 ETAPA 1 — VECTOR SEARCH (PGVECTOR)
Requisito
Alterar função existente de busca para:
•	retornar 30 chunks 
•	incluir metadados completos 
SQL esperado
SELECT
  id,
  content,
  book_id,
  chapter,
  section,
  page,
  chunk_index,
  embedding <=> $1 AS distance
FROM book_chunks
ORDER BY embedding <=> $1
LIMIT $2
Observações
•	usar operador <=> (cosine distance) 
•	retornar distance como vectorScore 
•	mapear para RetrievedChunk 
________________________________________
🚀 ETAPA 2 — RERANKER (VOYAGE)
Criar serviço dedicado
// src/services/voyage.ts
Função obrigatória
export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  topK: number
): Promise<RerankedChunk[]>
________________________________________
Implementação
export async function rerankChunks(query, chunks, topK) {
  try {
    const response = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "rerank-2.5",
        query,
        documents: chunks.map(c => c.content),
        top_k: topK,
      }),
    })

    if (!response.ok) {
      throw new Error("Rerank failed")
    }

    const json = await response.json()
    const results = json.results || json.data || []

    return results.map(r => ({
      ...chunks[r.index],
      rerankScore: r.relevance_score,
    }))

  } catch (error) {
    console.error("Reranker error:", error)

    // fallback seguro
    return chunks.slice(0, topK).map(c => ({
      ...c,
      rerankScore: 0,
    }))
  }
}
________________________________________
🔄 ETAPA 3 — CONTEXT EXPANSION
Criar função
export async function expandNeighborChunks(
  chunks: RerankedChunk[]
): Promise<RerankedChunk[]>
Lógica
Para cada chunk:
•	buscar: 
o	chunkIndex - 1 
o	chunkIndex + 1 
•	dentro do mesmo bookId 
SQL exemplo
SELECT *
FROM book_chunks
WHERE book_id = $1
AND chunk_index IN ($2, $3)
________________________________________
Regras
•	não duplicar chunks 
•	manter ordem 
•	ignorar se não existir 
________________________________________
🧹 ETAPA 4 — DEDUP + ORDER
Deduplicação
const unique = new Map()

chunks.forEach(c => {
  unique.set(c.id, c)
})

const deduped = Array.from(unique.values())
________________________________________
Ordenação
Ordenar por:
bookId → chunkIndex
________________________________________
🧱 ETAPA 5 — CONTEXT BUILDER
Criar função
export function buildContext(chunks: RerankedChunk[]): string
Formato
[Livro: X | Capítulo: Y | Página: Z]

conteúdo do chunk...
Regras
•	máximo ~12k chars 
•	cortar excesso 
•	manter legível 
•	preservar ordem 
ETAPA 6 — DEDUPLICAÇÃO E NORMALIZAÇÃO DOS CHUNKS
Após o rerank + expansão de vizinhos, você terá uma lista com possíveis duplicações e sobreposição de contexto.
Objetivo
Garantir que o conjunto final:
•	não tenha duplicatas 
•	não tenha chunks redundantes 
•	preserve diversidade de informação 
________________________________________
Implementação
Regra de deduplicação
Usar chunk.id como chave primária
function dedupeChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>()
  return chunks.filter(chunk => {
    if (seen.has(chunk.id)) return false
    seen.add(chunk.id)
    return true
  })
}
________________________________________
Regra adicional (opcional, mas recomendada)
Evitar chunks muito parecidos semanticamente
👉 abordagem simples:
•	se dois chunks têm o mesmo chunk_index → manter apenas um 
•	se diferença de índice for 1 e ambos vieram como vizinho → manter só um 
________________________________________
Saída esperada
Lista limpa, sem duplicações, pronta para ordenação
________________________________________
ETAPA 7 — ORDENAÇÃO FINAL DOS CHUNKS
Agora precisamos organizar os chunks de forma que o contexto faça sentido para leitura.
Objetivo
Evitar resposta “quebrada” ou fora de ordem lógica.
________________________________________
Estratégia de ordenação
Ordem recomendada
1.	book_id 
2.	chapter (se existir) 
3.	chunk_index 
________________________________________
Implementação
function sortChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return chunks.sort((a, b) => {
    if (a.bookId !== b.bookId) return a.bookId.localeCompare(b.bookId)

    if ((a.chapter || "") !== (b.chapter || "")) {
      return (a.chapter || "").localeCompare(b.chapter || "")
    }

    return (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0)
  })
}
________________________________________
Observação importante
👉 O rerank define relevância
👉 A ordenação define legibilidade
Nunca use só score para ordenar o contexto final.
________________________________________
ETAPA 8 — LIMITAÇÃO DO CONTEXTO (CRÍTICO)
Você precisa evitar mandar contexto demais para o modelo.
Problema
•	contexto muito grande → pior resposta 
•	custo maior 
•	perda de foco 
________________________________________
Regra recomendada
const MAX_CONTEXT_CHUNKS = 6
Estratégia
•	priorizar chunks com maior rerankScore 
•	depois incluir vizinhos (se ainda houver espaço) 
________________________________________
Implementação
function limitChunks(chunks: RerankedChunk[]): RerankedChunk[] {
  return chunks
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, MAX_CONTEXT_CHUNKS)
}
________________________________________
ETAPA 9 — BUILD DO CONTEXTO FINAL
Agora vamos transformar os chunks em texto estruturado para o LLM.
Objetivo
•	deixar o contexto claro 
•	fácil de interpretar 
•	rastreável 
________________________________________
Formato recomendado
function buildContext(chunks: RetrievedChunk[]): string {
  return chunks.map((chunk, i) => {
    return `
[Trecho ${i + 1}]
Livro: ${chunk.bookId ?? "N/A"}
Capítulo: ${chunk.chapter ?? "N/A"}
Página: ${chunk.page ?? "N/A"}

${chunk.content}
`
  }).join("\n\n")
}
________________________________________
Boas práticas
•	não misturar chunks sem separador 
•	sempre identificar origem 
•	manter estrutura consistente 
________________________________________
ETAPA 10 — PROMPT FINAL (AJUSTADO AO SEU ESTILO)
Aqui entra um ponto importante que pouca gente faz bem:
👉 o estilo da resposta
Você pediu:
•	educado 
•	leve 
•	mais informal 
•	direto 
________________________________________
Prompt recomendado
function buildPrompt(query: string, context: string): string {
  return `
Você é um assistente que responde perguntas com base em conteúdos de livros.

Regras importantes:
- Responda de forma clara, direta e útil
- Use um tom leve, educado e mais informal (sem ser superficial)
- Evite linguagem excessivamente técnica ou acadêmica
- Escreva como alguém experiente explicando de forma simples
- Vá direto ao ponto, sem enrolação

Uso do conteúdo:
- Use apenas as informações presentes no contexto abaixo
- Não invente informações
- Se não encontrar resposta suficiente, diga isso claramente

Referências:
- Sempre que possível, cite página, capítulo ou trecho

PERGUNTA:
${query}

CONTEXTO:
${context}
`
}
________________________________________
ETAPA 11 — GERAÇÃO DA RESPOSTA
Aqui você usa seu modelo atual (Claude).
________________________________________
Requisitos
•	temperatura baixa (0.2–0.4) 
•	foco em precisão 
•	evitar criatividade excessiva 
________________________________________
Exemplo
async function generateAnswer(query: string, context: string) {
  const prompt = buildPrompt(query, context)

  return await callClaude({
    prompt,
    temperature: 0.3,
    maxTokens: 800
  })
}
________________________________________
ETAPA 12 — PIPELINE FINAL COMPLETO
Agora juntando tudo:
async function answerQuestion(query: string) {
  // 1. embedding
  const embedding = await embedQuery(query)

  // 2. busca vetorial
  const initialChunks = await searchPgVector(embedding, 30)

  // 3. rerank
  const reranked = await rerankChunks(query, initialChunks, 5)

  // 4. expandir vizinhos
  const expanded = await expandNeighbors(reranked)

  // 5. dedupe
  const deduped = dedupeChunks(expanded)

  // 6. limitar
  const limited = limitChunks(deduped)

  // 7. ordenar
  const sorted = sortChunks(limited)

  // 8. contexto
  const context = buildContext(sorted)

  // 9. resposta final
  return await generateAnswer(query, context)
}
________________________________________
ETAPA 13 — LOGS (IMPORTANTE PRA VOCÊ)
Você vai querer visibilidade disso rodando.
________________________________________
Log recomendado
console.log({
  query,
  initialChunks: initialChunks.length,
  rerankedChunks: reranked.length,
  finalChunks: sorted.length,
  topChunkIds: sorted.map(c => c.id),
})
________________________________________
ETAPA 14 — FALLBACK (ROBUSTEZ)
Se o reranker falhar:
let reranked

try {
  reranked = await rerankChunks(query, initialChunks, 5)
} catch (error) {
  console.error("Erro no reranker:", error)
  reranked = initialChunks.slice(0, 5)
}
________________________________________
ETAPA 15 — CRITÉRIO DE SUCESSO
Você vai saber que funcionou quando:
✅ perguntas antes “não encontradas” passam a funcionar
✅ respostas mais específicas
✅ menos “alucinação”
✅ trechos mais coerentes
✅ menos resposta genérica
________________________________________
RESUMO FINAL (bem direto)
O que você está adicionando aqui é:
👉 um filtro inteligente entre busca e resposta
Antes:
pgvector decide tudo
Depois:
pgvector traz candidatos
Voyage decide os melhores
Claude responde



