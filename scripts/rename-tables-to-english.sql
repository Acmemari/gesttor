-- Migration: Rename Portuguese table names to English
-- Date: 2026-03-22
-- Database: Neon (PostgreSQL)
-- Purpose: Standardize all table names to English
-- How to run: paste directly in the Neon SQL Editor
--             OR: npx tsx scripts/run-migration.ts scripts/rename-tables-to-english.sql
--
-- SAFE: ALTER TABLE ... RENAME TO preserves all indexes, foreign keys,
--       constraints, sequences, and triggers automatically.

ALTER TABLE perfils           RENAME TO profiles;
ALTER TABLE cargo_funcao      RENAME TO job_roles;
ALTER TABLE person_perfils    RENAME TO person_profiles;
ALTER TABLE person_fazendas   RENAME TO person_farms;
ALTER TABLE person_permissoes RENAME TO person_permissions;
ALTER TABLE pessoas           RENAME TO assignees;
ALTER TABLE semanas           RENAME TO work_weeks;
ALTER TABLE atividades        RENAME TO activities;
ALTER TABLE historico_semanas RENAME TO week_history;
ALTER TABLE emp_ass           RENAME TO consulting_firms;
