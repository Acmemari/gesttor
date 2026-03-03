-- Adiciona campo client_id em user_profiles para vincular usuário com qualification='cliente'
-- a um registro específico na tabela clients.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Índice para acelerar buscas por client_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_client_id ON public.user_profiles(client_id);

-- Policy RLS: usuário com qualification='cliente' pode ler o próprio registro de clients
-- (ex: nome e email da organização) sem precisar passar pelo analyst_id.
DROP POLICY IF EXISTS "Clientes podem ver sua própria organização" ON public.clients;

CREATE POLICY "Clientes podem ver sua própria organização"
  ON public.clients
  FOR SELECT
  USING (
    id IN (
      SELECT client_id
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND client_id IS NOT NULL
    )
  );

-- Policy RLS: usuário pode ler as fazendas vinculadas ao seu client_id
DROP POLICY IF EXISTS "Clientes podem ver fazendas da sua organização" ON public.farms;

CREATE POLICY "Clientes podem ver fazendas da sua organização"
  ON public.farms
  FOR SELECT
  USING (
    client_id IN (
      SELECT up.client_id
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.client_id IS NOT NULL
    )
  );
