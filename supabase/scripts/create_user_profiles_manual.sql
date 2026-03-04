-- ============================================================
-- Script: Criar tabelas user_profiles e organizations
-- Execute este script no Supabase Dashboard > SQL Editor
-- Totalmente idempotente: pode ser executado múltiplas vezes
-- ============================================================

-- 1. TABELA: organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'basic',
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);

-- Policies para organizations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Users can view their own organization') THEN
    CREATE POLICY "Users can view their own organization" ON public.organizations FOR SELECT USING (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Users can insert their own organizations') THEN
    CREATE POLICY "Users can insert their own organizations" ON public.organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Users can update their own organization') THEN
    CREATE POLICY "Users can update their own organization" ON public.organizations FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Users can delete their own organizations') THEN
    CREATE POLICY "Users can delete their own organizations" ON public.organizations FOR DELETE USING (auth.uid() = owner_id);
  END IF;
END $$;

-- 2. TABELA: user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  avatar TEXT,
  plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  phone TEXT,
  qualification TEXT DEFAULT 'visitante' CHECK (qualification IN ('visitante', 'cliente', 'analista')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_organization ON public.user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_qualification ON public.user_profiles(qualification);

-- Policies para user_profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can view their own profile') THEN
    CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can update their own profile') THEN
    CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can insert their own profile') THEN
    CREATE POLICY "Users can insert their own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 3. FUNÇÃO: is_admin (para evitar recursão em RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Policies de admin para user_profiles (usa is_admin() com SECURITY DEFINER para evitar recursão)
-- NOTA: A policy SELECT para admin NÃO usa is_admin() pois causa recursão infinita.
-- Admins veem seus próprios perfis via "Users can view their own profile".
-- Para listar todos os perfis, o app chama a RPC get_users_for_admin() (SECURITY DEFINER),
-- que bypassa RLS sem causar recursão (padrão idêntico a get_analysts_for_admin).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Admins can update user profiles') THEN
    CREATE POLICY "Admins can update user profiles" ON public.user_profiles FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Remover policy de SELECT admin se existir (causa recursão)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;

-- Policies de admin para organizations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Admins can view all organizations') THEN
    CREATE POLICY "Admins can view all organizations" ON public.organizations FOR SELECT
      USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Admins can update all organizations') THEN
    CREATE POLICY "Admins can update all organizations" ON public.organizations FOR UPDATE
      USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'));
  END IF;
END $$;

-- 4. TRIGGER: handle_new_user (cria perfil automaticamente ao registrar)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_email TEXT;
  user_name TEXT;
  default_org_id UUID;
BEGIN
  user_email := NEW.email;
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(user_email, '@', 1)
  );

  INSERT INTO public.organizations (name, plan, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'organization_name', user_name || '''s Organization'),
    COALESCE((NEW.raw_user_meta_data->>'plan')::TEXT, 'basic'),
    NEW.id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO default_org_id;

  IF default_org_id IS NULL THEN
    SELECT id INTO default_org_id
    FROM public.organizations
    WHERE owner_id = NEW.id
    LIMIT 1;
  END IF;

  INSERT INTO public.user_profiles (id, name, email, role, avatar, plan, status, organization_id, qualification)
  VALUES (
    NEW.id,
    user_name,
    user_email,
    COALESCE((NEW.raw_user_meta_data->>'role')::TEXT, 'client'),
    COALESCE(NEW.raw_user_meta_data->>'avatar', upper(substring(user_name, 1, 1))),
    COALESCE((NEW.raw_user_meta_data->>'plan')::TEXT, 'basic'),
    'active',
    default_org_id,
    'visitante'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, user_profiles.name),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. RPC: create_user_profile_if_missing
CREATE OR REPLACE FUNCTION public.create_user_profile_if_missing(user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  auth_user RECORD;
  org_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = user_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO auth_user FROM auth.users WHERE id = user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.organizations (name, plan, owner_id)
  VALUES (
    COALESCE(auth_user.raw_user_meta_data->>'organization_name',
      COALESCE(auth_user.raw_user_meta_data->>'name', split_part(auth_user.email, '@', 1)) || '''s Organization'),
    'basic',
    user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO org_id;

  IF org_id IS NULL THEN
    SELECT id INTO org_id FROM public.organizations WHERE owner_id = user_id LIMIT 1;
  END IF;

  INSERT INTO public.user_profiles (id, name, email, role, avatar, plan, status, organization_id, qualification)
  VALUES (
    user_id,
    COALESCE(auth_user.raw_user_meta_data->>'name', auth_user.raw_user_meta_data->>'full_name', split_part(auth_user.email, '@', 1)),
    auth_user.email,
    COALESCE((auth_user.raw_user_meta_data->>'role')::TEXT, 'client'),
    upper(substring(COALESCE(auth_user.raw_user_meta_data->>'name', split_part(auth_user.email, '@', 1)), 1, 1)),
    'basic',
    'active',
    org_id,
    'visitante'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_profile_if_missing(UUID) TO authenticated;

-- 6. BACKFILL: Criar perfis para usuários existentes que não têm perfil
DO $$
DECLARE
  r RECORD;
  org_id UUID;
BEGIN
  FOR r IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON up.id = au.id
    WHERE up.id IS NULL
  LOOP
    INSERT INTO public.organizations (name, plan, owner_id)
    VALUES (
      COALESCE(r.raw_user_meta_data->>'organization_name',
        COALESCE(r.raw_user_meta_data->>'name', split_part(r.email, '@', 1)) || '''s Organization'),
      'basic',
      r.id
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO org_id;

    IF org_id IS NULL THEN
      SELECT id INTO org_id FROM public.organizations WHERE owner_id = r.id LIMIT 1;
    END IF;

    INSERT INTO public.user_profiles (id, name, email, role, avatar, plan, status, organization_id, qualification)
    VALUES (
      r.id,
      COALESCE(r.raw_user_meta_data->>'name', r.raw_user_meta_data->>'full_name', split_part(r.email, '@', 1)),
      r.email,
      COALESCE((r.raw_user_meta_data->>'role')::TEXT, 'client'),
      upper(substring(COALESCE(r.raw_user_meta_data->>'name', split_part(r.email, '@', 1)), 1, 1)),
      'basic',
      'active',
      org_id,
      'visitante'
    )
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created profile for user: %', r.email;
  END LOOP;
END $$;

-- ============================================================
-- PRONTO! Após executar, faça logout e login novamente.
-- O AnalystHeader deve aparecer com Analista/Cliente/Fazenda.
--
-- NOTA: Usuários backfillados recebem qualification='visitante'.
-- Para que o header apareça, o usuário precisa ter:
--   qualification = 'analista' OU role = 'admin' OU qualification = 'visitante'
-- Ajuste manualmente no Supabase se necessário:
--   UPDATE user_profiles SET role = 'admin' WHERE email = 'seu@email.com';
--   UPDATE user_profiles SET qualification = 'analista' WHERE email = 'seu@email.com';
-- ============================================================
