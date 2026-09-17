import { poolPromise } from '../config/db.config';

export default async function trainingCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    // 1. Cek Gacoan
    const gacoanRes = await pool.request()
      .input('userId', userID)
      .query(`
        SELECT p.id, p.name, p.attack, p.defense, p.max_hp 
        FROM datapengguna_gacoan g
        JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id
        WHERE g.user_id = @userId
      `);

    if (gacoanRes.recordset.length === 0) {
      return { text: '❌ Lu belum nge-set Gacoan! Ketik !setgacoan <index> dulu.' };
    }

    const poke = gacoanRes.recordset[0];

    // 2. Cek & Potong Training Ticket
    const invRes = await pool.request()
      .input('userId', userID)
      .query(`
        UPDATE datapengguna_inventory 
        SET quantity = quantity - 1 
        OUTPUT DELETED.quantity
        WHERE user_id = @userId AND item_name = 'trainingTicket' AND quantity > 0
      `);

    if (invRes.recordset.length === 0) {
      return { text: '❌ Lu gak punya *trainingTicket*! Beli di market jam 00:00 (Stok terbatas 10/hari).' };
    }

    // 3. RNG Stat Gain (20 - 70)
    const incAtk = Math.floor(Math.random() * (70 - 20 + 1)) + 20;
    const incDef = Math.floor(Math.random() * (70 - 20 + 1)) + 20;
    const incHp = Math.floor(Math.random() * (70 - 20 + 1)) + 20;

    // 4. Update Stat Pokemon di MSSQL
    await pool.request()
      .input('pokeDbId', poke.id)
      .input('incAtk', incAtk)
      .input('incDef', incDef)
      .input('incHp', incHp)
      .query(`
        UPDATE datapengguna_pokemon 
        SET attack = attack + @incAtk,
            defense = defense + @incDef,
            max_hp = max_hp + @incHp,
            hp = hp + @incHp -- Bonus max hp otomatis nambahin hp sekarang
        WHERE id = @pokeDbId
      `);

    return {
      text: `🏋️‍♂️ *TRAINING SELESAI!* 🏋️‍♂️\n` +
            `Gacoan lo *${poke.name}* makin tangguh!\n\n` +
            `• ATK: +${incAtk} (Total: ${poke.attack + incAtk})\n` +
            `• DEF: +${incDef} (Total: ${poke.defense + incDef})\n` +
            `• MAX HP: +${incHp} (Total: ${poke.max_hp + incHp})\n\n` +
            `🎫 _Sisa Training Ticket dipotong 1x._`
    };

  } catch (error) {
    console.error('Error training:', error);
    return { text: '❌ Gagal melakukan training!' };
  }
}