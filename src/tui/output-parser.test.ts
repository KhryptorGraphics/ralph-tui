/**
 * ABOUTME: Tests for TUI streaming output parser.
 * Verifies JSONL parsing, newline handling, and content extraction
 * for real-time agent output display.
 */

import { describe, expect, test } from 'bun:test';
import { StreamingOutputParser, parseAgentOutput } from './output-parser.js';

describe('StreamingOutputParser', () => {
  test('extracts plain text lines', () => {
    const parser = new StreamingOutputParser();
    parser.push('Hello world\n');
    expect(parser.getOutput()).toBe('Hello world\n');
  });

  test('buffers incomplete lines until newline', () => {
    const parser = new StreamingOutputParser();
    parser.push('Hello');
    expect(parser.getOutput()).toBe(''); // Buffered, no output yet
    parser.push(' world\n');
    expect(parser.getOutput()).toBe('Hello world\n');
  });

  test('strips trailing newlines from content before adding parser newline', () => {
    const parser = new StreamingOutputParser();
    // Simulate content that already has trailing newline (like from formatToolCall)
    parser.push('[Bash] $ ls\n\n'); // Content has double newline
    const output = parser.getOutput();
    // Should have single newline, not double
    expect(output).toBe('[Bash] $ ls\n');
  });

  test('handles multiple lines in single chunk', () => {
    const parser = new StreamingOutputParser();
    parser.push('line 1\nline 2\nline 3\n');
    expect(parser.getOutput()).toBe('line 1\nline 2\nline 3\n');
  });

  test('reset clears buffer and output', () => {
    const parser = new StreamingOutputParser();
    parser.push('some content\n');
    expect(parser.getOutput()).toBe('some content\n');
    parser.reset();
    expect(parser.getOutput()).toBe('');
  });

  test('parses JSONL assistant message with text', () => {
    const parser = new StreamingOutputParser();
    const jsonLine = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello from Claude' }] },
    });
    parser.push(jsonLine + '\n');
    expect(parser.getOutput()).toContain('Hello from Claude');
  });

  test('skips user/tool_result JSONL events', () => {
    const parser = new StreamingOutputParser();
    const userEvent = JSON.stringify({ type: 'user', content: 'should not appear' });
    parser.push(userEvent + '\n');
    expect(parser.getOutput()).toBe('');
  });

  test('skips system JSONL events', () => {
    const parser = new StreamingOutputParser();
    const systemEvent = JSON.stringify({ type: 'system', subtype: 'init' });
    parser.push(systemEvent + '\n');
    expect(parser.getOutput()).toBe('');
  });
});

describe('StreamingOutputParser with droid format', () => {
  test('parses droid tool_call events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'droid' });
    const toolCall = JSON.stringify({
      type: 'tool_call',
      toolName: 'Bash',
      parameters: { command: 'ls -la' },
    });
    parser.push(toolCall + '\n');
    const output = parser.getOutput();
    expect(output).toContain('[Bash]');
    expect(output).toContain('ls -la');
  });

  test('parses droid message events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'droid' });
    const message = JSON.stringify({
      type: 'message',
      role: 'assistant',
      text: 'Droid says hello',
    });
    parser.push(message + '\n');
    expect(parser.getOutput()).toContain('Droid says hello');
  });
});

