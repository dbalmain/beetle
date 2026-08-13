//! wasm-bindgen façade over [`vici::Editor`].
//!
//! The JS surface matches `@beetle/contract`'s `Engine`. `Buffer`, `Keymap`,
//! and `Pending` stay on the Rust side. Cloning the editor (rope + undo stack)
//! is not exported.

use wasm_bindgen::JsError;
use wasm_bindgen::prelude::*;

use vici::{Editor, Effect, Indent, Key, KeyCode, Mods, Viewport};

mod render;

/// Host-optional viewport / indent, matching a fixture `with` line.
#[derive(Default)]
struct CaseSettings {
    viewport: Option<Viewport>,
    indent: Option<Indent>,
}

/// wasm-bindgen class wrapping [`Editor`]. Methods map onto the TypeScript
/// `Engine`; structured values that are awkward at the ABI (effects, marks)
/// cross as JSON or packed primitives and are rebuilt in `@beetle/vici-wasm`.
#[wasm_bindgen]
pub struct WasmEditor {
    inner: Editor,
}

#[wasm_bindgen]
impl WasmEditor {
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(text: &str) -> Self {
        Self {
            inner: Editor::from_text(text),
        }
    }

    /// Feed a vi-notation script. Parse failure becomes a JS exception.
    ///
    /// # Errors
    /// If `spec` is not valid key notation.
    pub fn type_keys(&mut self, spec: &str) -> Result<String, JsError> {
        let effects = self
            .inner
            .type_keys(spec)
            .map_err(|error| JsError::new(&error.to_string()))?;
        Ok(effects_json(&effects))
    }

    /// Feed one structured key (`code` discriminant, payload, `Mods` bits).
    ///
    /// # Errors
    /// If `code_type` / `payload` do not describe a [`vici::Key`].
    pub fn handle_key(
        &mut self,
        code_type: &str,
        payload: &str,
        mods: u8,
    ) -> Result<String, JsError> {
        let key = key_from_parts(code_type, payload, mods).map_err(|error| JsError::new(&error))?;
        Ok(effects_json(&self.inner.handle_key(key)))
    }

    pub fn set_text(&mut self, text: &str) {
        self.inner.set_text(text);
    }

    pub fn set_indent(&mut self, shift_width: u32, tab_width: u32, use_tabs: bool) {
        self.inner.set_indent(Indent {
            shift_width: shift_width as usize,
            tab_width: tab_width as usize,
            use_tabs,
        });
    }

    pub fn set_viewport(&mut self, top_row: u32, height: u32) {
        self.inner.set_viewport(Viewport {
            top_row: top_row as usize,
            height: height as usize,
        });
    }

    #[must_use]
    pub fn text(&self) -> String {
        self.inner.buffer().to_string()
    }

    #[must_use]
    pub fn cursor(&self) -> u32 {
        as_u32(self.inner.cursor())
    }

    #[must_use]
    pub fn cursor_row(&self) -> u32 {
        as_u32(self.inner.cursor_point().row)
    }

    #[must_use]
    pub fn cursor_col(&self) -> u32 {
        as_u32(self.inner.cursor_point().col)
    }

    #[must_use]
    pub fn mode(&self) -> String {
        format!("{:?}", self.inner.mode())
    }

    /// Empty when there is no selection; otherwise `"start,end"`.
    #[must_use]
    pub fn selection(&self) -> String {
        self.inner.selection().map_or_else(String::new, |range| {
            format!("{},{}", range.start, range.end)
        })
    }

    #[must_use]
    pub fn register_text(&self) -> String {
        self.inner.register().text.clone()
    }

    #[must_use]
    pub fn register_linewise(&self) -> bool {
        self.inner.register().linewise
    }

    #[must_use]
    pub fn undo_depth(&self) -> u32 {
        as_u32(self.inner.document().history().undo_depth())
    }

    #[must_use]
    pub fn redo_depth(&self) -> u32 {
        as_u32(self.inner.document().history().redo_depth())
    }

    #[must_use]
    pub fn jumps(&self) -> Vec<u32> {
        self.inner
            .jumps()
            .iter()
            .map(|&offset| as_u32(offset))
            .collect()
    }

    /// Mark names that are set, in snapshot order: `a–z` then `< > [ ] ^`.
    #[must_use]
    pub fn mark_names(&self) -> String {
        mark_names()
            .filter(|&name| self.inner.mark(name).is_some())
            .collect()
    }

    #[must_use]
    pub fn mark_offsets(&self) -> Vec<u32> {
        mark_names()
            .filter_map(|name| self.inner.mark(name).map(as_u32))
            .collect()
    }

    #[must_use]
    pub fn pending(&self) -> String {
        vici::render(self.inner.pending_keys())
    }

    #[must_use]
    pub fn last_change(&self) -> String {
        vici::render(self.inner.last_change())
    }

    #[must_use]
    pub fn recording(&self) -> Option<String> {
        self.inner.recording().map(|name| name.to_string())
    }
}

