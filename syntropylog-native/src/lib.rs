use chrono::{MappedLocalTime, TimeZone, Utc};
use napi::{JsBoolean, JsNumber, JsObject, JsString, JsUnknown, NapiRaw, ValueType};
use napi_derive::napi;
use once_cell::sync::OnceCell;
use regex::Regex;
use serde::Deserialize;
use serde_json::{Number, Value};
use std::collections::HashSet;

const REDACTED: &str = "[REDACTED]";
const MAX_DEPTH_PLACEHOLDER: &str = "[MAX_DEPTH]";
const FALLBACK_ERROR_PREFIX: &str = "[SYNTROPYLOG_NATIVE_ERROR]";
const MAX_KEYS_PER_OBJECT: u32 = 500;
const MAX_ARRAY_LENGTH: u32 = 1000;
/// Mirrors DEFAULT_VALUES.maskDefaultCapLength in src/constants.ts (keep in sync).
const MASK_DEFAULT_CAP_LENGTH: usize = 8;

/// ANSI escape sequences (colors, cursor, etc.) — same logic as JS SanitizationEngine for log injection safety.
static ANSI_REGEX: OnceCell<Regex> = OnceCell::new();

fn ansi_regex() -> &'static Regex {
    ANSI_REGEX.get_or_init(|| {
        // Matches ESC [...], CSI (0x9b), and common ANSI sequences; equivalent to JS no-control-regex pattern.
        // Inner [ is literal (escape in Rust to avoid unclosed character class).
        Regex::new(r"[\x1b\x9b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]").unwrap()
    })
}

/// Strip ANSI escape codes from a string (log injection safety).
fn strip_ansi(s: &str) -> String {
    ansi_regex().replace_all(s, "").into_owned()
}

// ─── Declarative masking primitive ────────────────────────────────────────────
// ONE parameterized masker, mirrored byte-for-byte by applyMask() in
// src/masking/maskSpec.ts. A shared fixture (tests/mask-parity-cases.json) is
// asserted from BOTH languages, so adding a strategy is data, never code.

fn default_mask_char() -> String {
    "*".to_string()
}
fn default_preserve_length() -> bool {
    true
}

/// A masking instruction expressed as data. Built-in strategies (email, card, …)
/// are just presets that expand to one of these on the JS side before crossing.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct MaskSpec {
    /// Replace the whole value with [REDACTED] (credentials). Wins over everything else.
    #[serde(default)]
    redact: bool,
    /// Keep the first N units (chars, or digits when scope = "digits").
    #[serde(default)]
    unmask_start: usize,
    /// Keep the last N units.
    #[serde(default)]
    unmask_end: usize,
    /// "digits" → only mask digit characters (separators kept); otherwise mask all chars.
    #[serde(default)]
    scope: Option<String>,
    /// Keep everything from the first occurrence of this delimiter onward (e.g. an email domain).
    #[serde(default)]
    keep_after: Option<String>,
    #[serde(default = "default_mask_char")]
    mask_char: String,
    #[serde(default = "default_preserve_length")]
    preserve_length: bool,
}

/// Mask all characters of `s` except the first `start` and last `end`.
/// When `preserve_length` is false the masked run is capped (does not reveal exact length).
fn mask_chars(s: &str, start: usize, end: usize, mask_char: &str, preserve_length: bool) -> String {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let keep_start = start.min(n);
    let keep_end = end.min(n - keep_start);
    let masked_count = n - keep_start - keep_end;
    let body_len = if preserve_length {
        masked_count
    } else {
        masked_count.min(MASK_DEFAULT_CAP_LENGTH)
    };
    let prefix: String = chars[..keep_start].iter().collect();
    let suffix: String = chars[n - keep_end..].iter().collect();
    format!("{}{}{}", prefix, mask_char.repeat(body_len), suffix)
}

/// Mask only the digit characters of `s` except the first `start` and last `end` digits,
/// preserving every non-digit (separators, '+', spaces). Always length-preserving.
fn mask_digits(s: &str, start: usize, end: usize, mask_char: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let digit_positions: Vec<usize> = chars
        .iter()
        .enumerate()
        .filter(|(_, c)| c.is_ascii_digit())
        .map(|(i, _)| i)
        .collect();
    let d = digit_positions.len();
    let keep_start = start.min(d);
    let keep_end = end.min(d - keep_start);
    let masked: HashSet<usize> = digit_positions[keep_start..d - keep_end]
        .iter()
        .copied()
        .collect();
    chars
        .iter()
        .enumerate()
        .map(|(i, c)| {
            if masked.contains(&i) {
                mask_char.to_string()
            } else {
                c.to_string()
            }
        })
        .collect()
}

