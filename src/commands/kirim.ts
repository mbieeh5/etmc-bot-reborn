import { poolPromise } from '../config/db.config';
import { generateSN } from '../lib/SnGenerate';

export default async function kirimCommand(sock: any, messageContent: string, sender: string, group?: string) {
  try {
    const pool = await poolPromise;
    const senderID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    const args = messageContent.trim().split(/\s+/);
    const targetRaw = args[1]; 
    const denomStr = args[2];  

    if (!targetRaw || !denomStr) {
      return { text: '❌ Format salah! Ketik: !kirim @tagOrang 10000' };
    }

    const denom = parseInt(denomStr, 10);
    if (isNaN(denom) || denom <= 0) {
      return { text: '❌ Nominal point harus angka dan nggak boleh nol/minus!' };
    }

    // Ekstrak angkanya doang (ngebuang @)
    const targetNumber = targetRaw.replace(/[^0-9]/g, '');
    if (!targetNumber) {
      return { text: '❌ Tag orangnya yang bener boss!' };
    }

    // Cek biar gak transfer ke diri sendiri
    if (senderID.startsWith(targetNumber + '_')) {
      return { text: '❌ Ngapain lu ngirim point ke diri sendiri kocak wkwk!' };
    }

    // Pattern buat nyari di DB (contoh: 40669078884606_%)
    const targetPattern = `${targetNumber}_%`;

    // --- SQL TRANSACTION ---
    const result = await pool.request()
      .input('senderId', senderID)
      .input('targetPattern', targetPattern)
      .input('denom', denom)
      .query(`
        BEGIN TRY
            BEGIN TRANSACTION;
            
            DECLARE @SenderPoint INT;
            DECLARE @ActualTargetId VARCHAR(50);

            -- 1. Cek Saldo Pengirim
            SELECT @SenderPoint = point FROM datapengguna_users WHERE id = @senderId;
            
            IF @SenderPoint IS NULL
            BEGIN
                SELECT 'SENDER_NOT_FOUND' AS status;
                ROLLBACK TRANSACTION;
                RETURN;
            END

            IF @SenderPoint < @denom
            BEGIN
                SELECT 'INSUFFICIENT_FUNDS' AS status, @SenderPoint AS sisa_saldo;
                ROLLBACK TRANSACTION;
                RETURN;
            END

            -- 2. Cari ID Asli Penerima (Mau dia _lid atau _s_whatsapp_net bakal ketangkep)
            SELECT TOP 1 @ActualTargetId = id FROM datapengguna_users WHERE id LIKE @targetPattern;

            IF @ActualTargetId IS NULL
            BEGIN
                SELECT 'RECEIVER_NOT_FOUND' AS status;
                ROLLBACK TRANSACTION;
                RETURN;
            END

            -- 3. Eksekusi Potong & Tambah Poin
            UPDATE datapengguna_users SET point = point - @denom WHERE id = @senderId;
            UPDATE datapengguna_users SET point = point + @denom WHERE id = @ActualTargetId;

            COMMIT TRANSACTION;
            SELECT 'SUCCESS' AS status;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            SELECT 'ERROR' AS status, ERROR_MESSAGE() AS errMsg;
        END CATCH
      `);

    const resStatus = result.recordset[0];

    if (resStatus?.status === 'INSUFFICIENT_FUNDS') {
      return { text: `❌ Point Mu Sisa ${resStatus.sisa_saldo}, Gagal Mengirim ${denom.toLocaleString('id-ID')} Point!` };
    }

    if (resStatus?.status === 'RECEIVER_NOT_FOUND') {
      return { text: '❌ Orang yang lu tag belum pernah daftar / belum masuk database bot ini!' };
    }

    if (resStatus?.status === 'SUCCESS') {
      return { text: `✅ Pengiriman ${denom.toLocaleString('id-ID')} Point Berhasil!\nSN: ${generateSN(16).toUpperCase()}` };
    }

    return { text: '❌ Gagal mengirim point (System Error).' };

  } catch (error) {
    console.error('Error saat mengirim point:', error);
    return { text: '❌ Error Saat Transfer Point, coba lagi nanti boss.' };
  }
}