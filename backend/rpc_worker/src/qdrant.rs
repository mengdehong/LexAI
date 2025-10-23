use anyhow::{anyhow, Context, Result};
use qdrant_client::qdrant::{
    condition::ConditionOneOf, point_id, r#match::MatchValue, value::Kind, Condition, Distance,
    FieldCondition, Filter, ListValue, Match, PointStruct, SearchPointsBuilder, Struct,
    UpsertPointsBuilder, Value as QdrantValue, VectorParamsBuilder, Vectors,
};
use qdrant_client::Qdrant;
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

const COLLECTION_NAME: &str = "lexai_documents";
const VECTOR_DIM: usize = 384;

pub struct EmbeddedQdrant {
    client: Qdrant,
}

impl EmbeddedQdrant {
    pub fn new() -> Result<Self> {
        let storage_path = std::env::var("QDRANT__STORAGE").unwrap_or_else(|_| {
            std::env::current_dir()
                .unwrap()
                .join("qdrant")
                .display()
                .to_string()
        });

        let url =
            std::env::var("QDRANT__URL").unwrap_or_else(|_| "http://127.0.0.1:6334".to_string());

        let client = Qdrant::from_url(&url)
            .timeout(std::time::Duration::from_secs(5))
            .build()?;

        // Embedded storage is handled by the sidecar launcher via filesystem path
        let _ = storage_path;

        Ok(Self { client })
    }

    pub async fn ensure_collection(&self) -> Result<()> {
        let exists = self.client.collection_exists(COLLECTION_NAME).await?;
        if !exists {
            let request = qdrant_client::qdrant::CreateCollectionBuilder::new(COLLECTION_NAME)
                .vectors_config(qdrant_client::qdrant::VectorsConfig {
                    config: Some(qdrant_client::qdrant::vectors_config::Config::Params(
                        VectorParamsBuilder::new(VECTOR_DIM as u64, Distance::Cosine).into(),
                    )),
                });
            self.client.create_collection(request).await?;
        }
        Ok(())
    }

    pub fn document_filter(&self, document_id: &str) -> Filter {
        Filter {
            must: vec![Condition {
                condition_one_of: Some(ConditionOneOf::Field(FieldCondition {
                    key: "document_id".to_string(),
                    r#match: Some(Match {
                        match_value: Some(MatchValue::Keyword(document_id.to_string())),
                    }),
                    ..Default::default()
                })),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    pub async fn search(
        &self,
        vector: Vec<f32>,
        limit: u64,
        filter: Option<Filter>,
    ) -> Result<Vec<Value>> {
        let mut builder =
            SearchPointsBuilder::new(COLLECTION_NAME, vector, limit).with_payload(true);
        if let Some(f) = filter {
            builder = builder.filter(f);
        }

        let response = self.client.search_points(builder).await?;
        let results = response
            .result
            .into_iter()
            .map(|point| qdrant_payload_to_value(point.payload).unwrap_or(Value::Null))
            .collect();

        Ok(results)
    }

    pub async fn upsert_points(&self, points: Vec<PointStruct>) -> Result<()> {
        let request = UpsertPointsBuilder::new(COLLECTION_NAME, points)
            .wait(true)
            .build();
        self.client.upsert_points(request).await?;
        Ok(())
    }

    pub fn build_point(
        &self,
        vector: Vec<f32>,
        payload: QdrantDocumentPayload,
    ) -> Result<PointStruct> {
        let point_id = point_id::PointIdOptions::Uuid(Uuid::new_v4().to_string());
        let payload = qdrant_payload_from_struct(&payload)?;
        Ok(PointStruct {
            id: Some(point_id.into()),
            payload,
            vectors: Some(Vectors::from(vector)),
        })
    }
}

fn qdrant_payload_to_value(payload: HashMap<String, QdrantValue>) -> Result<Value> {
    let mut map = serde_json::Map::new();
    for (key, value) in payload {
        map.insert(key, qdrant_value_to_json(value)?);
    }
    Ok(Value::Object(map))
}

fn qdrant_value_to_json(value: QdrantValue) -> Result<Value> {
    let result = match value.kind.unwrap_or(Kind::NullValue(0)) {
        Kind::NullValue(_) => Value::Null,
        Kind::BoolValue(v) => Value::Bool(v),
        Kind::IntegerValue(v) => Value::Number(v.into()),
        Kind::DoubleValue(v) => serde_json::Number::from_f64(v)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Kind::StringValue(v) => Value::String(v),
        Kind::ListValue(list) => Value::Array(
            list.values
                .into_iter()
                .map(qdrant_value_to_json)
                .collect::<Result<Vec<_>>>()?,
        ),
        Kind::StructValue(s) => {
            qdrant_payload_to_value(s.fields).context("failed to convert struct payload")?
        }
    };

    Ok(result)
}

fn qdrant_payload_from_struct(
    payload: &QdrantDocumentPayload,
) -> Result<HashMap<String, QdrantValue>> {
    let json = serde_json::to_value(payload).context("failed to serialize payload")?;
    match json {
        Value::Object(map) => map
            .into_iter()
            .map(|(k, v)| Ok((k, json_to_qdrant_value(v)?)))
            .collect(),
        _ => Err(anyhow!("payload must be a JSON object")),
    }
}

fn json_to_qdrant_value(value: Value) -> Result<QdrantValue> {
    let kind = match value {
        Value::Null => Kind::NullValue(0),
        Value::Bool(v) => Kind::BoolValue(v),
        Value::Number(n) => {
            if let Some(int) = n.as_i64() {
                Kind::IntegerValue(int)
            } else if let Some(float) = n.as_f64() {
                Kind::DoubleValue(float)
            } else {
                return Err(anyhow!("unsupported number value"));
            }
        }
        Value::String(s) => Kind::StringValue(s),
        Value::Array(arr) => {
            let values = arr
                .into_iter()
                .map(json_to_qdrant_value)
                .collect::<Result<Vec<_>>>()?;
            Kind::ListValue(ListValue { values })
        }
        Value::Object(map) => {
            let fields = map
                .into_iter()
                .map(|(k, v)| Ok((k, json_to_qdrant_value(v)?)))
                .collect::<Result<HashMap<_, _>>>()?;
            Kind::StructValue(Struct { fields })
        }
    };

    Ok(QdrantValue { kind: Some(kind) })
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct QdrantDocumentPayload {
    pub document_id: String,
    pub chunk_text: String,
}
