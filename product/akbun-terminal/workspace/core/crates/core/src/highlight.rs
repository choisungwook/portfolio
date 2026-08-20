//! Source text to coloured tokens, one language table and one lexer.
//!
//! The file pane opens every file, not only markdown, and a file opened without
//! colour is a wall of one shade that nobody reads. Deciding the colours here
//! rather than in the view is the same bet the rest of the core makes: the shell
//! is expected to be replaced, and a highlighter living in it would be replaced
//! with it.
//!
//! It is a lexer with a table per language rather than a grammar per language.
//! A full grammar set means a syntax definition format, a regex engine and a few
//! megabytes of compiled definitions in the bundle, and what a reader needs from
//! a file they are looking at is comments, text, numbers and the words the
//! language reserved. Those four are the same shape in every language this table
//! knows; only the delimiters and the word lists differ. The cost of the choice
//! is honest: nothing here understands nesting, so a language whose meaning
//! depends on it is coloured approximately rather than wrongly.
//!
//! Anything the table does not know is answered as plain lines, never as an
//! error. A file browser that refuses to show a file is worse than one that
//! shows it in one colour.

use serde::{Deserialize, Serialize};

/// Above this, the file is answered as plain lines. A file this big is a log or
/// a generated bundle, and tokenizing it would hold the run loop that asked.
const MAX_HIGHLIGHTED_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenKind {
    Plain,
    Comment,
    String,
    Number,
    Keyword,
    Type,
    Constant,
    /// A name being called, which is the one piece of structure a lexer can see.
    Function,
    /// A field name, a mapping key, a markup attribute.
    Key,
    Punctuation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Token {
    pub text: String,
    pub kind: TokenKind,
}

impl Token {
    fn new(text: impl Into<String>, kind: TokenKind) -> Self {
        Self {
            text: text.into(),
            kind,
        }
    }
}

/// One file, ready to draw. Lines rather than one blob because the view draws
/// line by line and splitting there would put the same rule in two places.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Highlighted {
    /// The language's display name, absent when the table does not know the
    /// file. The view shows it, which is how a reader can tell that a file is
    /// plain because nothing recognised it rather than because it has no colour.
    pub language: Option<String>,
    pub lines: Vec<Vec<Token>>,
}

/// A quoted run. `multiline` is what keeps a lone apostrophe in a shell comment
/// from swallowing the rest of the file.
struct Quote {
    open: &'static str,
    close: &'static str,
    escape: bool,
    multiline: bool,
}

pub struct Language {
    pub name: &'static str,
    extensions: &'static [&'static str],
    /// Matched against the whole file name, for the files that carry their type
    /// in their name instead of a suffix.
    filenames: &'static [&'static str],
    line_comments: &'static [&'static str],
    block_comments: &'static [(&'static str, &'static str)],
    quotes: &'static [Quote],
    keywords: &'static [&'static str],
    types: &'static [&'static str],
    constants: &'static [&'static str],
    /// A word followed by one of these is a key. Wanted for the languages that
    /// are mostly names and values.
    key_terminators: &'static [char],
    /// Whether a key has to be the first thing on its line. False for markup,
    /// where attributes sit inside a tag.
    keys_start_the_line: bool,
    /// A quoted run followed by a key terminator is a key too, which is what
    /// makes a JSON object read as names and values.
    quoted_keys: bool,
    /// A name straight after `<` or `</` is an element.
    tags: bool,
    /// SQL is written in both cases and means the same thing either way.
    ignore_keyword_case: bool,
}

