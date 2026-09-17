import { poolPromise } from '../../config/db.config';

export default async function superAdminCommand(sock: any, messageContent: string, senderID: string) {
  try {
    const pool = await poolPromise;
    const args = messageContent.trim().split(/\s+/);
    const cmd = args[0].toLowerCase(); // %multi, %rpo, %rrr, %ap, %ar

    // ==========================================
    // 1. %multi [Toxic/Absen] [jumlah]
    // ==========================================
    if (cmd === '%multi') {
      const type = args[1]; // Toxic atau Absen
      const val = parseInt(args[2], 10);

      if (!type || isNaN(val)) return { text: '❌ Format salah! Contoh: %multi Toxic 3' };
      
      const multiName = type.toLowerCase() === 'toxic' ? 'ToxicX' : type.toLowerCase() === 'absen' ? 'AbsenX' : null;
      if (!multiName) return { text: '❌ Cuma bisa set: Toxic / Absen' };

      await pool.request()
        .input('name', multiName)
        .input('val', val)
        .query(`
          MERGE datadata_multipliers AS target
          USING (SELECT @name AS name) AS source
          ON (target.name = source.name)
          WHEN MATCHED THEN UPDATE SET value = @val, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT (name, value) VALUES (@name, @val);
        `);

      return { text: `✅⚙️ *SYSTEM OVERRIDE*\nMultiplier *${multiName}* sukses di-set ke *x${val}*!` };
    }

    // ==========================================
    // PARSER TARGET UNTUK COMMAND BAWAHNYA
    // ==========================================
    const targetRaw = args[1];
    if (!targetRaw) return { text: `❌ Format salah! Mana ID/Tag targetnya?` };
    
    // Ambil angkanya aja dari LID / Nomor
    const targetNumber = targetRaw.replace(/[^0-9]/g, '');
    const targetPattern = `${targetNumber}_%`;

    // ==========================================
    // 2. %rpo [lid] (Reset Point 0)
    // ==========================================
    if (cmd === '%rpo') {
      const res = await pool.request().input('pat', targetPattern).query(`UPDATE datapengguna_users SET point = 0 OUTPUT INSERTED.id WHERE id LIKE @pat`);
      if (res.recordset.length === 0) return { text: '❌ Target tidak ditemukan di DB.' };
      return { text: `✅ Poin milik ID *${targetNumber}* berhasil di-reset jadi 0!` };
    }

    // ==========================================
    // 3. %rrr [lid] (Reset Reputasi 0)
    // ==========================================
    if (cmd === '%rrr') {
      const res = await pool.request().input('pat', targetPattern).query(`UPDATE datapengguna_users SET reputasi = 0 OUTPUT INSERTED.id WHERE id LIKE @pat`);
      if (res.recordset.length === 0) return { text: '❌ Target tidak ditemukan di DB.' };
      return { text: `✅ Reputasi milik ID *${targetNumber}* berhasil di-reset jadi 0!` };
    }

    // ==========================================
    // 4. %ap [lid] [nominal] (Add Poin)
    // ==========================================
    if (cmd === '%ap') {
      const nominal = parseInt(args[2], 10);
      if (isNaN(nominal)) return { text: '❌ Nominal poin harus angka!' };

      const res = await pool.request().input('pat', targetPattern).input('nom', nominal).query(`UPDATE datapengguna_users SET point = point + @nom OUTPUT INSERTED.point WHERE id LIKE @pat`);
      if (res.recordset.length === 0) return { text: '❌ Target tidak ditemukan di DB.' };
      return { text: `✅ Sukses nyuntik *${nominal.toLocaleString('id-ID')} Poin* ke ID *${targetNumber}*!\nTotal poinnya skrg: ${res.recordset[0].point.toLocaleString('id-ID')}` };
    }

    // ==========================================
    // 5. %ar [lid] [nominal] (Add Reputasi)
    // ==========================================
    if (cmd === '%ar') {
      const nominal = parseInt(args[2], 10);
      if (isNaN(nominal)) return { text: '❌ Nominal reputasi harus angka!' };

      const res = await pool.request().input('pat', targetPattern).input('nom', nominal).query(`UPDATE datapengguna_users SET reputasi = ISNULL(reputasi,0) + @nom OUTPUT INSERTED.reputasi WHERE id LIKE @pat`);
      if (res.recordset.length === 0) return { text: '❌ Target tidak ditemukan di DB.' };
      return { text: `✅ Sukses nyuntik *${nominal} Reputasi* ke ID *${targetNumber}*!\nTotal reputasinya skrg: ${res.recordset[0].reputasi}` };
    }

    return null; // Kalau ngetik % yg ga kedaftar

  } catch (error) {
    console.error('Error SuperAdmin Command:', error);
    return { text: '❌ System Error (SuperAdmin).' };
  }
}