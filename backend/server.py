from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ================== MODELS ==================

class Student(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    avatar_type: str = "preset"  # "preset" or "custom"
    avatar_preset: Optional[str] = "cat"  # preset avatar name
    avatar_custom: Optional[str] = None  # base64 custom image
    classroom_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StudentCreate(BaseModel):
    name: str
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "cat"
    avatar_custom: Optional[str] = None
    classroom_id: Optional[str] = None

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    avatar_type: Optional[str] = None
    avatar_preset: Optional[str] = None
    avatar_custom: Optional[str] = None
    classroom_id: Optional[str] = None

class Classroom(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    teacher_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClassroomCreate(BaseModel):
    name: str
    teacher_name: Optional[str] = None

class ZoneLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    zone: str  # "blue", "green", "yellow", "red"
    strategies_selected: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ZoneLogCreate(BaseModel):
    student_id: str
    zone: str
    strategies_selected: List[str] = []

class Strategy(BaseModel):
    id: str
    name: str
    description: str
    zone: str
    image_url: Optional[str] = None
    icon: str = "star"

# ================== PRESET AVATARS ==================
PRESET_AVATARS = [
    {"id": "cat", "name": "Cat", "emoji": "🐱"},
    {"id": "dog", "name": "Dog", "emoji": "🐶"},
    {"id": "bear", "name": "Bear", "emoji": "🐻"},
    {"id": "bunny", "name": "Bunny", "emoji": "🐰"},
    {"id": "lion", "name": "Lion", "emoji": "🦁"},
    {"id": "panda", "name": "Panda", "emoji": "🐼"},
    {"id": "monkey", "name": "Monkey", "emoji": "🐵"},
    {"id": "unicorn", "name": "Unicorn", "emoji": "🦄"},
    {"id": "star", "name": "Star", "emoji": "⭐"},
    {"id": "rainbow", "name": "Rainbow", "emoji": "🌈"},
]

# ================== STRATEGIES DATA ==================
STRATEGIES = [
    # Blue Zone (Low energy - sad, tired, bored)
    {"id": "blue_1", "name": "Get Moving", "description": "Stretch or do some jumping jacks", "zone": "blue", "icon": "fitness-center"},
    {"id": "blue_2", "name": "Talk to Someone", "description": "Share how you feel with a friend or teacher", "zone": "blue", "icon": "chat"},
    {"id": "blue_3", "name": "Drink Water", "description": "Have a refreshing drink of water", "zone": "blue", "icon": "local-drink"},
    {"id": "blue_4", "name": "Take a Break", "description": "Rest for a few minutes", "zone": "blue", "icon": "weekend"},
    {"id": "blue_5", "name": "Listen to Music", "description": "Put on your favorite upbeat song", "zone": "blue", "icon": "music-note"},
    {"id": "blue_6", "name": "Go Outside", "description": "Get some fresh air", "zone": "blue", "icon": "wb-sunny"},
    
    # Green Zone (Ready to learn - calm, happy, focused)
    {"id": "green_1", "name": "Keep Going!", "description": "You're doing great, stay focused", "zone": "green", "icon": "thumb-up"},
    {"id": "green_2", "name": "Deep Breaths", "description": "Take 3 slow, deep breaths", "zone": "green", "icon": "air"},
    {"id": "green_3", "name": "Stay Focused", "description": "Keep your eyes on your work", "zone": "green", "icon": "visibility"},
    {"id": "green_4", "name": "High Five!", "description": "Give yourself a high five", "zone": "green", "icon": "pan-tool"},
    {"id": "green_5", "name": "Help Others", "description": "Share your calm energy", "zone": "green", "icon": "favorite"},
    {"id": "green_6", "name": "Smile", "description": "Keep that happy feeling", "zone": "green", "icon": "sentiment-very-satisfied"},
    
    # Yellow Zone (Heightened - frustrated, worried, silly, excited)
    {"id": "yellow_1", "name": "Count to 10", "description": "Slowly count from 1 to 10", "zone": "yellow", "icon": "filter-9-plus"},
    {"id": "yellow_2", "name": "Deep Breaths", "description": "Breathe in for 4, out for 4", "zone": "yellow", "icon": "air"},
    {"id": "yellow_3", "name": "Squeeze Ball", "description": "Squeeze a stress ball or fidget", "zone": "yellow", "icon": "sports-baseball"},
    {"id": "yellow_4", "name": "Walk Away", "description": "Take a short walk to calm down", "zone": "yellow", "icon": "directions-walk"},
    {"id": "yellow_5", "name": "Get Water", "description": "Take a drink of water", "zone": "yellow", "icon": "local-drink"},
    {"id": "yellow_6", "name": "Think Happy", "description": "Think of something that makes you happy", "zone": "yellow", "icon": "wb-sunny"},
    
    # Red Zone (Extreme - angry, terrified, out of control)
    {"id": "red_1", "name": "STOP", "description": "Stop and freeze your body", "zone": "red", "icon": "pan-tool"},
    {"id": "red_2", "name": "Breathe Deep", "description": "Take 5 very slow breaths", "zone": "red", "icon": "air"},
    {"id": "red_3", "name": "Count Back", "description": "Count backwards from 10 to 1", "zone": "red", "icon": "exposure-neg-1"},
    {"id": "red_4", "name": "Safe Space", "description": "Go to your calm down corner", "zone": "red", "icon": "home"},
    {"id": "red_5", "name": "Ask for Help", "description": "Tell an adult you need help", "zone": "red", "icon": "support-agent"},
    {"id": "red_6", "name": "Hug Yourself", "description": "Give yourself a big hug", "zone": "red", "icon": "favorite"},
]

# ================== ROUTES ==================

@api_router.get("/")
async def root():
    return {"message": "Zones of Regulation API", "status": "running"}

# ---- Avatars ----
@api_router.get("/avatars")
async def get_preset_avatars():
    return PRESET_AVATARS

# ---- Students ----
@api_router.post("/students", response_model=Student)
async def create_student(student: StudentCreate):
    student_dict = student.dict()
    student_obj = Student(**student_dict)
    await db.students.insert_one(student_obj.dict())
    return student_obj

@api_router.get("/students", response_model=List[Student])
async def get_students(classroom_id: Optional[str] = None):
    query = {}
    if classroom_id:
        query["classroom_id"] = classroom_id
    students = await db.students.find(query).to_list(1000)
    return [Student(**s) for s in students]

@api_router.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: str):
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return Student(**student)

@api_router.put("/students/{student_id}", response_model=Student)
async def update_student(student_id: str, update: StudentUpdate):
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if update_data:
        await db.students.update_one({"id": student_id}, {"$set": update_data})
    
    updated = await db.students.find_one({"id": student_id})
    return Student(**updated)

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str):
    result = await db.students.delete_one({"id": student_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    # Also delete their zone logs
    await db.zone_logs.delete_many({"student_id": student_id})
    return {"message": "Student deleted successfully"}

# ---- Classrooms ----
@api_router.post("/classrooms", response_model=Classroom)
async def create_classroom(classroom: ClassroomCreate):
    classroom_dict = classroom.dict()
    classroom_obj = Classroom(**classroom_dict)
    await db.classrooms.insert_one(classroom_obj.dict())
    return classroom_obj

@api_router.get("/classrooms", response_model=List[Classroom])
async def get_classrooms():
    classrooms = await db.classrooms.find().to_list(1000)
    return [Classroom(**c) for c in classrooms]

@api_router.get("/classrooms/{classroom_id}", response_model=Classroom)
async def get_classroom(classroom_id: str):
    classroom = await db.classrooms.find_one({"id": classroom_id})
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return Classroom(**classroom)

@api_router.delete("/classrooms/{classroom_id}")
async def delete_classroom(classroom_id: str):
    result = await db.classrooms.delete_one({"id": classroom_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Classroom not found")
    # Remove classroom reference from students
    await db.students.update_many({"classroom_id": classroom_id}, {"$set": {"classroom_id": None}})
    return {"message": "Classroom deleted successfully"}

# ---- Strategies ----
@api_router.get("/strategies")
async def get_strategies(zone: Optional[str] = None):
    if zone:
        return [s for s in STRATEGIES if s["zone"] == zone]
    return STRATEGIES

# ---- Zone Logs ----
@api_router.post("/zone-logs", response_model=ZoneLog)
async def create_zone_log(log: ZoneLogCreate):
    # Verify student exists
    student = await db.students.find_one({"id": log.student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    log_dict = log.dict()
    log_obj = ZoneLog(**log_dict)
    await db.zone_logs.insert_one(log_obj.dict())
    return log_obj

@api_router.get("/zone-logs", response_model=List[ZoneLog])
async def get_zone_logs(
    student_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    days: int = 7
):
    # Calculate date range
    start_date = datetime.utcnow() - timedelta(days=days)
    
    query = {"timestamp": {"$gte": start_date}}
    
    if student_id:
        query["student_id"] = student_id
    elif classroom_id:
        # Get all students in classroom
        students = await db.students.find({"classroom_id": classroom_id}).to_list(1000)
        student_ids = [s["id"] for s in students]
        query["student_id"] = {"$in": student_ids}
    
    logs = await db.zone_logs.find(query).sort("timestamp", -1).to_list(1000)
    return [ZoneLog(**log) for log in logs]

@api_router.get("/zone-logs/student/{student_id}", response_model=List[ZoneLog])
async def get_student_zone_logs(student_id: str, days: int = 30):
    start_date = datetime.utcnow() - timedelta(days=days)
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", -1).to_list(1000)
    return [ZoneLog(**log) for log in logs]

# ---- Analytics ----
@api_router.get("/analytics/student/{student_id}")
async def get_student_analytics(student_id: str, days: int = 7):
    start_date = datetime.utcnow() - timedelta(days=days)
    
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", 1).to_list(1000)
    
    # Count by zone
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    daily_data = {}
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        # Count strategies
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        
        # Group by day
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
    
    # Get top strategies
    top_strategies = sorted(strategy_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "zone_counts": zone_counts,
        "total_logs": len(logs),
        "strategy_counts": dict(top_strategies),
        "daily_data": daily_data,
        "period_days": days
    }

@api_router.get("/analytics/classroom/{classroom_id}")
async def get_classroom_analytics(classroom_id: str, days: int = 7):
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get students in classroom
    students = await db.students.find({"classroom_id": classroom_id}).to_list(1000)
    student_ids = [s["id"] for s in students]
    
    if not student_ids:
        return {
            "zone_counts": {"blue": 0, "green": 0, "yellow": 0, "red": 0},
            "total_logs": 0,
            "students_count": 0,
            "daily_data": {},
            "student_breakdown": []
        }
    
    logs = await db.zone_logs.find({
        "student_id": {"$in": student_ids},
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", 1).to_list(1000)
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    daily_data = {}
    student_breakdown = {sid: {"blue": 0, "green": 0, "yellow": 0, "red": 0} for sid in student_ids}
    
    for log in logs:
        zone = log.get("zone", "")
        student_id = log.get("student_id", "")
        
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        if student_id in student_breakdown and zone in student_breakdown[student_id]:
            student_breakdown[student_id][zone] += 1
        
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
    
    # Add student names to breakdown
    student_data = []
    for s in students:
        student_data.append({
            "id": s["id"],
            "name": s["name"],
            "zones": student_breakdown.get(s["id"], {"blue": 0, "green": 0, "yellow": 0, "red": 0})
        })
    
    return {
        "zone_counts": zone_counts,
        "total_logs": len(logs),
        "students_count": len(students),
        "daily_data": daily_data,
        "student_breakdown": student_data,
        "period_days": days
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
