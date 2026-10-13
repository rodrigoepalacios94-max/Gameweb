import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import championCup from "../../assets/copa.png";
import { Button } from "../common/Button";
import { BracketMatch } from "./BracketMatch";

const ROUND_WIDTH = 260;
const ROUND_GAP = 86;
const MATCH_HEIGHT = 92;
const HEADER_HEIGHT = 44;
const CHAMPION_AREA_HEIGHT = 188;
const CHAMPION_WIDTH = 300;
const CHAMPION_HEIGHT = 148;
const CHAMPION_TOP = 18;
const TREE_SLOT_GAP = 116;
const TREE_EDGE_PADDING = 24;

const ROUND_KEYS = [
  { key: "round32", label: "32avos", names: ["32avos", "round-32"] },
  { key: "round16", label: "16avos", names: ["16avos", "round-16", "cuadro principal"] },
  { key: "octavos", label: "8vos", names: ["octavos", "8vos"] },
  { key: "cuartos", label: "Cuartos", names: ["cuartos"] },
  { key: "semifinal", label: "Semifinal", names: ["semifinal"] },
];

function normalize(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findRound(rounds, names) {
  const normalizedNames = names.map((name) => normalize(name));
  const exactRound = rounds.find((round) => {
    const roundId = normalize(round.id);
    const roundName = normalize(round.name);
    return normalizedNames.includes(roundId) || normalizedNames.includes(roundName);
  });
  if (exactRound) return exactRound;
  return rounds.find((round) => {
    const roundId = normalize(round.id);
    const roundName = normalize(round.name);
    return normalizedNames.some((name) => roundId.includes(name) || roundName.includes(name));
  });
}

function getMatchSide(match, index, count) {
  if (match?.logicalSide === "left" || match?.logicalSide === "right") return match.logicalSide;
  return index < Math.ceil(count / 2) ? "left" : "right";
}

function splitMatches(round) {
  const matches = round?.matches || [];
  return matches.reduce((groups, match, index) => {
    groups[getMatchSide(match, index, matches.length)].push({ ...match, __sourceIndex: index });
    return groups;
  }, { left: [], right: [] });
}

function getTreeMetrics(bracket) {
  const baseDrawSize = Number(bracket?.baseDrawSize || 16);
  const sideSlotCount = Math.max(baseDrawSize / 2, 2);
  const halfHeight = (sideSlotCount / 2 - 0.5) * TREE_SLOT_GAP + MATCH_HEIGHT / 2 + TREE_EDGE_PADDING;
  return {
    baseDrawSize,
    sideSlotCount,
    centerY: halfHeight,
    height: halfHeight * 2,
    slotGap: TREE_SLOT_GAP,
  };
}

function getMatchTop(match, index, count, metrics) {
  if (!count) return 0;
  if (
    Number.isFinite(match?.treeSlotStart)
    && Number.isFinite(match?.treeSlotSpan)
    && (match.logicalSide === "left" || match.logicalSide === "right")
  ) {
    const localStart = match.logicalSide === "right" ? match.treeSlotStart - metrics.baseDrawSize / 2 : match.treeSlotStart;
    const localCenter = localStart + match.treeSlotSpan / 2;
    return metrics.centerY + (localCenter - metrics.sideSlotCount / 2) * metrics.slotGap - MATCH_HEIGHT / 2;
  }
  return ((index + 0.5) / count) * metrics.height - MATCH_HEIGHT / 2;
}

function getColumnX(index) {
  return index * (ROUND_WIDTH + ROUND_GAP);
}

function getColumnPoint(column, position, edge) {
  const x = getColumnX(column.index) + (edge === "left" ? 0 : ROUND_WIDTH);
  const y = HEADER_HEIGHT + CHAMPION_AREA_HEIGHT + position.top + MATCH_HEIGHT / 2;
  return { x, y };
}

function buildSideConnections(columns, side) {
  const connections = [];
  const outerToInner = side === "left" ? columns : [...columns].reverse();

  for (let columnIndex = 0; columnIndex < outerToInner.length - 1; columnIndex += 1) {
    const sourceColumn = outerToInner[columnIndex];
    const targetColumn = outerToInner[columnIndex + 1];
    sourceColumn.positions.forEach((source, sourceIndex) => {
      const targetIndex = sourceColumn.key === "round32"
        ? side === "left" ? 0 : targetColumn.positions.length - 1
        : Math.min(Math.floor(sourceIndex / 2), targetColumn.positions.length - 1);
      const target = targetColumn.positions[targetIndex];
      if (!target) return;
      connections.push({
        id: `${side}-${sourceColumn.key}-${source.match.id}-${targetColumn.key}-${target.match.id}`,
        from: getColumnPoint(sourceColumn, source, side === "left" ? "right" : "left"),
        to: getColumnPoint(targetColumn, target, side === "left" ? "left" : "right"),
        active: Boolean(source.match.winner),
      });
    });
  }

  return connections;
}

function buildFinalConnections(leftColumns, finalColumn, rightColumns) {
  const leftSemi = leftColumns[leftColumns.length - 1]?.positions[0];
  const rightSemi = rightColumns[0]?.positions[0];
  const finalMatch = finalColumn.positions[0];
  if (!finalMatch) return [];
  return [
    leftSemi ? {
      id: "left-final",
      from: getColumnPoint(leftColumns[leftColumns.length - 1], leftSemi, "right"),
      to: getColumnPoint(finalColumn, finalMatch, "left"),
      active: Boolean(leftSemi.match.winner),
    } : null,
    rightSemi ? {
      id: "right-final",
      from: getColumnPoint(rightColumns[0], rightSemi, "left"),
      to: getColumnPoint(finalColumn, finalMatch, "right"),
      active: Boolean(rightSemi.match.winner),
    } : null,
  ].filter(Boolean);
}

function buildExplicitConnections(columns) {
  const positionsByMatchId = new Map();
  columns.forEach((column) => {
    column.positions.forEach((position) => {
      if (position.match.matchId) positionsByMatchId.set(position.match.matchId, { column, position });
    });
  });

  return columns.flatMap((column) =>
    column.positions.map((position) => {
      const target = positionsByMatchId.get(position.match.childMatchId);
      if (!target) return null;
      if (!isBracketConnectionRenderable(column, target.column)) return null;
      const movesRight = column.index < target.column.index;
      return {
        id: `explicit-${position.match.matchId}-${position.match.childMatchId}`,
        from: getColumnPoint(column, position, movesRight ? "right" : "left"),
        to: getColumnPoint(target.column, target.position, movesRight ? "left" : "right"),
        active: Boolean(position.match.winner),
      };
    }).filter(Boolean),
  );
}

function isBracketConnectionRenderable(sourceColumn, targetColumn) {
  if (!sourceColumn || !targetColumn) return false;
  if (targetColumn.key === "final") return true;
  if (sourceColumn.side && targetColumn.side && sourceColumn.side !== targetColumn.side) return false;
  return sourceColumn.index !== targetColumn.index;
}

function parseWinnerReference(value) {
  const match = String(value || "").trim().match(/^Ganador\s+(.+?)\s+(\d+)$/i);
  if (!match) return null;
  return {
    roundName: normalize(match[1]),
    matchIndex: Number(match[2]) - 1,
  };
}

function buildLabelConnections(columns) {
  const positionsByRoundAndIndex = new Map();
  columns.forEach((column) => {
    const roundName = normalize(column.round?.name || column.label || column.key);
    column.positions.forEach((position) => {
      const sourceIndex = Number.isFinite(position.match.__sourceIndex)
        ? position.match.__sourceIndex
        : column.positions.indexOf(position);
      positionsByRoundAndIndex.set(`${roundName}:${sourceIndex}`, { column, position });
    });
  });

  const connections = [];
  const seen = new Set();
  columns.forEach((targetColumn) => {
    targetColumn.positions.forEach((targetPosition) => {
      [
        { slot: 1, label: targetPosition.match.playerA },
        { slot: 2, label: targetPosition.match.playerB },
      ].forEach(({ slot, label }) => {
        const reference = parseWinnerReference(label);
        if (!reference) return;
        const source = positionsByRoundAndIndex.get(`${reference.roundName}:${reference.matchIndex}`);
        if (!source || source.position === targetPosition) return;
        if (!isBracketConnectionRenderable(source.column, targetColumn)) return;
        const key = `${source.column.key}:${reference.matchIndex}->${targetColumn.key}:${targetPosition.match.matchId || targetPosition.match.id}:${slot}`;
        if (seen.has(key)) return;
        seen.add(key);
        const movesRight = source.column.index < targetColumn.index;
        connections.push({
          id: `label-${key}`,
          from: getColumnPoint(source.column, source.position, movesRight ? "right" : "left"),
          to: getColumnPoint(targetColumn, targetPosition, movesRight ? "left" : "right"),
          active: Boolean(source.position.match.winner),
        });
      });
    });
  });
  return connections;
}

function getPositionCenter(position) {
  return position.top + MATCH_HEIGHT / 2;
}

function validateLayoutGeometry(bracket, columns, champion, metrics) {
  const errors = [];
  const positionsByMatchId = new Map();
  columns.forEach((column) => {
    const sorted = [...column.positions].sort((a, b) => a.top - b.top);
    sorted.forEach((position, index) => {
      if (position.top < -0.5 || position.top + MATCH_HEIGHT > metrics.height + 0.5) {
        errors.push(`${column.label}: ${position.match.matchId} queda fuera del canvas vertical.`);
      }
      const next = sorted[index + 1];
      if (next && next.top < position.top + MATCH_HEIGHT) {
        errors.push(`${column.label}: ${position.match.matchId} se superpone con ${next.match.matchId}.`);
      }
      if (position.match.matchId) positionsByMatchId.set(position.match.matchId, { column, position });
    });
  });

  const finalPosition = columns.find((column) => column.key === "final")?.positions?.[0];
  if (finalPosition && Math.abs(getPositionCenter(finalPosition) - metrics.centerY) > 0.5) {
    errors.push(`Final fuera del eje central: esperado ${metrics.centerY}, real ${getPositionCenter(finalPosition)}.`);
  }
  if (champion && finalPosition && Math.abs(champion.centerX - (getColumnX(columns.find((column) => column.key === "final").index) + ROUND_WIDTH / 2)) > 0.5) {
    errors.push("La copa no comparte el centro X de la final.");
  }

  const parentsByChild = new Map();
  positionsByMatchId.forEach(({ position }, matchId) => {
    if (!position.match.childMatchId) return;
    const current = parentsByChild.get(position.match.childMatchId) || [];
    current.push({ matchId, position });
    parentsByChild.set(position.match.childMatchId, current);
  });
  parentsByChild.forEach((parents, childMatchId) => {
    const child = positionsByMatchId.get(childMatchId);
    if (!child || parents.length !== 2) return;
    const expected = (getPositionCenter(parents[0].position) + getPositionCenter(parents[1].position)) / 2;
    const actual = getPositionCenter(child.position);
    if (Math.abs(expected - actual) > 0.5) {
      errors.push(`${childMatchId}: centro esperado ${expected}, real ${actual}; padres ${parents.map((item) => item.matchId).join(", ")}.`);
    }
  });

  const leftOffsets = new Map();
  const rightOffsets = new Map();
  columns.forEach((column) => {
    if (column.side !== "left" && column.side !== "right") return;
    const target = column.side === "left" ? leftOffsets : rightOffsets;
    target.set(column.key, column.positions.map((position) => Math.round(Math.abs(getPositionCenter(position) - metrics.centerY))).sort((a, b) => a - b));
  });
  leftOffsets.forEach((offsets, key) => {
    const right = rightOffsets.get(key);
    if (right != null && right.length === offsets.length && right.join(",") !== offsets.join(",")) {
      errors.push(`${key}: offsets izquierda ${offsets.join(",")}; derecha ${right.join(",")}.`);
    }
  });

  if (errors.length && import.meta.env.DEV) {
    console.error(`Layout de bracket invalido${bracket?.categoryName ? ` - ${bracket.categoryName}` : ""}`, errors);
  }
  return errors;
}

function getFinalWinner(finalMatch, bracket) {
  if (!finalMatch || !bracket?.champion) return null;
  const winnerName = finalMatch.winner || bracket.champion;
  if (!winnerName) return null;
  return {
    name: winnerName,
    matchId: finalMatch.matchId,
  };
}

function connectionPath(connection) {
  const midX = connection.from.x + (connection.to.x - connection.from.x) / 2;
  return `M ${connection.from.x} ${connection.from.y} H ${midX} V ${connection.to.y} H ${connection.to.x}`;
}

export function TournamentBracket({ bracket, detailBasePath = "/admin/matches", onMatchOpen }) {
  const scrollRef = useRef(null);
  const dragState = useRef({ active: false, pointerId: null, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const layout = useMemo(() => {
    const rounds = bracket?.rounds || [];
    const metrics = getTreeMetrics(bracket);
    const splitRounds = ROUND_KEYS.map((roundSpec) => {
      const round = findRound(rounds, roundSpec.names);
      return {
        ...roundSpec,
        round,
        ...splitMatches(round),
      };
    }).filter((round) => round.left.length || round.right.length);

    const finalRound = findRound(rounds, ["final"]);
    const leftColumns = splitRounds
      .map((round) => ({ ...round, side: "left", matches: round.left }))
      .filter((round) => round.matches.length);
    const rightOuterToInner = splitRounds
      .map((round) => ({ ...round, side: "right", matches: round.right }))
      .filter((round) => round.matches.length);
    const rightColumns = [...rightOuterToInner].reverse();

    const visualColumns = [
      ...leftColumns,
      { key: "final", label: "Final", side: "center", matches: finalRound?.matches || [] },
      ...rightColumns,
    ].map((column, index) => ({
      ...column,
      index,
      positions: column.matches.map((match, matchIndex) => ({
        match,
        top: column.key === "final"
          ? metrics.centerY - MATCH_HEIGHT / 2
          : getMatchTop(match, matchIndex, column.matches.length, metrics),
      })),
    }));

    const leftVisual = visualColumns.filter((column) => column.side === "left");
    const finalColumn = visualColumns.find((column) => column.key === "final");
    const rightVisual = visualColumns.filter((column) => column.side === "right");
    const explicitConnections = buildExplicitConnections(visualColumns);
    const labelConnections = buildLabelConnections(visualColumns);
    const connections = explicitConnections.length
      ? explicitConnections
      : labelConnections;
    const finalPosition = finalColumn?.positions?.[0] || null;
    const champion = getFinalWinner(finalPosition?.match, bracket);
    const championLayout = champion && finalColumn && finalPosition
      ? {
          ...champion,
          x: getColumnX(finalColumn.index) + ROUND_WIDTH / 2 - CHAMPION_WIDTH / 2,
          y: HEADER_HEIGHT + CHAMPION_TOP,
          centerX: getColumnX(finalColumn.index) + ROUND_WIDTH / 2,
          lineStartY: HEADER_HEIGHT + CHAMPION_AREA_HEIGHT + finalPosition.top,
          lineEndY: HEADER_HEIGHT + CHAMPION_TOP + CHAMPION_HEIGHT,
        }
      : null;
    const layoutErrors = validateLayoutGeometry(bracket, visualColumns, championLayout, metrics);

    return {
      columns: visualColumns,
      connections,
      champion: championLayout,
      treeHeight: metrics.height,
      layoutErrors,
      width: visualColumns.length * ROUND_WIDTH + Math.max(visualColumns.length - 1, 0) * ROUND_GAP,
    };
  }, [bracket]);

  function centerBracket(behavior = "auto") {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({
      left: Math.max((scroller.scrollWidth - scroller.clientWidth) / 2, 0),
      behavior,
    });
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => centerBracket("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [layout.width]);

  useEffect(() => {
    if (!dragging) return undefined;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [dragging]);

  function scrollByAmount(direction) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * Math.round(scroller.clientWidth * 0.65), behavior: "smooth" });
    setHasInteracted(true);
  }

  function handlePointerDown(event) {
    const target = event.target;
    if (event.button !== 0 || (target instanceof Element && target.closest(".bracket-match"))) return;
    dragState.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scrollRef.current?.scrollLeft || 0,
      scrollTop: scrollRef.current?.scrollTop || 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setHasInteracted(true);
  }

  function handlePointerMove(event) {
    if (!dragState.current.active || !scrollRef.current) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.current.startX;
    const deltaY = event.clientY - dragState.current.startY;
    if (Math.hypot(deltaX, deltaY) > 4) dragState.current.moved = true;
    scrollRef.current.scrollLeft = dragState.current.scrollLeft - deltaX;
    scrollRef.current.scrollTop = dragState.current.scrollTop - deltaY;
  }

  function stopDrag() {
    if (dragState.current.pointerId != null && scrollRef.current?.hasPointerCapture?.(dragState.current.pointerId)) {
      scrollRef.current.releasePointerCapture?.(dragState.current.pointerId);
    }
    dragState.current.active = false;
    dragState.current.pointerId = null;
    setDragging(false);
  }

  if (!layout.columns.length) return null;

  return (
    <section className="bracket-section bracket-main-section">
      <div className="section-title bracket-section-title">
        <span>Cuadro principal</span>
        <div className="bracket-controls">
          <Button variant="ghost" size="icon" icon={ChevronLeft} onClick={() => scrollByAmount(-1)}>Izquierda</Button>
          <Button variant="outline-green" size="sm" icon={Crosshair} onClick={() => centerBracket("smooth")}>Centrar llave</Button>
          <Button variant="ghost" size="icon" icon={ChevronRight} onClick={() => scrollByAmount(1)}>Derecha</Button>
        </div>
      </div>
      <p className={hasInteracted ? "bracket-hint is-muted" : "bracket-hint"}>Arrastra para explorar el cuadro en cualquier direccion. Tambien podes usar el scroll horizontal y vertical.</p>
      <div
        ref={scrollRef}
        className={dragging ? "bracket-scroll bracket-scroll--mirrored is-dragging" : "bracket-scroll bracket-scroll--mirrored"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerLeave={stopDrag}
      >
        <div
          className="bracket-board bracket-board--mirrored"
          style={{
            "--bracket-board-width": `${layout.width}px`,
            "--bracket-round-width": `${ROUND_WIDTH}px`,
            "--bracket-gap": `${ROUND_GAP}px`,
            "--bracket-height": `${layout.treeHeight}px`,
            "--bracket-header-height": `${HEADER_HEIGHT}px`,
            "--bracket-champion-area-height": `${CHAMPION_AREA_HEIGHT}px`,
            "--bracket-columns": layout.columns.length,
          }}
        >
          <svg className="bracket-connections" width={layout.width} height={layout.treeHeight + HEADER_HEIGHT + CHAMPION_AREA_HEIGHT} aria-hidden="true">
            {layout.champion ? (
              <path
                className="bracket-champion-line is-active"
                d={`M ${layout.champion.centerX} ${layout.champion.lineStartY} V ${layout.champion.lineEndY}`}
              />
            ) : null}
            {layout.connections.map((connection) => (
              <path key={connection.id} className={connection.active ? "bracket-connector is-active" : "bracket-connector"} d={connectionPath(connection)} />
            ))}
          </svg>
          {layout.champion ? (
            <div
              className="bracket-champion-card"
              style={{
                left: `${layout.champion.x}px`,
                top: `${layout.champion.y}px`,
              }}
            >
              <img src={championCup} alt="" />
              <span>CAMPEÓN</span>
              <strong title={layout.champion.name}>{layout.champion.name}</strong>
            </div>
          ) : null}
          {layout.columns.map((column) => (
            <section key={`${column.side}-${column.key}`} className={column.key === "final" ? "bracket-round bracket-round--final" : `bracket-round bracket-round--${column.side}`}>
              <h3>{column.label}</h3>
              <div className="bracket-round-lane">
                {column.positions.map((position) => (
                  <div key={position.match.id} className="bracket-match-slot" style={{ top: `calc(var(--bracket-champion-area-height) + ${position.top}px)` }}>
                    <BracketMatch match={position.match} detailBasePath={detailBasePath} compact onOpen={onMatchOpen} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
