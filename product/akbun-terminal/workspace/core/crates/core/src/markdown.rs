//! Markdown to a list of blocks the shell draws with native views.
//!
//! The shell gets a structure, never HTML, because a document that could carry
//! markup would need something that renders markup, and that is the web view
//! this product exists to avoid. Raw HTML in the source is dropped for the same
//! reason: a file someone else wrote must not become a way into the app.
//!
//! The block list is flat. Nesting is carried as a depth number on list items,
//! which is all the drawing side needs to indent.

use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Span {
    pub text: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub code: bool,
    #[serde(default)]
    pub link: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Block {
    Heading { level: u8, spans: Vec<Span> },
    Paragraph { spans: Vec<Span> },
    Quote { spans: Vec<Span> },
    Code { language: Option<String>, text: String },
    ListItem { depth: u8, marker: String, spans: Vec<Span> },
    Table { header: Vec<String>, rows: Vec<Vec<String>> },
    Rule,
}

pub fn render(source: &str) -> Vec<Block> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let mut builder = Builder::default();
    for event in Parser::new_ext(source, options) {
        builder.take(event);
    }
    builder.blocks
}

#[derive(Default)]
struct Builder {
    blocks: Vec<Block>,
    spans: Vec<Span>,
    bold: usize,
    italic: usize,
    link: Option<String>,
    heading: Option<u8>,
    quote: usize,
    code: Option<(Option<String>, String)>,
    lists: Vec<Option<u64>>,
    marker: Option<String>,
    table: Option<Table>,
}

#[derive(Default)]
struct Table {
    header: Vec<String>,
    rows: Vec<Vec<String>>,
    row: Vec<String>,
    in_header: bool,
}

impl Builder {
    fn take(&mut self, event: Event) {
        match event {
            Event::Start(tag) => self.start(tag),
            Event::End(tag) => self.end(tag),
            Event::Text(text) => self.text(&text),
            Event::Code(text) => self.push_span(&text, true),
            Event::SoftBreak => self.text(" "),
            Event::HardBreak => self.text("\n"),
            Event::Rule => {
                self.flush_item();
                self.blocks.push(Block::Rule);
            }
            Event::TaskListMarker(checked) => {
                self.marker = Some(if checked { "[x]" } else { "[ ]" }.to_string());
            }
            // Raw HTML, footnote plumbing and anything a later parser version
            // adds are dropped rather than shown as source noise.
            _ => {}
        }
    }

    fn start(&mut self, tag: Tag) {
        match tag {
            Tag::Heading { level, .. } => self.heading = Some(level as u8),
            Tag::BlockQuote(_) => self.quote += 1,
            Tag::CodeBlock(kind) => {
                let language = match kind {
                    CodeBlockKind::Fenced(name) if !name.is_empty() => Some(name.to_string()),
                    _ => None,
                };
                self.code = Some((language, String::new()));
            }
            Tag::List(start) => {
                self.flush_item();
                self.lists.push(start);
            }
            Tag::Item => self.marker = Some(self.next_marker()),
            Tag::Emphasis => self.italic += 1,
            Tag::Strong => self.bold += 1,
            Tag::Link { dest_url, .. } => self.link = Some(dest_url.to_string()),
            Tag::Table(_) => self.table = Some(Table::default()),
            Tag::TableHead => {
                if let Some(table) = &mut self.table {
                    table.in_header = true;
                }
            }
            _ => {}
        }
    }

