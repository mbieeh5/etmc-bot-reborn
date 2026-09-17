import { poolPromise } from '../config/db.config';

export default async function pokeballCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    const COOLDOWN_SECONDS = 60; // Cooldown 1 menit

    // 1. Cek Cooldown (Pake Timestamp SQL, no setTimeout!)
    const cdCheck = await pool.request()
      .input('id', userID)
      .input('cdSec', COOLDOWN_SECONDS)
      .query(`
        DECLARE @LastSearch DATETIME;
        SELECT @LastSearch = last_search FROM datapengguna_cooldown WHERE user_id = @id;

        IF @LastSearch IS NOT NULL AND DATEDIFF(SECOND, @LastSearch, GETDATE()) < @cdSec
        BEGIN
            SELECT 'COOLDOWN' AS status, (@cdSec - DATEDIFF(SECOND, @LastSearch, GETDATE())) AS rem_sec;
            RETURN;
        END

        -- Update timestamp search ke waktu sekarang
        MERGE datapengguna_cooldown AS target
        USING (SELECT @id AS user_id) AS source
        ON (target.user_id = source.user_id)
        WHEN MATCHED THEN UPDATE SET last_search = GETDATE()
        WHEN NOT MATCHED THEN INSERT (user_id, last_search) VALUES (@id, GETDATE());

        SELECT 'SUCCESS' AS status;
      `);

    const cdStatus = cdCheck.recordset[0];
    if (cdStatus?.status === 'COOLDOWN') {
      const sec = cdStatus.rem_sec || 0;
      return { text: `⏳ Jeda 1 menit ya, buat farming Pokeballs... (${sec}s tersisa)` };
    }

    // 2. LOGIKA BUNDLING LOOT DROP (RF ONLINE STYLE)
    const randomChance = Math.random() * 100;
    const lootList: { name: string; qty: number }[] = [];
    let lootText = '🔍 *BERHASIL FARMING ITEM:* 🎒\n\n';

    // GUARANTEED DROP (100% Rate)
    const potionCount = Math.floor(Math.random() * 3) + 1; // 1-3
    const pokeballCount = Math.floor(Math.random() * 3) + 3; // 3-5
    
    lootList.push({ name: 'potion', qty: potionCount });
    lootList.push({ name: 'pokeballs', qty: pokeballCount });
    lootText += `• ${potionCount}x Potion\n• ${pokeballCount}x Pokeball\n`;

    // UNCOMMON DROP (> 80 / Top 20% Chance)
    if (randomChance > 80) {
      const greatballCount = Math.floor(Math.random() * 3) + 1; // 1-3
      lootList.push({ name: 'greatballs', qty: greatballCount });
      lootText += `• ${greatballCount}x Greatball\n`;
    }

    // RARE DROP (> 90 / Top 10% Chance)
    if (randomChance > 90) {
      const ultraballCount = Math.floor(Math.random() * 2) + 1; // 1-2
      lootList.push({ name: 'ultraball', qty: ultraballCount });
      lootText += `• ${ultraballCount}x Ultraball\n`;
    }

    // LEGENDARY / JACKPOT DROP (>= 96 / Top 4% Chance)
    if (randomChance >= 96) {
      const masterballCount = Math.floor(Math.random() * 2) + 1; // 1-2
      lootList.push({ name: 'masterball', qty: masterballCount });
      lootList.push({ name: 'trainingTicket', qty: masterballCount });
      lootText += `\n🌟 *JACKPOT LOOT!*\n• ${masterballCount}x Masterball\n• ${masterballCount}x Training Ticket\n`;
    }

    // 3. BULK MERGE UPDATE KE INVENTORY MSSQL IN 1 QUERY
    // Bikin query dinamis biar semua loot di-insert sekaligus
    const valuesQuery = lootList
      .map((item, idx) => `(@userId, @name${idx}, @qty${idx})`)
      .join(', ');

    const request = pool.request().input('userId', userID);
    lootList.forEach((item, idx) => {
      request.input(`name${idx}`, item.name);
      request.input(`qty${idx}`, item.qty);
    });

    await request.query(`
      MERGE datapengguna_inventory AS target
      USING (VALUES ${valuesQuery}) AS source (user_id, item_name, quantity)
      ON (target.user_id = source.user_id AND target.item_name = source.item_name)
      WHEN MATCHED THEN 
          UPDATE SET target.quantity = target.quantity + source.quantity
      WHEN NOT MATCHED THEN 
          INSERT (user_id, item_name, quantity) VALUES (source.user_id, source.item_name, source.quantity);
    `);

    return { text: lootText };

  } catch (error) {
    console.error('Error pokeball farming:', error);
    return { text: '❌ Error saat farming item!' };
  }
}