/// Apply a declarative mask spec to a string. Guard clauses, pure.
fn apply_mask(value: &str, spec: &MaskSpec) -> String {
    if spec.redact {
        return REDACTED.to_string();
    }

    let (head, tail) = split_kept_tail(value, spec.keep_after.as_deref());

    let masked = if spec.scope.as_deref() == Some("digits") {
        mask_digits(head, spec.unmask_start, spec.unmask_end, &spec.mask_char)
    } else {
        mask_chars(
            head,
            spec.unmask_start,
            spec.unmask_end,
            &spec.mask_char,
            spec.preserve_length,
        )
    };

    format!("{}{}", masked, tail)
}

/// Split `value` into the head to mask and the verbatim tail kept from `delim` onward.
fn split_kept_tail<'a>(value: &'a str, delim: Option<&str>) -> (&'a str, &'a str) {
    let Some(delim) = delim else {
        return (value, "");
    };
    match value.find(delim) {
        Some(idx) => value.split_at(idx),
        None => (value, ""),
    }
}

// ─── Config ─────────────────────────────────────────────────────────────────

/// One masking rule as sent from JS: a regex matched against the KEY name + the
/// resolved spec to apply to the matched value.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MaskRuleConfig {
    /// Regex source (matched against the field key).
    pattern: String,
    /// Regex flags from JS (e.g. "i"); only the linear subset is honored in native.
    #[serde(default)]
    flags: String,
    /// The declarative mask to apply when the key matches.
    #[serde(default)]
    spec: MaskSpec,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FastSerializeConfig {
    #[serde(default)]
    sensitive_fields: Vec<String>,
    #[serde(default)]
    redact_patterns: Vec<String>,
    #[serde(default)]
    masking_rules: Vec<MaskRuleConfig>,
    #[serde(default = "default_max_depth")]
    max_depth: u32,
    #[serde(default = "default_max_string_length")]
    max_string_length: usize,
    #[serde(default = "default_sanitize")]
    sanitize: bool,
}

fn default_max_depth() -> u32 {
    10
}
fn default_max_string_length() -> usize {
    300
}
fn default_sanitize() -> bool {
    true
}

/// A masking rule compiled for native use.
struct CompiledRule {
    re: Regex,
    spec: MaskSpec,
}

struct CompiledConfig {
    config: FastSerializeConfig,
    redact_patterns: Vec<Regex>,
    sensitive_set: HashSet<String>,
    masking_rules: Vec<CompiledRule>,
    /// Raw config JSON, kept verbatim to compare instances (see `configure_native`): the
    /// global `OnceCell` can hold only one config, so a second instance whose config differs
    /// must be told native is unavailable for it (return `false` → JS fallback), never
    /// silently masked with the first instance's rules.
    raw_json: String,
}

static NATIVE_CONFIG: OnceCell<CompiledConfig> = OnceCell::new();

/// Returns `true` when the config is VALID **and** native can serve THIS caller, `false`
/// otherwise. `false` cases (the JS caller MUST then fall back to the JS pipeline):
///   1. unparseable JSON, or a masking rule / redact pattern whose regex we cannot compile
///      — a rule we cannot honor must never silently let data through; and
///   2. a *different* config is already installed in the process-global `OnceCell`. The
///      native engine holds exactly one config; a second SyntropyLog instance
///      (`createSyntropyLog`) whose masking rules differ CANNOT be served natively without
///      masking its data with the first instance's rules — a cross-tenant PII leak. So we
///      report `false` and let that instance mask correctly in JS.
/// An identical config (same rules, e.g. the singleton re-initialized, or two instances
/// configured the same) returns `true` — sharing the one global config is safe then.
///
/// NOTE: this is the interim guard. The real fix is a per-instance native config (a napi
/// object owning its own `CompiledConfig`) so a divergent second instance keeps native too.
#[napi]
pub fn configure_native(config_json: String) -> bool {
    // If a config is already installed, the only safe answer is exact-match: same config →
    // usable; different config → not usable for this caller (fall back to JS). Do this BEFORE
    // compiling so a divergent caller pays nothing.
    if let Some(existing) = NATIVE_CONFIG.get() {
        return existing.raw_json == config_json;
    }

    let config: FastSerializeConfig = match serde_json::from_str(&config_json) {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Compile strictly: a single un-compilable pattern rejects the whole config.
    let Some(redact_patterns) = compile_redact_patterns(&config.redact_patterns) else {
        return false;
    };
    let Some(masking_rules) = compile_masking_rules(&config.masking_rules) else {
        return false;
    };

    let sensitive_set: HashSet<String> = config
        .sensitive_fields
        .iter()
        .map(|s| s.to_lowercase())
        .collect();

    let compiled = CompiledConfig {
        config,
        redact_patterns,
        sensitive_set,
        masking_rules,
        raw_json: config_json.clone(),
    };

    // First writer wins. If we lost a race, fall back to the exact-match rule so the
    // late writer is served only if its config is identical.
    match NATIVE_CONFIG.set(compiled) {
        Ok(()) => true,
        Err(_) => NATIVE_CONFIG
            .get()
            .map_or(false, |existing| existing.raw_json == config_json),
    }
}

/// Compile every redact pattern, or `None` if any one cannot be compiled (never drop silently).
fn compile_redact_patterns(sources: &[String]) -> Option<Vec<Regex>> {
    sources.iter().map(|s| Regex::new(s).ok()).collect()
}

/// Translate JS regex flags into the inline-flag prefix understood by the `regex` crate.
fn inline_flags(flags: &str) -> String {
    ['i', 'm', 's']
        .iter()
        .filter(|f| flags.contains(**f))
        .map(|f| format!("(?{})", f))
        .collect()
}

fn compile_rule(rule: &MaskRuleConfig) -> Option<CompiledRule> {
    let source = format!("{}{}", inline_flags(&rule.flags), rule.pattern);
    Regex::new(&source).ok().map(|re| CompiledRule {
        re,
        spec: rule.spec.clone(),
    })
}

/// Compile JS-sent masking rules, or `None` if ANY rule's pattern cannot be compiled
/// (e.g. it uses lookahead/backrefs, unsupported by the linear `regex` crate). Returning
/// `None` makes the caller fall back to the JS engine instead of silently skipping the
/// rule and leaking the data it was meant to mask. Order is preserved: first match wins.
fn compile_masking_rules(rules: &[MaskRuleConfig]) -> Option<Vec<CompiledRule>> {
    rules.iter().map(compile_rule).collect()
}

fn apply_redact_patterns(s: &str, patterns: &[Regex]) -> String {
    let mut out = s.to_string();
    for re in patterns {
        out = re.replace_all(&out, REDACTED).to_string();
    }
    out
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        return s.to_string();
    }
    // Slice by BYTE index would panic when the cut lands inside a multi-byte UTF-8
    // char (e.g. accented/CJK/emoji text). Walk the cut down to the nearest char
    // boundary (≤ 3 bytes back) so the result is always valid UTF-8 — never panics.
    let mut end = max_len.saturating_sub(3);
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &s[..end])
}

