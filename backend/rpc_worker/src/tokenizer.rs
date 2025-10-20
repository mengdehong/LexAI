use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tokenizers::tokenizer::{PaddingDirection, PaddingParams, PaddingStrategy, Tokenizer};

const MODEL_RELATIVE_PATH: &str = "all-MiniLM-L6-v2";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenizerConfig {
    model_max_length: Option<usize>,
    #[serde(default = "TokenizerConfig::default_pad_token")]
    pad_token: String,
}

impl TokenizerConfig {
    fn default_pad_token() -> String {
        "<pad>".to_string()
    }
}

#[derive(Clone)]
pub struct EncodedBatch {
    pub input_ids: Vec<i64>,
    pub attention_mask: Vec<i64>,
    pub batch_len: usize,
    pub sequence_length: usize,
}

#[derive(Clone)]
pub struct TokenizerService {
    tokenizer: Tokenizer,
    config: TokenizerConfig,
}

impl TokenizerService {
    pub fn new() -> Result<Self> {
        let base = Self::model_base_path()?;
        let tokenizer_path = base.join("tokenizer.json");
        let config_path = base.join("tokenizer_config.json");

        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow::anyhow!("failed to load tokenizer: {e}"))?;

        let config: TokenizerConfig = serde_json::from_slice(&std::fs::read(&config_path)?)
            .with_context(|| {
                format!(
                    "failed to parse tokenizer config at {}",
                    config_path.display()
                )
            })?;

        Ok(Self { tokenizer, config })
    }

    fn model_base_path() -> Result<PathBuf> {
        let cwd = std::env::current_dir().context("failed to resolve working directory")?;
        let model_base = std::env::var("MODEL_BASE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| cwd.join("models"));
        let base = model_base.join(MODEL_RELATIVE_PATH);
        if !base.exists() {
            anyhow::bail!("model assets not found at {}", base.display());
        }
        Ok(base)
    }

    pub fn encode(&self, texts: &[String]) -> Result<EncodedBatch> {
        if texts.is_empty() {
            anyhow::bail!("no texts provided for encoding");
        }

        let mut tokenizer = self.tokenizer.clone();
        let max_length = self.config.model_max_length.unwrap_or(512);
        let pad_id = tokenizer
            .token_to_id(&self.config.pad_token)
            .context("pad token missing from tokenizer")?;

        tokenizer.with_padding(Some(PaddingParams {
            strategy: PaddingStrategy::Fixed(max_length),
            direction: PaddingDirection::Right,
            pad_to_multiple_of: None,
            pad_id,
            pad_type_id: 0,
            pad_token: self.config.pad_token.clone(),
        }));

        tokenizer
            .with_truncation(Some(tokenizers::utils::truncation::TruncationParams {
                max_length,
                strategy: tokenizers::utils::truncation::TruncationStrategy::LongestFirst,
                stride: 0,
                direction: tokenizers::utils::truncation::TruncationDirection::Right,
            }))
            .map_err(|e| anyhow!("failed to set truncation: {e}"))?;

        let encodings = tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(|e| anyhow!("tokenization failed: {e}"))?;

        let batch_len = encodings.len();
        let sequence_length = max_length;

        let input_ids: Vec<i64> = encodings
            .iter()
            .flat_map(|encoding| encoding.get_ids().iter().copied().map(|id| id as i64))
            .collect();

        let attention_mask: Vec<i64> = encodings
            .iter()
            .flat_map(|encoding| {
                encoding
                    .get_attention_mask()
                    .iter()
                    .copied()
                    .map(|v| v as i64)
            })
            .collect();

        Ok(EncodedBatch {
            input_ids,
            attention_mask,
            batch_len,
            sequence_length,
        })
    }

    pub fn model_path(model_file: &str) -> Result<PathBuf> {
        Ok(Self::model_base_path()?.join(Path::new(model_file)))
    }
}
