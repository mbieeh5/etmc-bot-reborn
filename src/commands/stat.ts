import { poolPromise } from '../config/db.config'
import { getLevel } from '../lib/getLevel'

export default async function statCommand(sock: any, message: string, sender: string, group?: string) {
  try {
    const userID = sender.replace(/[@:\.\[\]#\$]/g, '_');
    const pool = await poolPromise;
    const res = await pool.request()
      .input('id', userID)
      .query(`
        SELECT nama, 
        point, 
        reputasi,
        pvp_point,
        pvp_kills, 
        exp FROM datapengguna_users WHERE id = @id`);

    if (res.recordset.length === 0) {
      return { text: '❌ Kamu belum terdaftar, gunakan command apapun dulu!' }
    }

    const user = res.recordset[0];
    const nama = user.nama || 'Nama kamu masih kosong';
    const point = (user.point || 0).toLocaleString('id-ID');
    const reputasi = user.reputasi || 0;
    const pvPoint = (user.pvp_point || 0).toLocaleString('id-ID');
    const pvpKills = user.pvp_kills || 0;
    const exp = user.exp || 0;

    const { level, rank } = getLevel(exp);

    const getTier = (rep: number): string => {
      if (rep <= 0) return '💀BOCAH TOXIC💀';
      if (rep <= 10) return '_Bronze_';
      if (rep <= 20) return '_Silver_';
      if (rep <= 30) return '_Gold_';
      if (rep <= 50) return '_Platinum_';
      if (rep <= 75) return '💠Emerald💠';
      if (rep <= 100) return '💎Diamond💎';
      if (rep <= 150) return '👑Royalty👑';
      if (rep <= 200) return '♚CROWN♚';
      if (rep <= 300) return '👑Master👑';
      if (rep <= 400) return '⚡Grandmaster⚡';
      if (rep <= 500) return '⭐ACE⭐';
      if (rep === 666) return '👹S0N-0F-S4TAN👹';
      if (rep <= 750) return '🔥Inferno🔥';
      if (rep <= 1000) return '🔥CONQUEROR🔥';
      if (rep <= 1500) return '🌟Legendary🌟';
      if (rep <= 2000) return '⚜️Mythical⚜️';
      if (rep <= 3000) return '🌌Cosmic🌌';
      if (rep <= 4000) return '🚀Interstellar🚀';
      if (rep <= 5000) return '🛡️Immortal🛡️';
      if (rep <= 7500) return '🌟Celestial🌟';
      if (rep <= 10000) return '⚡Divine⚡';
      if (rep <= 20000) return '👑Titan👑';
      if (rep <= 50000) return '🚨Omniscient🚨';
      if (rep <= 100000) return '💥Supreme💥';
      if (rep <= 500000) return '🌟Infinite🌟';
      if (rep > 500000) return '👑GOD👑';
      return 'Anak💀Haram';
    };

    const tier = getTier(reputasi);

    return {
      text: `${nama}
- ID: _${userID.split("_")[0]}_
- Level: *${level}* (${rank})
- Keramahan: *${tier}*
- Point: *${point}*
- PVP Point: *${pvPoint}*
- Kills: *${pvpKills}*
- Reputasi: *${reputasi}*
- EXP: *${exp}*`
    }

  } catch (err) {
    console.error('❌ Error get stat:', err);
    return { text: 'Terjadi kesalahan saat mengambil data stat.' };
  }
}
