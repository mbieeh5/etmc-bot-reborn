# 🤖 ETMC-BOT Reborn

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![MicrosoftSQLServer](https://img.shields.io/badge/Microsoft%20SQL%20Server-CC2927?style=for-the-badge&logo=microsoft%20sql%20server&logoColor=white)
![Baileys](https://img.shields.io/badge/Baileys-WA_Socket-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)

> *New born for ETMC-BOT using Baileys and SQL System.*

A fully-featured, stateless Pokémon-themed RPG WhatsApp Bot built with **TypeScript**, **Baileys (WhatsApp Socket)**, and **MS SQL Server**. Designed with a highly scalable architecture, it features dynamic RPG mechanics, anti-race condition transactions, and an automated global economy.

---

## 🔥 Key Features

* **⚔️ Advanced Combat Engine:** Includes PvE (with Dynamic Difficulty Adjustment / DDA), P2P Tagged PvP, and Random Matchmaking PvP.
* **🐉 World Boss Raid (3-Tier Channels):** Global raid events with `WITH (UPDLOCK)` transaction locking to prevent race conditions during Last-Hit (LH) attempts. Bosses can counterattack!
* **💰 Dual-Currency Economy:** Features standard `Point` for daily needs and `PvP Point` (Hardcore Currency) for Warlord-tier items.
* **🏰 Guild & Warlord Supremacy:** Group-based check-ins, Guild Kas (Treasury) raiding, and Top 1 Global Warlord passive buffs.
* **🧠 Stateless Cooldowns:** All cooldowns, buffs, and stamina are handled precisely by SQL Server timestamps. No stuck memory states upon server restarts.
* **🤖 Automated Maintenance:** Employs SQL Server Agent Jobs to automatically restock the market, reset daily top killers, and respawn World Bosses at midnight.
* **🛡️ Security & Anti-Spam:** In-memory rate limiting to prevent chat spamming and an automated SQL-backed penalty system for toxic behavior.

---

## 📂 Project Structure

The project follows a modular structure separating command routers from core engine logic:

```text
📦 src
 ┣ 📂 commands          # User interactions & command routers
 ┃ ┣ 📂 adminCommands   # Group admin specifics (&stat, &claim, &absen)
 ┃ ┣ 📜 absen.ts        # Daily check-in & Warlord Buff check
 ┃ ┣ 📜 buy.ts          # Market purchasing with atomic DB transaction
 ┃ ┣ 📜 fight.ts        # PvP / PvE Battle Router
 ┃ ┣ 📜 raid.ts         # World Boss Raid logic
 ┃ ┗ 📜 ...             # (catch, pokedex, market, setgacoan, etc.)
 ┣ 📂 lib               # Core Game Engines & Helpers
 ┃ ┣ 📜 antiSpam.ts     # In-memory Map rate limiter
 ┃ ┣ 📜 battleEngine.ts # Turn-based stat calculation
 ┃ ┣ 📜 ddaEngine.ts    # Dynamic Difficulty Adjustment
 ┃ ┣ 📜 pokemonLeveling.ts # EXP & Stat scaling math
 ┃ ┗ 📜 ...             
 ┣ 📂 config            # Database & connection setups
 ┗ 📜 index.ts          # Main Baileys connection socket


## 🚀 Getting Started

### Prerequisites

* **Node.js** (v18 or higher)
* **MS SQL Server** (Local or Cloud)
* WhatsApp account for the bot

### Installation

1. **Clone the repository:**
```bash
git clone [https://github.com/mbieeh5/etmc-bot-reborn.git](https://github.com/mbieeh5/etmc-bot-reborn.git)
cd etmc-bot-reborn

```


2. **Install dependencies:**
```bash
npm install

```


3. **Database Setup:**
* Create a new database in MS SQL Server (e.g., `db_etmc_bot`).
* Execute the provided DDL/Migration scripts in your SSMS to generate the tables (`datapengguna_users`, `datadata_market`, `datadata_raid_boss`, etc.).
* Configure SQL Server Agent Jobs for midnight resets.


4. **Environment Variables:**
Create a `.env` file in the root directory and configure your database connection:
```env
DB_USER=your_sql_user
DB_PASSWORD=your_sql_password
DB_SERVER=localhost
DB_NAME=db_etmc_bot

```


5. **Start the Bot:**
```bash
npm run start

```


*Scan the QR Code generated in the terminal using your WhatsApp linked devices.*

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with 🔥 and tons of SQL queries.*