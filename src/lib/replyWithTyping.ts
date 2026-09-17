import { proto } from "@whiskeysockets/baileys";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const replyWithTyping = async (message: proto.IWebMessageInfo, sock: any, textResponse: any, targetJid: string | null | undefined) => {
    await delay(Math.floor(Math.random() - 1000) + 1000)
    await sock.readMessages([message.key]) ? sock.readMessages([message.key]) : null;
    await sock.sendPresenceUpdate('composing', targetJid);
    await delay(Math.floor(Math.random() * 3000) + 1000)
    const finalMsg = typeof textResponse === 'string' ? {text : textResponse} : textResponse;
    await sock.sendMessage(targetJid, finalMsg, {quoted: message});
    await sock.sendPresenceUpdate('paused', targetJid);
}

export { replyWithTyping };