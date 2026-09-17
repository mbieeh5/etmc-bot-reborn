import { poolPromise } from '../../config/db.config';
import { checkGroupAdmin } from '../../lib/isAdmin';
import { getLevel } from '../../lib/getLevel';

export default async function groupAdminCommand(sock: any, messageContent: string, senderID: string, groupID?: string) {
  try {
    if (!groupID) return { text: '❌ Command prefix & cuma bisa dipakai di dalam Grup (Guild)!' };

    const pool = await poolPromise;
    const sanitizedGroupId = groupID.replace(/[@:\.\[\]#\$]/g, '_');
    const sanitizedSenderId = senderID.replace(/[@:\.\[\]#\$]/g, '_');
    const args = messageContent.trim().split(/\s+/);
    const cmd = args[0].toLowerCase(); // &stat, &claim, &punish, &unpunish, &absen

    // ==========================================
    // 0. &stat (Cek Status Guild / Group - Semua Member Bisa)
    // ==========================================
    if (cmd === '&stat') {
      const res = await pool.request()
        .input('id', sanitizedGroupId)
        .query(`SELECT nama, point, reputasi, exp FROM datapengguna_users WHERE id = @id`);

      if (res.recordset.length === 0) {
        return { text: '❌ Group/Guild ini belum terdaftar di database!' };
      }

      const guild = res.recordset[0];
      const nama = guild.nama || 'Nama Group Kosong';
      const point = (guild.point || 0).toLocaleString('id-ID');
      const reputasi = guild.reputasi || 0;
      const exp = guild.exp || 0;

      const { level, rank } = getLevel(exp);

      const getTier = (rep: number): string => {
        if (rep <= 0) return '💀BOCAH TOXIC💀';
        if (rep <= 10) return '_Bronze_';
        if (rep <= 20) return '_Silver_';
        if (rep <= 30) return '_Gold_';
        if (rep <= 50) return '_Platinum_';
        if (rep <= 75) return '💠Emerald💠';
        if (rep <= 100) return '💎Diamond💎';
        if (rep <= 150) return '👑Royalty👑';
        if (rep <= 200) return '♚CROWN♚';
        if (rep <= 300) return '👑Master👑';
        if (rep <= 400) return '⚡Grandmaster⚡';
        if (rep <= 500) return '⭐ACE⭐';
        if (rep === 666) return '👹S0N-0F-S4TAN👹';
        if (rep <= 750) return '🔥Inferno🔥';
        if (rep <= 1000) return '🔥CONQUEROR🔥';
        if (rep <= 1500) return '🌟Legendary🌟';
        if (rep <= 2000) return '⚜️Mythical⚜️';
        if (rep <= 3000) return '🌌Cosmic🌌';
        if (rep <= 4000) return '🚀Interstellar🚀';
        if (rep <= 5000) return '🛡️Immortal🛡️';
        if (rep <= 7500) return '🌟Celestial🌟';
        if (rep <= 10000) return '⚡Divine⚡';
        if (rep <= 20000) return '👑Titan👑';
        if (rep <= 50000) return '🚨Omniscient🚨';
        if (rep <= 100000) return '💥Supreme💥';
        if (rep <= 500000) return '🌟Infinite🌟';
        if (rep > 500000) return '👑GOD👑';
        return 'Anak💀Haram';
      };

      const tier = getTier(reputasi);

      return {
        text: `🏰 *GUILD STATS* 🏰\n\n` +
              `*${nama}*\n` +
              `- ID: _${sanitizedGroupId.split('_')[0]}_\n` +
              `- Guild Level: *${level}* (${rank})\n` +
              `- Rank Guild: *${tier}*\n` +
              `- Kas Point: *${point}*\n` +
              `- Reputasi Guild: *${reputasi}*\n` +
              `- EXP Guild: *${exp.toLocaleString('id-ID')}*`
      };
    }

    // ==========================================
    // VALIDASI ADMIN KHUSUS COMMAND LAIN (&absen, &claim, &punish, &unpunish)
    // ==========================================
    const isAdmin = await checkGroupAdmin(sock, groupID, senderID);
    if (!isAdmin) return { text: '❌ Lu bukan Admin di grup ini ngab! Otoritas ditolak.' };

    // 1. &absen (Guild Check-in 12 Jam)
    if (cmd === '&absen') {
      const COOLDOWN_HOURS = 12;

      const cdCheck = await pool.request().input('groupId', sanitizedGroupId).input('cdHours', COOLDOWN_HOURS).query(`
        DECLARE @LastAbsen DATETIME;
        SELECT @LastAbsen = group_absen FROM datapengguna_cooldown WHERE user_id = @groupId;
        
        IF @LastAbsen IS NOT NULL AND DATEDIFF(HOUR, @LastAbsen, GETDATE()) < @cdHours
        BEGIN
            SELECT 'COOLDOWN' AS status, (@cdHours * 60 - DATEDIFF(MINUTE, @LastAbsen, GETDATE())) AS rem_min;
            RETURN;
        END

        MERGE datapengguna_cooldown AS target
        USING (SELECT @groupId AS user_id) AS source
        ON (target.user_id = source.user_id)
        WHEN MATCHED THEN UPDATE SET group_absen = GETDATE()
        WHEN NOT MATCHED THEN INSERT (user_id, group_absen) VALUES (@groupId, GETDATE());

        SELECT 'SUCCESS' AS status;
      `);

      const resStatus = cdCheck.recordset[0];
      if (resStatus?.status === 'COOLDOWN') {
        const hours = Math.floor(resStatus.rem_min / 60);
        const mins = resStatus.rem_min % 60;
        return { text: `⏳ Guild udah absen! Tunggu *${hours} jam ${mins} menit* lagi buat absen grup.` };
      }

      const pointReward = 25000;
      const expReward = 1000;
      const repReward = 50;

      await pool.request()
        .input('groupId', sanitizedGroupId).input('p', pointReward).input('e', expReward).input('r', repReward)
        .query(`
          UPDATE datapengguna_users 
          SET point = ISNULL(point,0) + @p, 
              exp = ISNULL(exp,0) + @e, 
              reputasi = ISNULL(reputasi,0) + @r 
          WHERE id = @groupId
        `);

      return { 
        text: `🏰 *GUILD CHECK-IN BERHASIL!*\n\n` +
              `Otoritas admin mencairkan dana subsidi ke kas Guild:\n` +
              `• +${pointReward.toLocaleString('id-ID')} Poin\n` +
              `• +${expReward.toLocaleString('id-ID')} EXP\n` +
              `• +${repReward} Reputasi\n\n` +
              `_Gunakan &claim buat merampok kas ini wkwkwk._` 
      };
    }

    // 2. &claim (Rampok Kas Guild)
    if (cmd === '&claim') {
      const result = await pool.request().input('groupId', sanitizedGroupId).input('adminId', sanitizedSenderId).query(`
        BEGIN TRY
            BEGIN TRANSACTION;
            DECLARE @KasPoint INT = 0;
            SELECT @KasPoint = ISNULL(point, 0) FROM datapengguna_users WHERE id = @groupId;

            IF @KasPoint <= 0
            BEGIN
                SELECT 'EMPTY' AS status;
                ROLLBACK TRANSACTION;
                RETURN;
            END

            UPDATE datapengguna_users SET point = 0 WHERE id = @groupId;
            UPDATE datapengguna_users SET point = ISNULL(point,0) + @KasPoint WHERE id = @adminId;

            COMMIT TRANSACTION;
            SELECT 'SUCCESS' AS status, @KasPoint AS claimed_amount;
        END TRY
        BEGIN CATCH
            IF (XACT_STATE()) <> 0 OR @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            SELECT 'ERROR' AS status;
        END CATCH
      `);

      const res = result.recordset[0];
      if (res?.status === 'EMPTY') return { text: '❌ Kas grup kosong! Ketik &absen dulu atau tunggu member pada gacha wkwk.' };
      if (res?.status === 'SUCCESS') {
        return { text: `💰 *DANA GUILD CAIR!*\n\nAdmin mencairkan saldo *${res.claimed_amount.toLocaleString('id-ID')} Poin* ke dompet pribadi! 🏃💨` };
      }
    }

    // PARSER TARGET UNTUK PUNISH/UNPUNISH
    const targetTag = args[1];
    if (!targetTag) return { text: `❌ Mana tag targetnya kocak? Contoh: ${cmd} @628xxx` };
    
    const targetNumber = targetTag.replace(/[^0-9]/g, '');
    const targetPattern = `${targetNumber}_%`;
    
    const userCheck = await pool.request().input('pattern', targetPattern).query(`SELECT TOP 1 id FROM datapengguna_users WHERE id LIKE @pattern`);
    const targetId = userCheck.recordset[0]?.id;
    if (!targetId) return { text: '❌ User tersebut belum daftar di bot ini!' };

    // 3. &punish
    if (cmd === '&punish') {
      await pool.request().input('userId', targetId).input('groupId', sanitizedGroupId).query(`
        IF NOT EXISTS (SELECT 1 FROM datapengguna_punish WHERE user_id = @userId AND group_id = @groupId)
        BEGIN
            INSERT INTO datapengguna_punish (user_id, group_id) VALUES (@userId, @groupId);
        END
      `);
      return { text: `😈 *VOODOO AKTIF!*\n@${targetNumber} berhasil dikutuk! Sekarang apa pun yg dia ketik di grup ini bakal dipotong poinnya!` };
    }

    // 4. &unpunish
    if (cmd === '&unpunish') {
      const res = await pool.request().input('userId', targetId).input('groupId', sanitizedGroupId).query(`
        DELETE FROM datapengguna_punish OUTPUT DELETED.user_id WHERE user_id = @userId AND group_id = @groupId;
      `);
      if (res.recordset.length === 0) return { text: `❌ @${targetNumber} emang gak lagi dihukum!` };
      return { text: `😇 *CLEANSED!*\nKutukan buat @${targetNumber} udah dilepas.` };
    }

    return null;

  } catch (error) {
    console.error('Error GroupAdmin Command:', error);
    return { text: '❌ System Error (GroupAdmin).' };
  }
}