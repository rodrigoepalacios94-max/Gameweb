import { formatResultSets } from "../../utils/matchFormat.js";
import {
  bestResultPerformanceScore,
  performanceMetricsFromSets,
} from "../../utils/bestResultPerformance.js";

function createPayloadError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function normalizeDbStatus(status, resultType) {
  if (resultType === "BYE") return "finished";
  const normalized = String(status || "").trim().toLowerCase();
  if (["finalizado", "finished"].includes(normalized)) return "finished";
  if (["en juego", "in_progress"].includes(normalized)) return "in_progress";
  if (["programado", "scheduled"].includes(normalized)) return "scheduled";
  if (["suspendido", "rescheduled"].includes(normalized)) return "rescheduled";
  if (["pendiente", "pending", "pendiente de asistencia"].includes(normalized)) return "pending";
  if (["doble w.o.", "double w.o.", "standby"].includes(normalized)) return "standby";
  return "pending";
}
function uiSetToPayload(set, index) {
  return {
    setNumber: Number(set.setNumber || index + 1),
    player1Score: Number(set.player1Score ?? set.playerAScore ?? set.playerA ?? set.a ?? 0),
    player2Score: Number(set.player2Score ?? set.playerBScore ?? set.playerB ?? set.b ?? 0),
    type: set.type || (set.superTieBreak ? "super_tiebreak" : "set"),
  };
}

