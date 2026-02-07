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
function cleanOutput(text) {
    // 1. Strip ANSI escape codes
    // eslint-disable-next-line no-control-regex
    let clean = text.replace(/\x1B\[\d+;?\d*m/g, "");
    // 2. Aggressively strip box-drawing and UI characters
    clean = clean.replace(/[│─╭╮╰╯─╼╽╾╿┌┐└┘├┤┬┴┼═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬]/g, "");
    // 3. Strip other weird UI symbols (dots, bullets, loaders)
    clean = clean.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏•✓✖⚠]/g, "");
    // 4. Remove empty lines or lines with only spaces
    clean = clean.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    return clean.trim();
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
    it('should aggressively clean box drawing characters and UI symbols', () => {
        const dirty = "╭─────────╮\n│ Results │\n╰─────────╯\n⠋ Loading...\n✓ Success!";
        const cleaned = cleanOutput(dirty);
        // Expecting "Results\nLoading...\nSuccess!"
        assert.strictEqual(cleaned, "Results\nLoading...\nSuccess!");
    });
});
