export const auditService = {
  async list() {
    return [];
  },
  async record(entry) {
    return {
      id: crypto.randomUUID?.() || `${Date.now()}`,
      date: new Date().toISOString(),
      ...entry,
    };
  },
};
