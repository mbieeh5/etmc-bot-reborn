import { poolPromise } from '../config/db.config';

export default async function marketCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT item_name, price, stock, is_pvp FROM datadata_market ORDER BY price ASC`);

    let text = '🏪 *ETMC GLOBAL MARKET* 🏪\n';
    text += '_Restock otomatis tiap jam 00:00 WIB_\n\n';

    result.recordset.forEach((item: any) => {
      const stockText = item.stock === -1 ? '∞ UNLIMITED' : `${item.stock} pcs`;
      text += `• *${item.item_name}*\n` +
              `  └ Harga: ${item.price.toLocaleString('id-ID')} ${item.is_pvp ? "PVP" : "Point"} | Stok: ${stockText}\n`;
    });

    text += '\n_Cara beli: !buy <namaItem> <jumlah> (Contoh: !buy potion 5)_';

    return { text };

  } catch (error) {
    console.error('Error market:', error);
    return { text: '❌ Gagal membuka market!' };
  }
}