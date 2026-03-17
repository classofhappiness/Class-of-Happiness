#!/usr/bin/env python3
"""
Focused test for Class of Happiness creature reward system APIs
Testing the specific APIs mentioned in the review request
"""
import requests
import json
import uuid
from typing import Dict, Any

# Backend URL from environment
BASE_URL = "https://emotion-zones-kids.preview.emergentagent.com/api"

class RewardSystemTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = []
        self.passed = 0
        self.failed = 0
    
    def log_result(self, test_name: str, passed: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        result = f"{status}: {test_name}"
        if details:
            result += f" - {details}"
        
        self.results.append(result)
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        
        print(result)
    
    def test_translations_en(self):
        """Test GET /api/translations/en - Verify English translations include reward system keys"""
        try:
            response = self.session.get(f"{BASE_URL}/translations/en", timeout=10)
            
            if response.status_code != 200:
                self.log_result("GET /api/translations/en", False, f"HTTP {response.status_code}")
                return
            
            translations = response.json()
            
            # Check for required reward system keys mentioned in review request
            required_reward_keys = [
                "great_job_title",  # "Great Job!"
                "my_creatures",     # "My Creatures"
                "continue"          # "Continue"
            ]
            
            missing_keys = []
            for key in required_reward_keys:
                if key not in translations:
                    missing_keys.append(key)
            
            if missing_keys:
                self.log_result("GET /api/translations/en", False, f"Missing reward system keys: {missing_keys}")
                return
            
            # Verify we have comprehensive translations
            total_keys = len(translations)
            if total_keys < 100:
                self.log_result("GET /api/translations/en", False, f"Only {total_keys} translation keys, expected more")
                return
            
            self.log_result("GET /api/translations/en", True, 
                           f"Contains {total_keys} keys including reward system: {required_reward_keys}")
            
        except Exception as e:
            self.log_result("GET /api/translations/en", False, f"Exception: {str(e)}")
    
    def test_translations_es(self):
        """Test GET /api/translations/es - Verify Spanish translations are complete"""
        try:
            response = self.session.get(f"{BASE_URL}/translations/es", timeout=10)
            
            if response.status_code != 200:
                self.log_result("GET /api/translations/es", False, f"HTTP {response.status_code}")
                return
            
            translations = response.json()
            
            # Check for reward system keys in Spanish
            required_keys = ["great_job_title", "my_creatures", "continue"]
            
            missing_keys = []
            for key in required_keys:
                if key not in translations:
                    missing_keys.append(key)
            
            if missing_keys:
                self.log_result("GET /api/translations/es", False, f"Missing keys: {missing_keys}")
                return
            
            # Verify translations are actually in Spanish
            app_name = translations.get("app_name", "")
            if app_name == "Class of Happiness":  # Should be Spanish
                self.log_result("GET /api/translations/es", False, "Translations appear to be in English, not Spanish")
                return
            
            total_keys = len(translations)
            self.log_result("GET /api/translations/es", True, 
                           f"Contains {total_keys} Spanish translations including reward keys")
            
        except Exception as e:
            self.log_result("GET /api/translations/es", False, f"Exception: {str(e)}")
    
    def test_creatures(self):
        """Test GET /api/creatures - Verify 6 creatures are returned with 4 stages each"""
        try:
            response = self.session.get(f"{BASE_URL}/creatures", timeout=10)
            
            if response.status_code != 200:
                self.log_result("GET /api/creatures", False, f"HTTP {response.status_code}")
                return
            
            data = response.json()
            
            if "creatures" not in data:
                self.log_result("GET /api/creatures", False, "Missing 'creatures' key in response")
                return
            
            creatures = data["creatures"]
            
            # Verify exactly 6 creatures
            if len(creatures) != 6:
                self.log_result("GET /api/creatures", False, f"Expected 6 creatures, got {len(creatures)}")
                return
            
            # Verify each creature has 4 stages
            creature_names = []
            for creature in creatures:
                creature_names.append(creature.get("name", "Unknown"))
                
                if "stages" not in creature:
                    self.log_result("GET /api/creatures", False, f"Creature {creature.get('name')} missing stages")
                    return
                
                stages = creature["stages"]
                if len(stages) != 4:
                    self.log_result("GET /api/creatures", False, 
                                   f"Creature {creature.get('name')} has {len(stages)} stages, expected 4")
                    return
                
                # Verify stage structure (0=egg, 1=baby, 2=teen, 3=adult)
                for i, stage in enumerate(stages):
                    required_fields = ["stage", "name", "emoji", "description", "required_points"]
                    for field in required_fields:
                        if field not in stage:
                            self.log_result("GET /api/creatures", False, 
                                           f"Stage {i} of {creature.get('name')} missing field: {field}")
                            return
                    
                    # Verify stage number matches index
                    if stage["stage"] != i:
                        self.log_result("GET /api/creatures", False, 
                                       f"Stage number mismatch in {creature.get('name')}: expected {i}, got {stage['stage']}")
                        return
            
            # Check points_config is included
            if "points_config" not in data:
                self.log_result("GET /api/creatures", False, "Missing 'points_config' in response")
                return
            
            self.log_result("GET /api/creatures", True, 
                           f"6 creatures with 4 stages each: {creature_names}")
            
        except Exception as e:
            self.log_result("GET /api/creatures", False, f"Exception: {str(e)}")
    
    def test_rewards_new_student(self):
        """Test GET /api/rewards/{student_id} - Test with a new student ID"""
        try:
            # Generate a unique student ID for testing
            test_student_id = f"test_student_{uuid.uuid4().hex[:8]}"
            
            response = self.session.get(f"{BASE_URL}/rewards/{test_student_id}", timeout=10)
            
            if response.status_code != 200:
                self.log_result("GET /api/rewards/{student_id}", False, f"HTTP {response.status_code}: {response.text}")
                return
            
            rewards = response.json()
            
            # Verify response structure
            required_fields = [
                "student_id", "current_creature", "current_stage", 
                "current_points", "total_points_earned", "streak_days"
            ]
            
            for field in required_fields:
                if field not in rewards:
                    self.log_result("GET /api/rewards/{student_id}", False, f"Missing field: {field}")
                    return
            
            # Verify defaults for new student
            if rewards["student_id"] != test_student_id:
                self.log_result("GET /api/rewards/{student_id}", False, "Student ID mismatch")
                return
            
            if rewards["current_stage"] != 0:
                self.log_result("GET /api/rewards/{student_id}", False, f"Expected stage 0, got {rewards['current_stage']}")
                return
            
            if rewards["current_points"] != 0:
                self.log_result("GET /api/rewards/{student_id}", False, f"Expected 0 points, got {rewards['current_points']}")
                return
            
            # Verify creature structure
            creature = rewards.get("current_creature")
            if not creature or "name" not in creature:
                self.log_result("GET /api/rewards/{student_id}", False, "Invalid current_creature data")
                return
            
            self.log_result("GET /api/rewards/{student_id}", True, 
                           f"New student {test_student_id} initialized with creature: {creature['name']}")
            
            # Store for next tests
            self.test_student_id = test_student_id
            
        except Exception as e:
            self.log_result("GET /api/rewards/{student_id}", False, f"Exception: {str(e)}")
    
    def test_add_points_strategy(self):
        """Test POST /api/rewards/{student_id}/add-points - Add points for strategy"""
        try:
            if not hasattr(self, 'test_student_id'):
                self.log_result("POST /api/rewards/{student_id}/add-points (strategy)", False, "No test student ID")
                return
            
            # Add points for using strategies
            payload = {
                "points_type": "strategy",
                "strategy_count": 3
            }
            
            response = self.session.post(
                f"{BASE_URL}/rewards/{self.test_student_id}/add-points",
                json=payload,
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result("POST /api/rewards/{student_id}/add-points (strategy)", False, 
                               f"HTTP {response.status_code}: {response.text}")
                return
            
            result = response.json()
            
            # Verify response structure
            required_fields = [
                "points_added", "current_points", "total_points_earned",
                "current_stage", "current_creature", "streak_days"
            ]
            
            for field in required_fields:
                if field not in result:
                    self.log_result("POST /api/rewards/{student_id}/add-points (strategy)", False, f"Missing field: {field}")
                    return
            
            # Verify points calculation (3 strategies * 10 points)
            # Note: Streak bonus is calculated separately and included in points_added
            expected_strategy_points = 3 * 10  # 30 points for strategies
            streak_bonus = result.get("streak_bonus", 0)  # Variable streak bonus
            total_points_added = expected_strategy_points + streak_bonus
            
            if result["points_added"] != total_points_added:
                self.log_result("POST /api/rewards/{student_id}/add-points (strategy)", False, 
                               f"Expected {total_points_added} points ({expected_strategy_points} + {streak_bonus} streak), got {result['points_added']}")
                return
            
            self.log_result("POST /api/rewards/{student_id}/add-points (strategy)", True, 
                           f"Added {result['points_added']} points (3 strategies + streak bonus)")
            
        except Exception as e:
            self.log_result("POST /api/rewards/{student_id}/add-points (strategy)", False, f"Exception: {str(e)}")
    
    def test_add_points_comment(self):
        """Test POST /api/rewards/{student_id}/add-points - Add points for comment"""
        try:
            if not hasattr(self, 'test_student_id'):
                self.log_result("POST /api/rewards/{student_id}/add-points (comment)", False, "No test student ID")
                return
            
            # Add points for writing a comment
            payload = {
                "points_type": "comment"
            }
            
            response = self.session.post(
                f"{BASE_URL}/rewards/{self.test_student_id}/add-points",
                json=payload,
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result("POST /api/rewards/{student_id}/add-points (comment)", False, 
                               f"HTTP {response.status_code}: {response.text}")
                return
            
            result = response.json()
            
            # Verify comment points (15 points for comment)
            expected_points = 15
            if result["points_added"] != expected_points:
                self.log_result("POST /api/rewards/{student_id}/add-points (comment)", False, 
                               f"Expected {expected_points} points for comment, got {result['points_added']}")
                return
            
            # Verify total accumulation (should be around 45 total points: 30 strategy + 15 comment)
            total_points = result["current_points"]
            if total_points < 40:  # Allow some flexibility for streak bonus differences
                self.log_result("POST /api/rewards/{student_id}/add-points (comment)", False, 
                               f"Expected at least 40 total points, got {total_points}")
                return
            
            self.log_result("POST /api/rewards/{student_id}/add-points (comment)", True, 
                           f"Added {result['points_added']} points for comment. Total: {total_points}")
            
        except Exception as e:
            self.log_result("POST /api/rewards/{student_id}/add-points (comment)", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all reward system API tests"""
        print("🎮 Testing Class of Happiness Creature Reward System APIs")
        print("=" * 60)
        
        # Test the specific APIs mentioned in the review request
        self.test_translations_en()
        self.test_translations_es()
        self.test_creatures()
        self.test_rewards_new_student()
        self.test_add_points_strategy()
        self.test_add_points_comment()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 CREATURE REWARD SYSTEM TEST SUMMARY")
        print("=" * 60)
        
        total_tests = self.passed + self.failed
        success_rate = (self.passed / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {self.passed}")
        print(f"❌ Failed: {self.failed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        print(f"\n📋 Detailed Results:")
        for result in self.results:
            print(f"   {result}")
        
        return self.failed == 0

if __name__ == "__main__":
    tester = RewardSystemTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All creature reward system APIs are working correctly!")
    else:
        print(f"\n⚠️  {tester.failed} API test(s) failed. Check the details above.")
    
    exit(0 if success else 1)