import { poolPromise } from '../config/db.config';

export default async function sellCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    const args = messageContent.trim().split(/\s+/);
    const indexTarget = parseInt(args[1], 10);

    if (isNaN(indexTarget) || indexTarget < 1) {
      return { text: '❌ Format salah! Contoh: !sell 2 (Jual pokemon index ke-2 di pokedex)' };
    }

    // 1. Ambil daftar pokemon user berurutan
    const pokeRes = await pool.request()
      .input('userId', userID)
      .query(`SELECT id, name, lvl, exp, max_hp, type FROM datapengguna_pokemon WHERE user_id = @userId ORDER BY id ASC`);

    const selectedPoke = pokeRes.recordset[indexTarget - 1];

    if (!selectedPoke) {
      return { text: `❌ Pokemon index ke-#${indexTarget} gak ada di pokedex lo!` };
    }

    // Cek biar gak bisa nge-jual Pokemon Gacoan yang lagi aktif!
    const gacoanRes = await pool.request()
      .input('userId', userID)
      .query(`SELECT pokemon_db_id FROM datapengguna_gacoan WHERE user_id = @userId`);
    
    if (gacoanRes.recordset[0]?.pokemon_db_id === selectedPoke.id) {
      return { text: `❌ *${selectedPoke.name}* lagi di-set jadi GACOAN! Lepas gacoan dulu pake !lepasgacoan sebelum dijual.` };
    }

    // 2. Kalkulasi Rumus Harga Jual
    const basePrice = 500;
    const levelMultiplier = 100;
    const typeBonus = selectedPoke.type === 'Legendary' ? 5000 : 300;
    const sellPrice = basePrice + (selectedPoke.lvl * levelMultiplier) + typeBonus + selectedPoke.max_hp + selectedPoke.exp;

    // 3. Transaction Hapus Pokemon & Tambah Poin
    await pool.request()
      .input('userId', userID)
      .input('pokeDbId', selectedPoke.id)
      .input('sellPrice', sellPrice)
      .query(`
        BEGIN TRANSACTION;
        DELETE FROM datapengguna_pokemon WHERE id = @pokeDbId;
        UPDATE datapengguna_users SET point = point + @sellPrice WHERE id = @userId;
        COMMIT TRANSACTION;
      `);

    return {
      text: `💰 *POKEMON TERJUAL!*\n` +
            `Berhasil menjual *${selectedPoke.name}* (Lv.${selectedPoke.lvl}) seharga *${sellPrice.toLocaleString('id-ID')} Poin*!`
    };

  } catch (error) {
    console.error('Error sell:', error);
    return { text: '❌ Gagal menjual pokemon!' };
  }
}