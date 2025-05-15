export function logWithTimestamp(message) {
  const now = new Date();
  // Usa toLocaleString() para obter uma string de data e hora formatada localmente
  const timestamp = now.toLocaleString();

  console.log(`[${timestamp}] ${message}`);
}