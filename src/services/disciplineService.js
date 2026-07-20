import { mutateMockData, readMockData } from "../mocks/mockDatabase";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

const FAULT_LIMIT = 3;

export const disciplineService = {
  async getClaims() {
    return mockRequest(() => readMockData((db) => db.disciplineClaims), "No pudimos cargar reclamos.");
  },
  async getFaults() {
    return mockRequest(() => readMockData((db) => db.disciplineFaults), "No pudimos cargar faltas.");
  },
  async getPlayerDiscipline(playerId) {
    return mockRequest(() =>
      readMockData((db) => ({
        claims: db.disciplineClaims.filter((claim) => claim.reportedPlayerId === playerId || claim.claimantPlayerId === playerId || claim.reportedPlayer === db.players.find((player) => player.id === playerId)?.fullName),
        faults: db.disciplineFaults.filter((fault) => fault.playerId === playerId),
        status: db.players.find((player) => player.id === playerId)?.discipline,
      })), "No pudimos cargar disciplina del jugador.");
  },
  async confirmClaim(id, actor = "admin-1") {
    return mockRequest(async () => {
      let autoBlockedPlayer = null;
      const claim = mutateMockData((db) => {
        const target = db.disciplineClaims.find((item) => item.id === id);
        if (!target) return null;
        target.status = "Confirmado";
        const player = db.players.find((item) => item.fullName === target.reportedPlayer || item.id === target.reportedPlayerId);
        if (player) {
          player.discipline.faults += 1;
          if (player.discipline.faults >= FAULT_LIMIT) {
            player.discipline.status = "Bloqueado";
            player.status = "Bloqueado por faltas";
            autoBlockedPlayer = player;
          }
          db.disciplineFaults.push({
            id: `fault-${Date.now()}`,
            playerId: player.id,
            reason: target.reason,
            date: new Date().toISOString().slice(0, 10),
          });
        }
        return target;
      });
      await auditService.record({
        action: "confirm_claim",
        entityType: "discipline_claim",
        entityId: id,
        description: "Reclamo confirmado en mock.",
        actor,
      });
      if (autoBlockedPlayer) {
        await auditService.record({
          action: "auto_block_player",
          entityType: "player",
          entityId: autoBlockedPlayer.id,
          description: "Jugador bloqueado automaticamente al alcanzar 3 faltas confirmadas.",
          actor,
        });
      }
      return claim;
    }, "No pudimos confirmar el reclamo.");
  },
  async rejectClaim(id, actor = "admin-1") {
    return mockRequest(async () => {
      const claim = mutateMockData((db) => {
        const target = db.disciplineClaims.find((item) => item.id === id);
        if (!target) return null;
        target.status = "Rechazado";
        return target;
      });
      await auditService.record({
        action: "reject_claim",
        entityType: "discipline_claim",
        entityId: id,
        description: "Reclamo rechazado en mock.",
        actor,
      });
      return claim;
    }, "No pudimos rechazar el reclamo.");
  },
  async blockPlayer(playerId, actor = "admin-1") {
    return mockRequest(async () => {
      const player = mutateMockData((db) => {
        const target = db.players.find((item) => item.id === playerId);
        if (!target) return null;
        target.status = "Bloqueado por faltas";
        target.discipline.status = "Bloqueado";
        return target;
      });
      await auditService.record({
        action: "block_player",
        entityType: "player",
        entityId: playerId,
        description: "Jugador bloqueado en mock.",
        actor,
      });
      return player;
    }, "No pudimos bloquear el jugador.");
  },
  async unblockPlayer(playerId, actor = "admin-1") {
    return mockRequest(async () => {
      const player = mutateMockData((db) => {
        const target = db.players.find((item) => item.id === playerId);
        if (!target) return null;
        target.status = "Activo";
        target.discipline.status = target.discipline.faults > 0 ? "Advertido" : "Sin sanciones";
        return target;
      });
      await auditService.record({
        action: "unblock_player",
        entityType: "player",
        entityId: playerId,
        description: "Jugador desbloqueado en mock.",
        actor,
      });
      return player;
    }, "No pudimos desbloquear el jugador.");
  },
};
