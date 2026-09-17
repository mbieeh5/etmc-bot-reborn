import { poolPromise } from '../config/db.config';

export default async function changeNameCommand(sock: any, message: string, sender: string, group?: string) {
  try {
    const userID = sender.replace(/[@:.\[\]#\$]/g, '_');
    const args = message.split(' ');
    const newName = args.slice(1).join(' ').trim();
    const pool = await poolPromise
    if (!newName) {
      return { text: '❌ Format salah! Contoh: !nama Rraf' };
    }

    const userRes = await pool.request()
      .input('id', userID)
      .query('SELECT nama, point FROM datapengguna_users WHERE id = @id');

    if (userRes.recordset.length === 0) {
      return { text: '❌ Kamu belum terdaftar. Gunakan command apapun dulu!' };
    }

    const user = userRes.recordset[0];
    const currentName = user.nama;
    const currentPoint = user.point;

    if (currentName && currentName !== 'noname') {
      if (currentPoint < 10000) {
        return { text: '❌ Gagal ganti nama. Point kamu tidak cukup (butuh 10.000).' };
      }

      await pool.request()
        .query(`
          UPDATE datapengguna_users
          SET nama = '${newName}', point = point - 10000
          WHERE id = '${userID}'
        `);

      return { text: `✅ Nama berhasil diganti ke *${newName}* (-10.000 Point)` };
    } else {
      await pool.request()
        .query(`
          UPDATE datapengguna_users
          SET nama = '${newName}'
          WHERE id = '${userID}'
        `);

      return { text: `✅ Nama pertamamu telah disetel ke *${newName}*` };
    }
  } catch (err) {
    console.error('❌ Error changing name:', err);
    return { text: 'Terjadi kesalahan saat mengganti nama.' };
  }
}
