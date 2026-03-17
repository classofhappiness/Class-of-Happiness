from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta, timezone
import httpx
import io
import calendar

# PDF Generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Stripe
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
stripe_api_key = os.environ.get('STRIPE_API_KEY')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ================== SUBSCRIPTION PLANS ==================
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 4.99, "name": "Monthly", "duration_days": 30},
    "six_month": {"price": 19.99, "name": "6 Months", "duration_days": 180},
    "annual": {"price": 35.00, "name": "Annual", "duration_days": 365}
}

TRIAL_DURATION_DAYS = 7

# ================== MODELS ==================

class User(BaseModel):
    user_id: str = Field(default_factory=lambda: f"user_{uuid.uuid4().hex[:12]}")
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "teacher"  # "teacher", "parent", or "admin"
    language: str = "en"
    subscription_status: str = "none"  # "none", "trial", "active", "expired"
    subscription_plan: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    trial_started_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Student(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "cat"
    avatar_custom: Optional[str] = None
    classroom_id: Optional[str] = None
    user_id: Optional[str] = None  # Teacher who created this student
    parent_user_id: Optional[str] = None  # Parent linked to this student
    link_code: Optional[str] = None  # Code for parent to link
    link_code_expires: Optional[datetime] = None  # When link code expires
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
    user_id: Optional[str] = None  # Teacher who created this classroom
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClassroomCreate(BaseModel):
    name: str
    teacher_name: Optional[str] = None

class ZoneLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    zone: str
    strategies_selected: List[str] = []
    comment: Optional[str] = None  # Optional comment from student (max 100 chars)
    logged_by: str = "student"  # "student", "teacher", or "parent"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ZoneLogCreate(BaseModel):
    student_id: str
    zone: str
    strategies_selected: List[str] = []
    comment: Optional[str] = None

# Custom strategy for specific student
class CustomStrategy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: Optional[str] = None  # None means global/default strategy
    user_id: Optional[str] = None  # Teacher or Parent who created this
    creator_role: str = "teacher"  # "teacher" or "parent"
    name: str
    description: str
    zone: str
    image_type: str = "icon"  # "icon" or "custom"
    icon: str = "star"
    custom_image: Optional[str] = None  # base64 image
    is_active: bool = True
    is_shared: bool = False  # If true, shared between teacher and parent
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CustomStrategyCreate(BaseModel):
    student_id: Optional[str] = None
    name: str
    description: str
    zone: str
    image_type: str = "icon"
    icon: str = "star"
    custom_image: Optional[str] = None
    is_shared: bool = False

class CustomStrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    zone: Optional[str] = None
    image_type: Optional[str] = None
    icon: Optional[str] = None
    custom_image: Optional[str] = None
    is_active: Optional[bool] = None
    is_shared: Optional[bool] = None

class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_id: str
    plan: str
    amount: float
    currency: str = "usd"
    payment_status: str = "pending"  # "pending", "paid", "failed", "expired"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Resource for parents (emotional intelligence development materials)
class Resource(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str  # Short paragraph description
    content_type: str = "text"  # "text" or "pdf"
    content: Optional[str] = None  # Text content or base64 PDF
    pdf_filename: Optional[str] = None  # Original PDF filename
    created_by: str  # user_id of teacher/admin who created
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ResourceCreate(BaseModel):
    title: str
    description: str
    content_type: str = "text"
    content: Optional[str] = None
    pdf_filename: Optional[str] = None

class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None

# Teacher Resource with topics, ratings and comments
TEACHER_RESOURCE_TOPICS = [
    "emotions",
    "healthy_relationships",
    "leader_online",
    "you_are_what_you_eat",
    "special_needs_education"
]

class TeacherResource(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    topic: str  # One of TEACHER_RESOURCE_TOPICS
    content_type: str = "pdf"  # "text" or "pdf"
    content: Optional[str] = None  # Text content or base64 PDF
    pdf_filename: Optional[str] = None
    created_by: str  # user_id
    created_by_name: Optional[str] = None
    is_active: bool = True
    average_rating: float = 0.0
    total_ratings: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TeacherResourceCreate(BaseModel):
    title: str
    description: str
    topic: str
    content_type: str = "pdf"
    content: Optional[str] = None
    pdf_filename: Optional[str] = None

class TeacherResourceRating(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    resource_id: str
    user_id: str
    user_name: Optional[str] = None
    rating: int  # 1-5 stars
    comment: Optional[str] = None  # Max 100 characters
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TeacherResourceRatingCreate(BaseModel):
    rating: int  # 1-5 stars
    comment: Optional[str] = None  # Max 100 characters

# Family member for parent accounts
class FamilyMember(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_user_id: str  # Parent who created this family member
    name: str
    relationship: str  # "partner", "self", "child"
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "star"
    avatar_custom: Optional[str] = None
    linked_student_id: Optional[str] = None  # If this is a child linked to a school student
    created_at: datetime = Field(default_factory=datetime.utcnow)

class FamilyMemberCreate(BaseModel):
    name: str
    relationship: str
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "star"
    avatar_custom: Optional[str] = None

# Zone log for family members (home tracking)
class FamilyZoneLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    family_member_id: str
    parent_user_id: str
    zone: str
    strategies_selected: List[str] = []
    comment: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class FamilyZoneLogCreate(BaseModel):
    family_member_id: str
    zone: str
    strategies_selected: List[str] = []
    comment: Optional[str] = None

# Teacher link request from parent (reverse linking)
class TeacherLinkCode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_user_id: str
    student_id: str  # The child being shared
    link_code: str
    expires_at: datetime
    teacher_user_id: Optional[str] = None  # Teacher who used the code
    is_used: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ================== CREATURE REWARD SYSTEM ==================

# Creature definitions - cute, colorful creatures for kids 5-12
CREATURES = [
    {
        "id": "bubbles",
        "name": "Bubbles",
        "description": "A friendly water creature who loves to make friends",
        "color": "#4FC3F7",
        "stages": [
            {"stage": 0, "name": "Bubble Egg", "emoji": "🥚", "description": "A shimmering blue egg", "required_points": 0},
            {"stage": 1, "name": "Droplet", "emoji": "💧", "description": "A tiny water droplet with big eyes", "required_points": 50},
            {"stage": 2, "name": "Splashy", "emoji": "🫧", "description": "A bouncy bubble friend", "required_points": 150},
            {"stage": 3, "name": "Bubbles", "emoji": "🐳", "description": "A majestic water spirit!", "required_points": 300}
        ]
    },
    {
        "id": "sunny",
        "name": "Sunny",
        "description": "A warm and cheerful sun creature",
        "color": "#FFD54F",
        "stages": [
            {"stage": 0, "name": "Sun Egg", "emoji": "🥚", "description": "A glowing golden egg", "required_points": 0},
            {"stage": 1, "name": "Sparkle", "emoji": "✨", "description": "A tiny spark of light", "required_points": 50},
            {"stage": 2, "name": "Glow", "emoji": "🌟", "description": "A bright shining star", "required_points": 150},
            {"stage": 3, "name": "Sunny", "emoji": "☀️", "description": "A radiant sun friend!", "required_points": 300}
        ]
    },
    {
        "id": "leafy",
        "name": "Leafy",
        "description": "A nature-loving plant creature",
        "color": "#81C784",
        "stages": [
            {"stage": 0, "name": "Seed Pod", "emoji": "🥚", "description": "A green seed waiting to grow", "required_points": 0},
            {"stage": 1, "name": "Sprout", "emoji": "🌱", "description": "A tiny sprout reaching up", "required_points": 50},
            {"stage": 2, "name": "Blossom", "emoji": "🌸", "description": "A beautiful blooming flower", "required_points": 150},
            {"stage": 3, "name": "Leafy", "emoji": "🌳", "description": "A mighty tree of wisdom!", "required_points": 300}
        ]
    },
    {
        "id": "flamey",
        "name": "Flamey",
        "description": "A passionate fire creature with a warm heart",
        "color": "#FF7043",
        "stages": [
            {"stage": 0, "name": "Ember Egg", "emoji": "🥚", "description": "A warm orange egg", "required_points": 0},
            {"stage": 1, "name": "Spark", "emoji": "💥", "description": "A tiny dancing flame", "required_points": 50},
            {"stage": 2, "name": "Blaze", "emoji": "🔥", "description": "A bright burning fire", "required_points": 150},
            {"stage": 3, "name": "Flamey", "emoji": "🐉", "description": "A legendary fire dragon!", "required_points": 300}
        ]
    },
    {
        "id": "cloudy",
        "name": "Cloudy",
        "description": "A dreamy sky creature who floats through the air",
        "color": "#B39DDB",
        "stages": [
            {"stage": 0, "name": "Sky Egg", "emoji": "🥚", "description": "A fluffy purple egg", "required_points": 0},
            {"stage": 1, "name": "Puff", "emoji": "💨", "description": "A tiny cloud puff", "required_points": 50},
            {"stage": 2, "name": "Misty", "emoji": "☁️", "description": "A soft floating cloud", "required_points": 150},
            {"stage": 3, "name": "Cloudy", "emoji": "🌈", "description": "A magical rainbow cloud!", "required_points": 300}
        ]
    },
    {
        "id": "rocky",
        "name": "Rocky",
        "description": "A strong and steady earth creature",
        "color": "#A1887F",
        "stages": [
            {"stage": 0, "name": "Stone Egg", "emoji": "🥚", "description": "A solid brown egg", "required_points": 0},
            {"stage": 1, "name": "Pebble", "emoji": "🪨", "description": "A small rolling stone", "required_points": 50},
            {"stage": 2, "name": "Boulder", "emoji": "⛰️", "description": "A mighty boulder", "required_points": 150},
            {"stage": 3, "name": "Rocky", "emoji": "🗿", "description": "An ancient earth guardian!", "required_points": 300}
        ]
    }
]

# Points configuration - reduced thresholds for faster evolution
POINTS_CONFIG = {
    "strategy_used": 5,
    "comment_added": 10,
    "daily_streak_bonus": 3,
    "evolution_thresholds": [0, 15, 35, 60]  # Much faster evolution!
}

# Student Rewards Model
class StudentRewards(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    current_creature_id: str = "bubbles"  # Default starting creature
    current_stage: int = 0  # 0=egg, 1=baby, 2=teen, 3=adult
    current_points: int = 0  # Points towards current evolution
    total_points_earned: int = 0
    collected_creatures: List[str] = []  # List of fully evolved creature IDs
    last_checkin_date: Optional[str] = None  # YYYY-MM-DD format
    streak_days: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AddPointsRequest(BaseModel):
    points_type: str  # "strategy", "comment", "streak"
    strategy_count: int = 1  # Number of strategies used

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

# ================== STRATEGY ICONS ==================
STRATEGY_ICONS = [
    # Movement & Exercise
    "fitness-center", "directions-walk", "directions-run", "pool", "sports-soccer",
    "sports-baseball", "sports-basketball", "sports-tennis", "hiking", "rowing",
    # Communication
    "chat", "forum", "support-agent", "record-voice-over", "campaign",
    # Relaxation & Wellness
    "spa", "self-improvement", "psychology", "air", "weekend", "bathtub",
    "local-cafe", "local-drink", "restaurant", "cake",
    # Nature & Outdoors
    "wb-sunny", "nature", "park", "grass", "forest", "pets", "eco",
    # Emotions & Feelings  
    "favorite", "emoji-emotions", "sentiment-very-satisfied", "sentiment-satisfied",
    "sentiment-neutral", "sentiment-dissatisfied", "mood", "face",
    # Music & Art
    "music-note", "headphones", "piano", "brush", "palette", "color-lens",
    # Mindfulness
    "visibility", "visibility-off", "timer", "hourglass-empty", "access-time",
    # Actions
    "thumb-up", "thumb-down", "pan-tool", "back-hand", "front-hand", "waving-hand",
    # Home & Safety
    "home", "shield", "security", "lock", "night-shelter",
    # Learning & Focus
    "school", "menu-book", "edit", "lightbulb", "tips-and-updates",
    # Misc
    "star", "filter-9-plus", "exposure-neg-1", "volunteer-activism",
    "celebration", "emoji-events", "workspace-premium", "military-tech",
    # Body & Health
    "accessibility", "hearing", "remove-red-eye", "touch-app",
    # Play
    "toys", "videogame-asset", "sports-esports", "extension", "casino"
]

# ================== DEFAULT STRATEGIES ==================
DEFAULT_STRATEGIES = [
    # Blue Zone (Low energy - sad, tired, bored)
    {"id": "blue_1", "name": "Get Moving", "description": "Stretch or do some jumping jacks", "zone": "blue", "icon": "fitness-center", "image_type": "icon"},
    {"id": "blue_2", "name": "Talk to Someone", "description": "Share how you feel with a friend or teacher", "zone": "blue", "icon": "chat", "image_type": "icon"},
    {"id": "blue_3", "name": "Drink Water", "description": "Have a refreshing drink of water", "zone": "blue", "icon": "local-drink", "image_type": "icon"},
    {"id": "blue_4", "name": "Take a Break", "description": "Rest for a few minutes", "zone": "blue", "icon": "weekend", "image_type": "icon"},
    {"id": "blue_5", "name": "Listen to Music", "description": "Put on your favorite upbeat song", "zone": "blue", "icon": "music-note", "image_type": "icon"},
    {"id": "blue_6", "name": "Go Outside", "description": "Get some fresh air", "zone": "blue", "icon": "wb-sunny", "image_type": "icon"},
    
    # Green Zone (Ready to learn - calm, happy, focused)
    {"id": "green_1", "name": "Keep Going!", "description": "You're doing great, stay focused", "zone": "green", "icon": "thumb-up", "image_type": "icon"},
    {"id": "green_2", "name": "Deep Breaths", "description": "Take 3 slow, deep breaths", "zone": "green", "icon": "air", "image_type": "icon"},
    {"id": "green_3", "name": "Stay Focused", "description": "Keep your eyes on your work", "zone": "green", "icon": "visibility", "image_type": "icon"},
    {"id": "green_4", "name": "High Five!", "description": "Give yourself a high five", "zone": "green", "icon": "pan-tool", "image_type": "icon"},
    {"id": "green_5", "name": "Help Others", "description": "Share your calm energy", "zone": "green", "icon": "favorite", "image_type": "icon"},
    {"id": "green_6", "name": "Smile", "description": "Keep that happy feeling", "zone": "green", "icon": "sentiment-very-satisfied", "image_type": "icon"},
    
    # Yellow Zone (Heightened - frustrated, worried, silly, excited)
    {"id": "yellow_1", "name": "Count to 10", "description": "Slowly count from 1 to 10", "zone": "yellow", "icon": "filter-9-plus", "image_type": "icon"},
    {"id": "yellow_2", "name": "Deep Breaths", "description": "Breathe in for 4, out for 4", "zone": "yellow", "icon": "air", "image_type": "icon"},
    {"id": "yellow_3", "name": "Squeeze Ball", "description": "Squeeze a stress ball or fidget", "zone": "yellow", "icon": "sports-baseball", "image_type": "icon"},
    {"id": "yellow_4", "name": "Walk Away", "description": "Take a short walk to calm down", "zone": "yellow", "icon": "directions-walk", "image_type": "icon"},
    {"id": "yellow_5", "name": "Get Water", "description": "Take a drink of water", "zone": "yellow", "icon": "local-drink", "image_type": "icon"},
    {"id": "yellow_6", "name": "Think Happy", "description": "Think of something that makes you happy", "zone": "yellow", "icon": "wb-sunny", "image_type": "icon"},
    
    # Red Zone (Extreme - angry, terrified, out of control)
    {"id": "red_1", "name": "STOP", "description": "Stop and freeze your body", "zone": "red", "icon": "pan-tool", "image_type": "icon"},
    {"id": "red_2", "name": "Breathe Deep", "description": "Take 5 very slow breaths", "zone": "red", "icon": "air", "image_type": "icon"},
    {"id": "red_3", "name": "Count Back", "description": "Count backwards from 10 to 1", "zone": "red", "icon": "exposure-neg-1", "image_type": "icon"},
    {"id": "red_4", "name": "Safe Space", "description": "Go to your calm down corner", "zone": "red", "icon": "home", "image_type": "icon"},
    {"id": "red_5", "name": "Ask for Help", "description": "Tell an adult you need help", "zone": "red", "icon": "support-agent", "image_type": "icon"},
    {"id": "red_6", "name": "Hug Yourself", "description": "Give yourself a big hug", "zone": "red", "icon": "favorite", "image_type": "icon"},
]

# ================== TRANSLATIONS ==================
TRANSLATIONS = {
    "en": {
        "app_name": "Class of Happiness",
        "how_are_you_feeling": "How are you feeling today?",
        "i_am_a": "I am a...",
        "student": "Student",
        "teacher": "Teacher",
        "parent": "Parent",
        "check_in_feelings": "Check in with my feelings",
        "view_progress": "View student progress",
        "your_family_emotions": "Your family's emotions",
        "blue_zone": "Blue Zone",
        "green_zone": "Green Zone",
        "yellow_zone": "Yellow Zone",
        "red_zone": "Red Zone",
        "blue_desc": "Sad, Tired, Bored",
        "green_desc": "Calm, Happy, Focused",
        "yellow_desc": "Worried, Frustrated, Silly",
        "red_desc": "Angry, Scared, Out of Control",
        "select_profile": "Select Your Profile",
        "tap_to_check_in": "Tap your picture to check in!",
        "add_profile": "Add Profile",
        "strategies": "Helpful Strategies",
        "skip": "Skip",
        "done": "Done",
        "settings": "Settings",
        "language": "Language",
        "subscription": "Subscription",
        "logout": "Logout",
        "login": "Login",
        "login_required": "Login required",
        "sign_in_google": "Sign in with Google",
        "trial": "Free Trial",
        "trial_desc": "7 days free trial",
        "monthly": "Monthly",
        "six_months": "6 Months",
        "annual": "Annual",
        "subscribe": "Subscribe",
        "per_month": "/month",
        "save": "Save",
        "dashboard": "Dashboard",
        "students": "Students",
        "classrooms": "Classrooms",
        "teacher_resources": "Teacher Resources",
        "upload_share_materials": "Upload & share educational materials",
        "recent_activity": "Recent Activity",
        "week_overview": "Week Overview",
        "check_ins": "Check-ins",
        "no_data_yet": "No data yet",
        "family_dashboard": "Family Dashboard",
        "track_emotional_wellness": "Track emotional wellness at home",
        "my_family": "My Family",
        "children_school": "Children (School)",
        "link_child": "Link Child",
        "add_family_member": "Add Family Member",
        "resources": "Resources",
        "recent_check_ins": "Recent Check-ins",
        "loading": "Loading...",
        "error": "Error",
        "success": "Success",
        "cancel": "Cancel",
        "confirm": "Confirm",
        "delete": "Delete",
        "edit": "Edit",
        "add": "Add",
        "back": "Back",
        "next": "Next",
        "submit": "Submit",
        "upload": "Upload",
        "download": "Download",
        "share": "Share",
        "blue": "Blue",
        "green": "Green",
        "yellow": "Yellow",
        "red": "Red",
        "sad": "Sad",
        "tired": "Tired",
        "bored": "Bored",
        "calm": "Calm",
        "happy": "Happy",
        "focused": "Focused",
        "worried": "Worried",
        "frustrated": "Frustrated",
        "silly": "Silly",
        "angry": "Angry",
        "scared": "Scared",
        "out_of_control": "Out of Control",
        "emotions_topic": "Emotions",
        "healthy_relationships": "Healthy Relationships",
        "leader_online": "Leader Online",
        "you_are_what_you_eat": "You Are What You Eat",
        "special_needs_education": "Special Needs Education",
        "upload_resource": "Upload Resource",
        "rate_resource": "Rate This Resource",
        "teacher_reviews": "Teacher Reviews",
        "download_report": "Download Report",
        "select_month": "Select Month",
        "monthly_reports": "Monthly Reports",
        "hi": "Hi",
        "which_zone": "Which zone are you in?",
        "tap_zone_help": "Tap the color that matches how you feel",
        "choose_strategies": "Choose helpful strategies",
        "want_to_say": "Want to say how you feel?",
        "write_sentence": "Write one sentence about how you feel...",
        "save_checkin": "Save Check-in",
        "well_done": "Well Done!",
        "great_job": "Great job choosing strategies!",
        "confirm_logout": "Are you sure you want to sign out?",
        "status": "Status",
        "active": "Active",
        "inactive": "Inactive",
        "free_trial": "Free Trial",
        # New comprehensive translations
        "no_profiles_yet": "No profiles yet!",
        "create_first_profile": "Create your first profile to get started",
        "loading_strategies": "Loading strategies...",
        "green_zone_help": "Great! Here are ways to stay in the green zone:",
        "other_zone_help": "Here are some strategies that might help:",
        "tap_strategies_green": "Tap any strategies you'd like to try:",
        "tap_strategies_other": "Tap to select strategies that might help:",
        "no_zone_selected": "No zone selected",
        "filter_by_classroom": "Filter by Classroom",
        "all_students": "All Students",
        "days_7": "7 Days",
        "days_14": "2 Weeks",
        "days_30": "30 Days",
        "no_recent_checkins": "No recent check-ins",
        "search_students": "Search students...",
        "add_new_student": "Add New Student",
        "delete_student": "Delete Student",
        "delete_student_confirm": "Are you sure you want to delete this student? This will also delete all their zone logs.",
        "no_students_found": "No students found",
        "no_students_yet": "No students yet",
        "try_different_search": "Try a different search",
        "add_first_student": "Add your first student to get started",
        "student_not_found": "Student not found",
        "zone_distribution": "Zone Distribution",
        "zone_comparison": "Zone Comparison",
        "no_data_period": "No data for this period",
        "most_used_strategies": "Most Used Strategies",
        "no_checkins_yet": "No check-ins yet",
        "share_with_parent": "Share with Parent",
        "generate_code": "Generate Code",
        "generating": "Generating...",
        "parent_link_code": "Parent Link Code:",
        "code_expires_7_days": "This code expires in 7 days. Share it with the parent so they can link their account.",
        "share_code": "Share Code",
        "create_new_classroom": "Create New Classroom",
        "classroom_name": "Classroom Name",
        "teacher_name_optional": "Teacher Name (Optional)",
        "create_classroom": "Create Classroom",
        "creating": "Creating...",
        "no_classrooms_yet": "No classrooms yet",
        "create_classroom_organize": "Create a classroom to organize your students",
        "delete_classroom": "Delete Classroom",
        "delete_classroom_confirm": "Are you sure you want to delete this classroom?",
        "students_moved": "student(s) will be moved to 'No Classroom'.",
        "no_classroom": "No Classroom",
        "resource_available": "resource available",
        "resources_available": "resources available",
        "loading_resources": "Loading resources...",
        "no_resources_yet": "No resources yet",
        "be_first_upload": "Be the first to upload a resource for this topic!",
        "title": "Title",
        "description": "Description",
        "pdf_file": "PDF File",
        "select_pdf": "Select PDF file",
        "topic": "Topic",
        "upload_resource_btn": "Upload Resource",
        "uploading": "Uploading...",
        "comment_optional": "Comment (optional, max 100 chars)",
        "share_feedback": "Share your feedback...",
        "submit_rating": "Submit Rating",
        "submitting": "Submitting...",
        "manage_strategies": "Manage Strategies",
        "add_custom_strategy": "Add Custom Strategy",
        "custom_strategies": "Custom Strategies",
        "default_strategies": "Default Strategies",
        "default": "Default",
        "add_strategy": "Add Strategy",
        "edit_strategy": "Edit Strategy",
        "strategy_name": "Strategy Name",
        "image": "Image",
        "icon": "Icon",
        "photo": "Photo",
        "update_strategy": "Update Strategy",
        "saving": "Saving...",
        "delete_strategy": "Delete Strategy",
        "delete_strategy_confirm": "Are you sure you want to delete this strategy?",
        "name": "Name",
        "choose_avatar": "Choose an Avatar",
        "gallery": "Gallery",
        "camera": "Camera",
        "your_photo": "Your Photo",
        "or_choose_character": "Or choose a character:",
        "classroom_optional": "Classroom (Optional)",
        "create_profile": "Create Profile",
        "save_changes": "Save Changes",
        "delete_profile": "Delete Profile",
        "delete_profile_confirm": "Are you sure you want to delete this profile? This will also delete all their zone logs.",
        "avatar": "Avatar",
        "classroom": "Classroom",
        "profile_created": "Profile Created!",
        "profile_updated": "Profile Updated!",
        "link_child_school": "Link Child from School",
        "enter_code": "Enter the 6-character code from your child's teacher.",
        "linking": "Linking...",
        "add_member": "Add Member",
        "adding": "Adding...",
        "relationship": "Relationship",
        "self": "Self",
        "partner": "Partner",
        "child": "Child",
        "school": "School",
        "add_family_to_track": "Add family members to track",
        "link_children_school": "Link children from school",
        "no_checkins_week": "No check-ins this week",
        "no_recent_activity": "No recent activity",
        "share_with_teacher": "Share with Teacher",
        "generate_teacher_code": "Generate a code that teachers can use to link to your child's profile.",
        "expires_7_days": "Expires in 7 days",
        "teacher_link_code": "Teacher Link Code:",
        "checkin_for": "Check-in for",
        "how_everyone_feeling": "How is everyone feeling?",
        "choose_helpful_strategies": "Choose helpful strategies",
        "change": "Change",
        "select_helpful_strategies": "Select helpful strategies:",
        "add_note_optional": "Add a note (optional)",
        "edit_note": "Edit note",
        "write_short_note": "Write a short note...",
        "skip_strategies": "Skip strategies",
        "articles_guides": "Articles and guides on emotional intelligence development",
        "no_resources_available": "No resources available yet",
        "check_back_later": "Check back later for helpful articles and guides",
        "resources_info": "These resources are provided by teachers to help you support your child's emotional development at home.",
        "pdf_document": "PDF Document",
        "article": "Article",
        "child_strategies": "Strategies",
        "create_manage_strategies": "Create and manage coping strategies for your child",
        "your_custom_strategies": "Your Custom Strategies",
        "shared_with_teacher": "Shared with teacher",
        "not_shared": "Not shared",
        "share_with_teacher_checkbox": "Share with teacher",
        "share_hint": "When shared, your child's teacher can also see and use this strategy",
        "by": "By",
        # Rewards system translations
        "great_job_title": "Great Job!",
        "keep_it_up": "Keep it up!",
        "day_streak": "day streak!",
        "points": "Points",
        "my_creatures": "My Creatures",
        "continue": "Continue",
        "loading_creature": "Loading your creature...",
        "more_points_until": "more points until",
        "evolves": "evolves!",
        "collected": "Collected",
        "current_friend": "Current Friend",
        "fully_evolved": "Fully Evolved",
        "keep_growing": "Keep Growing!",
        "grow_creature_hint": "Use strategies and write about your feelings to evolve your creature and start collecting!",
        "complete": "Complete!",
        "evolved": "EVOLVED!",
        "evolving": "EVOLVING...",
        "amazing_continue": "Amazing! Continue",
        # Profile creation/editing
        "enter_name": "Enter name",
        "select_classroom": "Select classroom",
        "updating": "Updating...",
        "deleting": "Deleting...",
        # Teacher resources
        "no_resources_topic": "No resources for this topic yet",
        "upload_first": "Be the first to upload!",
        "select_topic": "Select Topic",
        "resource_title": "Resource Title",
        "resource_description": "Resource Description",
        "comments": "Comments",
        "no_comments_yet": "No comments yet",
        "add_comment": "Add a comment...",
        "rated": "Rated",
        "stars": "stars",
        # Classroom reports
        "classroom_report": "Classroom Report",
        "generate_report": "Generate Report",
        "all_classrooms": "All Classrooms",
        # Parent strategies
        "no_strategies_yet": "No strategies yet",
        "add_first_strategy": "Add your first custom strategy",
        "strategy_description": "Strategy Description",
        "share_strategy": "Share with teacher",
        # Language settings
        "change_language": "Change Language",
        "change_language_confirm": "Set",
        "as_default_language": "as your default language?",
        "language_changed": "Language Changed",
        "is_now_default": "is now your default language. The app will remember this choice.",
    },
    "es": {
        "app_name": "Clase de Felicidad",
        "how_are_you_feeling": "¿Cómo te sientes hoy?",
        "i_am_a": "Soy un...",
        "student": "Estudiante",
        "teacher": "Maestro",
        "parent": "Padre",
        "check_in_feelings": "Registrar mis sentimientos",
        "view_progress": "Ver progreso de estudiantes",
        "your_family_emotions": "Las emociones de tu familia",
        "blue_zone": "Zona Azul",
        "green_zone": "Zona Verde",
        "yellow_zone": "Zona Amarilla",
        "red_zone": "Zona Roja",
        "blue_desc": "Triste, Cansado, Aburrido",
        "green_desc": "Tranquilo, Feliz, Enfocado",
        "yellow_desc": "Preocupado, Frustrado, Tonto",
        "red_desc": "Enojado, Asustado, Fuera de Control",
        "select_profile": "Selecciona tu Perfil",
        "tap_to_check_in": "¡Toca tu foto para registrarte!",
        "add_profile": "Agregar Perfil",
        "strategies": "Estrategias Útiles",
        "skip": "Saltar",
        "done": "Listo",
        "settings": "Configuración",
        "language": "Idioma",
        "subscription": "Suscripción",
        "logout": "Cerrar Sesión",
        "login": "Iniciar Sesión",
        "login_required": "Inicio requerido",
        "sign_in_google": "Iniciar con Google",
        "trial": "Prueba Gratuita",
        "trial_desc": "7 días de prueba gratis",
        "monthly": "Mensual",
        "six_months": "6 Meses",
        "annual": "Anual",
        "subscribe": "Suscribirse",
        "per_month": "/mes",
        "save": "Guardar",
        "dashboard": "Panel",
        "students": "Estudiantes",
        "classrooms": "Aulas",
        "teacher_resources": "Recursos para Maestros",
        "upload_share_materials": "Subir y compartir materiales educativos",
        "recent_activity": "Actividad Reciente",
        "week_overview": "Resumen de la Semana",
        "check_ins": "Registros",
        "no_data_yet": "Sin datos todavía",
        "family_dashboard": "Panel Familiar",
        "track_emotional_wellness": "Seguimiento del bienestar emocional en casa",
        "my_family": "Mi Familia",
        "children_school": "Niños (Escuela)",
        "link_child": "Vincular Niño",
        "add_family_member": "Agregar Familiar",
        "resources": "Recursos",
        "recent_check_ins": "Registros Recientes",
        "loading": "Cargando...",
        "error": "Error",
        "success": "Éxito",
        "cancel": "Cancelar",
        "confirm": "Confirmar",
        "delete": "Eliminar",
        "edit": "Editar",
        "add": "Agregar",
        "back": "Atrás",
        "next": "Siguiente",
        "submit": "Enviar",
        "upload": "Subir",
        "download": "Descargar",
        "share": "Compartir",
        "blue": "Azul",
        "green": "Verde",
        "yellow": "Amarillo",
        "red": "Rojo",
        "emotions_topic": "Emociones",
        "healthy_relationships": "Relaciones Saludables",
        "leader_online": "Líder en Línea",
        "you_are_what_you_eat": "Eres lo que Comes",
        "special_needs_education": "Educación Especial",
        "upload_resource": "Subir Recurso",
        "rate_resource": "Calificar este Recurso",
        "teacher_reviews": "Reseñas de Maestros",
        "download_report": "Descargar Informe",
        "select_month": "Seleccionar Mes",
        "monthly_reports": "Informes Mensuales",
        "hi": "Hola",
        "which_zone": "¿En qué zona estás?",
        "tap_zone_help": "Toca el color que coincida con cómo te sientes",
        "choose_strategies": "Elige estrategias útiles",
        "want_to_say": "¿Quieres decir cómo te sientes?",
        "write_sentence": "Escribe una frase sobre cómo te sientes...",
        "save_checkin": "Guardar Registro",
        "well_done": "¡Bien Hecho!",
        "great_job": "¡Buen trabajo eligiendo estrategias!",
        "confirm_logout": "¿Estás seguro de que deseas cerrar sesión?",
        "status": "Estado",
        "active": "Activo",
        "inactive": "Inactivo",
        "free_trial": "Prueba Gratuita",
        "no_profiles_yet": "¡No hay perfiles todavía!",
        "create_first_profile": "Crea tu primer perfil para comenzar",
        "loading_strategies": "Cargando estrategias...",
        "green_zone_help": "¡Genial! Aquí hay formas de mantenerte en la zona verde:",
        "other_zone_help": "Aquí hay algunas estrategias que podrían ayudar:",
        "tap_strategies_green": "Toca las estrategias que te gustaría probar:",
        "tap_strategies_other": "Toca para seleccionar estrategias que podrían ayudar:",
        "no_zone_selected": "Ninguna zona seleccionada",
        "filter_by_classroom": "Filtrar por Aula",
        "all_students": "Todos los Estudiantes",
        "days_7": "7 Días",
        "days_14": "2 Semanas",
        "days_30": "30 Días",
        "no_recent_checkins": "Sin registros recientes",
        "search_students": "Buscar estudiantes...",
        "add_new_student": "Agregar Nuevo Estudiante",
        "delete_student": "Eliminar Estudiante",
        "delete_student_confirm": "¿Estás seguro de que deseas eliminar este estudiante?",
        "no_students_found": "No se encontraron estudiantes",
        "no_students_yet": "Sin estudiantes todavía",
        "try_different_search": "Intenta una búsqueda diferente",
        "add_first_student": "Agrega tu primer estudiante para comenzar",
        "student_not_found": "Estudiante no encontrado",
        "zone_distribution": "Distribución de Zonas",
        "zone_comparison": "Comparación de Zonas",
        "no_data_period": "Sin datos para este período",
        "most_used_strategies": "Estrategias Más Usadas",
        "no_checkins_yet": "Sin registros todavía",
        "share_with_parent": "Compartir con Padre",
        "generate_code": "Generar Código",
        "generating": "Generando...",
        "parent_link_code": "Código de Vinculación:",
        "code_expires_7_days": "Este código expira en 7 días.",
        "share_code": "Compartir Código",
        "create_new_classroom": "Crear Nueva Aula",
        "classroom_name": "Nombre del Aula",
        "teacher_name_optional": "Nombre del Maestro (Opcional)",
        "create_classroom": "Crear Aula",
        "creating": "Creando...",
        "no_classrooms_yet": "Sin aulas todavía",
        "create_classroom_organize": "Crea un aula para organizar a tus estudiantes",
        "delete_classroom": "Eliminar Aula",
        "delete_classroom_confirm": "¿Estás seguro de que deseas eliminar esta aula?",
        "no_classroom": "Sin Aula",
        "loading_resources": "Cargando recursos...",
        "no_resources_yet": "Sin recursos todavía",
        "be_first_upload": "¡Sé el primero en subir un recurso!",
        "title": "Título",
        "description": "Descripción",
        "pdf_file": "Archivo PDF",
        "select_pdf": "Seleccionar archivo PDF",
        "topic": "Tema",
        "uploading": "Subiendo...",
        "submit_rating": "Enviar Calificación",
        "submitting": "Enviando...",
        "manage_strategies": "Gestionar Estrategias",
        "add_custom_strategy": "Agregar Estrategia Personalizada",
        "custom_strategies": "Estrategias Personalizadas",
        "default_strategies": "Estrategias Predeterminadas",
        "default": "Predeterminado",
        "add_strategy": "Agregar Estrategia",
        "edit_strategy": "Editar Estrategia",
        "strategy_name": "Nombre de la Estrategia",
        "image": "Imagen",
        "icon": "Ícono",
        "photo": "Foto",
        "saving": "Guardando...",
        "name": "Nombre",
        "choose_avatar": "Elegir un Avatar",
        "gallery": "Galería",
        "camera": "Cámara",
        "your_photo": "Tu Foto",
        "or_choose_character": "O elige un personaje:",
        "classroom_optional": "Aula (Opcional)",
        "create_profile": "Crear Perfil",
        "save_changes": "Guardar Cambios",
        "delete_profile": "Eliminar Perfil",
        "avatar": "Avatar",
        "classroom": "Aula",
        "link_child_school": "Vincular Niño de la Escuela",
        "enter_code": "Ingresa el código de 6 caracteres del maestro.",
        "linking": "Vinculando...",
        "add_member": "Agregar Miembro",
        "adding": "Agregando...",
        "relationship": "Relación",
        "self": "Yo",
        "partner": "Pareja",
        "child": "Niño",
        "school": "Escuela",
        "checkin_for": "Registro para",
        "how_everyone_feeling": "¿Cómo se sienten todos?",
        "change": "Cambiar",
        "select_helpful_strategies": "Selecciona estrategias útiles:",
        "add_note_optional": "Agregar nota (opcional)",
        "skip_strategies": "Saltar estrategias",
        "by": "Por",
        # Rewards system
        "great_job_title": "¡Buen Trabajo!",
        "keep_it_up": "¡Sigue así!",
        "day_streak": "días seguidos!",
        "points": "Puntos",
        "my_creatures": "Mis Criaturas",
        "continue": "Continuar",
        "loading_creature": "Cargando tu criatura...",
        "more_points_until": "puntos más hasta que",
        "evolves": "evolucione!",
        "collected": "Coleccionados",
        "current_friend": "Amigo Actual",
        "fully_evolved": "Completamente Evolucionado",
        "keep_growing": "¡Sigue Creciendo!",
        "grow_creature_hint": "¡Usa estrategias y escribe sobre tus sentimientos para evolucionar tu criatura!",
        "complete": "¡Completo!",
        "evolved": "¡EVOLUCIONADO!",
        "evolving": "EVOLUCIONANDO...",
        "amazing_continue": "¡Increíble! Continuar",
        "enter_name": "Ingresa nombre",
        "select_classroom": "Seleccionar aula",
        "updating": "Actualizando...",
        "deleting": "Eliminando...",
        "no_resources_topic": "Sin recursos para este tema todavía",
        "upload_first": "¡Sé el primero en subir!",
        "comments": "Comentarios",
        "no_comments_yet": "Sin comentarios todavía",
        "add_comment": "Agregar comentario...",
        "no_strategies_yet": "Sin estrategias todavía",
        "add_first_strategy": "Agrega tu primera estrategia personalizada",
        # Language settings
        "change_language": "Cambiar Idioma",
        "change_language_confirm": "Establecer",
        "as_default_language": "como tu idioma predeterminado?",
        "language_changed": "Idioma Cambiado",
        "is_now_default": "es ahora tu idioma predeterminado. La aplicación recordará esta elección.",
    },
    "fr": {
        "app_name": "Classe du Bonheur",
        "how_are_you_feeling": "Comment te sens-tu aujourd'hui?",
        "i_am_a": "Je suis un...",
        "student": "Élève",
        "teacher": "Enseignant",
        "parent": "Parent",
        "check_in_feelings": "Enregistrer mes émotions",
        "view_progress": "Voir les progrès des élèves",
        "your_family_emotions": "Les émotions de ta famille",
        "blue_zone": "Zone Bleue",
        "green_zone": "Zone Verte",
        "yellow_zone": "Zone Jaune",
        "red_zone": "Zone Rouge",
        "blue_desc": "Triste, Fatigué, Ennuyé",
        "green_desc": "Calme, Heureux, Concentré",
        "yellow_desc": "Inquiet, Frustré, Excité",
        "red_desc": "En Colère, Effrayé, Hors Contrôle",
        "select_profile": "Sélectionne ton Profil",
        "tap_to_check_in": "Tape sur ta photo pour t'enregistrer!",
        "add_profile": "Ajouter Profil",
        "strategies": "Stratégies Utiles",
        "skip": "Passer",
        "done": "Terminé",
        "settings": "Paramètres",
        "language": "Langue",
        "subscription": "Abonnement",
        "logout": "Déconnexion",
        "login": "Connexion",
        "login_required": "Connexion requise",
        "sign_in_google": "Se connecter avec Google",
        "trial": "Essai Gratuit",
        "trial_desc": "7 jours d'essai gratuit",
        "monthly": "Mensuel",
        "six_months": "6 Mois",
        "annual": "Annuel",
        "subscribe": "S'abonner",
        "per_month": "/mois",
        "save": "Sauvegarder",
        "dashboard": "Tableau de Bord",
        "students": "Élèves",
        "classrooms": "Salles de Classe",
        "teacher_resources": "Ressources Enseignants",
        "upload_share_materials": "Télécharger et partager des matériaux",
        "recent_activity": "Activité Récente",
        "week_overview": "Aperçu de la Semaine",
        "check_ins": "Enregistrements",
        "no_data_yet": "Pas encore de données",
        "family_dashboard": "Tableau de Bord Familial",
        "track_emotional_wellness": "Suivre le bien-être émotionnel à la maison",
        "my_family": "Ma Famille",
        "children_school": "Enfants (École)",
        "link_child": "Lier un Enfant",
        "add_family_member": "Ajouter un Membre",
        "resources": "Ressources",
        "recent_check_ins": "Enregistrements Récents",
        "loading": "Chargement...",
        "error": "Erreur",
        "success": "Succès",
        "cancel": "Annuler",
        "confirm": "Confirmer",
        "delete": "Supprimer",
        "edit": "Modifier",
        "add": "Ajouter",
        "back": "Retour",
        "next": "Suivant",
        "submit": "Soumettre",
        "upload": "Télécharger",
        "download": "Télécharger",
        "share": "Partager",
        "blue": "Bleu",
        "green": "Vert",
        "yellow": "Jaune",
        "red": "Rouge",
        "emotions_topic": "Émotions",
        "healthy_relationships": "Relations Saines",
        "leader_online": "Leader en Ligne",
        "you_are_what_you_eat": "Tu es ce que tu Manges",
        "special_needs_education": "Éducation Spécialisée",
        "upload_resource": "Télécharger Ressource",
        "rate_resource": "Noter cette Ressource",
        "teacher_reviews": "Avis des Enseignants",
        "download_report": "Télécharger Rapport",
        "select_month": "Sélectionner le Mois",
        "monthly_reports": "Rapports Mensuels",
        "hi": "Salut",
        "which_zone": "Dans quelle zone es-tu?",
        "tap_zone_help": "Tape sur la couleur qui correspond à ce que tu ressens",
        "choose_strategies": "Choisis des stratégies utiles",
        "want_to_say": "Tu veux dire comment tu te sens?",
        "write_sentence": "Écris une phrase sur comment tu te sens...",
        "save_checkin": "Enregistrer",
        "well_done": "Bravo!",
        "great_job": "Bon travail pour avoir choisi des stratégies!",
        "confirm_logout": "Es-tu sûr de vouloir te déconnecter?",
        "status": "Statut",
        "active": "Actif",
        "inactive": "Inactif",
        "free_trial": "Essai Gratuit",
        "no_profiles_yet": "Pas encore de profils!",
        "create_first_profile": "Crée ton premier profil pour commencer",
        "loading_strategies": "Chargement des stratégies...",
        "green_zone_help": "Super! Voici des façons de rester dans la zone verte:",
        "other_zone_help": "Voici quelques stratégies qui pourraient aider:",
        "filter_by_classroom": "Filtrer par Classe",
        "all_students": "Tous les Élèves",
        "days_7": "7 Jours",
        "days_14": "2 Semaines",
        "days_30": "30 Jours",
        "no_recent_checkins": "Aucun enregistrement récent",
        "search_students": "Rechercher des élèves...",
        "add_new_student": "Ajouter un Nouvel Élève",
        "delete_student": "Supprimer l'Élève",
        "no_students_found": "Aucun élève trouvé",
        "no_students_yet": "Pas encore d'élèves",
        "student_not_found": "Élève non trouvé",
        "zone_distribution": "Distribution des Zones",
        "zone_comparison": "Comparaison des Zones",
        "no_data_period": "Aucune donnée pour cette période",
        "most_used_strategies": "Stratégies les Plus Utilisées",
        "no_checkins_yet": "Pas encore d'enregistrements",
        "share_with_parent": "Partager avec Parent",
        "generate_code": "Générer un Code",
        "generating": "Génération...",
        "share_code": "Partager le Code",
        "create_new_classroom": "Créer une Nouvelle Classe",
        "classroom_name": "Nom de la Classe",
        "teacher_name_optional": "Nom de l'Enseignant (Optionnel)",
        "create_classroom": "Créer la Classe",
        "creating": "Création...",
        "no_classrooms_yet": "Pas encore de classes",
        "no_classroom": "Sans Classe",
        "loading_resources": "Chargement des ressources...",
        "no_resources_yet": "Pas encore de ressources",
        "title": "Titre",
        "description": "Description",
        "uploading": "Téléchargement...",
        "submit_rating": "Soumettre l'Évaluation",
        "submitting": "Envoi...",
        "manage_strategies": "Gérer les Stratégies",
        "add_custom_strategy": "Ajouter une Stratégie Personnalisée",
        "custom_strategies": "Stratégies Personnalisées",
        "default_strategies": "Stratégies par Défaut",
        "default": "Défaut",
        "saving": "Sauvegarde...",
        "name": "Nom",
        "choose_avatar": "Choisir un Avatar",
        "gallery": "Galerie",
        "camera": "Caméra",
        "your_photo": "Ta Photo",
        "or_choose_character": "Ou choisis un personnage:",
        "create_profile": "Créer un Profil",
        "save_changes": "Sauvegarder",
        "delete_profile": "Supprimer le Profil",
        "avatar": "Avatar",
        "classroom": "Classe",
        "relationship": "Relation",
        "self": "Moi",
        "partner": "Partenaire",
        "child": "Enfant",
        "school": "École",
        "checkin_for": "Enregistrement pour",
        "change": "Changer",
        "by": "Par",
    },
    "pt": {
        "app_name": "Classe da Felicidade",
        "how_are_you_feeling": "Como você está se sentindo hoje?",
        "i_am_a": "Eu sou um...",
        "student": "Estudante",
        "teacher": "Professor",
        "parent": "Pai/Mãe",
        "check_in_feelings": "Registrar meus sentimentos",
        "view_progress": "Ver progresso dos alunos",
        "your_family_emotions": "As emoções da sua família",
        "blue_zone": "Zona Azul",
        "green_zone": "Zona Verde",
        "yellow_zone": "Zona Amarela",
        "red_zone": "Zona Vermelha",
        "blue_desc": "Triste, Cansado, Entediado",
        "green_desc": "Calmo, Feliz, Focado",
        "yellow_desc": "Preocupado, Frustrado, Bobo",
        "red_desc": "Bravo, Assustado, Fora de Controle",
        "select_profile": "Selecione seu Perfil",
        "tap_to_check_in": "Toque na sua foto para registrar!",
        "add_profile": "Adicionar Perfil",
        "strategies": "Estratégias Úteis",
        "skip": "Pular",
        "done": "Pronto",
        "settings": "Configurações",
        "language": "Idioma",
        "subscription": "Assinatura",
        "logout": "Sair",
        "login": "Entrar",
        "login_required": "Login necessário",
        "sign_in_google": "Entrar com Google",
        "trial": "Teste Gratuito",
        "trial_desc": "7 dias de teste grátis",
        "monthly": "Mensal",
        "six_months": "6 Meses",
        "annual": "Anual",
        "subscribe": "Assinar",
        "per_month": "/mês",
        "save": "Salvar",
        "dashboard": "Painel",
        "students": "Alunos",
        "classrooms": "Salas",
        "teacher_resources": "Recursos do Professor",
        "upload_share_materials": "Carregar e compartilhar materiais",
        "week_overview": "Resumo da Semana",
        "check_ins": "Registros",
        "no_data_yet": "Sem dados ainda",
        "family_dashboard": "Painel Familiar",
        "my_family": "Minha Família",
        "children_school": "Crianças (Escola)",
        "link_child": "Vincular Criança",
        "add_family_member": "Adicionar Familiar",
        "resources": "Recursos",
        "recent_check_ins": "Registros Recentes",
        "loading": "Carregando...",
        "error": "Erro",
        "success": "Sucesso",
        "cancel": "Cancelar",
        "confirm": "Confirmar",
        "delete": "Excluir",
        "edit": "Editar",
        "add": "Adicionar",
        "back": "Voltar",
        "next": "Próximo",
        "submit": "Enviar",
        "upload": "Carregar",
        "download": "Baixar",
        "share": "Compartilhar",
        "hi": "Oi",
        "which_zone": "Em qual zona você está?",
        "well_done": "Muito Bem!",
        "status": "Status",
        "active": "Ativo",
        "inactive": "Inativo",
        "free_trial": "Teste Gratuito",
        "name": "Nome",
        "gallery": "Galeria",
        "camera": "Câmera",
        "classroom": "Sala",
        "by": "Por",
        "no_profiles_yet": "Ainda não há perfis!",
        "create_first_profile": "Crie seu primeiro perfil para começar",
        "filter_by_classroom": "Filtrar por Sala",
        "all_students": "Todos os Alunos",
    },
    "de": {
        "app_name": "Klasse des Glücks",
        "how_are_you_feeling": "Wie fühlst du dich heute?",
        "i_am_a": "Ich bin ein...",
        "student": "Schüler",
        "teacher": "Lehrer",
        "parent": "Elternteil",
        "check_in_feelings": "Meine Gefühle einchecken",
        "view_progress": "Schülerfortschritt ansehen",
        "your_family_emotions": "Die Emotionen deiner Familie",
        "blue_zone": "Blaue Zone",
        "green_zone": "Grüne Zone",
        "yellow_zone": "Gelbe Zone",
        "red_zone": "Rote Zone",
        "blue_desc": "Traurig, Müde, Gelangweilt",
        "green_desc": "Ruhig, Glücklich, Fokussiert",
        "yellow_desc": "Besorgt, Frustriert, Albern",
        "red_desc": "Wütend, Verängstigt, Außer Kontrolle",
        "select_profile": "Wähle dein Profil",
        "tap_to_check_in": "Tippe auf dein Bild zum Einchecken!",
        "add_profile": "Profil Hinzufügen",
        "strategies": "Hilfreiche Strategien",
        "skip": "Überspringen",
        "done": "Fertig",
        "settings": "Einstellungen",
        "language": "Sprache",
        "subscription": "Abonnement",
        "logout": "Abmelden",
        "login": "Anmelden",
        "login_required": "Anmeldung erforderlich",
        "sign_in_google": "Mit Google anmelden",
        "trial": "Kostenlose Testversion",
        "trial_desc": "7 Tage kostenlos testen",
        "monthly": "Monatlich",
        "six_months": "6 Monate",
        "annual": "Jährlich",
        "subscribe": "Abonnieren",
        "per_month": "/Monat",
        "save": "Speichern",
        "dashboard": "Dashboard",
        "students": "Schüler",
        "classrooms": "Klassenräume",
        "teacher_resources": "Lehrer-Ressourcen",
        "week_overview": "Wochenübersicht",
        "check_ins": "Check-ins",
        "no_data_yet": "Noch keine Daten",
        "family_dashboard": "Familien-Dashboard",
        "my_family": "Meine Familie",
        "children_school": "Kinder (Schule)",
        "link_child": "Kind verknüpfen",
        "add_family_member": "Familienmitglied hinzufügen",
        "resources": "Ressourcen",
        "recent_check_ins": "Letzte Check-ins",
        "loading": "Laden...",
        "error": "Fehler",
        "success": "Erfolg",
        "cancel": "Abbrechen",
        "confirm": "Bestätigen",
        "delete": "Löschen",
        "edit": "Bearbeiten",
        "add": "Hinzufügen",
        "back": "Zurück",
        "next": "Weiter",
        "submit": "Absenden",
        "upload": "Hochladen",
        "download": "Herunterladen",
        "share": "Teilen",
        "hi": "Hallo",
        "which_zone": "In welcher Zone bist du?",
        "well_done": "Gut gemacht!",
        "status": "Status",
        "active": "Aktiv",
        "inactive": "Inaktiv",
        "free_trial": "Kostenlose Testversion",
        "name": "Name",
        "gallery": "Galerie",
        "camera": "Kamera",
        "classroom": "Klassenraum",
        "by": "Von",
        "no_profiles_yet": "Noch keine Profile!",
        "create_first_profile": "Erstelle dein erstes Profil, um zu beginnen",
        "filter_by_classroom": "Nach Klassenraum filtern",
        "all_students": "Alle Schüler",
    }
}

# ================== HELPER FUNCTIONS ==================

async def get_current_user(request: Request) -> Optional[User]:
    """Get current user from session token in cookie or Authorization header"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        return None
    
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        return None
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        return None
    
    return User(**user_doc)

def check_subscription_active(user: User) -> bool:
    """Check if user has active subscription or trial"""
    if user.subscription_status == "active":
        if user.subscription_expires_at:
            expires = user.subscription_expires_at
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            return expires > datetime.now(timezone.utc)
    elif user.subscription_status == "trial":
        if user.trial_started_at:
            trial_start = user.trial_started_at
            if isinstance(trial_start, str):
                trial_start = datetime.fromisoformat(trial_start)
            if trial_start.tzinfo is None:
                trial_start = trial_start.replace(tzinfo=timezone.utc)
            trial_end = trial_start + timedelta(days=TRIAL_DURATION_DAYS)
            return datetime.now(timezone.utc) < trial_end
    return False

# ================== ROUTES ==================

@api_router.get("/")
async def root():
    return {"message": "Class of Happiness API", "status": "running"}

# ---- Translations ----
@api_router.get("/translations/{lang}")
async def get_translations(lang: str):
    if lang not in TRANSLATIONS:
        lang = "en"
    return TRANSLATIONS[lang]

@api_router.get("/translations")
async def get_all_translations():
    return TRANSLATIONS

@api_router.get("/languages")
async def get_languages():
    return [
        {"code": "en", "name": "English"},
        {"code": "es", "name": "Español"},
        {"code": "fr", "name": "Français"},
        {"code": "pt", "name": "Português"},
        {"code": "de", "name": "Deutsch"}
    ]

# ---- Auth Routes ----
@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session data"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    auth_data = auth_response.json()
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user with trial
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": "teacher",
            "language": "en",
            "subscription_status": "trial",
            "subscription_plan": None,
            "subscription_expires_at": None,
            "trial_started_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(new_user)
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Get user data
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return user_doc

@api_router.get("/auth/me")
async def get_current_user_info(request: Request):
    """Get current logged-in user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check and update subscription status
    user_dict = user.dict()
    if user.subscription_status == "trial":
        if not check_subscription_active(user):
            # Trial expired
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"subscription_status": "expired"}}
            )
            user_dict["subscription_status"] = "expired"
    elif user.subscription_status == "active":
        if not check_subscription_active(user):
            # Subscription expired
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"subscription_status": "expired"}}
            )
            user_dict["subscription_status"] = "expired"
    
    return user_dict

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout current user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.put("/auth/language")
async def update_language(request: Request):
    """Update user's preferred language"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    language = body.get("language", "en")
    
    if language not in TRANSLATIONS:
        language = "en"
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"language": language}}
    )
    
    return {"language": language}

# ---- Subscription Routes ----
@api_router.get("/subscription/plans")
async def get_subscription_plans():
    """Get available subscription plans"""
    return {
        "plans": SUBSCRIPTION_PLANS,
        "trial_days": TRIAL_DURATION_DAYS
    }

@api_router.post("/subscription/start-trial")
async def start_trial(request: Request):
    """Start free trial for user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.trial_started_at:
        raise HTTPException(status_code=400, detail="Trial already started")
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "subscription_status": "trial",
            "trial_started_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Trial started", "trial_days": TRIAL_DURATION_DAYS}

