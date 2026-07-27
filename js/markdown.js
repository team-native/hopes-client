// Minimal, safe Markdown -> HTML renderer for AI answers.
// Escapes HTML first, then applies a small subset (code, bold, italic, lists,
// headings, links, paragraphs). Safe for streaming (re-render on each token).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}

export function renderMarkdown(src) {
  const text = esc(src || '');
  const lines = text.split('\n');
  let html = '';
  let i = 0;
  let inCode = false, codeBuf = [];
  let listType = null, listBuf = [];

  const flushList = () => {
    if (listType) { html += `<${listType}>${listBuf.join('')}</${listType}>`; listType = null; listBuf = []; }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line.trim())) {
      if (!inCode) { flushList(); inCode = true; codeBuf = []; }
      else { html += `<pre><code>${codeBuf.join('\n')}</code></pre>`; inCode = false; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }

    // headings
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushList(); html += `<h3>${inline(h[2])}</h3>`; i++; continue; }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listBuf.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      i++; continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listBuf.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      i++; continue;
    }

    // blank line -> paragraph break
    if (line.trim() === '') { flushList(); i++; continue; }

    // paragraph (merge consecutive non-special lines)
    flushList();
    const para = [line];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^```|^\s*[-*]\s+|^\s*\d+\.\s+|^#{1,3}\s+/.test(lines[i + 1])) {
      i++; para.push(lines[i]);
    }
    html += `<p>${para.map(inline).join('<br>')}</p>`;
    i++;
  }
  flushList();
  if (inCode) html += `<pre><code>${codeBuf.join('\n')}</code></pre>`;
  return html;
}
