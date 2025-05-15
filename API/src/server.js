// Carrega variáveis de ambiente do arquivo .env
require("dotenv").config();

const express = require("express");
const path = require("path");

// Importa as funções do módulo db.js
const db = require("./db");
const { logWithTimestamp } = require("./utils");

// Importa o bot e a função de notificação do módulo bot.js
// Ele pode ser null se BOT_TOKEN não estiver configurado
const telegramBot = require("./bot");
const botInstance = telegramBot ? telegramBot.bot : null;
const sendTelegramNotification = telegramBot
  ? telegramBot.sendNotification
  : async (msg) => {
      logWithTimestamp("Bot não configurado. Notificação não enviada:", msg);
    };

// Express
const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = "heartbeats.db";

// Middleware para parsear JSON no corpo das requisições
app.use(express.json());

// Recebe um ping de uma loja e utiliza a função do db.js para atualizar/inserir
app.post("/heartbeat", async (req, res) => {
  const { loja_id } = req.body;

  if (!loja_id) {
    return res
      .status(400)
      .json({ error: "loja_id é obrigatório no corpo da requisição." });
  }

  const timestampAtual = Date.now();

  try {
    await db.updateHeartbeat(loja_id, timestampAtual);
    logWithTimestamp(`Heartbeat recebido e processado para loja: ${loja_id}`);
    res
      .status(200)
      .json({ message: `Heartbeat recebido para loja ${loja_id}` });
  } catch (error) {
    console.error(
      `Erro ao processar heartbeat para loja ${loja_id}:`,
      error.message
    );
    // Enviar alerta para o Telegram em caso de falha no DB
    await sendTelegramNotification(
      `🔴 ERRO! Falha ao processar heartbeat para loja ${loja_id}: ${error.message}`
    );
    res.status(500).json({ error: "Erro interno ao processar heartbeat." });
  }
});

// Retorna o status de todas as lojas utilizando a função do db.js
app.get("/status", async (req, res) => {
  try {
    const rows = await db.getAllStoresStatus();

    // Formatar a data do último ping antes de enviar
    const lojasComStatus = rows.map((row) => ({
      loja_id: row.loja_id,
      ultimo_ping: row.ultimo_ping
        ? new Date(row.ultimo_ping).toISOString()
        : null, // Formata como ISO string
      status: row.status,
    }));

    res.status(200).json(lojasComStatus);
  } catch (error) {
    console.error("Erro ao consultar status via HTTP:", error.message);
    await sendTelegramNotification(
      `🔴 ERRO! Falha ao obter status via HTTP: ${error.message}`
    );
    res.status(500).json({ error: "Erro interno ao consultar status." });
  }
});

// --- Verificador Periódico ---
const OFFLINE_THRESHOLD_MS = 2.5 * 60 * 1000; // 4 minutos em milissegundos
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minuto em milissegundos

async function verificarLojasOffline() {
  const limiteOffline = Date.now() - OFFLINE_THRESHOLD_MS;

  try {
    // Usa a função do db.js para encontrar lojas potencialmente offline
    const rows = await db.getOfflineStores(limiteOffline);

    if (rows.length > 0) {
      logWithTimestamp(
        `Detectadas ${rows.length} loja(s) que pararam de pingar:`
      );
      let notificationSummary = `🔴 ALERTA! ${rows.length} loja(s) pararam de enviar heartbeat:\n`; // Sumário para o final

      await Promise.all(
        rows.map(async (loja) => {
          const ultimoPingISO = loja.ultimo_ping
            ? new Date(loja.ultimo_ping).toISOString()
            : "N/A";
          logWithTimestamp(
            `- Loja ${loja.loja_id} (último ping: ${ultimoPingISO})`
          );
          notificationSummary += `- Loja ${loja.loja_id} (último ping: ${ultimoPingISO})\n`; // Adiciona ao sumário

          try {
            // Usa a função do db.js para marcar a loja como offline
            await db.markStoreOffline(loja.loja_id);
            logWithTimestamp(`Loja ${loja.loja_id} marcada como offline.`);

            // --- ADICIONADO AQUI: Notificação individual para a loja ---
            await sendTelegramNotification(
              `🔴 A Loja ${loja.loja_id} foi marcada como offline.`
            );
            // ---------------------------------------------------------
          } catch (error) {
            console.error(
              `Erro ao marcar loja ${loja.loja_id} como offline:`,
              error.message
            );
            await sendTelegramNotification(
              `🔴 ERRO! Falha ao marcar loja ${loja.loja_id} como offline: ${error.message}`
            );
          }
        })
      );

      // Enviar notificação sumária para o Telegram APÓS processar todas as lojas
      // await sendTelegramNotification(notificationSummary); // Comentado ou removido se a notificação individual for suficiente
      // Se quiser manter o sumário E as notificações individuais, descomente a linha acima.
      // Dependendo do volume de lojas offline, enviar uma por uma + sumário pode ser redundante/spam.
      // Decida qual abordagem prefere. Vou deixar o sumário comentado por padrão nesta modificação.
    } else {
      logWithTimestamp("Nenhuma loja offline detectada neste ciclo.");
    }
  } catch (error) {
    console.error("Erro geral no verificador de lojas offline:", error.message);
    await sendTelegramNotification(
      `🔴 ERRO! Falha geral no verificador offline: ${error.message}`
    );
  }
}

