import { proto } from '@whiskeysockets/baileys'
import { updateUserStats } from '../lib/updateUserStats'
import fs from 'fs'
import path from 'path'
import { preventSpam } from '../lib/antiSpam'
import { replyWithTyping } from '../lib/replyWithTyping'
import { checkToxic } from '../lib/checkToxic'
import { poolPromise } from '../config/db.config'

// Import File Handler Monolith buat Admin & Super Admin
import superAdminCommand from '../commands/adminCommands/superAdmin'
import groupAdminCommand from '../commands/adminCommands/groupAdmin'

const commands: { [key: string]: any } = {}

// Load regular commands (!)
fs.readdirSync(path.join(__dirname, '../commands')).forEach(file => {
  if (file.endsWith('.ts') && file !== 'superAdmin.ts' && file !== 'groupAdmin.ts') {
    const commandName = file.replace('.ts', '')
    try {
      commands[commandName] = require(`../commands/${file}`)
      console.log(`✅ Command !${commandName} loaded.`)
    } catch (err) {
      console.error(`❌ Failed to load command ${commandName}:`, err)
    }
  }
})

const groupNameCache = new Map<string, string>();

async function fetchGroupName(sock: any, groupJid: string): Promise<string> {
  if (groupNameCache.has(groupJid)) {
    return groupNameCache.get(groupJid)!;
  }
  try {
    const meta = await sock.groupMetadata(groupJid);
    const name = meta.subject || 'Anonim Group';
    groupNameCache.set(groupJid, name); // Simpen di RAM
    return name;
  } catch {
    return 'Anonim Group';
  }
}

export async function handleCommand(sock: any, msg: proto.IWebMessageInfo) {
  const messageContent =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption || ''

  if (!msg.key) return

  const senderID = msg.key.participant || msg.key.remoteJid
  const isGroup = !!msg.key.participant
  const groupID = isGroup ? msg.key.remoteJid : null
  console.log({groupID, senderID})
  const targetJid = isGroup ? groupID : senderID
  if (!targetJid) return

  const SanitizerID = (senderID)?.replace(/[@:\.\[\]#\$]/g, '_') || "kosong"
  const prefix = messageContent.charAt(0) // Ambil karakter pertama (!, %, atau &)

  try {
    if (!messageContent) return
    const pushName = msg.pushName || null;
    let groupName: string | null = null;

    if (isGroup && groupID) {
      groupName = await fetchGroupName(sock, groupID); // Narik nama grup
    }

    // Oper groupName ke updateUserStats
    await updateUserStats(SanitizerID, messageContent, pushName, groupID, groupName);
    preventSpam(SanitizerID, messageContent)

    // ==========================================
    // 🔥 1. ROUTER SUPER ADMIN (%)
    // ==========================================
    if (prefix === '%') {
      const pool = await poolPromise;
      // Cek apakah dia beneran Super Admin di DB
      const checkAdmin = await pool.request()
        .input('userId', SanitizerID)
        .query(`SELECT is_superadmin FROM datapengguna_users WHERE id = @userId`);
      
      const isSuperAdmin = checkAdmin.recordset[0]?.is_superadmin;

      if (!isSuperAdmin) {
        await replyWithTyping(msg, sock, { text: '🚫 Lu sapa kocak? Akses Super Admin ditolak! 🗿' }, targetJid);
        return;
      }

      // Kalo valid, lempar ke file superAdmin.ts
      console.log(`👑 [SUPER ADMIN] ${SanitizerID} executed: ${messageContent}`);
      const response = await superAdminCommand(sock, messageContent, SanitizerID);
      if (response) await replyWithTyping(msg, sock, response, targetJid);
      return; // Stop di sini, gak usah lanjut ke bawah
    }

    // ==========================================
    // 🔥 MIDDLEWARE: ANTI-TOXIC (Selain Super Admin)
    // ==========================================
    // Di handleCommand.ts
    const toxicResult = await checkToxic(SanitizerID, messageContent, groupID); // Note: Tambahin parameter groupID ke checkToxic buat voodoo punish
    if (toxicResult) {
      await replyWithTyping(msg, sock, { text: toxicResult.text }, targetJid)
      if (!toxicResult.isProtected) return // Kalo kena begal, command batal jalan!
    }

    // ==========================================
    // 🔥 2. ROUTER ADMIN GROUP (&)
    // ==========================================
    if (prefix === '&') {
      console.log(`🛡️ [GROUP ADMIN] ${SanitizerID} executed: ${messageContent}`);
      // Lempar ke file groupAdmin.ts (Validasi status admin grup ada di dalem filenya)
      const response = await groupAdminCommand(sock, messageContent, SanitizerID, groupID ? groupID : "");
      if (response) await replyWithTyping(msg, sock, response, targetJid);
      return;
    }

    // ==========================================
    // 🔥 3. ROUTER GLOBAL COMMANDS (!)
    // ==========================================
    if (prefix === '!') {
      const commandName = messageContent.substring(1).split(' ')[0].toLowerCase()
      const commandModule = commands[commandName]
      const command = commandModule?.default || commandModule?.[commandName]

      if (typeof command === 'function') {
        const chatType = isGroup ? 'GROUP' : 'PRIVATE'
        console.log(`💬 [${chatType}] ${targetJid} - ${SanitizerID}: ${messageContent}`)
        
        try {
          const response = isGroup 
            ? await command(sock, messageContent, SanitizerID, groupID)
            : await command(sock, messageContent, SanitizerID)
            
          if (response) {
            await replyWithTyping(msg, sock, response, targetJid)
          }
        } catch (err) {
          console.error(`❌ Error executing ${commandName}:`, err)
        }
      }
    }

  } catch (error) {
    console.error('❌ Error handling message:', error)
  }
}