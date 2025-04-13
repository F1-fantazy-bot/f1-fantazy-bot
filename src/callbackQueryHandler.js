const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const { photoCache } = require('./cache');

exports.handleCallbackQuery = async function (bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const [type, fileId] = query.data.split(':');
  
    // Save or process the selection (just logging here)
    console.log(`User ${query.from.username} labeled photo ${fileId} as ${type.toUpperCase()}`);
  
    // Optional: edit the message to confirm
    bot.editMessageText(`Photo labeled as ${type.toUpperCase()}. Wait for extracted JSON data...`, {
      chat_id: chatId,
      message_id: messageId
    });
  
    // Answer callback to remove "Loading..." spinner
    bot.answerCallbackQuery(query.id);

    const fileDetails = photoCache[fileId];
    try{ 
        const fileLink = await bot.getFileLink(fileDetails.fileId);

        const extractedData = await extractJsonDataFromPhotos(type, [fileLink]);

        // TODO - store in cache
    
        bot
            .sendMessage(chatId, extractedData, { parse_mode: 'Markdown' })
            .catch((err) => console.error('Error sending extracted data:', err)); 
    }
    catch(err){
        console.error('Error extracting data from photo:', err);
        bot
            .sendMessage(chatId, 'An error occurred while extracting data from the photo.')
            .catch((err) => console.error('Error sending extraction error message:', err));
    }

};