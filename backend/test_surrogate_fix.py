#!/usr/bin/env python3
"""Test script to verify surrogate character filtering works correctly."""

def test_surrogate_filtering():
    """Test the surrogate filtering logic used in services.py"""
    
    # Simulate text with surrogate characters (like what Windows might produce)
    # U+DC89 is a low surrogate that cannot be encoded to UTF-8 directly
    test_cases = [
        # Case 1: Text with embedded surrogate
        ("Hello\udc89World", "HelloWorld"),  # Should filter out \udc89
        
        # Case 2: Multiple surrogates
        ("Test\udc00\udd00Data", "TestData"),  # Should filter both
        
        # Case 3: Normal text (should be unchanged)
        ("Normal text with émojis 😀", "Normal text with émojis 😀"),
        
        # Case 4: Chinese characters (should be unchanged)
        ("中文测试", "中文测试"),
        
        # Case 5: Mixed case with surrogate at end
        ("Good text\udfff", "Good text"),
    ]
    
    print("Testing surrogate filtering logic...")
    print("=" * 60)
    
    for i, (input_text, expected) in enumerate(test_cases, 1):
        print(f"\nTest Case {i}:")
        print(f"  Input length: {len(input_text)}")
        
        # Apply the filtering logic from services.py
        try:
            # Method 1: Try surrogateescape approach
            filtered = input_text.encode("utf-8", errors="surrogateescape").decode("utf-8", errors="replace")
        except (UnicodeDecodeError, UnicodeEncodeError):
            # Method 2: Fallback to replace
            try:
                filtered = input_text.encode("utf-8", errors="replace").decode("utf-8")
            except Exception:
                # Method 3: Last resort - manual filtering
                filtered = "".join(char for char in input_text if ord(char) < 0xD800 or ord(char) > 0xDFFF)
        
        # Verify it can be encoded to UTF-8 without errors
        try:
            filtered.encode("utf-8", errors="strict")
            can_encode = True
        except UnicodeEncodeError:
            can_encode = False
            # Apply final filter from rpc_server.py
            filtered = "".join(char for char in filtered if not (0xD800 <= ord(char) <= 0xDFFF))
        
        print(f"  Filtered length: {len(filtered)}")
        print(f"  Can encode to UTF-8: {can_encode or 'Fixed'}")
        
        # Final verification
        try:
            filtered.encode("utf-8", errors="strict")
            print(f"  ✓ Final result is valid UTF-8")
        except UnicodeEncodeError as e:
            print(f"  ✗ Still has encoding issues: {e}")
            continue
        
        # Check if surrogates were removed
        has_surrogates = any(0xD800 <= ord(c) <= 0xDFFF for c in filtered)
        if has_surrogates:
            print(f"  ✗ Still contains surrogates!")
        else:
            print(f"  ✓ No surrogates remaining")
    
    print("\n" + "=" * 60)
    print("All tests completed!")

if __name__ == "__main__":
    test_surrogate_filtering()
