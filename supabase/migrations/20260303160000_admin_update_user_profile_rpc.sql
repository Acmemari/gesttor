-- Fix: atualizar perfil de usuário por RPC para evitar bloqueio silencioso de RLS
-- quando o admin salva qualificação/status na Gestão de Usuários.
-- A função valida admin com is_admin() e atualiza apenas perfis role='client'.

DROP FUNCTION IF EXISTS public.admin_update_user_profile(UUID, TEXT, TEXT, UUID, UUID);

CREATE FUNCTION public.admin_update_user_profile(
  p_user_id UUID,
  p_qualification TEXT,
  p_status TEXT,
  p_organization_id UUID DEFAULT NULL,
  p_client_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  qualification TEXT,
  status TEXT,
  organization_id UUID,
  client_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem atualizar perfis de usuário.';
  END IF;

  IF p_qualification NOT IN ('visitante', 'analista', 'cliente') THEN
    RAISE EXCEPTION 'Qualificação inválida: %', p_qualification;
  END IF;

  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  RETURN QUERY
  UPDATE public.user_profiles up
     SET qualification = p_qualification,
         status = p_status,
         organization_id = p_organization_id,
         client_id = p_client_id,
         updated_at = now()
   WHERE up.id = p_user_id
     AND up.role = 'client'
  RETURNING up.id, up.qualification, up.status, up.organization_id, up.client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(UUID, TEXT, TEXT, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_update_user_profile(UUID, TEXT, TEXT, UUID, UUID) IS
  'Atualiza qualification/status/organization_id/client_id de user_profiles para admin. Evita UPDATE silencioso bloqueado por RLS.';
