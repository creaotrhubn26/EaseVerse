import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoothRefresh } from '../lib/booth-refresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('manual retries share an in-flight request instead of racing older feedback', async () => {
  const response = deferred<string>();
  const snapshots: string[] = [];
  let calls = 0;
  const updates = createBoothRefresh({
    read: async () => { calls++; return response.promise; },
    onSnapshot: value => snapshots.push(value),
    onError: error => assert.fail(String(error)),
  });
  const first = updates.refresh();
  const second = updates.refresh();
  assert.equal(first, second);
  response.resolve('Hold den tonen.');
  await first;
  assert.equal(calls, 1);
  assert.deepEqual(snapshots, ['Hold den tonen.']);
  updates.dispose();
});

test('leaving a song aborts the request and discards late private data and errors', async () => {
  const response = deferred<string>();
  let signal!: AbortSignal;
  const updates = createBoothRefresh({
    read: async input => { signal = input; return response.promise; },
    onSnapshot: () => assert.fail('An old room must not appear'),
    onError: () => assert.fail('An old room must not change the current error'),
    onSettled: () => assert.fail('An old room must not change loading state'),
  });
  const pending = updates.refresh();
  await Promise.resolve();
  updates.dispose();
  assert.equal(signal.aborted, true);
  response.resolve('Old private song');
  await pending;
});

test('returning from background refreshes immediately; old responses cannot overwrite it', async () => {
  const old = deferred<string>();
  const snapshots: string[] = [];
  let calls = 0;
  const updates = createBoothRefresh({
    read: async () => ++calls === 1 ? old.promise : 'New producer feedback',
    onSnapshot: value => snapshots.push(value),
    onError: error => assert.fail(String(error)),
  });
  const first = updates.refresh();
  await Promise.resolve();
  updates.setActive(false);
  updates.setActive(true);
  await updates.refresh();
  old.resolve('Stale feedback');
  await first;
  assert.equal(calls, 2);
  assert.deepEqual(snapshots, ['New producer feedback']);
  updates.dispose();
});

test('temporary failures recover automatically without reloading the player', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const errors: unknown[] = [];
  const snapshots: string[] = [];
  const updates = createBoothRefresh({
    read: async () => { if (++calls === 1) throw new Error('offline'); return 'Updated lyrics'; },
    onError: error => errors.push(error),
    onSnapshot: value => snapshots.push(value),
  });
  await updates.refresh();
  assert.equal(errors.length, 1);
  context.mock.timers.tick(5000);
  await updates.refresh();
  assert.deepEqual(snapshots, ['Updated lyrics']);
  updates.dispose();
});

test('a hanging request times out and does not block the next update forever', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const hung = deferred<string>();
  const snapshots: string[] = [];
  const errors: unknown[] = [];
  let calls = 0;
  const updates = createBoothRefresh({
    read: async () => ++calls === 1 ? hung.promise : 'Recovered',
    onSnapshot: value => snapshots.push(value),
    onError: error => errors.push(error),
    timeoutMs: 100,
  });
  const first = updates.refresh();
  await Promise.resolve();
  context.mock.timers.tick(100);
  await first;
  assert.match(String(errors[0]), /timed out/);
  await updates.refresh();
  hung.resolve('Too late');
  await Promise.resolve();
  assert.deepEqual(snapshots, ['Recovered']);
  updates.dispose();
});

test('backgrounded and disposed rooms do not issue requests', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const updates = createBoothRefresh({
    initiallyActive: false,
    read: async () => { calls++; return null; },
    onSnapshot: () => {},
    onError: error => assert.fail(String(error)),
  });
  await updates.refresh();
  context.mock.timers.tick(20_000);
  assert.equal(calls, 0);
  updates.setActive(true);
  await updates.refresh();
  assert.equal(calls, 1);
  updates.dispose();
  updates.setActive(true);
  context.mock.timers.tick(20_000);
  await updates.refresh();
  assert.equal(calls, 1);
});
