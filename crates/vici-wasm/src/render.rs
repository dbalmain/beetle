//! Snapshot printer copied from vici's `tests/editor_cases.rs`.
//!
//! Keep this aligned with that file so WASM snapshot bytes cannot drift from
//! vici's `Debug` strings.

use std::fmt::Write;

use vici::{Editor, Effect, render};

pub(crate) fn render_case(snapshot: &mut String, name: &str, editor: &Editor, effects: &[Effect]) {
    let selection = editor.selection().map_or_else(
        || "-".to_owned(),
        |range| format!("{}..{}", range.start, range.end),
    );
    let register_kind = if editor.register().linewise {
        "line"
    } else {
        "char"
    };
    let recording = editor
        .recording()
        .map_or_else(|| "-".to_owned(), |name| name.to_string());
    let point = editor.cursor_point();
    let history = editor.document().history();
    // The automatic marks are as much state as the named ones; leaving them out
    // would mean a regression in `'[`/`']` never showed up in a case block.
    let marks: Vec<_> = ('a'..='z')
        .chain(['<', '>', '[', ']', '^'])
        .filter_map(|name| editor.mark(name).map(|offset| format!("{name}:{offset}")))
        .collect();
    let marks = if marks.is_empty() {
        "[]".to_owned()
    } else {
        format!("[{}]", marks.join(", "))
    };
    write!(
        snapshot,
        "== {name} ==\n\
         text: {text:?}\n\
         cursor: {cursor} @ {row}:{col}\n\
         mode: {mode:?}; selection: {selection}\n\
         register: {register_kind} {register:?}\n\
         history: undo={undo} redo={redo}\n\
         jumps: {jumps:?}\n\
         marks: {marks}\n\
         pending: {pending:?}; last-change: {last_change:?}; recording: {recording}\n\
         effects:\n",
        text = editor.buffer().to_string(),
        cursor = editor.cursor(),
        row = point.row,
        col = point.col,
        mode = editor.mode(),
        register = editor.register().text,
        undo = history.undo_depth(),
        redo = history.redo_depth(),
        jumps = editor.jumps(),
        pending = render(editor.pending_keys()),
        last_change = render(editor.last_change()),
    )
    .expect("writing to a String cannot fail");
    for effect in effects {
        snapshot.push_str("  ");
        snapshot.push_str(&render_effect(effect));
        snapshot.push('\n');
    }
    snapshot.push('\n');
}

pub(crate) fn render_effect(effect: &Effect) -> String {
    match effect {
        Effect::Edit(edit) => format!(
            "edit {}..{} -> {}; ({},{})..({},{}) -> ({},{})",
            edit.start_byte,
            edit.old_end_byte,
            edit.new_end_byte,
            edit.start_point.row,
            edit.start_point.col,
            edit.old_end_point.row,
            edit.old_end_point.col,
            edit.new_end_point.row,
            edit.new_end_point.col
        ),
        Effect::ModeChanged(mode) => format!("mode {mode:?}"),
        Effect::Scroll(scroll) => format!("scroll {scroll:?}"),
        Effect::CommandPrompt => "command prompt :".to_owned(),
        Effect::Bell => "bell".to_owned(),
        Effect::RecordingStarted(register) => format!("recording @{register}"),
        Effect::RecordingStopped(register) => format!("recorded @{register}"),
    }
}