let checkerInterval = null; // Variável para guardar o ID do intervalo

// --- Inicializar DB e Iniciar Servidores ---
const dbPath = path.join(__dirname, DB_FILE);

// Inicializa o banco de dados ANTES de iniciar os servidores
db.initDb(dbPath)
  .then(() => {
    logWithTimestamp("Banco de dados inicializado. Iniciando servidores...");

    // Agendar a execução periódica do verificador SOMENTE APÓS o DB estar pronto
    checkerInterval = setInterval(verificarLojasOffline, CHECK_INTERVAL_MS);
    logWithTimestamp(
      `Verificador periódico agendado para rodar a cada ${
        CHECK_INTERVAL_MS / 1000
      } segundos.`
    );

    // Iniciar o servidor Express
    app.listen(PORT, () => {
      logWithTimestamp(`Servidor Express rodando na porta ${PORT}`);
      logWithTimestamp(
        `Acesse http://localhost:${PORT}/status para ver o status das lojas via HTTP.`
      );
    });

    // Iniciar o bot do Telegram se ele foi configurado
    if (botInstance) {
      botInstance
        .launch()
        .then(() => logWithTimestamp("Bot do Telegram iniciado."))
        .catch((err) =>
          console.error("Erro ao iniciar o bot do Telegram:", err)
        );
    } else {
      logWithTimestamp(
        "Bot do Telegram não iniciado devido à falta do BOT_TOKEN."
      );
    }
  })
  .catch(async (err) => {
    // Catch agora é async para poder enviar notificação
    console.error(
      "Falha ao inicializar o banco de dados. Encerrando o processo.",
      err
    );
    // Tentar notificar via Telegram antes de sair
    await sendTelegramNotification(
      `🔥 ERRO CRÍTICO! Falha ao inicializar o banco de dados. Encerrando: ${err.message}`
    );
    process.exit(1); // Sai do processo se o DB falhar ao inicializar
  });

// --- Lidar com encerramento do processo para fechar o DB e parar o bot ---
// Garante que a conexão com o DB seja fechada e o bot parado ao encerrar (ex: Ctrl+C)
process.on("SIGINT", async () => {
  logWithTimestamp("Recebido SIGINT. Encerrando...");
  if (checkerInterval) {
    clearInterval(checkerInterval); // Para o intervalo do verificador
    logWithTimestamp("Verificador periódico parado.");
  }

  if (botInstance) {
    try {
      await botInstance.stop("SIGINT"); // Para o bot gracefully
      logWithTimestamp("Bot do Telegram parado.");
    } catch (error) {
      console.error("Erro ao parar o bot do Telegram:", error);
    }
  }

  try {
    // Usa a função do db.js para fechar o banco de dados
    await db.closeDb();
    logWithTimestamp("Banco de dados fechado.");
    logWithTimestamp("Processo encerrado.");
    process.exit(0); // Encerra o processo com sucesso
  } catch (error) {
    console.error(
      "Erro durante o encerramento do banco de dados:",
      error.message
    );
    process.exit(1); // Encerra o processo com erro
  }
});

// Opcional: Lidar com exceções não capturadas para logar erros graves
process.on("uncaughtException", async (err) => {
  // Async para poder enviar notificação
  console.error("Exceção não capturada:", err);
  // Tentar notificar via Telegram antes de sair
  await sendTelegramNotification(
    `🔥 Exceção não capturada! Encerrando: ${err.message}`
  );
  process.exit(1); // Garante que o processo encerre
});

process.on("unhandledRejection", async (reason, promise) => {
  // Async para poder enviar notificação
  console.error(
    "Rejeição de Promise não tratada em:",
    promise,
    "razão:",
    reason
  );
  // Tentar notificar via Telegram antes de sair
  await sendTelegramNotification(
    `🤯 Rejeição de Promise não tratada! Encerrando: ${reason}`
  );
  process.exit(1); // Garante que o processo encerre
});
