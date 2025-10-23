# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_dynamic_libs, collect_data_files

# Ensure PyO3 extension and its dependent DLLs are bundled (esp. on Windows)
hidden_rust = collect_submodules('rust_core')
hidden_pdf = collect_submodules('pdfminer')
dynlibs_rust = collect_dynamic_libs('rust_core')

# Collect data files for sentence transformers and tokenizers
datas_sentence = collect_data_files('sentence_transformers', include_py_files=True)
datas_tokenizers = collect_data_files('tokenizers', include_py_files=True)

# Explicit hidden imports for all required packages
all_hidden = (
    hidden_rust + 
    hidden_pdf + 
    [
        'qdrant_client',
        'qdrant_client.http',
        'qdrant_client.http.models',
        'qdrant_client.models',
        'sentence_transformers',
        'sentence_transformers.models',
        'sentence_transformers.util',
        'langchain_text_splitters',
        'pydantic',
        'pydantic_settings',
        'pydantic_core',
        'torch',
        'transformers',
        'tokenizers',
        'numpy',
        'huggingface_hub',
    ]
)

a = Analysis(
    ['rpc_server.py'],
    pathex=[],
    binaries=dynlibs_rust,
    datas=datas_sentence + datas_tokenizers,
    hiddenimports=all_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='rpc_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='rpc_server',
)
