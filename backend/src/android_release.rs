//! Metadata shared with the delivery tools. No HTTP or storage policy here.
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub(crate) struct AndroidRelease {
    pub version_code: u32,
    pub version_name: String,
    pub size_bytes: u64,
    pub sha256: String,
}

impl AndroidRelease {
    pub fn parse(value: &Value) -> Option<Self> {
        fn integer(value: &Value, max: f64) -> Option<u64> {
            let number = value.as_f64()?;
            (number > 0.0 && number <= max && number.fract() == 0.0).then_some(number as u64)
        }
        let version_code = integer(value.get("version_code")?, f64::from(i32::MAX))? as u32;
        let size_bytes = integer(value.get("size_bytes")?, 9_007_199_254_740_991.0)?;
        let version_name = value.get("version_name")?.as_str()?;
        let sha256 = value.get("sha256")?.as_str()?;
        if version_name.trim().is_empty()
            || sha256.len() != 64
            || !sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return None;
        }
        Some(Self {
            version_code,
            version_name: version_name.to_owned(),
            size_bytes,
            sha256: sha256.to_owned(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_manifest_contract() {
        let cases: Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/android-release/cases.json"
        ))
        .unwrap();
        for case in cases.as_array().unwrap() {
            assert_eq!(
                AndroidRelease::parse(&case["value"]).is_some(),
                case["valid"].as_bool().unwrap(),
                "{}",
                case["name"]
            );
        }
    }
}
