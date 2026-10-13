import assert from 'node:assert/strict';
import {test} from 'node:test';
import {matchesSearch, normalizeSearchText, searchRank, sourcePdfLabel} from '../app/search.ts';

test('search accepts preferred, exact Latin, English and unchanged identifiers', () => {
  const values = ['Primer mišice', 'm. example anterior', 'right example anterior', 'FMA0001'];
  for (const query of ['misice', 'MIŠICE', 'm example', 'anterior example', 'right anterior', 'FMA0001']) {
    assert.equal(matchesSearch(query, values), true, query);
  }
  for (const query of ['posterior', 'FMA0002', 'left example']) assert.equal(matchesSearch(query, values), false, query);
});
test('blank and punctuation-only queries do not hide regional structures', () => {
  for (const query of ['', '  ', '.']) assert.equal(matchesSearch(query, ['a']), true);
  assert.equal(normalizeSearchText('  M. EXAMPLE—č  '), 'm example c');
});
test('exact and prefix names rank before related structures without modifying source names', () => {
  assert.equal(searchRank('Example', ['example']), 0);
  assert.equal(searchRank('example', ['example minor']), 1);
  assert.equal(searchRank('example', ['right example']), 2);
  const labels = ['M. Example']; matchesSearch('m example', labels);
  assert.deepEqual(labels, ['M. Example']);
});
test('source labels distinguish book/lecture and retain physical page numbers', () => {
  assert.equal(sourcePdfLabel('private/Reference Book.pdf', 337), 'Reference Book · fizična str. 337');
  assert.equal(sourcePdfLabel('private/Lecture.PDF', 54), 'Lecture · fizična str. 54');
});
