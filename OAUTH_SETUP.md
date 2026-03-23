# Configuração de OAuth com Supabase

Este documento explica como configurar OAuth (Google, GitHub, etc.) no Supabase para a aplicação.

## Pré-requisitos

1. Conta no Supabase
2. Projeto Supabase criado
3. Credenciais OAuth dos provedores (Google, GitHub, etc.)

## Configuração no Supabase Dashboard

### 1. Acesse Authentication > Providers

No dashboard do Supabase, vá para:

- **Authentication** → **Providers**

### 2. Configurar Google OAuth

1. Ative o provider **Google**
2. Você precisará de:
   - **Client ID** (do Google Cloud Console)
   - **Client Secret** (do Google Cloud Console)
3. Configure o **Redirect URL** no Google Cloud Console:
   ```
   https://gtfjaggtgyoldovcmyqh.supabase.co/auth/v1/callback
   ```

#### Como obter credenciais do Google:

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Vá para **APIs & Services** → **Credentials**
4. Clique em **Create Credentials** → **OAuth client ID**
5. Configure:
   - Application type: **Web application**
   - Authorized redirect URIs: Adicione `https://gtfjaggtgyoldovcmyqh.supabase.co/auth/v1/callback`
6. Copie o **Client ID** e **Client Secret**

### 3. Configurar GitHub OAuth

1. Ative o provider **GitHub**
2. Você precisará criar uma OAuth App no GitHub:
   - Acesse [GitHub Developer Settings](https://github.com/settings/developers)
   - Clique em **New OAuth App**
   - Configure:
     - **Application name**: Gesttor (ou seu nome)
     - **Homepage URL**: Sua URL de produção
     - **Authorization callback URL**: `https://gtfjaggtgyoldovcmyqh.supabase.co/auth/v1/callback`
   - Copie o **Client ID** e gere um **Client Secret**
3. Cole as credenciais no Supabase

### 4. Configurar Azure OAuth (Opcional)

1. Ative o provider **Azure**
2. Configure no Azure Portal:
   - Registre uma aplicação no Azure AD
   - Configure redirect URI: `https://gtfjaggtgyoldovcmyqh.supabase.co/auth/v1/callback`
   - Copie **Client ID** e **Client Secret**

## Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://gtfjaggtgyoldovcmyqh.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui

# Gemini API Key (para o Chat Agent)
GEMINI_API_KEY=sua_chave_gemini_aqui
```

## Como Funciona

1. **Login com Email/Senha**: Usa `supabase.auth.signInWithPassword()`
2. **Login com OAuth**: Usa `supabase.auth.signInWithOAuth()` que redireciona para o provedor
3. **Criação Automática de Perfil**: Quando um usuário faz login pela primeira vez (OAuth ou email), um trigger no banco cria automaticamente:
   - Um registro em `user_profiles`
   - Uma organização padrão em `organizations`

## Fluxo de Autenticação

1. Usuário clica em "Continuar com Google/GitHub"
2. É redirecionado para o provedor OAuth
3. Após autorizar, retorna para a aplicação
4. Supabase cria/atualiza o usuário em `auth.users`
5. Trigger `on_auth_user_created` cria o perfil em `user_profiles`
6. Aplicação carrega o perfil e exibe o dashboard

## Testando

1. Inicie a aplicação: `npm run dev`
2. Acesse a página de login
3. Clique em um dos botões OAuth
4. Complete o fluxo de autenticação
5. Você será redirecionado de volta e estará logado

## Troubleshooting

### Erro: "redirect_uri_mismatch"

- Verifique se o redirect URI no provedor OAuth está exatamente igual ao configurado no Supabase
- O formato deve ser: `https://[seu-projeto].supabase.co/auth/v1/callback`

### Usuário não aparece após login OAuth

- Verifique os logs do Supabase
- Confirme que os triggers estão ativos no banco de dados
- Verifique se a tabela `user_profiles` tem permissões corretas

### Erro de CORS

- Certifique-se de adicionar sua URL local no Supabase Dashboard:
  - **Authentication** → **URL Configuration** → **Site URL**
  - Adicione: `http://localhost:3000` (ou sua porta)

## Segurança

- Nunca exponha o `service_role` key no frontend
- Use apenas a `anon` key no cliente
- As políticas RLS (Row Level Security) garantem que usuários só vejam seus próprios dados
- OAuth tokens são gerenciados automaticamente pelo Supabase
