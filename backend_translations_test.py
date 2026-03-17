#!/usr/bin/env python3

import requests
import json
from typing import Dict, Any

# Backend URL
BACKEND_URL = "https://emotion-zones-kids.preview.emergentagent.com/api"

# Required translation keys to verify
REQUIRED_KEYS = [
    "app_name",
    "student", 
    "teacher",
    "parent",
    "no_profiles_yet",
    "create_first_profile",
    "filter_by_classroom",
    "all_students"
]

# Languages to test
LANGUAGES = ["en", "es", "fr", "de", "pt"]

def test_translations_endpoint():
    """Test GET /api/translations/{lang} for all languages and verify key translations"""
    
    print("🧪 TESTING TRANSLATIONS API ENDPOINT")
    print("=" * 60)
    
    all_translations = {}
    results = {}
    
    # Test each language
    for lang in LANGUAGES:
        print(f"\n🌐 Testing language: {lang.upper()}")
        print("-" * 40)
        
        try:
            # Make API call
            url = f"{BACKEND_URL}/translations/{lang}"
            response = requests.get(url, timeout=10)
            
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                translations = response.json()
                all_translations[lang] = translations
                
                # Check if it's a dictionary
                if not isinstance(translations, dict):
                    results[lang] = {"success": False, "error": "Response is not a dictionary"}
                    print(f"❌ FAILED: Response is not a dictionary")
                    continue
                
                # Count total keys
                total_keys = len(translations)
                print(f"📝 Total translation keys: {total_keys}")
                
                # Verify required keys exist
                missing_keys = []
                for key in REQUIRED_KEYS:
                    if key not in translations:
                        missing_keys.append(key)
                        print(f"❌ Missing required key: {key}")
                    else:
                        print(f"✅ Found key '{key}': {translations[key]}")
                
                if missing_keys:
                    results[lang] = {
                        "success": False, 
                        "error": f"Missing required keys: {missing_keys}",
                        "total_keys": total_keys
                    }
                else:
                    results[lang] = {
                        "success": True, 
                        "total_keys": total_keys,
                        "translations": {key: translations[key] for key in REQUIRED_KEYS}
                    }
                    print(f"✅ All required keys found for {lang}")
                
            else:
                results[lang] = {
                    "success": False, 
                    "error": f"HTTP {response.status_code}: {response.text}"
                }
                print(f"❌ FAILED: HTTP {response.status_code}")
                
        except Exception as e:
            results[lang] = {"success": False, "error": str(e)}
            print(f"❌ FAILED: {str(e)}")
    
    # Verify translations are different from English
    print(f"\n🔍 VERIFYING TRANSLATIONS ARE DIFFERENT FROM ENGLISH")
    print("=" * 60)
    
    if "en" in all_translations and all_translations["en"]:
        english_translations = all_translations["en"]
        
        for lang in LANGUAGES:
            if lang == "en":
                continue
                
            if lang in all_translations and all_translations[lang]:
                lang_translations = all_translations[lang]
                print(f"\n🌐 Checking {lang.upper()} vs English:")
                print("-" * 30)
                
                different_count = 0
                same_count = 0
                
                for key in REQUIRED_KEYS:
                    if key in english_translations and key in lang_translations:
                        en_value = english_translations[key]
                        lang_value = lang_translations[key]
                        
                        if en_value != lang_value:
                            print(f"✅ {key}: '{en_value}' → '{lang_value}'")
                            different_count += 1
                        else:
                            print(f"⚠️  {key}: Same as English ('{en_value}')")
                            same_count += 1
                
                if different_count > 0:
                    print(f"✅ {different_count}/{len(REQUIRED_KEYS)} translations are different from English")
                    results[lang]["translation_check"] = "passed"
                else:
                    print(f"❌ No translations are different from English")
                    results[lang]["translation_check"] = "failed"
    
    # Print final summary
    print(f"\n📊 FINAL SUMMARY")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for lang in LANGUAGES:
        if lang in results:
            if results[lang]["success"]:
                print(f"✅ {lang.upper()}: PASSED - {results[lang]['total_keys']} keys")
                passed += 1
            else:
                print(f"❌ {lang.upper()}: FAILED - {results[lang]['error']}")
                failed += 1
        else:
            print(f"❌ {lang.upper()}: NOT TESTED")
            failed += 1
    
    print(f"\n🎯 RESULTS: {passed} PASSED, {failed} FAILED")
    
    return results


def test_invalid_language():
    """Test with invalid language code"""
    print(f"\n🧪 Testing invalid language code...")
    
    try:
        url = f"{BACKEND_URL}/translations/invalid"
        response = requests.get(url, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            translations = response.json()
            # Should fallback to English
            if "app_name" in translations and translations["app_name"] == "Class of Happiness":
                print("✅ Invalid language falls back to English")
                return True
            else:
                print("❌ Invalid language doesn't fallback properly")
                return False
        else:
            print(f"❌ Unexpected response: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error testing invalid language: {e}")
        return False


if __name__ == "__main__":
    print("🚀 Starting Translations API Testing")
    print("=" * 60)
    
    # Test main translations endpoint
    translation_results = test_translations_endpoint()
    
    # Test invalid language fallback
    invalid_lang_result = test_invalid_language()
    
    # Final assessment
    print(f"\n🎉 TRANSLATIONS API TESTING COMPLETE")
    print("=" * 60)
    
    all_passed = all(result["success"] for result in translation_results.values())
    
    if all_passed and invalid_lang_result:
        print("✅ ALL TESTS PASSED - Internationalization system working correctly!")
        exit(0)
    else:
        print("❌ SOME TESTS FAILED - Issues found with translations API")
        exit(1)