@api_router.post("/subscription/checkout")
async def create_checkout(request: Request):
    """Create Stripe checkout session for subscription"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    plan = body.get("plan")
    origin_url = body.get("origin_url")
    
    if plan not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    if not origin_url:
        raise HTTPException(status_code=400, detail="origin_url required")
    
    plan_details = SUBSCRIPTION_PLANS[plan]
    amount = plan_details["price"]
    
    # Initialize Stripe
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    success_url = f"{origin_url}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/subscription"
    
    checkout_request = CheckoutSessionRequest(
        amount=float(amount),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user.user_id,
            "plan": plan,
            "email": user.email
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = {
        "id": str(uuid.uuid4()),
        "user_id": user.user_id,
        "session_id": session.session_id,
        "plan": plan,
        "amount": float(amount),
        "currency": "usd",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    await db.payment_transactions.insert_one(transaction)
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/subscription/status/{session_id}")
async def get_payment_status(session_id: str, request: Request):
    """Get payment status and update subscription if paid"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if already processed
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction["payment_status"] == "paid":
        return {"status": "paid", "message": "Payment already processed"}
    
    # Check with Stripe
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
    if status.payment_status == "paid":
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid"}}
        )
        
        # Update user subscription
        plan = transaction["plan"]
        plan_details = SUBSCRIPTION_PLANS[plan]
        expires_at = datetime.now(timezone.utc) + timedelta(days=plan_details["duration_days"])
        
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "subscription_status": "active",
                "subscription_plan": plan,
                "subscription_expires_at": expires_at
            }}
        )
        
        return {"status": "paid", "plan": plan, "expires_at": expires_at.isoformat()}
    
    return {"status": status.payment_status}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    try:
        host_url = str(request.base_url).rstrip("/")
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            metadata = webhook_response.metadata
            
            # Update transaction
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": "paid"}}
            )
            
            # Update user subscription
            user_id = metadata.get("user_id")
            plan = metadata.get("plan")
            
            if user_id and plan and plan in SUBSCRIPTION_PLANS:
                plan_details = SUBSCRIPTION_PLANS[plan]
                expires_at = datetime.now(timezone.utc) + timedelta(days=plan_details["duration_days"])
                
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "subscription_status": "active",
                        "subscription_plan": plan,
                        "subscription_expires_at": expires_at
                    }}
                )
        
        return {"status": "ok"}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        return {"status": "error"}

