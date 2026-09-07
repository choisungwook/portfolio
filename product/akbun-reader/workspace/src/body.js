/** @param {string} source */
export function bodyBlocks(source) {
  const blocks = [];
  let code = null;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      if (code !== null) { blocks.push({ tag: 'pre', text: code.join('\n') }); code = null; }
      else code = [];
    } else if (code !== null) code.push(line);
    else if (/^#{1,6} /.test(line)) {
      const level = Math.min(6, line.indexOf(' ') + 1);
      blocks.push({ tag: `h${level}`, text: line.slice(line.indexOf(' ') + 1) });
    } else if (line.trim()) blocks.push({ tag: 'p', text: line });
  }
  if (code !== null) blocks.push({ tag: 'pre', text: code.join('\n') });
  return blocks;
}
