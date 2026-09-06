/**
 * RTG.Util — pure helpers (§3.5.1).
 *   node kicker/test/util.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const U = RTG.Util;
/** deep-equal that ignores realm prototypes (engine objects live in a vm context). */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

test('erf accuracy |err| < 1e-7 against reference values (and better than 1e-9)', () => {
  const ref = [
    [0, 0], [0.1, 0.1124629160182849], [0.5, 0.5204998778130465], [1, 0.8427007929497149],
    [1.5, 0.9661051464753108], [2, 0.9953222650189527], [2.5, 0.9995930479825550], [2.99, 0.9999764743969505],
    [3, 0.9999779095030014], [3.5, 0.9999992569016276], [4, 0.9999999845827421], [6, 1]
  ];
  for (const [x, y] of ref) {
    assert.ok(Math.abs(U.erf(x) - y) < 1e-9, 'erf(' + x + ') = ' + U.erf(x) + ' vs ' + y);
    assert.ok(Math.abs(U.erf(-x) + y) < 1e-9, 'erf(-' + x + ')');
  }
  assert.equal(U.erf(Infinity), 1);
  assert.equal(U.erf(-Infinity), -1);
  assert.ok(Number.isNaN(U.erf(NaN)));
  // monotone and continuous across the series/continued-fraction seam at |x| = 3
  let prev = -1;
  for (let x = -5; x <= 5; x += 0.001) { const v = U.erf(x); assert.ok(v >= prev - 1e-15); prev = v; }
  assert.ok(Math.abs(U.erf(3 - 1e-9) - U.erf(3 + 1e-9)) < 1e-9);
});

test('phi (normal CDF) matches tables to 1e-7', () => {
  const ref = [[0, 0.5], [1, 0.8413447460685429], [-1, 0.15865525393145707], [1.96, 0.9750021048517795], [-2.5758293035489004, 0.005], [3, 0.9986501019683699]];
  for (const [z, p] of ref) assert.ok(Math.abs(U.phi(z) - p) < 1e-7, 'phi(' + z + ')');
  assert.ok(Math.abs(U.gaussCdfBetween(-1, 1, 0, 1) - 0.6826894921370859) < 1e-7);
  assert.ok(Math.abs(U.gaussCdfBetween(8, 12, 10, 2) - 0.6826894921370859) < 1e-7);
  assert.equal(U.gaussCdfBetween(0, 1, 0.5, 0), 1);
  assert.equal(U.gaussCdfBetween(0, 1, 2, 0), 0);
});

test('fnv1a vectors (hex8) and fnv1a32', () => {
  assert.equal(U.fnv1a(''), '811c9dc5');
  assert.equal(U.fnv1a('a'), 'e40c292c');
  assert.equal(U.fnv1a('foobar'), 'bf9cf968');
  assert.equal(U.fnv1a('hello'), '4f9f2cab');
  assert.equal(U.fnv1a32('foobar'), 0xbf9cf968);
  assert.equal(U.fnv1a('é').length, 8);
  assert.notEqual(U.fnv1a('é'), U.fnv1a('e'));
  assert.equal(U.fnv1a('😀').length, 8);
  assert.equal(U.fnv1a(123), U.fnv1a('123'));
  // always 8 chars even when the hash has leading zeros
  for (let i = 0; i < 20000; i++) assert.equal(U.fnv1a('k' + i).length, 8);
});

test('clamp / lerp / round1 / roundN / roundClamp', () => {
  assert.equal(U.clamp(5, 0, 3), 3);
  assert.equal(U.clamp(-1, 0, 3), 0);
  assert.equal(U.clamp(2, 0, 3), 2);
  assert.equal(U.lerp(0, 10, 0.25), 2.5);
  assert.equal(U.round1(1.25), 1.3);
  assert.equal(U.round1(2.04), 2);
  assert.equal(U.roundN(3.14159, 3), 3.142);
  assert.equal(U.roundClamp(99.6, 1, 99), 99);
});

test('sum / mean / count / keys / isPlainObject / isNum', () => {
  assert.equal(U.sum([1, 2, 3.5]), 6.5);
  assert.equal(U.sum([]), 0);
  assert.equal(U.mean([2, 4]), 3);
  assert.equal(U.mean([]), 0);
  assert.equal(U.count([1, 2, 3, 4], (x) => x % 2 === 0), 2);
  deq(U.keys({ a: 1, b: 2 }), ['a', 'b']);
  deq(U.keys(null), []);
  assert.equal(U.isPlainObject({}), true);
  assert.equal(U.isPlainObject([]), false);
  assert.equal(U.isPlainObject(null), false);
  assert.equal(U.isNum(3), true);
  assert.equal(U.isNum(NaN), false);
  assert.equal(U.isNum('3'), false);
});

