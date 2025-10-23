#!/usr/bin/env python3
"""Test script to verify Chinese character handling in file paths."""

import sys
import os
from pathlib import Path
import tempfile

def test_chinese_path_handling():
    """Test that we can create and read files with Chinese characters in the path."""
    print("Testing Chinese character path handling...")
    print(f"Python version: {sys.version}")
    print(f"Platform: {sys.platform}")
    print(f"Default encoding: {sys.getdefaultencoding()}")
    print(f"Filesystem encoding: {sys.getfilesystemencoding()}")
    print()
    
    # Test files with Chinese characters
    test_filenames = [
        "命令.md",
        "Agent架构指南.md",
        "测试文档.txt",
        "中文-English混合.md",
    ]
    
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"Temporary directory: {tmpdir}")
        
        for filename in test_filenames:
            print(f"\nTesting: {filename}")
            
            # Create file with Chinese name
            file_path = Path(tmpdir) / filename
            content = f"Test content for {filename}\n测试内容\n"
            
            try:
                # Write file
                file_path.write_text(content, encoding='utf-8')
                print(f"  ✓ Created file: {file_path}")
                
                # Check if file exists
                if file_path.exists():
                    print(f"  ✓ File exists")
                else:
                    print(f"  ✗ File NOT found")
                    continue
                
                # Read file
                read_content = file_path.read_text(encoding='utf-8')
                if read_content == content:
                    print(f"  ✓ Content matches")
                else:
                    print(f"  ✗ Content mismatch")
                
                # Test path encoding
                path_str = str(file_path)
                print(f"  Path string: {repr(path_str)}")
                
                # Verify the path can be encoded to UTF-8
                try:
                    path_bytes = path_str.encode('utf-8')
                    print(f"  ✓ UTF-8 encoding successful ({len(path_bytes)} bytes)")
                except UnicodeEncodeError as e:
                    print(f"  ✗ UTF-8 encoding failed: {e}")
                
                # Test Path operations
                print(f"  File name: {file_path.name}")
                print(f"  Stem: {file_path.stem}")
                print(f"  Suffix: {file_path.suffix}")
                
            except Exception as e:
                print(f"  ✗ Error: {e}")
                import traceback
                traceback.print_exc()
    
    print("\n" + "="*60)
    print("Test completed!")

if __name__ == "__main__":
    test_chinese_path_handling()
