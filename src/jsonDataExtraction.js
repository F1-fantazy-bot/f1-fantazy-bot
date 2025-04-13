const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } = process.env;
const { AzureOpenAI } = require('openai');

const apiVersion = "2024-04-01-preview";
const options = { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL, apiVersion };
const client = new AzureOpenAI(options);

exports.extractJsonDataFromPhotos = async function(photos) {
    const systemMessage = {
        "role": "system",
        "content": "You are a data extraction assistant. Follow this structured scenario in every conversation:\n\nStep 1:\nExtract data from photos containing a table of drivers and constructors.\n\nDetails for extraction:\n- From the drivers table:\n  - DR: Column #1 — driver initial name\n- From the constructors table:\n  - CN: Column #1 — constructor initial name\n- From both tables:\n  - $: Column #2 — current price (as a number)\n  - X$: Column #3 — expected price change (as a number)\n  - XPts: Column #4 — expected points (as a number)\n\nOutput:\n- One array of objects for drivers\n- One array of objects for constructors\n- Each object should use full property names: `price`, `expectedPriceChange`, and `expectedPoints`\n- There are 20 drivers and 10 constructors\n\nStep 2:\nFrom the next photo, extract:\n- Driver and constructor names\n- The driver with DRS boost (2x)\n- Number of free transfers\n- Remaining cost cap\n\nOutput:\n- An object containing:\n  - `drivers`: array of driver codes (initials)\n  - `constructors`: array of constructor codes (initials)\n  - `drsBoost`: driver code with the boost\n  - `freeTransfers`: number\n  - `costCapRemaining`: number\n\nUse the initials from Step 1.\nOnce this step is complete, automatically continue to Step 3.\n\nStep 3:\nCombine the extracted data into a JSON object matching this structure:\n\n```\n{\n  \"Drivers\": [], // array of Driver objects from Step 1\n  \"Constructors\": [], // array of Constructor objects from Step 1\n  \"CurrentTeam\": {} // object from Step 2\n}\n```\n\nTypes:\n\n```ts\ntype Driver = {\n  DR: string;\n  price: number;\n  expectedPriceChange: number;\n  expectedPoints: number;\n};\n\ntype Constructor = {\n  CN: string;\n  price: number;\n  expectedPriceChange: number;\n  expectedPoints: number;\n};\n\ntype CurrentTeam = {\n  drivers: string[];\n  constructors: string[];\n  drsBoost: string;\n  freeTransfers: number;\n  costCapRemaining: number;\n};\n\ntype Step3Json = {\n  Drivers: Driver[];\n  Constructors: Constructor[];\n  CurrentTeam: CurrentTeam;\n};\n```\n\nAlways return the final JSON inside a single code block."
    };

    // Build an image_url message for every photo
    const photoMessages = photos.map(photo => ({
        "type": "image_url",
        "image_url": {
            "url": photo.fileLink
        }
    }));

    const userMessage = {
        "role": "user",
        "content": [... photoMessages]
    }

    const completion = await client.chat.completions.create({
        model: AZURE_OPEN_AI_MODEL,
        messages: [systemMessage, userMessage]
    });
    
    return completion.choices[0].message.content;
}