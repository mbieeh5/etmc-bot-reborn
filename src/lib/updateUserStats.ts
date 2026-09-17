import { poolPromise } from '../config/db.config'

export async function updateUserStats(
  userId: string, 
  messageText: string, 
  pushName?: string | null, 
  groupId?: string | null,
  groupName?: string | null
) {
  const pointIncrement = Math.min(messageText.length, 511);
  const expIncrement = 5;
  const reputasiIncrement = 5;

  const userName = pushName?.trim() || 'Anonim';

  try {
    const pool = await poolPromise;

    // 1. UPSERT USER (Nama terkunci kalo bukan 'Anonim')
    await pool.request()
      .input("id", userId)
      .input("nama", userName)
      .input("point", pointIncrement)
      .input("exp", expIncrement)
      .input("reputasi", reputasiIncrement)
      .query(`
        MERGE datapengguna_users AS target
        USING (SELECT @id AS id) AS source
        ON (target.id = source.id)
        WHEN MATCHED THEN
            UPDATE SET 
                point = ISNULL(target.point, 0) + @point,
                exp = ISNULL(target.exp, 0) + @exp,
                reputasi = ISNULL(target.reputasi, 0) + @reputasi,
                -- HANYA UPDATE NAMA JIKA NAMA DI DB MASIH NULL / 'Anonim'
                nama = CASE 
                    WHEN target.nama IS NULL OR target.nama = 'Anonim' THEN @nama 
                    ELSE target.nama 
                END
        WHEN NOT MATCHED THEN
            INSERT (id, nama, point, exp, reputasi)
            VALUES (@id, @nama, @point, @exp, @reputasi);
      `);

    // 2. UPSERT KAS GROUP
    if (groupId) {
      const sanitizedGroupId = groupId.replace(/[@:\.\[\]#\$]/g, '_');
      const gName = groupName?.trim() || 'Anonim Group';

      await pool.request()
        .input("id", sanitizedGroupId)
        .input("nama", gName)
        .input("point", pointIncrement)
        .input("exp", expIncrement)
        .input("reputasi", reputasiIncrement)
        .query(`
          MERGE datapengguna_users AS target
          USING (SELECT @id AS id) AS source
          ON (target.id = source.id)
          WHEN MATCHED THEN
              UPDATE SET 
                  point = ISNULL(target.point, 0) + @point,
                  exp = ISNULL(target.exp, 0) + @exp,
                  reputasi = ISNULL(target.reputasi, 0) + @reputasi,
                  -- HANYA UPDATE NAMA GRUP JIKA DI DB MASIH NULL / 'Anonim Group'
                  nama = CASE 
                      WHEN target.nama IS NULL OR target.nama = 'Anonim Group' THEN @nama 
                      ELSE target.nama 
                  END
          WHEN NOT MATCHED THEN
              INSERT (id, nama, point, exp, reputasi)
              VALUES (@id, @nama, @point, @exp, @reputasi);
        `);
    }

  } catch (err) {
    console.error('❌ Failed to update user/group stats:', err);
  }
}