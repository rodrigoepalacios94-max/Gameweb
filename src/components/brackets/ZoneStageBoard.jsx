import { useEffect, useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { getZoneBracketValidation, getZoneCompletionOptions, getZoneMatchups } from "../../utils/zoneFormat";

function getMatchRows(zone) {
  if (zone.matches?.length) {
    return zone.matches.map((match, index) => ({
      id: match.id || `${zone.id}-match-${index}`,
      matchId: match.id && match.playerAId && match.playerBId && match.resultType !== "BYE" ? match.id : null,
      playerAId: match.playerAId || null,
      playerA: match.playerA,
      playerBId: match.playerBId || null,
      playerB: match.playerB,
      status: match.status || match.score || "Pendiente",
      result: match.result || "",
      resultType: match.resultType || "NORMAL",
    }));
  }

  return getZoneMatchups(zone.players || []).map(([playerA, playerB], index) => ({
    id: `${zone.id}-match-${index}`,
    matchId: null,
    playerAId: null,
    playerA,
    playerBId: null,
    playerB,
    status: "Pendiente",
    result: "",
    resultType: "NORMAL",
  }));
}

function getZoneChampionName(zones) {
  const zone = zones?.[0];
  if (!zone) return "";
  if (zone.standingsResolved === false) return "";
  if (zone.standings?.length) {
    const leader = [...zone.standings].sort((a, b) => Number(a.position || 9999) - Number(b.position || 9999))[0];
    return leader?.playerName || leader?.fullName || leader?.name || leader?.player || "";
  }
  const player = zone.players?.[0];
  return player?.fullName || player?.name || player || "";
}

function roundNameForTarget(target) {
  if (target === 4) return "Semifinales";
  if (target === 8) return "Cuartos";
  if (target === 16) return "8vos";
  if (target === 32) return "16avos";
  return "llave";
}

function getFriendlyCompletionOption(option, zones = [], index = 0, totalOptions = 1) {
  const zoneCount = zones.length;
  const target = Number(option.target || option.finalDrawPlayers || 0);
  const roundName = roundNameForTarget(target);
  const label = totalOptions > 1 ? `Opción ${String.fromCharCode(65 + index)}` : "Formato de clasificación";

  if (option.id === "best-next") {
    const firsts = Math.min(zoneCount, Number(option.currentQualifiers || zoneCount));
    const seconds = Number(option.addedPlayers || 0);
    const allSecondsAdvance = seconds === zoneCount && firsts === zoneCount;
    return {
      eyebrow: label,
      title: allSecondsAdvance
        ? "Clasifican 1° y 2° de cada zona"
        : `${firsts} primeros de zona + ${seconds} mejores segundos`,
      description: allSecondsAdvance
        ? `${target} clasificados · ${roundName}`
        : `${target} clasificados · todos entran en ${roundName}`,
    };
  }
  if (option.id === "expand-zone-qualifiers") {
    const total = Number(option.expandedQualifiers || option.finalDrawPlayers || option.target || 0);
    const direct = Number(option.directPlayers || 0);
    const accessPlayers = Number(option.accessPlayers || 0);
    const accessMatches = Number(option.accessMatches || 0);
    return {
      eyebrow: label,
      title: `1° y 2° de cada zona`,
      description: accessMatches
        ? `${total} clasificados · ${direct} directos + ${accessPlayers} juegan ${accessMatches} accesos · ${roundName}`
        : `${total} clasificados · ${roundName}`,
    };
  }
  return {
    eyebrow: label,
    title: option.title || "Opción de clasificación",
    description: option.description || "GAME valida esta alternativa antes de generar la llave.",
  };
}

export function ZoneStageBoard({
  bracket,
  editable = false,
  registrationClosed = true,
  onGenerateBracket,
  onMatchOpen,
}) {
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const zones = bracket?.zones || [];
  const totalQualifiers = zones.reduce((total, zone) => total + Number(zone.qualifiers || 0), 0);
  const validation = bracket?.zoneValidation || getZoneBracketValidation(totalQualifiers);
  const standingChampionMode = Boolean(bracket?.zoneStandingChampionMode || validation?.standingChampion);
  const standingChampionName = standingChampionMode ? getZoneChampionName(zones) : "";
  const completionOptions = getZoneCompletionOptions(zones, validation);
  const availableCompletionOptions = useMemo(
    () => completionOptions.filter((option) => option.available !== false),
    [completionOptions]
  );
  const selectedOption = availableCompletionOptions.find((option) => option.id === selectedStrategy) || null;
  const strategyRequired = editable && !standingChampionMode && availableCompletionOptions.length > 0;
  const strategyLocked = editable && !registrationClosed;
  const canGenerate = editable
    && !standingChampionMode
    && registrationClosed
    && zones.length > 0
    && (!strategyRequired || Boolean(selectedOption));

  useEffect(() => {
    const persistedStrategy = bracket?.zoneAccessPlan?.completionStrategy;
    const hasGeneratedBracket = Boolean(bracket?.zoneGeneratedAt);
    if (!registrationClosed) {
      setSelectedStrategy("");
      return;
    }
    if (hasGeneratedBracket && persistedStrategy && availableCompletionOptions.some((option) => option.id === persistedStrategy)) {
      setSelectedStrategy(persistedStrategy);
      return;
    }
    if (!availableCompletionOptions.some((option) => option.id === selectedStrategy)) {
      setSelectedStrategy("");
    }
  }, [availableCompletionOptions, bracket?.zoneAccessPlan?.completionStrategy, bracket?.zoneGeneratedAt, registrationClosed, selectedStrategy]);

  if (!zones.length) return null;

  function handleGenerate() {
    if (!canGenerate) return;
    if (selectedOption) {
      onGenerateBracket?.({ completionStrategy: selectedOption.id });
      return;
    }
    onGenerateBracket?.();
  }

  return (
    <section className="zone-stage">
      <div className="zone-stage-toolbar">
        <div>
          <strong>Fase de zonas</strong>
          {standingChampionMode ? (
            <span>{standingChampionName ? `Campeón: ${standingChampionName}` : "El campeón se define por la tabla de la zona."}</span>
          ) : null}
        </div>
        {editable && !standingChampionMode ? (
          <Button icon={GitBranch} disabled={!canGenerate} onClick={handleGenerate}>Generar llaves</Button>
        ) : null}
      </div>

      {editable && !standingChampionMode && availableCompletionOptions.length ? (
        <div className={strategyLocked ? "zone-completion-panel is-locked" : "zone-completion-panel"}>
          <div>
            <strong>¿Cómo querés definir los clasificados?</strong>
            <span>
              {strategyLocked
                ? "Cerrá las inscripciones para elegir el formato de clasificación."
                : "Elegí una estrategia antes de generar la llave."}
            </span>
          </div>
          <div className="zone-completion-options">
            {availableCompletionOptions.map((option, index) => {
              const friendly = getFriendlyCompletionOption(option, zones, index, availableCompletionOptions.length);
              const selected = selectedStrategy === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={[
                    selected ? "zone-completion-option is-selected" : "zone-completion-option",
                    strategyLocked ? "is-locked" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={strategyLocked}
                  onClick={() => {
                    if (!strategyLocked) setSelectedStrategy(option.id);
                  }}
                  aria-pressed={selected}
                >
                  <div>
                    <small>{strategyLocked ? `${friendly.eyebrow} - bloqueada` : friendly.eyebrow}</small>
                    <strong>{friendly.title}</strong>
                    <span>{friendly.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="zone-stage-scroll" aria-label="Zonas del torneo">
        <div className="zone-stage-track">
          {zones.map((zone) => {
            const matches = getMatchRows(zone);
            return (
              <article key={zone.id} className="zone-stage-card">
                <header className="zone-stage-card__header">
                  <strong>{zone.name}</strong>
                </header>

                <div className="zone-match-list">
                  {matches.map((match) => {
                    const canOpenMatch = Boolean(match.matchId && onMatchOpen);
                    const MatchComponent = canOpenMatch ? "button" : "div";
                    return (
                      <MatchComponent
                        key={match.id}
                        className={canOpenMatch ? "zone-match-card zone-match-card--clickable" : "zone-match-card"}
                        type={canOpenMatch ? "button" : undefined}
                        onClick={canOpenMatch ? () => onMatchOpen(match.matchId) : undefined}
                      >
                        <div>
                          <strong title={match.playerA}>{match.playerA}</strong>
                          <strong title={match.playerB}>{match.playerB}</strong>
                        </div>
                        <div className="zone-match-card__result">
                          <Badge tone={match.status === "Finalizado" ? "success" : match.status === "W.O." || match.status === "Doble W.O." ? "danger" : "info"}>{match.status}</Badge>
                          {match.result ? <small>{match.result}</small> : null}
                        </div>
                      </MatchComponent>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
