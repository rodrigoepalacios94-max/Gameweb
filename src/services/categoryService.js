import { createMockId, mutateMockData, readMockData } from "../mocks/mockDatabase";
import {
  canPlayerRegisterInCategory,
  getAllowedSuperiorCategories,
  getBlockedLowerCategories,
  getSameOrAllowedCategories,
  isLowerCategory,
} from "../utils/categoryRules";
import { auditService } from "./auditService";
import { mockRequest } from "./serviceUtils";

export const categoryService = {
  async getCategories() {
    return mockRequest(() => readMockData((db) => db.categories), "No pudimos cargar las categorias.");
  },
  async getCategoryById(id) {
    return mockRequest(() => readMockData((db) => db.categories.find((category) => category.id === id) || null), "No pudimos cargar la categoria.");
  },
  async getCategoryRulesForPlayer(playerId) {
    return mockRequest(() =>
      readMockData((db) => {
        const player = db.players.find((item) => item.id === playerId);
        const playerCategory = db.categories.find((category) => category.id === player?.categoryId);
        return {
          currentCategory: playerCategory,
          allowedCategories: getSameOrAllowedCategories(playerCategory, db.categories),
          superiorCategories: getAllowedSuperiorCategories(playerCategory, db.categories),
          lowerCategories: getBlockedLowerCategories(playerCategory, db.categories),
        };
      }), "No pudimos calcular reglas de categoria.");
  },
  canPlayerRegisterInCategory,
  isLowerCategory,
  async createCategory(payload, actor = "admin-1") {
    return mockRequest(async () => {
      const category = mutateMockData((db) => {
        const created = { id: createMockId("cat"), status: "Activa", ...payload };
        db.categories.push(created);
        return created;
      });
      await auditService.record({
        action: "create_category",
        entityType: "category",
        entityId: category.id,
        description: `Categoria creada: ${category.name} ${category.branch}`,
        actor,
      });
      return category;
    }, "No pudimos crear la categoria.");
  },
  async updateCategory(id, updates, actor = "admin-1") {
    return mockRequest(async () => {
      const category = mutateMockData((db) => {
        const target = db.categories.find((item) => item.id === id);
        if (!target) return null;
        Object.assign(target, updates);
        return target;
      });
      await auditService.record({
        action: "update_category",
        entityType: "category",
        entityId: id,
        description: "Categoria actualizada en mock.",
        actor,
      });
      return category;
    }, "No pudimos actualizar la categoria.");
  },
};