fn is_sensitive_key(key: &str, sensitive_fields_lower: &HashSet<String>) -> bool {
    let lower = key.to_lowercase();
    sensitive_fields_lower
        .iter()
        .any(|f| lower.contains(f.as_str()))
}

/// First masking rule whose key-pattern matches `key` (order preserved → first wins).
fn match_rule<'a>(key: &str, rules: &'a [CompiledRule]) -> Option<&'a CompiledRule> {
    rules.iter().find(|r| r.re.is_match(key))
}

/// What to do with the value under a given key. Both serialization paths (parsed
/// `Value` and live `JsUnknown`) resolve the policy through `resolve_key_action`,
/// so the masking decision is defined exactly once.
enum KeyAction<'a> {
    /// Apply this rule's spec to the value (partial mask or full redaction).
    Mask(&'a CompiledRule),
    /// Redact the whole value (legacy `sensitiveFields` match).
    Redact,
    /// Not sensitive: descend into the value as usual.
    Recurse,
}

/// Pure key policy, with guard clauses ordered by precedence:
///   matching rule → mask · sanitize off → recurse · legacy sensitive key → redact · otherwise recurse.
///
/// An explicit masking rule is an explicit instruction and is honored UNCONDITIONALLY —
/// the `sanitize` master switch must never silently drop it (that footgun leaked PII when a
/// caller turned off the built-in defaults but re-added rules). `sanitize` gates only the
/// legacy `sensitive_set` net, which has no per-rule spec of its own.
fn resolve_key_action<'a>(
    key: &str,
    sanitize: bool,
    rules: &'a [CompiledRule],
    sensitive_set: &HashSet<String>,
) -> KeyAction<'a> {
    if let Some(rule) = match_rule(key, rules) {
        return KeyAction::Mask(rule);
    }
    if sanitize && is_sensitive_key(key, sensitive_set) {
        return KeyAction::Redact;
    }
    KeyAction::Recurse
}

/// Mask the value found under a matched key.
/// String values get the spec (partial mask or redact); any non-string value
/// (object, array, number, bool) is redacted whole — this prevents nested PII from
/// leaking under a sensitive-named parent and matches the JS canonical behavior.
fn mask_matched_value(value: &Value, rule: &CompiledRule) -> Value {
    let Value::String(s) = value else {
        return Value::String(REDACTED.to_string());
    };
    Value::String(apply_mask(&strip_ansi(s), &rule.spec))
}

/// `mask_matched_value` for the live N-API path: read the child only when it is a
/// string; any other type is redacted whole (no recursion → no nested leak).
fn mask_matched_js_value(child: JsUnknown, rule: &CompiledRule) -> napi::Result<Value> {
    if child.get_type()? != ValueType::String {
        return Ok(Value::String(REDACTED.to_string()));
    }
    let s = unsafe { child.cast::<JsString>() };
    let raw = s.into_utf8()?.into_owned()?;
    Ok(Value::String(apply_mask(&strip_ansi(&raw), &rule.spec)))
}