# ---- Avatars ----
@api_router.get("/avatars")
async def get_preset_avatars():
    return PRESET_AVATARS

# ---- Strategy Icons ----
@api_router.get("/strategy-icons")
async def get_strategy_icons():
    return STRATEGY_ICONS

# ---- Students ----
@api_router.post("/students", response_model=Student)
async def create_student(student: StudentCreate, request: Request):
    user = await get_current_user(request)
    student_dict = student.dict()
    student_obj = Student(**student_dict)
    if user:
        student_obj.user_id = user.user_id
    await db.students.insert_one(student_obj.dict())
    return student_obj

@api_router.get("/students", response_model=List[Student])
async def get_students(classroom_id: Optional[str] = None, request: Request = None):
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
    await db.zone_logs.delete_many({"student_id": student_id})
    await db.custom_strategies.delete_many({"student_id": student_id})
    return {"message": "Student deleted successfully"}

# ---- Classrooms ----
@api_router.post("/classrooms", response_model=Classroom)
async def create_classroom(classroom: ClassroomCreate, request: Request):
    user = await get_current_user(request)
    classroom_dict = classroom.dict()
    classroom_obj = Classroom(**classroom_dict)
    if user:
        classroom_obj.user_id = user.user_id
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
    await db.students.update_many({"classroom_id": classroom_id}, {"$set": {"classroom_id": None}})
    return {"message": "Classroom deleted successfully"}

