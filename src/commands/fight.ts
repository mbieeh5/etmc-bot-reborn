import axios from 'axios';
import { poolPromise } from '../config/db.config';
import { calculateDDA } from '../lib/ddaEngine';
import { simulateBattle, Combatant } from '../lib/battleEngine';
import { processExpGain } from '../lib/pokemonLeveling';
import { handleAutoGrind } from '../lib/autoGrindHandler';

export default async function fightCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    const args = messageContent.trim().split(/\s+/);
    const targetArg = (args[1] || '').toLowerCase();

    // 0. LOCK CHECK: Gak bisa fight kalo lagi Auto-Grind
    const grindCheck = await pool.request()
      .input('userId', userID)
      .query(`
        SELECT grind_end_time 
        FROM datapengguna_cooldown 
        WHERE user_id = @userId AND is_grinding = 1 AND grind_end_time > GETDATE()
      `);

    if (grindCheck.recordset.length > 0) {
      return { text: '⏳ Gacoan lu lagi auto-grind di hutan ngab! Tunggu balik dulu baru bisa !fight.' };
    }

    if (targetArg === 'auto') {
      const durationArg = args[2] || '';
      return await handleAutoGrind(userID, durationArg);
    }

    // ROUTER SYSTEM
    if (targetArg === 'pvp') {
      return await handleRandomPvP(userID); // !fight pvp (Matchmaking Random DB)
    } else if (targetArg.includes('@')) {
      return await handlePvP(userID, targetArg); // !fight @tag (P2P Tagged)
    } else {
      return await handlePvE(userID); // !fight (PvE Wild Pokemon)
    }

  } catch (error) {
    console.error('Error di fight router:', error);
    return { text: '❌ Error engine battle, lapor admin cuy!' };
  }

  // ==========================================
  // HELPER: FETCH BUFF CHARM ATK & DEF (+15%)
  // ==========================================
  async function getUserBuffs(pool: any, userId: string) {
    const res = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT 
          CASE 
            WHEN charm_attack_until IS NOT NULL AND charm_attack_until > GETDATE() 
            THEN ISNULL(charm_attack_power, 1.15) 
            ELSE 1.0 
          END as atkBuffPower,
          
          CASE 
            WHEN charm_deff_until IS NOT NULL AND charm_deff_until > GETDATE() 
            THEN ISNULL(charm_deff_power, 1.15) 
            ELSE 1.0 
          END as defBuffPower
        FROM datapengguna_cooldown 
        WHERE user_id = @userId
      `);

    return res.recordset[0] || { atkBuffPower: 1.0, defBuffPower: 1.0 };
  }

  // ==========================================
  // 1. ENGINE PVE (LAWAN BOT + DDA + LEVELING)
  // ==========================================
  async function handlePvE(userID: string) {
    const pool = await poolPromise;
    const COOLDOWN_SECONDS = 60; // 1 Menit Jeda PvE

    const cdCheck = await pool.request().input('id', userID).input('cdSec', COOLDOWN_SECONDS).query(`
      DECLARE @LastFight DATETIME, @Streak INT;
      SELECT @LastFight = last_fight, @Streak = fight_streak FROM datapengguna_cooldown WHERE user_id = @id;
      
      IF @LastFight IS NOT NULL AND DATEDIFF(SECOND, @LastFight, GETDATE()) < @cdSec
      BEGIN
          SELECT 'COOLDOWN' AS status, (@cdSec - DATEDIFF(SECOND, @LastFight, GETDATE())) AS rem_sec;
          RETURN;
      END
      SELECT 'PASSED' AS status, ISNULL(@Streak, 0) AS streak;
    `);

    const cdStatus = cdCheck.recordset[0];
    if (cdStatus?.status === 'COOLDOWN') {
      return { text: `⏳ Pokemon lu masih ngos-ngosan! Tunggu ${cdStatus.rem_sec} detik lagi.` };
    }

    const currentStreak = cdStatus?.streak || 0;

    const gacoanRes = await pool.request().input('userId', userID).query(`
      SELECT p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense 
      FROM datapengguna_gacoan g JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id
      WHERE g.user_id = @userId
    `);

    if (gacoanRes.recordset.length === 0) return { text: '❌ Lu belum nge-set Gacoan! Ketik !setgacoan <index> dulu.' };
    
    const poke = gacoanRes.recordset[0];
    const minHp = Math.floor(poke.max_hp * 0.1);
    if (poke.hp < minHp) {
      return { text: `🚑 Darah *${poke.name}* lu sekarat (${poke.hp}/${poke.max_hp})! Minimal 10% buat berantem. Heal pake !use potion.` };
    }

    // APPLY CHARM BUFF 15%
    const buffs = await getUserBuffs(pool, userID);
    const finalAtk = buffs.hasAtkBuff ? Math.floor(poke.attack * buffs.atkBuffPower) : poke.attack;
    const finalDef = buffs.hasDefBuff ? Math.floor(poke.defense * buffs.defBuffPower) : poke.defense;

    const randomPokeId = Math.floor(Math.random() * 898) + 1;
    const pokeApiRes = await axios.get(`https://pokeapi.co/api/v2/pokemon/${randomPokeId}`);
    
    const dda = calculateDDA(currentStreak);
    const scalingFactor = Math.max(1, poke.lvl * 0.8);

    const enemy: Combatant = {
      name: `Liar ${pokeApiRes.data.name.toUpperCase()}`,
      lvl: poke.lvl,
      hp: Math.floor(pokeApiRes.data.stats[0].base_stat * scalingFactor * dda.hpMod),
      maxHp: Math.floor(pokeApiRes.data.stats[0].base_stat * scalingFactor * dda.hpMod),
      attack: Math.floor(pokeApiRes.data.stats[1].base_stat * scalingFactor * dda.atkMod),
      defense: Math.floor(pokeApiRes.data.stats[2].base_stat * scalingFactor * dda.defMod),
    };

    const player: Combatant = {
      name: poke.name, lvl: poke.lvl, hp: poke.hp, maxHp: poke.max_hp, attack: finalAtk, defense: finalDef
    };

    const battleResult = simulateBattle(player, enemy);
    const isWin = battleResult.winner === 'attacker';

    let newStreak = currentStreak;
    let expMsg = '';
    let dbLvl = poke.lvl;
    let dbExp = poke.exp;
    let dbMaxHp = poke.max_hp;
    let dbAtk = poke.attack;
    let dbDef = poke.defense;

    if (isWin) {
      newStreak = Math.min(newStreak + 1, 5);
      const expGain = Math.floor(150 + (enemy.lvl * 10));
      const lvlResult = processExpGain(poke.lvl, poke.exp, expGain);
      dbLvl = lvlResult.newLevel;
      dbExp = lvlResult.newExp;
      dbMaxHp += lvlResult.hpGain;
      dbAtk += lvlResult.atkGain;
      dbDef += lvlResult.defGain;

      expMsg = `\n🌟 Dapet +${expGain} EXP! (Level ${dbLvl} - ${dbExp}/${lvlResult.newLevel >= 55 ? 'MAX' : '...'})`;
      if (lvlResult.didLevelUp) expMsg += `\n🎉 *LEVEL UP!* Stat Gacoan Lo Meningkat!`;
    } else {
      newStreak = Math.max(newStreak - 1, -5);
      expMsg = `\n💀 Kalah! Gak dapet EXP. Darah kesedot abis.`;
    }

    await pool.request()
      .input('pokeDbId', poke.id).input('userId', userID)
      .input('hp', battleResult.attackerFinalHp).input('maxHp', dbMaxHp)
      .input('atk', dbAtk).input('def', dbDef).input('lvl', dbLvl).input('exp', dbExp)
      .input('streak', newStreak)
      .query(`
        UPDATE datapengguna_pokemon 
        SET hp = @hp, max_hp = @maxHp, attack = @atk, defense = @def, lvl = @lvl, exp = @exp 
        WHERE id = @pokeDbId;

        MERGE datapengguna_cooldown AS target
        USING (SELECT @userId AS user_id) AS source
        ON (target.user_id = source.user_id)
        WHEN MATCHED THEN UPDATE SET last_fight = GETDATE(), fight_streak = @streak
        WHEN NOT MATCHED THEN INSERT (user_id, last_fight, fight_streak) VALUES (@userId, GETDATE(), @streak);
      `);

    let replyMsg = `⚔️ *WILD ENCOUNTER!* ⚔️\n${player.name} (Lv.${player.lvl}) ${buffs.hasAtkBuff || buffs.hasDefBuff ? '✨[BUFF]' : ''} VS ${enemy.name}\n\n`;
    replyMsg += `${battleResult.log.slice(-4).join('\n')}\n\n`;
    replyMsg += isWin ? `🏆 *MENANG!*` : `💥 *KALAH TELAK!*`;
    replyMsg += `${expMsg}\n❤️ Sisa HP: ${battleResult.attackerFinalHp}/${dbMaxHp}`;

    return { text: replyMsg };
  }

  // ==========================================
  // 2. ENGINE PVP P2P (TAG TARGET)
  // ==========================================
  async function handlePvP(attackerID: string, targetRaw: string) {
    const pool = await poolPromise;
    const targetNumber = targetRaw.replace(/[^0-9]/g, '');
    const targetPattern = `${targetNumber}_%`;

    if (attackerID.startsWith(targetNumber + '_')) return { text: '❌ Masa gelut sama diri sendiri kocak!' };

    const pvpRes = await pool.request()
      .input('atkId', attackerID)
      .input('defPattern', targetPattern)
      .query(`
        SELECT 'ATTACKER' as role, p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense, g.user_id as real_id
        FROM datapengguna_gacoan g JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id WHERE g.user_id = @atkId;

        SELECT 'DEFENDER' as role, p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense, g.user_id as real_id
        FROM datapengguna_gacoan g JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id WHERE g.user_id LIKE @defPattern;
      `);

    const recordSets = pvpRes.recordsets as any[];
    const atkPoke = recordSets[0]?.[0];
    const defPoke = recordSets[1]?.[0];

    if (!atkPoke) return { text: '❌ Lu belum nge-set Gacoan buat PvP!' };
    if (!defPoke) return { text: '❌ Orang yang lu tag belum set Gacoan / belum daftar!' };

    return await executePvPBattle(pool, attackerID, defPoke.real_id, atkPoke, defPoke);
  }

  // ==========================================
  // 3. ENGINE PVP RANDOM MATCHMAKING (!fight pvp)
  // ==========================================
  async function handleRandomPvP(attackerID: string) {
    const pool = await poolPromise;

    const matchRes = await pool.request()
      .input('atkId', attackerID)
      .query(`
        SELECT TOP 1 
          'ATTACKER' as role, p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense, g.user_id as real_id
        FROM datapengguna_gacoan g 
        JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id 
        WHERE g.user_id = @atkId;

        SELECT TOP 1 
          'DEFENDER' as role, p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense, g.user_id as real_id, u.nama as owner_name
        FROM datapengguna_gacoan g 
        JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id 
        JOIN datapengguna_users u ON g.user_id = u.id
        LEFT JOIN datapengguna_cooldown c ON g.user_id = c.user_id
        WHERE g.user_id <> @atkId 
          AND p.hp >= (p.max_hp * 0.1)
          AND ISNULL(c.is_grinding, 0) = 0
        ORDER BY NEWID();
      `);

    const recordSets = matchRes.recordsets as any[];
    const atkPoke = recordSets[0]?.[0];
    let defPoke = recordSets[1]?.[0];

    if (!atkPoke) return { text: '❌ Lu belum nge-set Gacoan buat PvP! Ketik !setgacoan <index> dulu.' };

    let isBotMatch = false;
    let defOwnerName = defPoke?.owner_name;

    if (!defPoke) {
      isBotMatch = true;
      defOwnerName = '🤖 SHADOW BOT (SUDDEN DEATH)';

      const streakRes = await pool.request()
        .input('atkId', attackerID)
        .query(`SELECT ISNULL(fight_streak, 0) as streak FROM datapengguna_cooldown WHERE user_id = @atkId`);
      
      const userStreak = streakRes.recordset[0]?.streak || 0;
      const ddaStreak = Math.max(10, userStreak);
      const dda = calculateDDA(ddaStreak);

      const botLvl = atkPoke.lvl + Math.floor(Math.random() * 3);
      const scalingFactor = Math.max(1, botLvl * 0.85);

      defPoke = {
        id: 0,
        name: `Shadow Mewtwo`,
        lvl: botLvl,
        exp: 0,
        hp: Math.floor(120 * scalingFactor * dda.hpMod),
        max_hp: Math.floor(120 * scalingFactor * dda.hpMod),
        attack: Math.floor(30 * scalingFactor * dda.atkMod),
        defense: Math.floor(25 * scalingFactor * dda.defMod),
        real_id: 'BOT_OPPONENT'
      };
    }

    return await executePvPBattle(pool, attackerID, defPoke.real_id, atkPoke, defPoke, defOwnerName, isBotMatch);
  }

  // ==========================================
  // CORE PVP EXECUTION & REWARD SYSTEM
  // ==========================================
  async function executePvPBattle(
    pool: any, 
    atkId: string, 
    defId: string, 
    atkPoke: any, 
    defPoke: any, 
    defOwnerName?: string, 
    isBotMatch: boolean = false
  ) {
    // 🛡️ PVP COOLDOWN CHECK (2 MENIT = 120 DETIK)
    const PVP_COOLDOWN_SECONDS = 120;
    const cdCheck = await pool.request()
      .input('id', atkId)
      .input('cdSec', PVP_COOLDOWN_SECONDS)
      .query(`
        DECLARE @LastFight DATETIME;
        SELECT @LastFight = last_fight FROM datapengguna_cooldown WHERE user_id = @id;

        IF @LastFight IS NOT NULL AND DATEDIFF(SECOND, @LastFight, GETDATE()) < @cdSec
        BEGIN
            SELECT 'COOLDOWN' AS status, (@cdSec - DATEDIFF(SECOND, @LastFight, GETDATE())) AS rem_sec;
            RETURN;
        END
        SELECT 'PASSED' AS status;
      `);

    const cdStatus = cdCheck.recordset[0];
    if (cdStatus?.status === 'COOLDOWN') {
      const mins = Math.floor(cdStatus.rem_sec / 60);
      const secs = cdStatus.rem_sec % 60;
      return { text: `⏳ Pokemon lu masih ngos-ngosan abis gelut PvP! Tunggu *${mins} menit ${secs} detik* lagi.` };
    }

    if (atkPoke.hp < (atkPoke.max_hp * 0.1)) return { text: `🚑 Darah Gacoan lu sekarat, gak kuat PvP! Heal dulu pake !use potion.` };
    if (!isBotMatch && defPoke.hp < (defPoke.max_hp * 0.1)) return { text: `🚑 Darah musuh lagi sekarat, biarin dia napas dulu.` };

    // Fetch Buffs (Attack/Defense +15%)
    const atkBuffs = await getUserBuffs(pool, atkId);
    const defBuffs = !isBotMatch ? await getUserBuffs(pool, defId) : { hasAtkBuff: 0, hasDefBuff: 0 };

    const player1: Combatant = {
      name: atkPoke.name, lvl: atkPoke.lvl, hp: atkPoke.hp, maxHp: atkPoke.max_hp,
      attack: atkBuffs.hasAtkBuff ? Math.floor(atkPoke.attack * 1.15) : atkPoke.attack,
      defense: atkBuffs.hasDefBuff ? Math.floor(atkPoke.defense * 1.15) : atkPoke.defense,
    };

    const player2: Combatant = {
      name: defPoke.name, lvl: defPoke.lvl, hp: defPoke.hp, maxHp: defPoke.max_hp,
      attack: defBuffs.hasAtkBuff ? Math.floor(defPoke.attack * 1.15) : defPoke.attack,
      defense: defBuffs.hasDefBuff ? Math.floor(defPoke.defense * 1.15) : defPoke.defense,
    };

    const battleResult = simulateBattle(player1, player2);
    const isAtkWin = battleResult.winner === 'attacker';

    let dbLvl = atkPoke.lvl;
    let dbExp = atkPoke.exp;
    let expMsg = '';
    
    const userPointReward = isAtkWin ? Math.floor(Math.random() * 1001) + 1000 : 0;
    const userExpReward = isAtkWin ? 50 : 0;
    
    let pvpPointChange = 0;

    if (isAtkWin) {
      const lvlResult = processExpGain(atkPoke.lvl, atkPoke.exp, 250);
      dbLvl = lvlResult.newLevel;
      dbExp = lvlResult.newExp;
      expMsg = `\n🌟 Gacoan dapet +250 EXP!`;

      const isHarderOpponent = (defPoke.lvl > atkPoke.lvl) || ((defPoke.attack + defPoke.defense) > (atkPoke.attack + atkPoke.defense));
      
      if (isHarderOpponent) {
        pvpPointChange = 100;
      } else {
        pvpPointChange = 50;
      }
    } else {
      pvpPointChange = -10;
    }

    // UPDATE DB ATOMIC TRANSACTION
    await pool.request()
      .input('atkDbId', atkPoke.id)
      .input('atkHp', battleResult.attackerFinalHp)
      .input('defDbId', defPoke.id)
      .input('defHp', battleResult.defenderFinalHp)
      .input('atkLvl', dbLvl)
      .input('atkExp', dbExp)
      .input('atkUserId', atkId)
      .input('defUserId', defId)
      .input('pointGain', userPointReward)
      .input('userExpGain', userExpReward)
      .input('pvpPointDelta', pvpPointChange)
      .input('isWin', isAtkWin ? 1 : 0)
      .input('isBot', isBotMatch ? 1 : 0)
      .query(`
        BEGIN TRY
            BEGIN TRANSACTION;

            -- 1. Update HP & Level Pokemon Attacker
            UPDATE datapengguna_pokemon 
            SET hp = @atkHp, lvl = @atkLvl, exp = @atkExp 
            WHERE id = @atkDbId;

            -- 2. Update HP Defender (Kalo lawan player asli)
            IF @isBot = 0
            BEGIN
                UPDATE datapengguna_pokemon SET hp = @defHp WHERE id = @defDbId;
            END

            -- 3. Update Cooldown Attacker
            MERGE datapengguna_cooldown AS target
            USING (SELECT @atkUserId AS user_id) AS source
            ON (target.user_id = source.user_id)
            WHEN MATCHED THEN
                UPDATE SET last_fight = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (user_id, last_fight) VALUES (@atkUserId, GETDATE());

            -- 4. Update Reward Attacker
            UPDATE datapengguna_users 
            SET point = ISNULL(point, 0) + @pointGain,
                exp = ISNULL(exp, 0) + @userExpGain,
                pvp_kills = CASE WHEN @isWin = 1 THEN ISNULL(pvp_kills, 0) + 1 ELSE ISNULL(pvp_kills, 0) END,
                pvp_point = CASE 
                    WHEN (ISNULL(pvp_point, 0) + @pvpPointDelta) < 0 THEN 0 
                    ELSE ISNULL(pvp_point, 0) + @pvpPointDelta 
                END
            WHERE id = @atkUserId;

            COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
            IF (XACT_STATE()) <> 0 OR @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        END CATCH
      `);

    const enemyTitle = defOwnerName ? `${defPoke.name} (Owner: ${defOwnerName})` : defPoke.name;
    let replyMsg = `🔥 *MATCHMAKING PVP ARENA!* 🔥\n*${player1.name} (Lv.${player1.lvl})* VS *${enemyTitle} (Lv.${defPoke.lvl})*\n\n`;
    
    replyMsg += battleResult.log.slice(-3).join('\n') + `\n\n`;

    if (isAtkWin) {
      replyMsg += `🏆 *VICTORY!* Lu berhasil menumbangkan musuh!\n`;
      replyMsg += `💰 Point: *+${userPointReward.toLocaleString('id-ID')}*\n`;
      replyMsg += `🎖️ PvP Point: *+${pvpPointChange}*\n`;
      replyMsg += `👤 User Exp: *+${userExpReward} EXP*`;
      replyMsg += expMsg;
    } else {
      replyMsg += `💀 *DEFEAT!* Gacoan lu rata di tanah.\n`;
      replyMsg += `📉 PvP Point: *${pvpPointChange}* (Poin minimal 0)`;
    }

    return { text: replyMsg };
  }
}