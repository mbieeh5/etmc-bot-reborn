import { poolPromise } from '../config/db.config';

export async function checkToxic(userID: string, messageContent: string, groupID?: string | null) {
  try {
    const pool = await poolPromise;

    

    // ==========================================
    // 🐍 0. CEK VOODOO PUNISH (FORCE SEVERITY 2)
    // ==========================================
    let isPunished = false;

    // 1. Ambil kata toxic dari DB
    const wordsRes = await pool.request().query(`SELECT word, severity FROM datadata_toxic_words`);
    const toxicList: { word: string; severity: number }[] = wordsRes.recordset;

    // Normalisasi Pesan
    let cleanText = messageContent.toLowerCase()
      .replace(/3/g, 'e').replace(/4/g, 'a').replace(/0/g, 'o')
      .replace(/1/g, 'i').replace(/5/g, 's').replace(/[*._\-]/g, '');

    // 2. Deteksi akurat kata toxic
    let detectedSeverity = 0;
    for (const item of toxicList) {
      const regex = new RegExp(`\\b${item.word}\\b`, 'i');
      if (regex.test(cleanText)) {
        if (item.severity > detectedSeverity) {
          detectedSeverity = item.severity;
        }
      }
    }

    // OVERRIDE: Kalo kena punish Admin, paksa masuk Severity 2!
    if (isPunished) {
      detectedSeverity = 2;
    }

    if (detectedSeverity === 0) return null; // Bebas / Ga Kena Toxic

    // 3. CEK CHARM ANTI-TOXIC (BUFF 3 JAM)
    const charmCheck = await pool.request()
      .input('id', userID)
      .query(`
        SELECT toxic_charm_until 
        FROM datapengguna_cooldown 
        WHERE user_id = @id AND toxic_charm_until IS NOT NULL AND toxic_charm_until > GETDATE()
      `);

    const isProtected = charmCheck.recordset.length > 0;

    // Kalo punya Charm aktif -> SILENT!
    if (isProtected) {
      return null;
    }

    if (groupID) {
      const sanitizedGroupId = groupID.replace(/[@:\.\[\]#\$]/g, '_');
      const punishCheck = await pool.request()
        .input('userId', userID)
        .input('groupId', sanitizedGroupId)
        .query(`SELECT 1 FROM datapengguna_punish WHERE user_id = @userId AND group_id = @groupId`);

      if (punishCheck.recordset.length > 0) {
        isPunished = true;
      }
    }

    // A. SEVERITY 1 (WARN ONLY)
    if (detectedSeverity === 1) {
      const replyRes = await pool.request().query(`SELECT TOP 1 reply_text FROM datadata_toxic_replies ORDER BY NEWID()`);
      const replyMsg = replyRes.recordset[0]?.reply_text || 'dih toxic';
      return { isProtected: false, text: `⚠️ ${replyMsg}` };
    }

    // B. SEVERITY 2 (SEVERE BEGAL / VOODOO PUNISH)
    const result = await pool.request()
      .input('userId', userID)
      .query(`
        BEGIN TRY
            BEGIN TRANSACTION;

            DECLARE @Multiplier INT = 1;
            SELECT @Multiplier = ISNULL(value, 1) FROM datadata_multipliers WHERE name = 'ToxicX';

            DECLARE @PointDeduction INT = 5000 * @Multiplier;
            DECLARE @RepDeduction INT = 50 * @Multiplier;

            UPDATE datapengguna_users 
            SET point = ISNULL(point,0) - @PointDeduction,
                reputasi = ISNULL(reputasi, 0) - @RepDeduction
            WHERE id = @userId;

            DECLARE @SisaPoint INT, @SisaRep INT;
            SELECT @SisaPoint = ISNULL(point,0), @SisaRep = ISNULL(reputasi,0) FROM datapengguna_users WHERE id = @userId;

            DECLARE @RandomReply VARCHAR(255);
            SELECT TOP 1 @RandomReply = reply_text FROM datadata_toxic_replies ORDER BY NEWID();

            COMMIT TRANSACTION;

            SELECT 'SUCCESS' AS status, 
                   @PointDeduction AS point_loss, 
                   @RepDeduction AS rep_loss, 
                   @SisaPoint AS sisa_point, 
                   @SisaRep AS sisa_rep, 
                   ISNULL(@RandomReply, 'priiiitt jangan toxic!') AS reply_msg;
        END TRY
        BEGIN CATCH
            IF (XACT_STATE()) <> 0 OR @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            SELECT 'ERROR' AS status;
        END CATCH
      `);

    const res = result.recordset[0];
    if (res?.status === 'SUCCESS') {
      const customTitle = isPunished ? `🚨 *KUTUKAN VOODOO AKTIF! (PUNISHED BY ADMIN)*` : `🚨 *PRIIIITT! TOXIC!*`;
      const formatText = `${res.reply_msg}\n\n` +
                         `${customTitle}\n` +
                         `• Point: *-${res.point_loss.toLocaleString('id-ID')}*\n` +
                         `• Reputasi: *-${res.rep_loss.toLocaleString('id-ID')}*`;

      return { isProtected: false, text: formatText };
    }

    return null;

  } catch (error) {
    console.error('Error checkToxic:', error);
    return null;
  }
}