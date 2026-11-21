# mem 핸즈온 haru 그림

haru 1.1.7에서 생성했습니다. 각 그림은 `ink-blue`를 사용하고, spec 채점은 100점입니다. PNG를 가운데로 정렬한 뒤 글자와 화살표 방향을 확인했습니다.

## 캡처

배치 `row`. 모델과 Claude Code 내부의 도구 실행을 하나로 묶고, 종료 응답은 상세 흐름에 표시.

[PNG](02_capture.png) · [Spec](02_capture.json) · [프롬프트](02_capture.txt)

생성에 사용한 프롬프트 전문입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes stand in one horizontal row in flow order, evenly spaced.

SUBJECT: A successful Write call becomes one local SQLite event through a Claude Code command hook

SHAPES (3): 1. a rectangle named "Claude Code". 2. a rectangle named "minimem-hook" over "tool" on two lines. 3. an upright cylinder named "SQLite" over "events" on two lines.

ARROWS (2): 1. from shape 1 ("Claude Code") to shape 2 ("minimem-hook tool"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "1" in #4A90D0 near the middle of the line, labeled "stdin JSON" in small #4A90D0 lettering beside the line. 2. from shape 2 ("minimem-hook tool") to shape 3 ("SQLite events"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "2" in #4A90D0 near the middle of the line, labeled "INSERT" in small #4A90D0 lettering beside the line.

NOTES: Just below shape 1 ("Claude Code"), a small note in #4A90D0 lettering reads "After successful Write". Just below shape 3 ("SQLite events"), a small note in #4A90D0 lettering reads "processed is zero".

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Arrows are straight lines; an arrow bends, in one shallow curve, only when a straight line would cross another shape, to pass around that shape. Each arrow ends exactly on the target outline and never crosses through a shape or through any shape name, group name or half title; arrows route around those names. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading that is not quoted above, no legend, no watermark.
```

## observer

배치 `columns`. 세션 종료와 Stop hook을 한 시작점으로 묶고, 처리 완료 표시는 상세 흐름에 표시.

[PNG](03_observer.png) · [Spec](03_observer.json) · [프롬프트](03_observer.txt)

생성에 사용한 프롬프트 전문입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes sit in vertical columns placed from left to right, one column per stage, with arrows running between columns.

SUBJECT: A background observer reads recorded inputs sends a prompt to Haiku and saves structured memory

SHAPES (4): 1. a rectangle in column 1 from the left named "Stop hook". 2. a rectangle in column 2 from the left named "Observer". 3. a rectangle in column 3 from the left named "Haiku". 4. an upright cylinder in column 3 from the left named "SQLite".

ARROWS (5): 1. from shape 1 ("Stop hook") to shape 2 ("Observer"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "1" in #4A90D0 near the middle of the line, labeled "Popen" in small #4A90D0 lettering beside the line. 2. from shape 4 ("SQLite") to shape 2 ("Observer"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "2" in #4A90D0 near the middle of the line, labeled "Read records" in small #4A90D0 lettering beside the line. 3. from shape 2 ("Observer") to shape 3 ("Haiku"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "3" in #4A90D0 near the middle of the line, labeled "Send prompt" in small #4A90D0 lettering beside the line. 4. from shape 3 ("Haiku") to shape 2 ("Observer"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "4" in #4A90D0 near the middle of the line, labeled "Return XML" in small #4A90D0 lettering beside the line. 5. from shape 2 ("Observer") to shape 4 ("SQLite"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "5" in #4A90D0 near the middle of the line, labeled "Save summary" in small #4A90D0 lettering beside the line.

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Arrows are straight lines; an arrow bends, in one shallow curve, only when a straight line would cross another shape, to pass around that shape. Each arrow ends exactly on the target outline and never crosses through a shape or through any shape name, group name or half title; arrows route around those names. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading that is not quoted above, no legend, no watermark.
```

## 검색 분기

배치 `columns`. 검색어 분리와 길이 판정을 묶고, AND·OR의 세부 조건은 상세 흐름에 표시.

[PNG](04_search.png) · [Spec](04_search.json) · [프롬프트](04_search.txt)

생성에 사용한 프롬프트 전문입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes sit in vertical columns placed from left to right, one column per stage, with arrows running between columns.

SUBJECT: SQLite search routes longer keywords through a trigram index and short keywords through LIKE

SHAPES (4): 1. a rectangle in column 1 from the left named "Keyword" over "length" on two lines. 2. a rectangle in column 2 from the left named "FTS5 trigram". 3. a rectangle in column 2 from the left named "LIKE". 4. a rectangle in column 3 from the left named "AND or OR" over "Rank IDs" on two lines.

ARROWS (4): 1. from shape 1 ("Keyword length") to shape 2 ("FTS5 trigram"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "Three or more" in small #4A90D0 lettering beside the line. 2. from shape 1 ("Keyword length") to shape 3 ("LIKE"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "One or two" in small #4A90D0 lettering beside the line. 3. from shape 2 ("FTS5 trigram") to shape 4 ("AND or OR Rank IDs"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "Matched IDs" in small #4A90D0 lettering beside the line. 4. from shape 3 ("LIKE") to shape 4 ("AND or OR Rank IDs"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head.

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Arrows are straight lines; an arrow bends, in one shallow curve, only when a straight line would cross another shape, to pass around that shape. Each arrow ends exactly on the target outline and never crosses through a shape or through any shape name, group name or half title; arrows route around those names. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading that is not quoted above, no legend, no watermark.
```

## 주입

배치 `row`. SQLite에서 모델까지 이동하는 텍스트를 중심으로 표시하고, 관찰 제한과 시작 이벤트는 상세 흐름에 표시.

[PNG](05_injection.png) · [Spec](05_injection.json) · [프롬프트](05_injection.txt)

생성에 사용한 프롬프트 전문입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes stand in one horizontal row in flow order, evenly spaced.

SUBJECT: Session startup turns saved summaries and observation titles into context for the next model

SHAPES (4): 1. an upright cylinder named "SQLite". 2. a rectangle named "SessionStart". 3. a rectangle named "Claude Code". 4. a rectangle named "Model input".

ARROWS (3): 1. from shape 1 ("SQLite") to shape 2 ("SessionStart"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "1" in #4A90D0 near the middle of the line, labeled "Read memory" in small #4A90D0 lettering beside the line. 2. from shape 2 ("SessionStart") to shape 3 ("Claude Code"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "2" in #4A90D0 near the middle of the line, labeled "JSON stdout" in small #4A90D0 lettering beside the line. 3. from shape 3 ("Claude Code") to shape 4 ("Model input"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "3" in #4A90D0 near the middle of the line, labeled "Add context" in small #4A90D0 lettering beside the line.

NOTES: Just below shape 2 ("SessionStart"), a small note in #4A90D0 lettering reads "Summary and titles". Just below shape 3 ("Claude Code"), a small note in #4A90D0 lettering reads "additionalContext".

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Arrows are straight lines; an arrow bends, in one shallow curve, only when a straight line would cross another shape, to pass around that shape. Each arrow ends exactly on the target outline and never crosses through a shape or through any shape name, group name or half title; arrows route around those names. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading that is not quoted above, no legend, no watermark.
```

## MCP 조회

배치 `split`. 조회 두 단계를 나누고, SQLite 조회와 ToolSearch는 상세 흐름에 표시.

[PNG](06_mcp.png) · [Spec](06_mcp.json) · [프롬프트](06_mcp.txt)

생성에 사용한 프롬프트 전문입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: Two side-by-side halves compare two situations (before and after, or A and B), each half with its own shapes; an empty white vertical gap with no dividing line separates them.

SUBJECT: Two lookup steps find observation identifiers before fetching one selected memory record

TITLES: The left half has the title "Find an ID" written in #1E1E1E, slightly larger than the shape names, at its top-left corner, left-aligned, above and clear of its shapes and group outlines. The right half has the title "Open the record" written in #1E1E1E, slightly larger than the shape names, at its top-left corner, left-aligned, above and clear of its shapes and group outlines.

SHAPES (4): 1. a rectangle in the left half named "Claude Code". 2. a rectangle in the left half named "minimem-mcp". 3. a rectangle in the right half named "Claude Code". 4. a rectangle in the right half named "minimem-mcp".

ARROWS (4): 1. from shape 1 ("Claude Code") to shape 2 ("minimem-mcp"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "1" in #4A90D0 near the middle of the line, labeled "Search words" in small #4A90D0 lettering beside the line. 2. from shape 2 ("minimem-mcp") to shape 1 ("Claude Code"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "2" in #4A90D0 near the middle of the line, labeled "Titles and IDs" in small #4A90D0 lettering beside the line. 3. from shape 3 ("Claude Code") to shape 4 ("minimem-mcp"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "3" in #4A90D0 near the middle of the line, labeled "Selected ID" in small #4A90D0 lettering beside the line. 4. from shape 4 ("minimem-mcp") to shape 3 ("Claude Code"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, with a small hollow #4A90D0 circle holding the number "4" in #4A90D0 near the middle of the line, labeled "Full record" in small #4A90D0 lettering beside the line.

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Arrows are straight lines; an arrow bends, in one shallow curve, only when a straight line would cross another shape, to pass around that shape. Each arrow ends exactly on the target outline and never crosses through a shape or through any shape name, group name or half title; arrows route around those names. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading that is not quoted above, no legend, no watermark.
```

## 원본 worker

배치 `columns`. HTTP 전달 및 spool 재전송을 확대하고, observer·Chroma·viewer·MCP는 상세 흐름에 표시.

[PNG](07_worker.png) · [Spec](07_worker.json) · [프롬프트](07_worker.txt)

생성에 사용한 프롬프트 전문입니다.

```text
Hand-drawn technical diagram sketch on a plain white canvas, landscape 16:9, flat 2D, like a quick whiteboard-app drawing made with a mouse.

LAYOUT: The shapes sit in vertical columns placed from left to right, one column per stage, with arrows running between columns.

SUBJECT: Original Claude Mem hooks hand events to a resident worker with a local spool fallback

SHAPES (4): 1. a rectangle in column 1 from the left named "claude-mem" over "Hook" on two lines. 2. an upright cylinder in column 2 from the left named "Spool file". 3. a rectangle in column 3 from the left named "Worker". 4. an upright cylinder in column 4 from the left named "SQLite".

ARROWS (4): 1. from shape 1 ("claude-mem Hook") to shape 3 ("Worker"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "HTTP" in small #4A90D0 lettering beside the line. 2. from shape 1 ("claude-mem Hook") to shape 2 ("Spool file"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "On failure" in small #4A90D0 lettering beside the line. 3. from shape 2 ("Spool file") to shape 3 ("Worker"): a straight dashed #4A90D0 line with a hollow #4A90D0 triangle head, labeled "Replay" in small #4A90D0 lettering beside the line. 4. from shape 3 ("Worker") to shape 4 ("SQLite"): a straight solid #4A90D0 line with a hollow #4A90D0 triangle head, labeled "Save memory" in small #4A90D0 lettering beside the line.

TEXT: The only words in the image are the quoted texts above, spelled exactly.

COLOR PALETTE: background #FFFFFF; ink #1E1E1E; accent #4A90D0. Use no other colors.

STYLE: Every shape is outlined once in near-black ink (#1E1E1E), about 2 px at 1280 px width, even weight, drawn freehand yet nearly straight; corners are sharp or barely rounded. No doubled strokes, no sketch hatching, no brush texture. Shapes are empty inside, white like the canvas: no colored fills, no gradients, no drop shadows, no 3D depth. All text is casual rounded hand-lettering, slightly uneven, like a marker font in a sketch app. Shape names sit centered inside their shape in #1E1E1E; arrow labels and notes are smaller and written in #4A90D0. Write every quoted text exactly, letter for letter. Every arrow, line and head, is drawn in #4A90D0; no arrow is black. Arrowheads are small hollow (outlined, unfilled) triangles. Solid and dashed arrows keep the same thin weight. Arrows are straight lines; an arrow bends, in one shallow curve, only when a straight line would cross another shape, to pass around that shape. Each arrow ends exactly on the target outline and never crosses through a shape or through any shape name, group name or half title; arrows route around those names. The whole diagram, taken as one group of shapes, arrows and text, is centered on the canvas both horizontally and vertically: the empty margin on the left equals the margin on the right, and the margin above equals the margin below. Generous white space covers more than half of the canvas; shapes are well separated and never overlap. No frame, no background pattern, no grid.

DO NOT: no colored fills, no 3D, no drop shadows, no gradients, no real product logos or brand marks, no icons or pictograms, no characters, mascots or decorative doodles, no title or heading that is not quoted above, no legend, no watermark.
```
