#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Zones of Regulation App
Tests all endpoints as specified in the review request
"""

import requests
import json
import uuid
from datetime import datetime

# Backend URL from frontend environment
BACKEND_URL = "https://emotion-zones-kids.preview.emergentagent.com/api"

class ZonesAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.test_results = []
        self.created_student_id = None
        self.created_classroom_id = None
        
    def log_result(self, test_name, success, message, response_data=None):
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if response_data and not success:
            print(f"   Response: {response_data}")
    
    def test_health_check(self):
        """Test GET /api/ - Health check"""
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if data.get("message") == "Zones of Regulation API" and data.get("status") == "running":
                    self.log_result("Health Check", True, f"API is running - {data}")
                else:
                    self.log_result("Health Check", False, f"Unexpected response format: {data}")
            else:
                self.log_result("Health Check", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Health Check", False, f"Connection error: {str(e)}")
    
    def test_get_avatars(self):
        """Test GET /api/avatars - Should return 10 preset avatars"""
        try:
            response = requests.get(f"{self.base_url}/avatars")
            if response.status_code == 200:
                avatars = response.json()
                if len(avatars) == 10:
                    # Verify structure
                    if all('id' in avatar and 'name' in avatar and 'emoji' in avatar for avatar in avatars):
                        self.log_result("Get Avatars", True, f"Retrieved 10 preset avatars correctly")
                    else:
                        self.log_result("Get Avatars", False, "Avatar structure missing required fields")
                else:
                    self.log_result("Get Avatars", False, f"Expected 10 avatars, got {len(avatars)}")
            else:
                self.log_result("Get Avatars", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get Avatars", False, f"Error: {str(e)}")
    
    def test_students_crud(self):
        """Test Student CRUD operations"""
        
        # CREATE Student
        try:
            student_data = {
                "name": "Emma Thompson",
                "avatar_type": "preset",
                "avatar_preset": "dog"
            }
            response = requests.post(f"{self.base_url}/students", json=student_data)
            if response.status_code == 200:
                student = response.json()
                if student.get("name") == "Emma Thompson" and student.get("avatar_preset") == "dog":
                    self.created_student_id = student.get("id")
                    self.log_result("Create Student", True, f"Created student: {student['name']}")
                else:
                    self.log_result("Create Student", False, f"Student data mismatch: {student}")
            else:
                self.log_result("Create Student", False, f"HTTP {response.status_code}: {response.text}")
                return
        except Exception as e:
            self.log_result("Create Student", False, f"Error: {str(e)}")
            return
        
        # READ All Students
        try:
            response = requests.get(f"{self.base_url}/students")
            if response.status_code == 200:
                students = response.json()
                if isinstance(students, list) and len(students) > 0:
                    self.log_result("Get All Students", True, f"Retrieved {len(students)} students")
                else:
                    self.log_result("Get All Students", False, "No students found or invalid response")
            else:
                self.log_result("Get All Students", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get All Students", False, f"Error: {str(e)}")
        
        # READ Specific Student
        if self.created_student_id:
            try:
                response = requests.get(f"{self.base_url}/students/{self.created_student_id}")
                if response.status_code == 200:
                    student = response.json()
                    if student.get("id") == self.created_student_id:
                        self.log_result("Get Specific Student", True, f"Retrieved student: {student['name']}")
                    else:
                        self.log_result("Get Specific Student", False, "Student ID mismatch")
                else:
                    self.log_result("Get Specific Student", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_result("Get Specific Student", False, f"Error: {str(e)}")
        
        # UPDATE Student
        if self.created_student_id:
            try:
                update_data = {"name": "Emma Thompson-Updated"}
                response = requests.put(f"{self.base_url}/students/{self.created_student_id}", json=update_data)
                if response.status_code == 200:
                    student = response.json()
                    if student.get("name") == "Emma Thompson-Updated":
                        self.log_result("Update Student", True, f"Updated student name successfully")
                    else:
                        self.log_result("Update Student", False, f"Name update failed: {student}")
                else:
                    self.log_result("Update Student", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_result("Update Student", False, f"Error: {str(e)}")
    
    def test_classrooms_crud(self):
        """Test Classroom CRUD operations"""
        
        # CREATE Classroom
        try:
            classroom_data = {
                "name": "Grade 3 Lions",
                "teacher_name": "Ms. Johnson"
            }
            response = requests.post(f"{self.base_url}/classrooms", json=classroom_data)
            if response.status_code == 200:
                classroom = response.json()
                if classroom.get("name") == "Grade 3 Lions" and classroom.get("teacher_name") == "Ms. Johnson":
                    self.created_classroom_id = classroom.get("id")
                    self.log_result("Create Classroom", True, f"Created classroom: {classroom['name']}")
                else:
                    self.log_result("Create Classroom", False, f"Classroom data mismatch: {classroom}")
            else:
                self.log_result("Create Classroom", False, f"HTTP {response.status_code}: {response.text}")
                return
        except Exception as e:
            self.log_result("Create Classroom", False, f"Error: {str(e)}")
            return
        
        # READ All Classrooms
        try:
            response = requests.get(f"{self.base_url}/classrooms")
            if response.status_code == 200:
                classrooms = response.json()
                if isinstance(classrooms, list) and len(classrooms) > 0:
                    self.log_result("Get All Classrooms", True, f"Retrieved {len(classrooms)} classrooms")
                else:
                    self.log_result("Get All Classrooms", False, "No classrooms found or invalid response")
            else:
                self.log_result("Get All Classrooms", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get All Classrooms", False, f"Error: {str(e)}")
    
    def test_strategies(self):
        """Test Strategy endpoints"""
        
        # GET All Strategies - should return 24 total
        try:
            response = requests.get(f"{self.base_url}/strategies")
            if response.status_code == 200:
                strategies = response.json()
                if len(strategies) == 24:
                    zones = set(s['zone'] for s in strategies)
                    expected_zones = {'blue', 'green', 'yellow', 'red'}
                    if zones == expected_zones:
                        self.log_result("Get All Strategies", True, f"Retrieved 24 strategies across 4 zones")
                    else:
                        self.log_result("Get All Strategies", False, f"Missing zones. Got: {zones}")
                else:
                    self.log_result("Get All Strategies", False, f"Expected 24 strategies, got {len(strategies)}")
            else:
                self.log_result("Get All Strategies", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get All Strategies", False, f"Error: {str(e)}")
        
        # GET Blue Zone Strategies - should return 6
        try:
            response = requests.get(f"{self.base_url}/strategies?zone=blue")
            if response.status_code == 200:
                strategies = response.json()
                if len(strategies) == 6 and all(s['zone'] == 'blue' for s in strategies):
                    self.log_result("Get Blue Zone Strategies", True, f"Retrieved 6 blue zone strategies")
                else:
                    self.log_result("Get Blue Zone Strategies", False, f"Expected 6 blue strategies, got {len(strategies)}")
            else:
                self.log_result("Get Blue Zone Strategies", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get Blue Zone Strategies", False, f"Error: {str(e)}")
        
        # GET Red Zone Strategies
        try:
            response = requests.get(f"{self.base_url}/strategies?zone=red")
            if response.status_code == 200:
                strategies = response.json()
                if len(strategies) == 6 and all(s['zone'] == 'red' for s in strategies):
                    self.log_result("Get Red Zone Strategies", True, f"Retrieved 6 red zone strategies")
                else:
                    self.log_result("Get Red Zone Strategies", False, f"Expected 6 red strategies, got {len(strategies)}")
            else:
                self.log_result("Get Red Zone Strategies", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get Red Zone Strategies", False, f"Error: {str(e)}")
    
    def test_zone_logs(self):
        """Test Zone Log operations"""
        
        # First create a new student for testing zone logs
        test_student_id = None
        try:
            student_data = {
                "name": "Zone Test Student",
                "avatar_type": "preset",
                "avatar_preset": "cat"
            }
            response = requests.post(f"{self.base_url}/students", json=student_data)
            if response.status_code == 200:
                test_student_id = response.json().get("id")
                self.log_result("Create Student for Zone Logs", True, "Created test student for zone logging")
            else:
                self.log_result("Create Student for Zone Logs", False, f"Failed to create test student")
                return
        except Exception as e:
            self.log_result("Create Student for Zone Logs", False, f"Error: {str(e)}")
            return
        
        # CREATE Zone Log
        try:
            log_data = {
                "student_id": test_student_id,
                "zone": "green",
                "strategies_selected": ["green_1"]
            }
            response = requests.post(f"{self.base_url}/zone-logs", json=log_data)
            if response.status_code == 200:
                log = response.json()
                if log.get("student_id") == test_student_id and log.get("zone") == "green":
                    self.log_result("Create Zone Log", True, f"Created zone log for student")
                else:
                    self.log_result("Create Zone Log", False, f"Zone log data mismatch: {log}")
            else:
                self.log_result("Create Zone Log", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Create Zone Log", False, f"Error: {str(e)}")
        
        # GET All Zone Logs
        try:
            response = requests.get(f"{self.base_url}/zone-logs")
            if response.status_code == 200:
                logs = response.json()
                if isinstance(logs, list):
                    self.log_result("Get All Zone Logs", True, f"Retrieved {len(logs)} zone logs")
                else:
                    self.log_result("Get All Zone Logs", False, "Invalid response format")
            else:
                self.log_result("Get All Zone Logs", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get All Zone Logs", False, f"Error: {str(e)}")
        
        # GET Zone Logs for Specific Student
        if test_student_id:
            try:
                response = requests.get(f"{self.base_url}/zone-logs/student/{test_student_id}")
                if response.status_code == 200:
                    logs = response.json()
                    if isinstance(logs, list):
                        self.log_result("Get Student Zone Logs", True, f"Retrieved {len(logs)} logs for student")
                    else:
                        self.log_result("Get Student Zone Logs", False, "Invalid response format")
                else:
                    self.log_result("Get Student Zone Logs", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_result("Get Student Zone Logs", False, f"Error: {str(e)}")
    
    def test_analytics(self):
        """Test Analytics endpoints"""
        
        # Create a student and classroom for analytics testing
        analytics_student_id = None
        analytics_classroom_id = None
        
        # Create classroom first
        try:
            classroom_data = {
                "name": "Analytics Test Class",
                "teacher_name": "Mr. Analytics"
            }
            response = requests.post(f"{self.base_url}/classrooms", json=classroom_data)
            if response.status_code == 200:
                analytics_classroom_id = response.json().get("id")
            else:
                self.log_result("Create Analytics Classroom", False, f"Failed to create classroom")
        except Exception as e:
            self.log_result("Create Analytics Classroom", False, f"Error: {str(e)}")
        
        # Create student and assign to classroom
        try:
            student_data = {
                "name": "Analytics Student",
                "avatar_type": "preset",
                "avatar_preset": "bear",
                "classroom_id": analytics_classroom_id
            }
            response = requests.post(f"{self.base_url}/students", json=student_data)
            if response.status_code == 200:
                analytics_student_id = response.json().get("id")
            else:
                self.log_result("Create Analytics Student", False, f"Failed to create student")
                return
        except Exception as e:
            self.log_result("Create Analytics Student", False, f"Error: {str(e)}")
            return
        
        # Test Student Analytics
        if analytics_student_id:
            try:
                response = requests.get(f"{self.base_url}/analytics/student/{analytics_student_id}?days=7")
                if response.status_code == 200:
                    analytics = response.json()
                    required_fields = ["zone_counts", "total_logs", "strategy_counts", "daily_data", "period_days"]
                    if all(field in analytics for field in required_fields):
                        zone_counts = analytics.get("zone_counts", {})
                        expected_zones = {"blue", "green", "yellow", "red"}
                        if set(zone_counts.keys()) == expected_zones:
                            self.log_result("Get Student Analytics", True, f"Analytics data structure correct")
                        else:
                            self.log_result("Get Student Analytics", False, f"Missing zone data in analytics")
                    else:
                        self.log_result("Get Student Analytics", False, f"Missing required fields in analytics")
                else:
                    self.log_result("Get Student Analytics", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_result("Get Student Analytics", False, f"Error: {str(e)}")
        
        # Test Classroom Analytics
        if analytics_classroom_id:
            try:
                response = requests.get(f"{self.base_url}/analytics/classroom/{analytics_classroom_id}?days=7")
                if response.status_code == 200:
                    analytics = response.json()
                    required_fields = ["zone_counts", "total_logs", "students_count", "daily_data", "student_breakdown"]
                    if all(field in analytics for field in required_fields):
                        self.log_result("Get Classroom Analytics", True, f"Classroom analytics structure correct")
                    else:
                        self.log_result("Get Classroom Analytics", False, f"Missing required fields in classroom analytics")
                else:
                    self.log_result("Get Classroom Analytics", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_result("Get Classroom Analytics", False, f"Error: {str(e)}")
    
    def cleanup_test_data(self):
        """Clean up test data created during testing"""
        # Delete created student
        if self.created_student_id:
            try:
                response = requests.delete(f"{self.base_url}/students/{self.created_student_id}")
                if response.status_code == 200:
                    self.log_result("Delete Test Student", True, "Cleaned up test student")
                else:
                    self.log_result("Delete Test Student", False, f"Failed to delete student: {response.text}")
            except Exception as e:
                self.log_result("Delete Test Student", False, f"Error: {str(e)}")
        
        # Delete created classroom
        if self.created_classroom_id:
            try:
                response = requests.delete(f"{self.base_url}/classrooms/{self.created_classroom_id}")
                if response.status_code == 200:
                    self.log_result("Delete Test Classroom", True, "Cleaned up test classroom")
                else:
                    self.log_result("Delete Test Classroom", False, f"Failed to delete classroom: {response.text}")
            except Exception as e:
                self.log_result("Delete Test Classroom", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all API tests"""
        print(f"🔥 Starting Zones of Regulation API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        self.test_health_check()
        self.test_get_avatars()
        self.test_students_crud()
        self.test_classrooms_crud()
        self.test_strategies()
        self.test_zone_logs()
        self.test_analytics()
        self.cleanup_test_data()
        
        print("=" * 60)
        print(f"🏁 Testing Complete")
        
        # Summary
        passed = len([r for r in self.test_results if r['success']])
        failed = len([r for r in self.test_results if not r['success']])
        
        print(f"\n📊 TEST SUMMARY:")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📝 Total: {len(self.test_results)}")
        
        if failed > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"   • {result['test']}: {result['message']}")
        
        return failed == 0

if __name__ == "__main__":
    tester = ZonesAPITester()
    success = tester.run_all_tests()
    
    if success:
        print(f"\n🎉 ALL TESTS PASSED! The Zones of Regulation API is working correctly.")
    else:
        print(f"\n⚠️  Some tests failed. Please check the results above.")