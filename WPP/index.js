const wppconnect = require('@wppconnect-team/wppconnect');

// Função para listar e encontrar grupos
async function listAndFindGroups(client) {
  try {
    console.log('Attempting to list chats...');
    const chats = await client.listChats();
    console.log(`listChats() returned ${chats ? chats.length : 0} chats.`);

    if (chats && chats.length > 0) {
      // Filtrar por grupos usando o sufixo do ID (@g.us)
      const groups = chats.filter(chat =>
        chat.id && chat.id._serialized && chat.id._serialized.endsWith('@g.us')
      );

      if (groups.length > 0) {
        console.log(`Found ${groups.length} groups based on ID suffix.`);
        console.log('Lista de Grupos Encontrados:');
        groups.forEach(group => {
          console.log(`- Nome: ${group.name} | ID: ${group.id._serialized}`);
        });

        // Exemplo: Como selecionar um grupo para enviar mensagem
        console.log('\nPara enviar uma mensagem para um grupo específico, você precisará do ID serializado do grupo.');
        console.log('Por exemplo, para enviar para o primeiro grupo encontrado:');
        const firstGroup = groups[0];
        console.log(`client.sendText('${firstGroup.id._serialized}', 'Olá grupo! Esta é uma mensagem de teste para ${firstGroup.name}.');`);
        // Você pode descomentar a linha abaixo para testar o envio para o primeiro grupo
        // client.sendText(firstGroup.id._serialized, `Olá grupo! Esta é uma mensagem de teste única para ${firstGroup.name}.`);


      } else {
        console.log('No groups found based on ID suffix.');
      }
    } else {
      console.log('listChats() returned an empty or invalid list.');
    }

  } catch (error) {
    console.error('Error listing chats or finding groups:', error);
  }
}

wppconnect.create({
  session: 'my-whatsapp-session', // Mantenha seu nome de sessão
  catchQR: (base64QR, asciiQR, attempts, url) => {
    console.log('QR Code recebido. Escaneie com seu celular:');
    console.log(asciiQR);
  },
  statusFind: (status) => {
    console.log('Status da conexão:', status);
  }
})
.then(async (client) => {
  console.log('Cliente WhatsApp Web criado.');

  // Espera o cliente estar conectado
  console.log('Esperando o cliente estar pronto...');
  while (!await client.isConnected()) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Espera por 1 segundo
  }
  console.log('Cliente conectado e pronto.');

  // Define um timeout de 10 segundos (10000 ms) para executar a função uma vez
  const timeoutId = setTimeout(() => {
    listAndFindGroups(client);
  }, 10000);

  console.log('Execução da busca de grupos agendada para 10 segundos após a conexão.');

  // Em uma aplicação real, você pode querer limpar o timeout
  // se a aplicação for encerrada antes da execução.
  // clearTimeout(timeoutId);

})
.catch((error) => {
  console.error('Erro ao criar o cliente WhatsApp:', error);
});