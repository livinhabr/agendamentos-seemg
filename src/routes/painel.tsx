import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/painel")({
  head: () => ({ meta: [{ title: "Painel" }] }),
  component: () => {
    const navigate = useNavigate();
    useEffect(() => {
      navigate({ to: "/inicio", replace: true });
    }, [navigate]);
    return null;
  },
});
