export function canPlayerRegisterInCategory(playerCategory, targetCategory) {
  if (!playerCategory || !targetCategory) return false;
  if (playerCategory.branch !== targetCategory.branch) return false;
  return targetCategory.level <= playerCategory.level;
}

export function isLowerCategory(playerCategory, targetCategory) {
  if (!playerCategory || !targetCategory) return false;
  if (playerCategory.branch !== targetCategory.branch) return false;
  return targetCategory.level > playerCategory.level;
}

export function getAllowedSuperiorCategories(playerCategory, categories = []) {
  if (!playerCategory) return [];
  return categories.filter(
    (category) =>
      category.status === "Activa" &&
      category.branch === playerCategory.branch &&
      category.level < playerCategory.level,
  );
}

export function getBlockedLowerCategories(playerCategory, categories = []) {
  if (!playerCategory) return [];
  return categories.filter(
    (category) =>
      category.status === "Activa" &&
      category.branch === playerCategory.branch &&
      category.level > playerCategory.level,
  );
}

export function getSameOrAllowedCategories(playerCategory, categories = []) {
  if (!playerCategory) return [];
  return categories.filter((category) => category.status === "Activa" && canPlayerRegisterInCategory(playerCategory, category));
}