test('indexBy by key and by function; deepClone breaks identity', () => {
  const arr = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }];
  const idx = U.indexBy(arr, 'id');
  assert.equal(idx.a.v, 3);
  assert.equal(idx.b.v, 2);
  assert.equal(U.indexBy(arr, (o) => o.id + o.v).a3.v, 3);
  const o = { x: { y: [1, 2] } };
  const c = U.deepClone(o);
  deq(c, o);
  assert.notEqual(c.x, o.x);
  assert.equal(U.deepClone(undefined), undefined);
});

test('template replaces {slot} and leaves unknown slots intact', () => {
  assert.equal(U.template('{name} hits from {dist}', { name: 'Sam', dist: 52 }), 'Sam hits from 52');
  assert.equal(U.template('{a}{a}', { a: 'x' }), 'xx');
  assert.equal(U.template('{missing} kept', {}), '{missing} kept');
  assert.equal(U.template('{n}', { n: 0 }), '0');
  assert.equal(U.template('{n}', { n: null }), '{n}');
  assert.equal(U.template('no slots', null), 'no slots');
});

test('formatting: fmtMoney / fmtPct / fmtClock / ordinal / pad', () => {
  assert.equal(U.fmtMoney(3.25), '$3.3M');
  assert.equal(U.fmtMoney(0.85), '$850k');
  assert.equal(U.fmtMoney(0), '$0');
  assert.equal(U.fmtMoney(-1.2), '-$1.2M');
  assert.equal(U.fmtPct(0.875), '87.5%');
  assert.equal(U.fmtPct(1), '100.0%');
  assert.equal(U.fmtPct(0.5, 0), '50%');
  assert.equal(U.fmtPct(NaN), '—');
  assert.equal(U.fmtClock(754), '12:34');
  assert.equal(U.fmtClock(65), '1:05');
  assert.equal(U.fmtClock(0), '0:00');
  assert.equal(U.fmtClock(-5), '0:00');
  assert.equal(U.ordinal(1), '1st');
  assert.equal(U.ordinal(2), '2nd');
  assert.equal(U.ordinal(3), '3rd');
  assert.equal(U.ordinal(4), '4th');
  assert.equal(U.ordinal(11), '11th');
  assert.equal(U.ordinal(12), '12th');
  assert.equal(U.ordinal(13), '13th');
  assert.equal(U.ordinal(21), '21st');
  assert.equal(U.ordinal(112), '112th');
  assert.equal(U.pad(7, 3), '007');
  assert.equal(U.pad('ab', 4, ' '), '  ab');
  assert.equal(U.pad(12345, 3), '12345');
});

test('assert throws with the message', () => {
  assert.throws(() => U.assert(false, 'boom'), /boom/);
  assert.doesNotThrow(() => U.assert(true, 'no'));
});

test('degToRad / radToDeg round trip', () => {
  assert.ok(Math.abs(U.degToRad(180) - Math.PI) < 1e-12);
  assert.ok(Math.abs(U.radToDeg(Math.PI / 2) - 90) < 1e-12);
});

test('stableSort keeps insertion order for equal keys and does not mutate', () => {
  const arr = [{ k: 2, n: 'a' }, { k: 1, n: 'b' }, { k: 2, n: 'c' }, { k: 1, n: 'd' }];
  const out = U.stableSort(arr, (x, y) => x.k - y.k);
  deq(out.map((o) => o.n), ['b', 'd', 'a', 'c']);
  deq(arr.map((o) => o.n), ['a', 'b', 'c', 'd']);
});

test('getPath / setPath', () => {
  const o = { a: { b: { c: 1 } } };
  assert.equal(U.getPath(o, 'a.b.c'), 1);
  assert.equal(U.getPath(o, 'a.x.c'), undefined);
  U.setPath(o, 'a.b.d', 2);
  U.setPath(o, 'n.m', 3);
  assert.equal(o.a.b.d, 2);
  assert.equal(o.n.m, 3);
});

test('deepEqual is structural, strict on primitives, prototype-agnostic; deepDiff names the first difference', () => {
  assert.equal(U.deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true);
  assert.equal(U.deepEqual({ a: 1 }, { a: '1' }), false);
  assert.equal(U.deepEqual([1, 2], [1, 2, 3]), false);
  assert.equal(U.deepEqual({ a: 1, b: 2 }, { a: 1 }), false);
  assert.equal(U.deepEqual(NaN, NaN), true);
  assert.equal(U.deepEqual(null, {}), false);
  const other = JSON.parse('{"x":{"y":[1,2]}}');
  const local = Object.create(null); local.x = { y: [1, 2] };
  assert.equal(U.deepEqual(local, other), true);
  assert.equal(U.deepDiff({ a: { b: 1 } }, { a: { b: 2 } }), '$.a.b');
  assert.equal(U.deepDiff({ a: 1 }, { a: 1 }), '');
});
