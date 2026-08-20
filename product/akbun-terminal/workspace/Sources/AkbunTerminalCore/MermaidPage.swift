import Foundation

/// The page a mermaid diagram is drawn in.
///
/// It is here rather than beside the web view for one reason: the diagram is
/// text out of a file someone else wrote, and the rule that keeps it from
/// becoming code is the escaping below. A rule like that has to be testable, and
/// a web view is not.
///
/// The source is never interpolated into the script. It goes into a hidden
/// element, escaped, and the script reads it back with `textContent`, so a
/// backtick, a quote or a closing tag in a document is data all the way through.
/// The policy in the page then forbids the diagram from reaching the network,
/// the file system or anything else this app did not put in front of it.
public enum MermaidPage {
  /// The whole page: the policy, the bundled mermaid, the source and the script
  /// that draws it. `script` is the contents of mermaid.min.js.
  public static func html(source: String, dark: Bool, script: String) -> String {
    let background = dark ? "#1e1e1e" : "#ffffff"
    let theme = dark ? "dark" : "default"
    return """
      <!doctype html>
      <html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">
      <style>
        html, body { margin: 0; padding: 0; background: \(background); }
        #diagram { display: inline-block; padding: 8px; }
        #source { display: none; }
      </style>
      </head><body>
      <pre id="source">\(escaped(source))</pre>
      <div id="diagram"></div>
      <script>\(script)</script>
      <script>
        (async function () {
          try {
            const text = document.getElementById('source').textContent;
            mermaid.initialize({ startOnLoad: false, theme: '\(theme)', securityLevel: 'strict' });
            const { svg } = await mermaid.render('akbun-diagram', text);
            const target = document.getElementById('diagram');
            target.innerHTML = svg;
            const box = target.getBoundingClientRect();
            window.akbunSize = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
          } catch (error) {
            window.akbunSize = { failed: true };
          }
        })();
      </script>
      </body></html>
      """
  }

  /// The characters that could end the element the source sits in. The diagram
  /// is data, and this is what keeps it that way.
  public static func escaped(_ text: String) -> String {
    text
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }
}
