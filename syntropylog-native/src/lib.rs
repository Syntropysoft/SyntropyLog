use chrono::{MappedLocalTime, TimeZone, Utc};
use napi::{Env, JsBoolean, JsNumber, JsString, JsUnknown, NapiRaw, ValueType};
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

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FastSerializeConfig {
    #[serde(default)]
    sensitive_fields: Vec<String>,
    #[serde(default)]
    redact_patterns: Vec<String>,
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

struct CompiledConfig {
    config: FastSerializeConfig,
    redact_patterns: Vec<Regex>,
    sensitive_set: HashSet<String>,
}

static NATIVE_CONFIG: OnceCell<CompiledConfig> = OnceCell::new();

#[napi]
pub fn configure_native(config_json: String) -> bool {
    let config: FastSerializeConfig = match serde_json::from_str(&config_json) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let sensitive_set: HashSet<String> = config
        .sensitive_fields
        .iter()
        .map(|s| s.to_lowercase())
        .collect();

    let redact_patterns = compile_redact_patterns(&config.redact_patterns);

    let compiled = CompiledConfig {
        config,
        redact_patterns,
        sensitive_set,
    };

    NATIVE_CONFIG.set(compiled).is_ok()
}

fn compile_redact_patterns(sources: &[String]) -> Vec<Regex> {
    sources
        .iter()
        .filter_map(|s| Regex::new(s).ok())
        .collect()
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
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

fn is_sensitive_key(key: &str, sensitive_fields_lower: &HashSet<String>) -> bool {
    let lower = key.to_lowercase();
    sensitive_fields_lower
        .iter()
        .any(|f| lower.contains(f.as_str()))
}

/// Process a string in one place: strip ANSI, truncate, apply redact patterns (single-pass pipeline).
fn process_string(
    s: &str,
    config: &FastSerializeConfig,
    redact_patterns: &[Regex],
) -> String {
    let out = strip_ansi(s);
    let out = truncate(&out, config.max_string_length);
    if config.sanitize && !redact_patterns.is_empty() {
        apply_redact_patterns(&out, redact_patterns)
    } else {
        out
    }
}

/// Truncate a Value: limit object keys and array length (parity with js_unknown_to_value when parsing from JSON).
fn truncate_value(
    v: &Value,
    max_keys: u32,
    max_array_len: u32,
) -> Value {
    match v {
        Value::Object(m) => {
            let mut out = serde_json::Map::new();
            let mut n = 0u32;
            for (k, val) in m.iter() {
                if n >= max_keys {
                    out.insert(
                        "_truncated".to_string(),
                        Value::String(format!("{} keys omitted", m.len().saturating_sub(max_keys as usize))),
                    );
                    break;
                }
                out.insert(k.clone(), truncate_value(val, max_keys, max_array_len));
                n += 1;
            }
            Value::Object(out)
        }
        Value::Array(arr) => {
            let to_take = arr.len().min(max_array_len as usize);
            let out: Vec<Value> = arr
                .iter()
                .take(to_take)
                .map(|item| truncate_value(item, max_keys, max_array_len))
                .collect();
            let mut result = out;
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

/// Apply masking to an already-parsed Value (for the JSON-string path: one N-API crossing).
fn mask_value(
    v: &Value,
    config: &FastSerializeConfig,
    depth: u32,
    sensitive_set: &HashSet<String>,
    redact_patterns: &[Regex],
) -> Value {
    if depth > config.max_depth {
        return Value::String(MAX_DEPTH_PLACEHOLDER.to_string());
    }
    let next_depth = depth + 1;
    match v {
        Value::Null => Value::Null,
        Value::Bool(b) => Value::Bool(*b),
        Value::Number(n) => Value::Number(n.clone()),
        Value::String(s) => Value::String(process_string(s, config, redact_patterns)),
        Value::Array(arr) => {
            let masked: Vec<Value> = arr
                .iter()
                .map(|item| mask_value(item, config, next_depth, sensitive_set, redact_patterns))
                .collect();
            Value::Array(masked)
        }
        Value::Object(m) => {
            let masked: serde_json::Map<String, Value> = m
                .iter()
                .map(|(k, val)| {
                    let masked_val = if config.sanitize && is_sensitive_key(k, sensitive_set) {
                        Value::String(REDACTED.to_string())
                    } else {
                        mask_value(val, config, next_depth, sensitive_set, redact_patterns)
                    };
                    (k.clone(), masked_val)
                })
                .collect();
            Value::Object(masked)
        }
    }
}

/// Single-pass: convert JS value to Value while applying mask (depth, truncate, ANSI strip, redact, sensitive keys).
/// Avoids building an intermediate unmasked tree.
fn js_unknown_to_value_masked(
    env: &Env,
    unknown: JsUnknown,
    depth: u32,
    seen: &mut HashSet<usize>,
    config: &FastSerializeConfig,
    sensitive_set: &HashSet<String>,
    redact_patterns: &[Regex],
    current_key: Option<&str>,
) -> napi::Result<Value> {
    if depth > config.max_depth {
        return Ok(Value::String(MAX_DEPTH_PLACEHOLDER.to_string()));
    }

    let ty = unknown.get_type()?;
    match ty {
        ValueType::Null | ValueType::Undefined => Ok(Value::Null),
        ValueType::Boolean => {
            let b = unsafe { unknown.cast::<JsBoolean>() };
            Ok(Value::Bool(b.get_value()?))
        }
        ValueType::Number => {
            let n = unsafe { unknown.cast::<JsNumber>() };
            let f = n.get_double()?;
            Ok(Number::from_f64(f)
                .map(Value::Number)
                .unwrap_or(Value::Null))
        }
        ValueType::String => {
            if config.sanitize && current_key.is_some_and(|k| is_sensitive_key(k, sensitive_set)) {
                return Ok(Value::String(REDACTED.to_string()));
            }
            let s = unsafe { unknown.cast::<JsString>() };
            let utf8 = s.into_utf8()?;
            let raw = utf8.into_owned()?;
            let processed = process_string(&raw, config, redact_patterns);
            Ok(Value::String(processed))
        }
        ValueType::Object => {
            let ptr = unsafe { NapiRaw::raw(&unknown) as *const () as usize };
            if seen.contains(&ptr) {
                return Ok(Value::String("[Circular]".to_string()));
            }
            seen.insert(ptr);

            let obj = unknown.coerce_to_object()?;
            let next_depth = depth + 1;
            let out = if obj.is_error()? {
                let mut m = serde_json::Map::new();
                if let Ok(js_val) = obj.get_named_property::<JsString>("name") {
                    let raw = js_val.into_utf8()?.into_owned()?;
                    m.insert("name".into(), Value::String(process_string(&raw, config, redact_patterns)));
                }
                if let Ok(js_val) = obj.get_named_property::<JsString>("message") {
                    let raw = js_val.into_utf8()?.into_owned()?;
                    m.insert("message".into(), Value::String(process_string(&raw, config, redact_patterns)));
                }
                if let Ok(js_val) = obj.get_named_property::<JsString>("stack") {
                    let raw = js_val.into_utf8()?.into_owned()?;
                    m.insert("stack".into(), Value::String(process_string(&raw, config, redact_patterns)));
                }
                Value::Object(m)
            } else if obj.is_array()? {
                let len = obj.get_array_length_unchecked()?;
                let to_take = len.min(MAX_ARRAY_LENGTH);
                let mut arr = Vec::with_capacity(to_take as usize);
                for i in 0..to_take {
                    let child: JsUnknown = obj.get_element(i)?;
                    arr.push(js_unknown_to_value_masked(
                        env, child, next_depth, seen,
                        config, sensitive_set, redact_patterns,
                        None,
                    )?);
                }
                if len > MAX_ARRAY_LENGTH {
                    arr.push(Value::String(format!("[{} items omitted]", len - MAX_ARRAY_LENGTH)));
                }
                Value::Array(arr)
            } else {
                let keys = obj.get_property_names()?;
                let key_len = keys.get_array_length_unchecked()?;
                let mut m = serde_json::Map::new();
                let to_take = key_len.min(MAX_KEYS_PER_OBJECT);
                for i in 0..to_take {
                    let key_js: JsString = keys.get_element(i)?;
                    let key = key_js.into_utf8()?.into_owned()?;
                    let child: JsUnknown = obj.get_named_property(&key)?;
                    let masked_val = if config.sanitize && is_sensitive_key(&key, sensitive_set) {
                        Value::String(REDACTED.to_string())
                    } else {
                        js_unknown_to_value_masked(
                            env, child, next_depth, seen,
                            config, sensitive_set, redact_patterns,
                            Some(&key),
                        )?
                    };
                    m.insert(key, masked_val);
                }
                if key_len > MAX_KEYS_PER_OBJECT {
                    let remaining = key_len - MAX_KEYS_PER_OBJECT;
                    m.insert(
                        "_truncated".to_string(),
                        Value::String(format!("{} keys omitted", remaining)),
                    );
                }
                Value::Object(m)
            };

            seen.remove(&ptr);
            Ok(out)
        }
        ValueType::Function | ValueType::External | ValueType::Symbol => {
            Ok(Value::String("[Unsupported]".to_string()))
        }
        _ => Ok(Value::Null),
    }
}

#[napi]
pub fn fast_serialize(
    env: Env,
    level: String,
    message: String,
    timestamp: f64,
    service: String,
    metadata: napi::JsUnknown,
) -> String {
    let (config, sensitive_set, redact_patterns) = if let Some(compiled) = NATIVE_CONFIG.get() {
        (&compiled.config, &compiled.sensitive_set, &compiled.redact_patterns)
    } else {
        static DEFAULT_CONFIG: OnceCell<(FastSerializeConfig, HashSet<String>, Vec<Regex>)> =
            OnceCell::new();
        let (c, s, r) = DEFAULT_CONFIG.get_or_init(|| {
            let config = FastSerializeConfig::default();
            let sensitive_set = HashSet::new();
            let redact_patterns = Vec::new();
            (config, sensitive_set, redact_patterns)
        });
        (c, s, r)
    };

    let masked_metadata = match metadata.get_type() {
        Ok(ValueType::Null) | Ok(ValueType::Undefined) => Value::Null,
        _ => {
            let mut seen = HashSet::new();
            match js_unknown_to_value_masked(
                &env, metadata, 0, &mut seen,
                config, sensitive_set, redact_patterns,
                None,
            ) {
                Ok(v) => v,
                Err(_) => Value::Null,
            }
        }
    };

    // Level, message, service: insert as-is (no strip/truncate/redact) to avoid hot-path overhead.
    // ANSI strip + sanitization still apply to every string inside metadata.
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

    if let Value::Object(m_map) = masked_metadata {
        for (k, v) in m_map {
            if k != "level" && k != "message" && k != "timestamp" && k != "service" {
                map.insert(k, v);
            }
        }
    } else if !masked_metadata.is_null() && !masked_metadata.is_object() {
        map.insert("metadata".into(), masked_metadata);
    }

    let final_value = Value::Object(map);

    match serde_json::to_string(&final_value) {
        Ok(s) => s,
        Err(_) => format!("{}: serialize error", FALLBACK_ERROR_PREFIX),
    }
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
    let (config, sensitive_set, redact_patterns) = if let Some(compiled) = NATIVE_CONFIG.get() {
        (&compiled.config, &compiled.sensitive_set, &compiled.redact_patterns)
    } else {
        static DEFAULT_CONFIG: OnceCell<(FastSerializeConfig, HashSet<String>, Vec<Regex>)> =
            OnceCell::new();
        let (c, s, r) = DEFAULT_CONFIG.get_or_init(|| {
            let config = FastSerializeConfig::default();
            let sensitive_set = HashSet::new();
            let redact_patterns = Vec::new();
            (config, sensitive_set, redact_patterns)
        });
        (c, s, r)
    };

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
    let masked_metadata = mask_value(&truncated, config, 0, sensitive_set, redact_patterns);

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

    if let Value::Object(m_map) = masked_metadata {
        for (k, v) in m_map {
            if k != "level" && k != "message" && k != "timestamp" && k != "service" {
                map.insert(k, v);
            }
        }
    } else if !masked_metadata.is_null() && !masked_metadata.is_object() {
        map.insert("metadata".into(), masked_metadata);
    }

    let final_value = Value::Object(map);

    match serde_json::to_string(&final_value) {
        Ok(s) => s,
        Err(_) => format!("{}: serialize error", FALLBACK_ERROR_PREFIX),
    }
}

#[napi]
pub fn ping() -> String {
    "pong".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ansi_removes_escape_sequences() {
        // Ensure ANSI_REGEX is initialized
        let _ = ansi_regex();
        assert_eq!(strip_ansi("hello"), "hello");
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m"), "red");
        assert_eq!(strip_ansi("a\x1b[0mb"), "ab");
        assert_eq!(strip_ansi("\x1b[32mgreen\x1b[0m text"), "green text");
    }
}
