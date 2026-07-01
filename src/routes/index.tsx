import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";

import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda Setorial SEE-MG" },
      { name: "description", content: "Sistema Agenda Setorial SEE-MG" },
    ],
  }),
  component: Index,
});

type DebugInfo = {
  errorMessage?: string;
  errorCode?: string;
  errorDescription?: string;
  provider?: string;
  redirectTo?: string;
};

function Index() {
  const navigate = useNavigate();
  const [user, setUser] = useState<null | { email?: string }>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [debug, setDebug] = useState<DebugInfo>({});

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
    );
    const oauthError = queryParams.get("error") || hashParams.get("error");
    const oauthErrorCode =
      queryParams.get("error_code") || hashParams.get("error_code");
    const oauthErrorDescription =
      queryParams.get("error_description") || hashParams.get("error_description");
    const decodedDesc = oauthErrorDescription
      ? decodeURIComponent(oauthErrorDescription).replace(/\+/g, " ")
      : undefined;

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (session?.user) {
        window.history.replaceState({}, document.title, window.location.pathname);
        validateUser(session.user);
      } else if (oauthError) {
        setDebug((d) => ({
          ...d,
          errorMessage: oauthError,
          errorCode: oauthErrorCode ?? undefined,
          errorDescription: decodedDesc,
        }));
        setMessage(decodedDesc ?? "O login falhou ou expirou. Tente novamente.");
        setIsError(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (sessionError) {
        setDebug((d) => ({
          ...d,
          errorMessage: sessionError.message,
          errorCode: (sessionError as { code?: string }).code,
        }));
        setMessage("O login falhou ou expirou. Tente novamente.");
        setIsError(true);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        window.history.replaceState({}, document.title, window.location.pathname);
        validateUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setMessage(null);
        setIsError(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function validateUser(authUser: { email?: string }) {
    const email = authUser.email ?? "";
    if (email.endsWith("@educacao.mg.gov.br")) {
      setUser(authUser);
      setMessage("Login realizado com sucesso.");
      setIsError(false);
      navigate({ to: "/painel" });
    } else {
      await supabase.auth.signOut();
      setUser(null);
      setMessage("Acesso permitido apenas para contas Google Educação da SEE-MG.");
      setIsError(true);
    }
  }

  async function handleLogin() {
    setMessage(null);
    setIsError(false);
    setOauthLoading(true);

    const provider = "google" as const;
    const redirectTo = window.location.origin + "/";
    setDebug({ provider, redirectTo });

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        setDebug((d) => ({
          ...d,
          errorMessage: error.message,
          errorCode: (error as { code?: string }).code,
        }));
        setMessage(error.message || "Erro ao iniciar login. Tente novamente.");
        setIsError(true);
        setOauthLoading(false);
        return;
      }
    } catch (e) {
      const err = e as { message?: string; code?: string };
      setDebug((d) => ({
        ...d,
        errorMessage: err?.message ?? String(e),
        errorCode: err?.code,
      }));
      setMessage(err?.message ?? "O login falhou ou expirou. Tente novamente.");
      setIsError(true);
      setOauthLoading(false);
    }
  }

  const isDev = import.meta.env.DEV;
  const supabaseUrl = SUPABASE_URL;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p>Processando login...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-6">
          {isDev && (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-900 space-y-1">
              <p><span className="font-semibold">Supabase URL:</span> {supabaseUrl}</p>
              <p><span className="font-semibold">E-mail:</span> {user.email}</p>
              <p className="text-amber-700 italic">Sessão confirmada pelo Supabase Auth.</p>
            </div>
          )}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Agenda Setorial SEE-MG
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-green-800 font-medium">{message}</p>
          </div>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-8">
        {isDev && (
          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-900 space-y-1">
            <p><span className="font-semibold">Supabase URL:</span> {supabaseUrl}</p>
            {debug.provider && (
              <p><span className="font-semibold">provider:</span> {debug.provider}</p>
            )}
            {debug.redirectTo && (
              <p><span className="font-semibold">redirectTo:</span> {debug.redirectTo}</p>
            )}
            {debug.errorMessage && (
              <p><span className="font-semibold">error.message:</span> {debug.errorMessage}</p>
            )}
            {debug.errorCode && (
              <p><span className="font-semibold">error.code:</span> {debug.errorCode}</p>
            )}
            {debug.errorDescription && (
              <p><span className="font-semibold">error_description:</span> {debug.errorDescription}</p>
            )}
            <p className="text-amber-700 italic">Ambiente de desenvolvimento</p>
          </div>
        )}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Agenda Setorial SEE-MG
          </h1>
          <p className="text-muted-foreground">
            Acesse com sua conta Google Educação
          </p>
        </div>

        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleLogin}
            disabled={oauthLoading}
            className="w-full max-w-xs gap-2"
          >
            {oauthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {oauthLoading ? "Entrando..." : "Entrar com Google Educação"}
          </Button>
        </div>

        {message && (
          <div
            className={`rounded-lg border p-4 text-center ${
              isError
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            <p className="font-medium text-sm">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        fill="#EA4335"
      />
    </svg>
  );
}
