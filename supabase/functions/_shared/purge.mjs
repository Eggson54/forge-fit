/**
 * Removing everything under a storage folder — which `remove()` does not do.
 *
 * Supabase Storage's `remove(paths)` takes *file* paths: its own docs call
 * the argument "an array of files to delete". The delete-account function
 * called `remove(['<user id>/'])`, a folder, which matches no file and
 * deletes nothing — and `.catch(() => {})` hid it, although `remove` reports
 * failure in its return value rather than by throwing anyway. Every progress
 * photo survived the deletion of the account it belonged to.
 *
 * So: list the folder (recursively — `list` returns one level, folders
 * included, with a null id), remove the files in batches, and list again to
 * prove it is empty. The caller refuses to delete the account if it is not:
 * an account whose photos outlive it is worse than a deletion that failed
 * and can be retried.
 *
 * Plain JavaScript so the Deno function and the Node tests share it.
 */

const PAGE = 100;

/** Every file path under `prefix`, however deep. */
export async function listAll(bucket, prefix) {
  const files = [];
  const folders = [prefix];
  while (folders.length) {
    const dir = folders.pop();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(dir, { limit: PAGE, offset });
      if (error) throw new Error(`list ${dir}: ${error.message ?? error}`);
      const page = data ?? [];
      for (const entry of page) {
        const path = `${dir}/${entry.name}`;
        // Folders come back as entries with no id.
        if (entry.id == null) folders.push(path);
        else files.push(path);
      }
      if (page.length < PAGE) break;
    }
  }
  return files;
}

/** Delete everything under `prefix` and confirm nothing is left. */
export async function purgeFolder(bucket, prefix) {
  const files = await listAll(bucket, prefix);
  for (let i = 0; i < files.length; i += PAGE) {
    const { error } = await bucket.remove(files.slice(i, i + PAGE));
    if (error) throw new Error(`remove: ${error.message ?? error}`);
  }
  const left = await listAll(bucket, prefix);
  if (left.length) throw new Error(`${left.length} file(s) still under ${prefix}`);
  return files.length;
}
