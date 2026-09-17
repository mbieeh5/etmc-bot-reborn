import { poolPromise } from '../config/db.config';

export default async function redeemCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    const args = messageContent.trim().split(/\s+/);
    const couponInput = args[1];

    if (!couponInput) {
      return { text: '❌ Format salah! Ketik: !redeem <kodeKupon>' };
    }

    // 1. Ambil Master Kupon dari DB
    const couponRes = await pool.request()
      .input('code', couponInput)
      .query(`SELECT code, name, description, is_single_use, is_active, reward_json FROM datadata_coupons WHERE code = @code`);

    if (couponRes.recordset.length === 0) {
      return { text: '❌ Kode kupon tidak valid / tidak ditemukan!' };
    }

    const coupon = couponRes.recordset[0];
    if (!coupon.is_active) {
      return { text: '❌ Kupon ini sudah tidak aktif!' };
    }

    const isSingleUse = coupon.code.startsWith('22') || coupon.is_single_use === true;

    // 2. Cek Apakah User Sudah Pernah Claim Kupon Ini (Khusus Prefix 11 / Global)
    const historyCheck = await pool.request()
      .input('userId', userID)
      .input('code', couponInput)
      .query(`SELECT 1 FROM datapengguna_redeem_history WHERE user_id = @userId AND coupon_code = @code`);

    if (historyCheck.recordset.length > 0) {
      return { text: `❌ Kamu sudah pernah meredeem kupon *${coupon.name}* sebelumnya!` };
    }

    // 3. PARSE DYNAMIC REWARD JSON
    let reward: any = {};
    try {
      reward = JSON.parse(coupon.reward_json);
    } catch (e) {
      return { text: '❌ Error parsing reward kupon, hubungi admin!' };
    }

    // 4. EXECUTE REDEEM (ATOMIC TRANSACTION)
    const transactionResult = await pool.request()
      .input('userId', userID)
      .input('code', couponInput)
      .input('isSingleUse', isSingleUse ? 1 : 0)
      .query(`
        BEGIN TRY
            BEGIN TRANSACTION;

            -- Cek ulang kalau Single-Use (Prefix 22), pastikan belum dimakan orang lain
            IF @isSingleUse = 1
            BEGIN
                IF EXISTS (SELECT 1 FROM datapengguna_redeem_history WHERE coupon_code = @code)
                BEGIN
                    SELECT 'ALREADY_CLAIMED_BY_OTHERS' AS status;
                    ROLLBACK TRANSACTION;
                    RETURN;
                END
            END

            -- Catat History Redeem User
            INSERT INTO datapengguna_redeem_history (user_id, coupon_code) VALUES (@userId, @code);

            -- Kalau kupon Single-Use (Prefix 22), nonaktifkan kuponnya sekalian
            IF @isSingleUse = 1
            BEGIN
                UPDATE datadata_coupons SET is_active = 0 WHERE code = @code;
            END

            COMMIT TRANSACTION;
            SELECT 'SUCCESS' AS status;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            SELECT 'ERROR' AS status, ERROR_MESSAGE() AS errMsg;
        END CATCH
      `);

    const statusRes = transactionResult.recordset[0];
    if (statusRes?.status === 'ALREADY_CLAIMED_BY_OTHERS') {
      return { text: `❌ Kupon *${coupon.name}* (Single-Use) udah hangus keduluan diambil orang lain!` };
    }
    if (statusRes?.status !== 'SUCCESS') {
      return { text: '❌ Gagal meredeem kupon!' };
    }

    // 5. EKSEKUSI HADIAH DYNAMIC KE DATING USERS & INVENTORY
    let rewardLog: string[] = [];

    // A. Cek Pemutihan Point / Reputasi Minus
    if (reward.cure_point_minus) {
      await pool.request().input('userId', userID).query(`UPDATE datapengguna_users SET point = 0 WHERE id = @userId AND point < 0`);
      rewardLog.push('• Pemutihan Poin Minus (Poin dikembalikan ke 0)');
    }

    if (reward.cure_rep_minus) {
      await pool.request().input('userId', userID).query(`UPDATE datapengguna_users SET reputasi = 0 WHERE id = @userId AND reputasi < 0`);
      rewardLog.push('• Pemutihan Reputasi Minus (Reputasi dikembalikan ke 0)');
    }

    // B. Reward Poin, Reputasi, & EXP
    if (reward.point || reward.reputasi || reward.exp) {
      const p = reward.point || 0;
      const r = reward.reputasi || 0;
      const e = reward.exp || 0;

      await pool.request()
        .input('userId', userID)
        .input('p', p).input('r', r).input('e', e)
        .query(`
          UPDATE datapengguna_users 
          SET point = point + @p, 
              reputasi = ISNULL(reputasi, 0) + @r,
              exp = ISNULL(exp, 0) + @e 
          WHERE id = @userId
        `);

      if (p > 0) rewardLog.push(`• +${p.toLocaleString('id-ID')} Poin`);
      if (r > 0) rewardLog.push(`• +${r} Reputasi`);
      if (e > 0) rewardLog.push(`• +${e} EXP`);
    }

    // C. Reward Items Inventory (Dynamic Item Bulk UPSERT)
    if (reward.items && typeof reward.items === 'object') {
      const itemEntries = Object.entries(reward.items);
      
      for (const [itemName, qty] of itemEntries) {
        await pool.request()
          .input('userId', userID)
          .input('itemName', itemName)
          .input('qty', Number(qty))
          .query(`
            MERGE datapengguna_inventory AS target
            USING (SELECT @userId AS user_id, @itemName AS item_name) AS source
            ON (target.user_id = source.user_id AND target.item_name = source.item_name)
            WHEN MATCHED THEN UPDATE SET quantity = target.quantity + @qty
            WHEN NOT MATCHED THEN INSERT (user_id, item_name, quantity) VALUES (@userId, @itemName, @qty);
          `);

        rewardLog.push(`• +${qty}x ${itemName}`);
      }
    }

    // 6. Return Text Sukses
    let replyText = `🎉 *REDEEM KUPON BERHASIL!* 🎉\n\n` +
                    `🎫 *${coupon.name}*\n` +
                    `📝 _${coupon.description || '-' }_\n\n` +
                    `*Hadiah yang didapat:*\n` +
                    rewardLog.join('\n') + `\n\n` +
                    (isSingleUse ? `⚠️ _KUPON SINGLE-USE (Telah Hangus!)_` : `ℹ️ _KUPON GLOBAL (1x per Akun)_`);

    return { text: replyText };

  } catch (error) {
    console.error('Error redeem:', error);
    return { text: '❌ Error saat meredeem kupon!' };
  }
}