// src/commands/bi.ts

import axios from "axios";

export default async function biCommand(sock: any, message: string, sender: string, group?: string) {
    try {
        
        const args = message.split(' ').slice(1).join(' ').trim();
        if(!args) {
            return "❌ Format salah! Contoh: !bi <pesan>";
        }
        const response = await axios.post('http://127.0.0.1:8732/bi', {
            message: args, 
            userId: sender.replace(/[@:.\[\]#\$]/g, '_')
        })

        const dataRes = response.data.reply;
        const cleanedResponse = dataRes.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        return { text : cleanedResponse || "Tidak ada balasan dari bi."}

    } catch (error) {
        console.error('❌ Error in biCommand:', error);
        return { text: "ups, error while processing your request."};
    }
}
