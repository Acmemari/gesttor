-- Migration: Reconcile farms.client_id from client_farms
-- Garante que farms.client_id seja a fonte canônica; preenche NULL a partir de client_farms.

-- Preencher farms.client_id onde estiver NULL e existir vínculo em client_farms
UPDATE public.farms f
SET client_id = cf.client_id
FROM public.client_farms cf
WHERE cf.farm_id = f.id
  AND f.client_id IS NULL;