/// Process a string in one place: strip ANSI, truncate, apply redact patterns (single-pass pipeline).
fn process_string(s: &str, config: &FastSerializeConfig, redact_patterns: &[Regex]) -> String {
    let out = strip_ansi(s);
    let out = truncate(&out, config.max_string_length);
    if config.sanitize && !redact_patterns.is_empty() {
        apply_redact_patterns(&out, redact_patterns)
    } else {
        out
    }
}

/// Truncate a Value: limit object keys and array length (parity with js_unknown_to_value when parsing from JSON).
fn truncate_value(v: &Value, max_keys: u32, max_array_len: u32) -> Value {
    match v {
        Value::Object(m) => {
            let limit = max_keys as usize;
            let mut out: serde_json::Map<String, Value> = m
                .iter()
                .take(limit)
                .map(|(k, val)| (k.clone(), truncate_value(val, max_keys, max_array_len)))
                .collect();
            if m.len() > limit {
                out.insert(
                    "_truncated".to_string(),
                    Value::String(format!("{} keys omitted", m.len() - limit)),
                );
            }
            Value::Object(out)
        }
        Value::Array(arr) => {
            let to_take = arr.len().min(max_array_len as usize);
            let mut result: Vec<Value> = arr
                .iter()
                .take(to_take)
                .map(|item| truncate_value(item, max_keys, max_array_len))
                .collect();
            if arr.len() > max_array_len as usize {
                result.push(Value::String(format!(
                    "[{} items omitted]",
                    arr.len().saturating_sub(max_array_len as usize)
                )));
            }
            Value::Array(result)
        }
        other => other.clone(),
    }
}

/// Immutable masking context threaded through the whole traversal. Bundles the
/// compiled config refs so the recursive walkers stay 2–3 parameters instead of 7.
struct MaskCtx<'a> {
    config: &'a FastSerializeConfig,
    sensitive_set: &'a HashSet<String>,
    redact_patterns: &'a [Regex],
    masking_rules: &'a [CompiledRule],
}

/// Empty sensitive-key set for the raw context (no per-key redaction).
fn empty_sensitive_set() -> &'static HashSet<String> {
    static EMPTY: OnceCell<HashSet<String>> = OnceCell::new();
    EMPTY.get_or_init(HashSet::new)
}

impl<'a> MaskCtx<'a> {
    fn from_compiled(c: &'a CompiledConfig) -> Self {
        Self {
            config: &c.config,
            sensitive_set: &c.sensitive_set,
            redact_patterns: &c.redact_patterns,
            masking_rules: &c.masking_rules,
        }
    }

    /// Context for the **unmasked** output: same hygiene as the masked one — ANSI strip,
    /// string truncation, depth limit, key/array caps — with masking, per-key redaction and
    /// redact patterns switched off. It is the audit truth, not a bypass of the sanitizer:
    /// log-injection defenses still apply, only the *obfuscation* is dropped.
    ///
    /// Only ever reachable for transports the application declared exempt by configuration
    /// (`masking.exemptTransports`); the JS side never hands this line to any other transport.
    fn raw_from_compiled(c: &'a CompiledConfig) -> Self {
        Self {
            config: &c.config,
            sensitive_set: empty_sensitive_set(),
            redact_patterns: &[],
            masking_rules: &[],
        }
    }

    fn process_string(&self, s: &str) -> String {
        process_string(s, self.config, self.redact_patterns)
    }

    fn key_action(&self, key: &str) -> KeyAction<'_> {
        resolve_key_action(key, self.config.sanitize, self.masking_rules, self.sensitive_set)
    }
}

/// Apply masking to an already-parsed Value (for the JSON-string path: one N-API crossing).
fn mask_value(v: &Value, ctx: &MaskCtx, depth: u32) -> Value {
    if depth > ctx.config.max_depth {
        return Value::String(MAX_DEPTH_PLACEHOLDER.to_string());
    }
    let next_depth = depth + 1;
    match v {
        Value::Null => Value::Null,
        Value::Bool(b) => Value::Bool(*b),
        Value::Number(n) => Value::Number(n.clone()),
        Value::String(s) => Value::String(ctx.process_string(s)),
        Value::Array(arr) => {
            Value::Array(arr.iter().map(|item| mask_value(item, ctx, next_depth)).collect())
        }
        Value::Object(m) => {
            let masked: serde_json::Map<String, Value> = m
                .iter()
                .map(|(k, val)| {
                    let masked_val = match ctx.key_action(k) {
                        KeyAction::Mask(rule) => mask_matched_value(val, rule),
                        KeyAction::Redact => Value::String(REDACTED.to_string()),
                        KeyAction::Recurse => mask_value(val, ctx, next_depth),
                    };
                    (k.clone(), masked_val)
                })
                .collect();
            Value::Object(masked)
        }
    }
}

