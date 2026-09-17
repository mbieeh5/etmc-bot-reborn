export function getRequiredExp(level: number): number {
  if (level >= 55) return Infinity; // Level Cap
  
  if (level <= 30) {
    // Level 1-30: Flat & Cepat (Linear growth)
    return level * 150;
  } else {
    // Level 31-55: Exponential RF Online Style (Susah banget naik!)
    return Math.floor(30 * 150 + Math.pow(level - 30, 2.5) * 400);
  }
}

export interface LevelUpResult {
  newLevel: number;
  newExp: number;
  hpGain: number;
  atkGain: number;
  defGain: number;
  didLevelUp: boolean;
}

export function processExpGain(currentLvl: number, currentExp: number, gainedExp: number): LevelUpResult {
  let lvl = currentLvl;
  let exp = currentExp + gainedExp;
  let totalHpGain = 0;
  let totalAtkGain = 0;
  let totalDefGain = 0;
  let didLevelUp = false;

  while (lvl < 55 && exp >= getRequiredExp(lvl)) {
    exp -= getRequiredExp(lvl);
    lvl++;
    didLevelUp = true;

    // Stat Gain per Level Up
    totalHpGain += Math.floor(Math.random() * 15) + 15;  // +15 s/d +30
    totalAtkGain += Math.floor(Math.random() * 8) + 8;   // +8 s/d +16
    totalDefGain += Math.floor(Math.random() * 8) + 8;   // +8 s/d +16
  }

  // Kalau udah cap 55, exp distop 0
  if (lvl >= 55) exp = 0;

  return {
    newLevel: lvl,
    newExp: exp,
    hpGain: totalHpGain,
    atkGain: totalAtkGain,
    defGain: totalDefGain,
    didLevelUp
  };
}