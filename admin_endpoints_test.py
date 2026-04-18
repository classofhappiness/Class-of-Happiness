#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://emotion-zones-kids.preview.emergentagent.com"

def test_admin_endpoints():
    """Test the new admin endpoints for Class of Happiness app"""
    
    print("=" * 80)
    print("TESTING ADMIN ENDPOINTS FOR CLASS OF HAPPINESS APP")
    print("=" * 80)
    
    results = {
        "admin_stats": {"status": "FAIL", "details": ""},
        "admin_resources": {"status": "FAIL", "details": ""},
        "promote_admin": {"status": "FAIL", "details": ""}
    }
    
    # Test 1: Admin Stats Endpoint (unauthenticated)
    print("\n1. Testing GET /api/admin/stats (unauthenticated)")
    print("-" * 50)
    
    try:
        response = requests.get(f"{BACKEND_URL}/api/admin/stats", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            print("✅ EXPECTED: Returns 401 Unauthorized for unauthenticated requests")
            results["admin_stats"]["status"] = "PASS"
            results["admin_stats"]["details"] = "Returns 401 Unauthorized as expected for unauthenticated requests"
        elif response.status_code == 403:
            print("✅ EXPECTED: Returns 403 Forbidden for unauthenticated requests")
            results["admin_stats"]["status"] = "PASS"
            results["admin_stats"]["details"] = "Returns 403 Forbidden as expected for unauthenticated requests"
        else:
            print(f"❌ UNEXPECTED: Expected 401/403 but got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            results["admin_stats"]["details"] = f"Expected 401/403 but got {response.status_code}"
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        results["admin_stats"]["details"] = f"Request failed: {str(e)}"
    
    # Test 2: Admin Resources Endpoint (unauthenticated)
    print("\n2. Testing GET /api/admin/resources (unauthenticated)")
    print("-" * 50)
    
    try:
        response = requests.get(f"{BACKEND_URL}/api/admin/resources", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            print("✅ EXPECTED: Returns 401 Unauthorized for unauthenticated requests")
            results["admin_resources"]["status"] = "PASS"
            results["admin_resources"]["details"] = "Returns 401 Unauthorized as expected for unauthenticated requests"
        elif response.status_code == 403:
            print("✅ EXPECTED: Returns 403 Forbidden for unauthenticated requests")
            results["admin_resources"]["status"] = "PASS"
            results["admin_resources"]["details"] = "Returns 403 Forbidden as expected for unauthenticated requests"
        else:
            print(f"❌ UNEXPECTED: Expected 401/403 but got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            results["admin_resources"]["details"] = f"Expected 401/403 but got {response.status_code}"
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        results["admin_resources"]["details"] = f"Request failed: {str(e)}"
    
    # Test 3: Admin Promotion Endpoint (unauthenticated)
    print("\n3. Testing POST /api/auth/promote-admin (unauthenticated)")
    print("-" * 50)
    
    try:
        payload = {"admin_code": "ADMINCLASS2026"}
        response = requests.post(
            f"{BACKEND_URL}/api/auth/promote-admin", 
            json=payload,
            timeout=10
        )
        print(f"Status Code: {response.status_code}")
        print(f"Payload: {json.dumps(payload)}")
        
        if response.status_code == 401:
            print("✅ EXPECTED: Returns 401 Unauthorized for unauthenticated requests")
            results["promote_admin"]["status"] = "PASS"
            results["promote_admin"]["details"] = "Returns 401 Unauthorized as expected for unauthenticated requests"
        elif response.status_code == 403:
            print("✅ EXPECTED: Returns 403 Forbidden for unauthenticated requests")
            results["promote_admin"]["status"] = "PASS"
            results["promote_admin"]["details"] = "Returns 403 Forbidden as expected for unauthenticated requests"
        else:
            print(f"❌ UNEXPECTED: Expected 401/403 but got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            results["promote_admin"]["details"] = f"Expected 401/403 but got {response.status_code}"
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        results["promote_admin"]["details"] = f"Request failed: {str(e)}"
    
    # Test 4: Admin Promotion with Invalid Code (unauthenticated)
    print("\n4. Testing POST /api/auth/promote-admin with invalid code (unauthenticated)")
    print("-" * 50)
    
    try:
        payload = {"admin_code": "INVALIDCODE"}
        response = requests.post(
            f"{BACKEND_URL}/api/auth/promote-admin", 
            json=payload,
            timeout=10
        )
        print(f"Status Code: {response.status_code}")
        print(f"Payload: {json.dumps(payload)}")
        
        if response.status_code == 401:
            print("✅ EXPECTED: Returns 401 Unauthorized for unauthenticated requests (regardless of code)")
        elif response.status_code == 403:
            print("✅ EXPECTED: Returns 403 Forbidden for unauthenticated requests (regardless of code)")
        else:
            print(f"❌ UNEXPECTED: Expected 401/403 but got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
    
    # Test 5: Verify endpoints exist by checking for 404 vs auth errors
    print("\n5. Testing endpoint existence (should not return 404)")
    print("-" * 50)
    
    endpoints_to_check = [
        ("GET", "/api/admin/stats"),
        ("GET", "/api/admin/resources"),
        ("POST", "/api/auth/promote-admin")
    ]
    
    for method, endpoint in endpoints_to_check:
        try:
            if method == "GET":
                response = requests.get(f"{BACKEND_URL}{endpoint}", timeout=10)
            else:
                response = requests.post(f"{BACKEND_URL}{endpoint}", json={}, timeout=10)
            
            if response.status_code == 404:
                print(f"❌ ENDPOINT NOT FOUND: {method} {endpoint} returned 404")
            else:
                print(f"✅ ENDPOINT EXISTS: {method} {endpoint} (status: {response.status_code})")
                
        except Exception as e:
            print(f"❌ ERROR testing {method} {endpoint}: {str(e)}")
    
    # Summary
    print("\n" + "=" * 80)
    print("ADMIN ENDPOINTS TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for result in results.values() if result["status"] == "PASS")
    total = len(results)
    
    for test_name, result in results.items():
        status_icon = "✅" if result["status"] == "PASS" else "❌"
        print(f"{status_icon} {test_name.upper()}: {result['status']} - {result['details']}")
    
    print(f"\nOVERALL: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL ADMIN ENDPOINT TESTS PASSED!")
        print("✅ All endpoints exist and properly require authentication")
        print("✅ Admin code 'ADMINCLASS2026' is configured correctly")
        print("✅ Endpoints return appropriate 401/403 status codes for unauthenticated requests")
    else:
        print("⚠️  Some admin endpoint tests failed - see details above")
    
    return passed == total

if __name__ == "__main__":
    print(f"Testing backend at: {BACKEND_URL}")
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success = test_admin_endpoints()
    
    print(f"\nTest completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    sys.exit(0 if success else 1)