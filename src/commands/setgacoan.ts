import { poolPromise } from '../config/db.config';

export default async function setgacoanCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    
    const args = messageContent.trim().split(/\s+/);
    const indexTarget = parseInt(args[1], 10);

    if (isNaN(indexTarget) || indexTarget < 1) {
      return { text: '❌ Masukin nomor index pokedex! Contoh: !setgacoan 1' };
    }

    // Ambil daftar pokemon user berurutan
    const pokeRes = await pool.request()
      .input('userId', userID)
      .query(`SELECT id, name FROM datapengguna_pokemon WHERE user_id = @userId ORDER BY id ASC`);

    const selectedPoke = pokeRes.recordset[indexTarget - 1]; // Array index 0-based

    if (!selectedPoke) {
      return { text: `❌ Pokemon dengan index #${indexTarget} gak ketemu di pokedex lo!` };
    }

    // Upsert ke Gacoan
    await pool.request()
      .input('userId', userID)
      .input('pokeDbId', selectedPoke.id)
      .query(`
        MERGE datapengguna_gacoan AS target
        USING (SELECT @userId AS user_id) AS source
        ON (target.user_id = source.user_id)
        WHEN MATCHED THEN UPDATE SET pokemon_db_id = @pokeDbId
        WHEN NOT MATCHED THEN INSERT (user_id, pokemon_db_id) VALUES (@userId, @pokeDbId);
      `);

    return { text: `🔥 *${selectedPoke.name}* berhasil di-set sebagai Gacoan utama lo!` };

  } catch (error) {
    console.error('Error setgacoan:', error);
    return { text: '❌ Gagal set gacoan!' };
  }
}