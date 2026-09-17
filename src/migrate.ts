import { poolPromise } from './config/db.config';
import * as fs from 'fs';

const rawData = fs.readFileSync('./etmc-backup.json', 'utf-8');
const firebaseData = JSON.parse(rawData);
const usersData = firebaseData?.dataPengguna?.pengguna || {};

// Fungsi konversi ID lama ke format Baileys
function convertFirebaseIDToBaileys(id: string): string {
  if (id.endsWith('_c_us')) return id.replace('_c_us', '_s_whatsapp_net');
  if (id.endsWith('_g_us')) return id.replace('_g_us', '_g_us');
  return id;
}

async function migrateUsers() {
  let successCount = 0;
  let failedCount = 0;
  const pool = await poolPromise
  for (const legacyID in usersData) {
    const user = usersData[legacyID];
    const userID = convertFirebaseIDToBaileys(legacyID);

    const nama = user?.nama || "Anonim";
    const point = user?.point || 0;
    const exp = user?.exp || 0;
    const reputasi = user?.reputasi || 0;

    try {
     await pool.request()
        .input('id', userID)
        .input('nama', nama)
        .input('point', point)
        .input('exp', exp)
        .input('reputasi', reputasi)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM datapengguna_users WHERE id = @id)
            INSERT INTO datapengguna_users (id, nama, point, exp, reputasi)
            VALUES (@id, @nama, @point, @exp, @reputasi);
        `);

      console.log(`✅ ${userID} migrated.`);
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to migrate ${userID}:`, err);
      failedCount++;
    }
  }

  console.log(`\n🎉 Migration complete: ${successCount} success, ${failedCount} failed.`);
}

migrateUsers();
