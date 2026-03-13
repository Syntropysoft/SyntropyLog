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
/// Objetos con más claves se truncan (como Pino: no aplanar todo lo complejo).
const MAX_KEYS_PER_OBJECT: u32 = 500;
/// Arrays por encima de este tamaño se truncan.
const MAX_ARRAY_LENGTH: u32 = 1000;

/// Configuración de sanitización/enmascarado (alineada con SerializationManager).
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

/// Estado persistente para evitar re-parsear configuración y re-compilar Regex en cada log.
struct CompiledConfig {
    config: FastSerializeConfig,
    redact_patterns: Vec<Regex>,
    sensitive_set: HashSet<String>,
}

static NATIVE_CONFIG: OnceCell<CompiledConfig> = OnceCell::new();

/// Inicializa o actualiza la configuración global del addon.
/// Se recomienda llamar esto una sola vez durante el init() en JS.
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

    // Si ya existe, no hacemos nada (el diseño actual prefiere inmutabilidad post-init).
    // Si queremos permitir reconfiguración dinámica, usaríamos un RwLock.
    NATIVE_CONFIG.set(compiled).is_ok()
}

/// Compila los patrones de redacción (regex). Ignora patrones inválidos.
fn compile_redact_patterns(sources: &[String]) -> Vec<Regex> {
    sources
        .iter()
        .filter_map(|s| Regex::new(s).ok())
        .collect()
}

/// Aplica patrones de redacción a un string.
fn apply_redact_patterns(s: &str, patterns: &[Regex]) -> String {
    let mut out = s.to_string();
    for re in patterns {
        out = re.replace_all(&out, REDACTED).to_string();
    }
    out
}

/// Trunca string si supera max_len.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

/// Comprueba si el nombre de clave es sensible (case-insensitive, contiene).
fn is_sensitive_key(key: &str, sensitive_fields_lower: &HashSet<String>) -> bool {
    let lower = key.to_lowercase();
    sensitive_fields_lower
        .iter()
        .any(|f| lower.contains(f.as_str()))
}


