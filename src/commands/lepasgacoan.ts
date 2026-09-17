import { poolPromise } from '../config/db.config';

export default async function lepasgacoanCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    await pool.request()
      .input('userId', userID)
      .query(`DELETE FROM datapengguna_gacoan WHERE user_id = @userId`);

    return { text: '🍃 Gacoan berhasil dilepas.' };
  } catch (error) {
    return { text: '❌ Gagal melepas gacoan!' };
  }
}