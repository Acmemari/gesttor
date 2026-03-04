-- RPC readonly para cliente listar projetos por organizacao + fazenda,
-- incluindo fallback para dados legados (projects.client_id nulo).

DROP FUNCTION IF EXISTS public.client_list_projects_by_farm(UUID, UUID);

CREATE FUNCTION public.client_list_projects_by_farm(
  p_client_id UUID,
  p_farm_id UUID DEFAULT NULL
)
RETURNS SETOF public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_client_id UUID;
  v_profile_qualification TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  SELECT up.client_id, up.qualification
    INTO v_profile_client_id, v_profile_qualification
  FROM public.user_profiles up
  WHERE up.id = v_user_id;

  IF v_profile_qualification IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'Apenas usuarios cliente podem consultar esta listagem.';
  END IF;

  IF v_profile_client_id IS NULL OR p_client_id IS NULL OR v_profile_client_id <> p_client_id THEN
    RAISE EXCEPTION 'Cliente informado nao corresponde ao usuario autenticado.';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.projects p
  WHERE
    (
      p.client_id = p_client_id
      OR (
        p.client_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.deliveries d_legacy
          JOIN public.initiatives i_legacy ON i_legacy.delivery_id = d_legacy.id
          WHERE d_legacy.project_id = p.id
            AND i_legacy.client_id = p_client_id
        )
      )
    )
    AND (
      p_farm_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.deliveries d_farm
        JOIN public.initiatives i_farm ON i_farm.delivery_id = d_farm.id
        WHERE d_farm.project_id = p.id
          AND i_farm.client_id = p_client_id
          AND i_farm.farm_id = p_farm_id
      )
    )
  ORDER BY p.sort_order ASC, p.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_list_projects_by_farm(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.client_list_projects_by_farm(UUID, UUID)
IS 'Lista readonly de projetos para cliente autenticado por client_id e farm_id, com fallback de legado.';
