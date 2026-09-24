import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';

test('Express and Netlify accept free complaints and preserve service rating validation', async () => {
  const originalPool = mysql.createPool;
  const originalListen = express.application.listen;
  let server;
  let rows = [];
  let committed = false;
  let rolledBack = false;
  let released = false;
  let failInsert = false;
  mysql.createPool = () => ({
    getConnection: async () => ({
      beginTransaction: async () => {},
      execute: async (_sql, row) => {
        if (failInsert) throw new Error('Simulated database failure');
        rows.push(row);
        return [{ insertId: rows.length }];
      },
      commit: async () => { committed = true; },
      rollback: async () => { rolledBack = true; },
      release: () => { released = true; },
    }),
  });
  express.application.listen = function () {
    server = originalListen.call(this, 0, '127.0.0.1');
    return server;
  };
  try {
    const { default: handler } = await import('../netlify/functions/api.mjs');
    await import('../server.mjs');
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    const adapters = {
      Netlify: async feedbacks => (await handler({
        httpMethod: 'POST', path: '/.netlify/functions/api/feedbacks/batch',
        headers: {}, body: JSON.stringify({ feedbacks }),
      })).statusCode,
      Express: async feedbacks => (await fetch(`http://127.0.0.1:${server.address().port}/api/feedbacks/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbacks }),
      })).status,
    };
    for (const [name, send] of Object.entries(adapters)) {
      rows = []; committed = false; released = false;
      assert.equal(await send([{ service: null, rating: null, message: '  Une réclamation générale.  ' }]), 201, name);
      assert.deepEqual(rows, [['Une réclamation générale.', null, null, null]], name);
      assert.ok(committed && released, name);
      assert.equal(await send([{ message: 'ok' }]), 201, name);
      assert.equal(await send([{ message: 'a' }]), 201, name);
      assert.equal(await send([{ message: '' }]), 422, name);
      assert.equal(await send([{ message: ' '.repeat(20) }]), 422, name);
      assert.equal(await send([{ message: 'a'.repeat(5001) }]), 422, name);
      assert.equal(await send([{ service: 'Accueil', message: '', rating: null }]), 422, name);
      assert.equal(await send([{ service: 'Accueil', rating: 6 }]), 422, name);
      assert.equal(await send([null]), 422, name);
      assert.equal(await send([]), 422, name);
      rows = [];
      assert.equal(await send([{ service: 'Accueil', rating: 4, message: '' }]), 201, name);
      assert.deepEqual(rows, [['', 4, 'Accueil', null]], name);
      failInsert = true; rolledBack = false; released = false;
      assert.equal(await send([{ message: 'Une réclamation générale.' }]), 500, name);
      assert.ok(rolledBack && released, name);
      failInsert = false;
    }
  } finally {
    mysql.createPool = originalPool;
    express.application.listen = originalListen;
    if (server) await new Promise(resolve => server.close(resolve));
  }
});
