'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { splitSentences, changeSpeech, fileSpeech, sentenceRange } = require('../src/lib/readAloud.js');

const dom = (html) => new JSDOM(`<div class="prose-diff"><div class="markdown-body">${html}</div></div>`).window.document;

test('splitSentences: one chunk per sentence, long ones cut near 200 characters', () => {
  assert.deepEqual(splitSentences('First one. Second? Third!'), ['First one.', 'Second?', 'Third!']);
  const long = Array(60).fill('word').join(' ');
  const chunks = splitSentences(long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 220));
  assert.equal(chunks.join(' '), long);
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('2.7 (login and sign-up) decides; roles are 2.7a. Next (e.g. this).'),
    ['2.7 (login and sign-up) decides; roles are 2.7a.', 'Next (e.g.', 'this).']);
});

test('changeSpeech: edited block reads the new text; removed words only with Show removed content', () => {
  const doc = dom('<p id="b">Kept <del>old words</del><ins>new words</ins> ending.</p>');
  const block = doc.getElementById('b');
  assert.deepEqual(changeSpeech(block, { includeRemoved: false }), ['Kept new words ending.']);
  assert.deepEqual(changeSpeech(block, { includeRemoved: true }), ['Kept new words ending.', 'Removed: old words.']);
});

test('changeSpeech: wholly removed blocks are announced with at most two words', () => {
  const doc = dom(
    '<del><p id="wrapped">Deleted paragraph here.</p></del>' +
    '<p id="inner"><del>Entirely deleted text.</del></p>' +
    '<ul><li id="cls" class="removed">Gone</li></ul>');
  assert.deepEqual(changeSpeech(doc.getElementById('wrapped')), ['Removed block starting with Deleted paragraph.']);
  assert.deepEqual(changeSpeech(doc.getElementById('inner')), ['Removed block starting with Entirely deleted.']);
  assert.deepEqual(changeSpeech(doc.getElementById('cls')), ['Removed block starting with Gone.']);
  assert.deepEqual(changeSpeech(dom('<p id="x"><del>Two.</del></p>').getElementById('x')), ['Removed block starting with Two.']);
});

test('changeSpeech: table rows, code blocks and our own UI', () => {
  const doc = dom(
    '<table><tr id="row"><td><ins>new cell</ins></td><td>kept</td></tr></table>' +
    '<pre id="code"><code><ins>a\nb\n</ins></code></pre>' +
    '<p id="ui"><ins>Text</ins><button class="grdc-comment-btn">+</button></p>');
  assert.deepEqual(changeSpeech(doc.getElementById('row')), ['new cell', 'kept']);
  assert.deepEqual(changeSpeech(doc.getElementById('code')), ['Code block, 2 lines.']);
  assert.deepEqual(changeSpeech(doc.getElementById('ui')), ['Text']);
  assert.deepEqual(changeSpeech(null), []);
});

test('changeSpeech: each table cell ends a sentence, even without a stop', () => {
  const doc = dom('<table><tbody id="t"><tr><td>we should consider a. then we move on</td><td>2.7 decides</td></tr>' +
    '<tr><td>next row</td><td></td></tr></tbody></table>');
  const block = doc.getElementById('t');
  const sentences = changeSpeech(block);
  assert.deepEqual(sentences, ['we should consider a.', 'then we move on', '2.7 decides', 'next row']);
  let from = 0;
  const found = sentences.map((s) => { const f = sentenceRange(block, s, from); from = f.end; return f.range.toString(); });
  assert.deepEqual(found, sentences);
});

test('fileSpeech: a new file is read block by block, a deleted one is announced', () => {
  const doc = dom('<h1>Title</h1><ul><li><p>Item one.</p></li></ul><p>End.</p>');
  const root = doc.querySelector('.prose-diff');
  assert.deepEqual(fileSpeech(root, 'ADDED', 'a.md'), ['New file a.md.', 'Title', 'Item one.', 'End.']);
  assert.deepEqual(fileSpeech(root, 'REMOVED', 'a.md'), ['Deleted file a.md.']);
});

test('sentenceRange: finds each spoken sentence in the visible text, skipping deleted words', () => {
  const doc = dom('<p id="b">First <del>gone</del><ins>one</ins>   here. Second <em>one</em>.<button class="grdc-comment-btn">+</button></p>');
  const block = doc.getElementById('b');
  const [s1, s2] = changeSpeech(block);
  const a = sentenceRange(block, s1, 0);
  // The range spans the sentence on screen, so deleted words inside it are covered too.
  assert.equal(a.range.toString(), 'First goneone   here.');
  const b = sentenceRange(block, s2, a.end);
  assert.equal(b.range.toString(), 'Second one.');
  assert.equal(sentenceRange(block, 'Removed: gone.', 0), null);
  assert.equal(sentenceRange(null, 'x', 0), null);
});
