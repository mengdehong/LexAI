use crate::tokenizer::TokenizerService;
use anyhow::{Context, Result};
use ndarray::{s, Array2, ArrayD, CowArray, IxDyn};
use once_cell::sync::OnceCell;
use ort::{
    environment::Environment, session::SessionBuilder, value::Value, GraphOptimizationLevel,
};
use std::sync::Arc;

const MODEL_ONNX_PATH: &str = "onnx/model.onnx";

pub trait EmbeddingEngine: Send + Sync {
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>;
}

pub struct EmbeddingService {
    tokenizer: Arc<TokenizerService>,
    session: ort::Session,
}

static ORT_ENV: OnceCell<Arc<Environment>> = OnceCell::new();

impl EmbeddingService {
    pub fn new(tokenizer: Arc<TokenizerService>) -> Result<Self> {
        let env = ORT_ENV
            .get_or_try_init(|| {
                Environment::builder()
                    .with_name("lexai-embeddings")
                    .with_log_level(ort::LoggingLevel::Warning)
                    .build()
                    .map(|env| env.into_arc())
                    .context("failed to initialize ONNX Runtime environment")
            })?
            .clone();

        let session = SessionBuilder::new(&env)
            .context("failed to create session builder")?
            .with_optimization_level(GraphOptimizationLevel::Level1)
            .context("failed to set optimization level")?
            .with_model_from_file(TokenizerService::model_path(MODEL_ONNX_PATH)?)
            .context("failed to load ONNX model")?;

        Ok(Self { tokenizer, session })
    }

    pub fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let batch = self.tokenizer.encode(texts)?;
        let allocator = self.session.allocator();
        let ids: Vec<i64> = batch.input_ids.iter().map(|&v| v as i64).collect();
        let mask: Vec<i64> = batch.attention_mask.iter().map(|&v| v as i64).collect();

        let ids = CowArray::from(
            ArrayD::from_shape_vec(IxDyn(&[batch.batch_len, batch.sequence_length]), ids)
                .context("failed to build input tensor")?,
        );
        let mask = CowArray::from(
            ArrayD::from_shape_vec(IxDyn(&[batch.batch_len, batch.sequence_length]), mask)
                .context("failed to build attention mask tensor")?,
        );

        let inputs = vec![
            Value::from_array(allocator, &ids).context("failed to build input value")?,
            Value::from_array(allocator, &mask).context("failed to build attention value")?,
        ];

        let outputs = self
            .session
            .run(inputs)
            .context("failed to execute ONNX session")?;
        let embeddings_value = outputs
            .first()
            .context("ONNX model returned no outputs")?
            .try_extract::<f32>()
            .context("unexpected output tensor type")?;

        let embeddings: ArrayD<f32> = embeddings_value.view().to_owned().into_dyn();
        let shape = embeddings.shape();
        let (batch_len, seq_len, hidden) = match *shape {
            [b, s, h] => (b, s, h),
            [b, h] => (b, 1, h),
            _ => anyhow::bail!("unexpected embedding shape: {shape:?}"),
        };

        let array =
            Array2::from_shape_vec((batch_len * seq_len, hidden), embeddings.into_raw_vec())
                .context("failed to reshape embeddings")?;
        let sentence_vectors = Self::mean_pool(batch_len, seq_len, &array, &batch.attention_mask);
        Ok(Self::normalize(sentence_vectors))
    }

    fn mean_pool(
        batch_len: usize,
        seq_len: usize,
        embeddings: &Array2<f32>,
        attention: &[i64],
    ) -> Vec<Vec<f32>> {
        let hidden = embeddings.shape()[1];
        let mut results = Vec::with_capacity(batch_len);

        for batch_idx in 0..batch_len {
            let start = batch_idx * seq_len;
            let mut sum = vec![0.0f32; hidden];
            let mut count = 0f32;

            for token_idx in 0..seq_len {
                if attention[batch_idx * seq_len + token_idx] == 0 {
                    continue;
                }
                let row = embeddings.slice(s![start + token_idx, ..]);
                sum.iter_mut().zip(row.iter()).for_each(|(acc, val)| {
                    *acc += *val;
                });
                count += 1.0;
            }

            let denom = if count > 0.0 { count } else { 1.0 };
            sum.iter_mut().for_each(|v| *v /= denom);
            results.push(sum);
        }

        results
    }

    fn normalize(vectors: Vec<Vec<f32>>) -> Vec<Vec<f32>> {
        vectors
            .into_iter()
            .map(|vec| {
                let norm = vec.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
                vec.into_iter().map(|v| v / norm).collect()
            })
            .collect()
    }

    pub fn is_ready(&self) -> bool {
        true
    }
}

impl EmbeddingEngine for EmbeddingService {
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        self.embed(texts)
    }
}
