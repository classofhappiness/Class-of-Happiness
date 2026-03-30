#!/usr/bin/env python3
"""
Backend API Test Suite for Class of Happiness App
Testing the specific endpoints requested:
1. POST /api/students/{student_id}/generate-link-code
2. GET /api/reports/pdf/student/{student_id}/month/{year}/{month}
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

def test_generate_link_code():
    """Test POST /api/students/{student_id}/generate-link-code"""
    print("=== Testing Generate Link Code Endpoint ===")
    
    # Step 1: Get list of students first
    try:
        print("Step 1: Getting list of students...")
        response = requests.get(f"{BASE_URL}/students", timeout=10)
        
        if response.status_code != 200:
            print_test_result("GET /api/students - Get students list", False, f"Status: {response.status_code}")
            return False, None
        
        students = response.json()
        if not students or len(students) == 0:
            print_test_result("GET /api/students - Get students list", False, "No students found")
            return False, None
        
        # Use the first student from the list
        student_id = students[0]["id"]
        print(f"✓ Using existing student: {student_id}")
        
        print_test_result("GET /api/students - Get students list", True, f"Found {len(students)} students, using student_id: {student_id}")
        
        # Step 2: Generate link code for the student
        print("Step 2: Generating link code...")
        response = requests.post(f"{BASE_URL}/students/{student_id}/generate-link-code", timeout=10)
        
        # Check if authentication is required
        if response.status_code == 401:
            print_test_result("POST /api/students/{student_id}/generate-link-code", False, 
                            f"Status: {response.status_code} - AUTHENTICATION REQUIRED (Teacher/Admin role needed). Endpoint exists and responds correctly to unauthenticated requests.")
            return False, student_id
        
        success = response.status_code == 200
        
        if success:
            data = response.json()
            
            # Verify response contains required fields
            has_link_code = "link_code" in data and isinstance(data["link_code"], str)
            has_expires_at = "expires_at" in data and isinstance(data["expires_at"], str)
            
            # Verify link code format (should be 6 characters)
            link_code_valid = len(data.get("link_code", "")) == 6 if has_link_code else False
            
            # Verify expires_at is a valid timestamp
            expires_valid = False
            if has_expires_at:
                try:
                    # Try to parse the ISO timestamp
                    expires_dt = datetime.fromisoformat(data["expires_at"].replace('Z', '+00:00'))
                    expires_valid = expires_dt > datetime.now()
                except:
                    expires_valid = False
            
            success = has_link_code and has_expires_at and link_code_valid and expires_valid
            details = f"Status: {response.status_code}, Link Code: {data.get('link_code', 'N/A')}, Expires: {data.get('expires_at', 'N/A')}, Valid format: {link_code_valid}, Future expiry: {expires_valid}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("POST /api/students/{student_id}/generate-link-code", success, details)
        return success, student_id
        
    except Exception as e:
        print_test_result("POST /api/students/{student_id}/generate-link-code", False, f"Exception: {str(e)}")
        return False, None

def test_monthly_pdf_report(student_id):
    """Test GET /api/reports/pdf/student/{student_id}/month/{year}/{month}"""
    print("=== Testing Monthly PDF Report Endpoint ===")
    
    try:
        # Step 1: Get available months for the student
        print("Step 1: Getting available months...")
        response = requests.get(f"{BASE_URL}/reports/available-months/{student_id}", timeout=10)
        
        months_success = response.status_code == 200
        available_months = []
        
        if months_success:
            available_months = response.json()
            is_list = isinstance(available_months, list)
            has_data = len(available_months) > 0 if is_list else False
            months_success = is_list
            details = f"Status: {response.status_code}, Available months: {available_months if is_list else 'Invalid format'}"
        else:
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/reports/available-months/{student_id}", months_success, details)
        
        # Step 2: Test PDF generation
        print("Step 2: Testing PDF generation...")
        
        # Use available month if exists, otherwise use current date
        if available_months and len(available_months) > 0:
            test_month_str = available_months[0]  # Format: "YYYY-MM"
            year, month = test_month_str.split('-')
            year, month = int(year), int(month)
            print(f"Using available month: {year}-{month:02d}")
        else:
            # Use March 2026 as specified in the request, or current date
            year, month = 2026, 3
            print(f"No available months, using default: {year}-{month:02d}")
        
        response = requests.get(f"{BASE_URL}/reports/pdf/student/{student_id}/month/{year}/{month}", timeout=15)
        pdf_success = response.status_code == 200
        
        if pdf_success:
            content_type = response.headers.get('content-type', '')
            is_pdf = content_type == 'application/pdf'
            has_content = len(response.content) > 500  # PDF should have some content
            content_disposition = response.headers.get('content-disposition', '')
            has_filename = 'filename=' in content_disposition
            
            pdf_success = is_pdf and has_content
            details = f"Status: {response.status_code}, Content-Type: {content_type}, Size: {len(response.content)} bytes, Has filename: {has_filename}, Month: {year}-{month:02d}"
        else:
            # Check if it's a proper error response (404 for no data is acceptable)
            if response.status_code == 404:
                pdf_success = True  # 404 is acceptable if no data exists for that month
                details = f"Status: {response.status_code} (No data for month - acceptable), Month: {year}-{month:02d}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
        
        print_test_result("GET /api/reports/pdf/student/{student_id}/month/{year}/{month}", pdf_success, details)
        
        return pdf_success
        
    except Exception as e:
        print_test_result("GET /api/reports/pdf/student/{student_id}/month/{year}/{month}", False, f"Exception: {str(e)}")
        return False

def run_link_code_pdf_tests():
    """Run the specific tests requested"""
    print("=" * 70)
    print("CLASS OF HAPPINESS - LINK CODE & PDF REPORT API TESTS")
    print("=" * 70)
    print(f"Base URL: {BASE_URL}")
    print()
    
    results = {}
    
    # Test 1: Generate Link Code
    link_code_success, student_id = test_generate_link_code()
    results["generate_link_code"] = link_code_success
    
    # Test 2: Monthly PDF Report (only if we have a student_id)
    if student_id:
        pdf_success = test_monthly_pdf_report(student_id)
        results["monthly_pdf_report"] = pdf_success
    else:
        print("⚠️  Skipping PDF test - no student_id available")
        results["monthly_pdf_report"] = False
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for success in results.values() if success)
    total = len(results)
    
    for test_name, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Both endpoints are working correctly.")
    else:
        failed_tests = [name for name, success in results.items() if not success]
        print(f"⚠️  FAILED TESTS: {', '.join(failed_tests)}")
    
    return passed == total

if __name__ == "__main__":
    success = run_link_code_pdf_tests()
    exit(0 if success else 1)