/// Convierte un JsUnknown a serde_json::Value con detección de referencias circulares
/// y normalización de Error (name, message, stack). A profundidad >= 1, objetos/arrays
/// se serializan con JSON.stringify (shallow tipo Pino).
fn js_unknown_to_value(
    env: &Env,
    unknown: JsUnknown,
    depth: u32,
    seen: &mut HashSet<usize>,
) -> napi::Result<Value> {
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
            let s = unsafe { unknown.cast::<JsString>() };
            let utf8 = s.into_utf8()?;
            Ok(Value::String(utf8.into_owned()?))
        }
        ValueType::Object => {
            let ptr = unsafe { NapiRaw::raw(&unknown) as *const () as usize };
            if seen.contains(&ptr) {
                return Ok(Value::String("[Circular]".to_string()));
            }
            seen.insert(ptr);

            let obj = unknown.coerce_to_object()?;
            let out = if obj.is_error()? {
                let mut m = serde_json::Map::new();
                if let Ok(name) = obj.get_named_property::<JsString>("name") {
                    m.insert("name".into(), Value::String(name.into_utf8()?.into_owned()?));
                }
                if let Ok(message) = obj.get_named_property::<JsString>("message") {
                    m.insert("message".into(), Value::String(message.into_utf8()?.into_owned()?));
                }
                if let Ok(stack) = obj.get_named_property::<JsString>("stack") {
                    m.insert("stack".into(), Value::String(stack.into_utf8()?.into_owned()?));
                }
                Value::Object(m)
            } else if obj.is_array()? {
                let len = obj.get_array_length_unchecked()?;
                let to_take = len.min(MAX_ARRAY_LENGTH);
                let mut arr = Vec::with_capacity(to_take as usize);
                for i in 0..to_take {
                    let child: JsUnknown = obj.get_element(i)?;
                    arr.push(js_unknown_to_value(env, child, depth + 1, seen)?);
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
                    let val = js_unknown_to_value(env, child, depth + 1, seen)?;
                    m.insert(key, val);
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


/// Recorre el Value y produce otro Value con sanitización y enmascarado.
fn mask_value(
    v: &Value,
    config: &FastSerializeConfig,
    depth: u32,
    sensitive_fields: &HashSet<String>,
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
        Value::String(s) => {
            let mut out = truncate(s, config.max_string_length);
            if config.sanitize && !redact_patterns.is_empty() {
                out = apply_redact_patterns(&out, redact_patterns);
            }
            Value::String(out)
        }
        Value::Array(arr) => {
            let masked: Vec<Value> = arr
                .iter()
                .map(|item| mask_value(item, config, next_depth, sensitive_fields, redact_patterns))
                .collect();
            Value::Array(masked)
        }
        Value::Object(map) => {
            let masked: serde_json::Map<String, Value> = map
                .iter()
                .map(|(k, val)| {
                    let masked_val = if config.sanitize && is_sensitive_key(k, sensitive_fields) {
                        Value::String(REDACTED.to_string())
                    } else {
                        mask_value(val, config, next_depth, sensitive_fields, redact_patterns)
                    };
                    (k.clone(), masked_val)
                })
                .collect();
            Value::Object(masked)
        }
    }
}

/// Serialización completa en Rust: recibe los campos críticos directamente (Zero-Boundary cost)
/// y el objeto de metadatos para inspección profunda solo si es necesario.
#[napi]
pub fn fast_serialize(
    env: Env,
    level: String,
    message: String,
    timestamp: f64,
    service: String,
    metadata: napi::JsUnknown,
) -> String {
    // Intentar usar la configuración cacheada
    let (config, sensitive_set, redact_patterns) = if let Some(compiled) = NATIVE_CONFIG.get() {
        (&compiled.config, &compiled.sensitive_set, &compiled.redact_patterns)
    } else {
        // Fallback (lento): si no hay config, usamos una por defecto
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

    // Atajo ultra-rápido: si metadata es null/undefined, no cruzamos la frontera N-API para conversión
    let (metadata_value, masked_metadata) = match metadata.get_type() {
        Ok(ValueType::Null) | Ok(ValueType::Undefined) => (Value::Null, Value::Null),
        _ => {
            let mut seen = HashSet::new();
            let val = match js_unknown_to_value(&env, metadata, 0, &mut seen) {
                Ok(v) => v,
                Err(_) => Value::Null,
            };
            let masked = mask_value(&val, config, 0, sensitive_set, redact_patterns);
            (val, masked)
        }
    };

    // Construir el mapa final in-place para máxima velocidad
    let mut map = serde_json::Map::new();
    map.insert("level".into(), Value::String(level));
    map.insert("message".into(), Value::String(message));
    map.insert("service".into(), Value::String(service));

    // Formatear timestamp ISO desde el número f64
    if let MappedLocalTime::Single(dt) = Utc.timestamp_millis_opt(timestamp as i64) {
        map.insert("timestamp".into(), Value::String(dt.to_rfc3339()));
    } else {
        map.insert("timestamp".into(), Value::Number(Number::from_f64(timestamp).unwrap_or(Number::from(0))));
    }

    // Merge metadata efficiently
    if let Value::Object(m_map) = masked_metadata {
        for (k, v) in m_map {
            // Evitar duplicar campos que ya pasamos como argumentos directos
            if k != "level" && k != "message" && k != "timestamp" && k != "service" {
                map.insert(k, v);
            }
        }
    } else if !metadata_value.is_null() && !metadata_value.is_object() {
        map.insert("metadata".into(), masked_metadata);
    }

    let final_value = Value::Object(map);

    match serde_json::to_string(&final_value) {
        Ok(s) => s,
        Err(_) => format!("{}: serialize error", FALLBACK_ERROR_PREFIX),
    }
}

/// Validación Fase 0: compilación y enlace Node↔Rust.
#[napi]
pub fn ping() -> String {
    "pong".to_string()
}
