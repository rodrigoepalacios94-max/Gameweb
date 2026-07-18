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
