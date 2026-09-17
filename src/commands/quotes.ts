const { bucinQuotes, galauQuotes, kehidupanQuotes } = require('../../quotes.json');

export default async function quotesCommand(sock: any, message: string, sender: string, group?: string) {
    const queue = [bucinQuotes, galauQuotes, kehidupanQuotes];
    const randomQ = queue[Math.floor(Math.random() * queue.length)];
    const randomQuote = randomQ[Math.floor(Math.random() * randomQ.length)];

  return {
    text: `📜 *Quote of the Day:*\n\n"${randomQuote}"`,
  }
}
