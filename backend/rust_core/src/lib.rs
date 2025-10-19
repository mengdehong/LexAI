#![allow(unsafe_op_in_unsafe_fn)]

use pdf_extract::{OutputError, extract_text as pdf_extract_text};
use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;

#[pyfunction]
fn hello_from_rust() -> PyResult<String> {
    Ok("Hello from Rust!".to_string())
}

#[pyfunction]
fn extract_text(path: String) -> PyResult<String> {
    match pdf_extract_text(&path) {
        Ok(text) => Ok(text),
        Err(OutputError::PdfError(err)) if err.to_string().contains("encrypted") => Err(
            PyRuntimeError::new_err("PDF is encrypted and cannot be parsed"),
        ),
        Err(err) => Err(PyRuntimeError::new_err(err.to_string())),
    }
}

#[pymodule]
fn rust_core(_py: Python<'_>, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(hello_from_rust, m)?)?;
    m.add_function(wrap_pyfunction!(extract_text, m)?)?;
    Ok(())
}
