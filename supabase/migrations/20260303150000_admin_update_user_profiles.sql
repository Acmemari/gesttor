-- Migration: Permite que admins atualizem qualquer perfil em user_profiles via RLS.
-- A policy anterior existia apenas em lib/supabase/migrations/010_admin_update_user_profiles_rls.sql
-- e nunca era aplicada ao banco remoto (que usa apenas supabase/migrations/).
-- Usa is_admin() (SECURITY DEFINER) para evitar recursão.

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can update user profiles" ON public.user_profiles;

CREATE POLICY "Admins can update user profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
