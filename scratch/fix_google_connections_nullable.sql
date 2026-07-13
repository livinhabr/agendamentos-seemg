-- Allow NULL in columns that are cleared on disconnect
-- access_token: cleared when Google Calendar is disconnected
-- token_expiry: cleared when Google Calendar is disconnected  
-- google_email: may not be available before connection is established

ALTER TABLE public.atendente_google_connections ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.atendente_google_connections ALTER COLUMN token_expiry DROP NOT NULL;
ALTER TABLE public.atendente_google_connections ALTER COLUMN google_email DROP NOT NULL;
