curl -fsSL https://opencode.ai/install | bash# Correção do Roteamento Better Auth na Vercel

Este documento detalha o problema atual de autenticação no ambiente de produção (Vercel) e fornece instruções precisas para a IA do Antigravity (Cursor) implementar a correção.

## 1. O Problema: "Credenciais Inválidas" (Erro 404)

No ambiente de produção (gesttor.app), as tentativas de login estão falhando com a mensagem genérica "Credenciais inválidas". No entanto, a análise do console do navegador revela que a requisição real falha com status **404 (Not Found)** na rota `/api/auth/sign-in/email`.

### Causa Raiz: Limitação Arquitetural da Vercel
O projeto utiliza a estrutura de *Serverless Functions* nativa da Vercel (pasta `/api`), onde o arquivo `api/auth/[...all].ts` atua como um *catch-all* para delegar as rotas ao handler do Better Auth.

Contudo, fora do ecossistema Next.js, **arquivos nomeados com `[...param].ts` na Vercel capturam apenas um único segmento de rota** [1]. 

| Rota Solicitada | Comportamento do Vercel | Resultado |
| :--- | :--- | :--- |
| `/api/auth/ok` | Capturado (1 segmento) | 200 OK |
| `/api/auth/sign-in/email` | **Ignorado** (2 segmentos) | **404 Vercel Edge** |

Como o Better Auth depende de sub-rotas aninhadas, a Vercel descarta essas requisições antes mesmo de chegarem ao seu código. O histórico de commits mostra que houve uma tentativa recente de corrigir isso com um *rewrite* (`482c288`), mas foi revertido por supostamente "corromper o body" da requisição.

---

## 2. Instruções para o Antigravity (Cursor)

> **Recomendação de LLM:** Utilize o **Claude 3.5 Sonnet** (ou superior) no Antigravity. O Sonnet é excepcionalmente bom para configurações de infraestrutura e roteamento complexo. O GPT-4o também é uma excelente alternativa.

Copie e cole o prompt abaixo diretamente no chat do seu Antigravity:

***

**Prompt para o Antigravity:**

```text
Por favor, analise e corrija o problema de roteamento do Better Auth na Vercel no nosso projeto.

Contexto:
Atualmente, requisições com múltiplos segmentos como `/api/auth/sign-in/email` estão retornando 404 em produção porque a Vercel (fora do Next.js) não suporta catch-all (`[...all].ts`) para múltiplos níveis de diretório em Serverless Functions.

Precisamos implementar um rewrite explícito no `vercel.json` para forçar todas as rotas `/api/auth/*` a passarem pelo nosso handler `api/auth/catchAll.ts`.

Por favor, faça as seguintes alterações:

1. Edite o arquivo `vercel.json` na raiz do projeto.
2. Na seção "rewrites", adicione uma regra ESPECÍFICA para a API ANTES da regra de fallback do SPA.
3. A regra deve direcionar `/api/auth/(.*)` para `/api/auth/catchAll`.

O arquivo `vercel.json` deve ficar exatamente assim (mantenha as outras configurações intactas):

{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/api/auth/(.*)", "destination": "/api/auth/catchAll" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}

Nota sobre o "body corrompido": Em tentativas anteriores, um rewrite similar foi feito e revertido porque o body da requisição estaria sendo descartado. Se você identificar que o rewrite da Vercel perde o payload do POST ao redirecionar para o catchAll.ts, por favor, sugira uma adaptação no `catchAll.ts` para ler o body cru corretamente usando `req.read()` ou `req.on('data')` se necessário, mas primeiro aplique o rewrite acima.
```

***

## 3. Próximos Passos após a Execução

1. Após o Antigravity fazer a alteração, faça o commit e o push para o GitHub.
2. A Vercel fará o deploy automaticamente.
3. Teste o login novamente no `gesttor.app`.
4. Se o login funcionar, o problema está resolvido. Se retornar erro 500 ou "body missing", significa que o rewrite funcionou (não é mais 404), mas precisamos ajustar a forma como o `catchAll.ts` lê o corpo da requisição redirecionada.

---

### Referências
[1] Vercel GitHub Discussions: Nested serverless functions #8343. Disponível em: https://github.com/vercel/vercel/discussions/8343
