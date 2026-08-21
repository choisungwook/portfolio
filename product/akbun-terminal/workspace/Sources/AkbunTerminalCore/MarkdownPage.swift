import Foundation

/// A GitHub-like Markdown page made only from bundled application code.
///
/// The Markdown source is kept in a text-only element. markdown-it reads it
/// with `textContent`, raw HTML is disabled, and Mermaid runs with its strict
/// security level. A document can supply text, links and image addresses, but
/// never a script.
public enum MarkdownPage {
  public struct Style: Sendable {
    public let background: String
    public let panel: String
    public let text: String
    public let secondaryText: String
    public let accent: String
    public let fontSize: Double
    public let dark: Bool

    public init(
      background: String, panel: String, text: String, secondaryText: String,
      accent: String, fontSize: Double, dark: Bool
    ) {
      self.background = background
      self.panel = panel
      self.text = text
      self.secondaryText = secondaryText
      self.accent = accent
      self.fontSize = fontSize
      self.dark = dark
    }
  }

  public static func html(
    source: String, style: Style, highlightStyle: String, markdownScript: String,
    highlightScript: String, mermaidScript: String
  ) -> String {
    let mermaidTheme = style.dark ? "dark" : "default"
    return """
      <!doctype html>
      <html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src file: https: data:; font-src data:; connect-src 'none'; object-src 'none';">
      <style>\(embeddedStyle(highlightStyle))</style>
      <style>
        :root { color-scheme: \(style.dark ? "dark" : "light"); }
        html, body { margin: 0; min-height: 100%; background: \(style.background); color: \(style.text); }
        body { box-sizing: border-box; padding: 24px 30px 56px; font: \(style.fontSize)px/1.6 -apple-system, BlinkMacSystemFont, sans-serif; overflow-wrap: break-word; }
        #content { max-width: 980px; margin: 0 auto; }
        #source { display: none; }
        a { color: \(style.accent); text-decoration: none; }
        a:hover { text-decoration: underline; }
        h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 .55em; }
        h1, h2 { border-bottom: 1px solid \(style.panel); padding-bottom: .3em; }
        p, blockquote, ul, ol, table, pre { margin: 0 0 16px; }
        blockquote { border-left: 4px solid \(style.accent); color: \(style.secondaryText); padding: 0 1em; }
        code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        code { background: \(style.panel); border-radius: 5px; padding: .15em .35em; }
        pre { background: \(style.panel); border-radius: 7px; overflow: auto; padding: 16px; }
        pre code, pre code.hljs { background: transparent; padding: 0; }
        table { border-collapse: collapse; display: block; overflow: auto; width: max-content; max-width: 100%; }
        th, td { border: 1px solid \(style.panel); padding: 6px 13px; }
        tr:nth-child(2n) { background: \(style.panel); }
        img, svg { max-width: 100%; height: auto; }
        hr { border: 0; border-top: 1px solid \(style.panel); }
        mark[data-akbun-find] { background: #ffd54f; color: #111; }
        mark[data-akbun-current] { background: #ff9800; }
        .markdown-error { color: #ff5f57; white-space: pre-wrap; }
      </style>
      </head><body>
      <pre id="source">\(escaped(source))</pre>
      <main id="content"></main>
      <script>\(embedded(markdownScript))</script>
      <script>\(embedded(highlightScript))</script>
      <script>\(embedded(mermaidScript))</script>
      <script>
        (async function () {
          const content = document.getElementById('content');
          try {
            const md = window.markdownit({
              html: false,
              linkify: true,
              typographer: false,
              highlight: function (text, language) {
                if (language && window.hljs && hljs.getLanguage(language)) {
                  return hljs.highlight(text, { language: language, ignoreIllegals: true }).value;
                }
                if (window.hljs) return hljs.highlightAuto(text).value;
                return window.markdownit().utils.escapeHtml(text);
              }
            });
            const fence = md.renderer.rules.fence;
            md.renderer.rules.fence = function (tokens, index, options, env, renderer) {
              const language = tokens[index].info.trim().split(/\\s+/)[0].toLowerCase();
              if (language === 'mermaid') {
                return '<div class="mermaid">' + md.utils.escapeHtml(tokens[index].content) + '</div>';
              }
              return fence.call(renderer, tokens, index, options, env, renderer);
            };
            content.innerHTML = md.render(document.getElementById('source').textContent);
            if (window.mermaid) {
              mermaid.initialize({ startOnLoad: false, theme: '\(mermaidTheme)', securityLevel: 'strict' });
              await mermaid.run({ nodes: content.querySelectorAll('.mermaid'), suppressErrors: true });
            }
          } catch (error) {
            content.className = 'markdown-error';
            content.textContent = 'Preview failed: ' + error;
          }
          window.akbunReady = true;
        })();

        window.akbunFind = function (query, askedIndex) {
          const content = document.getElementById('content');
          content.querySelectorAll('mark[data-akbun-find]').forEach(function (mark) {
            mark.replaceWith(document.createTextNode(mark.textContent));
          });
          content.normalize();
          if (!query) return { index: -1, total: 0 };

          const wanted = query.toLocaleLowerCase();
          const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
          const nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          const marks = [];
          nodes.forEach(function (node) {
            const text = node.nodeValue;
            const lower = text.toLocaleLowerCase();
            const hits = [];
            let start = 0;
            while ((start = lower.indexOf(wanted, start)) !== -1) {
              hits.push(start);
              start += Math.max(1, wanted.length);
            }
            if (hits.length === 0) return;
            const fragment = document.createDocumentFragment();
            let cursor = 0;
            hits.forEach(function (hit) {
              fragment.append(document.createTextNode(text.slice(cursor, hit)));
              const mark = document.createElement('mark');
              mark.dataset.akbunFind = '';
              mark.textContent = text.slice(hit, hit + query.length);
              fragment.append(mark);
              cursor = hit + query.length;
            });
            fragment.append(document.createTextNode(text.slice(cursor)));
            node.replaceWith(fragment);
          });
          content.querySelectorAll('mark[data-akbun-find]').forEach(function (mark) { marks.push(mark); });
          if (marks.length === 0) return { index: -1, total: 0 };
          const index = ((askedIndex % marks.length) + marks.length) % marks.length;
          marks[index].dataset.akbunCurrent = '';
          marks[index].scrollIntoView({ block: 'center' });
          return { index: index, total: marks.length };
        };
      </script>
      </body></html>
      """
  }

  public static func escaped(_ text: String) -> String {
    text
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }

  private static func embedded(_ script: String) -> String {
    script.replacingOccurrences(of: "</script", with: "<\\/script", options: .caseInsensitive)
  }

  private static func embeddedStyle(_ style: String) -> String {
    style.replacingOccurrences(of: "</style", with: "<\\/style", options: .caseInsensitive)
  }
}
