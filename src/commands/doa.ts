import axios from 'axios';

interface DoaItem {
  doa: string;
  ayat: string;
  latin: string;
  artinya: string;
}

export default async function doaCommand(sock: any, messageContent: string, sender: string) {
  try {
    const resp = await axios.get<DoaItem[]>('https://doa-doa-api-ahmadramadhan.fly.dev/api');
    const dataDoa = resp.data;

    if (!dataDoa || dataDoa.length === 0) {
      return { text: '❌ Gagal mengambil data doa, coba lagi nanti.' };
    }

    const randomIndex = Math.floor(Math.random() * dataDoa.length);
    const randomData = dataDoa[randomIndex];

    const balasan = `🤲 *${randomData.doa}* 🤲\n\n` +
                    `${randomData.ayat}\n\n` +
                    `_(${randomData.latin})_\n\n` +
                    `*Artinya:* ${randomData.artinya}`;

    return { text: balasan };

  } catch (error) {
    console.error('Error saat fetch doa:', error);
    return { text: '❌ Terjadi kesalahan saat mengambil doa.' };
  }
}