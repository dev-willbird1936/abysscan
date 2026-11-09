import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedQuest, checkQuest, createQuestWriter, questKey, questMessages, sceneOf, writeQuest } from '../backend/detonation/quest-writer.mjs';
import { fishOfRun } from '../backend/detonation/fish-replays.mjs';
import { sceneSource } from '../backend/detonation/fish-scenes.mjs';

const fish = fishOfRun('fish-f-keylog-exe', []);
// A stub model: replies in order, recording what it was asked.
const stub = replies => ({ asked: [], available: () => true, async complete(messages) { this.asked.push(messages.map(m => m.content)); return replies.shift(); } });
// A scratch folder; only the one file a test can write is removed, then the empty folder.
const scratch = () => mkdtempSync(join(tmpdir(), 'quests-'));
const cleanUp = dir => { const file = join(dir, 'keylog-exe.scene'); if (existsSync(file)) unlinkSync(file); rmdirSync(dir); };

test('a quest is written per kind of upload, from the quest rules, the language, the reference quest and the facts', () => {
  assert.equal(questKey(fish), 'keylog-exe');
  assert.equal(questKey(fishOfRun('fish-s-twilight-exe', [])), null, 'school fish keep the generated illustration');
  const [system, user] = questMessages(fish);
  assert.match(system.content, /=== QUESTS\.md/);
  assert.match(system.content, /=== Reference quest: zeus\.scene ===[\s\S]*story/);
  assert.match(user.content, /type "\.exe" whose behaviour is "keylog"/);
  assert.match(user.content, /^os (windows|macos)$/m, 'the fallback scene is the facts');
});

test('a reply that fails the checks is sent back with its problems; a passing one is cached and served', async () => {
  const dir = scratch();
  try {
    const client = stub(['```\nos windows\nabout\n  | no steps\n```', `Here it is:\n${sceneSource('zeus')}`]);
    const result = await writeQuest(fish, { client, dir });
    assert.equal(result.ok, true, result.problems.join('; '));
    assert.equal(result.attempts, 2);
    assert.match(client.asked[1].at(-1), /fails these checks/, 'the repair names the problems');
    assert.ok(cachedQuest(fish, dir).includes('story'));
    assert.equal(checkQuest(sceneOf(readFileSync(join(dir, 'keylog-exe.scene'), 'utf8')), fish).length, 0);
    const again = await writeQuest(fish, { client: stub([]), dir });
    assert.equal(again.cached, true, 'a cached quest costs no call');
  } finally { cleanUp(dir); }
});

test('a model that never passes gives up after the attempts; nothing is cached; the writer is off by default', async () => {
  const dir = scratch();
  try {
    const result = await writeQuest(fish, { client: stub(['nope', 'nope', 'nope']), dir, attempts: 3 });
    assert.equal(result.ok, false);
    assert.equal(cachedQuest(fish, dir), null);
    assert.equal(createQuestWriter({ client: stub([]), env: {}, dir }).request(fish), null, 'QUEST_WRITER_ENABLED is required');
    const unavailable = await writeQuest(fish, { client: { available: () => false }, dir });
    assert.deepEqual(unavailable.problems, ['inference unavailable']);
  } finally { cleanUp(dir); }
});
