import { useState } from "react";
import { Tabs } from "../../components/common/Tabs";
import { MatchCard } from "../../components/player/MatchCard";
import { matchService } from "../../services/matchService";

export function PlayerMatchesPage() {
  const [tab, setTab] = useState("upcoming");
  const matches = matchService.getPlayerMatches();
  const filtered = matches.filter((match) => (tab === "finished" ? match.status === "Finalizado" : match.status !== "Finalizado"));

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Jugador</span>
        <h1>Mis partidos</h1>
      </header>
      <Tabs tabs={[{ id: "upcoming", label: "Proximos" }, { id: "finished", label: "Finalizados" }]} activeTab={tab} onChange={setTab} />
      <div className="card-grid">
        {filtered.map((match) => <MatchCard key={match.id} match={match} />)}
      </div>
    </div>
  );
}
