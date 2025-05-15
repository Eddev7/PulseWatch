// bot.js
const { Telegraf } = require("telegraf");
const { message } = require("telegraf/filters");

const db = require("./db"); // Assume que db.js está no mesmo diretório

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Chat ID para notificações

if (!BOT_TOKEN) {
  console.error(
    "Variável de ambiente BOT_TOKEN não definida. O bot do Telegram não será configurado."
  );
  module.exports = null;
} else {
  const bot = new Telegraf(BOT_TOKEN);
  console.log("Bot do Telegram configurado.");

  // Loga qualquer mensagem de texto recebida e verifica se é "status" E em grupo
  bot.on(message("text"), async (ctx) => {
    // Loga a informação da mensagem recebida
    console.log(
      `Mensagem do Telegram recebida de user ID: ${ctx.from.id}, chat ID: ${ctx.chat.id}, tipo: ${ctx.chat.type}, texto: ${ctx.message.text}`
    );

    // --- ADICIONADO AQUI: Verifica se é um chat de grupo ou supergrupo ---
    const isGroupChat =
      ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    // Verifica se a mensagem é "status" (sem o comando /) E se é em um chat de grupo/supergrupo
    if (isGroupChat && ctx.message.text.toLowerCase() === "status") {
      console.log(
        `Comando "status" recebido como texto em chat de grupo/supergrupo ID: ${ctx.chat.id}`
      );
      try {
        const rows = await db.getAllStoresStatus();

        if (rows.length === 0) {
          return ctx.reply("Nenhuma loja registrada ainda.");
        }

        let statusMessage = "Status das Lojas:\n";
        rows.forEach((row) => {
          let ultimoPing;
          if (row.ultimo_ping) {
            // Ajusta para o fuso horário de Brasília (UTC-3)
            const date = new Date(row.ultimo_ping);
            // Corrige para UTC-3 (Brasília)
            const brasiliaDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
            ultimoPing = brasiliaDate.toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            });
          } else {
            ultimoPing = "Nunca pingou";
          }
          const statusEmoji = row.status === "online" ? "✅" : "❌";
          statusMessage += `${statusEmoji} Loja ${row.loja_id}: ${row.status} (último ping: ${ultimoPing})\n`;
        });

        // Responde no mesmo chat onde a mensagem foi recebida
        ctx.reply(statusMessage);
      } catch (error) {
        console.error(
          `Erro ao consultar status via Telegram (texto "status" em grupo) no chat ${ctx.chat.id}:`,
          error.message
        );
        ctx.reply("Erro ao consultar o status das lojas.");

        // Enviar alerta de erro para o chat de notificação principal se for diferente
        if (TELEGRAM_CHAT_ID && String(ctx.chat.id) !== TELEGRAM_CHAT_ID) {
          await sendNotification(
            `🔴 ERRO! Falha ao obter status via Telegram (texto "status" em grupo) no chat ${ctx.chat.id}: ${error.message}`
          );
        }
      }
    } else if (!isGroupChat && ctx.message.text.toLowerCase() === "status") {
      // Opcional: Logar ou responder algo se "status" for enviado fora de um grupo
      console.log(
        `Comando "status" recebido como texto fora de um grupo (Chat ID: ${ctx.chat.id}, Tipo: ${ctx.chat.type}). Ignorando.`
      );
      // ctx.reply("Por favor, use o comando '/status' no chat privado ou envie 'status' em um grupo."); // Exemplo de resposta
    }
  });

  // Função para enviar mensagens de notificação (permanece a mesma)
  const sendNotification = async (messageText) => {
    if (TELEGRAM_CHAT_ID) {
      try {
        await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, messageText);
        console.log(
          `Notificação enviada para o Telegram Chat ID ${TELEGRAM_CHAT_ID}.`
        );
      } catch (error) {
        console.error(
          `Falha ao enviar mensagem para o Telegram Chat ID ${TELEGRAM_CHAT_ID}:`,
          error
        );
      }
    } else {
      console.warn(
        "TELEGRAM_CHAT_ID não configurado no .env. Notificação não enviada:",
        messageText
      );
    }
  };

  // Exporta o bot e a função de notificação
  module.exports = {
    bot,
    sendNotification,
    TELEGRAM_CHAT_ID,
  };
}
