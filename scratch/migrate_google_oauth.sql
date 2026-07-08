CREATE TABLE IF NOT EXISTS public.atendente_google_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  atendente_id uuid NOT NULL REFERENCES public.atendentes(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_expiry timestamp with time zone NOT NULL,
  scope text,
  status text DEFAULT 'connected',
  calendar_id text DEFAULT 'primary',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(atendente_id)
);

-- Enable RLS
ALTER TABLE public.atendente_google_connections ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all connections
CREATE POLICY "Admins podem gerenciar todas as conexoes" 
ON public.atendente_google_connections
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.perfis_usuario
    WHERE perfis_usuario.user_id = auth.uid()
    AND perfis_usuario.role = 'admin'
  )
);

-- Note: The edge functions auth-google-callback and auth-google-start use service_role,
-- which bypasses RLS, so no extra policies are strictly needed for them.

-- Index for fast lookup by atendente_id and status
CREATE INDEX IF NOT EXISTS idx_atendente_google_connections_status 
ON public.atendente_google_connections(atendente_id, status);
