// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db = null; // Instância interna do banco de dados

// Função para inicializar o banco de dados: conecta e cria a tabela se necessário
function initDb(dbPath) {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Erro ao abrir o banco de dados:', err.message);
                return reject(err);
            }
            console.log('Conectado ao banco de dados SQLite.');

            // Cria a tabela se ela não existir
            db.run(`CREATE TABLE IF NOT EXISTS lojas (
                loja_id TEXT PRIMARY KEY,
                ultimo_ping INTEGER,
                status TEXT
            )`, (createErr) => {
                if (createErr) {
                    console.error('Erro ao criar tabela:', createErr.message);
                    return reject(createErr);
                }
                console.log('Tabela "lojas" verificada/criada.');
                resolve(); // Banco de dados inicializado com sucesso
            });
        });
    });
}

// Função para atualizar ou inserir um heartbeat para uma loja
function updateHeartbeat(lojaId, timestamp) {
    if (!db) {
        return Promise.reject(new Error("Banco de dados não inicializado. Chame initDb() primeiro."));
    }

    return new Promise((resolve, reject) => {
        // Usamos INSERT OR IGNORE seguido de UPDATE para simular um UPSERT
        db.run(`INSERT OR IGNORE INTO lojas (loja_id, ultimo_ping, status) VALUES (?, ?, ?)`,
            [lojaId, timestamp, 'online'],
            function(insertErr) {
                if (insertErr) {
                    console.error(`Erro ao inserir loja ${lojaId}:`, insertErr.message);
                    return reject(insertErr);
                }

                db.run(`UPDATE lojas SET ultimo_ping = ?, status = 'online' WHERE loja_id = ?`,
                    [timestamp, lojaId],
                    function(updateErr) {
                        if (updateErr) {
                            console.error(`Erro ao atualizar loja ${lojaId}:`, updateErr.message);
                            return reject(updateErr);
                        }
                        // console.log(`Updated/Inserted ${this.changes} row for ${lojaId}`);
                        resolve(); // Heartbeat processado com sucesso
                    }
                );
            }
        );
    });
}

// Função para obter o status de todas as lojas
function getAllStoresStatus() {
    if (!db) {
        return Promise.reject(new Error("Banco de dados não inicializado. Chame initDb() primeiro."));
    }

    return new Promise((resolve, reject) => {
        db.all("SELECT loja_id, ultimo_ping, status FROM lojas", [], (err, rows) => {
            if (err) {
                console.error('Erro ao consultar status:', err.message);
                return reject(err);
            }
            resolve(rows); // Retorna as linhas consultadas
        });
    });
}

// Função para obter lojas online que estão atrasadas no ping
function getOfflineStores(threshold) {
    if (!db) {
        return Promise.reject(new Error("Banco de dados não inicializado. Chame initDb() primeiro."));
    }

    return new Promise((resolve, reject) => {
        db.all(
            `SELECT loja_id, ultimo_ping FROM lojas WHERE status = 'online' AND (ultimo_ping IS NULL OR ultimo_ping < ?)`,
            [threshold],
            (err, rows) => {
                if (err) {
                    console.error('Erro ao verificar lojas offline:', err.message);
                    return reject(err);
                }
                resolve(rows);
            }
        );
    });
}

// Função para marcar uma loja específica como offline
function markStoreOffline(lojaId) {
    if (!db) {
        return Promise.reject(new Error("Banco de dados não inicializado. Chame initDb() primeiro."));
    }

    return new Promise((resolve, reject) => {
        db.run(`UPDATE lojas SET status = 'offline' WHERE loja_id = ?`,
            [lojaId],
            function(err) {
                if (err) {
                    console.error(`Erro ao marcar loja ${lojaId} como offline:`, err.message);
                    return reject(err);
                }
                // console.log(`Marked ${this.changes} row as offline for ${lojaId}`);
                resolve(); // Loja marcada offline com sucesso
            }
        );
    });
}

// Função para fechar a conexão com o banco de dados
function closeDb() {
    if (!db) {
         console.warn("Tentativa de fechar DB que não estava inicializado ou já fechado.");
         return Promise.resolve(); // Já fechado ou não aberto
    }

    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                console.error('Erro ao fechar o banco de dados:', err.message);
                // Para um desligamento limpo, pode-se logar o erro e ainda assim resolver.
                resolve();
            } else {
                console.log('Banco de dados fechado.');
                db = null; // Limpa a referência
                resolve(); // DB fechado com sucesso
            }
        });
    });
}

// Exporta as funções para serem usadas em outros módulos
module.exports = {
    initDb,
    updateHeartbeat,
    getAllStoresStatus,
    getOfflineStores,
    markStoreOffline,
    closeDb,
    // Opcional: exportar o caminho do DB se necessário fora deste módulo
    // DB_PATH: path.join(__dirname, 'heartbeats.db')
};