function preliminaryPerformanceFromSets(match, playerId) {
  const isPlayerA = match.playerAId === playerId;
  const isPlayerB = match.playerBId === playerId;
  if (!isPlayerA && !isPlayerB) return { score: -999, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
  const totals = performanceMetricsFromSets(match.sets || [], { isPlayerA });
  const resultType = String(match.resultType || match.resultDetail?.type || "").toUpperCase();
  const administrativeLoss = match.loserId === playerId && ["WO", "DOUBLE_WO"].includes(resultType);
  return {
    ...totals,
    score: administrativeLoss
      ? -999
      : bestResultPerformanceScore(totals),
  };
}

function getResultType(match) {
  if (match.resultDetail?.type) return match.resultDetail.type;
  if (match.bye) return "BYE";
  return "NORMAL";
}

function getResultText(match) {
  if (match.result) return match.result;
  if (match.sets?.length) return formatResultSets(match.sets);
  return null;
}

function matchPlayerName(match, slot) {
  return slot === 1 ? match.playerA : match.playerB;
}

function matchPlayerId(match, slot) {
  return slot === 1 ? match.playerAId : match.playerBId;
}

function makeTempId(prefix, ...parts) {
  return [prefix, ...parts].filter((part) => part !== null && part !== undefined && part !== "").join("::");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function readRoundMatchTempId(round, match, matchIndex) {
  return match.matchId || makeTempId("round", round.id || round.name, match.id || matchIndex + 1);
}

function readRoundSlotTempId(round, match, matchIndex) {
  return makeTempId("round", round.id || round.name, match.id || matchIndex + 1);
}

function collectRoundMatches(bracket, matchMap) {
  (bracket.rounds || []).forEach((round, roundIndex) => {
    (round.matches || []).forEach((match, matchIndex) => {
      const tempId = readRoundMatchTempId(round, match, matchIndex);
      match.matchId = tempId;
      if (matchMap.has(tempId)) return;
      matchMap.set(tempId, {
        tempId,
        phase: "Cuadro principal",
        roundName: round.name,
        roundIndex,
        bracketSlot: matchIndex + 1,
        status: "pending",
        player1Id: match.playerAId || null,
        player2Id: match.playerBId || null,
        resultType: "NORMAL",
        resultText: null,
        resultDetail: {},
        sets: [],
        metadata: {
          structural: Boolean(match.structuralPlaceholder || (!match.playerAId && !match.playerBId)),
          sportingSlotKey: match.sportingSlotKey || `${bracket.category || "category"}:${round.id || round.name}:${matchIndex + 1}`,
          bracketMatchId: match.id,
          connectionNote: match.connectionNote || null,
          playerALabel: match.playerA || null,
          playerBLabel: match.playerB || null,
          playerASource: match.playerASource || null,
          playerBSource: match.playerBSource || null,
        },
      });
    });
  });
}

function collectPhysicalMatches(db, bracket, matchMap) {
  const zoneByName = new Map((bracket.zones || []).map((zone) => [zone.name, zone.id]));
  db.matches.forEach((match) => {
    const resultType = getResultType(match);
    matchMap.set(match.id, {
      tempId: match.id,
      phase: match.phase === "BYE" ? "Cuadro principal" : match.phase || "Cuadro principal",
      roundName: match.round || match.phase,
      roundIndex: 0,
      bracketSlot: 0,
      status: normalizeDbStatus(match.status, resultType),
      player1Id: match.playerAId || null,
      player2Id: match.playerBId || null,
      winnerId: match.winnerId || null,
      loserId: match.loserId || null,
      resultType,
      resultText: getResultText(match),
      resultDetail: match.resultDetail || {},
      zoneTempId: match.phase === "Zonas" ? zoneByName.get(match.round) || null : null,
      sets: (match.sets || []).map(uiSetToPayload),
      metadata: {
        ...(match.metadata || {}),
        connectionNote: match.connectionNote || null,
        bye: Boolean(match.bye),
        byeSource: match.byeSource || null,
        playerALabel: match.playerA || null,
        playerBLabel: match.playerB || null,
      },
    });
  });
}

function collectPreliminaryByes(bracket, matchMap) {
  (bracket.preliminaries || []).forEach((match, index) => {
    if (!match.bye || match.matchId) return;
    const tempId = makeTempId("preliminary-bye", match.byePlayerId || match.playerA || index + 1);
    match.matchId = tempId;
    matchMap.set(tempId, {
      tempId,
      phase: "Preliminar",
      roundName: "Preliminar",
      roundIndex: -1,
      bracketSlot: index + 1,
      status: "finished",
      player1Id: match.byePlayerId || null,
      player2Id: null,
      winnerId: match.byePlayerId || null,
      loserId: null,
      resultType: "BYE",
      resultText: "6-0 / 6-0",
      resultDetail: { type: "BYE", source: "Preliminar", note: match.result || "Clasifica directo por ranking de categoria." },
      sets: [
        { setNumber: 1, player1Score: 6, player2Score: 0, type: "set" },
        { setNumber: 2, player1Score: 6, player2Score: 0, type: "set" },
      ],
      metadata: {
        bye: true,
        playerALabel: match.playerA || null,
        playerBLabel: "BYE",
      },
    });
  });
}

function enrichRoundMetadata(bracket, matchMap) {
  (bracket.rounds || []).forEach((round, roundIndex) => {
    (round.matches || []).forEach((match, matchIndex) => {
      const tempId = readRoundMatchTempId(round, match, matchIndex);
      const entry = matchMap.get(tempId);
      if (!entry) return;
      entry.roundIndex = roundIndex;
      entry.bracketSlot = matchIndex + 1;
      entry.metadata = {
        ...(entry.metadata || {}),
        bracketMatchId: match.id,
        connectionNote: match.connectionNote || entry.metadata?.connectionNote || null,
        playerALabel: match.playerA || entry.metadata?.playerALabel || null,
        playerBLabel: match.playerB || entry.metadata?.playerBLabel || null,
        playerASource: match.playerASource || entry.metadata?.playerASource || null,
        playerBSource: match.playerBSource || entry.metadata?.playerBSource || null,
      };
    });
  });
}

function findChildByWinnerLabel(parentRound, parentIndex, nextRound) {
  const label = `Ganador ${parentRound.name} ${parentIndex + 1}`;
  for (const [childIndex, childMatch] of (nextRound.matches || []).entries()) {
    if (matchPlayerName(childMatch, 1) === label) return { childMatch, childIndex, childSlot: 1 };
    if (matchPlayerName(childMatch, 2) === label) return { childMatch, childIndex, childSlot: 2 };
  }
  return null;
}

function findChildByWinnerLabelInLaterRounds(parentRound, parentIndex, rounds, startIndex) {
  for (let roundIndex = startIndex; roundIndex < rounds.length; roundIndex += 1) {
    const child = findChildByWinnerLabel(parentRound, parentIndex, rounds[roundIndex]);
    if (child) return { ...child, childRound: rounds[roundIndex] };
  }
  return null;
}

function fallbackChild(parentRound, parentIndex, nextRound) {
  if (nextRound?.skipIncomingFallback) return null;
  const isRoundOf32 = String(parentRound.id || parentRound.name || "").includes("32");
  const useEdgeSlots = isRoundOf32 && nextRound.matches.length > 1 && (parentRound.matches || []).length === 2;
  const childIndex = useEdgeSlots
    ? (parentIndex === 0 ? 0 : nextRound.matches.length - 1)
    : Math.floor(parentIndex / 2);
  const childMatch = nextRound.matches[childIndex];
  if (!childMatch) return null;
  return {
    childMatch,
    childIndex,
    childSlot: useEdgeSlots ? 2 : (parentIndex % 2 === 0 ? 1 : 2),
    childRound: nextRound,
    inferred: true,
  };
}

function isOpenFallbackSlot(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized
    || normalized === "a definir"
    || normalized === "bye"
    || normalized.startsWith("clasificado")
    || normalized.startsWith("ganador ");
}

function assertChildSlotIsFree(parentRound, parentIndex, child, childTempId) {
  const childPlayerId = matchPlayerId(child.childMatch, child.childSlot);
  if (childPlayerId) {
    throw createPayloadError("La llave generada intenta conectar un ganador a un slot ya ocupado.", {
      code: "OVERFILLED_MATCH_CONNECTION_SLOT",
      parentRound: parentRound.name,
      parentMatch: parentIndex + 1,
      childTempId,
      childSlot: child.childSlot,
      childPlayerId,
    });
  }
  if (child.inferred && !isOpenFallbackSlot(matchPlayerName(child.childMatch, child.childSlot))) {
    throw createPayloadError("La llave generada intenta inferir una conexion sobre un slot con etiqueta concreta.", {
      code: "OVERFILLED_MATCH_CONNECTION_LABEL",
      parentRound: parentRound.name,
      parentMatch: parentIndex + 1,
      childTempId,
      childSlot: child.childSlot,
      childLabel: matchPlayerName(child.childMatch, child.childSlot),
    });
  }
}

function buildConnections(bracket) {
  const connections = [];
  const seenEdges = new Set();
  const seenChildSlots = new Set();
  const rounds = bracket.rounds || [];
  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const round = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1];
    (round.matches || []).forEach((match, matchIndex) => {
      const parentTempId = readRoundMatchTempId(round, match, matchIndex);
      const child = findChildByWinnerLabelInLaterRounds(round, matchIndex, rounds, roundIndex + 1)
        || fallbackChild(round, matchIndex, nextRound);
      if (!child) {
        throw createPayloadError("La llave generada deja un partido sin progresion definida.", {
          code: "ORPHAN_MATCH_PROGRESSION",
          parentTempId,
          parentRound: round.name,
          parentMatch: matchIndex + 1,
        });
      }
      const childTempId = readRoundMatchTempId(child.childRound, child.childMatch, child.childIndex);
      if (!parentTempId || !childTempId || parentTempId === childTempId) return;
      assertChildSlotIsFree(round, matchIndex, child, childTempId);
      const edgeKey = `${parentTempId}->${childTempId}:${child.childSlot}`;
      if (seenEdges.has(edgeKey)) return;
      const childSlotKey = `${childTempId}:${child.childSlot}`;
      if (seenChildSlots.has(childSlotKey)) {
        throw createPayloadError("La llave generada intenta conectar dos ganadores al mismo slot.", {
          code: "DUPLICATE_MATCH_CONNECTION_SLOT",
          childTempId,
          childSlot: child.childSlot,
        });
      }
      seenEdges.add(edgeKey);
      seenChildSlots.add(childSlotKey);
      connections.push({ parentTempId, childTempId, childSlot: child.childSlot });
    });
  }
  return connections;
}