# ---- Strategies ----
@api_router.get("/strategies")
async def get_strategies(zone: Optional[str] = None, student_id: Optional[str] = None):
    """Get strategies - default + custom for student"""
    # Start with default strategies
    if zone:
        strategies = [s for s in DEFAULT_STRATEGIES if s["zone"] == zone]
    else:
        strategies = DEFAULT_STRATEGIES.copy()
    
    # Add custom strategies for student
    if student_id:
        query = {"student_id": student_id, "is_active": True}
        if zone:
            query["zone"] = zone
        custom = await db.custom_strategies.find(query).to_list(1000)
        for c in custom:
            strategies.append({
                "id": c["id"],
                "name": c["name"],
                "description": c["description"],
                "zone": c["zone"],
                "icon": c.get("icon", "star"),
                "image_type": c.get("image_type", "icon"),
                "custom_image": c.get("custom_image"),
                "is_custom": True
            })
    
    return strategies

@api_router.get("/strategies/student/{student_id}")
async def get_student_strategies(student_id: str, zone: Optional[str] = None):
    """Get all strategies for a specific student (defaults + custom)"""
    return await get_strategies(zone=zone, student_id=student_id)

# ---- Custom Strategies (Teacher Management) ----
@api_router.post("/custom-strategies", response_model=CustomStrategy)
async def create_custom_strategy(strategy: CustomStrategyCreate, request: Request):
    """Create a custom strategy for a student"""
    user = await get_current_user(request)
    
    strategy_dict = strategy.dict()
    strategy_obj = CustomStrategy(**strategy_dict)
    if user:
        strategy_obj.user_id = user.user_id
    
    await db.custom_strategies.insert_one(strategy_obj.dict())
    return strategy_obj