/// Run one fixture case and return a vici `editor_cases` snapshot block.
///
/// `viewport` is `"top,height"`. `indent` is `"shift,tab,tabs"` or
/// `"shift,tab,spaces"`. Either may be omitted.
///
/// # Errors
/// If settings cannot be parsed, or `keys` is not valid key notation.
#[wasm_bindgen]
pub fn run_case(
    name: &str,
    text: &str,
    keys: &str,
    viewport: Option<String>,
    indent: Option<String>,
) -> Result<String, JsError> {
    let settings = CaseSettings {
        viewport: viewport
            .as_deref()
            .map(parse_viewport)
            .transpose()
            .map_err(|error| JsError::new(&error))?,
        indent: indent
            .as_deref()
            .map(parse_indent)
            .transpose()
            .map_err(|error| JsError::new(&error))?,
    };
    run_case_inner(name, text, keys, settings).map_err(|error| JsError::new(&error.to_string()))
}

fn run_case_inner(
    name: &str,
    text: &str,
    keys: &str,
    settings: CaseSettings,
) -> Result<String, vici::ParseError> {
    let mut editor = Editor::from_text(text);
    if let Some(viewport) = settings.viewport {
        editor.set_viewport(viewport);
    }
    if let Some(indent) = settings.indent {
        editor.set_indent(indent);
    }
    let effects = editor.type_keys(keys)?;
    let mut snapshot = String::new();
    render::render_case(&mut snapshot, name, &editor, &effects);
    Ok(snapshot)
}

fn mark_names() -> impl Iterator<Item = char> {
    ('a'..='z').chain(['<', '>', '[', ']', '^'])
}

fn as_u32(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

fn mods_from_bits(bits: u8) -> Mods {
    let mut mods = Mods::NONE;
    if bits & 1 != 0 {
        mods = mods | Mods::CTRL;
    }
    if bits & 2 != 0 {
        mods = mods | Mods::ALT;
    }
    if bits & 4 != 0 {
        mods = mods | Mods::SHIFT;
    }
    mods
}

fn key_from_parts(code_type: &str, payload: &str, mods: u8) -> Result<Key, String> {
    let code = match code_type {
        "Char" => {
            let mut chars = payload.chars();
            let Some(ch) = chars.next() else {
                return Err("Char key needs a character".to_owned());
            };
            if chars.next().is_some() {
                return Err("Char key must be a single character".to_owned());
            }
            KeyCode::Char(ch)
        }
        "Esc" => KeyCode::Esc,
        "Enter" => KeyCode::Enter,
        "Tab" => KeyCode::Tab,
        "Backspace" => KeyCode::Backspace,
        "Delete" => KeyCode::Delete,
        "Insert" => KeyCode::Insert,
        "Left" => KeyCode::Left,
        "Right" => KeyCode::Right,
        "Up" => KeyCode::Up,
        "Down" => KeyCode::Down,
        "Home" => KeyCode::Home,
        "End" => KeyCode::End,
        "PageUp" => KeyCode::PageUp,
        "PageDown" => KeyCode::PageDown,
        "F" => {
            let n: u8 = payload
                .parse()
                .map_err(|_| format!("invalid function key {payload}"))?;
            KeyCode::F(n)
        }
        other => return Err(format!("unknown key code type {other}")),
    };
    Ok(Key::new(code, mods_from_bits(mods)))
}

fn parse_viewport(spec: &str) -> Result<Viewport, String> {
    let Some((top, height)) = spec.split_once(',') else {
        return Err(format!("viewport wants top,height, got {spec}"));
    };
    if height.contains(',') {
        return Err(format!("viewport wants top,height, got {spec}"));
    }
    Ok(Viewport {
        top_row: parse_usize(top, "viewport topRow")?,
        height: parse_usize(height, "viewport height")?,
    })
}

fn parse_indent(spec: &str) -> Result<Indent, String> {
    let mut parts = spec.split(',');
    let (Some(shift), Some(tab), Some(kind), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(format!("indent wants shift,tab,tabs|spaces, got {spec}"));
    };
    Ok(Indent {
        shift_width: parse_usize(shift, "indent shiftWidth")?,
        tab_width: parse_usize(tab, "indent tabWidth")?,
        use_tabs: match kind {
            "tabs" => true,
            "spaces" => false,
            other => return Err(format!("indent wants tabs or spaces, got {other}")),
        },
    })
}

fn parse_usize(value: &str, what: &str) -> Result<usize, String> {
    value
        .parse()
        .map_err(|_| format!("{what}: invalid number {value}"))
}

fn effects_json(effects: &[Effect]) -> String {
    let mut out = String::from("[");
    for (i, effect) in effects.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        write_effect_json(&mut out, effect);
    }
    out.push(']');
    out
}