function buildPreliminaryRankings(bracket, db) {
  const rows = [];
  (bracket.preliminaries || []).forEach((match, index) => {
    if (!match.byePlayerId) return;
    rows.push({
      playerId: match.byePlayerId,
      matchTempId: match.matchId || null,
      position: index + 1,
      role: "bye_preliminar",
      won: true,
      performanceScore: 0,
      setsWon: 2,
      setsLost: 0,
      gamesWon: 12,
      gamesLost: 0,
    });
  });
  db.matches
    .filter((match) => match.phase === "Preliminar" && match.winnerId)
    .forEach((match, index) => {
      [match.playerAId, match.playerBId].filter(Boolean).forEach((playerId) => {
        const won = match.winnerId === playerId;
        const metrics = preliminaryPerformanceFromSets(match, playerId);
        rows.push({
          playerId,
          matchTempId: match.id,
          position: index + 1,
          role: won ? "ganador_preliminar" : "perdedor_preliminar",
          won,
          performanceScore: metrics.score,
          setsWon: metrics.setsWon || 0,
          setsLost: metrics.setsLost || 0,
          gamesWon: metrics.gamesWon || 0,
          gamesLost: metrics.gamesLost || 0,
        });
      });
    });
  return rows;
}

export function applyDbIdsToBracket(bracket, rpcResult) {
  const matchIds = rpcResult?.matchIds || {};
  const zoneIds = rpcResult?.zoneIds || {};
  const copy = cloneJson(bracket);
  (copy.preliminaries || []).forEach((match) => {
    if (match.matchId && matchIds[match.matchId]) match.matchId = matchIds[match.matchId];
  });
  (copy.directByes || []).forEach((match) => {
    if (match.matchId && matchIds[match.matchId]) match.matchId = matchIds[match.matchId];
  });
  (copy.rounds || []).forEach((round) => {
    (round.matches || []).forEach((match) => {
      if (match.matchId && matchIds[match.matchId]) match.matchId = matchIds[match.matchId];
    });
  });
  (copy.zones || []).forEach((zone) => {
    zone.tempId = zone.id;
    if (zone.id && zoneIds[zone.id]) zone.id = zoneIds[zone.id];
  });
  return copy;
}

