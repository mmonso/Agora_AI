-- TABELA DE PERSONAS
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_color TEXT,
  border_color TEXT,
  text_color TEXT,
  system_instruction TEXT,
  avatar TEXT -- Base64 ou URL
);

-- TABELA DE PROJETOS
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  created_at BIGINT,
  last_active_at BIGINT,
  active_persona_ids TEXT[], -- Array de IDs de personas
  starters TEXT[],
  theme TEXT,
  phase TEXT,
  mode TEXT,
  long_term_memory TEXT
);

-- TABELA DE MENSAGENS
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  reasoning TEXT,
  type TEXT,
  attachments JSONB, -- Para suportar a estrutura complexa de anexos
  action_plan JSONB
);

-- POLÍTICAS DE SEGURANÇA (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects" 
ON projects FOR ALL 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can manage messages of their own projects" 
ON messages FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = messages.project_id 
    AND projects.owner_id = auth.uid()
  )
);

-- Personas são leitura pública
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read personas" ON personas FOR SELECT USING (true);