describe('StreamingOutputParser with opencode format', () => {
  test('parses opencode text events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const textEvent = JSON.stringify({
      type: 'text',
      part: { text: 'OpenCode says hello' },
    });
    parser.push(textEvent + '\n');
    expect(parser.getOutput()).toContain('OpenCode says hello');
  });

  test('parses opencode tool_use events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const toolUse = JSON.stringify({
      type: 'tool_use',
      part: {
        tool: 'Bash',
        state: { input: { command: 'ls -la', timeout: 5000 } },
      },
    });
    parser.push(toolUse + '\n');
    const output = parser.getOutput();
    expect(output).toContain('[Tool: Bash]');
    expect(output).toContain('command=ls -la');
  });

  test('parses opencode tool_use with name field', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const toolUse = JSON.stringify({
      type: 'tool_use',
      part: { name: 'Read' },
    });
    parser.push(toolUse + '\n');
    expect(parser.getOutput()).toContain('[Tool: Read]');
  });

  test('shows opencode tool_result errors', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const toolResult = JSON.stringify({
      type: 'tool_result',
      part: {
        state: { isError: true, error: 'File not found' },
      },
    });
    parser.push(toolResult + '\n');
    expect(parser.getOutput()).toContain('[Tool Error]');
    expect(parser.getOutput()).toContain('File not found');
  });

  test('shows opencode tool_result errors with is_error field', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const toolResult = JSON.stringify({
      type: 'tool_result',
      part: {
        state: { is_error: true, content: 'Permission denied' },
      },
    });
    parser.push(toolResult + '\n');
    expect(parser.getOutput()).toContain('[Tool Error]');
    expect(parser.getOutput()).toContain('Permission denied');
  });

  test('hides successful opencode tool_result', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const toolResult = JSON.stringify({
      type: 'tool_result',
      part: {
        state: { isError: false, content: 'Success content' },
      },
    });
    parser.push(toolResult + '\n');
    // Successful results should not be displayed
    expect(parser.getOutput()).toBe('');
  });

  test('parses opencode error events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const errorEvent = JSON.stringify({
      type: 'error',
      error: { message: 'Something went wrong' },
    });
    parser.push(errorEvent + '\n');
    expect(parser.getOutput()).toContain('Error: Something went wrong');
  });

  test('hides opencode step_start events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const stepStart = JSON.stringify({ type: 'step_start' });
    parser.push(stepStart + '\n');
    expect(parser.getOutput()).toBe('');
  });

  test('hides opencode step_finish events', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const stepFinish = JSON.stringify({ type: 'step_finish' });
    parser.push(stepFinish + '\n');
    expect(parser.getOutput()).toBe('');
  });

  test('falls back to generic parsing for non-opencode JSON', () => {
    const parser = new StreamingOutputParser({ agentPlugin: 'opencode' });
    const genericJson = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Generic message' }] },
    });
    parser.push(genericJson + '\n');
    expect(parser.getOutput()).toContain('Generic message');
  });
});

describe('parseAgentOutput', () => {
  test('extracts result from Claude JSONL', () => {
    const rawOutput = JSON.stringify({
      type: 'result',
      result: 'Task completed successfully',
    });
    const result = parseAgentOutput(rawOutput);
    expect(result).toContain('Task completed successfully');
  });

  test('handles plain text output', () => {
    const rawOutput = 'Just some plain text output';
    const result = parseAgentOutput(rawOutput);
    expect(result).toBe('Just some plain text output');
  });

  test('returns empty string for empty input', () => {
    expect(parseAgentOutput('')).toBe('');
    expect(parseAgentOutput('   ')).toBe('');
  });

  test('strips ANSI codes from output', () => {
    const rawOutput = '\x1b[94mcolored text\x1b[0m';
    const result = parseAgentOutput(rawOutput);
    expect(result).toBe('colored text');
  });

  test('parses opencode JSONL output', () => {
    const lines = [
      JSON.stringify({ type: 'text', part: { text: 'Hello from OpenCode' } }),
      JSON.stringify({ type: 'tool_use', part: { tool: 'Bash', state: { input: { command: 'pwd' } } } }),
      JSON.stringify({ type: 'tool_result', part: { state: { isError: false } } }),
    ].join('\n');
    const result = parseAgentOutput(lines, 'opencode');
    expect(result).toContain('Hello from OpenCode');
    expect(result).toContain('[Tool: Bash]');
    // Successful tool results should not appear
    expect(result).not.toContain('Success');
  });

  test('parses opencode error in JSONL output', () => {
    const lines = [
      JSON.stringify({ type: 'text', part: { text: 'Starting' } }),
      JSON.stringify({ type: 'error', error: { message: 'API limit reached' } }),
    ].join('\n');
    const result = parseAgentOutput(lines, 'opencode');
    expect(result).toContain('Starting');
    expect(result).toContain('Error: API limit reached');
  });
});
