import { GitBranch } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { ZONE_MAX_QUALIFIERS_PER_ZONE, getZoneBracketValidation, getZoneMatchups, getZoneValidationMessage } from "../../utils/zoneFormat";

function getMatchRows(zone) {
  if (zone.matches?.length) {
    return zone.matches.map((match, index) => ({
      id: match.id || `${zone.id}-match-${index}`,
      playerA: match.playerA,
      playerB: match.playerB,
      status: match.status || match.score || "Pendiente",
    }));
  }

  return getZoneMatchups(zone.players || []).map(([playerA, playerB], index) => ({
    id: `${zone.id}-match-${index}`,
    playerA,
    playerB,
    status: "Pendiente",
  }));
}

function getZoneLeaders(zone) {
  if (zone.standings?.length) {
    return [...zone.standings]
      .sort((a, b) => Number(a.position || 9999) - Number(b.position || 9999))
      .slice(0, 2)
      .map((standing) => standing.playerName || standing.fullName || standing.name || standing.player || "A definir");
  }
  return (zone.players || []).slice(0, 2).map((player) => player.fullName || player.name || player);
}

export function ZoneStageBoard({
  bracket,
  editable = false,
  onQualifierChange,
  onGenerateBracket,
  generationMessage = "",
}) {
  const zones = bracket?.zones || [];
  const totalQualifiers = zones.reduce((total, zone) => total + Number(zone.qualifiers || 0), 0);
  const validation = bracket?.zoneValidation || getZoneBracketValidation(totalQualifiers);
  const message = generationMessage || bracket?.zoneClassificationStatus || getZoneValidationMessage(validation);
  const canGenerate = editable && zones.length > 0 && validation.valid;

  if (!zones.length) return null;

  return (
    <section className="zone-stage">
      <div className="zone-stage-toolbar">
        <div>
          <strong>Fase de zonas</strong>
          <span>{zones.length} zonas / {totalQualifiers} clasificados</span>
          <div className="zone-stage-preview" aria-label="Vista previa de llave de zonas">
            <small>Total clasificados <b>{validation.total}</b></small>
            <small>Llave objetivo <b>{validation.target}</b></small>
            <small>Directo a {validation.directRoundName || "-"} <b>{validation.directPlayers}</b></small>
            <small>
              {validation.accessMatches
                ? `${validation.accessRoundName}: ${validation.accessPlayers} jugadores / ${validation.accessMatches} partidos`
                : "Sin ronda de acceso"}
            </small>
          </div>
        </div>
        <div className={validation.valid ? "zone-stage-validation is-valid" : "zone-stage-validation is-invalid"}>
          <Badge tone={validation.valid ? "success" : "warning"}>{validation.valid ? `Llave ${validation.target}` : `Objetivo ${validation.target}`}</Badge>
          <span>{message}</span>
        </div>
        {editable ? (
          <Button icon={GitBranch} disabled={!canGenerate} onClick={onGenerateBracket}>Generar llaves</Button>
        ) : null}
      </div>

      <div className="zone-stage-scroll" aria-label="Zonas del torneo">
        <div className="zone-stage-track">
          {zones.map((zone) => {
            const matches = getMatchRows(zone);
            return (
              <article key={zone.id} className="zone-stage-card">
                <header className="zone-stage-card__header">
                  <strong>{zone.name}</strong>
                  <div className="zone-winner-control" aria-label={`Ganadores ${zone.name}`}>
                    <span>GANADORES</span>
                    {Array.from({ length: Math.min(ZONE_MAX_QUALIFIERS_PER_ZONE, zone.size || zone.players?.length || 2) }, (_, index) => index + 1).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={Number(zone.qualifiers || 0) === value ? "is-active" : ""}
                        disabled={!editable}
                        onClick={() => onQualifierChange?.(zone.id, value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </header>
                <div className="zone-leaders" aria-label={`Posiciones ${zone.name}`}>
                  {getZoneLeaders(zone).map((playerName, index) => (
                    <div key={`${zone.id}-leader-${index + 1}`} className={index === 0 ? "zone-leader is-first" : "zone-leader"}>
                      <span>{index + 1}.</span>
                      <strong title={playerName}>{playerName}</strong>
                    </div>
                  ))}
                </div>

                <div className="zone-match-list">
                  {matches.map((match) => (
                    <div key={match.id} className="zone-match-card">
                      <div>
                        <strong title={match.playerA}>{match.playerA}</strong>
                        <strong title={match.playerB}>{match.playerB}</strong>
                      </div>
                      <Badge tone={match.status === "Finalizado" ? "success" : "info"}>{match.status}</Badge>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
