import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrCode from "qrcode-terminal"
import { handleCommand } from "./config/handleCommand";
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { sendOtp } from "./config/sendOtp";
import { sendInvoice } from "./config/send-invoice";
dotenv.config();

async function startBot() {

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if(qr) {
        console.log(`🔐 Scan QR: ${qr}`)
        qrCode.generate(qr, {small: true})
    };

    if(connection === "close") {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('🔌 Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
        if(shouldReconnect) startBot();
    }
    
    if (connection === "open") {
        console.log("🤖 Bot connected and online!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    return handleCommand(sock, msg);
  });

  // ⛩️ API EXPRESS
  const app = express();
  app.use(cors({ 
    origin: /https:\/\/.*\.rrafproject\.com$/ 
}));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.post("/send-otp", async (req, res) => { sendOtp(sock, req, res)});
  app.post("/send-invoice", async (req, res) => { sendInvoice(sock, req, res)});

  const PORT = process.env.PORT || 8731;
  app.listen(PORT, () => {
    console.log(`🌐 Express API running at http://localhost:${PORT}`);
  });
}

startBot();
