# Configuração de Recuperação de Senha

Este guia explica como configurar o fluxo completo de recuperação de senha no Supabase.

## Arquivos Criados

- `components/ForgotPasswordPage.tsx` - Página para solicitar reset de senha
- `components/ResetPasswordPage.tsx` - Página para redefinir senha com token
- `lib/email-templates/reset-password.html` - Template HTML do email
- Funções no `contexts/AuthContext.tsx`:
  - `resetPassword(email)` - Envia email de recuperação
  - `updatePassword(newPassword)` - Atualiza senha com token

## Configuração no Supabase Dashboard

## Variáveis de Ambiente da Aplicação

Em produção, configure no deploy:

- `APP_PUBLIC_URL=https://gesttor.app`
- `BETTER_AUTH_URL=https://gesttor.app` (se usar essa variável no ambiente)

O fluxo de recuperação usa `APP_PUBLIC_URL` como domínio canônico do link enviado por email. URLs de preview da Vercel podem continuar válidas para testes, mas não devem ser o link principal do usuário final.

### 1. Configurar URL de Redirecionamento

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Authentication** > **URL Configuration**
4. Adicione as seguintes URLs em **Redirect URLs**:
   - `http://localhost:3000/reset-password` (desenvolvimento)
   - `https://seu-dominio.com/reset-password` (produção)
   - `http://localhost:3000/**` (wildcard para desenvolvimento)
   - `https://seu-dominio.com/**` (wildcard para produção)

### 2. Configurar Template de Email

1. No Supabase Dashboard, vá em **Authentication** > **Email Templates**
2. Selecione o template **Reset Password**
3. Copie o conteúdo do arquivo `lib/email-templates/reset-password.html`
4. Cole no editor do Supabase
5. **IMPORTANTE**: Mantenha a variável `{{ .ConfirmationURL }}` exatamente como está - ela será substituída automaticamente pelo Supabase com o link de recuperação

### 3. Variáveis Disponíveis no Template

O Supabase fornece as seguintes variáveis que podem ser usadas no template:

- `{{ .ConfirmationURL }}` - URL completa para redefinir senha (inclui token)
- `{{ .Email }}` - Email do usuário
- `{{ .SiteURL }}` - URL base do site configurada
- `{{ .Token }}` - Token de recuperação (geralmente não necessário, pois já está na URL)

**Exemplo de uso:**

```html
<a href="{{ .ConfirmationURL }}">Redefinir Senha</a>
```

### 4. Configurar Site URL

1. Em **Authentication** > **URL Configuration**
2. Configure o **Site URL**:
   - Desenvolvimento: `http://localhost:3000`
   - Produção: `https://seu-dominio.com`

## Fluxo Completo

### 1. Usuário Solicita Reset

1. Usuário clica em "Esqueci minha senha" na página de login
2. É redirecionado para `/forgot-password`
3. Informa o email
4. Sistema chama `resetPassword(email)` que envia email via Supabase

### 2. Usuário Recebe Email

1. Supabase envia email com template customizado
2. Email contém link: `https://seu-dominio.com/reset-password?token=...&type=recovery`
3. Link expira em 1 hora (configurável no Supabase)

### 3. Usuário Redefine Senha

1. Usuário clica no link do email
2. É redirecionado para `/reset-password?token=...&type=recovery`
3. App detecta token na URL e mostra página de reset
4. Usuário informa nova senha (mínimo 6 caracteres)
5. Sistema chama `updatePassword(newPassword)`
6. Supabase valida token e atualiza senha
7. Usuário é redirecionado para login

## Validações Implementadas

- **Email**: Formato válido
- **Senha**: Mínimo 6 caracteres
- **Confirmação**: Senhas devem coincidem
- **Token**: Validado pelo Supabase (expira em 1 hora)

## Testes

### Testar Solicitação de Reset

1. Acesse a página de login
2. Clique em "Esqueci minha senha"
3. Informe um email válido cadastrado
4. Verifique se recebe o email

### Testar Redefinição

1. Abra o link do email recebido
2. Verifique se a página de reset é exibida
3. Informe nova senha (mínimo 6 caracteres)
4. Confirme a senha
5. Verifique se redireciona para login após sucesso

### Testar Casos de Erro

- Email não cadastrado
- Token expirado
- Senha muito curta
- Senhas não coincidem

## Personalização do Template

O template HTML está em `lib/email-templates/reset-password.html` e pode ser personalizado:

- **Cores**: Altere as cores hexadecimais no CSS
- **Logo**: Substitua o SVG do logo
- **Texto**: Modifique as mensagens em português
- **Layout**: Ajuste o CSS para diferentes layouts

**Importante**: Sempre mantenha `{{ .ConfirmationURL }}` no template, pois é essencial para o funcionamento.

## Troubleshooting

### Email não é enviado

1. Verifique se o email está habilitado em **Authentication** > **Providers** > **Email**
2. Verifique os logs em **Authentication** > **Logs**
3. Confirme que o email do usuário está correto

### Link não funciona / Erro 404

1. **Configuração do Servidor (CRÍTICO)**: O servidor precisa retornar `index.html` para todas as rotas. Verifique:
   - **Vercel**: Arquivo `vercel.json` na raiz do projeto (já criado)
   - **Netlify**: Arquivo `public/_redirects` (já criado)
   - **Apache**: Arquivo `public/.htaccess` (já criado)
   - **Nginx**: Configure `try_files $uri $uri/ /index.html;` no bloco `location /`

2. **URL sem protocolo**: Se a URL no email estiver sem `https://` (ex: `gesttor.app/reset-password`), configure o Site URL no Supabase com `https://gesttor.app`

3. **Verifique se a URL de redirecionamento está configurada corretamente** no Supabase Dashboard:
   - Authentication > URL Configuration > Site URL: `https://gesttor.app`
   - Authentication > URL Configuration > Redirect URLs: `https://gesttor.app` e `https://gesttor.app/**`

4. **Verifique as variáveis de ambiente do deploy**:
   - `APP_PUBLIC_URL=https://gesttor.app`
   - `BETTER_AUTH_URL=https://gesttor.app` (se definida)

5. **Confirme que o token não expirou** (1 hora)

6. **Hash fragment**: O Supabase usa hash fragments (`#access_token=...`) em vez de query strings. O código já está preparado para isso e detecta automaticamente

7. **Verifique o console do navegador** para ver se há erros de JavaScript

8. **Script de detecção**: Um script no `index.html` detecta o hash fragment antes do React carregar e redireciona para a raiz se necessário

### Template não aparece

1. Confirme que copiou todo o HTML do template
2. Verifique se `{{ .ConfirmationURL }}` está presente
3. Teste o template no Supabase usando "Send test email"

## Segurança

- Tokens expiram em 1 hora (configurável no Supabase)
- Links são únicos e de uso único
- Senha deve ter mínimo 6 caracteres
- Validação de token é feita pelo Supabase

## Próximos Passos

Após configurar:

1. Teste o fluxo completo em desenvolvimento
2. Configure URLs de produção no Supabase
3. Teste em produção
4. Monitore logs de autenticação no Supabase Dashboard
