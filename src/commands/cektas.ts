import { poolPromise } from '../config/db.config';

export default async function cektasCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    const result = await pool.request()
      .input('userId', userID)
      .query(`SELECT item_name, quantity FROM datapengguna_inventory WHERE user_id = @userId AND quantity > 0`);

    if (result.recordset.length === 0) {
      return { text: '🎒 *TAS KOSONG!* Lu belum punya item apa-apa. Ketik !pokeball buat nyari.' };
    }

    let text = '🎒 *INVENTORY TAS LU* 🎒\n\n';
    result.recordset.forEach((row: any) => {
      text += `• *${row.item_name}*: ${row.quantity}x\n`;
    });

    return { text };

  } catch (error) {
    console.error('Error cektas:', error);
    return { text: '❌ Gagal membuka tas!' };
  }
}