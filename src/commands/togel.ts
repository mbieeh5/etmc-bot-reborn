import { poolPromise } from '../config/db.config';

const COST = 5000;
const REWARD = 50000;

const repmaaf = [
  'sori boss belom tembus wkwk',
  'maaf ni belom tembus boss',
  'maaf ya, belum ada keberuntungan kali ini',
  'mohon maaf, belum berhasil kali ini',
  'maaf boss, belum mendapatkan hasil yang diinginkan',
  'terima kasih atas kesabaran boss, masih belum beruntung',
  'jangan putus asa boss, semoga keberuntungan menyertai',
  'maafkan kami boss, belum bisa memberikan yang diharapkan',
  'belum berhasil boss, tetap semangat dan coba lagi',
  'maaf ya boss, belum ada rezeki kali ini',
  'tolong maafkan kegagalan ini boss',
  'maaf atas ketidakberuntungan ini boss',
  'semoga keberuntungan datang di lain waktu boss',
  'mohon maaf atas hasil yang belum memuaskan boss',
  'sabar ya boss, masih ada kesempatan lainnya',
  'maaf boss, masih belum berjodoh dengan kemenangan',
  'tolong dimaklumi boss, masih dalam perjuangan mencari keberuntungan',
  'semangat boss, kita belum menyerah',
  'maaf atas ketidakberhasilan ini boss, tetap optimis',
];

export default async function togelCommand(sock: any, messageContent: string, sender: string, group?: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    
    // Ambil angka dari command (contoh: "!togel 1234" -> ambil "1234")
    const args = messageContent.trim().split(/\s+/);
    const masangTogel = args[1];

    // Validasi input harus pas 4 angka (RegEx)
    if (!masangTogel || !/^\d{4}$/.test(masangTogel)) {
      return { text: '❌ Ulang boss, pasangnya 4 angka (contoh: !togel 1234)' };
    }

    // 1. Cek Poin User di MSSQL
    const userRes = await pool.request()
      .input('id', userID)
      .query(`SELECT point FROM datapengguna_users WHERE id = @id`);

    if (userRes.recordset.length === 0) {
      return { text: '❌ Daftar dulu ngab sebelum main!' };
    }

    const poin = userRes.recordset[0].point;

    if (poin < COST) {
      return { text: 'Point masih dikit aja, gaya gayaan maen togel cuak' };
    }

    // 2. Generate 4 Angka Pure Random & Adu Nasib (Tanpa Cheat Admin)
    const hasil = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const isWin = (hasil === masangTogel);

    let resultMessage = `Berhasil Masang Angkanya: *${masangTogel}*\n\n`;
    resultMessage += `*Togel ETMC: ${hasil}*\n_Lu masang: ${masangTogel}_\n\n`;

    // 3. Update Saldo MSSQL & Bikin Pesan
    if (isWin) {
      // Menang: Point ditambah (Net profit = Reward - Modal pasang)
      const netProfit = REWARD - COST;
      await pool.request()
        .input('id', userID)
        .input('profit', netProfit)
        .query(`UPDATE datapengguna_users SET point = point + @profit WHERE id = @id`);
        
      resultMessage += `Mantap Boss, dapet JP ${REWARD.toLocaleString('id-ID')}.`;
    } else {
      // Kalah: Modal dipotong
      await pool.request()
        .input('id', userID)
        .input('cost', COST)
        .query(`UPDATE datapengguna_users SET point = point - @cost WHERE id = @id`);

      const randomQuote = repmaaf[Math.floor(Math.random() * repmaaf.length)];
      const capitalizedQuote = randomQuote.charAt(0).toUpperCase() + randomQuote.slice(1);
      
      resultMessage += capitalizedQuote;
    }

    // Return object message ke handleCommand.ts
    return { text: resultMessage };

  } catch (error) {
    console.error('Terjadi kesalahan togel:', error);
    return { text: '❌ Error Saat Masang Togel, coba lagi nanti.' };
  }
}