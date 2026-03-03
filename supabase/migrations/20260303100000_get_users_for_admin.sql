-- Fix: Admin deve ver todos os usuários na tela de Gestão de Usuários
-- O RLS de SELECT em user_profiles permite apenas que cada usuário veja seu próprio perfil.
-- A policy "Admins can view all profiles" foi removida pois causava recursão infinita.
-- Esta RPC usa SECURITY DEFINER para bypassar RLS e retornar todos os usuários
-- quando o chamador for admin (mesmo padrão de get_analysts_for_admin).

CREATE OR REPLACE FUNCTION public.get_users_for_admin(
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 200,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  email TEXT,
  role TEXT,
  avatar TEXT,
  plan TEXT,
  status TEXT,
  last_login TIMESTAMPTZ,
  organization_id UUID,
  phone TEXT,
  qualification TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas admin pode chamar
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    up.name,
    up.email,
    up.role,
    up.avatar,
    up.plan,
    up.status,
    up.last_login,
    up.organization_id,
    up.phone,
    up.qualification,
    up.created_at,
    up.updated_at
  FROM public.user_profiles up
  WHERE up.role = 'client'
    AND (
      p_search IS NULL
      OR p_search = ''
      OR up.name ILIKE '%' || p_search || '%'
      OR up.email ILIKE '%' || p_search || '%'
    )
  ORDER BY up.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_for_admin(INT, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_users_for_admin(INT, INT, TEXT) IS
  'Lista usuários (role=client) para admin. Bypassa RLS em user_profiles. Chamável apenas por role=admin.';