@api_router.get("/custom-strategies")
async def get_custom_strategies(student_id: Optional[str] = None, request: Request = None):
    """Get custom strategies, optionally filtered by student"""
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    strategies = await db.custom_strategies.find(query).to_list(1000)
    return [CustomStrategy(**s) for s in strategies]

@api_router.get("/custom-strategies/{strategy_id}")
async def get_custom_strategy(strategy_id: str):
    strategy = await db.custom_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return CustomStrategy(**strategy)

@api_router.put("/custom-strategies/{strategy_id}")
async def update_custom_strategy(strategy_id: str, update: CustomStrategyUpdate):
    """Update a custom strategy"""
    strategy = await db.custom_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if update_data:
        await db.custom_strategies.update_one({"id": strategy_id}, {"$set": update_data})
    
    updated = await db.custom_strategies.find_one({"id": strategy_id})
    return CustomStrategy(**updated)

@api_router.delete("/custom-strategies/{strategy_id}")
async def delete_custom_strategy(strategy_id: str):
    """Delete a custom strategy"""
    result = await db.custom_strategies.delete_one({"id": strategy_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {"message": "Strategy deleted successfully"}

# ---- Zone Logs ----
@api_router.post("/zone-logs", response_model=ZoneLog)
async def create_zone_log(log: ZoneLogCreate):
    student = await db.students.find_one({"id": log.student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    log_dict = log.dict()
    # Limit comment to 100 characters
    if log_dict.get("comment"):
        log_dict["comment"] = log_dict["comment"][:100]
    log_obj = ZoneLog(**log_dict)
    await db.zone_logs.insert_one(log_obj.dict())
    return log_obj

@api_router.get("/zone-logs", response_model=List[ZoneLog])
async def get_zone_logs(
    student_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    days: int = 7
):
    start_date = datetime.utcnow() - timedelta(days=days)
    query = {"timestamp": {"$gte": start_date}}
    
    if student_id:
        query["student_id"] = student_id
    elif classroom_id:
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
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    daily_data = {}
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
    
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

# ---- Available Months for Reports ----
@api_router.get("/reports/available-months/{student_id}")
async def get_available_months(student_id: str):
    """Get list of months that have data for a student"""
    logs = await db.zone_logs.find(
        {"student_id": student_id},
        {"timestamp": 1}
    ).sort("timestamp", 1).to_list(10000)
    
    months = set()
    for log in logs:
        ts = log["timestamp"]
        months.add(f"{ts.year}-{ts.month:02d}")
    
    return sorted(list(months), reverse=True)

# ---- Monthly Analytics ----
@api_router.get("/analytics/student/{student_id}/month/{year}/{month}")
async def get_student_monthly_analytics(student_id: str, year: int, month: int):
    """Get analytics for a specific month"""
    start_date = datetime(year, month, 1)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59)
    
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date, "$lte": end_date}
    }).sort("timestamp", 1).to_list(10000)
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    daily_data = {}
    detailed_logs = []
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
        
        detailed_logs.append({
            "date": log["timestamp"].strftime("%Y-%m-%d"),
            "time": log["timestamp"].strftime("%H:%M"),
            "zone": zone,
            "strategies": log.get("strategies_selected", [])
        })
    
    return {
        "zone_counts": zone_counts,
        "total_logs": len(logs),
        "strategy_counts": strategy_counts,
        "daily_data": daily_data,
        "detailed_logs": detailed_logs,
        "month": month,
        "year": year
    }

