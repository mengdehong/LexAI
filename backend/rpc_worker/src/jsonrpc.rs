use crate::document::{process_pdf, ProcessedDocument};
use crate::embeddings::{EmbeddingEngine, EmbeddingService};
use crate::qdrant::{EmbeddedQdrant, QdrantDocumentPayload};
use crate::tokenizer::TokenizerService;
use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tokio::runtime::Runtime;
use tokio::task;
use tracing::error;
use uuid::Uuid;

pub struct JsonRpcLoop {
    reader: BufReader<std::io::Stdin>,
    ctx: RpcContext,
    runtime: Runtime,
}

pub struct RpcContext {
    pub qdrant: EmbeddedQdrant,
    pub embeddings: std::sync::Arc<dyn EmbeddingEngine>,
}

impl JsonRpcLoop {
    pub fn new() -> Result<Self> {
        let qdrant = EmbeddedQdrant::new()?;
        let tokenizer = std::sync::Arc::new(TokenizerService::new()?);
        let embeddings = std::sync::Arc::new(EmbeddingService::new(tokenizer.clone())?);
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(2)
            .thread_name("rpc-worker")
            .build()
            .context("failed to build tokio runtime")?;

        Ok(Self {
            reader: BufReader::new(std::io::stdin()),
            ctx: RpcContext { qdrant, embeddings },
            runtime,
        })
    }

    pub fn run(&mut self) -> Result<()> {
        let stdout = std::io::stdout();
        let mut writer = stdout.lock();

        let mut line = String::new();
        while self.reader.read_line(&mut line)? != 0 {
            let response = self.handle_line(&line);
            writeln!(writer, "{}", serde_json::to_string(&response)?)?;
            writer.flush()?;
            line.clear();
        }
        Ok(())
    }

    fn handle_line(&mut self, line: &str) -> JsonRpcResponse {
        let request: JsonRpcRequest = match serde_json::from_str(line) {
            Ok(req) => req,
            Err(err) => {
                error!("jsonrpc.parse_error: {err}");
                return JsonRpcResponse::error(Value::Null, -32700, &err.to_string());
            }
        };

        let id = request.id.clone().unwrap_or(Value::Null);

        match self.dispatch(request) {
            Ok(response) => response,
            Err(err) => {
                error!("jsonrpc.internal_error: {err}");
                JsonRpcResponse::error(id, -32603, &err.to_string())
            }
        }
    }

    fn dispatch(&mut self, request: JsonRpcRequest) -> Result<JsonRpcResponse> {
        let id = request.id.unwrap_or(Value::Null);
        if request.jsonrpc != "2.0" {
            return Ok(JsonRpcResponse::error(
                id,
                -32600,
                "Invalid JSON-RPC version",
            ));
        }

        match request.method.as_str() {
            "ping" => Ok(JsonRpcResponse::result(id, json!({ "status": "ok" }))),
            "upload_document" => {
                let params = request.params.unwrap_or(Value::Null);
                match serde_json::from_value::<UploadDocumentParams>(params) {
                    Ok(args) => {
                        let result = self.runtime.block_on(self.handle_upload_document(args))?;
                        Ok(JsonRpcResponse::result(id, result))
                    }
                    Err(_) => Ok(JsonRpcResponse::error(id, -32602, "Invalid params")),
                }
            }
            "search_document" => {
                let params = request.params.unwrap_or(Value::Null);
                match serde_json::from_value::<SearchParams>(params) {
                    Ok(args) => {
                        let result = self.runtime.block_on(self.handle_search_document(args))?;
                        Ok(JsonRpcResponse::result(id, result))
                    }
                    Err(_) => Ok(JsonRpcResponse::error(id, -32602, "Invalid params")),
                }
            }
            _ => Ok(JsonRpcResponse::error(id, -32601, "Method not found")),
        }
    }

    async fn handle_upload_document(&self, params: UploadDocumentParams) -> Result<Value> {
        let document_id = params
            .document_id
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let file_path = PathBuf::from(params.file_path);
        let processed: ProcessedDocument = task::spawn_blocking(move || process_pdf(&file_path))
            .await
            .context("pdf processing task failed")??;

        if processed.chunks.is_empty() {
            return Err(anyhow!("no chunks generated for document"));
        }

        let embeddings = self
            .ctx
            .embeddings
            .embed(&processed.chunks)
            .context("embedding generation failed")?;

        self.ctx.qdrant.ensure_collection().await?;
        let mut points = Vec::with_capacity(embeddings.len());
        for (vector, chunk) in embeddings.into_iter().zip(processed.chunks.iter()) {
            points.push(self.ctx.qdrant.build_point(
                vector,
                QdrantDocumentPayload {
                    document_id: document_id.clone(),
                    chunk_text: chunk.clone(),
                },
            )?);
        }
        self.ctx.qdrant.upsert_points(points).await?;

        Ok(json!({
            "document_id": document_id,
            "status": "processed",
            "chunk_count": processed.chunks.len(),
            "extracted_text": processed.text,
        }))
    }

    async fn handle_search_document(&self, params: SearchParams) -> Result<Value> {
        if params.query.is_empty() {
            return Err(anyhow!("query text cannot be empty"));
        }

        let query_vec = self
            .ctx
            .embeddings
            .embed(&[params.query.clone()])
            .context("failed to embed query")?
            .into_iter()
            .next()
            .context("missing query embedding")?;

        let filter = if let Some(document_id) = params.document_id {
            Some(self.ctx.qdrant.document_filter(&document_id))
        } else {
            None
        };

        let results = self
            .ctx
            .qdrant
            .search(query_vec, params.limit.unwrap_or(5), filter)
            .await?;

        Ok(json!({ "results": results }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response_error_code(response: &JsonRpcResponse) -> Option<i32> {
        response.error.as_ref().map(|e| e.code)
    }

    #[test]
    fn parse_error_for_invalid_json() {
        let mut loop_instance = JsonRpcLoop {
            reader: BufReader::new(std::io::stdin()),
            ctx: RpcContext {
                qdrant: EmbeddedQdrant::new().unwrap(),
                embeddings: std::sync::Arc::new(
                    EmbeddingService::new(std::sync::Arc::new(TokenizerService::new().unwrap()))
                        .unwrap(),
                ),
            },
            runtime: tokio::runtime::Runtime::new().unwrap(),
        };

        let response = loop_instance.handle_line("{invalid json}");
        assert_eq!(response_error_code(&response), Some(-32700));
    }
}

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    params: Option<Value>,
    id: Option<Value>,
}

#[derive(Deserialize)]
struct UploadDocumentParams {
    #[serde(default)]
    document_id: Option<String>,
    file_path: String,
}

#[derive(Deserialize)]
struct SearchParams {
    query: String,
    #[serde(default)]
    document_id: Option<String>,
    #[serde(default)]
    limit: Option<u64>,
}

#[derive(serde::Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
    id: Value,
}

#[derive(serde::Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl JsonRpcResponse {
    fn error(id: Value, code: i32, message: &str) -> Self {
        Self {
            jsonrpc: "2.0",
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.to_owned(),
                data: None,
            }),
            id,
        }
    }

    fn result(id: Value, value: Value) -> Self {
        Self {
            jsonrpc: "2.0",
            result: Some(value),
            error: None,
            id,
        }
    }
}
