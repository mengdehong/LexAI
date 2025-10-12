#![allow(unsafe_op_in_unsafe_fn)]

use extractous::Extractor;
use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;

#[pyfunction]
fn hello_from_rust() -> PyResult<String> {
    Ok("Hello from Rust!".to_string())
}

#[pyfunction]
fn extract_text(path: String) -> PyResult<String> {
    Extractor::new()
        .extract_file_to_string(&path)
        .map(|(text, _)| text)
        .map_err(|err| PyRuntimeError::new_err(err.to_string()))
}

#[pymodule]
fn rust_core(_py: Python<'_>, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(hello_from_rust, m)?)?;
    m.add_function(wrap_pyfunction!(extract_text, m)?)?;
    Ok(())
}
