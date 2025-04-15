const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const { PHOTO_TYPE_TO_SYSTEM_PROMPT_MAP } = require('./constants');

jest.mock('openai', () => {
    const createMock = jest.fn();
    return {
        AzureOpenAI: jest.fn().mockImplementation(() => ({
            chat: {
                completions: {
                    create: createMock,
                },
            },
        })),
        __createMock: createMock,
    };
});

const { __createMock } = require('openai');

describe('extractJsonDataFromPhotos', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should call AzureOpenAI with correct parameters and return extracted data', async () => {
        const type = 'exampleType';
        const fileLinks = ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'];
        const systemPrompt = 'Example system prompt';
        const mockResponse = {
            choices: [
                {
                    message: {
                        content: '{"key": "value"}',
                    },
                },
            ],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
        };

        PHOTO_TYPE_TO_SYSTEM_PROMPT_MAP[type] = systemPrompt;
        __createMock.mockResolvedValue(mockResponse);

        const result = await extractJsonDataFromPhotos(type, fileLinks);

        expect(__createMock).toHaveBeenCalledWith({
            model: process.env.AZURE_OPEN_AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: 'https://example.com/photo1.jpg' } },
                        { type: 'image_url', image_url: { url: 'https://example.com/photo2.jpg' } },
                    ],
                },
            ],
        });

        expect(result).toBe('{"key": "value"}');
    });

    it('should throw an error if AzureOpenAI fails', async () => {
        const type = 'exampleType';
        const fileLinks = ['https://example.com/photo1.jpg'];
        const systemPrompt = 'Example system prompt';

        PHOTO_TYPE_TO_SYSTEM_PROMPT_MAP[type] = systemPrompt;
        __createMock.mockRejectedValue(new Error('Azure API error'));

        await expect(extractJsonDataFromPhotos(type, fileLinks)).rejects.toThrow('Azure API error');
    });
});