/// Single-pass: convert a live JS value to a masked `Value`, dispatching by type.
/// Orchestrator only — each node kind has its own focused builder below.
fn js_unknown_to_value_masked(
    unknown: JsUnknown,
    depth: u32,
    seen: &mut HashSet<usize>,
    ctx: &MaskCtx,
) -> napi::Result<Value> {
    if depth > ctx.config.max_depth {
        return Ok(Value::String(MAX_DEPTH_PLACEHOLDER.to_string()));
    }
    match unknown.get_type()? {
        ValueType::Null | ValueType::Undefined => Ok(Value::Null),
        ValueType::Boolean => Ok(Value::Bool(unsafe { unknown.cast::<JsBoolean>() }.get_value()?)),
        ValueType::Number => js_number_to_value(unknown),
        ValueType::String => js_string_to_value(unknown, ctx),
        ValueType::Object => js_object_like_to_value(unknown, depth, seen, ctx),
        ValueType::Function | ValueType::External | ValueType::Symbol => {
            Ok(Value::String("[Unsupported]".to_string()))
        }
        _ => Ok(Value::Null),
    }
}

fn js_number_to_value(unknown: JsUnknown) -> napi::Result<Value> {
    let f = unsafe { unknown.cast::<JsNumber>() }.get_double()?;
    Ok(Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null))
}

/// A string here always belongs to a non-matched key or an array element (matched keys
/// are handled inline in js_object_to_value); it only needs content sanitization.
fn js_string_to_value(unknown: JsUnknown, ctx: &MaskCtx) -> napi::Result<Value> {
    let raw = unsafe { unknown.cast::<JsString>() }.into_utf8()?.into_owned()?;
    Ok(Value::String(ctx.process_string(&raw)))
}

/// Objects, arrays and errors, with circular-reference protection around the recursion.
fn js_object_like_to_value(
    unknown: JsUnknown,
    depth: u32,
    seen: &mut HashSet<usize>,
    ctx: &MaskCtx,
) -> napi::Result<Value> {
    let ptr = unsafe { NapiRaw::raw(&unknown) as *const () as usize };
    if seen.contains(&ptr) {
        return Ok(Value::String("[Circular]".to_string()));
    }
    seen.insert(ptr);

    let obj = unknown.coerce_to_object()?;
    let next_depth = depth + 1;
    let out = if obj.is_error()? {
        js_error_to_value(&obj, ctx)?
    } else if obj.is_array()? {
        js_array_to_value(&obj, next_depth, seen, ctx)?
    } else {
        js_object_to_value(&obj, next_depth, seen, ctx)?
    };

    seen.remove(&ptr);
    Ok(out)
}

/// Errors carry only their safe string fields (name/message/stack), content-sanitized.
fn js_error_to_value(obj: &JsObject, ctx: &MaskCtx) -> napi::Result<Value> {
    let mut m = serde_json::Map::new();
    for field in ["name", "message", "stack"] {
        if let Ok(js_val) = obj.get_named_property::<JsString>(field) {
            let raw = js_val.into_utf8()?.into_owned()?;
            m.insert(field.into(), Value::String(ctx.process_string(&raw)));
        }
    }
    Ok(Value::Object(m))
}

fn js_array_to_value(
    obj: &JsObject,
    depth: u32,
    seen: &mut HashSet<usize>,
    ctx: &MaskCtx,
) -> napi::Result<Value> {
    let len = obj.get_array_length_unchecked()?;
    let to_take = len.min(MAX_ARRAY_LENGTH);
    let mut arr = Vec::with_capacity(to_take as usize);
    for i in 0..to_take {
        let child: JsUnknown = obj.get_element(i)?;
        arr.push(js_unknown_to_value_masked(child, depth, seen, ctx)?);
    }
    if len > MAX_ARRAY_LENGTH {
        arr.push(Value::String(format!("[{} items omitted]", len - MAX_ARRAY_LENGTH)));
    }
    Ok(Value::Array(arr))
}

/// Plain object: apply the shared key policy per entry (mask / redact / recurse).
fn js_object_to_value(
    obj: &JsObject,
    depth: u32,
    seen: &mut HashSet<usize>,
    ctx: &MaskCtx,
) -> napi::Result<Value> {
    let keys = obj.get_property_names()?;
    let key_len = keys.get_array_length_unchecked()?;
    let to_take = key_len.min(MAX_KEYS_PER_OBJECT);
    let mut m = serde_json::Map::new();
    for i in 0..to_take {
        let key_js: JsString = keys.get_element(i)?;
        let key = key_js.into_utf8()?.into_owned()?;
        let child: JsUnknown = obj.get_named_property(&key)?;
        let masked_val = match ctx.key_action(&key) {
            KeyAction::Mask(rule) => mask_matched_js_value(child, rule)?,
            KeyAction::Redact => Value::String(REDACTED.to_string()),
            KeyAction::Recurse => js_unknown_to_value_masked(child, depth, seen, ctx)?,
        };
        m.insert(key, masked_val);
    }
    if key_len > MAX_KEYS_PER_OBJECT {
        m.insert(
            "_truncated".to_string(),
            Value::String(format!("{} keys omitted", key_len - MAX_KEYS_PER_OBJECT)),
        );
    }
    Ok(Value::Object(m))
}

