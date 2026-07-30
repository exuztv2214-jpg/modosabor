const assert = require('assert');
const { isDaleCommand } = require('../../services/whatsappCopilotoService');

console.log('\nTests de whatsappCopilotoService.js');

assert.strictEqual(isDaleCommand('dale'), true);
assert.strictEqual(isDaleCommand('Dale'), true);
assert.strictEqual(isDaleCommand('#dale'), true);
assert.strictEqual(isDaleCommand('# dale'), true);
assert.strictEqual(isDaleCommand('dale por favor'), false);
assert.strictEqual(isDaleCommand(''), false);

console.log('  OK isDaleCommand acepta dale y #dale');
