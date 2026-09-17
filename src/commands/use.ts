import { poolPromise } from '../config/db.config';

export default async function useCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    const args = messageContent.trim().split(/\s+/);
    const rawItem = (args[1] || '').toLowerCase();

    // Normalisasi Alias Item
    let itemName = rawItem;

    if (!['potion', 'elixir'].includes(itemName)) {
      return { text: '❌ Item tidak bisa digunakan! Pilih: *potion* atau *elixir*' };
    }

    // USE POTION & ELIXIR
    const gacoanRes = await pool.request()
      .input('userId', userID)
      .query(`
        SELECT p.id, p.name, p.hp, p.max_hp 
        FROM datapengguna_gacoan g
        JOIN datapengguna_pokemon p ON g.pokemon_db_id = p.id
        WHERE g.user_id = @userId
      `);

    if (gacoanRes.recordset.length === 0) {
      return { text: '❌ Lu belum nge-set Gacoan! Ketik !setgacoan <index> dulu.' };
    }

    const poke = gacoanRes.recordset[0];

    if (poke.hp >= poke.max_hp) {
      return { text: `❤️ Darah *${poke.name}* udah full (${poke.hp}/${poke.max_hp})!` };
    }

    const invRes = await pool.request()
      .input('userId', userID)
      .input('item', itemName)
      .query(`
        UPDATE datapengguna_inventory 
        SET quantity = quantity - 1 
        OUTPUT DELETED.quantity
        WHERE user_id = @userId AND item_name = @item AND quantity > 0
      `);

    if (invRes.recordset.length === 0) {
      return { text: `❌ Lu gak punya item *${itemName}*!` };
    }

    let newHp = poke.hp;
    if (itemName === 'potion') {
      newHp = Math.min(poke.max_hp, poke.hp + 100);
    } else if (itemName === 'elixir') {
      newHp = poke.max_hp;
    }

    await pool.request()
      .input('pokeDbId', poke.id)
      .input('newHp', newHp)
      .query(`UPDATE datapengguna_pokemon SET hp = @newHp WHERE id = @pokeDbId`);

    return { text: `🧪 *${poke.name}* berhasil di-heal pake *${itemName}*!\nHP sekarang: *${newHp}/${poke.max_hp}* ❤️` };

  } catch (error) {
    console.error('Error use:', error);
    return { text: '❌ Gagal menggunakan item!' };
  }
}