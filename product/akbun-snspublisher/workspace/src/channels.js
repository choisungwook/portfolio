/**
 * Channel rules as data. Adding a channel or changing a limit is a row here, not a code branch.
 * @typedef {{ id: string, name: string, maxLength: number, imageRequired: boolean, maxImages: number }} Channel
 */

/** @type {Channel[]} */
export const channels = [
  { id: 'x', name: 'X', maxLength: 280, imageRequired: false, maxImages: 4 },
  { id: 'linkedin', name: 'LinkedIn', maxLength: 3000, imageRequired: false, maxImages: 9 },
  { id: 'threads', name: 'Threads', maxLength: 500, imageRequired: false, maxImages: 20 },
  { id: 'instagram', name: 'Instagram', maxLength: 2200, imageRequired: true, maxImages: 10 },
];

/** @param {string} id */
export function channel(id) {
  const found = channels.find(item => item.id === id);
  if (!found) throw new Error(`unknown channel: ${id}`);
  return found;
}

/**
 * Remaining characters for a body on one channel. Negative means over the limit.
 * Counts code points so an emoji is one character, which is the loosest count any channel uses.
 * @param {string} body
 * @param {string} id
 */
export function remaining(body, id) {
  return channel(id).maxLength - [...body].length;
}