# ---- PDF Report Generation ----
def create_zone_chart(zone_counts):
    """Create a bar chart for zone distribution"""
    drawing = Drawing(400, 200)
    
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 50
    chart.height = 125
    chart.width = 300
    
    data = [[zone_counts.get("blue", 0), zone_counts.get("green", 0), 
             zone_counts.get("yellow", 0), zone_counts.get("red", 0)]]
    chart.data = data
    
    chart.categoryAxis.categoryNames = ['Blue', 'Green', 'Yellow', 'Red']
    chart.categoryAxis.labels.boxAnchor = 'n'
    
    chart.bars[0].fillColor = colors.HexColor('#4A90D9')
    chart.bars.strokeColor = None
    
    # Set individual bar colors
    for i, color_hex in enumerate(['#4A90D9', '#4CAF50', '#FFC107', '#F44336']):
        chart.bars[0].fillColor = colors.HexColor(color_hex)
    
    drawing.add(chart)
    return drawing

@api_router.get("/reports/pdf/student/{student_id}/month/{year}/{month}")
async def generate_student_monthly_pdf(student_id: str, year: int, month: int):
    """Generate PDF report for a student's monthly data"""
    # Get student info
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get monthly data
    start_date = datetime(year, month, 1)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59)
    
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date, "$lte": end_date}
    }).sort("timestamp", 1).to_list(10000)
    
    # Calculate stats
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    time_of_day_zones = {
        "Morning (6am-12pm)": {"blue": 0, "green": 0, "yellow": 0, "red": 0},
        "Afternoon (12pm-5pm)": {"blue": 0, "green": 0, "yellow": 0, "red": 0},
        "Evening (5pm-9pm)": {"blue": 0, "green": 0, "yellow": 0, "red": 0},
    }
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        
        # Track time of day
        hour = log["timestamp"].hour
        if 6 <= hour < 12:
            time_period = "Morning (6am-12pm)"
        elif 12 <= hour < 17:
            time_period = "Afternoon (12pm-5pm)"
        else:
            time_period = "Evening (5pm-9pm)"
        
        if zone in time_of_day_zones[time_period]:
            time_of_day_zones[time_period][zone] += 1
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        alignment=1  # Center
    )
    month_name = calendar.month_name[month]
    elements.append(Paragraph(f"Emotional Wellness Report", title_style))
    elements.append(Paragraph(f"{student['name']} - {month_name} {year}", styles['Heading2']))
    elements.append(Spacer(1, 20))
    
    # Summary stats
    elements.append(Paragraph("Summary", styles['Heading3']))
    summary_data = [
        ['Total Check-ins', str(len(logs))],
        ['Blue Zone', str(zone_counts['blue'])],
        ['Green Zone', str(zone_counts['green'])],
        ['Yellow Zone', str(zone_counts['yellow'])],
        ['Red Zone', str(zone_counts['red'])],
    ]
    
    summary_table = Table(summary_data, colWidths=[200, 100])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F5F5F5')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Time of Day Breakdown
    elements.append(Paragraph("Zones by Time of Day", styles['Heading3']))
    time_data = [['Time Period', 'Blue', 'Green', 'Yellow', 'Red']]
    for period, zone_data in time_of_day_zones.items():
        time_data.append([
            period,
            str(zone_data['blue']),
            str(zone_data['green']),
            str(zone_data['yellow']),
            str(zone_data['red'])
        ])
    
    time_table = Table(time_data, colWidths=[140, 60, 60, 60, 60])
    time_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F9F9')]),
        # Color code the zone columns
        ('BACKGROUND', (1, 1), (1, -1), colors.HexColor('#E3F2FD')),
        ('BACKGROUND', (2, 1), (2, -1), colors.HexColor('#E8F5E9')),
        ('BACKGROUND', (3, 1), (3, -1), colors.HexColor('#FFF8E1')),
        ('BACKGROUND', (4, 1), (4, -1), colors.HexColor('#FFEBEE')),
    ]))
    elements.append(time_table)
    elements.append(Spacer(1, 20))
    
    # Detailed logs
    if logs:
        elements.append(Paragraph("Detailed Check-ins", styles['Heading3']))
        log_data = [['Date', 'Time', 'Zone', 'Comment']]
        
        for log in logs:
            comment = log.get("comment", "") or "-"
            if len(comment) > 40:
                comment = comment[:40] + "..."
            log_data.append([
                log["timestamp"].strftime("%Y-%m-%d"),
                log["timestamp"].strftime("%I:%M %p"),
                log.get("zone", "").capitalize(),
                comment
            ])
        
        log_table = Table(log_data, colWidths=[80, 70, 70, 170])
        log_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F9F9')]),
        ]))
        elements.append(log_table)
    
    # Top strategies
    if strategy_counts:
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("Most Used Strategies", styles['Heading3']))
        sorted_strategies = sorted(strategy_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        strat_data = [['Strategy', 'Times Used']]
        for strat, count in sorted_strategies:
            strat_data.append([strat, str(count)])
        
        strat_table = Table(strat_data, colWidths=[250, 80])
        strat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFC107')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(strat_table)
    
    # Footer
    elements.append(Spacer(1, 30))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=10, textColor=colors.gray)
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))
    elements.append(Paragraph("Class of Happiness", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"{student['name'].replace(' ', '_')}_{month_name}_{year}_report.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ---- Parent Linking ----
import random
import string

def generate_link_code():
    """Generate a 6-character alphanumeric code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@api_router.post("/students/{student_id}/generate-link-code")
async def generate_student_link_code(student_id: str, request: Request):
    """Generate a code for parent to link their child (teacher only)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can generate link codes")
    
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Generate new code that expires in 7 days
    link_code = generate_link_code()
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.students.update_one(
        {"id": student_id},
        {"$set": {"link_code": link_code, "link_code_expires": expires}}
    )
    
    return {"link_code": link_code, "expires_at": expires.isoformat()}

@api_router.post("/students/link")
async def link_student_to_parent(request: Request):
    """Parent links their child using a code from teacher"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can link children")
    
    body = await request.json()
    link_code = body.get("link_code", "").upper()
    
    if not link_code:
        raise HTTPException(status_code=400, detail="Link code required")
    
    # Find student with this code
    student = await db.students.find_one({"link_code": link_code})
    if not student:
        raise HTTPException(status_code=404, detail="Invalid link code")
    
    # Check if code expired
    expires = student.get("link_code_expires")
    if expires:
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Link code expired")
    
    # Link parent to student
    await db.students.update_one(
        {"id": student["id"]},
        {"$set": {"parent_user_id": user.user_id, "link_code": None, "link_code_expires": None}}
    )
    
    return {"message": "Child linked successfully", "student_id": student["id"], "student_name": student["name"]}

@api_router.get("/parent/children")
async def get_parent_children(request: Request):
    """Get all children linked to the current parent"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can access this")
    
    students = await db.students.find({"parent_user_id": user.user_id}).to_list(100)
    return [Student(**s) for s in students]

# ---- Resources (for Parents) ----
@api_router.get("/resources")
async def get_resources():
    """Get all active resources"""
    resources = await db.resources.find({"is_active": True}).sort("created_at", -1).to_list(100)
    # Don't return full PDF content in list, just metadata
    result = []
    for r in resources:
        resource_data = {
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "content_type": r.get("content_type", "text"),
            "pdf_filename": r.get("pdf_filename"),
            "created_at": r["created_at"]
        }
        if r.get("content_type") == "text":
            resource_data["content"] = r.get("content")
        result.append(resource_data)
    return result

@api_router.get("/resources/{resource_id}")
async def get_resource(resource_id: str):
    """Get a specific resource including content"""
    resource = await db.resources.find_one({"id": resource_id, "is_active": True})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return Resource(**resource)

@api_router.post("/resources")
async def create_resource(resource: ResourceCreate, request: Request):
    """Create a new resource (teacher/admin only)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers and admins can create resources")
    
    resource_dict = resource.dict()
    resource_obj = Resource(**resource_dict, created_by=user.user_id)
    await db.resources.insert_one(resource_obj.dict())
    return resource_obj

@api_router.put("/resources/{resource_id}")
async def update_resource(resource_id: str, update: ResourceUpdate, request: Request):
    """Update a resource (teacher/admin only)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers and admins can update resources")
    
    resource = await db.resources.find_one({"id": resource_id})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if update_data:
        await db.resources.update_one({"id": resource_id}, {"$set": update_data})
    
    updated = await db.resources.find_one({"id": resource_id})
    return Resource(**updated)

@api_router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, request: Request):
    """Delete a resource (teacher/admin only)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers and admins can delete resources")
    
    result = await db.resources.delete_one({"id": resource_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"message": "Resource deleted successfully"}

# ---- Update User Role ----
@api_router.put("/auth/role")
async def update_user_role(request: Request):
    """Update user's role (for initial setup)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    role = body.get("role")
    
    if role not in ["teacher", "parent"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"role": role}}
    )
    
    return {"role": role}

