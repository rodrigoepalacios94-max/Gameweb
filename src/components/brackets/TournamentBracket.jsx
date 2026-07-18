import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import { Button } from "../common/Button";
import { BracketMatch } from "./BracketMatch";

const ROUND_WIDTH = 260;
const ROUND_GAP = 86;
const BRACKET_HEIGHT = 1520;
const MATCH_HEIGHT = 92;
const HEADER_HEIGHT = 44;

const ROUND_KEYS = [
  { key: "round32", label: "32avos", names: ["32avos", "round-32"] },
  { key: "round16", label: "16avos", names: ["16avos", "round-16", "cuadro principal"] },
  { key: "octavos", label: "Octavos", names: ["octavos"] },
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

function splitMatches(round, key) {
  const matches = round?.matches || [];
  if (key === "round32") {
    return { left: matches.slice(0, 1), right: matches.slice(1, 2) };
  }
  const half = Math.ceil(matches.length / 2);
  return { left: matches.slice(0, half), right: matches.slice(half) };
}

function getMatchTop(index, count, side, key) {
  if (!count) return 0;
  if (key === "round32") {
    const slot = side === "left" ? 0.5 : 7.5;
    return (slot / 8) * BRACKET_HEIGHT - MATCH_HEIGHT / 2;
  }
  return ((index + 0.5) / count) * BRACKET_HEIGHT - MATCH_HEIGHT / 2;
}

function getColumnX(index) {
  return index * (ROUND_WIDTH + ROUND_GAP);
}

function getColumnPoint(column, position, edge) {
  const x = getColumnX(column.index) + (edge === "left" ? 0 : ROUND_WIDTH);
  const y = HEADER_HEIGHT + position.top + MATCH_HEIGHT / 2;
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
    const splitRounds = ROUND_KEYS.map((roundSpec) => {
      const round = findRound(rounds, roundSpec.names);
      return {
        ...roundSpec,
        round,
        ...splitMatches(round, roundSpec.key),
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
          ? BRACKET_HEIGHT / 2 - MATCH_HEIGHT / 2
          : getMatchTop(matchIndex, column.matches.length, column.side, column.key),
      })),
    }));

    const leftVisual = visualColumns.filter((column) => column.side === "left");
    const finalColumn = visualColumns.find((column) => column.key === "final");
    const rightVisual = visualColumns.filter((column) => column.side === "right");
    const connections = [
      ...buildSideConnections(leftVisual, "left"),
      ...buildSideConnections(rightVisual, "right"),
      ...(finalColumn ? buildFinalConnections(leftVisual, finalColumn, rightVisual) : []),
    ];

    return {
      columns: visualColumns,
      connections,
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
            "--bracket-height": `${BRACKET_HEIGHT}px`,
            "--bracket-header-height": `${HEADER_HEIGHT}px`,
            "--bracket-columns": layout.columns.length,
          }}
        >
          <svg className="bracket-connections" width={layout.width} height={BRACKET_HEIGHT + HEADER_HEIGHT} aria-hidden="true">
            {layout.connections.map((connection) => (
              <path key={connection.id} className={connection.active ? "bracket-connector is-active" : "bracket-connector"} d={connectionPath(connection)} />
            ))}
          </svg>
          {layout.columns.map((column) => (
            <section key={`${column.side}-${column.key}`} className={column.key === "final" ? "bracket-round bracket-round--final" : `bracket-round bracket-round--${column.side}`}>
              <h3>{column.label}</h3>
              <div className="bracket-round-lane">
                {column.positions.map((position) => (
                  <div key={position.match.id} className="bracket-match-slot" style={{ top: `${position.top}px` }}>
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
