export async function checkGroupAdmin(sock: any, groupJid: string, senderJid: string): Promise<boolean> {
  try {
    // Ambil metadata & list member grup langsung dari WhatsApp Server
    const groupMetadata = await sock.groupMetadata(groupJid);
    const participants = groupMetadata.participants || [];

    // Ambil angkanya aja biar aman lawan perbedaan format JID/LID/Number
    const senderNum = senderJid.replace(/[^0-9]/g, '');

    // Cari member yang ngirim pesan di list member grup
    const participant = participants.find((p: any) => {
      const pNum = p.id.replace(/[^0-9]/g, '');
      return pNum === senderNum;
    });

    // Balikin true kalau role-nya 'admin' atau 'superadmin'
    return !!(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
  } catch (err) {
    console.error('❌ Error checking group admin status:', err);
    return false;
  }
}