# ---- Family Members (for Parent home tracking) ----
@api_router.get("/family/members")
async def get_family_members(request: Request):
    """Get all family members for the current parent"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can access family members")
    
    members = await db.family_members.find({"parent_user_id": user.user_id}).to_list(50)
    return [FamilyMember(**m) for m in members]

@api_router.post("/family/members")
async def create_family_member(member: FamilyMemberCreate, request: Request):
    """Create a new family member"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can create family members")
    
    member_dict = member.dict()
    member_obj = FamilyMember(**member_dict, parent_user_id=user.user_id)
    await db.family_members.insert_one(member_obj.dict())
    return member_obj

@api_router.delete("/family/members/{member_id}")
async def delete_family_member(member_id: str, request: Request):
    """Delete a family member"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.family_members.delete_one({"id": member_id, "parent_user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Family member not found")
    return {"message": "Family member deleted"}

# ---- Family Zone Logs (home tracking) ----
@api_router.post("/family/zone-logs")
async def create_family_zone_log(log: FamilyZoneLogCreate, request: Request):
    """Create a zone log for a family member"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can log family zones")
    
    # Verify family member belongs to this parent
    member = await db.family_members.find_one({"id": log.family_member_id, "parent_user_id": user.user_id})
    if not member:
        raise HTTPException(status_code=404, detail="Family member not found")
    
    log_dict = log.dict()
    if log_dict.get("comment"):
        log_dict["comment"] = log_dict["comment"][:100]
    log_obj = FamilyZoneLog(**log_dict, parent_user_id=user.user_id)
    await db.family_zone_logs.insert_one(log_obj.dict())
    return log_obj

@api_router.get("/family/zone-logs/{member_id}")
async def get_family_zone_logs(member_id: str, request: Request, days: int = 7):
    """Get zone logs for a family member"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can view family logs")
    
    since = datetime.now(timezone.utc) - timedelta(days=days)
    logs = await db.family_zone_logs.find({
        "family_member_id": member_id,
        "parent_user_id": user.user_id,
        "timestamp": {"$gte": since}
    }).sort("timestamp", -1).to_list(500)
    return [FamilyZoneLog(**l) for l in logs]

@api_router.get("/family/analytics/{member_id}")
async def get_family_analytics(member_id: str, request: Request, days: int = 7):
    """Get analytics for a family member"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    since = datetime.now(timezone.utc) - timedelta(days=days)
    logs = await db.family_zone_logs.find({
        "family_member_id": member_id,
        "parent_user_id": user.user_id,
        "timestamp": {"$gte": since}
    }).to_list(500)
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
    
    return {
        "zone_counts": zone_counts,
        "strategy_counts": strategy_counts,
        "total_logs": len(logs)
    }

# ---- Parent to Teacher QR Code Sharing ----
@api_router.post("/parent/generate-teacher-code/{student_id}")
async def generate_teacher_link_code(student_id: str, request: Request):
    """Parent generates a code to share child with a teacher"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role != "parent":
        raise HTTPException(status_code=403, detail="Only parents can generate teacher codes")
    
    # Verify parent has this child linked
    student = await db.students.find_one({"id": student_id, "parent_user_id": user.user_id})
    if not student:
        # Also check family members
        family_member = await db.family_members.find_one({"id": student_id, "parent_user_id": user.user_id})
        if not family_member:
            raise HTTPException(status_code=404, detail="Child not found")
    
    # Generate code
    link_code = generate_link_code()
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    
    code_obj = TeacherLinkCode(
        parent_user_id=user.user_id,
        student_id=student_id,
        link_code=link_code,
        expires_at=expires
    )
    await db.teacher_link_codes.insert_one(code_obj.dict())
    
    return {"link_code": link_code, "expires_at": expires.isoformat()}

@api_router.post("/teacher/link-from-parent")
async def link_student_from_parent(request: Request):
    """Teacher uses code from parent to link a student"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can use parent codes")
    
    body = await request.json()
    link_code = body.get("link_code", "").upper()
    
    if not link_code:
        raise HTTPException(status_code=400, detail="Link code required")
    
    # Find the code
    code_record = await db.teacher_link_codes.find_one({"link_code": link_code, "is_used": False})
    if not code_record:
        raise HTTPException(status_code=404, detail="Invalid or used link code")
    
    # Check expiry
    expires = code_record.get("expires_at")
    if expires:
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Link code expired")
    
    student_id = code_record["student_id"]
    
    # Update the student record to link teacher
    await db.students.update_one(
        {"id": student_id},
        {"$set": {"user_id": user.user_id}}
    )
    
    # Mark code as used
    await db.teacher_link_codes.update_one(
        {"id": code_record["id"]},
        {"$set": {"is_used": True, "teacher_user_id": user.user_id}}
    )
    
    student = await db.students.find_one({"id": student_id})
    return {"message": "Student linked successfully", "student_id": student_id, "student_name": student.get("name", "Unknown")}

# ---- Strategy Synchronization ----
@api_router.put("/strategies/sync/{strategy_id}")
async def toggle_strategy_sync(strategy_id: str, request: Request):
    """Toggle strategy sharing between teacher and parent"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    strategy = await db.custom_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    # Toggle is_shared
    new_shared = not strategy.get("is_shared", False)
    await db.custom_strategies.update_one(
        {"id": strategy_id},
        {"$set": {"is_shared": new_shared}}
    )
    
    return {"is_shared": new_shared}

@api_router.get("/strategies/shared/{student_id}")
async def get_shared_strategies(student_id: str, request: Request):
    """Get all shared strategies for a student (visible to both teacher and parent)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    strategies = await db.custom_strategies.find({
        "student_id": student_id,
        "is_shared": True,
        "is_active": True
    }).to_list(100)
    
    return [CustomStrategy(**s) for s in strategies]

# ---- Teacher Resources with Topics ----
@api_router.get("/teacher-resources/topics")
async def get_resource_topics():
    """Get list of available topics"""
    topics = [
        {"id": "emotions", "name": "Emotions"},
        {"id": "healthy_relationships", "name": "Healthy Relationships"},
        {"id": "leader_online", "name": "Leader Online"},
        {"id": "you_are_what_you_eat", "name": "You Are What You Eat"},
        {"id": "special_needs_education", "name": "Special Needs Education & Disability"},
    ]
    return topics

@api_router.get("/teacher-resources")
async def get_teacher_resources(topic: Optional[str] = None):
    """Get teacher resources, optionally filtered by topic"""
    query = {"is_active": True}
    if topic:
        query["topic"] = topic
    
    resources = await db.teacher_resources.find(query).sort("created_at", -1).to_list(100)
    # Don't return full PDF content in list
    result = []
    for r in resources:
        resource_data = {
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "topic": r["topic"],
            "content_type": r.get("content_type", "pdf"),
            "pdf_filename": r.get("pdf_filename"),
            "created_by": r["created_by"],
            "created_by_name": r.get("created_by_name"),
            "average_rating": r.get("average_rating", 0),
            "total_ratings": r.get("total_ratings", 0),
            "created_at": r["created_at"]
        }
        result.append(resource_data)
    return result

@api_router.get("/teacher-resources/{resource_id}")
async def get_teacher_resource(resource_id: str):
    """Get a specific teacher resource including content"""
    resource = await db.teacher_resources.find_one({"id": resource_id, "is_active": True})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return TeacherResource(**resource)

@api_router.post("/teacher-resources")
async def create_teacher_resource(resource: TeacherResourceCreate, request: Request):
    """Create a new teacher resource (teachers only)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can upload resources")
    
    if resource.topic not in TEACHER_RESOURCE_TOPICS:
        raise HTTPException(status_code=400, detail="Invalid topic")
    
    resource_dict = resource.dict()
    resource_obj = TeacherResource(
        **resource_dict, 
        created_by=user.user_id,
        created_by_name=user.name
    )
    await db.teacher_resources.insert_one(resource_obj.dict())
    return resource_obj

@api_router.delete("/teacher-resources/{resource_id}")
async def delete_teacher_resource(resource_id: str, request: Request):
    """Delete a teacher resource (owner or admin only)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    resource = await db.teacher_resources.find_one({"id": resource_id})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    if resource["created_by"] != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this resource")
    
    await db.teacher_resources.delete_one({"id": resource_id})
    return {"message": "Resource deleted successfully"}