/// Empty fallback config used when configure_native was never called.
fn default_config() -> &'static CompiledConfig {
    static DEFAULT_CONFIG: OnceCell<CompiledConfig> = OnceCell::new();
    DEFAULT_CONFIG.get_or_init(|| CompiledConfig {
        config: FastSerializeConfig::default(),
        redact_patterns: Vec::new(),
        sensitive_set: HashSet::new(),
        masking_rules: Vec::new(),
        raw_json: String::new(),
    })
}

/// The active compiled config: the one set via configure_native, or the empty default.
fn active_config() -> &'static CompiledConfig {
    NATIVE_CONFIG.get().unwrap_or_else(default_config)
}

/// Assemble the final log line from the masked metadata plus the reserved fields.
/// Pure: level/message/service/timestamp are inserted as-is (hot path), metadata
/// keys are merged but never override a reserved field.
fn build_log_line(
    level: String,
    message: String,
    timestamp: f64,
    service: String,
    masked_metadata: Value,
) -> String {
    let mut map = serde_json::Map::new();
    map.insert("level".into(), Value::String(level));
    map.insert("message".into(), Value::String(message));
    map.insert("service".into(), Value::String(service));

    if let MappedLocalTime::Single(dt) = Utc.timestamp_millis_opt(timestamp as i64) {
        map.insert("timestamp".into(), Value::String(dt.to_rfc3339()));
    } else {
        map.insert(
            "timestamp".into(),
            Value::Number(Number::from_f64(timestamp).unwrap_or(Number::from(0))),
        );
    }

    match masked_metadata {
        Value::Object(m_map) => {
            for (k, v) in m_map {
                if k != "level" && k != "message" && k != "timestamp" && k != "service" {
                    map.insert(k, v);
                }
            }
        }
        other if !other.is_null() => {
            map.insert("metadata".into(), other);
        }
        _ => {}
    }

    match serde_json::to_string(&Value::Object(map)) {
        Ok(s) => s,
        Err(_) => format!("{}: serialize error", FALLBACK_ERROR_PREFIX),
    }
}

#[napi]
pub fn fast_serialize(
    level: String,
    message: String,
    timestamp: f64,
    service: String,
    metadata: napi::JsUnknown,
) -> String {
    let ctx = MaskCtx::from_compiled(active_config());

    // Level, message, service: inserted as-is by build_log_line (no strip/truncate/redact) to
    // avoid hot-path overhead. ANSI strip + sanitization still apply to every string inside metadata.
    let masked_metadata = match metadata.get_type() {
        Ok(ValueType::Null) | Ok(ValueType::Undefined) => Value::Null,
        _ => {
            let mut seen = HashSet::new();
            js_unknown_to_value_masked(metadata, 0, &mut seen, &ctx).unwrap_or(Value::Null)
        }
    };

    build_log_line(level, message, timestamp, service, masked_metadata)
}

/// Same as fast_serialize but metadata is passed as a JSON string (one N-API crossing).
/// Use when JS can safely JSON.stringify(metadata) (no circular refs). On parse error returns error-prefix string.
#[napi]
pub fn fast_serialize_from_json(
    level: String,
    message: String,
    timestamp: f64,
    service: String,
    metadata_json: String,
) -> String {
    let ctx = MaskCtx::from_compiled(active_config());

    let trimmed = metadata_json.trim();
    let parsed: Value = if trimmed.is_empty() || trimmed == "null" {
        Value::Null
    } else {
        match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => return format!("{}: invalid metadata json", FALLBACK_ERROR_PREFIX),
        }
    };

    let truncated = truncate_value(&parsed, MAX_KEYS_PER_OBJECT, MAX_ARRAY_LENGTH);
    let masked_metadata = mask_value(&truncated, &ctx, 0);

    build_log_line(level, message, timestamp, service, masked_metadata)
}

/// The two renderings of one log entry, produced from a single parse + truncate pass.
#[napi(object)]
pub struct DualLine {
    /// The masked line — byte-identical to what `fast_serialize_from_json` returns.
    pub masked: String,
    /// The unmasked line, for transports declared exempt in `masking.exemptTransports`.
    /// Same hygiene (ANSI strip, truncation, caps); no masking or redaction.
    pub raw: String,
}

