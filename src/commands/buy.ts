import { poolPromise } from '../config/db.config';

export default async function buyCommand(sock: any, messageContent: string, senderID: string) {
  try {
    const pool = await poolPromise;
    const userID = senderID.replace(/[@:\.\[\]#\$]/g, '_');
    const args = messageContent.trim().split(/\s+/);
    const itemNameInput = args[1];

    if (!itemNameInput) {
      return { text: '❌ Ketik: *!buy <nama_item>*\nContoh: *!buy charmAttack6h*, *!buy charmAttack3h*, dll.' };
    }

    const targetKey = itemNameInput.toLowerCase();

    // Config Charm (Attack, Defense, Toxic)
    const charmConfig: { [key: string]: { type: 'attack' | 'deff' | 'toxic', hours: number, power: number, col: string, powerCol: string, label: string } } = {
      'charmattack6h': { type: 'attack', hours: 6, power: 1.15, col: 'charm_attack_until', powerCol: 'charm_attack_power', label: 'Charm Attack 6H (+15% ATK)' },
      'charmattack3h': { type: 'attack', hours: 3, power: 1.20, col: 'charm_attack_until', powerCol: 'charm_attack_power', label: 'Warlord Attack 3H (+20% ATK) [PVP]' },

      'charmdeff6h': { type: 'deff', hours: 6, power: 1.15, col: 'charm_deff_until', powerCol: 'charm_deff_power', label: 'Charm Defense 6H (+15% DEF)' },
      'charmdeff3h': { type: 'deff', hours: 3, power: 1.20, col: 'charm_deff_until', powerCol: 'charm_deff_power', label: 'Warlord Defense 3H (+20% DEF) [PVP]' },

      'toxiccharm': { type: 'toxic', hours: 6, power: 1.0, col: 'toxic_charm_until', powerCol: '', label: 'Charm Anti-Toxic (6 Jam)' }
    };

    const config = charmConfig[targetKey];

    if (config) {
      // 1. Ambil detail item dari datadata_market (termasuk status is_pvp)
      const marketCheck = await pool.request()
        .input('itemName', itemNameInput)
        .query(`SELECT price, stock, ISNULL(is_pvp, 0) as is_pvp FROM datadata_market WHERE item_name = @itemName`);

      const itemData = marketCheck.recordset[0];
      if (!itemData) return { text: `❌ Item *${itemNameInput}* tidak ditemukan di market!` };
      if (itemData.stock <= 0 && itemData.stock !== -1) return { text: `❌ Stok item *${itemNameInput}* lagi habis ngab!` };

      const price = itemData.price;
      const isPvp = itemData.is_pvp === 1 || itemData.is_pvp === true;

      // 2. Cek Saldo User (Point atau PvP Point)
      const userRes = await pool.request()
        .input('userId', userID)
        .query(`SELECT ISNULL(point,0) as point, ISNULL(pvp_point,0) as pvp_point FROM datapengguna_users WHERE id = @userId`);

      const user = userRes.recordset[0] || { point: 0, pvp_point: 0 };

      if (isPvp) {
        if (user.pvp_point < price) {
          return { text: `❌ PvP Point lu gak cukup! Harga: *${price} PvP Point*, PvP Point lu: *${user.pvp_point}*` };
        }
      } else {
        if (user.point < price) {
          return { text: `❌ Poin lu gak cukup! Harga: *${price.toLocaleString('id-ID')} Poin*, Poin lu: *${user.point.toLocaleString('id-ID')}*` };
        }
      }

      // 3. MERGE / OVERWRITE BUFF DI COOLDOWN (Auto-Timpa Buff Lama)
      const powerUpdate = config.powerCol ? `, ${config.powerCol} = ${config.power}` : '';
      const powerInsertCol = config.powerCol ? `, ${config.powerCol}` : '';
      const powerInsertVal = config.powerCol ? `, ${config.power}` : '';

      await pool.request()
        .input('userId', userID)
        .input('itemName', itemNameInput)
        .input('price', price)
        .input('hours', config.hours)
        .input('isPvp', isPvp ? 1 : 0)
        .query(`
          BEGIN TRY
              BEGIN TRANSACTION;

              -- Potong Stok (kalo bukan unlimited)
              UPDATE datadata_market SET stock = stock - 1 WHERE item_name = @itemName AND stock > 0;

              -- Potong Balance User Sesuai Jenis Item (Point / PvP Point)
              IF @isPvp = 1
                  UPDATE datapengguna_users SET pvp_point = pvp_point - @price WHERE id = @userId;
              ELSE
                  UPDATE datapengguna_users SET point = point - @price WHERE id = @userId;

              -- AUTO-TIMPA TIMESTAMP & POWER BUFF DI COOLDOWN
              MERGE datapengguna_cooldown AS target
              USING (SELECT @userId AS user_id) AS source
              ON (target.user_id = source.user_id)
              WHEN MATCHED THEN
                  UPDATE SET ${config.col} = DATEADD(HOUR, @hours, GETDATE()) ${powerUpdate}
              WHEN NOT MATCHED THEN
                  INSERT (user_id, ${config.col} ${powerInsertCol})
                  VALUES (@userId, DATEADD(HOUR, @hours, GETDATE()) ${powerInsertVal});

              COMMIT TRANSACTION;
          END TRY
          BEGIN CATCH
              IF (XACT_STATE()) <> 0 OR @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
          END CATCH
        `);

      const currencyLabel = isPvp ? 'PvP Point' : 'Poin';

      return {
        text: `✨ *PEMBELIAN SUCCESS & AUTO-ACTIVE!* ✨\n\n` +
              `📦 Item: *${config.label}*\n` +
              `⏱️ Durasi: *${config.hours} Jam*\n` +
              `💸 Harga: *${price.toLocaleString('id-ID')} ${currencyLabel}*\n\n` +
              `_Buff resmi aktif/ditimpa di detik ini juga! Selamat bertarung bro! 🔥_`
      };
    }

    return { text: '❌ Item tidak ditemukan di market.' };

  } catch (err) {
    console.error('Error buyCommand:', err);
    return { text: '❌ Gagal memproses pembelian.' };
  }
}