import { poolPromise } from '../config/db.config';
import pokeballCommand from './pokeball';

export default async function absenCommand(sock: any, message: string, sender: string, group?: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    // 1. Ambil Multiplier Sistem (AbsenX)
    const multiRes = await pool.request()
      .input('multiplierName', 'AbsenX')
      .query(`SELECT TOP 1 value FROM datadata_multipliers WHERE name = @multiplierName`);
    
    const systemMultiplier = Number(multiRes.recordset[0]?.value) || 1;

    // 2. Cek Apakah User Merupakan Top 1 TopKiller (WARLORD)
    const top1Res = await pool.request().query(`
      SELECT TOP 1 id 
      FROM datapengguna_users 
      WHERE ISNULL(pvp_kills, 0) > 0 
      ORDER BY pvp_kills DESC, pvp_point DESC
    `);
    
    const top1Id = top1Res.recordset[0]?.id;
    const isTop1 = top1Id === userID;
    const top1Multiplier = isTop1 ? 2 : 1;

    // Combined Multiplier (Sistem Multiplier x Buff Warlord Top 1)
    const finalMultiplier = systemMultiplier * top1Multiplier;

    // 3. Kalkulasi Gain
    const rawPoint = Math.floor(Math.random() * (600 - 300 + 1)) + 300;
    const rawRep = Math.floor(Math.random() * (40 - 20 + 1)) + 20;
    const rawExp = 12;

    const finalPoint = Math.floor(rawPoint * finalMultiplier);
    const finalRep = Math.floor(rawRep * finalMultiplier);
    const finalExp = Math.floor(rawExp * finalMultiplier);

    const COOLDOWN_HOURS = 3;

    // 4. Eksekusi Atomic Query (Cek Cooldown + Upsert User + Upsert Cooldown sekaligus)
    const result = await pool.request()
      .input('id', userID)
      .input('point', finalPoint)
      .input('exp', finalExp)
      .input('reputasi', finalRep)
      .input('cdHours', COOLDOWN_HOURS)
      .query(`
        DECLARE @LastAbsen DATETIME;
        SELECT @LastAbsen = last_absen FROM datapengguna_cooldown WHERE user_id = @id;

        -- Cek kalau masih dalam jeda cooldown 3 jam
        IF @LastAbsen IS NOT NULL AND DATEDIFF(HOUR, @LastAbsen, GETDATE()) < @cdHours
        BEGIN
            SELECT 'COOLDOWN' AS status, DATEDIFF(MINUTE, GETDATE(), DATEADD(HOUR, @cdHours, @LastAbsen)) AS remaining_minutes;
            RETURN;
        END

        -- Upsert User (Insert kalo gak ada, Update kalo udah ada)
        MERGE datapengguna_users AS target
        USING (SELECT @id AS id) AS source
        ON (target.id = source.id)
        WHEN MATCHED THEN
            UPDATE SET 
                point = target.point + @point,
                exp = target.exp + @exp,
                reputasi = target.reputasi + @reputasi
        WHEN NOT MATCHED THEN
            INSERT (id, nama, point, exp, reputasi)
            VALUES (@id, 'noname', @point, @exp, @reputasi);

        -- Upsert Cooldown Timestamp
        MERGE datapengguna_cooldown AS target
        USING (SELECT @id AS user_id) AS source
        ON (target.user_id = source.user_id)
        WHEN MATCHED THEN
            UPDATE SET last_absen = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (user_id, last_absen)
            VALUES (@id, GETDATE());

        SELECT 'SUCCESS' AS status;
      `);

    const resStatus = result.recordset[0];

    // Cek Cooldown
    if (resStatus?.status === 'COOLDOWN') {
      const remainingMin = resStatus.remaining_minutes || 0;
      const hours = Math.floor(remainingMin / 60);
      const mins = remainingMin % 60;
      return { text: `❌ Kamu sudah absen! Tunggu lagi ${hours} jam ${mins} menit.` };
    }

    // 5. Panggil Bonus Pokeball HANYA KALAU ABSEN BERHASIL
    const pokeballRes = await pokeballCommand(sock, message, sender);
    const pokeballBundle = (pokeballRes?.text || '').replace("🔍 *BERHASIL FARMING ITEM:* 🎒", 'BONUS ABSEN:');

    // Text Formatting
    const warlordTag = isTop1 ? `\n👑 *BUFF TOP 1 WARLORD (PASIF X2 AKTIF)*` : '';
    const multiDetail = isTop1 ? `[X${finalMultiplier} (Sys X${systemMultiplier} * Warlord X2)]` : `[X${finalMultiplier}]`;

    return {
      text: `✅ *ABSEN BERHASIL!*${warlordTag}\n` +
            `+${finalPoint.toLocaleString('id-ID')} Poin ${multiDetail}\n` +
            `+${finalRep} Reputasi ${multiDetail}\n` +
            `+${finalExp} EXP ${multiDetail}\n\n` +
            `${pokeballBundle.trim()}`
    };

  } catch (error) {
    console.error('❌ Gagal absen:', error);
    return { text: 'Terjadi kesalahan saat absen!' };
  }
}