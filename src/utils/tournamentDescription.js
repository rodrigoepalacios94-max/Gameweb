const INVENTED_DESCRIPTION_PATTERNS = [
  /fixture dev/i,
  /validar formato/i,
  /torneo creado (por|desde) el administrador/i,
  /torneo creado desde el asistente admin/i,
];

export function getVisibleTournamentDescription(description) {
  const value = String(description || "").trim();
  if (!value) return "";
  return INVENTED_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(value)) ? "" : value;
}
