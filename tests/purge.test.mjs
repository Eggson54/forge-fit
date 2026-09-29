import test from 'node:test';
import assert from 'node:assert/strict';
import { listAll, purgeFolder } from '../supabase/functions/_shared/purge.mjs';

/** A storage bucket that behaves like Supabase's: remove() takes file paths only. */
function bucket(paths) {
  const files = new Set(paths);
  const removed = [];
  return {
    files,
    removed,
    async list(dir, { limit, offset }) {
      const children = new Map();
      for (const f of files) {
        if (!f.startsWith(`${dir}/`)) continue;
        const rest = f.slice(dir.length + 1);
        const [head, ...tail] = rest.split('/');
        children.set(head, tail.length ? { name: head, id: null } : { name: head, id: `id-${f}` });
      }
      return { data: [...children.values()].slice(offset, offset + limit), error: null };
    },
    async remove(list) {
      // Exactly as Supabase: a folder path matches no file and removes nothing.
      for (const p of list) if (files.delete(p)) removed.push(p);
      return { data: [], error: null };
    },
  };
}

test('the old call removed nothing at all', async () => {
  // remove(['<uid>/']) — what delete-account did.
  const b = bucket(['u1/a.jpg', 'u1/b.jpg']);
  await b.remove(['u1/']);
  assert.equal(b.files.size, 2);
});

test('removes every file under the folder, however deep', async () => {
  const b = bucket(['u1/a.jpg', 'u1/2026/09/b.jpg', 'u1/2026/c.jpg', 'u2/keep.jpg']);
  assert.equal(await purgeFolder(b, 'u1'), 3);
  assert.deepEqual([...b.files], ['u2/keep.jpg']);
});

test('pages through a folder with more files than one listing returns', async () => {
  const many = Array.from({ length: 250 }, (_, i) => `u1/p${i}.jpg`);
  const b = bucket(many);
  assert.equal((await listAll(b, 'u1')).length, 250);
  assert.equal(await purgeFolder(b, 'u1'), 250);
  assert.equal(b.files.size, 0);
});

test('touches nobody else\'s folder, including one whose name starts the same', async () => {
  const b = bucket(['u1/a.jpg', 'u10/a.jpg']);
  await purgeFolder(b, 'u1');
  assert.deepEqual([...b.files], ['u10/a.jpg']);
});

test('refuses to report success when files are left behind', async () => {
  const b = bucket(['u1/a.jpg']);
  b.remove = async () => ({ data: [], error: null }); // pretends, deletes nothing
  await assert.rejects(purgeFolder(b, 'u1'), /still under u1/);
});

test('surfaces a storage error instead of swallowing it', async () => {
  const b = bucket(['u1/a.jpg']);
  b.remove = async () => ({ data: null, error: { message: 'denied' } });
  await assert.rejects(purgeFolder(b, 'u1'), /denied/);
});

test('an empty folder is a clean success', async () => {
  assert.equal(await purgeFolder(bucket([]), 'u1'), 0);
});
