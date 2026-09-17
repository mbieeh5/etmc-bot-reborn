import sql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    user: process.env.DB_USER || 'null',
    password: process.env.DB_PASSWORD || 'null',
    server: process.env.DB_SERVER || 'null',
    port: 1433,
    database: process.env.DB_NAME || 'null',
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
}

export const poolPromise = new sql.ConnectionPool(dbConfig)
.connect()
.then(pool => {
    console.log('✅ Connected to the database');
    return pool;
}).catch(err => {
    console.error('❌ Database connection failed:', err);
    throw err;
});

export default sql;