/// Both renderings in ONE pass, for the case where the effective transport set contains
/// masked *and* exempt transports (an audit journal alongside console/APM).
///
/// The expensive work — the N-API crossing, `from_str` and `truncate_value` — happens once;
/// only the two pure masking passes and the two `build_log_line` differ. Apps without exempt
/// transports keep calling `fast_serialize_from_json` and pay nothing for this.
#[napi]
pub fn fast_serialize_from_json_dual(
    level: String,
    message: String,
    timestamp: f64,
    service: String,
    metadata_json: String,
) -> DualLine {
    let compiled = active_config();
    let ctx = MaskCtx::from_compiled(compiled);
    let raw_ctx = MaskCtx::raw_from_compiled(compiled);

    let trimmed = metadata_json.trim();
    let parsed: Value = if trimmed.is_empty() || trimmed == "null" {
        Value::Null
    } else {
        match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => {
                let err = format!("{}: invalid metadata json", FALLBACK_ERROR_PREFIX);
                return DualLine { masked: err.clone(), raw: err };
            }
        }
    };

    let truncated = truncate_value(&parsed, MAX_KEYS_PER_OBJECT, MAX_ARRAY_LENGTH);

    DualLine {
        masked: build_log_line(
            level.clone(),
            message.clone(),
            timestamp,
            service.clone(),
            mask_value(&truncated, &ctx, 0),
        ),
        raw: build_log_line(
            level,
            message,
            timestamp,
            service,
            mask_value(&truncated, &raw_ctx, 0),
        ),
    }
}

