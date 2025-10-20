use anyhow::{anyhow, Context, Result};
use pdf_extract::extract_text;
use std::path::Path;

const CHUNK_SIZE: usize = 1000;
const CHUNK_OVERLAP: usize = 200;

pub struct ProcessedDocument {
    pub text: String,
    pub chunks: Vec<String>,
}

pub fn process_pdf(path: &Path) -> Result<ProcessedDocument> {
    if !path.exists() {
        return Err(anyhow!("file not found: {}", path.display()));
    }

    let raw_text = extract_text(path).context("failed to extract pdf text")?;
    let trimmed = raw_text.trim().to_owned();
    if trimmed.is_empty() {
        return Err(anyhow!("extracted text is empty"));
    }

    let chunks = split_into_chunks(&trimmed);
    if chunks.is_empty() {
        return Err(anyhow!("no text chunks generated"));
    }

    Ok(ProcessedDocument {
        text: trimmed,
        chunks,
    })
}

fn split_into_chunks(text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }

    let chars: Vec<char> = text.chars().collect();
    let mut start = 0usize;
    let len = chars.len();
    let mut results = Vec::new();

    while start < len {
        let end = (start + CHUNK_SIZE).min(len);
        let chunk: String = chars[start..end].iter().collect();
        results.push(chunk);

        if end == len {
            break;
        }

        start = if CHUNK_OVERLAP >= CHUNK_SIZE {
            end
        } else {
            end.saturating_sub(CHUNK_OVERLAP)
        };
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repeat(pattern: &str, count: usize) -> String {
        pattern.repeat(count)
    }

    #[test]
    fn short_text_yields_single_chunk() {
        let text = "hello lexai";
        let chunks = split_into_chunks(text);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], text);
    }

    #[test]
    fn long_text_generates_expected_chunk_count() {
        let text = repeat("a", 2_500);
        let chunks = split_into_chunks(&text);
        assert_eq!(chunks.len(), 3);
        let total: usize = chunks.iter().map(|chunk| chunk.len()).sum();
        // Overlaps cause repeated characters, but total length should be original length + overlaps
        assert!(total >= text.len());
    }

    #[test]
    fn overlapping_regions_are_preserved() {
        let mut text = repeat("x", 1_000);
        text.push_str(&repeat("y", 800));
        text.push_str(&repeat("z", 800));
        let chunks = split_into_chunks(&text);
        assert!(chunks.len() >= 3);
        for window in chunks.windows(2) {
            let first = &window[0];
            let second = &window[1];
            let overlap = CHUNK_OVERLAP.min(first.len()).min(second.len());
            let first_tail = &first[first.len() - overlap..];
            let second_head = &second[..overlap];
            assert_eq!(first_tail, second_head);
        }
    }

    #[test]
    fn empty_or_whitespace_text_handled() {
        assert!(split_into_chunks("").is_empty());
        let whitespace = "   \n\t";
        let chunks = split_into_chunks(whitespace);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], whitespace);
    }
}
