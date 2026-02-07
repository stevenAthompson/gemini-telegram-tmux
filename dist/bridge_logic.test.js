import { describe, it } from 'node:test';
import * as assert from 'node:assert';
// We want to test the response extraction logic without running the whole bridge
// Let's refactor the extraction logic into a function in bridge.ts first or just test the logic here.
function extractResponse(contentAfter, userMsg) {
    const msgIndex = contentAfter.lastIndexOf(userMsg);
    if (msgIndex === -1)
        return "";
    let rawResponse = contentAfter.substring(msgIndex + userMsg.length).trim();
    return rawResponse;
}
describe('Bridge Response Extraction', () => {
    it('should extract text after the user message', () => {
        const paneContent = "Previous text...\nUser: Hello Gemini\nGemini: I am here to help.\nPrompt> ";
        const userMsg = "Hello Gemini";
        const result = extractResponse(paneContent, userMsg);
        assert.strictEqual(result, "Gemini: I am here to help.\nPrompt>");
    });
    it('should handle missing message', () => {
        const paneContent = "Some random text";
        const userMsg = "Hello";
        const result = extractResponse(paneContent, userMsg);
        assert.strictEqual(result, "");
    });
});
