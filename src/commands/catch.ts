import axios from 'axios';
import { poolPromise } from '../config/db.config';

const BALL_CONFIG: { [key: string]: { chance: number; bonusStat: number } } = {
  pokeballs: { chance: 0.35, bonusStat: 0 },
  greatballs: { chance: 0.60, bonusStat: 15 },
  ultraball: { chance: 0.85, bonusStat: 40 },
  masterball: { chance: 1.00, bonusStat: 100 },
};

export default async function catchCommand(sock: any, messageContent: string, sender: string) {
  try {
    const pool = await poolPromise;
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');

    const args = messageContent.trim().split(/\s+/);
    const ballType = (args[1] || 'pokeballs').toLowerCase();

    if (!BALL_CONFIG[ballType]) {
      return { text: '❌ Jenis ball salah! Pilih: pokeballs, greatballs, ultraball, masterball' };
    }

    // 1. Cek Jumlah Pokemon di Pokedex (Max 20)
    const countRes = await pool.request()
      .input('userId', userID)
      .query(`SELECT COUNT(*) as total FROM datapengguna_pokemon WHERE user_id = @userId`);
    
    if (countRes.recordset[0].total >= 20) {
      return { text: '🎒 Pokedex lu penuh (Max 20 Pokemon)! Jual dulu pakenya !sell <index>' };
    }

    // 2. Cek Stok Ball di Inventory
    const invRes = await pool.request()
      .input('userId', userID)
      .input('ball', ballType)
      .query(`SELECT quantity FROM datapengguna_inventory WHERE user_id = @userId AND item_name = @ball`);

    const ballQty = invRes.recordset[0]?.quantity || 0;
    if (ballQty <= 0) {
      return { text: `❌ Lu gak punya *${ballType}*! Beli di market atau cari lewat !pokeball` };
    }

    // 3. Potong 1 Ball dari Inventory
    await pool.request()
      .input('userId', userID)
      .input('ball', ballType)
      .query(`UPDATE datapengguna_inventory SET quantity = quantity - 1 WHERE user_id = @userId AND item_name = @ball`);

    // 4. Ambil Pokemon Random dari PokeAPI (ID 1 - 898)
    const randomPokeId = Math.floor(Math.random() * 898) + 1;
    const pokeRes = await axios.get(`https://pokeapi.co/api/v2/pokemon/${randomPokeId}`);
    const pokeData = pokeRes.data;

    const pokeName = pokeData.name.toUpperCase();
    const baseHp = pokeData.stats[0].base_stat;
    const baseAtk = pokeData.stats[1].base_stat;
    const baseDef = pokeData.stats[2].base_stat;

    // 5. Hitung Chance Tangkap (RNG)
    const ballInfo = BALL_CONFIG[ballType];
    const isCaught = Math.random() <= ballInfo.chance;

    if (!isCaught) {
      return { text: `💨 *${pokeName}* kabur dari ${ballType}! Sialan, coba lagi ngab.` };
    }

    // 6. Kalau Berhasil Ditangkap: Hitung Stat + Bonus Ball
    const finalHp = baseHp + ballInfo.bonusStat;
    const finalAtk = baseAtk + ballInfo.bonusStat;
    const finalDef = baseDef + ballInfo.bonusStat;
    const isLegend = randomPokeId > 790 ? 'Legendary' : 'Normal';

    await pool.request()
      .input('userId', userID)
      .input('pokeId', randomPokeId)
      .input('name', pokeName)
      .input('type', isLegend)
      .input('hp', finalHp)
      .input('maxHp', finalHp)
      .input('atk', finalAtk)
      .input('def', finalDef)
      .input('ball', ballType)
      .query(`
        INSERT INTO datapengguna_pokemon (user_id, poke_id, name, type, lvl, exp, hp, max_hp, attack, defense, caught_with)
        VALUES (@userId, @pokeId, @name, @type, 1, 0, @hp, @maxHp, @atk, @def, @ball)
      `);

    return { 
      text: `🎉 *BERHASIL NANGKEP ${pokeName}!* 🐾\n\n` +
            `• Type: ${isLegend}\n` +
            `• HP: ${finalHp}/${finalHp}\n` +
            `• ATK: ${finalAtk} | DEF: ${finalDef}\n` +
            `• Ball: ${ballType}\n\n` +
            `_Cek di !pokedex buat liat daftar pokemon lo!_` 
    };

  } catch (error) {
    console.error('Error catch:', error);
    return { text: '❌ Gagal nangkep pokemon, PokeAPI lagi gangguan / timeout!' };
  }
}