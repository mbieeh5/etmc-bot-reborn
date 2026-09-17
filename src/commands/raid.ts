import { poolPromise } from '../config/db.config';
import { processExpGain } from '../lib/pokemonLeveling';

export default async function raidCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    const args = messageContent.trim().split(/\s+/);
    const channelInput = parseInt(args[1], 10);

    if (!channelInput || ![1, 2, 3].includes(channelInput)) {
      return { 
        text: `⚔️ *WORLD BOSS RAID ARENA* ⚔️\n\n` +
              `Ketik: *!raid <channel_number>*\n` +
              `• *!raid 1* ➔ Boss HP 1M (Lv.50-55) [Reward: LH ONLY]\n` +
              `• *!raid 2* ➔ Boss HP 500K (Lv.30-49) [Reward: Top 3 DMG]\n` +
              `• *!raid 3* ➔ Boss HP 100K (Lv.5-29) [Reward: Top 3 DMG]`
      };
    }

    // 1. LOCK CHECK: Auto-Grind Check
    const grindCheck = await pool.request().input('userId', userID).query(`
      SELECT is_grinding FROM datapengguna_cooldown WHERE user_id = @userId AND is_grinding = 1 AND grind_end_time > GETDATE()
    `);
    if (grindCheck.recordset.length > 0) return { text: '⏳ Gacoan lu lagi auto-grind di hutan ngab!' };

    // 2. RAID DELAY CHECK (30 DETIK COOLDOWN)
    const RAID_COOLDOWN_SEC = 30;
    const cdCheck = await pool.request().input('userId', userID).input('cdSec', RAID_COOLDOWN_SEC).query(`
      DECLARE @LastRaid DATETIME;
      SELECT @LastRaid = last_raid FROM datapengguna_cooldown WHERE user_id = @userId;

      IF @LastRaid IS NOT NULL AND DATEDIFF(SECOND, @LastRaid, GETDATE()) < @cdSec
      BEGIN
          SELECT 'COOLDOWN' AS status, (@cdSec - DATEDIFF(SECOND, @LastRaid, GETDATE())) AS rem_sec;
          RETURN;
      END
      SELECT 'PASSED' AS status;
    `);

    if (cdCheck.recordset[0]?.status === 'COOLDOWN') {
      return { text: `⏳ *JEDA RAID!* Tangan lu pegel, tunggu *${cdCheck.recordset[0].rem_sec} detik* lagi buat mukul Boss!` };
    }

    // 3. CEK GACOAN USER & LEVEL REQUIREMENTS
    const gacoanRes = await pool.request().input('userId', userID).query(`
      SELECT p.id, p.name, p.lvl, p.exp, p.hp, p.max_hp, p.attack, p.defense 
      FROM datapengguna_gacoan g JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id
      WHERE g.user_id = @userId
    `);

    if (gacoanRes.recordset.length === 0) return { text: '❌ Lu belum set Gacoan! Ketik !setgacoan <index> dulu.' };
    const poke = gacoanRes.recordset[0];

    if (channelInput === 1 && poke.lvl < 50) return { text: `❌ Gacoan lu (Lv.${poke.lvl}) kekecilan buat Raid Ch.1! Minimal Level 50.` };
    if (channelInput === 2 && (poke.lvl < 30 || poke.lvl > 49)) return { text: `❌ Raid Ch.2 khusus Pokemon Level 30 - 49!` };
    if (channelInput === 3 && (poke.lvl < 5 || poke.lvl > 29)) return { text: `❌ Raid Ch.3 khusus Pokemon Level 5 - 29!` };

    if (poke.hp <= 0) return { text: `🚑 *${poke.name}* lu pingsan kena hantam Boss! Heal dulu pake !use potion.` };

    // 4. FETCH BUFF CHARM ATK & DEF
    const buffRes = await pool.request().input('userId', userID).query(`
      SELECT 
        CASE WHEN charm_attack_until IS NOT NULL AND charm_attack_until > GETDATE() THEN ISNULL(charm_attack_power, 1.15) ELSE 1.0 END as atkBuff,
        CASE WHEN charm_deff_until IS NOT NULL AND charm_deff_until > GETDATE() THEN ISNULL(charm_deff_power, 1.15) ELSE 1.0 END as defBuff
      FROM datapengguna_cooldown WHERE user_id = @userId
    `);

    const userBuffs = buffRes.recordset[0] || { atkBuff: 1.0, defBuff: 1.0 };
    const finalAtk = Math.floor(poke.attack * userBuffs.atkBuff);
    const finalDef = Math.floor(poke.defense * userBuffs.defBuff);

    // KALKULASI DAMAGE PLAYER KE BOSS
    const damageDealt = Math.floor((finalAtk * 10) + (Math.random() * 500) + 500);

    // KALKULASI DAMAGE COUNTERATTACK BOSS KE PLAYER (Sesuai Channel)
    const bossBaseAtkMap: { [key: number]: number } = { 1: 1200, 2: 600, 3: 250 };
    const bossRawAtk = bossBaseAtkMap[channelInput] || 300;
    
    // Damage Boss dikurangi Defense Player
    let bossCounterDamage = Math.max(50, Math.floor((bossRawAtk * 1.5) - (finalDef * 0.8) + (Math.random() * 100)));
    let newPlayerHp = poke.hp - bossCounterDamage;
    if (newPlayerHp < 0) newPlayerHp = 0;

    // 5. ATOMIC HIT & COUNTERATTACK TRANSACTION
    const hitResult = await pool.request()
      .input('channel', channelInput)
      .input('damage', damageDealt)
      .input('bossDamage', bossCounterDamage)
      .input('newPlayerHp', newPlayerHp)
      .input('pokeDbId', poke.id)
      .input('userId', userID)
      .query(`
        BEGIN TRY
            BEGIN TRANSACTION;

            -- 1. Cek Status Boss
            DECLARE @BossName VARCHAR(100), @CurrentHP INT, @MaxHP INT, @IsActive BIT;
            SELECT @BossName = boss_name, @CurrentHP = current_hp, @MaxHP = max_hp, @IsActive = is_active 
            FROM datadata_raid_boss WITH (UPDLOCK) WHERE channel = @channel;

            IF @IsActive = 0 OR @CurrentHP <= 0
            BEGIN
                ROLLBACK TRANSACTION;
                SELECT 'DEAD' AS status, @BossName AS boss_name;
                RETURN;
            END

            -- 2. Potong HP Boss
            DECLARE @NewHP INT = @CurrentHP - @damage;
            IF @NewHP < 0 SET @NewHP = 0;
            UPDATE datadata_raid_boss SET current_hp = @NewHP WHERE channel = @channel;

            -- 3. Potong HP Pokemon Player (Counterattack!)
            UPDATE datapengguna_pokemon SET hp = @newPlayerHp WHERE id = @pokeDbId;

            -- 4. Update Cooldown Raid Player (30 Detik)
            MERGE datapengguna_cooldown AS target
            USING (SELECT @userId AS user_id) AS source
            ON (target.user_id = source.user_id)
            WHEN MATCHED THEN UPDATE SET last_raid = GETDATE()
            WHEN NOT MATCHED THEN INSERT (user_id, last_raid) VALUES (@userId, GETDATE());

            -- 5. Simpen Akumulasi Damage Player
            MERGE datapengguna_raid_damage AS target
            USING (SELECT @channel AS channel, @userId AS user_id) AS source
            ON (target.channel = source.channel AND target.user_id = source.user_id)
            WHEN MATCHED THEN UPDATE SET total_damage = target.total_damage + @damage
            WHEN NOT MATCHED THEN INSERT (channel, user_id, total_damage) VALUES (@channel, @userId, @damage);

            -- 6. Kalau Boss Tumbang
            IF @NewHP = 0
            BEGIN
                UPDATE datadata_raid_boss SET is_active = 0 WHERE channel = @channel;
                COMMIT TRANSACTION;
                SELECT 'KILLED' AS status, @BossName AS boss_name, @damage AS dmg_dealt, 0 AS rem_hp, @MaxHP AS max_hp;
                RETURN;
            END

            COMMIT TRANSACTION;
            SELECT 'HIT_SUCCESS' AS status, @BossName AS boss_name, @damage AS dmg_dealt, @NewHP AS rem_hp, @MaxHP AS max_hp;
        END TRY
        BEGIN CATCH
            IF (XACT_STATE()) <> 0 OR @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            SELECT 'ERROR' AS status;
        END CATCH
      `);

    const res = hitResult.recordset[0];
    if (res?.status === 'DEAD') return { text: `☠️ *${res.boss_name}* di Channel ${channelInput} udah tumbang!` };

    // Status HP Player
    const playerStatusMsg = newPlayerHp === 0 
      ? `\n☠️ *GACOAN LU KO/PINGSAN!* Kena serangan balasan Boss (-${bossCounterDamage} HP). Heal dulu pake !use potion.`
      : `\n🛡️ *Balasan Boss:* -${bossCounterDamage} HP (Sisa HP Lu: ${newPlayerHp}/${poke.max_hp})`;

    // ==========================================
    // HASIL PUKULAN BIASA
    // ==========================================
    if (res?.status === 'HIT_SUCCESS') {
      return {
        text: `💥 *CRITICAL HIT RAID!* 💥\n\n` +
              `👾 Boss: *${res.boss_name}*\n` +
              `⚔️ Damage Lu: *-${res.dmg_dealt.toLocaleString('id-ID')} DMG*\n` +
              `❤️ Sisa HP Boss: *${res.rem_hp.toLocaleString('id-ID')} / ${res.max_hp.toLocaleString('id-ID')}*` +
              `${playerStatusMsg}`
      };
    }

    // ==========================================
    // JIKA BOSS TUMBANG
    // ==========================================
    if (res?.status === 'KILLED') {
      let rewardAnnounce = `🎉 *WORLD BOSS DOWN!* 🎉\n*${res.boss_name}* berhasil ditumbangkan!\n\n`;

      if (channelInput === 1) {
        const randomTickets = Math.floor(Math.random() * 5) + 1;

        await pool.request().input('userId', userID).query(`
          UPDATE datapengguna_users SET point = ISNULL(point,0) + 100000, pvp_point = ISNULL(pvp_point,0) + 5000 WHERE id = @userId;

          MERGE datapengguna_cooldown AS target
          USING (SELECT @userId AS user_id) AS source
          ON (target.user_id = source.user_id)
          WHEN MATCHED THEN
              UPDATE SET charm_attack_until = DATEADD(HOUR, 3, GETDATE()), charm_attack_power = 1.20,
                         charm_deff_until = DATEADD(HOUR, 3, GETDATE()), charm_deff_power = 1.20
          WHEN NOT MATCHED THEN
              INSERT (user_id, charm_attack_until, charm_attack_power, charm_deff_until, charm_deff_power)
              VALUES (@userId, DATEADD(HOUR, 3, GETDATE()), 1.20, DATEADD(HOUR, 3, GETDATE()), 1.20);

          DELETE FROM datapengguna_raid_damage WHERE channel = 1;
        `);

        rewardAnnounce += `🏆 *LAST HITTER (SULTAN WINNER):*\n` +
                         `👑 Hitter: *@${userID.split('_')[0]}*\n\n` +
                         `🎁 *HADIAH LH CHANNEL 1:*\n` +
                         `• +100.000 Poin\n` +
                         `• +5.000 PvP Point\n` +
                         `• ⚔️ Warlord Charm ATK & DEF 3 Jam (+20%)\n` +
                         `• 🎟️ +${randomTickets}x Training Ticket`;
      }

      if (channelInput === 2 || channelInput === 3) {
        const topDmgRes = await pool.request()
          .input('channel', channelInput)
          .query(`SELECT TOP 3 user_id, total_damage FROM datapengguna_raid_damage WHERE channel = @channel ORDER BY total_damage DESC`);

        const winners = topDmgRes.recordset;
        rewardAnnounce += `📊 *TOP DAMAGE DEALERS (REWARD SPREAD):*\n`;

        for (let idx = 0; idx < winners.length; idx++) {
          const w = winners[idx];
          const rank = idx + 1;
          const wUserId = w.user_id;

          if (channelInput === 2) {
            const pvpPts = rank === 1 ? 2500 : rank === 2 ? 1250 : 600;
            const masterballs = rank === 1 ? Math.floor(Math.random() * 5) + 1 : 1;

            await pool.request().input('uid', wUserId).input('pvp', pvpPts).query(`
              UPDATE datapengguna_users SET point = ISNULL(point,0) + 100000, pvp_point = ISNULL(pvp_point,0) + @pvp WHERE id = @uid;
            `);

            rewardAnnounce += `${rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'} Rank ${rank}: *@${wUserId.split('_')[0]}* (${w.total_damage.toLocaleString('id-ID')} DMG) ➔ +100k Poin, +${pvpPts} PvP Pt, +${masterballs}x Masterball\n`;
          } 
          else if (channelInput === 3) {
            const pvpPts = rank === 1 ? 500 : rank === 2 ? 250 : 100;
            const dropUltraball = Math.random() <= 0.01 ? 1 : 0;

            const lvlRes = processExpGain(poke.lvl, poke.exp, 300);
            
            await pool.request().input('uid', wUserId).input('pvp', pvpPts).input('pokeDbId', poke.id).input('newLvl', lvlRes.newLevel).input('newExp', lvlRes.newExp).query(`
              UPDATE datapengguna_users SET point = ISNULL(point,0) + 10000, pvp_point = ISNULL(pvp_point,0) + @pvp WHERE id = @uid;
              UPDATE datapengguna_pokemon SET lvl = @newLvl, exp = @newExp WHERE id = @pokeDbId;
            `);

            rewardAnnounce += `${rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'} Rank ${rank}: *@${wUserId.split('_')[0]}* (${w.total_damage.toLocaleString('id-ID')} DMG) ➔ +10k Poin, +${pvpPts} PvP Pt, +300 Poke EXP ${dropUltraball ? '⚡[BONUS ULTRABALL]' : ''}\n`;
          }
        }

        await pool.request().input('channel', channelInput).query(`DELETE FROM datapengguna_raid_damage WHERE channel = @channel`);
      }

      return { text: rewardAnnounce };
    }

    return { text: '❌ Gagal memproses serangan raid.' };

  } catch (error) {
    console.error('Error raidCommand:', error);
    return { text: '❌ System Error Raid Engine.' };
  }
}