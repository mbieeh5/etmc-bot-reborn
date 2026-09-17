// src/commands/help.ts

export default async function helpCommand(sock: any, message: string, sender: string, group?: string) {
  return {
    text: 'ETMC Bot under development. For more information, please visit our Website: https://etmcbot.rrafproject.com',
  }
}
