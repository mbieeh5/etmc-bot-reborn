import { poolPromise } from '../config/db.config';

const BUAH_LIST = ['🥝', '🍓', '🥭', '🍍', '🍊', '🍋', '🍉', '🥑', '🍌', '🍒'];

// Sesuaikan urutan parameter sama handleCommand.ts lu
export default async function slotCommand(sock: any, messageContent: string, sender: string, group?: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    const isAdmin = userID === process.env.ADMIN_1;

    const configRes = await pool.request().query(`SELECT name, value FROM datadata_configs WHERE name LIKE 'SLOT_%'`);
    const configs: any = configRes.recordset.reduce((acc: any, row: any) => {
      acc[row.name] = row.value;
      return acc;
    }, {});

    const COST_MAIN = configs['SLOT_COST'] || 2500;
    const WIN_RATE = configs['SLOT_WIN_RATE'] || 0.15;
    const BASE_REWARD = configs['SLOT_BASE_REWARD'] || 5000;

    const userRes = await pool.request()
      .input('id', userID)
      .query(`SELECT point FROM datapengguna_users WHERE id = @id`);

    if (userRes.recordset.length === 0) {
      // Langsung return pesannya, biar handleCommand.ts yang ngirim
      return { text: '❌ Daftar dulu ngab sebelum main!' };
    }

    const poin = userRes.recordset[0].point;

    if (poin < COST_MAIN) {
      return { text: `Pointnya ga cukup boss (Butuh ${COST_MAIN} Point). Mending jangan paksain ntar pinjol wkwk` };
    }

    const isWinningRoll = isAdmin || (Math.random() < WIN_RATE);
    let resultBoard: string[][] = [];

    if (isWinningRoll) {
      if (isAdmin) {
        const sym = '🍒';
        resultBoard = [
          [sym, sym, sym],
          [sym, sym, sym],
          [sym, sym, sym],
        ];
      } else {
        resultBoard = generateRandomBoard();
        const winRow = Math.floor(Math.random() * 3); 
        const winSym = BUAH_LIST[Math.floor(Math.random() * BUAH_LIST.length)];
        resultBoard[winRow] = [winSym, winSym, winSym]; 
      }
    } else {
      do {
        resultBoard = generateRandomBoard();
      } while (isWinningCombination(resultBoard));
    }

    let replyMessage = '🎰 *SLOT MESIN* 🎰\n\n';
    for (let i = 0; i < resultBoard.length; i++) {
      replyMessage += resultBoard[i].join(' ') + '\n';
    }

    if (isWinningRoll) {
      const multiplier = isAdmin ? 10 : (Math.floor(Math.random() * 5) + 1);
      const winAmount = BASE_REWARD * multiplier;
      
      await pool.request()
        .input('id', userID)
        .input('amount', winAmount - COST_MAIN)
        .query(`UPDATE datapengguna_users SET point = point + @amount WHERE id = @id`);

      replyMessage += `\n🎉 *JACKPOT!* Lu dapet *${winAmount} Point*! (x${multiplier})`;
    } else {
      await pool.request()
        .input('id', userID)
        .input('cost', COST_MAIN)
        .query(`UPDATE datapengguna_users SET point = point - @cost WHERE id = @id`);

      replyMessage += `\n💀 Yahaha kalah blog, -${COST_MAIN} Point. Coba lagi sampe miskin!`;
    }

    // Return pesan terakhirnya ke handleCommand.ts
    return { text: replyMessage };

  } catch (error) {
    console.error('Terjadi kesalahan slot:', error);
    return { text: '❌ Error saat memproses permainan slot.' };
  }
}

function generateRandomBoard(): string[][] {
  const board: string[][] = [];
  for (let i = 0; i < 3; i++) {
    const row = [];
    for (let j = 0; j < 3; j++) {
      const randomIndex = Math.floor(Math.random() * BUAH_LIST.length);
      row.push(BUAH_LIST[randomIndex]);
    }
    board.push(row);
  }
  return board;
}

function isWinningCombination(result: string[][]): boolean {
  for (let i = 0; i < 3; i++) {
    if (result[i][0] === result[i][1] && result[i][1] === result[i][2]) return true;
  }
  for (let j = 0; j < 3; j++) {
    if (result[0][j] === result[1][j] && result[1][j] === result[2][j]) return true;
  }
  if (result[0][0] === result[1][1] && result[1][1] === result[2][2]) return true;
  if (result[0][2] === result[1][1] && result[1][1] === result[2][0]) return true;

  return false;
}