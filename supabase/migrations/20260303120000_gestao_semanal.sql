-- Gestão Semanal de Atividades
-- Tables: pessoas, semanas, atividades, historico_semanas

CREATE TABLE IF NOT EXISTS pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL
);

INSERT INTO pessoas (nome) VALUES
  ('Antonio'),
  ('Marcos'),
  ('Julia'),
  ('Rafael'),
  ('Camila');

CREATE TABLE IF NOT EXISTS semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  modo text NOT NULL CHECK (modo IN ('ano', 'safra')),
  aberta boolean NOT NULL DEFAULT true,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed: week 10 of 2026, ano mode (03 mar – 07 mar 2026)
INSERT INTO semanas (numero, modo, aberta, data_inicio, data_fim) VALUES
  (10, 'ano', true, '2026-03-03', '2026-03-07');

CREATE TABLE IF NOT EXISTS atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id uuid NOT NULL REFERENCES semanas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  pessoa_id uuid REFERENCES pessoas(id),
  data_termino date,
  tag text NOT NULL DEFAULT '#planejamento',
  status text NOT NULL DEFAULT 'a fazer' CHECK (status IN ('a fazer', 'em andamento', 'pausada', 'concluída')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historico_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_numero integer NOT NULL,
  total integer NOT NULL DEFAULT 0,
  concluidas integer NOT NULL DEFAULT 0,
  pendentes integer NOT NULL DEFAULT 0,
  closed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_semanas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on pessoas"
  ON pessoas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access on semanas"
  ON semanas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access on atividades"
  ON atividades FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access on historico_semanas"
  ON historico_semanas FOR ALL TO authenticated USING (true) WITH CHECK (true);
