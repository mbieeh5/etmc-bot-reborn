export interface Combatant {
  name: string;
  lvl: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

export interface BattleResult {
  winner: 'attacker' | 'defender';
  log: string[];
  attackerFinalHp: number;
  defenderFinalHp: number;
  turns: number;
}

export function simulateBattle(attacker: Combatant, defender: Combatant): BattleResult {
  const log: string[] = [];
  let p1Hp = attacker.hp;
  let p2Hp = defender.hp;
  let turn = 1;
  const maxTurns = 15; // Mencegah infinite loop kalau def terlalu besar

  while (p1Hp > 0 && p2Hp > 0 && turn <= maxTurns) {
    // Turn Attacker -> Defender
    const rawDmg1 = Math.max(5, attacker.attack - Math.floor(defender.defense * 0.4));
    const variance1 = Math.floor(Math.random() * 10) - 5;
    const dmg1 = Math.max(1, rawDmg1 + variance1);

    p2Hp = Math.max(0, p2Hp - dmg1);
    log.push(`⚔️ Turn ${turn}: *${attacker.name}* nyerang -${dmg1} DMG! (Sisa HP ${defender.name}: ${p2Hp})`);

    if (p2Hp <= 0) break;

    // Turn Defender -> Attacker
    const rawDmg2 = Math.max(5, defender.attack - Math.floor(attacker.defense * 0.4));
    const variance2 = Math.floor(Math.random() * 10) - 5;
    const dmg2 = Math.max(1, rawDmg2 + variance2);

    p1Hp = Math.max(0, p1Hp - dmg2);
    log.push(`🛡️ Turn ${turn}: *${defender.name}* membalas -${dmg2} DMG! (Sisa HP ${attacker.name}: ${p1Hp})`);

    turn++;
  }

  // Tentukan pemenang
  const winner = p1Hp > 0 && (p2Hp <= 0 || p1Hp >= p2Hp) ? 'attacker' : 'defender';

  return {
    winner,
    log,
    attackerFinalHp: p1Hp,
    defenderFinalHp: p2Hp,
    turns: turn
  };
}