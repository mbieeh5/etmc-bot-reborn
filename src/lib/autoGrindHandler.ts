import { poolPromise } from '../config/db.config';
import { processExpGain } from './pokemonLeveling';

export async function handleAutoGrind(userID: string, durationArg: string) {
  const pool = await poolPromise;

  // 1. CEK APABILA DAH SEDANG GRINDING
  const checkStatus = await pool.request()
    .input('userId', userID)
    .query(`
      SELECT is_grinding, grind_end_time, grind_result 
      FROM datapengguna_cooldown 
      WHERE user_id = @userId
    `);

  const currentData = checkStatus.recordset[0];

  // A. KALO SEDANG GRINDING: CEK APAKAH DAH SELESAI
  if (currentData?.is_grinding === 1 || currentData?.is_grinding === true) {
    const resCheck = await pool.request()
      .input('userId', userID)
      .query(`
        SELECT 
          CASE WHEN GETDATE() >= grind_end_time THEN 1 ELSE 0 END as isFinished,
          DATEDIFF(MINUTE, GETDATE(), grind_end_time) as remMin
        FROM datapengguna_cooldown WHERE user_id = @userId
      `);

    const isFinished = resCheck.recordset[0]?.isFinished === 1;
    const remMin = resCheck.recordset[0]?.remMin || 0;

    if (!isFinished) {
      return { text: `⏳ Gacoan lu masih berpetualang di hutan ngab! Sisa waktu: *${remMin} menit* lagi.` };
    }

    // KALAU DAH SELESAI -> KLAIM REWARD & UNLOCK STATE!
    const resultData = JSON.parse(currentData.grind_result || '{}');

    // Update EXP, HP, Level Gacoan & Poin User ke DB
    await pool.request()
      .input('userId', userID)
      .input('pokeDbId', resultData.pokeId)
      .input('newHp', resultData.finalHp)
      .input('newMaxHp', resultData.finalMaxHp)
      .input('newAtk', resultData.finalAtk)
      .input('newDef', resultData.finalDef)
      .input('newLvl', resultData.finalLvl)
      .input('newExp', resultData.finalExp)
      .input('earnedPoint', resultData.totalPoints)
      .query(`
        -- Update Pokemon
        UPDATE datapengguna_pokemon 
        SET hp = @newHp, max_hp = @newMaxHp, attack = @newAtk, defense = @newDef, lvl = @newLvl, exp = @newExp
        WHERE id = @pokeDbId;

        -- Update Point User
        UPDATE datapengguna_users SET point = ISNULL(point, 0) + @earnedPoint WHERE id = @userId;

        -- Unlock Grinding State
        UPDATE datapengguna_cooldown 
        SET is_grinding = 0, grind_end_time = NULL, grind_result = NULL 
        WHERE user_id = @userId;
      `);

    return {
      text: `🎁 *LAPORAN AUTO-GRIND SELESAI!* 🎁\n\n` +
            `⏱️ Durasi: *${resultData.plannedMin} Menit* (Bertahan: *${resultData.survivalWave} Wave*)\n` +
            `⚔️ Hasil Battle: *${resultData.wins}x Menang* | *${resultData.losses}x Kalah*\n` +
            `🌟 Total EXP: *+${resultData.totalExp.toLocaleString('id-ID')} EXP* (Lv.${resultData.initialLvl} ➔ Lv.${resultData.finalLvl})\n` +
            `💰 Total Poin: *+${resultData.totalPoints.toLocaleString('id-ID')} Poin*\n` +
            `❤️ Status HP Akhir: *${resultData.finalHp}/${resultData.finalMaxHp}*\n\n` +
            `_Gacoan lu udah kembali dari hutan & siap tempur lagi!_`
    };
  }

  // B. MULAI AUTO-GRIND BARU
  const minutes = parseInt(durationArg, 10);
  if (isNaN(minutes) || minutes < 5 || minutes > 120) {
    return { text: '❌ Durasi auto-grind minimal *5 menit* dan maksimal *120 menit*! Contoh: *!fight auto 60*' };
  }

  // Ambil Gacoan User
  const gacoanRes = await pool.request()
    .input('userId', userID)
    .query(`
      SELECT p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense 
      FROM datapengguna_gacoan g 
      JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id
      WHERE g.user_id = @userId
    `);

  if (gacoanRes.recordset.length === 0) return { text: '❌ Lu belum set gacoan! Ketik !setgacoan dulu.' };
  
  const poke = gacoanRes.recordset[0];
  if (poke.hp < (poke.max_hp * 0.1)) {
    return { text: `🚑 Darah *${poke.name}* lu sekarat (${poke.hp}/${poke.max_hp})! Minimal 10% buat diajak auto-grind. Heal pake !use potion.` };
  }

  // SIMULASI MATEMATIS BATTLE PER WAVE (1 Wave = 1 Menit)
  let currentHp = poke.hp;
  let currentLvl = poke.lvl;
  let currentExp = poke.exp;
  let currentMaxHp = poke.max_hp;
  let currentAtk = poke.attack;
  let currentDef = poke.defense;

  let totalExpGained = 0;
  let totalPointsGained = 0;
  let wins = 0;
  let losses = 0;
  let survivalWave = 0;

  for (let wave = 1; wave <= minutes; wave++) {
    survivalWave = wave;

    // Musuh Scaling per Wave
    const enemyAtk = Math.floor((currentLvl * 8) + (wave * 0.5));
    const isWin = Math.random() >= 0.25; // 75% Win Chance

    if (isWin) {
      wins++;
      const expGain = Math.floor(120 + (currentLvl * 5));
      const pointGain = Math.floor(500 + (currentLvl * 20));

      totalExpGained += expGain;
      totalPointsGained += pointGain;

      // Check Level Up
      const lvlRes = processExpGain(currentLvl, currentExp, expGain);
      currentLvl = lvlRes.newLevel;
      currentExp = lvlRes.newExp;
      currentMaxHp += lvlRes.hpGain;
      currentAtk += lvlRes.atkGain;
      currentDef += lvlRes.defGain;

      // Damage kecil yang diterima saat menang
      currentHp = Math.max(1, currentHp - Math.floor(enemyAtk * 0.15));
    } else {
      losses++;
      // Damage besar saat kalah
      currentHp -= Math.floor(enemyAtk * 0.6);
    }

    // Jika HP Habis (Gugur di tengah jalan)
    if (currentHp <= 0) {
      currentHp = 0;
      break; // Stop wave, gacoan gugur!
    }
  }

  // Save Result Snapshot ke DB & Lock User
  const grindResultJson = JSON.stringify({
    pokeId: poke.id,
    plannedMin: minutes,
    survivalWave,
    wins,
    losses,
    totalExp: totalExpGained,
    totalPoints: totalPointsGained,
    initialLvl: poke.lvl,
    finalLvl: currentLvl,
    finalExp: currentExp,
    finalHp: currentHp,
    finalMaxHp: currentMaxHp,
    finalAtk: currentAtk,
    finalDef: currentDef
  });

  await pool.request()
    .input('userId', userID)
    .input('minutes', survivalWave) // Sesuai berapa wave bertahan
    .input('resultJson', grindResultJson)
    .query(`
      MERGE datapengguna_cooldown AS target
      USING (SELECT @userId AS user_id) AS source
      ON (target.user_id = source.user_id)
      WHEN MATCHED THEN 
          UPDATE SET is_grinding = 1, grind_end_time = DATEADD(MINUTE, @minutes, GETDATE()), grind_result = @resultJson
      WHEN NOT MATCHED THEN 
          INSERT (user_id, is_grinding, grind_end_time, grind_result) 
          VALUES (@userId, 1, DATEADD(MINUTE, @minutes, GETDATE()), @resultJson);
    `);

  return {
    text: `🌲 *AUTO-GRIND DIMULAI!* 🌲\n\n` +
          `👾 Gacoan: *${poke.name}* (Lv.${poke.lvl})\n` +
          `⏱️ Rencana Durasi: *${minutes} Menit*\n\n` +
          `_Gacoan lu resmi dilepas ke hutan! Selama grinding, status gacoan terkunci. Ketik !fight auto buat cek sisa waktu / klaim hasil!_`
  };
}