export function buildTournamentStagePayload(db, bracket, stage, options = {}) {
  const matchMap = new Map();
  collectPhysicalMatches(db, bracket, matchMap);
  collectRoundMatches(bracket, matchMap);
  collectPreliminaryByes(bracket, matchMap);
  enrichRoundMetadata(bracket, matchMap);

  const zones = (bracket.zones || []).map((zone) => ({
    tempId: zone.id,
    name: zone.name,
    qualifiersCount: Number(zone.qualifiers || 1),
    status: zone.status === "Finalizada" ? "finished" : "pending",
    players: (zone.playerIds || []).map((playerId, index) => ({
      playerId,
      seedOrder: Number(zone.seedOrders?.[index] || index + 1),
      finalPosition: null,
      qualified: false,
      statsSnapshot: {},
    })),
  }));

  const bracketData = cloneJson(bracket);
  return {
    format: stage.format,
    size: (bracket.rounds?.[0]?.matches?.length || 0) * 2 || stage.participants?.length || 0,
    stageLabel: stage.format === "Zonas" ? "Zonas en juego" : "Cuadro generado",
    stageMetadata: {
      participants: stage.participants || [],
      inscriptionsCount: stage.inscriptionsCount || 0,
      bracketKey: stage.bracketKey,
      zonesConfig: stage.zonesConfig || null,
    },
    bracketData,
    zones,
    matches: [...matchMap.values()],
    connections: buildConnections(bracket),
    preliminaryRankings: buildPreliminaryRankings(bracket, db),
    allowFinishedPreliminaries: Boolean(options.allowFinishedPreliminaries),
    allowFinishedZones: Boolean(options.allowFinishedZones),
    manualRegeneration: Boolean(options.manualRegeneration),
  };
}

export function buildZoneEliminationPayload(db, bracket, stage, options = {}) {
  const payload = buildTournamentStagePayload(db, bracket, stage, options);
  const mainDrawTempIds = new Set(
    payload.matches
      .filter((match) => match.phase === "Cuadro principal")
      .map((match) => match.tempId)
  );

  return {
    ...payload,
    stageLabel: "Cuadro generado",
    matches: payload.matches.filter((match) => mainDrawTempIds.has(match.tempId)),
    connections: payload.connections.filter((connection) =>
      mainDrawTempIds.has(connection.parentTempId) &&
      mainDrawTempIds.has(connection.childTempId)
    ),
    zones: [],
    preliminaryRankings: [],
    allowFinishedZones: Boolean(options.allowFinishedZones),
  };
}
