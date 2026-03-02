-- =============================================================================
-- Limpeza: Pessoas órfãs/duplicadas (sujeira no banco)
-- Rodar no Supabase SQL Editor
-- =============================================================================
-- Registros que aparecem no dropdown mas NÃO pertencem à fazenda atual:
-- fulano, Henrique (duplicado), Ladslau (sem "1"), Neuman, Tita
-- =============================================================================

-- 1) PRIMEIRO: listar para confirmar os registros antes de deletar
SELECT id, full_name, preferred_name, person_type, farm_id
FROM public.people
WHERE preferred_name IN ('fulano', 'Henrique', 'Ladslau', 'Neuman', 'Tita')
   OR full_name IN ('fulano', 'Henrique', 'Ladslau', 'Neuman', 'Tita');

-- 2) DEPOIS de confirmar que são os registros corretos, rodar o DELETE
--    (copie e execute apenas o bloco abaixo no SQL Editor):
--
-- DELETE FROM public.people
-- WHERE preferred_name IN ('fulano', 'Henrique', 'Ladslau', 'Neuman', 'Tita')
--    OR full_name IN ('fulano', 'Henrique', 'Ladslau', 'Neuman', 'Tita');