    fn end(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Heading(_) => {
                let level = self.heading.take().unwrap_or(1);
                let spans = std::mem::take(&mut self.spans);
                self.blocks.push(Block::Heading { level, spans });
            }
            TagEnd::Paragraph => {
                if self.marker.is_some() || !self.lists.is_empty() {
                    self.flush_item();
                } else if !self.spans.is_empty() {
                    let spans = std::mem::take(&mut self.spans);
                    if self.quote > 0 {
                        self.blocks.push(Block::Quote { spans });
                    } else {
                        self.blocks.push(Block::Paragraph { spans });
                    }
                }
            }
            TagEnd::BlockQuote(_) => self.quote = self.quote.saturating_sub(1),
            TagEnd::CodeBlock => {
                if let Some((language, text)) = self.code.take() {
                    self.blocks.push(Block::Code {
                        language,
                        text: text.trim_end_matches('\n').to_string(),
                    });
                }
            }
            TagEnd::List(_) => {
                self.flush_item();
                self.lists.pop();
            }
            TagEnd::Item => self.flush_item(),
            TagEnd::Emphasis => self.italic = self.italic.saturating_sub(1),
            TagEnd::Strong => self.bold = self.bold.saturating_sub(1),
            TagEnd::Link => self.link = None,
            TagEnd::TableHead => {
                if let Some(table) = &mut self.table {
                    table.in_header = false;
                    table.header = std::mem::take(&mut table.row);
                }
            }
            TagEnd::TableRow => {
                if let Some(table) = &mut self.table {
                    let row = std::mem::take(&mut table.row);
                    table.rows.push(row);
                }
            }
            TagEnd::TableCell => {
                let text = self
                    .spans
                    .drain(..)
                    .map(|span| span.text)
                    .collect::<String>();
                if let Some(table) = &mut self.table {
                    table.row.push(text);
                }
            }
            TagEnd::Table => {
                if let Some(table) = self.table.take() {
                    self.blocks.push(Block::Table {
                        header: table.header,
                        rows: table.rows,
                    });
                }
            }
            _ => {}
        }
    }

    fn text(&mut self, text: &str) {
        if let Some((_, body)) = &mut self.code {
            body.push_str(text);
            return;
        }
        self.push_span(text, false);
    }

    fn push_span(&mut self, text: &str, code: bool) {
        self.spans.push(Span {
            text: text.to_string(),
            bold: self.bold > 0,
            italic: self.italic > 0,
            code,
            link: self.link.clone(),
        });
    }

    /// Closes whatever list line is open. Called at the end of an item and
    /// before a nested list, because a tight item has no paragraph to close it.
    fn flush_item(&mut self) {
        if self.spans.is_empty() && self.marker.is_none() {
            return;
        }
        let spans = std::mem::take(&mut self.spans);
        if spans.is_empty() {
            return;
        }
        self.blocks.push(Block::ListItem {
            depth: self.lists.len().saturating_sub(1) as u8,
            marker: self.marker.take().unwrap_or_default(),
            spans,
        });
    }

    fn next_marker(&mut self) -> String {
        match self.lists.last_mut() {
            Some(Some(number)) => {
                let marker = format!("{number}.");
                *number += 1;
                marker
            }
            _ => "•".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(spans: &[Span]) -> String {
        spans.iter().map(|span| span.text.as_str()).collect()
    }

    #[test]
    fn reads_the_elements_this_repository_actually_uses() {
        let blocks = render(
            "# Title\n\nSome **bold** text.\n\n- one\n- two\n\n1. first\n2. second\n\n```bash\nls -al\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
        );
        assert_eq!(
            blocks[0],
            Block::Heading {
                level: 1,
                spans: vec![Span { text: "Title".into(), ..Default::default() }]
            }
        );
        let Block::Paragraph { spans } = &blocks[1] else {
            panic!("expected a paragraph: {:?}", blocks[1])
        };
        assert_eq!(plain(spans), "Some bold text.");
        assert!(spans.iter().any(|span| span.bold && span.text == "bold"));

        let markers: Vec<&str> = blocks
            .iter()
            .filter_map(|block| match block {
                Block::ListItem { marker, .. } => Some(marker.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(markers, ["•", "•", "1.", "2."]);

        assert!(blocks.contains(&Block::Code {
            language: Some("bash".into()),
            text: "ls -al".into()
        }));
        assert!(blocks.contains(&Block::Table {
            header: vec!["a".into(), "b".into()],
            rows: vec![vec!["1".into(), "2".into()]]
        }));
    }

    #[test]
    fn keeps_checkboxes_and_nesting() {
        let blocks = render("- [ ] todo\n- [x] done\n  - nested\n");
        let items: Vec<(u8, &str, String)> = blocks
            .iter()
            .filter_map(|block| match block {
                Block::ListItem { depth, marker, spans } => {
                    Some((*depth, marker.as_str(), plain(spans)))
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            items,
            [
                (0, "[ ]", "todo".to_string()),
                (0, "[x]", "done".to_string()),
                (1, "•", "nested".to_string()),
            ]
        );
    }

    #[test]
    fn drops_raw_html_instead_of_drawing_it() {
        // A document is not allowed to become a way into the app, so the tag
        // must not survive as markup or as visible source.
        let blocks = render("<script>alert(1)</script>\n\nplain\n");
        assert_eq!(blocks.len(), 1);
        assert_eq!(
            blocks[0],
            Block::Paragraph {
                spans: vec![Span { text: "plain".into(), ..Default::default() }]
            }
        );
    }
}
