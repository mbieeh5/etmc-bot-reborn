import { poolPromise } from '../config/db.config';

export default async function pokedexCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    // 1. Cek Status Buff Charm Aktif dari Cooldown
    const buffRes = await pool.request()
      .input('userId', userID)
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

    const buffs = buffRes.recordset[0] || { atkBuffPower: 0, defBuffPower: 0 };

    // 2. Ambil gacoan aktif
    const gacoanRes = await pool.request()
      .input('userId', userID)
      .query(`SELECT pokemon_db_id FROM datapengguna_gacoan WHERE user_id = @userId`);
    const gacoanId = gacoanRes.recordset[0]?.pokemon_db_id;

    // 3. Ambil semua pokemon milik user
    const pokeRes = await pool.request()
      .input('userId', userID)
      .query(`SELECT id, name, lvl, hp, max_hp, attack, defense, type FROM datapengguna_pokemon WHERE user_id = @userId ORDER BY id ASC`);

    if (pokeRes.recordset.length === 0) {
      return { text: '📱 *POKEDEX KOSONG!* Lu belum nangkep pokemon sama sekali. Ketik !catch' };
    }

    let text = '📖 *POKEDEX LU (Max 20)* 📖\n';

    // Banner Indikator Buff di bagian Atas Pokedex
    // 1. Cek apakah power di atas 1.0 (artinya lagi ada buff aktif)
    const hasAtkBuff = buffs.atkBuffPower > 1.0;
    const hasDefBuff = buffs.defBuffPower > 1.0;

    if (hasAtkBuff || hasDefBuff) {
      // Hitung persentase dinamis: (1.15 - 1) * 100 = 15, (1.20 - 1) * 100 = 20
      const atkPercent = Math.round((buffs.atkBuffPower - 1) * 100);
      const defPercent = Math.round((buffs.defBuffPower - 1) * 100);

      const atkText = hasAtkBuff ? `⚔️ ATK +${atkPercent}%` : '';
      const defText = hasDefBuff ? `🛡️ DEF +${defPercent}%` : '';

      // Gabungin label yang aktif aja pake separator '|' yang rapi
      const activeBuffs = [atkText, defText].filter(Boolean).join(' | ');

      text += `✨ *BUFF CHARM:* ${activeBuffs}\n\n`;
    }

    pokeRes.recordset.forEach((poke: any, idx: number) => {
      const indexNum = idx + 1;
      const isGacoan = poke.id === gacoanId ? '⭐ [GACOAN]' : '';

      // Hitung Stat Efektif saat Buff Aktif
      const finalAtk = buffs.hasAtkBuff ? Math.floor(poke.attack * buffs.atkBuffPower) : poke.attack;
      const finalDef = buffs.hasDefBuff ? Math.floor(poke.defense * buffs.defBuffPower) : poke.defense;

      // Format Tampilan (buff haram)
      const atkDisplay = buffs.hasAtkBuff ? `${finalAtk} 🔥` : `${poke.attack}`;
      const defDisplay = buffs.hasDefBuff ? `${finalDef} 🛡️` : `${poke.defense}`;

      text += `*${indexNum}. ${poke.name}* Lv.${poke.lvl} ${isGacoan}\n` +
              `   └ HP: ${poke.hp}/${poke.max_hp} | ATK: ${atkDisplay} | DEF: ${defDisplay}\n`;
    });

    text += `\n_Gunakan !setgacoan <index> buat milih pokemon bertarung!_`;

    return { text };

  } catch (error) {
    console.error('Error pokedex:', error);
    return { text: '❌ Gagal membuka pokedex!' };
  }
}