#[napi]
pub fn ping() -> String {
    "pong".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rule_cfg(pattern: &str, spec: MaskSpec) -> MaskRuleConfig {
        MaskRuleConfig {
            pattern: pattern.to_string(),
            flags: "i".to_string(),
            spec,
        }
    }

    fn spec(json_spec: serde_json::Value) -> MaskSpec {
        serde_json::from_value(json_spec).unwrap()
    }

    fn test_config() -> FastSerializeConfig {
        FastSerializeConfig {
            sensitive_fields: Vec::new(),
            redact_patterns: Vec::new(),
            masking_rules: Vec::new(),
            max_depth: 10,
            max_string_length: 300,
            sanitize: true,
        }
    }

    // ── string sanitization ───────────────────────────────────────────────
    #[test]
    fn strip_ansi_removes_escape_sequences() {
        assert_eq!(strip_ansi("hello"), "hello");
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m"), "red");
        assert_eq!(strip_ansi("\x1b[32mgreen\x1b[0m text"), "green text");
    }

    // ── the single declarative primitive ───────────────────────────────────
    #[test]
    fn shared_parity_fixture_matches() {
        // The SAME fixture is asserted from JS (tests/maskSpec.parity.test.ts).
        // Both engines passing it === byte-for-byte parity.
        #[derive(Deserialize)]
        struct Case {
            value: String,
            spec: MaskSpec,
            expected: String,
        }
        let raw = include_str!("../tests/mask-parity-cases.json");
        let cases: Vec<Case> = serde_json::from_str(raw).expect("valid fixture");
        assert!(cases.len() >= 10, "fixture should be meaningful");
        for c in cases {
            assert_eq!(apply_mask(&c.value, &c.spec), c.expected, "value={}", c.value);
        }
    }

    #[test]
    fn redact_wins_over_everything() {
        assert_eq!(apply_mask("hunter2", &spec(json!({ "redact": true }))), "[REDACTED]");
    }

    #[test]
    fn inline_flags_maps_supported_js_flags_only() {
        assert_eq!(inline_flags("i"), "(?i)");
        assert_eq!(inline_flags("gim"), "(?i)(?m)");
        assert_eq!(inline_flags("g"), "");
    }

    // ── key policy (shared by both serialization paths) ────────────────────
    #[test]
    fn resolve_key_action_precedence() {
        let rules =
            compile_masking_rules(&[rule_cfg("email", spec(json!({ "unmaskStart": 1, "keepAfter": "@" })))])
                .unwrap();
        let mut sensitive = HashSet::new();
        sensitive.insert("password".to_string());

        assert!(matches!(resolve_key_action("email", true, &rules, &sensitive), KeyAction::Mask(_)));
        assert!(matches!(resolve_key_action("password", true, &rules, &sensitive), KeyAction::Redact));
        assert!(matches!(resolve_key_action("plain", true, &rules, &sensitive), KeyAction::Recurse));

        // Failsafe: an explicit masking rule is honored even with sanitize OFF — the master
        // switch must never silently drop it. The legacy sensitive_set net stays gated.
        assert!(matches!(resolve_key_action("email", false, &rules, &sensitive), KeyAction::Mask(_)));
        assert!(matches!(resolve_key_action("password", false, &rules, &sensitive), KeyAction::Recurse));
    }

    #[test]
    fn match_rule_first_match_wins() {
        let rules = compile_masking_rules(&[
            rule_cfg("ema", spec(json!({ "redact": true }))),
            rule_cfg("email", spec(json!({ "unmaskStart": 1 }))),
        ])
        .unwrap();
        let matched = match_rule("email", &rules).unwrap();
        assert!(matched.spec.redact); // first rule wins, like JS
    }

    #[test]
    fn matched_non_string_value_is_redacted_whole() {
        let rule = compile_rule(&rule_cfg("x", spec(json!({ "unmaskStart": 1, "keepAfter": "@" })))).unwrap();
        assert_eq!(mask_matched_value(&json!({ "nested": "x" }), &rule), json!("[REDACTED]"));
        assert_eq!(mask_matched_value(&json!([1, 2]), &rule), json!("[REDACTED]"));
        assert_eq!(mask_matched_value(&json!("a@b.com"), &rule), json!("a@b.com"));
    }

    // ── end-to-end mask_value (the JSON path) ──────────────────────────────
    #[test]
    fn mask_value_applies_rules_recursively() {
        let cfg = test_config();
        let rules = compile_masking_rules(&[
            rule_cfg("email", spec(json!({ "unmaskStart": 1, "keepAfter": "@" }))),
            rule_cfg("password", spec(json!({ "redact": true }))),
            rule_cfg("ssn", spec(json!({ "scope": "digits", "unmaskEnd": 4 }))),
        ])
        .unwrap();
        let sensitive = HashSet::new();
        let input = json!({
            "email": "john@example.com",
            "password": "hunter2",
            "user": { "ssn": "123-45-6789", "name": "Alice" },
            "tags": ["a@b.com"]
        });

        let ctx = MaskCtx {
            config: &cfg,
            sensitive_set: &sensitive,
            redact_patterns: &[],
            masking_rules: &rules,
        };
        let out = mask_value(&input, &ctx, 0);

        assert_eq!(
            out,
            json!({
                "email": "j***@example.com",
                "password": "[REDACTED]",
                "user": { "ssn": "***-**-6789", "name": "Alice" },
                "tags": ["a@b.com"]
            })
        );
    }

    #[test]
    fn mask_value_redacts_nested_object_under_sensitive_key() {
        let cfg = test_config();
        let mut sensitive = HashSet::new();
        sensitive.insert("credential".to_string());
        let input = json!({ "credentials": { "user": "admin", "pass": "x" } });

        let ctx = MaskCtx {
            config: &cfg,
            sensitive_set: &sensitive,
            redact_patterns: &[],
            masking_rules: &[],
        };
        let out = mask_value(&input, &ctx, 0);
        assert_eq!(out, json!({ "credentials": "[REDACTED]" }));
    }

    // ── strict compilation: never drop a rule silently ─────────────────────
    #[test]
    fn unsupported_regex_rejects_the_whole_config() {
        let rules = vec![rule_cfg("(?=secret)", spec(json!({ "redact": true })))];
        assert!(compile_masking_rules(&rules).is_none());
        assert!(compile_redact_patterns(&["(?=lookahead)".to_string()]).is_none());
    }

    #[test]
    fn supported_regexes_compile() {
        let rules = vec![rule_cfg("email|mail", spec(json!({ "unmaskStart": 1 })))];
        assert_eq!(compile_masking_rules(&rules).unwrap().len(), 1);
        assert_eq!(compile_redact_patterns(&["password=\\w+".to_string()]).unwrap().len(), 1);
    }

    // ── regression: truncate must never panic on multi-byte UTF-8 ──────────
    #[test]
    fn truncate_never_panics_on_multibyte() {
        // Each string is > max_len bytes and lands the byte cut inside a multi-byte char
        // for at least some alignments; before the fix, `&s[..max_len-3]` panicked.
        for s in [
            "é".repeat(200),      // 2-byte chars, 400 bytes
            "🚀".repeat(100),     // 4-byte chars, 400 bytes
            "日本語".repeat(120), // 3-byte chars
            "a".repeat(500),      // pure ASCII (was always safe — stays correct)
            "abcé".repeat(80),    // mixed ASCII + multi-byte
        ] {
            let out = truncate(&s, 300);
            assert!(out.len() <= 300, "must respect the byte cap: got {}", out.len());
            // The result is always valid UTF-8 (its end is a char boundary of itself).
            assert!(out.is_char_boundary(out.len()));
            assert!(out.ends_with("..."));
        }
        // Short strings (≤ cap in bytes) are returned verbatim.
        assert_eq!(truncate("hola", 300), "hola");
        assert_eq!(truncate("café", 300), "café"); // 5 bytes ≤ 300 → verbatim
    }

    #[test]
    fn mask_value_multibyte_long_value_does_not_panic() {
        // The realistic configured path (configureNative sends max_string_length=300).
        let cfg = test_config();
        let sensitive = HashSet::new();
        let ctx = MaskCtx {
            config: &cfg,
            sensitive_set: &sensitive,
            redact_patterns: &[],
            masking_rules: &[],
        };
        let input = json!({ "note": "á".repeat(200), "emoji": "🚀".repeat(100) });
        let out = mask_value(&input, &ctx, 0); // must not panic
        assert!(out.is_object());
    }
}
