import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  getBotsBySector,
  getSectorsByIds,
  getUserSectorLinks,
} from "@/lib/data/agenda";

export type SectorCtx = {
  loading: boolean;
  userId: string | null;
  userEmail: string;
  sectors: any[];
  bots: any[];
  selectedSectorId: string | null;
  selectedBotId: string | null;
  setSelectedSectorId: (id: string | null) => void;
  setSelectedBotId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SectorCtx | null>(null);

const STORAGE_KEY = "agenda.selectedSector";
const BOT_KEY = "agenda.selectedBot";

export function SectorProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [sectors, setSectors] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [selectedSectorId, setSelectedSectorIdState] = useState<string | null>(null);
  const [selectedBotId, setSelectedBotIdState] = useState<string | null>(null);

  function setSelectedSectorId(id: string | null) {
    setSelectedSectorIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }
  function setSelectedBotId(id: string | null) {
    setSelectedBotIdState(id);
    if (id) localStorage.setItem(BOT_KEY, id);
    else localStorage.removeItem(BOT_KEY);
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate({ to: "/" });
      return;
    }
    setUserId(session.user.id);
    setUserEmail(session.user.email ?? "");

    const links = await getUserSectorLinks(session.user.id);
    const active = (links.data ?? []).filter((l: any) => l.ativo !== false);
    if (active.length === 0) {
      navigate({ to: "/cadastro-inicial" });
      return;
    }
    const setorIds = active.map((l: any) => l.setor_id).filter(Boolean);
    const [secRes, botRes] = await Promise.all([
      getSectorsByIds(setorIds),
      getBotsBySector(setorIds),
    ]);
    setSectors(secRes.data);
    setBots(botRes.data);

    // restore or auto-select
    const stored = localStorage.getItem(STORAGE_KEY);
    const validStored = secRes.data.find((s: any) => s.id === stored);
    const sid = validStored?.id ?? secRes.data[0]?.id ?? null;
    setSelectedSectorIdState(sid);
    if (sid) localStorage.setItem(STORAGE_KEY, sid);

    const botsForSec = botRes.data.filter((b: any) => b.setor_id === sid);
    const storedBot = localStorage.getItem(BOT_KEY);
    const validBot = botsForSec.find((b: any) => b.id === storedBot);
    const bid = validBot?.id ?? botsForSec[0]?.id ?? null;
    setSelectedBotIdState(bid);
    if (bid) localStorage.setItem(BOT_KEY, bid);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When sector changes, reset bot to first of sector
  useEffect(() => {
    if (!selectedSectorId) return;
    const list = bots.filter((b) => b.setor_id === selectedSectorId);
    if (!list.find((b) => b.id === selectedBotId)) {
      const bid = list[0]?.id ?? null;
      setSelectedBotIdState(bid);
      if (bid) localStorage.setItem(BOT_KEY, bid);
      else localStorage.removeItem(BOT_KEY);
    }
  }, [selectedSectorId, bots, selectedBotId]);

  const value = useMemo<SectorCtx>(
    () => ({
      loading,
      userId,
      userEmail,
      sectors,
      bots,
      selectedSectorId,
      selectedBotId,
      setSelectedSectorId,
      setSelectedBotId,
      refresh: load,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, userId, userEmail, sectors, bots, selectedSectorId, selectedBotId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSector() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSector must be inside <SectorProvider>");
  return v;
}