/// Everything the table does not fill in. Written once so a language is only
/// the handful of lines that make it different.
const fn plain_language(name: &'static str, extensions: &'static [&'static str]) -> Language {
    Language {
        name,
        extensions,
        filenames: &[],
        line_comments: &[],
        block_comments: &[],
        quotes: &[],
        keywords: &[],
        types: &[],
        constants: &[],
        key_terminators: &[],
        keys_start_the_line: true,
        quoted_keys: false,
        tags: false,
        ignore_keyword_case: false,
    }
}

const DOUBLE: Quote = Quote {
    open: "\"",
    close: "\"",
    escape: true,
    multiline: false,
};

const SINGLE: Quote = Quote {
    open: "'",
    close: "'",
    escape: true,
    multiline: false,
};

const BACKTICK: Quote = Quote {
    open: "`",
    close: "`",
    escape: true,
    multiline: true,
};

const C_STRINGS: &[Quote] = &[DOUBLE, SINGLE];
const C_BLOCK: &[(&str, &str)] = &[("/*", "*/")];

const CONSTANTS_TRUE_FALSE_NULL: &[&str] = &["true", "false", "null"];

/// The languages this build knows. Adding one is a row here, which is the whole
/// reason the lexer is table driven.
static LANGUAGES: &[Language] = &[
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE, SINGLE],
        keywords: &[
            "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum",
            "extern", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut",
            "pub", "ref", "return", "self", "static", "struct", "super", "trait", "type", "unsafe",
            "use", "where", "while", "yield",
        ],
        types: &[
            "bool", "char", "f32", "f64", "i8", "i16", "i32", "i64", "i128", "isize", "str",
            "String", "u8", "u16", "u32", "u64", "u128", "usize", "Vec", "Option", "Result", "Box",
            "Self",
        ],
        constants: &["true", "false", "None", "Some", "Ok", "Err"],
        ..plain_language("Rust", &["rs"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE],
        keywords: &[
            "actor", "as", "associatedtype", "async", "await", "break", "case", "catch", "class",
            "continue", "default", "defer", "deinit", "do", "else", "enum", "extension",
            "fallthrough", "final", "for", "func", "guard", "if", "import", "in", "init", "inout",
            "internal", "is", "let", "mutating", "open", "operator", "private", "protocol",
            "public", "repeat", "return", "self", "static", "struct", "subscript", "super",
            "switch", "throw", "throws", "try", "typealias", "var", "weak", "where", "while",
        ],
        types: &[
            "Any", "Array", "Bool", "CGFloat", "Character", "Data", "Dictionary", "Double",
            "Error", "Float", "Int", "Set", "String", "UInt", "URL", "Void",
        ],
        constants: &["true", "false", "nil", "Self"],
        ..plain_language("Swift", &["swift"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE, SINGLE, BACKTICK],
        keywords: JS_KEYWORDS,
        types: JS_TYPES,
        constants: &["true", "false", "null", "undefined", "this"],
        ..plain_language("JavaScript", &["js", "mjs", "cjs", "jsx"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE, SINGLE, BACKTICK],
        keywords: TS_KEYWORDS,
        types: TS_TYPES,
        constants: &["true", "false", "null", "undefined", "this"],
        ..plain_language("TypeScript", &["ts", "tsx", "mts"])
    },
    Language {
        line_comments: &["#"],
        quotes: &[
            Quote {
                open: "\"\"\"",
                close: "\"\"\"",
                escape: true,
                multiline: true,
            },
            Quote {
                open: "'''",
                close: "'''",
                escape: true,
                multiline: true,
            },
            DOUBLE,
            SINGLE,
        ],
        keywords: &[
            "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
            "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
            "is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise", "return", "try",
            "while", "with", "yield",
        ],
        types: &[
            "bool", "bytes", "dict", "float", "frozenset", "int", "list", "object", "set", "str",
            "tuple", "type",
        ],
        constants: &["True", "False", "None", "self", "cls"],
        ..plain_language("Python", &["py", "pyi"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE, BACKTICK, SINGLE],
        keywords: &[
            "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
            "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range",
            "return", "select", "struct", "switch", "type", "var",
        ],
        types: &[
            "bool", "byte", "complex64", "complex128", "error", "float32", "float64", "int", "int8",
            "int16", "int32", "int64", "rune", "string", "uint", "uint8", "uint16", "uint32",
            "uint64", "uintptr", "any",
        ],
        constants: &["true", "false", "nil", "iota"],
        ..plain_language("Go", &["go"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: C_STRINGS,
        keywords: &[
            "abstract", "assert", "break", "case", "catch", "class", "continue", "default", "do",
            "else", "enum", "extends", "final", "finally", "for", "if", "implements", "import",
            "instanceof", "interface", "native", "new", "package", "private", "protected",
            "public", "record", "return", "sealed", "static", "super", "switch", "synchronized",
            "this", "throw", "throws", "transient", "try", "var", "volatile", "while", "yield",
        ],
        types: &[
            "boolean", "byte", "char", "double", "float", "int", "long", "short", "void", "Integer",
            "Long", "Double", "Boolean", "String", "List", "Map", "Set", "Object",
        ],
        constants: &["true", "false", "null"],
        ..plain_language("Java", &["java"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE],
        keywords: &[
            "as", "break", "by", "class", "companion", "constructor", "continue", "crossinline",
            "data", "do", "else", "enum", "fun", "for", "if", "import", "in", "init", "inline",
            "interface", "internal", "is", "lateinit", "object", "open", "operator", "override",
            "package", "private", "protected", "public", "return", "sealed", "suspend", "super",
            "this", "throw", "try", "typealias", "val", "var", "vararg", "when", "while",
        ],
        types: &[
            "Any", "Boolean", "Byte", "Char", "Double", "Float", "Int", "List", "Long", "Map",
            "Set", "Short", "String", "Unit",
        ],
        constants: &["true", "false", "null", "it"],
        ..plain_language("Kotlin", &["kt", "kts"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: C_STRINGS,
        keywords: &[
            "auto", "break", "case", "class", "const", "constexpr", "continue", "default", "delete",
            "do", "else", "enum", "explicit", "extern", "for", "friend", "goto", "if", "inline",
            "namespace", "new", "operator", "private", "protected", "public", "register", "return",
            "sizeof", "static", "struct", "switch", "template", "typedef", "typename", "union",
            "using", "virtual", "volatile", "while",
        ],
        types: &[
            "bool", "char", "double", "float", "int", "long", "short", "signed", "size_t",
            "unsigned", "void", "uint8_t", "uint16_t", "uint32_t", "uint64_t",
        ],
        constants: &["true", "false", "NULL", "nullptr", "this"],
        ..plain_language("C", &["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "m", "mm"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: C_STRINGS,
        keywords: &[
            "abstract", "as", "async", "await", "base", "break", "case", "catch", "class", "const",
            "continue", "default", "delegate", "do", "else", "enum", "event", "explicit", "extern",
            "finally", "fixed", "for", "foreach", "get", "if", "implicit", "in", "interface",
            "internal", "is", "lock", "namespace", "new", "operator", "out", "override", "params",
            "private", "protected", "public", "readonly", "record", "ref", "return", "sealed",
            "set", "static", "struct", "switch", "this", "throw", "try", "typeof", "using", "var",
            "virtual", "void", "while", "yield",
        ],
        types: &[
            "bool", "byte", "char", "decimal", "double", "float", "int", "long", "object", "sbyte",
            "short", "string", "uint", "ulong", "ushort", "Task", "List", "Dictionary",
        ],
        constants: &["true", "false", "null"],
        ..plain_language("C#", &["cs"])
    },
    Language {
        line_comments: &["#"],
        quotes: C_STRINGS,
        keywords: &[
            "alias", "and", "begin", "break", "case", "class", "def", "defined?", "do", "else",
            "elsif", "end", "ensure", "for", "if", "in", "module", "next", "not", "or", "redo",
            "rescue", "retry", "return", "self", "super", "then", "unless", "until", "when",
            "while", "yield",
        ],
        constants: &["true", "false", "nil", "__FILE__"],
        ..plain_language("Ruby", &["rb", "rake", "gemspec"])
    },
    Language {
        line_comments: &["#"],
        quotes: C_STRINGS,
        keywords: &[
            "case", "do", "done", "elif", "else", "esac", "exit", "export", "fi", "for",
            "function", "if", "in", "local", "readonly", "return", "select", "set", "shift",
            "source", "then", "trap", "unset", "until", "while",
        ],
        types: &["cat", "cd", "echo", "grep", "printf", "sed", "test"],
        ..plain_language("Shell", &["sh", "bash", "zsh", "ksh", "command"])
    },
    Language {
        line_comments: &["#"],
        quotes: C_STRINGS,
        constants: &["true", "false", "null", "yes", "no", "on", "off", "~"],
        key_terminators: &[':'],
        quoted_keys: true,
        ..plain_language("YAML", &["yml", "yaml"])
    },
    Language {
        line_comments: &["#"],
        quotes: &[
            Quote {
                open: "\"\"\"",
                close: "\"\"\"",
                escape: true,
                multiline: true,
            },
            DOUBLE,
            SINGLE,
        ],
        constants: CONSTANTS_TRUE_FALSE_NULL,
        key_terminators: &['='],
        ..plain_language("TOML", &["toml"])
    },
    Language {
        quotes: &[DOUBLE],
        constants: CONSTANTS_TRUE_FALSE_NULL,
        key_terminators: &[':'],
        keys_start_the_line: false,
        quoted_keys: true,
        ..plain_language("JSON", &["json", "jsonc", "resolved", "lock"])
    },
    Language {
        line_comments: &["#", "//"],
        block_comments: C_BLOCK,
        quotes: &[DOUBLE],
        keywords: &[
            "count", "data", "depends_on", "dynamic", "for_each", "lifecycle", "locals", "module",
            "output", "provider", "resource", "terraform", "variable",
        ],
        types: &["bool", "list", "map", "number", "object", "set", "string", "any"],
        constants: CONSTANTS_TRUE_FALSE_NULL,
        key_terminators: &['='],
        ..plain_language("HCL", &["tf", "tfvars", "hcl"])
    },
    Language {
        line_comments: &["--"],
        block_comments: C_BLOCK,
        quotes: C_STRINGS,
        keywords: &[
            "alter", "and", "as", "asc", "between", "by", "case", "create", "delete", "desc",
            "distinct", "drop", "else", "end", "exists", "from", "group", "having", "in", "index",
            "inner", "insert", "into", "join", "left", "like", "limit", "not", "on", "or", "order",
            "outer", "primary", "select", "set", "table", "then", "union", "update", "values",
            "view", "when", "where", "with",
        ],
        types: &[
            "bigint", "boolean", "date", "decimal", "int", "integer", "jsonb", "numeric", "text",
            "timestamp", "uuid", "varchar",
        ],
        constants: &["null", "true", "false"],
        ignore_keyword_case: true,
        ..plain_language("SQL", &["sql"])
    },
    Language {
        block_comments: &[("<!--", "-->")],
        quotes: C_STRINGS,
        key_terminators: &['='],
        keys_start_the_line: false,
        tags: true,
        ..plain_language("HTML", &["html", "htm", "xml", "svg", "plist", "xib"])
    },
    Language {
        line_comments: &["//"],
        block_comments: C_BLOCK,
        quotes: C_STRINGS,
        keywords: &["@import", "@media", "@keyframes", "and", "from", "important", "to"],
        key_terminators: &[':'],
        ..plain_language("CSS", &["css", "scss", "sass", "less"])
    },
    Language {
        line_comments: &["#"],
        quotes: C_STRINGS,
        keywords: &[
            "ADD", "ARG", "CMD", "COPY", "ENTRYPOINT", "ENV", "EXPOSE", "FROM", "HEALTHCHECK",
            "LABEL", "RUN", "SHELL", "STOPSIGNAL", "USER", "VOLUME", "WORKDIR", "AS",
        ],
        filenames: &["dockerfile", "containerfile"],
        ..plain_language("Dockerfile", &["dockerfile"])
    },
    Language {
        line_comments: &["#"],
        quotes: C_STRINGS,
        keywords: &["define", "else", "endef", "endif", "export", "ifeq", "ifneq", "include"],
        filenames: &["makefile", "gnumakefile"],
        ..plain_language("Makefile", &["mk", "mak"])
    },
];

const JS_KEYWORDS: &[&str] = &[
    "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "export", "extends", "finally", "for", "from", "function",
    "get", "if", "import", "in", "instanceof", "let", "new", "of", "return", "set", "static",
    "super", "switch", "throw", "try", "typeof", "var", "void", "while", "with", "yield",
];

const JS_TYPES: &[&str] = &[
    "Array", "Boolean", "Date", "Error", "Map", "Number", "Object", "Promise", "RegExp", "Set",
    "String", "Symbol",
];

const TS_KEYWORDS: &[&str] = &[
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
    "declare", "default", "delete", "do", "else", "enum", "export", "extends", "finally", "for",
    "from", "function", "get", "if", "implements", "import", "in", "infer", "instanceof",
    "interface", "keyof", "let", "namespace", "new", "of", "private", "protected", "public",
    "readonly", "return", "satisfies", "set", "static", "super", "switch", "throw", "try", "type",
    "typeof", "var", "void", "while", "yield",
];

const TS_TYPES: &[&str] = &[
    "any", "Array", "bigint", "boolean", "Date", "Error", "Map", "never", "number", "Object",
    "Promise", "Record", "Set", "string", "symbol", "unknown", "void",
];

/// The language for a path, by file name first and suffix second. A file called
/// Dockerfile has no suffix to read, and one called `Dockerfile.dev` has the
/// wrong one.
pub fn language_for(path: &str) -> Option<&'static Language> {
    let name = path.rsplit('/').next().unwrap_or(path).to_lowercase();
    if let Some(language) = LANGUAGES
        .iter()
        .find(|language| language.filenames.iter().any(|known| name.starts_with(known)))
    {
        return Some(language);
    }
    let extension = name.rsplit_once('.').map(|(_, suffix)| suffix)?;
    LANGUAGES
        .iter()
        .find(|language| language.extensions.contains(&extension))
}

/// Colours `text` as the language `path` names it.
///
/// Never an error and never empty for a file with a line in it: an unknown
/// language, a file too big to tokenize and a binary blob all come back as
/// plain lines, because the view has to draw something either way.
pub fn highlight(path: &str, text: &str) -> Highlighted {
    let language = language_for(path);
    let lines = match language {
        Some(language) if text.len() <= MAX_HIGHLIGHTED_BYTES => {
            split_lines(Lexer::new(language, text).run())
        }
        _ => plain_lines(text),
    };
    Highlighted {
        language: language.map(|language| language.name.to_string()),
        lines,
    }
}

fn plain_lines(text: &str) -> Vec<Vec<Token>> {
    text.split('\n')
        .map(|line| {
            if line.is_empty() {
                Vec::new()
            } else {
                vec![Token::new(line.trim_end_matches('\r'), TokenKind::Plain)]
            }
        })
        .collect()
}

/// Cuts the token stream at every newline. A block comment and a multiline
/// string are the reason this is a step of its own: they are one token to the
/// lexer and several rows to the view.
fn split_lines(tokens: Vec<Token>) -> Vec<Vec<Token>> {
    let mut lines = vec![Vec::new()];
    for token in tokens {
        let mut pieces = token.text.split('\n');
        if let Some(first) = pieces.next() {
            push(lines.last_mut().expect("a line is always open"), first, token.kind);
        }
        for piece in pieces {
            lines.push(Vec::new());
            push(lines.last_mut().expect("a line is always open"), piece, token.kind);
        }
    }
    lines
}

/// Adds text to a line, joining it to the token before it when they are the
/// same kind. Merging here is what keeps a line of code from arriving as fifty
/// one character tokens.
fn push(line: &mut Vec<Token>, text: &str, kind: TokenKind) {
    let text = text.trim_end_matches('\r');
    if text.is_empty() {
        return;
    }
    match line.last_mut() {
        Some(last) if last.kind == kind => last.text.push_str(text),
        _ => line.push(Token::new(text, kind)),
    }
}

struct Lexer<'a> {
    language: &'a Language,
    chars: Vec<char>,
    at: usize,
    tokens: Vec<Token>,
    /// The last character that was not whitespace, which is all the context the
    /// element rule needs.
    previous: Option<char>,
}

impl<'a> Lexer<'a> {
    fn new(language: &'a Language, text: &str) -> Self {
        Self {
            language,
            chars: text.chars().collect(),
            at: 0,
            tokens: Vec::new(),
            previous: None,
        }
    }

    fn run(mut self) -> Vec<Token> {
        while self.at < self.chars.len() {
            if self.take_comment() || self.take_quote() || self.take_number() || self.take_word() {
                continue;
            }
            self.take_one();
        }
        self.tokens
    }

    fn take_comment(&mut self) -> bool {
        for marker in self.language.line_comments {
            if self.looking_at(marker) {
                let end = self.find_from(self.at, "\n").unwrap_or(self.chars.len());
                self.emit(end, TokenKind::Comment);
                return true;
            }
        }
        for (open, close) in self.language.block_comments {
            if self.looking_at(open) {
                let end = self
                    .find_from(self.at + open.chars().count(), close)
                    .map(|found| found + close.chars().count())
                    .unwrap_or(self.chars.len());
                self.emit(end, TokenKind::Comment);
                return true;
            }
        }
        false
    }

    fn take_quote(&mut self) -> bool {
        // Longest opener first, so a triple quote is not read as an empty
        // string followed by another one.
        let mut quotes: Vec<&Quote> = self.language.quotes.iter().collect();
        quotes.sort_by_key(|quote| std::cmp::Reverse(quote.open.len()));
        for quote in quotes {
            if !self.looking_at(quote.open) {
                continue;
            }
            let end = self.end_of(quote);
            self.emit(end, TokenKind::String);
            if self.language.quoted_keys && self.next_visible_is_key_terminator() {
                self.recolour_last(TokenKind::Key);
            }
            return true;
        }
        false
    }

    /// Where a quoted run ends: past its closer, at the end of the line when it
    /// may not cross one, or at the end of the file.
    fn end_of(&self, quote: &Quote) -> usize {
        let mut at = self.at + quote.open.chars().count();
        while at < self.chars.len() {
            let character = self.chars[at];
            if quote.escape && character == '\\' {
                at += 2;
                continue;
            }
            if !quote.multiline && character == '\n' {
                return at;
            }
            if self.matches(at, quote.close) {
                return at + quote.close.chars().count();
            }
            at += 1;
        }
        self.chars.len()
    }

    fn take_number(&mut self) -> bool {
        let start = self.chars[self.at];
        if !start.is_ascii_digit() {
            return false;
        }
        // A digit inside a name is part of the name, and the name was already
        // taken by the word rule, so only a boundary reaches here.
        if matches!(self.previous_character(), Some(before) if is_word(before)) {
            return false;
        }
        let mut at = self.at;
        while at < self.chars.len() && (is_word(self.chars[at]) || self.chars[at] == '.') {
            at += 1;
        }
        self.emit(at, TokenKind::Number);
        true
    }

    fn take_word(&mut self) -> bool {
        if !is_word_start(self.chars[self.at]) {
            return false;
        }
        let mut at = self.at;
        while at < self.chars.len() && is_word(self.chars[at]) {
            at += 1;
        }
        let word: String = self.chars[self.at..at].iter().collect();
        let kind = self.classify(&word, at);
        self.emit(at, kind);
        true
    }

    fn classify(&self, word: &str, end: usize) -> TokenKind {
        // A key is asked about first, because a name is a name whatever else it
        // spells. `on:` at the top of a workflow file is the mapping key, not
        // the YAML word for true.
        if self.is_key(end) {
            return TokenKind::Key;
        }
        if self.language.constants.contains(&word) {
            return TokenKind::Constant;
        }
        if self.contains_keyword(word) {
            return TokenKind::Keyword;
        }
        if self.language.types.contains(&word) {
            return TokenKind::Type;
        }
        if self.language.tags && matches!(self.previous, Some('<') | Some('/')) {
            return TokenKind::Type;
        }
        if self.visible_from(end) == Some('(') {
            return TokenKind::Function;
        }
        TokenKind::Plain
    }

    fn contains_keyword(&self, word: &str) -> bool {
        if self.language.ignore_keyword_case {
            let lowered = word.to_lowercase();
            return self
                .language
                .keywords
                .iter()
                .any(|keyword| keyword.to_lowercase() == lowered);
        }
        self.language.keywords.contains(&word)
    }

    fn is_key(&self, end: usize) -> bool {
        if self.language.key_terminators.is_empty() {
            return false;
        }
        if self.language.keys_start_the_line && !self.starts_the_line() {
            return false;
        }
        matches!(self.visible_from(end), Some(next) if self.language.key_terminators.contains(&next))
    }

    /// Whether only whitespace and list markers stand between the word and the
    /// start of its line. A YAML entry under a dash is still a key.
    fn starts_the_line(&self) -> bool {
        self.chars[..self.at]
            .iter()
            .rev()
            .take_while(|character| **character != '\n')
            .all(|character| character.is_whitespace() || *character == '-')
    }

    fn next_visible_is_key_terminator(&self) -> bool {
        let terminators = if self.language.key_terminators.is_empty() {
            &[':'][..]
        } else {
            self.language.key_terminators
        };
        matches!(self.visible_from(self.at), Some(next) if terminators.contains(&next))
    }

    /// Punctuation, whitespace, anything left. One character at a time, because
    /// `push` joins the runs back together when the line is built.
    fn take_one(&mut self) {
        let character = self.chars[self.at];
        let kind = if character.is_whitespace() || is_word(character) {
            TokenKind::Plain
        } else {
            TokenKind::Punctuation
        };
        self.emit(self.at + 1, kind);
    }

    fn emit(&mut self, end: usize, kind: TokenKind) {
        let end = end.min(self.chars.len()).max(self.at + 1);
        let text: String = self.chars[self.at..end].iter().collect();
        if let Some(last) = text.chars().rev().find(|character| !character.is_whitespace()) {
            self.previous = Some(last);
        }
        self.tokens.push(Token::new(text, kind));
        self.at = end;
    }

    fn recolour_last(&mut self, kind: TokenKind) {
        if let Some(last) = self.tokens.last_mut() {
            last.kind = kind;
        }
    }

    fn looking_at(&self, marker: &str) -> bool {
        self.matches(self.at, marker)
    }

    fn matches(&self, at: usize, marker: &str) -> bool {
        marker
            .chars()
            .enumerate()
            .all(|(offset, expected)| self.chars.get(at + offset) == Some(&expected))
    }

    fn find_from(&self, start: usize, marker: &str) -> Option<usize> {
        (start..self.chars.len()).find(|at| self.matches(*at, marker))
    }

    /// The next character that is not a space or a tab, from `at` onwards. Stops
    /// at the end of the line: a colon on the next line does not make a key.
    fn visible_from(&self, at: usize) -> Option<char> {
        self.chars[at.min(self.chars.len())..]
            .iter()
            .find(|character| **character != ' ' && **character != '\t')
            .copied()
            .filter(|character| *character != '\n')
    }

    fn previous_character(&self) -> Option<char> {
        self.at.checked_sub(1).map(|before| self.chars[before])
    }
}

fn is_word_start(character: char) -> bool {
    character.is_alphabetic() || character == '_' || character == '@' || character == '$'
}

fn is_word(character: char) -> bool {
    character.is_alphanumeric() || character == '_' || character == '$'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(path: &str, text: &str) -> Vec<Vec<(TokenKind, String)>> {
        highlight(path, text)
            .lines
            .into_iter()
            .map(|line| {
                line.into_iter()
                    .map(|token| (token.kind, token.text))
                    .collect()
            })
            .collect()
    }

    fn kind_of(path: &str, text: &str, needle: &str) -> Option<TokenKind> {
        kinds(path, text)
            .into_iter()
            .flatten()
            .find(|(_, text)| text.trim() == needle)
            .map(|(kind, _)| kind)
    }

    #[test]
    fn reads_the_language_from_the_name_and_the_suffix() {
        assert_eq!(language_for("/tmp/a/main.rs").map(|l| l.name), Some("Rust"));
        assert_eq!(language_for("app/View.swift").map(|l| l.name), Some("Swift"));
        // A file whose type is its name, with and without something after it.
        assert_eq!(language_for("Dockerfile").map(|l| l.name), Some("Dockerfile"));
        assert_eq!(
            language_for("deploy/Dockerfile.dev").map(|l| l.name),
            Some("Dockerfile")
        );
        assert_eq!(language_for("notes.unknownext").map(|l| l.name), None);
        assert_eq!(language_for("LICENSE").map(|l| l.name), None);
    }

    #[test]
    fn an_unknown_language_is_plain_lines_rather_than_nothing() {
        let highlighted = highlight("notes.unknownext", "one\ntwo\n");
        assert_eq!(highlighted.language, None);
        assert_eq!(
            highlighted.lines,
            vec![
                vec![Token::new("one", TokenKind::Plain)],
                vec![Token::new("two", TokenKind::Plain)],
                Vec::new(),
            ]
        );
    }

    #[test]
    fn a_file_too_big_to_tokenize_is_still_answered() {
        // The point is that nobody sees an error or an empty tab; the colour is
        // what is given up.
        let text = "let x = 1;\n".repeat(MAX_HIGHLIGHTED_BYTES / 8);
        let highlighted = highlight("big.rs", &text);
        assert_eq!(highlighted.language.as_deref(), Some("Rust"));
        assert_eq!(highlighted.lines[0], vec![Token::new("let x = 1;", TokenKind::Plain)]);
    }

    #[test]
    fn colours_keywords_types_numbers_and_strings() {
        let source = "pub fn main() { let count: u8 = 12; println!(\"hi\"); }";
        assert_eq!(kind_of("a.rs", source, "pub"), Some(TokenKind::Keyword));
        assert_eq!(kind_of("a.rs", source, "u8"), Some(TokenKind::Type));
        assert_eq!(kind_of("a.rs", source, "12"), Some(TokenKind::Number));
        assert_eq!(kind_of("a.rs", source, "\"hi\""), Some(TokenKind::String));
        assert_eq!(kind_of("a.rs", source, "main"), Some(TokenKind::Function));
        assert_eq!(kind_of("a.rs", source, "true"), None);
    }

    #[test]
    fn a_line_comment_reaches_the_end_of_its_line_and_no_further() {
        let lines = kinds("a.rs", "// note\nlet x = 1;\n");
        assert_eq!(lines[0], vec![(TokenKind::Comment, "// note".to_string())]);
        assert_eq!(lines[1][0], (TokenKind::Keyword, "let".to_string()));
    }

    #[test]
    fn a_block_comment_is_one_token_split_across_its_lines() {
        // The lexer sees one comment and the view needs two rows, which is the
        // only reason splitting is a step of its own.
        let lines = kinds("a.rs", "/* one\n   two */ let x = 1;");
        assert_eq!(lines[0], vec![(TokenKind::Comment, "/* one".to_string())]);
        assert_eq!(lines[1][0], (TokenKind::Comment, "   two */".to_string()));
        assert!(lines[1].iter().any(|(kind, text)| *kind == TokenKind::Keyword && text == "let"));
    }

    #[test]
    fn an_unclosed_quote_stops_at_the_end_of_its_line() {
        // A stray apostrophe in a comment used to swallow the rest of the file,
        // which is the whole reason a quote says whether it may cross a line.
        let lines = kinds("a.sh", "echo don't\nexport PATH=/bin\n");
        assert!(lines[1].iter().any(|(kind, text)| *kind == TokenKind::Keyword && text == "export"));
    }

    #[test]
    fn a_triple_quote_may_cross_lines() {
        let lines = kinds("a.py", "text = \"\"\"one\ntwo\"\"\"\nx = 1\n");
        assert_eq!(lines[1][0].0, TokenKind::String);
        assert!(lines[2].iter().any(|(kind, text)| *kind == TokenKind::Number && text == "1"));
    }

    #[test]
    fn a_mapping_key_is_told_from_its_value() {
        let source = "name: build\non: push\nsteps:\n  - uses: actions/checkout\n";
        // `on` is also the YAML word for true, and at the start of a line with a
        // colon after it, it is the name of the thing.
        assert_eq!(kind_of("a.yml", source, "on"), Some(TokenKind::Key));
        assert_eq!(kind_of("a.yml", source, "name"), Some(TokenKind::Key));
        // A key under a list marker is still the first thing on its line.
        assert_eq!(kind_of("a.yml", source, "uses"), Some(TokenKind::Key));
        assert_eq!(kind_of("a.yml", source, "build"), Some(TokenKind::Plain));
    }

    #[test]
    fn a_quoted_json_name_is_a_key_and_its_value_is_not() {
        let lines = kinds("a.json", "{\"name\": \"akbun\", \"count\": 2}");
        let flat: Vec<(TokenKind, String)> = lines.into_iter().flatten().collect();
        assert!(flat.contains(&(TokenKind::Key, "\"name\"".to_string())));
        assert!(flat.contains(&(TokenKind::String, "\"akbun\"".to_string())));
        assert!(flat.contains(&(TokenKind::Number, "2".to_string())));
    }

    #[test]
    fn an_element_and_its_attribute_are_told_apart() {
        let source = "<img src=\"a.png\" />";
        assert_eq!(kind_of("a.html", source, "img"), Some(TokenKind::Type));
        assert_eq!(kind_of("a.html", source, "src"), Some(TokenKind::Key));
    }

    #[test]
    fn sql_is_written_in_either_case() {
        assert_eq!(kind_of("a.sql", "SELECT 1", "SELECT"), Some(TokenKind::Keyword));
        assert_eq!(kind_of("a.sql", "select 1", "select"), Some(TokenKind::Keyword));
    }

    #[test]
    fn a_number_inside_a_name_stays_part_of_the_name() {
        assert_eq!(kind_of("a.rs", "let utf8 = 1;", "utf8"), Some(TokenKind::Plain));
    }

    #[test]
    fn every_character_of_the_file_comes_back() {
        // A highlighter that loses text is worse than one that loses colour, so
        // this is checked over a file with every rule in it at once.
        let source = "// c\nfn f(x: u8) -> u8 { \"s\" ; 1.5 /* b */ }\n\n\tlast\n";
        let rebuilt: String = highlight("a.rs", source)
            .lines
            .iter()
            .map(|line| {
                line.iter()
                    .map(|token| token.text.as_str())
                    .collect::<String>()
            })
            .collect::<Vec<String>>()
            .join("\n");
        assert_eq!(rebuilt, source);
    }
}
