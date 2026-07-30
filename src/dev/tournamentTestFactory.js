import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { createTorneoGameFixture, getTorneoGameDiagnostics, TORNEO_GAME_ID } from "./torneoGameFixture";

export function isTestTournamentName(name = "") {
  const normalized = name.trim().toLowerCase();
  return normalized === "prueba" || normalized === "torneo game" || normalized === "torneo de pruebas - preliminares";
}

function replaceSportsFixture(db, payload = {}) {
  const fixture = createTorneoGameFixture({
    id: payload.id || TORNEO_GAME_ID,
    name: payload.name?.trim() || "Torneo GAME",
  });
  db.players = fixture.players;
  db.categories = fixture.categories;
  db.tournaments = fixture.tournaments;
  db.brackets = fixture.brackets;
  db.matches = fixture.matches;
  db.rankings = fixture.rankings;
  db.previousSeasonRankings = fixture.previousSeasonRankings || [];
  db.rankingMovements = fixture.rankingMovements;
  db.enrollments = fixture.enrollments;
  db.schedule = fixture.schedule;
  db.matchAvailability = fixture.matchAvailability;
  db.disciplineClaims = [];
  db.disciplineFaults = [];
  db.categoryChangeRequests = [];
  db.notifications = [];
  db.scheduleEvents = [];
  return db.tournaments[0];
}

export function createDevTestTournament(payload = {}) {
  return mutateMockData((db) => replaceSportsFixture(db, payload));
}

export function simulatePreliminaryResults(tournamentId, categoryId = null) {
  return mutateMockData((db) => {
    const tournament = db.tournaments.find((item) => item.id === tournamentId);
    if (!tournament?.isDevTest) return null;
    const categoryIds = categoryId ? [categoryId] : tournament.categoryStages.filter((stage) => stage.format === "Preliminar").map((stage) => stage.categoryId);
    const simulated = categoryIds.map((itemCategoryId) => {
      const preliminaries = db.matches
        .filter((match) => match.tournamentId === tournamentId && match.categoryId === itemCategoryId && match.phase === "Preliminar")
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      return { categoryId: itemCategoryId, simulatedPreliminaries: preliminaries.length };
    });
    tournament.testSimulationStatus = "Fixture inicial sin resultados simulados";
    return { tournament, results: simulated };
  });
}

export function getTestTournamentDiagnostics(tournamentId = TORNEO_GAME_ID) {
  return readMockData((db) => getTorneoGameDiagnostics(db, tournamentId));
}
