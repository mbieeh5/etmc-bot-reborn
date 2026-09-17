import { WASocket } from '@whiskeysockets/baileys'
import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import sql from 'mssql'
import { poolPromise } from './db.config'
import { sanitizePhoneNumber } from '../lib/sanitizePhoneNumber'
import { replyWithTyping } from '../lib/replyWithTyping'

export async function sendInvoice(sock: WASocket, req: Request, res: Response) {
    const { phone } = req.body
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })

    if (!phone) {
        return res.status(400).send({ error: "Phone Number Should be valid" })
    }
    
    // 1️⃣ SANITIZE PHONE
    // Asumsi function ini balikin angka murni dengan kode negara (e.g., 62812345678)
    const cleanedPhone = sanitizePhoneNumber(phone) 
    
    if (cleanedPhone === null) {
        return res.status(400).send({ error: "Invalid phone number" })
    }

    // 🔥 FIX DISINI: Bikin format JID (ID Database) di awal
    // Format: 628xxxxx@s.whatsapp.net
    const userJid = `${cleanedPhone}_s_whatsapp_net`
    const userJidFormatted = `${cleanedPhone}@s.whatsapp.net`
    
    console.log(`📲 OTP request for: ${phone} | DB ID: ${userJid}`)

    try {
        const pool = await poolPromise
        
        // 2️⃣ CEK USER KE DB (Pake userJid)
        /*const userCheck = await pool.request()
            .input('id', sql.VarChar, userJid) // Inputnya pake format JID
            .query('SELECT * FROM datapengguna_users WHERE id = @id')*/

        // Cek kalo user gak ketemu
        /*if (userCheck.recordset.length === 0) {
            return res.status(404).send({ error: "User not found. Please register first" })
        }

        const userData = userCheck.recordset[0]*/

        // 3️⃣ RATE LIMIT CHECK
        const currentTime = Date.now()
        
        // Pastikan konversi tipe datanya aman
        /*if (userData.otp_is_requested && userData.otp_expired && currentTime < Number(userData.otp_expired)) {
             return res.status(429).send({ 
                error: "OTP sudah dikirim, tunggu beberapa saat sebelum request lagi" 
            })
        }*/

        // 4️⃣ GENERATE OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const hash = await bcrypt.hash(code, 10)
        const expired = Date.now() + 3 * 60 * 1000 // 3 Menit

        // 5️⃣ SIMPAN OTP KE MSSQL (UPDATE via ID JID)
        /*await pool.request()
            .input('otp_hash', sql.VarChar, hash)
            .input('otp_expired', sql.BigInt, expired) 
            .input('id', sql.VarChar, userJid) // Pake userJid buat WHERE clause
            .query(`
                UPDATE datapengguna_users 
                SET otp_code = @otp_hash, 
                    otp_expired = @otp_expired, 
                    otp_is_requested = 1 
                WHERE id = @id
            `)*/

        // 6️⃣ KIRIM VIA WHATSAPP
        // Kita bisa pake userJid langsung karena formatnya emang buat WA
const messageContent =
`Halo Pelanggan GloryCell 👋

Pesan ini dikirim secara otomatis oleh sistem kami.
Terima kasih sudah mempercayakan service handphone Anda kepada GloryCell.

Kami ingin memastikan perkembangan perbaikan perangkat Anda berjalan dengan baik.
Jika Anda ingin bertanya atau membutuhkan bantuan langsung, silakan chat admin kami di:
• 08811429638 (CS Fazri)
• 08973997575 (CS Richard)
• 08999081100 (CS Vina)
• 0895404064343 (CS Yuniz)
• 081806620728 (CS Backup)

Jangan lupa simpan nomor ini untuk update dan informasi penting dari GloryCell.
Terima kasih 🙏`;



        await sock.sendMessage(userJidFormatted, { text: messageContent })

        return res.send({ success: true, message: 'Invoice terkirim ke WhatsApp!' })

    } catch (err) {
        console.error('❌ Error sending OTP:', err)
        return res.status(500).send({ success: false, message: 'Gagal kirim OTP' })
    }
}