fn write_effect_json(out: &mut String, effect: &Effect) {
    use std::fmt::Write;

    match effect {
        Effect::Edit(edit) => {
            write!(
                out,
                r#"{{"type":"Edit","edit":{{"startByte":{},"oldEndByte":{},"newEndByte":{},"startPoint":{{"row":{},"col":{}}},"oldEndPoint":{{"row":{},"col":{}}},"newEndPoint":{{"row":{},"col":{}}}}}}}"#,
                edit.start_byte,
                edit.old_end_byte,
                edit.new_end_byte,
                edit.start_point.row,
                edit.start_point.col,
                edit.old_end_point.row,
                edit.old_end_point.col,
                edit.new_end_point.row,
                edit.new_end_point.col,
            )
            .expect("writing to a String cannot fail");
        }
        Effect::ModeChanged(mode) => {
            write!(out, r#"{{"type":"ModeChanged","mode":"{mode:?}"}}"#)
                .expect("writing to a String cannot fail");
        }
        Effect::Scroll(scroll) => {
            write!(out, r#"{{"type":"Scroll","scroll":"{scroll:?}"}}"#)
                .expect("writing to a String cannot fail");
        }
        Effect::CommandPrompt => out.push_str(r#"{"type":"CommandPrompt"}"#),
        Effect::Bell => out.push_str(r#"{"type":"Bell"}"#),
        Effect::RecordingStarted(register) => {
            out.push_str(r#"{"type":"RecordingStarted","register":""#);
            push_json_string_body(out, &register.to_string());
            out.push_str("\"}");
        }
        Effect::RecordingStopped(register) => {
            out.push_str(r#"{"type":"RecordingStopped","register":""#);
            push_json_string_body(out, &register.to_string());
            out.push_str("\"}");
        }
    }
}

fn push_json_string_body(out: &mut String, value: &str) {
    use std::fmt::Write;

    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_ascii_control() => {
                write!(out, "\\u{:04x}", u32::from(c)).expect("writing to a String cannot fail");
            }
            c => out.push(c),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_change_word() {
        let mut editor = WasmEditor::new("select id, name\nfrom users");
        let effects = editor.type_keys("cwSELECT<Esc>").unwrap();
        assert!(editor.text().contains("SELECT"));
        assert_eq!(editor.text(), "SELECT id, name\nfrom users");
        assert_eq!(editor.mode(), "Normal");
        assert!(effects.contains("\"type\":\"Edit\""));
        assert!(effects.contains("\"type\":\"ModeChanged\""));
    }

    #[test]
    fn type_keys_parse_error() {
        let error = run_case_inner("bad", "", "<Nope>", CaseSettings::default()).unwrap_err();
        assert!(error.to_string().contains("unknown key name"));
        assert!(key_from_parts("Nope", "", 0).is_err());
        assert!(key_from_parts("Char", "", 0).is_err());
        assert!(key_from_parts("F", "nope", 0).is_err());
    }

    #[test]
    fn run_case_matches_vici_move_right_count() {
        let got = run_case_inner(
            "move-right-count",
            "select id, name\nfrom users\nwhere id = 1",
            "3l",
            CaseSettings::default(),
        )
        .unwrap();
        assert_eq!(
            got,
            "\
== move-right-count ==
text: \"select id, name\\nfrom users\\nwhere id = 1\"
cursor: 3 @ 0:3
mode: Normal; selection: -
register: char \"\"
history: undo=0 redo=0
jumps: []
marks: []
pending: \"\"; last-change: \"\"; recording: -
effects:

"
        );
    }

    #[test]
    fn run_case_matches_vici_viewport_half_page() {
        let got = run_case_inner(
            "viewport-half-page",
            "0\n1\n2\n3\n4\n5\n6\n7",
            "j<C-d>",
            CaseSettings {
                viewport: Some(Viewport {
                    top_row: 0,
                    height: 6,
                }),
                indent: None,
            },
        )
        .unwrap();
        assert_eq!(
            got,
            "\
== viewport-half-page ==
text: \"0\\n1\\n2\\n3\\n4\\n5\\n6\\n7\"
cursor: 8 @ 4:0
mode: Normal; selection: -
register: char \"\"
history: undo=0 redo=0
jumps: [2]
marks: []
pending: \"\"; last-change: \"\"; recording: -
effects:
  scroll HalfPageDown

"
        );
    }

    #[test]
    fn effects_json_matches_contract_shape() {
        let mut editor = Editor::from_text("select id, name\nfrom users\nwhere id = 1");
        let effects = editor.type_keys("dw").unwrap();
        assert_eq!(
            effects_json(&effects),
            r#"[{"type":"Edit","edit":{"startByte":0,"oldEndByte":7,"newEndByte":0,"startPoint":{"row":0,"col":0},"oldEndPoint":{"row":0,"col":7},"newEndPoint":{"row":0,"col":0}}}]"#
        );
    }

    #[test]
    fn handle_key_char_matches_type_keys() {
        let mut via_script = WasmEditor::new("ab");
        let mut via_key = WasmEditor::new("ab");
        let from_script = via_script.type_keys("x").unwrap();
        let from_key = via_key.handle_key("Char", "x", 0).unwrap();
        assert_eq!(from_script, from_key);
        assert_eq!(via_script.text(), via_key.text());
        assert_eq!(via_script.text(), "b");
    }
}