# ---- Resource Ratings and Comments ----
@api_router.post("/teacher-resources/{resource_id}/rate")
async def rate_teacher_resource(resource_id: str, rating_data: TeacherResourceRatingCreate, request: Request):
    """Rate a teacher resource (1-5 stars with optional comment)"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can rate resources")
    
    resource = await db.teacher_resources.find_one({"id": resource_id})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    if rating_data.rating < 1 or rating_data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    # Check if user already rated
    existing_rating = await db.teacher_resource_ratings.find_one({
        "resource_id": resource_id,
        "user_id": user.user_id
    })
    
    comment = rating_data.comment[:100] if rating_data.comment else None
    
    if existing_rating:
        # Update existing rating
        await db.teacher_resource_ratings.update_one(
            {"id": existing_rating["id"]},
            {"$set": {"rating": rating_data.rating, "comment": comment}}
        )
    else:
        # Create new rating
        rating_obj = TeacherResourceRating(
            resource_id=resource_id,
            user_id=user.user_id,
            user_name=user.name,
            rating=rating_data.rating,
            comment=comment
        )
        await db.teacher_resource_ratings.insert_one(rating_obj.dict())
    
    # Recalculate average rating
    all_ratings = await db.teacher_resource_ratings.find({"resource_id": resource_id}).to_list(1000)
    if all_ratings:
        avg = sum(r["rating"] for r in all_ratings) / len(all_ratings)
        await db.teacher_resources.update_one(
            {"id": resource_id},
            {"$set": {"average_rating": round(avg, 1), "total_ratings": len(all_ratings)}}
        )
    
    return {"message": "Rating submitted successfully"}

@api_router.get("/teacher-resources/{resource_id}/ratings")
async def get_resource_ratings(resource_id: str):
    """Get all ratings and comments for a resource"""
    ratings = await db.teacher_resource_ratings.find({"resource_id": resource_id}).sort("created_at", -1).to_list(100)
    return [TeacherResourceRating(**r) for r in ratings]

# ---- Classroom Statistics PDF ----
@api_router.get("/reports/classroom/{classroom_id}/pdf")
async def generate_classroom_report(classroom_id: str, request: Request, year: int = None, month: int = None):
    """Generate PDF report for a classroom's statistics for a month"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Only teachers can download reports")
    
    classroom = await db.classrooms.find_one({"id": classroom_id})
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    # Default to current month
    if year is None or month is None:
        now = datetime.now(timezone.utc)
        year = now.year
        month = now.month
    
    # Get date range for the month
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Get all students in classroom
    students = await db.students.find({"classroom_id": classroom_id}).to_list(100)
    student_ids = [s["id"] for s in students]
    
    # Get all logs for these students in the month
    logs = await db.zone_logs.find({
        "student_id": {"$in": student_ids},
        "timestamp": {"$gte": start_date, "$lt": end_date}
    }).to_list(10000)
    
    # Build PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=24, spaceAfter=20, alignment=1, textColor=colors.HexColor('#5C6BC0'))
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=14, spaceAfter=20, alignment=1, textColor=colors.HexColor('#666666'))
    
    elements.append(Paragraph(f"Classroom Report", title_style))
    elements.append(Paragraph(f"{classroom.get('name', 'Classroom')} - {calendar.month_name[month]} {year}", subtitle_style))
    elements.append(Spacer(1, 20))
    
    # Summary stats
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    time_of_day = {"Morning": 0, "Afternoon": 0, "Evening": 0}
    student_checkins = {}
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        # Time of day
        hour = log["timestamp"].hour
        if 6 <= hour < 12:
            time_of_day["Morning"] += 1
        elif 12 <= hour < 17:
            time_of_day["Afternoon"] += 1
        else:
            time_of_day["Evening"] += 1
        
        # Per student
        sid = log["student_id"]
        if sid not in student_checkins:
            student_checkins[sid] = {"total": 0, "zones": {"blue": 0, "green": 0, "yellow": 0, "red": 0}}
        student_checkins[sid]["total"] += 1
        if zone in student_checkins[sid]["zones"]:
            student_checkins[sid]["zones"][zone] += 1
    
    # Zone Distribution Table
    elements.append(Paragraph("Zone Distribution", styles['Heading3']))
    zone_data = [['Zone', 'Count', 'Percentage']]
    total = sum(zone_counts.values())
    for zone, count in zone_counts.items():
        pct = f"{(count/total*100):.1f}%" if total > 0 else "0%"
        zone_data.append([zone.capitalize(), str(count), pct])
    
    zone_table = Table(zone_data, colWidths=[150, 80, 80])
    zone_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F9F9')]),
    ]))
    elements.append(zone_table)
    elements.append(Spacer(1, 20))
    
    # Time of Day Table
    elements.append(Paragraph("Check-ins by Time of Day", styles['Heading3']))
    time_data = [['Time Period', 'Count']]
    for period, count in time_of_day.items():
        time_data.append([period, str(count)])
    
    time_table = Table(time_data, colWidths=[150, 80])
    time_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(time_table)
    elements.append(Spacer(1, 20))
    
    # Per Student Summary
    if students:
        elements.append(Paragraph("Student Summary", styles['Heading3']))
        student_data = [['Student', 'Total', 'Blue', 'Green', 'Yellow', 'Red']]
        for s in students:
            checkin_data = student_checkins.get(s["id"], {"total": 0, "zones": {"blue": 0, "green": 0, "yellow": 0, "red": 0}})
            student_data.append([
                s["name"],
                str(checkin_data["total"]),
                str(checkin_data["zones"]["blue"]),
                str(checkin_data["zones"]["green"]),
                str(checkin_data["zones"]["yellow"]),
                str(checkin_data["zones"]["red"])
            ])
        
        student_table = Table(student_data, colWidths=[120, 50, 50, 50, 50, 50])
        student_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F9F9')]),
        ]))
        elements.append(student_table)
    
    # Footer
    elements.append(Spacer(1, 40))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=10, alignment=1, textColor=colors.HexColor('#999999'))
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))
    elements.append(Paragraph("Class of Happiness", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    month_name = calendar.month_name[month]
    filename = f"classroom_report_{classroom.get('name', 'classroom')}_{month_name}_{year}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/reports/classroom/{classroom_id}/available-months")
async def get_classroom_available_months(classroom_id: str, request: Request):
    """Get list of months that have data for a classroom"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get all students in classroom
    students = await db.students.find({"classroom_id": classroom_id}).to_list(100)
    student_ids = [s["id"] for s in students]
    
    if not student_ids:
        return []
    
    # Get distinct months from logs
    logs = await db.zone_logs.find({"student_id": {"$in": student_ids}}).to_list(10000)
    
    months = set()
    for log in logs:
        ts = log["timestamp"]
        months.add(f"{ts.year}-{ts.month:02d}")
    
    return sorted(list(months), reverse=True)

# ================== CREATURE REWARDS ENDPOINTS ==================

@api_router.get("/creatures")
async def get_all_creatures():
    """Get all available creatures and their evolution stages"""
    return {
        "creatures": CREATURES,
        "points_config": POINTS_CONFIG
    }

@api_router.get("/rewards/{student_id}")
async def get_student_rewards(student_id: str):
    """Get a student's reward progress and current creature"""
    rewards = await db.student_rewards.find_one({"student_id": student_id})
    
    if not rewards:
        # Create default rewards for new student
        new_rewards = StudentRewards(student_id=student_id).dict()
        await db.student_rewards.insert_one(new_rewards)
        rewards = new_rewards
    
    # Get current creature info
    creature = next((c for c in CREATURES if c["id"] == rewards.get("current_creature_id", "bubbles")), CREATURES[0])
    current_stage_info = creature["stages"][rewards.get("current_stage", 0)]
    
    # Calculate points needed for next evolution
    next_stage = rewards.get("current_stage", 0) + 1
    points_for_next = POINTS_CONFIG["evolution_thresholds"][next_stage] if next_stage < 4 else None
    
    return {
        "student_id": student_id,
        "current_creature": creature,
        "current_stage": rewards.get("current_stage", 0),
        "current_stage_info": current_stage_info,
        "current_points": rewards.get("current_points", 0),
        "total_points_earned": rewards.get("total_points_earned", 0),
        "points_for_next_evolution": points_for_next,
        "collected_creatures": rewards.get("collected_creatures", []),
        "streak_days": rewards.get("streak_days", 0),
        "is_fully_evolved": rewards.get("current_stage", 0) >= 3
    }

@api_router.post("/rewards/{student_id}/add-points")
async def add_points_to_student(student_id: str, request: AddPointsRequest):
    """Add points to a student's rewards and handle evolution"""
    rewards = await db.student_rewards.find_one({"student_id": student_id})
    
    if not rewards:
        # Create default rewards for new student
        new_rewards = StudentRewards(student_id=student_id).dict()
        await db.student_rewards.insert_one(new_rewards)
        rewards = new_rewards
    
    # Calculate points to add
    points_to_add = 0
    if request.points_type == "strategy":
        points_to_add = POINTS_CONFIG["strategy_used"] * request.strategy_count
    elif request.points_type == "comment":
        points_to_add = POINTS_CONFIG["comment_added"]
    elif request.points_type == "streak":
        points_to_add = POINTS_CONFIG["daily_streak_bonus"]
    
    # Update streak
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    last_checkin = rewards.get("last_checkin_date")
    streak_days = rewards.get("streak_days", 0)
    streak_bonus = 0
    
    if last_checkin:
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        if last_checkin == yesterday:
            streak_days += 1
            streak_bonus = POINTS_CONFIG["daily_streak_bonus"]
        elif last_checkin != today:
            streak_days = 1  # Reset streak
    else:
        streak_days = 1
    
    # Add streak bonus
    points_to_add += streak_bonus
    
    # Calculate new totals
    current_points = rewards.get("current_points", 0) + points_to_add
    total_points = rewards.get("total_points_earned", 0) + points_to_add
    current_stage = rewards.get("current_stage", 0)
    current_creature_id = rewards.get("current_creature_id", "bubbles")
    collected_creatures = rewards.get("collected_creatures", [])
    
    # Check for evolution
    evolved = False
    evolution_info = None
    completed_creature = False
    new_creature_started = False
    
    thresholds = POINTS_CONFIG["evolution_thresholds"]
    
    while current_stage < 3 and current_points >= thresholds[current_stage + 1]:
        current_stage += 1
        evolved = True
        
        creature = next((c for c in CREATURES if c["id"] == current_creature_id), CREATURES[0])
        evolution_info = {
            "new_stage": current_stage,
            "stage_info": creature["stages"][current_stage],
            "creature": creature
        }
    
    # Check if creature is fully evolved
    if current_stage >= 3 and current_creature_id not in collected_creatures:
        collected_creatures.append(current_creature_id)
        completed_creature = True
        
        # Start a new random creature (that hasn't been collected yet)
        available_creatures = [c["id"] for c in CREATURES if c["id"] not in collected_creatures]
        if available_creatures:
            import random
            current_creature_id = random.choice(available_creatures)
            current_stage = 0
            current_points = 0  # Reset points for new creature
            new_creature_started = True
            
            new_creature = next((c for c in CREATURES if c["id"] == current_creature_id), None)
            evolution_info = {
                "new_creature": new_creature,
                "message": "You completed a creature! Starting a new adventure!"
            }
    
    # Update database
    await db.student_rewards.update_one(
        {"student_id": student_id},
        {"$set": {
            "current_points": current_points,
            "total_points_earned": total_points,
            "current_stage": current_stage,
            "current_creature_id": current_creature_id,
            "collected_creatures": collected_creatures,
            "last_checkin_date": today,
            "streak_days": streak_days,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    
    # Get updated creature info
    creature = next((c for c in CREATURES if c["id"] == current_creature_id), CREATURES[0])
    current_stage_info = creature["stages"][current_stage]
    next_stage = current_stage + 1
    points_for_next = thresholds[next_stage] if next_stage < 4 else None
    
    return {
        "points_added": points_to_add,
        "streak_bonus": streak_bonus,
        "current_points": current_points,
        "total_points_earned": total_points,
        "current_stage": current_stage,
        "current_creature": creature,
        "current_stage_info": current_stage_info,
        "points_for_next_evolution": points_for_next,
        "evolved": evolved,
        "evolution_info": evolution_info,
        "completed_creature": completed_creature,
        "new_creature_started": new_creature_started,
        "collected_creatures": collected_creatures,
        "streak_days": streak_days
    }

@api_router.get("/rewards/{student_id}/collection")
async def get_student_collection(student_id: str):
    """Get all creatures a student has collected"""
    rewards = await db.student_rewards.find_one({"student_id": student_id})
    
    if not rewards:
        return {
            "collected_creatures": [],
            "current_creature": CREATURES[0],
            "current_stage": 0,
            "total_creatures": len(CREATURES)
        }
    
    collected_ids = rewards.get("collected_creatures", [])
    current_creature_id = rewards.get("current_creature_id", "bubbles")
    
    collected = [c for c in CREATURES if c["id"] in collected_ids]
    current = next((c for c in CREATURES if c["id"] == current_creature_id), CREATURES[0])
    
    return {
        "collected_creatures": collected,
        "current_creature": current,
        "current_stage": rewards.get("current_stage", 0),
        "current_points": rewards.get("current_points", 0),
        "total_creatures": len(CREATURES),
        "total_collected": len(collected_ids)
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
