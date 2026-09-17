// src/commands/ping.ts

export default async function pingCommand(sock: any, message: string, sender: string, group?: string) {
  return {
    text: '🏓 Pong dari ETMC Bot!',
  }
}
