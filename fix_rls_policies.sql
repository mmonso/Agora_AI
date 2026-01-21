-- Fix RLS policies for Agora AI

-- 1. Enable RLS on personas table (if not already enabled)
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

-- 2. Allow public read access to personas (they are global/shared)
CREATE POLICY "Allow public read access to personas"
ON personas
FOR SELECT
TO authenticated
USING (true);

-- 3. Allow authenticated users to insert/update personas
-- (This is optional - only if you want users to create custom personas)
CREATE POLICY "Allow authenticated users to manage personas"
ON personas
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Settings table - users can only access their own settings
CREATE POLICY "Users can manage their own settings"
ON settings
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 5. Projects table - users can only access their own projects
CREATE POLICY "Users can manage their own projects"
ON projects
FOR ALL
TO authenticated
USING ("ownerId" = auth.uid())
WITH CHECK ("ownerId" = auth.uid());

-- 6. Messages table - users can access messages for their own projects
CREATE POLICY "Users can manage messages for their projects"
ON messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = messages.project_id
    AND projects."ownerId" = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = messages.project_id
    AND projects."ownerId" = auth.uid()
  )
);
