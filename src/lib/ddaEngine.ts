export interface StatModifier {
  hpMod: number;
  atkMod: number;
  defMod: number;
}

export function calculateDDA(streak: number): StatModifier {
  // streak > 0 = Win streak, streak < 0 = Lose streak
  if (streak >= 30) return { hpMod: 3, atkMod: 2.75, defMod: 2.75 };  // Sudden Death
  if (streak >= 10) return { hpMod: 1.8, atkMod: 1.75, defMod: 1.75 };  // Very Hardcore
  if (streak >= 5) return { hpMod: 1.3, atkMod: 1.25, defMod: 1.25 };  // Hard Core
  if (streak >= 3) return { hpMod: 1.15, atkMod: 1.15, defMod: 1.15 }; // Hard
  if (streak <= -5) return { hpMod: 0.75, atkMod: 0.8, defMod: 0.8 };   // Super Easy
  if (streak <= -3) return { hpMod: 0.85, atkMod: 0.9, defMod: 0.9 };   // Easy
  
  return { hpMod: 1.0, atkMod: 1.0, defMod: 1.0 };                     // Normal
}