#!/usr/bin/env python3
"""
Backend API Test Suite for Class of Happiness App
Testing the creature reward system APIs and translations
"""
import requests
import json
import uuid
from datetime import datetime

# Base URL from environment configuration
BASE_URL = "https://emotion-zones-kids.preview.emergentagent.com/api"

def print_test_result(test_name, success, details=""):
    """Print formatted test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"   Details: {details}")
    if not success:
        print(f"   URL: {BASE_URL}")
    print()

def test_health_check():
    """Test GET /api/ - Health check"""
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        success = response.status_code == 200
        data = response.json() if success else None
        
        if success and data:
            expected_keys = ["message", "status"]
            has_expected = all(key in data for key in expected_keys)
            success = has_expected and data["status"] == "running"
            details = f"Status: {response.status_code}, Data: {data}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            
        print_test_result("GET /api/ - Health check", success, details)
        return success, data
    except Exception as e:
        print_test_result("GET /api/ - Health check", False, f"Exception: {str(e)}")
        return False, None

def test_languages():
    """Test GET /api/languages - Get available languages"""
    try:
        response = requests.get(f"{BASE_URL}/languages", timeout=10)
        success = response.status_code == 200
        
        if success:
            data = response.json()
            # Should return 5 languages: en, es, fr, pt, de
            expected_codes = {"en", "es", "fr", "pt", "de"}
            actual_codes = {lang["code"] for lang in data}
            success = len(data) == 5 and expected_codes == actual_codes
            
            # Verify structure
            if success:
                for lang in data:
                    if not all(key in lang for key in ["code", "name"]):
                        success = False
                        break
            
            details = f"Status: {response.status_code}, Languages: {len(data)}, Codes: {actual_codes}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            
        print_test_result("GET /api/languages - Get available languages", success, details)
        return success, data if success else None
    except Exception as e:
        print_test_result("GET /api/languages - Get available languages", False, f"Exception: {str(e)}")
        return False, None

def test_translation(lang_code, expected_keys=None):
    """Test GET /api/translations/{lang} - Get specific language translations"""
    try:
        response = requests.get(f"{BASE_URL}/translations/{lang_code}", timeout=10)
        success = response.status_code == 200
        
        if success:
            data = response.json()
            
            # Verify key translations exist
            if expected_keys is None:
                expected_keys = ["zones_of_regulation", "student", "teacher", "blue_zone", "green_zone", "yellow_zone", "red_zone"]
            
            has_expected_keys = all(key in data for key in expected_keys)
            success = has_expected_keys and len(data) > 20  # Should have many translation keys
            
            details = f"Status: {response.status_code}, Keys: {len(data)}, Has expected: {has_expected_keys}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            
        print_test_result(f"GET /api/translations/{lang_code} - Get {lang_code.upper()} translations", success, details)
        return success, data if success else None
    except Exception as e:
        print_test_result(f"GET /api/translations/{lang_code} - Get {lang_code.upper()} translations", False, f"Exception: {str(e)}")
        return False, None

def test_subscription_plans():
    """Test GET /api/subscription/plans - Get subscription plans"""
    try:
        response = requests.get(f"{BASE_URL}/subscription/plans", timeout=10)
        success = response.status_code == 200
        
        if success:
            data = response.json()
            
            # Verify structure and expected plans
            expected_plans = {"monthly", "six_month", "annual"}
            expected_prices = {"monthly": 4.99, "six_month": 19.99, "annual": 35.00}
            
            has_plans = "plans" in data and "trial_days" in data
            if has_plans:
                plans = data["plans"]
                actual_plans = set(plans.keys())
                prices_correct = all(
                    plans[plan]["price"] == expected_prices[plan] 
                    for plan in expected_plans if plan in plans
                )
                success = expected_plans == actual_plans and prices_correct
            else:
                success = False
            
            details = f"Status: {response.status_code}, Plans: {list(data.get('plans', {}).keys())}, Trial days: {data.get('trial_days')}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            
        print_test_result("GET /api/subscription/plans - Get subscription plans", success, details)
        return success, data if success else None
    except Exception as e:
        print_test_result("GET /api/subscription/plans - Get subscription plans", False, f"Exception: {str(e)}")
        return False, None

def test_strategy_icons():
    """Test GET /api/strategy-icons - Get available icons for strategies"""
    try:
        response = requests.get(f"{BASE_URL}/strategy-icons", timeout=10)
        success = response.status_code == 200
        
        if success:
            data = response.json()
            
            # Should be a list of icon names
            is_list = isinstance(data, list)
            has_icons = len(data) > 10 if is_list else False  # Should have many icons
            
            # Check for some expected icons
            expected_icons = {"star", "favorite", "chat", "fitness-center", "air"}
            has_expected = expected_icons.issubset(set(data)) if is_list else False
            
            success = is_list and has_icons and has_expected
            details = f"Status: {response.status_code}, Icons count: {len(data) if is_list else 'N/A'}, Type: {type(data)}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            
        print_test_result("GET /api/strategy-icons - Get available icons", success, details)
        return success, data if success else None
    except Exception as e:
        print_test_result("GET /api/strategy-icons - Get available icons", False, f"Exception: {str(e)}")
        return False, None

def test_custom_strategies_crud():
    """Test Custom Strategies CRUD operations"""
    print("=== Testing Custom Strategies CRUD ===")
    
    # First, get a student ID by creating a test student
    test_student_data = {
        "name": "Emma Rodriguez",
        "avatar_type": "preset",
        "avatar_preset": "cat",
        "classroom_id": None
    }
    
    try:
        # Create student for testing
        response = requests.post(f"{BASE_URL}/students", json=test_student_data, timeout=10)
        if response.status_code != 200:
            print_test_result("Create test student for custom strategies", False, f"Status: {response.status_code}")
            return False
        
        student_data = response.json()
        student_id = student_data["id"]
        print(f"Created test student: {student_id}")
        
        # Test 1: CREATE custom strategy
        custom_strategy_data = {
            "student_id": student_id,
            "name": "Deep Ocean Breaths",
            "description": "Imagine breathing like waves in the ocean",
            "zone": "blue",
            "image_type": "icon",
            "icon": "star"
        }
        
        response = requests.post(f"{BASE_URL}/custom-strategies", json=custom_strategy_data, timeout=10)
        create_success = response.status_code == 200
        
        if create_success:
            created_strategy = response.json()
            strategy_id = created_strategy["id"]
            details = f"Status: {response.status_code}, Strategy ID: {strategy_id}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            strategy_id = None
        
        print_test_result("POST /api/custom-strategies - Create custom strategy", create_success, details)
        
        if not create_success or not strategy_id:
            return False
        
        # Test 2: GET custom strategies for student
        response = requests.get(f"{BASE_URL}/custom-strategies?student_id={student_id}", timeout=10)
        get_success = response.status_code == 200
        
        if get_success:
            strategies = response.json()
            found_strategy = any(s["id"] == strategy_id for s in strategies)
            get_success = found_strategy and len(strategies) >= 1
            details = f"Status: {response.status_code}, Strategies found: {len(strategies)}, Contains created: {found_strategy}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/custom-strategies?student_id - Get custom strategies", get_success, details)
        
        # Test 3: UPDATE custom strategy
        update_data = {
            "name": "Calming Ocean Waves",
            "description": "Updated description - feel the peaceful ocean waves"
        }
        
        response = requests.put(f"{BASE_URL}/custom-strategies/{strategy_id}", json=update_data, timeout=10)
        update_success = response.status_code == 200
        
        if update_success:
            updated_strategy = response.json()
            name_updated = updated_strategy["name"] == update_data["name"]
            details = f"Status: {response.status_code}, Name updated: {name_updated}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("PUT /api/custom-strategies/{id} - Update custom strategy", update_success, details)
        
        # Test 4: DELETE custom strategy
        response = requests.delete(f"{BASE_URL}/custom-strategies/{strategy_id}", timeout=10)
        delete_success = response.status_code == 200
        
        if delete_success:
            result = response.json()
            details = f"Status: {response.status_code}, Message: {result.get('message', '')}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("DELETE /api/custom-strategies/{id} - Delete custom strategy", delete_success, details)
        
        # Clean up: delete test student
        requests.delete(f"{BASE_URL}/students/{student_id}", timeout=10)
        
        # Return overall success
        overall_success = create_success and get_success and update_success and delete_success
        return overall_success
        
    except Exception as e:
        print_test_result("Custom Strategies CRUD", False, f"Exception: {str(e)}")
        return False

def test_strategies_with_student_id():
    """Test GET /api/strategies with student_id parameter"""
    try:
        # First, create a test student
        test_student_data = {
            "name": "Alex Thompson",
            "avatar_type": "preset", 
            "avatar_preset": "dog",
            "classroom_id": None
        }
        
        response = requests.post(f"{BASE_URL}/students", json=test_student_data, timeout=10)
        if response.status_code != 200:
            print_test_result("Create test student for strategies test", False, f"Status: {response.status_code}")
            return False
        
        student_data = response.json()
        student_id = student_data["id"]
        
        # Test 1: Get strategies for blue zone with student_id
        response = requests.get(f"{BASE_URL}/strategies?zone=blue&student_id={student_id}", timeout=10)
        success = response.status_code == 200
        
        if success:
            strategies = response.json()
            is_list = isinstance(strategies, list)
            has_strategies = len(strategies) >= 6 if is_list else False  # Should have default blue strategies
            
            # Verify all strategies are for blue zone
            all_blue = all(s.get("zone") == "blue" for s in strategies) if is_list else False
            
            success = is_list and has_strategies and all_blue
            details = f"Status: {response.status_code}, Blue strategies: {len(strategies) if is_list else 'N/A'}, All blue zone: {all_blue}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/strategies?zone=blue&student_id - Get blue zone strategies", success, details)
        
        # Test 2: Get all strategies with student_id (no zone filter)
        response = requests.get(f"{BASE_URL}/strategies?student_id={student_id}", timeout=10)
        all_success = response.status_code == 200
        
        if all_success:
            all_strategies = response.json()
            is_list = isinstance(all_strategies, list)
            has_all_zones = False
            
            if is_list:
                zones = set(s.get("zone") for s in all_strategies)
                expected_zones = {"blue", "green", "yellow", "red"}
                has_all_zones = expected_zones.issubset(zones)
                has_many = len(all_strategies) >= 24  # Should have all default strategies
                all_success = has_all_zones and has_many
            
            details = f"Status: {response.status_code}, Total strategies: {len(all_strategies) if is_list else 'N/A'}, Zones: {zones if is_list else 'N/A'}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/strategies?student_id - Get all strategies with student_id", all_success, details)
        
        # Clean up: delete test student
        requests.delete(f"{BASE_URL}/students/{student_id}", timeout=10)
        
        return success and all_success
        
    except Exception as e:
        print_test_result("GET /api/strategies with student_id", False, f"Exception: {str(e)}")
        return False

def test_reports_endpoints():
    """Test reports endpoints: available months and PDF generation"""
    print("=== Testing Reports Endpoints ===")
    
    # Step 1: Create a test student
    test_student_data = {
        "name": "Test Student",
        "avatar_type": "preset", 
        "avatar_preset": "cat"
    }
    
    try:
        print("Creating test student...")
        response = requests.post(f"{BASE_URL}/students", json=test_student_data, timeout=10)
        if response.status_code != 200:
            print_test_result("Create test student for reports", False, f"Status: {response.status_code}")
            return False
        
        student_data = response.json()
        student_id = student_data["id"]
        print(f"✓ Created test student: {student_id}")
        
        # Step 2: Create some zone logs for the current month (June 2025)
        zone_logs_data = [
            {"student_id": student_id, "zone": "green", "strategies_selected": ["green_1"]},
            {"student_id": student_id, "zone": "yellow", "strategies_selected": ["yellow_1", "yellow_2"]},
            {"student_id": student_id, "zone": "blue", "strategies_selected": ["blue_1"]}
        ]
        
        print("Creating zone logs...")
        log_ids = []
        for log_data in zone_logs_data:
            response = requests.post(f"{BASE_URL}/zone-logs", json=log_data, timeout=10)
            if response.status_code == 200:
                log_result = response.json()
                log_ids.append(log_result["id"])
                print(f"✓ Created zone log: {log_result['zone']} zone")
            else:
                print(f"✗ Failed to create zone log: Status {response.status_code}")
        
        if len(log_ids) < 2:  # Need at least some data
            print_test_result("Create zone logs for testing", False, f"Only created {len(log_ids)} logs")
            return False
        
        print(f"✓ Created {len(log_ids)} zone logs")
        
        # Step 3: Test GET /api/reports/available-months/{student_id}
        print("\nTesting available months endpoint...")
        response = requests.get(f"{BASE_URL}/reports/available-months/{student_id}", timeout=10)
        months_success = response.status_code == 200
        
        if months_success:
            available_months = response.json()
            is_list = isinstance(available_months, list)
            has_data = len(available_months) > 0 if is_list else False
            # Since logs are created with current system time, we should check if we got any months back
            months_success = is_list and has_data
            details = f"Status: {response.status_code}, Months: {available_months if is_list else 'Invalid format'}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/reports/available-months/{student_id}", months_success, details)
        
        # Step 4: Test GET /api/reports/pdf/student/{student_id}/month/{year}/{month}
        print("Testing PDF generation endpoint...")
        # Use the first available month from the months list for PDF testing
        if months_success and available_months:
            test_month_str = available_months[0]  # Format: "YYYY-MM"
            year, month = test_month_str.split('-')
            year, month = int(year), int(month)
        else:
            # Fallback to current date if months endpoint failed
            from datetime import datetime
            now = datetime.now()
            year, month = now.year, now.month
            
        response = requests.get(f"{BASE_URL}/reports/pdf/student/{student_id}/month/{year}/{month}", timeout=15)
        pdf_success = response.status_code == 200
        
        if pdf_success:
            content_type = response.headers.get('content-type', '')
            is_pdf = content_type == 'application/pdf'
            has_content = len(response.content) > 1000  # PDF should be substantial
            content_disposition = response.headers.get('content-disposition', '')
            has_filename = 'filename=' in content_disposition
            
            pdf_success = is_pdf and has_content and has_filename
            details = f"Status: {response.status_code}, Content-Type: {content_type}, Size: {len(response.content)} bytes, Filename: {has_filename}, Month: {year}-{month:02d}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/reports/pdf/student/{student_id}/month/2025/6", pdf_success, details)
        
        # Clean up: delete test student (this will cascade delete logs)
        print("Cleaning up test data...")
        cleanup_response = requests.delete(f"{BASE_URL}/students/{student_id}", timeout=10)
        if cleanup_response.status_code == 200:
            print("✓ Cleanup successful")
        else:
            print("⚠ Cleanup failed, but continuing...")
        
        # Return overall success
        overall_success = months_success and pdf_success
        print(f"\n📊 Reports testing {'PASSED' if overall_success else 'FAILED'}")
        return overall_success
        
    except Exception as e:
        print_test_result("Reports endpoints testing", False, f"Exception: {str(e)}")
        return False

def run_comprehensive_test_suite():
    """Run all backend API tests for new features"""
    print("=" * 60)
    print("ZONES OF REGULATION - COMPREHENSIVE BACKEND API TESTS")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print()
    
    results = {}
    
    # Test all new endpoints
    print("=== CORE API ENDPOINTS ===")
    results["health_check"], _ = test_health_check()
    results["languages"], _ = test_languages()
    results["translation_es"], _ = test_translation("es")
    results["translation_de"], _ = test_translation("de")
    results["subscription_plans"], _ = test_subscription_plans()
    results["strategy_icons"], _ = test_strategy_icons()
    
    print("\n=== CUSTOM STRATEGIES CRUD ===")
    results["custom_strategies_crud"] = test_custom_strategies_crud()
    
    print("\n=== STRATEGIES WITH STUDENT_ID ===")
    results["strategies_with_student_id"] = test_strategies_with_student_id()
    
    print("\n=== REPORTS ENDPOINTS ===")
    results["reports_endpoints"] = test_reports_endpoints()
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for success in results.values() if success)
    total = len(results)
    
    for test_name, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Backend API is fully functional.")
    else:
        failed_tests = [name for name, success in results.items() if not success]
        print(f"⚠️  FAILED TESTS: {', '.join(failed_tests)}")
    
    return passed == total

if __name__ == "__main__":
    success = run_comprehensive_test_suite()
    exit(0 if success else 1)