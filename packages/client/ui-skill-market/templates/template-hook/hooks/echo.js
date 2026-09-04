#!/usr/bin/env node
// Test hook shipped with the hook market template. Reads one hook event JSON
// payload from stdin and echoes a compact summary back on stdout so the full
// install -> bind -> chat-trigger chain is observable end to end.
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  let event = 'unknown'
  try {
    const parsed = JSON.parse(input)
    event = typeof parsed?.hook_event_name === 'string' ? parsed.hook_event_name : event
  } catch {
    // Non-JSON stdin is fine for a test hook; the summary still names the event source.
  }
  process.stdout.write(JSON.stringify({ hook: 'echo-hook', event, receivedBytes: Buffer.byteLength(input) }))
})
